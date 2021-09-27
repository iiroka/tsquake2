/*
 * Copyright (C) 1997-2001 Id Software, Inc.
 * Copyright (C) 2016-2017 Daniel Gibson
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 *
 * =======================================================================
 *
 * Model loading and caching for OpenGL3. Includes the .bsp file format
 *
 * =======================================================================
 */
import * as SHARED from "../../common/shared"
import * as FS from "../../common/filesystem"
import { Com_Error, Com_Printf } from "../../common/clientserver"
import { ClearViewCluster, gl3state, WebGL_SetWorldModel } from "./webgl_main"
import { Mod_DecompressVis, Mod_RadiusFromBounds } from "./pvs"
import { imagetype_t, webglimage_t, WebGL_FindImage } from "./webgl_image"
import { WebGL_LM_BeginBuildingLightmaps, WebGL_LM_EndBuildingLightmaps, WebGL_LM_CreateSurfaceLightmap, MAX_LIGHTMAPS_PER_SURFACE, WebGL_LM_BuildPolygonFromSurface } from "./webgl_lightmap"
import { gl3_notexture } from "./webgl_misc"
import { WebGL_SubdivideSurface } from "./webgl_warp"


/* Whole model */

export enum modtype_t {
	mod_bad,
	mod_brush,
	mod_sprite,
	mod_alias
}

export const SURF_PLANEBACK = 2
export const SURF_DRAWSKY = 4
export const SURF_DRAWTURB = 0x10
export const SURF_DRAWBACKGROUND = 0x40
export const SURF_UNDERWATER = 0x80


// this, must be struct model_s, not gl3model_s,
// because struct model_s* is returned by re.RegisterModel()
export class webglmodel_t {
	name: string

	registration_sequence: number = 0

	type: modtype_t
	numframes: number = 0

	flags: number = 0

	/* volume occupied by the model graphics */
    mins: number[] = [0,0,0]
    maxs: number[] = [0,0,0]
	radius: number = 0

	/* solid volume for clipping */
	clipbox: boolean = false
	// vec3_t clipmins, clipmaxs;

	/* for alias models and skins */
    skins: webglimage_t[]

    protected constructor(name: string, type: modtype_t) {
        this.name = name
        this.type = type
    }

    protected copy(other: webglmodel_t) {
        this.name = other.name
        this.registration_sequence = other.registration_sequence
        this.type = other.type
        this.numframes = other.numframes
        this.flags = other.flags
        this.radius = other.radius
        this.clipbox = other.clipbox
        // gl3image_t *skins[MAX_MD2SKINS];
        for (let i = 0; i < 3; i++) {
            this.mins[i] = other.mins[i]
            this.maxs[i] = other.maxs[i]
        // vec3_t clipmins, clipmaxs;
        }
        this.skins = other.skins
    }

}


const MAX_MOD_KNOWN = 512

export let registration_sequence = 0
let mod_known: webglmodel_t[] = []
let mod_inline: webglmodel_t[] = []
let mod_novis = new Uint8Array(FS.MAX_MAP_LEAFS/8)

export function WebGL_Mod_Init() {
    registration_sequence = 1
    for (let i = 0; i < mod_novis.length; i++) {
        mod_novis[i] = 0xFF
    }
}

export function WebGL_Mod_PointInLeaf(p: number[], model: webglbrushmodel_t): mleaf_t {
	// mnode_t *node;
	// float d;
	// cplane_t *plane;

	if (!model || model.nodes == null || model.nodes.length == 0) {
		Com_Error(SHARED.ERR_DROP, "WebGL_Mod_PointInLeaf: bad model");
	}

	let anode: mleaf_or_mode = model.nodes[0];

	while (true)
	{
		if (anode.contents != -1)
		{
			return anode as mleaf_t;
		}

        let node = anode as mnode_t;
		let plane = node.plane;
		let d = SHARED.DotProduct(p, plane.normal) - plane.dist;

		if (d > 0) {
			anode = node.children[0];
		} else {
			anode = node.children[1];
		}
	}
}

export function WebGL_Mod_ClusterPVS(cluster: number, model: webglbrushmodel_t): Uint8Array {
	if ((cluster == -1) || !model.vis) {
		return mod_novis;
	}

	return Mod_DecompressVis(model.visdata, model.vis.bitofs[cluster][FS.DVIS_PVS],
			(model.vis.numclusters + 7) >> 3);
}


/*
 * Loads in a model for the given name
 */
