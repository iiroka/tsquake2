/*
 * Copyright (C) 1997-2001 Id Software, Inc.
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
 * The Quake II file system, implements generic file system operations
 * as well as the .pak file format and support for .pk3 files.
 *
 * =======================================================================
 */
import * as COMMON from "./common"
import * as SHARED from "./shared"
import { Cvar_Get } from "./cvar"
import { server_address } from "../client/cl_main"
import { viddef } from "../client/vid"

let fs_cddir: SHARED.cvar_t
let localFiles: Set<string>

async function loadFile(path:string): Promise<ArrayBuffer> {
    let resp = await fetch(`${COMMON.BASEDIRNAME}/${path}`)
    if (!resp.ok) return null
    return await resp.arrayBuffer()
}

/*
 * Filename are reletive to the quake search path. A null buffer will just
 * return the file length without loading.
 */
export async function FS_LoadFile(path: string): Promise<ArrayBuffer> {
    if (localFiles.has(path)) {
        return await loadFile(path)
    }
    if (server_address != null && server_address.string.length > 0) {
        let resp = await fetch(`${server_address.string}/qfile/${path}`)
        if (!resp.ok) return null
        return await resp.arrayBuffer()    
    }
    return null
}

export function FS_CheckFile(path: string): boolean {
    if (localFiles.has(path)) {
        return true
    }
    return false
}


// --------

export async function FS_InitFilesystem() {
	// Register FS commands.
// 	Cmd_AddCommand("path", FS_Path_f);
// 	Cmd_AddCommand("link", FS_Link_f);
// 	Cmd_AddCommand("dir", FS_Dir_f);

// 	// Register cvars
// 	fs_basedir = Cvar_Get("basedir", ".", CVAR_NOSET);
    fs_cddir = Cvar_Get("cddir", "", SHARED.CVAR_NOSET);
// 	fs_gamedirvar = Cvar_Get("game", "", CVAR_LATCH | CVAR_SERVERINFO);
// 	fs_debug = Cvar_Get("fs_debug", "0", 0);

    let locals = await loadFile("localfiles")
    let enc = new TextDecoder("utf-8");
    localFiles = new Set(enc.decode(locals).split('\n'))
    console.log(localFiles)

// 	// Deprecation warning, can be removed at a later time.
// 	if (strcmp(fs_basedir->string, ".") != 0)
// 	{
// 		Com_Printf("+set basedir is deprecated, use -datadir instead\n");
// 		strcpy(datadir, fs_basedir->string);
// 	}
// 	else if (strlen(datadir) == 0)
// 	{
// 		strcpy(datadir, ".");
// 	}

// #ifdef _WIN32
// 	// setup minizip for Unicode compatibility
// 	fill_fopen_filefunc(&zlib_file_api);
// 	zlib_file_api.zopen_file = fopen_file_func_utf;
// #endif

// 	// Build search path
// 	FS_BuildRawPath();
// 	FS_BuildGenericSearchPath();

// 	if (fs_gamedirvar->string[0] != '\0')
// 	{
// 		FS_BuildGameSpecificSearchPath(fs_gamedirvar->string);
// 	}
// #ifndef DEDICATED_ONLY
// 	else
// 	{
// 		// no mod, but we still need to get the list of OGG tracks for background music
// 		OGG_InitTrackList();
// 	}
// #endif

// 	// Debug output
// 	Com_Printf("Using '%s' for writing.\n", fs_gamedir);
}

export function readString(view: DataView, offset: number, maxLen: number): string {
    let res = ""
    for (let i = 0; i < maxLen && view.getInt8(offset + i) != 0; i++) {
        res += String.fromCharCode(view.getInt8(offset + i))
    }
    return res
}

/* .MD2 triangle model file format */

export const IDALIASHEADER = 0x32504449 // (('2' << 24) + ('P' << 16) + ('D' << 8) + 'I')
export const ALIAS_VERSION = 8

export const MAX_TRIANGLES = 4096
export const MAX_VERTS = 2048
export const MAX_FRAMES = 512
export const MAX_MD2SKINS = 32
export const MAX_SKINNAME = 64

export class dstvert_t {
    readonly s: number
    readonly t: number

    constructor(view: DataView, offset: number) {
        this.s = view.getInt16(offset + 0, true)
        this.t = view.getInt16(offset + 2, true)
    }
}
export const dstvert_size = 2 * 2

export class dtriangle_t {
    readonly index_xyz: number[]
    readonly index_st: number[]