async function Mod_ForName(gl: WebGL2RenderingContext, name: string, crash: boolean): Promise<webglmodel_t> {

	if (!name) {
        Com_Error(SHARED.ERR_DROP, "Mod_ForName: NULL name");
	}

	/* inline models are grabbed only from worldmodel */
	if (name[0] == '*') {
		let i = parseInt(name.substring(1), 10)

		if ((i < 1) || i >= mod_inline.length) {
			Com_Error(SHARED.ERR_DROP, `Mod_ForName: bad inline model number ${name}`,);
		}

		return mod_inline[i];
	}

	/* search the currently loaded models */
	for (let i = 0; i < mod_known.length; i++) {
		if (mod_known[i].name.length == 0) {
			continue;
		}

		if (mod_known[i].name === name) {
			return mod_known[i]
		}
	}

	/* find a free model slot spot */
    let index = -1
	for (let i = 0; i < mod_known.length; i++) {
		if (mod_known[i].name.length == 0) {
            index = i;
			break;
		}
    }

	if (index < 0) {
		if (mod_known.length >= MAX_MOD_KNOWN) {
			Com_Error(SHARED.ERR_DROP, "mod_numknown == MAX_MOD_KNOWN");
		}
	}

	/* load the file */
    let buf = await FS.FS_LoadFile(name)
	if (buf == null) {
		if (crash) {
			Com_Error(SHARED.ERR_DROP, `Mod_ForName: ${name} not found`);
		}

		return null
	}

	let mod: webglmodel_t = null

	/* call the apropriate loader */
    const id = new DataView(buf).getInt32(0, true)
	switch (id) {
		case FS.IDALIASHEADER:
			mod = await LoadMD2(gl, buf, name);
			break;

		case FS.IDSPRITEHEADER:
			mod = await LoadSP2(gl, buf, name);
			break;

        case FS.IDBSPHEADER:
            if (index != 0 && (index >= 0 && mod_known.length > 0)) {
                Com_Error(SHARED.ERR_DROP, "Loaded a brush model after the world");
            }
			mod = await Mod_LoadBrushModel(gl, buf, name);
			break;

		default:
			Com_Error(SHARED.ERR_DROP, `Mod_ForName: unknown fileid for ${name} 0x${id.toString(16)} ${FS.IDBSPHEADER.toString(16)}`);
	}

    if (mod != null) {
        if (index >= 0)
            mod_known[index] = mod
        else
            mod_known.push(mod)
    }

    return mod
}

export async function WebGL_Mod_BeginRegistration(gl: WebGL2RenderingContext, model: string) {
	// char fullname[MAX_QPATH];
	// cvar_t *flushmap;

	registration_sequence++;
	ClearViewCluster() /* force markleafs */

	gl3state.currentlightmap = -1;

	let fullname = `maps/${model}.bsp`

	/* explicitly free the old map if different
	   this guarantees that mod_known[0] is the
	   world map */
	// flushmap = ri.Cvar_Get("flushmap", "0", 0);

    if (mod_known.length > 0) {
	    // if (strcmp(mod_known[0].name, fullname) || flushmap->value) {
        if (mod_known[0].name != fullname) {
            mod_known[0].name = ""
        }
    }

    let mod = await Mod_ForName(gl, fullname, true)
    WebGL_SetWorldModel(mod as webglbrushmodel_t)
}

export async function WebGL_Mod_RegisterModel(gl: WebGL2RenderingContext, name: string): Promise<object> {
    let mod = await Mod_ForName(gl, name, false)

	if (mod)
	{
		mod.registration_sequence = registration_sequence;

		/* register any images used by the models */
		if (mod.type == modtype_t.mod_sprite)
		{
            let smod = mod as webglspritemodel_t
            for (let i = 0; i <  smod.spr.numframes; i++) {
                mod.skins[i] = await WebGL_FindImage(gl, smod.spr.frames[i].name, imagetype_t.it_sprite)
            }
		}
		else if (mod.type == modtype_t.mod_alias)
		{
            let amod = mod as webglaliasmodel_t

			for (let i = 0; i < amod.header.num_skins; i++) {
				mod.skins[i] = await WebGL_FindImage(gl, amod.skinNames[i], imagetype_t.it_skin);
			}

			mod.numframes = amod.header.num_frames;
		}
		else if (mod.type == modtype_t.mod_brush)
		{
            let bmod = mod as webglbrushmodel_t
			for (let i in bmod.texinfo) {
				bmod.texinfo[i].image.registration_sequence = registration_sequence;
			}
		}
	}

    return mod
}

async function Mod_LoadBrushModel(gl: WebGL2RenderingContext, buffer: ArrayBuffer, name: string): Promise<webglmodel_t> {

    let view = new DataView(buffer)

    let mod = new webglbrushmodel_t(name);

    const header = new FS.dheader_t(view)

	if (header.version != FS.BSPVERSION) {
		Com_Error(SHARED.ERR_DROP, `Mod_LoadBrushModel: ${name} has wrong version number (${header.version} should be ${FS.BSPVERSION})`);
	}

	/* load into heap */
	mod.LoadVertexes(header.lumps[FS.LUMP_VERTEXES], view);
	mod.LoadEdges(header.lumps[FS.LUMP_EDGES], view);
	mod.LoadSurfedges(header.lumps[FS.LUMP_SURFEDGES], view);
	mod.LoadLighting(header.lumps[FS.LUMP_LIGHTING], buffer);
	mod.LoadPlanes(header.lumps[FS.LUMP_PLANES], view);
	await mod.LoadTexinfo(header.lumps[FS.LUMP_TEXINFO], view, gl);
	mod.LoadFaces(header.lumps[FS.LUMP_FACES], view, gl);
	mod.LoadMarksurfaces(header.lumps[FS.LUMP_LEAFFACES], view);
	mod.LoadVisibility(header.lumps[FS.LUMP_VISIBILITY], view, buffer);
	mod.LoadLeafs(header.lumps[FS.LUMP_LEAFS], view);
	mod.LoadNodes(header.lumps[FS.LUMP_NODES], view);
	mod.LoadSubmodels(header.lumps[FS.LUMP_MODELS], view);
	mod.numframes = 2; /* regular and alternate animation */

	/* set up the submodels */
    mod_inline = []
	for (let i = 0; i < mod.submodels.length; i++) {
	    let starmod = new webglbrushmodel_t(mod.name)
        starmod.copy(mod)

	 	let bm = mod.submodels[i];

		starmod.firstmodelsurface = bm.firstface;
		starmod.nummodelsurfaces = bm.numfaces;
		starmod.firstnode = bm.headnode;

		if (starmod.firstnode >= mod.nodes.length) {
			Com_Error(SHARED.ERR_DROP, `Mod_LoadBrushModel: Inline model ${i} has bad firstnode`);
		}

        SHARED.VectorCopy(bm.maxs, starmod.maxs);
		SHARED.VectorCopy(bm.mins, starmod.mins);
		starmod.radius = bm.radius;

		if (i == 0) {
			mod.copy(starmod)
		}

		starmod.numleafs = bm.visleafs;
        mod_inline.push(starmod)
	}
    return mod
}

// used for vertex array elements when drawing brushes, sprites, sky and more
// (ok, it has the layout used for rendering brushes, but is not used there)
export class gl3_3D_vtx_t {
    set pos(v: number[]) {
        this.data[this.offset + 0] = v[0]
        this.data[this.offset + 1] = v[1]
        this.data[this.offset + 2] = v[2]
    }
    get pos(): number[] {
        return [
            this.data[this.offset + 0],
            this.data[this.offset + 1],
            this.data[this.offset + 2]
        ]
    }
    set texCoord(v: number[]) {
        this.data[this.offset + 3] = v[0]
        this.data[this.offset + 4] = v[1]
    }
    // lightmap texture coordinate (sometimes unused)
    set lmTexCoord(v: number[]) {
        this.data[this.offset + 5] = v[0]
        this.data[this.offset + 6] = v[1]
    }
    set normal(v: number[]) {
        this.data[this.offset + 7] = v[0]
        this.data[this.offset + 8] = v[1]
        this.data[this.offset + 9] = v[2]
    }
    // bit i set means: dynlight i affects surface
    set lightFlags(v: number) {
        new Uint32Array(this.data.buffer, (this.offset + 10) * 4)[0] = 4
    }
	// vec3_t pos;
	// float texCoord[2];
	// float lmTexCoord[2]; // lightmap texture coordinate (sometimes unused)
	// vec3_t normal;
	// GLuint lightFlags; // bit i set means: dynlight i affects surface
    private data: Float32Array
    private offset: number

    constructor(data: Float32Array, offset: number) {
        this.data = data 
        this.offset = offset
    }

}

// used for vertex array elements when drawing models
export class gl3_alias_vtx_t {
    set pos(v: number[]) {
        this.data[this.offset + 0] = v[0]
        this.data[this.offset + 1] = v[1]
        this.data[this.offset + 2] = v[2]
    }
    set texCoord(v: number[]) {
        this.data[this.offset + 3] = v[0]
        this.data[this.offset + 4] = v[1]
    }
    set color(v: number[]) {
        this.data[this.offset + 5] = v[0]
        this.data[this.offset + 6] = v[1]
        this.data[this.offset + 7] = v[2]
        this.data[this.offset + 8] = v[3]
    }
    set color3(v: number[]) {
        this.data[this.offset + 5] = v[0]
        this.data[this.offset + 6] = v[1]
        this.data[this.offset + 7] = v[2]
    }
    set alpha(v: number) {
        this.data[this.offset + 8] = v
    }
	// GLfloat pos[3];
	// GLfloat texCoord[2];
	// GLfloat color[4];
    private data: Float32Array
    private offset: number