    constructor(view: DataView, offset: number) {
        this.index_xyz = [
            view.getInt16(offset + 0*2, true),
            view.getInt16(offset + 1*2, true),
            view.getInt16(offset + 2*2, true)
        ]
        this.index_st = [
            view.getInt16(offset + 3*2, true),
            view.getInt16(offset + 4*2, true),
            view.getInt16(offset + 5*2, true)
        ]
    }
}
export const dtriangle_size = 6 * 2

export class dtrivertx_t {
    readonly v: number[] /* scaled byte to fit in frame mins/maxs */
    readonly lightnormalindex: number

    constructor(view: DataView, offset: number) {
        this.v = [
            view.getUint8(offset + 0),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2)
        ]
        this.lightnormalindex = view.getUint8(3)
    }
}
export const dtrivertx_size = 4

export const DTRIVERTX_V0 = 0
export const DTRIVERTX_V1 = 1
export const DTRIVERTX_V2 = 2
export const DTRIVERTX_LNI = 3
export const DTRIVERTX_SIZE = 4

export class daliasframe_t {
    readonly scale: number[]        /* multiply byte verts by this */
    readonly translate: number[]    /* then add this */
    readonly name: string           /* frame name from grabbing */
    readonly verts: dtrivertx_t[]   /* variable sized */

    constructor(view: DataView, offset: number, length: number) {
        this.scale = [
            view.getFloat32(offset + 0*4, true),
            view.getFloat32(offset + 1*4, true),
            view.getFloat32(offset + 2*4, true)
        ]
        this.translate = [
            view.getFloat32(offset + 3*4, true),
            view.getFloat32(offset + 4*4, true),
            view.getFloat32(offset + 5*4, true)
        ]
        this.name = readString(view, offset + 6 * 4, 16)
        let count = (length - 6 * 4 - 16) / dtrivertx_size
        let verts = new Array<dtrivertx_t>(count);
        for (let i = 0; i < count; i++) {
            verts[i] = new dtrivertx_t(view, offset + 6 * 4 + 16 + i * dtrivertx_size);
        }
        this.verts = verts
    }
}

/* the glcmd format:
 * - a positive integer starts a tristrip command, followed by that many
 *   vertex structures.
 * - a negative integer starts a trifan command, followed by -x vertexes
 *   a zero indicates the end of the command list.
 * - a vertex consists of a floating point s, a floating point t,
 *   and an integer vertex index. */

export class dmdl_t {
    readonly ident: number
    readonly version: number

    readonly skinwidth: number
    readonly skinheight: number
    readonly framesize: number  /* byte size of each frame */

    readonly num_skins: number
    readonly num_xyz: number
    readonly num_st: number     /* greater than num_xyz for seams */
    readonly num_tris: number
    readonly num_glcmds: number /* dwords in strip/fan command list */
    readonly num_frames: number

    readonly ofs_skins: number  /* each skin is a MAX_SKINNAME string */
    readonly ofs_st: number     /* byte offset from start for stverts */
    readonly ofs_tris: number   /* offset for dtriangles */
    readonly ofs_frames: number /* offset for first frame */
    readonly ofs_glcmds: number
    readonly ofs_end: number   /* end of file */

    constructor(view: DataView, offset: number) {
        this.ident = view.getInt32(offset + 0 * 4, true)
        this.version = view.getInt32(offset + 1 * 4, true)
        this.skinwidth = view.getInt32(offset + 2 * 4, true)
        this.skinheight = view.getInt32(offset + 3 * 4, true)
        this.framesize = view.getInt32(offset + 4 * 4, true)
        this.num_skins = view.getInt32(offset + 5 * 4, true)
        this.num_xyz = view.getInt32(offset + 6 * 4, true)
        this.num_st = view.getInt32(offset + 7 * 4, true)
        this.num_tris = view.getInt32(offset + 8 * 4, true)
        this.num_glcmds = view.getInt32(offset + 9 * 4, true)
        this.num_frames = view.getInt32(offset + 10 * 4, true)
        this.ofs_skins = view.getInt32(offset + 11 * 4, true)
        this.ofs_st = view.getInt32(offset + 12 * 4, true)
        this.ofs_tris = view.getInt32(offset + 13 * 4, true)
        this.ofs_frames = view.getInt32(offset + 14 * 4, true)
        this.ofs_glcmds = view.getInt32(offset + 15 * 4, true)
        this.ofs_end = view.getInt32(offset + 16 * 4, true)
    }
}
export const dmdl_size = 17 * 4