    constructor(data: Float32Array, offset: number) {
        this.data = data 
        this.offset = offset
    }

}


/* in memory representation */
class mvertex_t {
	position: number[]
}

class mmodel_t {
	mins: number[]
    maxs: number[]
	origin: number[] /* for sounds or lights */
	radius: number
	headnode: number
	visleafs: number /* not including the solid leaf 0 */
	firstface: number
    numfaces: number
}

class medge_t {
	v: number[]
}

export class mtexinfo_t {
	vecs = [[0,0,0,0],[0,0,0,0]]
	flags: number = 0
	numframes: number = 0
	next: mtexinfo_t = null /* animation chain */
	image: webglimage_t = null
}

export class glpoly_t {
	next?: glpoly_t = null
	chain?: glpoly_t = null
	numverts: number = 0
	flags: number = 0 /* for SURF_UNDERWATER (not needed anymore?) */
    data: Float32Array
	// gl3_3D_vtx_t vertices[4]; /* variable sized */

    vertice(index: number): gl3_3D_vtx_t {
        return new gl3_3D_vtx_t(this.data, index * 11)
    }

    constructor(count: number) {
        this.numverts = count 
        this.data = new Float32Array(11 * count) 
    }
}

export class msurface_t {
	visframe: number = 0 /* should be drawn when node is crossed */

    plane?: SHARED.cplane_t = null
	flags: number = 0

	firstedge: number = 0          /* look up in model->surfedges[], negative numbers */
	numedges: number = 0           /* are backwards edges */

    texturemins = [0,0]
	extents = [0,0]

    /* gl lightmap coordinates */
    light_s = 0
    light_t = 0
    /* gl lightmap coordinates for dynamic lightmaps */
    dlight_s = 0
    dlight_t = 0

	polys: glpoly_t                /* multiple if warped */
    texturechain?: msurface_t = null
	// struct  msurface_s *lightmapchain; not used/needed anymore

	texinfo: mtexinfo_t = null

	/* lighting info */
	dlightframe: number = 0
	dlightbits: number = 0

	lightmaptexturenum: number = 0
    styles = new Uint8Array(FS.MAXLIGHTMAPS); // MAXLIGHTMAPS = MAX_LIGHTMAPS_PER_SURFACE (defined in local.h)
	// I think cached_light is not used/needed anymore
	//float cached_light[MAXLIGHTMAPS];       /* values currently used in lightmap */
	samples?: Uint8Array                          /* [numstyles*surfsize] */
}

export class mleaf_or_mode {
	/* common with node */
	contents: number = 0               /* wil be a negative contents number */
	visframe: number = 0               /* node needs to be traversed if current */

	minmaxs = new Array<number>(6)           /* for bounding box culling */

	parent: mnode_t
}

export class mleaf_t extends mleaf_or_mode {

	/* leaf specific */
	cluster: number = 0
	area: number = 0

	// msurface_t **firstmarksurface;
	nummarksurfaces: number = 0
    firstmarksurface: number = 0
}

export class mnode_t extends mleaf_or_mode {
	plane: SHARED.cplane_t
	children: mleaf_or_mode[] = [null, null]

	firstsurface: number = 0
	numsurfaces: number = 0
}


export class webglbrushmodel_t extends webglmodel_t {
    constructor(name: string) {
        super(name, modtype_t.mod_brush)
    }

	firstmodelsurface: number = 0
    nummodelsurfaces: number = 0
	lightmap: number = 0 /* only for submodels */


    submodels: mmodel_t[]
    vertexes: mvertex_t[]
    edges: medge_t[]
    surfedges: number[]
    planes: SHARED.cplane_t[]
    texinfo: mtexinfo_t[]
    surfaces: msurface_t[]
    marksurfaces: msurface_t[]
    leafs: mleaf_t[]
    numleafs: number = 0
    nodes: mnode_t[]
    firstnode: number = 0
    lightdata: Uint8Array | null
    visdata: Uint8Array | null
    vis: FS.dvis_t | null

    copy(other: webglbrushmodel_t) {
        super.copy(other)
        this.firstmodelsurface = other.firstmodelsurface
        this.nummodelsurfaces = other.nummodelsurfaces
        this.lightmap = other.lightmap
        this.submodels = other.submodels
        this.vertexes = other.vertexes
        this.edges = other.edges
        this.surfedges = other.surfedges
        this.planes = other.planes
        this.texinfo = other.texinfo
        this.surfaces = other.surfaces
        this.marksurfaces = other.marksurfaces
        this.leafs = other.leafs
        this.numleafs = other.numleafs
        this.nodes = other.nodes
        this.firstnode = other.firstnode
        this.lightdata = other.lightdata
        this.visdata = other.visdata
        this.vis = other.vis
    }