/* .SP2 sprite file format */

export const IDSPRITEHEADER = 0x32534449 // (('2' << 24) + ('S' << 16) + ('D' << 8) + 'I')
export const SPRITE_VERSION = 2

export class dsprframe_t {
    readonly width: number
    readonly height: number
    /* raster coordinates inside pic */
    readonly origin_x: number
    readonly origin_y: number
    readonly name: string       /* name of pcx file */

    constructor(view: DataView, offset: number) {
        this.width = view.getInt32(offset, true)
        this.height = view.getInt32(offset + 1 * 4, true)
        this.origin_x = view.getInt32(offset + 1 * 4, true)
        this.origin_y = view.getInt32(offset + 1 * 4, true)
        this.name = readString(view, offset + 4 * 4, MAX_SKINNAME);
    }
}
const dsprframe_size = 4 * 4 + MAX_SKINNAME

export class dsprite_t {
    readonly ident: number
    readonly version: number
    readonly numframes: number
    readonly frames: dsprframe_t[]

    constructor(view: DataView, offset: number) {
        this.ident = view.getInt32(offset, true)
        this.version = view.getInt32(offset + 4, true)
        this.numframes = view.getInt32(offset + 2*4, true)
        let frames = new Array<dsprframe_t>(this.numframes);
        for (let i = 0; i < this.numframes; i++) {
            frames[i] = new dsprframe_t(view, offset + 3 * 4 + i * dsprframe_size);
        }
        this.frames = frames
    }
}

/* .WAL texture file format */

export const MIPLEVELS = 4
export class miptex_t {
	readonly name: string
	readonly width: number
    readonly height: number
	readonly offsets: number[] /* four mip maps stored */
	readonly animname: string           /* next frame in animation chain */
	readonly flags: number
	readonly contents: number
	readonly value: number

    constructor(view: DataView) {
        this.name = readString(view, 0, 32)
        this.width = view.getUint32(32, true)
        this.height = view.getUint32(32 + 4, true)
        let offsets: number[] = []
        for (let i = 0; i < MIPLEVELS; i++) {
            offsets.push(view.getUint32(32 + (2 + i) * 4, true))
        }
        this.offsets = offsets
        this.animname = readString(view, 32 + (2 + MIPLEVELS) * 4, 32)
        this.flags = view.getInt32(2 * 32 + (2 + MIPLEVELS) * 4, true)
        this.contents = view.getInt32(2 * 32 + (3 + MIPLEVELS) * 4, true)
        this.value = view.getInt32(2 * 32 + (4 + MIPLEVELS) * 4, true)
    }
}
export const miptex_size = 2 * 32 + (5 + MIPLEVELS) * 4;


/* .BSP file format */

export const IDBSPHEADER = 0x50534249 // (('P' << 24) + ('S' << 16) + ('B' << 8) + 'I') /* little-endian "IBSP" */
export const BSPVERSION = 38

/* upper design bounds: leaffaces, leafbrushes, planes, and 
 * verts are still bounded by 16 bit short limits */
export const MAX_MAP_MODELS = 1024
export const MAX_MAP_BRUSHES = 8192
export const MAX_MAP_ENTITIES = 2048
export const MAX_MAP_ENTSTRING = 0x40000
export const MAX_MAP_TEXINFO = 8192

export const MAX_MAP_AREAS = 256
export const MAX_MAP_AREAPORTALS = 1024
export const MAX_MAP_PLANES = 65536
export const MAX_MAP_NODES = 65536
export const MAX_MAP_BRUSHSIDES = 65536
export const MAX_MAP_LEAFS = 65536
export const MAX_MAP_VERTS = 65536
export const MAX_MAP_FACES = 65536
export const MAX_MAP_LEAFFACES = 65536
export const MAX_MAP_LEAFBRUSHES = 65536
export const MAX_MAP_PORTALS = 65536
export const MAX_MAP_EDGES = 128000
export const MAX_MAP_SURFEDGES = 256000
export const MAX_MAP_LIGHTING = 0x200000
export const MAX_MAP_VISIBILITY = 0x100000

/* key / value pair sizes */

export const MAX_KEY = 32
export const MAX_VALUE = 1024

/* ================================================================== */

export class lump_t {
    readonly fileofs: number
    readonly filelen: number

    constructor(view: DataView, offset: number) {
        this.fileofs = view.getInt32(offset, true)
        this.filelen = view.getInt32(offset + 4, true)
    }
}
const lump_size = 2 * 4


export const LUMP_ENTITIES = 0
export const LUMP_PLANES = 1
export const LUMP_VERTEXES = 2
export const LUMP_VISIBILITY = 3
export const LUMP_NODES = 4
export const LUMP_TEXINFO = 5
export const LUMP_FACES = 6
export const LUMP_LIGHTING = 7
export const LUMP_LEAFS = 8
export const LUMP_LEAFFACES = 9
export const LUMP_LEAFBRUSHES = 10
export const LUMP_EDGES = 11
export const LUMP_SURFEDGES = 12
export const LUMP_MODELS = 13
export const LUMP_BRUSHES = 14
export const LUMP_BRUSHSIDES = 15
export const LUMP_POP = 16
export const LUMP_AREAS = 17
export const LUMP_AREAPORTALS = 18
export const HEADER_LUMPS = 19

export class dheader_t {
    readonly ident: number
    readonly version: number
    readonly lumps: lump_t[]

    constructor(view: DataView) {
        this.ident = view.getInt32(0, true)
        this.version = view.getInt32(4, true)
        let lumps: lump_t[] = new Array<lump_t>(HEADER_LUMPS);
        for (let i = 0; i < HEADER_LUMPS; i++) {
            lumps[i] = new lump_t(view, 2 * 4 + i * lump_size)
        }
        this.lumps = lumps
    }
}
export const dheader_size = 2 * 4 + HEADER_LUMPS * lump_size

export class dmodel_t {
	readonly mins: number[]
	readonly maxs: number[]
	readonly origin: number[] /* for sounds or lights */
    readonly headnode: number
    readonly firstface: number /* submodels just draw faces without */
    readonly numfaces: number  /* walking the bsp tree */

    constructor(view: DataView, offset: number) {
        this.mins = [
            view.getFloat32(offset+0*4, true),
            view.getFloat32(offset+1*4, true),
            view.getFloat32(offset+2*4, true)
        ]
        this.maxs = [
            view.getFloat32(offset+3*4, true),
            view.getFloat32(offset+4*4, true),
            view.getFloat32(offset+5*4, true)
        ]
        this.origin = [
            view.getFloat32(offset+6*4, true),
            view.getFloat32(offset+7*4, true),
            view.getFloat32(offset+8*4, true)
        ]
        this.headnode = view.getInt32(offset+9*4, true)
        this.firstface = view.getInt32(offset+10*4, true)
        this.numfaces = view.getInt32(offset+11*4, true)
    }

}
export const dmodel_size = 12 * 4

export class dvertex_t {
	readonly point: number[]

    constructor(view: DataView, offset: number) {
        this.point = [
            view.getFloat32(offset+0*4, true),
            view.getFloat32(offset+1*4, true),
            view.getFloat32(offset+2*4, true)
        ]
    }

}
export const dvertex_size = 3 * 4

/* 0-2 are axial planes */
export const PLANE_X = 0
export const PLANE_Y = 1
export const PLANE_Z = 2

/* 3-5 are non-axial planes snapped to the nearest */
export const PLANE_ANYX = 3
export const PLANE_ANYY = 4
export const PLANE_ANYZ = 5

/* planes (x&~1) and (x&~1)+1 are always opposites */

export class dplane_t {
	readonly normal: number[]
    readonly dist: number
    readonly type: number /* PLANE_X - PLANE_ANYZ */

    constructor(view: DataView, offset: number) {
        this.normal = [
            view.getFloat32(offset+0*4, true),
            view.getFloat32(offset+1*4, true),
            view.getFloat32(offset+2*4, true)
        ]
        this.dist = view.getFloat32(offset+3*4, true)
        this.type = view.getInt32(offset+4*4, true)
    }

}
export const dplane_size = 5 * 4

/* contents flags are seperate bits
 * - given brush can contribute multiple content bits
 * - multiple brushes can be in a single leaf */

/* lower bits are stronger, and will eat weaker brushes completely */
export const CONTENTS_SOLID = 1  /* an eye is never valid in a solid */
export const CONTENTS_WINDOW = 2 /* translucent, but not watery */
export const CONTENTS_AUX = 4
export const CONTENTS_LAVA = 8
export const CONTENTS_SLIME = 16
export const CONTENTS_WATER = 32
export const CONTENTS_MIST = 64
export const LAST_VISIBLE_CONTENTS = 64