    LoadLighting(l: FS.lump_t, buffer: ArrayBuffer) {
        if (l.filelen == 0) {
            this.lightdata = null;
            return;
        }
    
        this.lightdata = new Uint8Array(buffer, l.fileofs, l.filelen)
    }

    LoadVisibility(l: FS.lump_t, view: DataView, buffer: ArrayBuffer) {

        if (l.filelen == 0) {
            this.visdata = null;
            this.vis = null;
            return;
        }
    
        this.visdata = new Uint8Array(buffer, l.fileofs, l.filelen)
        this.vis = new FS.dvis_t(view, l.fileofs)
    }

    
    LoadVertexes(l: FS.lump_t, view: DataView) {

        if ((l.filelen % FS.dvertex_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadVertexes: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.dvertex_size;

        this.vertexes = new Array<mvertex_t>(count)

        for (let i = 0; i < count; i++) {
            const src = new FS.dvertex_t(view, l.fileofs + i * FS.dvertex_size);
            let out = new mvertex_t()
            out.position = [ src.point[0], src.point[1], src.point[2] ]
            this.vertexes[i] = out
        }
    }

    LoadEdges(l: FS.lump_t, view: DataView) {

        if ((l.filelen % FS.dedge_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadEdges: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.dedge_size;

        this.edges = new Array<medge_t>(count)

        for (let i = 0; i < count; i++) {
            const src = new FS.dedge_t(view, l.fileofs + i * FS.dedge_size);
            let out = new medge_t()
            out.v = [ src.v[0], src.v[1] ]
            this.edges[i] = out
        }
    }

    LoadSurfedges(l: FS.lump_t, view: DataView) {

        if ((l.filelen % 4) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadSurfedges: funny lump size in ${this.name}`)
        }

        const count = l.filelen / 4;

        if ((count < 1) || (count >= FS.MAX_MAP_SURFEDGES)) {
            Com_Error(SHARED.ERR_DROP, `LoadSurfedges: bad surfedges count in ${this.name}: ${count}`);
        }
    
        this.surfedges = new Array<number>(count)

        for (let i = 0; i < count; i++) {
            this.surfedges[i] = view.getInt32(l.fileofs + i * 4, true)
        }
    }

    LoadSubmodels(l: FS.lump_t, view: DataView) {

        if ((l.filelen % FS.dmodel_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadSubmodels: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.dmodel_size;

        this.submodels = new Array<mmodel_t>(count)

        for (let i = 0; i < count; i++) {
            const src = new FS.dmodel_t(view, l.fileofs + i * FS.dmodel_size);
            let out = new mmodel_t()
            out.mins = [0,0,0]
            out.maxs = [0,0,0]
            out.origin = [0,0,0]
            for (let j = 0; j < 3; j++) {
                /* spread the mins / maxs by a pixel */
                out.mins[j] = src.mins[j] - 1;
                out.maxs[j] = src.maxs[j] + 1;
                out.origin[j] = src.origin[j];
            }
            out.radius = Mod_RadiusFromBounds(src.mins, src.maxs);
            out.headnode = src.headnode;
            out.firstface = src.firstface;
            out.numfaces = src.numfaces;
            this.submodels[i] = out;
        }
    }

    LoadPlanes(l: FS.lump_t, view: DataView) {

        if ((l.filelen % FS.dplane_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadPlanes: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.dplane_size;

        this.planes = new Array<SHARED.cplane_t>(count)

        for (let i = 0; i < count; i++) {
            const src = new FS.dplane_t(view, l.fileofs + i * FS.dplane_size);
            let out = new SHARED.cplane_t()
            let bits = 0;

            for (let j = 0; j < 3; j++) {
                out.normal[j] = src.normal[j];
                if (out.normal[j] < 0) {
                    bits |= 1 << j;
                }
            }
    
            out.dist = src.dist;
            out.type = src.type;
            out.signbits = bits;
            this.planes[i] = out
        }
    }

    async LoadTexinfo(l: FS.lump_t, view: DataView, gl: WebGL2RenderingContext) {

        if ((l.filelen % FS.texinfo_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadTexinfo: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.texinfo_size;

        this.texinfo = new Array<mtexinfo_t>(count)
        for (let i = 0; i < count; i++) {
            this.texinfo[i] = new mtexinfo_t()
        }

        for (let i = 0; i < count; i++) {
            const src = new FS.texinfo_t(view, l.fileofs + i * FS.texinfo_size);
            let out = this.texinfo[i]
            for (let j = 0; j < 4; j++) {
                out.vecs[0][j] = src.vecs[0][j];
                out.vecs[1][j] = src.vecs[1][j];
            }
    
            out.flags = src.flags;
            let next = src.nexttexinfo;
    
            if (next > 0) {
                out.next = this.texinfo[next];
            } else {
                out.next = null;
            }
    
            let name = `textures/${src.texture}.wal`;

            out.image = await WebGL_FindImage(gl, name, imagetype_t.it_wall);
    
            // if (!out.image || out.image == gl3_notexture) {
            //     Com_sprintf(name, sizeof(name), "textures/%s.m8", in->texture);
            //     out.image = GL3_FindImage(name, it_wall);
            // }
    
            if (out.image == null) {
                Com_Printf(`Couldn't load ${name}\n`);
                out.image = gl3_notexture;
            }
        }

        /* count animation frames */
        for (let i = 0; i < count; i++) {
            let out = this.texinfo[i];
            out.numframes = 1;
    
            for (let step = out.next; step != null && step != out; step = step.next) {
                out.numframes++;
            }
        }
        
    }

    LoadFaces(l: FS.lump_t, view: DataView, gl: WebGL2RenderingContext) {

        if ((l.filelen % FS.dface_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadFaces: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.dface_size;

        this.surfaces = new Array<msurface_t>(count)

        WebGL_LM_BeginBuildingLightmaps(gl, this);

        for (let surfnum = 0; surfnum < count; surfnum++) {
            const src = new FS.dface_t(view, l.fileofs + surfnum * FS.dface_size);
            let out = new msurface_t()


            out.firstedge = src.firstedge;
            out.numedges = src.numedges;
            out.flags = 0;
            // out.polys = NULL;

            let planenum = src.planenum;
            let side = src.side;
    
            if (side) {
                out.flags |= SURF_PLANEBACK;
            }
    
            out.plane = this.planes[planenum];
    
            let ti = src.texinfo;
    
            if ((ti < 0) || (ti >= this.texinfo.length)) {
                Com_Error(SHARED.ERR_DROP, "LoadFaces: bad texinfo number");
            }
    
            out.texinfo = this.texinfo[ti];
    
            this.CalcSurfaceExtents(out);
    
            /* lighting info */
            for (let i = 0; i < MAX_LIGHTMAPS_PER_SURFACE; i++) {
                out.styles[i] = src.styles[i];
            }
    
            let i = src.lightofs;
            if (i == -1) {
                out.samples = null;
            } else {
                out.samples = this.lightdata.slice(i)
            }
    
            /* set the drawing flags */
            if (out.texinfo.flags & FS.SURF_WARP) {
                out.flags |= SURF_DRAWTURB;
    
                for (let i = 0; i < 2; i++) {
                    out.extents[i] = 16384;
                    out.texturemins[i] = -8192;
                }
    
                WebGL_SubdivideSurface(out, this); /* cut up polygon for warps */
            }
    
            // if (r_fixsurfsky.value) {
            //     if (out.texinfo.flags & FS.SURF_SKY) {
            //         out.flags |= SURF_DRAWSKY;
            //     }
            // }
    
            /* create lightmaps and polygons */
            if (!(out.texinfo.flags & (FS.SURF_SKY | FS.SURF_TRANS33 | FS.SURF_TRANS66 | FS.SURF_WARP)))
            {
                WebGL_LM_CreateSurfaceLightmap(gl, out);
            }
    
            if (!(out.texinfo.flags & FS.SURF_WARP))
            {
                WebGL_LM_BuildPolygonFromSurface(gl, this, out);
            }            
            this.surfaces[surfnum] = out
        }

        WebGL_LM_EndBuildingLightmaps(gl);
    }

    private Mod_SetParent(anode: mleaf_or_mode, parent: mnode_t) {
        anode.parent = parent;
    
        if (anode.contents != -1) {
            return;
        }
    
        let node = anode as mnode_t
        this.Mod_SetParent(node.children[0], node);
        this.Mod_SetParent(node.children[1], node);
    }
    
    LoadNodes(l: FS.lump_t, view: DataView) {

        if ((l.filelen % FS.dnode_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadNodes: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.dnode_size;

        this.nodes = new Array<mnode_t>(count)
        for (let i = 0; i < count; i++) {
            this.nodes[i] = new mnode_t()
        }

        for (let i = 0; i < count; i++) {
            const src = new FS.dnode_t(view, l.fileofs + i * FS.dnode_size);
            let out = this.nodes[i]

            for (let j = 0; j < 3; j++)
            {
                out.minmaxs[j] = src.mins[j];
                out.minmaxs[3 + j] = src.maxs[j];
            }
    
            out.plane = this.planes[src.planenum]
    
            out.firstsurface = src.firstface;
            out.numsurfaces = src.numfaces;
            out.contents = -1; /* differentiate from leafs */
    
            for (let j = 0; j < 2; j++) {
                let p = src.children[j];
                if (p >= 0) {
                    out.children[j] = this.nodes[p];
                } else {
                    out.children[j] = this.leafs[-1 - p];
                }
            }
        }        
    
        this.Mod_SetParent(this.nodes[0], null); /* sets nodes and leafs */
    }    

    LoadLeafs(l: FS.lump_t, view: DataView) {

        if ((l.filelen % FS.dleaf_size) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadLeafs: funny lump size in ${this.name}`)
        }

        const count = l.filelen / FS.dleaf_size;

        this.leafs = new Array<mleaf_t>(count)
        this.numleafs = count

        for (let i = 0; i < count; i++) {
            const src = new FS.dleaf_t(view, l.fileofs + i * FS.dleaf_size);
            let out = new mleaf_t()

            for (let j = 0; j < 3; j++)
            {
                out.minmaxs[j] = src.mins[j];
                out.minmaxs[3 + j] = src.maxs[j];
            }
    
            out.contents = src.contents;
    
            out.cluster = src.cluster;
            out.area = src.area;
    
            // make unsigned long from signed short
            let firstleafface = src.firstleafface & 0xFFFF;
            out.nummarksurfaces = src.numleaffaces & 0xFFFF;
            out.firstmarksurface = firstleafface
    
            // this.marksurfaces[]
            // out.firstmarksurface = this.marksurfaces + firstleafface;
            if ((firstleafface + out.nummarksurfaces) > this.marksurfaces.length) {
                Com_Error(SHARED.ERR_DROP, `LoadLeafs: wrong marksurfaces position in ${this.name}`);
            }

            this.leafs[i] = out
        }
    }

    LoadMarksurfaces(l: FS.lump_t, view: DataView) {

        if ((l.filelen % 2) != 0) {
            Com_Error(SHARED.ERR_DROP, `LoadMarksurfaces: funny lump size in ${this.name}`)
        }

        const count = l.filelen / 2;

        this.marksurfaces = new Array<msurface_t>(count)

        for (let i = 0; i < count; i++) {
            const j = view.getInt16(l.fileofs + i * 2, true);
            if ((j < 0) || (j >= this.surfaces.length)) {
                Com_Error(SHARED.ERR_DROP, `LoadMarksurfaces: bad surface number ${j}`);
            }
            this.marksurfaces[i] = this.surfaces[j];
        }        
    }


    /*
    * Fills in s->texturemins[] and s->extents[]
    */
    private CalcSurfaceExtents(s: msurface_t) {
        // float mins[2], maxs[2], val;
        // int i, j, e;
        // mvertex_t *v;
        // mtexinfo_t *tex;
        // int bmins[2], bmaxs[2];

        let mins = [999999, 999999]
        let maxs = [-99999, -99999]

        let tex = s.texinfo;

        for (let i = 0; i < s.numedges; i++) {
            const e = this.surfedges[s.firstedge + i];

            let v: mvertex_t
            if (e >= 0) {
                v = this.vertexes[this.edges[e].v[0]];
            } else {
                v = this.vertexes[this.edges[-e].v[1]];
            }

            for (let j = 0; j < 2; j++) {
                let val = v.position[0] * tex.vecs[j][0] +
                    v.position[1] * tex.vecs[j][1] +
                    v.position[2] * tex.vecs[j][2] +
                    tex.vecs[j][3];

                if (val < mins[j]) {
                    mins[j] = val;
                }

                if (val > maxs[j]) {
                    maxs[j] = val;
                }
            }
        }

        for (let i = 0; i < 2; i++) {
            let bmins = Math.floor(mins[i] / 16);
            let bmaxs = Math.ceil(maxs[i] / 16);

            s.texturemins[i] = bmins * 16;
            s.extents[i] = (bmaxs - bmins) * 16;
        }
    }

    

}

export class webglaliasmodel_t extends webglmodel_t {

    header: FS.dmdl_t
    sts: FS.dstvert_t[]
    tris: FS.dtriangle_t[]
    frames: FS.daliasframe_t[]
    glcmds: Int32Array
    skinNames: string[]

    constructor(name: string) {
        super(name, modtype_t.mod_alias)
    }
}

async function LoadMD2(gl: WebGL2RenderingContext, buffer: ArrayBuffer, name: string): Promise<webglmodel_t> {

    let view = new DataView(buffer)

    let mod = new webglaliasmodel_t(name)

    mod.header = new FS.dmdl_t(view, 0)

	if (mod.header.version != FS.ALIAS_VERSION) {
		Com_Error(SHARED.ERR_DROP, `LoadMD2: ${name} has wrong version number (${mod.header.version} should be ${FS.ALIAS_VERSION})`);
	}

	// ofs_end = LittleLong(pinmodel->ofs_end);
	// if (ofs_end < 0 || ofs_end > modfilelen)
	// 	ri.Sys_Error (ERR_DROP, "model %s file size(%d) too small, should be %d", mod->name,
	// 			   modfilelen, ofs_end);

	// if (mod.header.skinheight > MAX_LBM_HEIGHT) {
	// 	Com_Error(SHARED.ERR_DROP, `model ${name} has a skin taller than ${MAX_LBM_HEIGHT}`);
	// }

	if (mod.header.num_xyz <= 0) {
		Com_Error(SHARED.ERR_DROP, `model ${name} has no vertices`);
	}

	if (mod.header.num_xyz > FS.MAX_VERTS) {
		Com_Error(SHARED.ERR_DROP, `model ${name} has too many vertices`);
	}

	if (mod.header.num_st <= 0) {
		Com_Error(SHARED.ERR_DROP, `model ${name} has no st vertices`);
	}

	if (mod.header.num_tris <= 0) {
		Com_Error(SHARED.ERR_DROP, `model ${name} has no triangles`);
	}

	if (mod.header.num_frames <= 0) {
		Com_Error(SHARED.ERR_DROP, `model ${name} has no frames`);
	}

	/* load base s and t vertices (not used in gl version) */
    mod.sts = new Array<FS.dstvert_t>(mod.header.num_st);
	for (let i = 0; i < mod.header.num_st; i++) {
        mod.sts[i] = new FS.dstvert_t(view, mod.header.ofs_st + i * FS.dstvert_size);
	}

	/* load triangle lists */
    mod.tris = new Array<FS.dtriangle_t>(mod.header.num_tris);
	for (let i = 0; i < mod.header.num_tris; i++) {
        mod.tris[i] = new FS.dtriangle_t(view, mod.header.ofs_tris + i * FS.dtriangle_size);
	}

	/* load the frames */
    mod.frames = new Array<FS.daliasframe_t>(mod.header.num_frames);
	for (let i = 0; i < mod.header.num_frames; i++) {
        mod.frames[i] = new FS.daliasframe_t(view, mod.header.ofs_frames + i * mod.header.framesize, mod.header.framesize);
	}

	/* load the glcmds */
    mod.glcmds = new Int32Array(mod.header.num_glcmds);
	for (let i = 0; i < mod.header.num_glcmds; i++) {
        mod.glcmds[i] = view.getInt32(mod.header.ofs_glcmds + i * 4, true);
	}
	// if (poutcmd[pheader->num_glcmds-1] != 0)
	// {
	// 	R_Printf(PRINT_ALL, "%s: Entity %s has possible last element issues with %d verts.\n",
	// 		__func__,
	// 		mod->name,
	// 		poutcmd[pheader->num_glcmds-1]);
	// }

	/* register all skins */
    mod.skinNames = new Array<string>(mod.header.num_skins);
	for (let i = 0; i < mod.header.num_skins; i++) {
        mod.skinNames[i] = FS.readString(view, mod.header.ofs_skins + i * FS.MAX_SKINNAME, FS.MAX_SKINNAME);
	}
    mod.skins = new Array<webglimage_t>(mod.header.num_skins);
	for (let i = 0; i < mod.header.num_skins; i++) {
        mod.skins[i] = await WebGL_FindImage(gl, mod.skinNames[i], imagetype_t.it_skin);
	}

	mod.mins[0] = -32;
	mod.mins[1] = -32;
	mod.mins[2] = -32;
	mod.maxs[0] = 32;
	mod.maxs[1] = 32;
	mod.maxs[2] = 32;

    return mod
}

export class webglspritemodel_t extends webglmodel_t {

    spr: FS.dsprite_t

    constructor(name: string) {
        super(name, modtype_t.mod_sprite)
    }
}

async function LoadSP2(gl: WebGL2RenderingContext, buffer: ArrayBuffer, name: string): Promise<webglmodel_t> {

    let view = new DataView(buffer)

    let mod = new webglspritemodel_t(name);

	mod.spr = new FS.dsprite_t(view, 0)

	if (mod.spr.version != FS.SPRITE_VERSION) {
		Com_Error(SHARED.ERR_DROP, `LoadSP2: ${name} has wrong version number (${mod.spr.version} should be ${FS.SPRITE_VERSION})`);
	}

	if (mod.spr.numframes > FS.MAX_MD2SKINS) {
		Com_Error(SHARED.ERR_DROP, `LoadSP2: ${name} has too many frames (${mod.spr.numframes} > ${FS.MAX_MD2SKINS})`);
	}

	mod.skins = new Array<webglimage_t>(mod.spr.numframes);
	for (let i = 0; i <  mod.spr.numframes; i++) {
		mod.skins[i] = await WebGL_FindImage(gl, mod.spr.frames[i].name, imagetype_t.it_sprite)
	}

    return mod
}