/* remaining contents are non-visible, and don't eat brushes */
export const CONTENTS_AREAPORTAL = 0x8000

export const CONTENTS_PLAYERCLIP = 0x10000
export const CONTENTS_MONSTERCLIP = 0x20000

/* currents can be added to any other contents, and may be mixed */
export const CONTENTS_CURRENT_0 = 0x40000
export const CONTENTS_CURRENT_90 = 0x80000
export const CONTENTS_CURRENT_180 = 0x100000
export const CONTENTS_CURRENT_270 = 0x200000
export const CONTENTS_CURRENT_UP = 0x400000
export const CONTENTS_CURRENT_DOWN = 0x800000

export const CONTENTS_ORIGIN = 0x1000000       /* removed before bsping an entity */

export const CONTENTS_MONSTER = 0x2000000      /* should never be on a brush, only in game */
export const CONTENTS_DEADMONSTER = 0x4000000
export const CONTENTS_DETAIL = 0x8000000       /* brushes to be added after vis leafs */
export const CONTENTS_TRANSLUCENT = 0x10000000 /* auto set if any surface has trans */
export const CONTENTS_LADDER = 0x20000000

export const SURF_LIGHT = 0x1    /* value will hold the light strength */

export const SURF_SLICK = 0x2    /* effects game physics */

export const SURF_SKY = 0x4      /* don't draw, but add to skybox */
export const SURF_WARP = 0x8     /* turbulent water warp */
export const SURF_TRANS33 = 0x10
export const SURF_TRANS66 = 0x20
export const SURF_FLOWING = 0x40 /* scroll towards angle */
export const SURF_NODRAW = 0x80  /* don't bother referencing the texture */

export class dnode_t {
	readonly planenum: number
	readonly children: number[] /* negative numbers are -(leafs+1), not nodes */
    readonly mins: number[]     /* for frustom culling */
    readonly maxs: number[]
    readonly firstface: number
    readonly numfaces: number 

    constructor(view: DataView, offset: number) {
        this.planenum = view.getInt32(offset+0*4, true)
        this.children = [
            view.getInt32(offset+1*4, true),
            view.getInt32(offset+2*4, true)
        ]
        this.mins = [
            view.getInt16(offset+3*4+0*2, true),
            view.getInt16(offset+3*4+1*2, true),
            view.getInt16(offset+3*4+2*2, true)
        ]
        this.maxs = [
            view.getInt16(offset+3*4+3*2, true),
            view.getInt16(offset+3*4+4*2, true),
            view.getInt16(offset+3*4+5*2, true)
        ]
        this.firstface = view.getUint16(offset+3*4+6*2, true)
        this.numfaces = view.getUint16(offset+3*4+7*2, true)
    }

}
export const dnode_size = 3 * 4 + 8 * 2

export class texinfo_t {
	readonly vecs: number[][]       /* [s/t][xyz offset] */
    readonly flags: number          /* miptex flags + overrides light emission, etc */
    readonly value: number
    readonly texture: string        /* texture name (textures*.wal) */
    readonly nexttexinfo: number    /* for animations, -1 = end of chain */ 

    constructor(view: DataView, offset: number) {
        this.vecs = [
            [
                view.getFloat32(offset+0*4, true),
                view.getFloat32(offset+1*4, true),
                view.getFloat32(offset+2*4, true),
                view.getFloat32(offset+3*4, true)
            ],
            [
                view.getFloat32(offset+4*4, true),
                view.getFloat32(offset+5*4, true),
                view.getFloat32(offset+6*4, true),
                view.getFloat32(offset+7*4, true)
            ]
        ]
        this.flags = view.getInt32(offset+8*4, true)
        this.value = view.getInt32(offset+9*4, true)
        this.texture = readString(view, offset + 10 * 4, 32)
        this.nexttexinfo = view.getInt32(offset+10*4+32, true)
    }

}
export const texinfo_size = 11 * 4 + 32

/* note that edge 0 is never used, because negative edge 
   nums are used for counterclockwise use of the edge in
   a face */
export class dedge_t {
	readonly v: number[] /* vertex numbers */

    constructor(view: DataView, offset: number) {
        this.v = [
            view.getUint16(offset+0*2, true),
            view.getUint16(offset+1*2, true)
        ]
    }

}
export const dedge_size = 2 * 2

export const MAXLIGHTMAPS = 4
export class dface_t {
    readonly planenum: number
    readonly side: number
    readonly firstedge: number      /* we must support > 64k edges */
    readonly numedges: number
    readonly texinfo: number
    /* lighting info */
	readonly styles: Uint8Array
    readonly lightofs: number       /* start of [numstyles*surfsize] samples */

    constructor(view: DataView, offset: number) {
        this.planenum = view.getUint16(offset, true)
        this.side = view.getInt16(offset + 2, true)
        this.firstedge = view.getInt32(offset + 2*2, true)
        this.numedges = view.getInt16(offset + 2*2+4, true)
        this.texinfo = view.getInt16(offset + 3*2+4, true)
        this.styles = new Uint8Array(view.buffer.slice(offset + 4*2+4, offset + 4*2+4 + MAXLIGHTMAPS))
        this.lightofs = view.getInt32(offset + 4 * 2 + 4 + MAXLIGHTMAPS, true)
    }

}
export const dface_size = 4 * 2 + 2 * 4 + MAXLIGHTMAPS

export class dleaf_t {
	readonly contents: number /* OR of all brushes (not needed?) */
    readonly cluster: number
    readonly area: number
    readonly mins: number[] /* for frustum culling */
    readonly maxs: number[]
    readonly firstleafface: number
    readonly numleaffaces: number
    readonly firstleafbrush: number
    readonly numleafbrushes: number

    constructor(view: DataView, offset: number) {
        this.contents = view.getInt32(offset, true)
        this.cluster = view.getInt16(offset+4, true)
        this.area = view.getInt16(offset+4+2, true)
        this.mins = [
            view.getInt16(offset+4+2*2, true),
            view.getInt16(offset+4+3*2, true),
            view.getInt16(offset+4+4*2, true)
        ]
        this.maxs = [
            view.getInt16(offset+4+5*2, true),
            view.getInt16(offset+4+6*2, true),
            view.getInt16(offset+4+7*2, true)
        ]
        this.firstleafface = view.getUint16(offset+4+8*2, true)
        this.numleaffaces = view.getUint16(offset+4+9*2, true)
        this.firstleafbrush = view.getUint16(offset+4+10*2, true)
        this.numleafbrushes = view.getUint16(offset+4+11*2, true)
    }

}
export const dleaf_size = 4 + 12 * 2

export class dbrushside_t {
	readonly planenum: number /* facing out of the leaf */
    readonly texinfo: number

    constructor(view: DataView, offset: number) {
        this.planenum = view.getUint16(offset+0*2, true)
        this.texinfo = view.getInt16(offset+1*2, true)
    }

}
export const dbrushside_size = 2 * 2

export class dbrush_t {
	readonly firstside: number
	readonly numsides: number
	readonly contents: number

    constructor(view: DataView, offset: number) {
        this.firstside = view.getInt32(offset+0*4, true)
        this.numsides = view.getInt32(offset+1*4, true)
        this.contents = view.getInt32(offset+2*4, true)
    }

}
export const dbrush_size = 3 * 4

export const ANGLE_UP = -1
export const ANGLE_DOWN = -2

/* the visibility lump consists of a header with a count, then 
 * byte offsets for the PVS and PHS of each cluster, then the raw 
 * compressed bit vectors */
export const DVIS_PVS = 0
export const DVIS_PHS = 1
export class dvis_t {
	readonly numclusters: number
    readonly bitofs: number[][]

    constructor(view: DataView, offset: number) {
        this.numclusters = view.getInt32(offset, true)
        let bitofs = new Array<number[]>(this.numclusters)
        for (let i = 0; i < this.numclusters; i++) {
            bitofs[i] = [
                view.getInt32(offset + (1 + 2 * i) * 4, true),
                view.getInt32(offset + (2 + 2 * i) * 4, true)
            ]
        }
        this.bitofs = bitofs
    }

}
// export const dedge_size = 2 * 2

/* each area has a list of portals that lead into other areas
 * when portals are closed, other areas may not be visible or
 * hearable even if the vis info says that it should be */
export class dareaportal_t {
	readonly portalnum: number
	readonly otherarea: number

    constructor(view: DataView, offset: number) {
        this.portalnum = view.getInt32(offset, true)
        this.otherarea = view.getInt32(offset+4, true)
    }

}
export const dareaportal_size = 2 * 4

export class darea_t {
	readonly numareaportals: number
	readonly firstareaportal: number

    constructor(view: DataView, offset: number) {
        this.numareaportals = view.getInt32(offset, true)
        this.firstareaportal = view.getInt32(offset+4, true)
    }

}
export const darea_size = 2 * 4
