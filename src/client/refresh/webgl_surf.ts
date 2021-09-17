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
 * Surface generation and drawing
 *
 * =======================================================================
 */
import { CONTENTS_SOLID, PLANE_X, PLANE_Y, PLANE_Z, SURF_FLOWING, SURF_SKY, SURF_TRANS33, SURF_TRANS66 } from "../../common/filesystem";
import * as SHARED from "../../common/shared"
import { entity_t } from "../ref";
import { webglimage_t, WebGL_Bind, WebGL_BindLightmap, webgl_textures } from "./webgl_image";
import { MAX_LIGHTMAPS_PER_SURFACE } from "./webgl_lightmap";
import { gl3state, GL3_ATTRIB_POSITION, GL3_ATTRIB_TEXCOORD, GL3_ATTRIB_COLOR, GL3_ATTRIB_LMTEXCOORD,
    GL3_ATTRIB_NORMAL, GL3_ATTRIB_LIGHTFLAGS, gl3_newrefdef, gl3_worldmodel, gl3_visframecount, gl_cull, gl3_framecount, currententity, SetCurrentEntity, SetCurrentModel, gl3ShaderInfo_t, frustum, gl3_oldviewcluster, gl3_oldviewcluster2, gl3_viewcluster, gl3_viewcluster2, r_novis, IncrGl3VisFramecount, SetOldViewCluster } from "./webgl_main";
import { gl3_3D_vtx_t, mleaf_or_mode, mleaf_t, mnode_t, msurface_t, mtexinfo_t, SURF_DRAWTURB, SURF_PLANEBACK, webglbrushmodel_t } from "./webgl_model";

export let c_visible_lightmaps = 0
export let c_visible_textures = 0
export let c_brush_polys = 0
let modelorg = [0,0,0]; /* relative to viewpoint */
let gl3_alpha_surfaces: msurface_t = null

const BACKFACE_EPSILON = 0.01

export function WebGL_SurfInit(gl: WebGL2RenderingContext) {
	// init the VAO and VBO for the standard vertexdata: 10 floats and 1 uint
	// (X, Y, Z), (S, T), (LMS, LMT), (normX, normY, normZ) ; lightFlags - last two groups for lightmap/dynlights

    gl3state.vao3D = gl.createVertexArray()
	gl3state.BindVAO(gl, gl3state.vao3D);

    gl3state.vbo3D = gl.createBuffer()
	gl3state.BindVBO(gl, gl3state.vbo3D);

	gl.enableVertexAttribArray(GL3_ATTRIB_POSITION);
	gl.vertexAttribPointer(GL3_ATTRIB_POSITION, 3, gl.FLOAT, false, 11 * 4, 0);

	gl.enableVertexAttribArray(GL3_ATTRIB_TEXCOORD);
	gl.vertexAttribPointer(GL3_ATTRIB_TEXCOORD, 2, gl.FLOAT, false, 11 * 4, 3 * 4);

	gl.enableVertexAttribArray(GL3_ATTRIB_LMTEXCOORD);
	gl.vertexAttribPointer(GL3_ATTRIB_LMTEXCOORD, 2, gl.FLOAT, false, 11 * 4, 5 * 4);
    
	gl.enableVertexAttribArray(GL3_ATTRIB_NORMAL);
	gl.vertexAttribPointer(GL3_ATTRIB_NORMAL, 3, gl.FLOAT, false, 11 * 4, 7 * 4);

	gl.enableVertexAttribArray(GL3_ATTRIB_LIGHTFLAGS);
	gl.vertexAttribIPointer(GL3_ATTRIB_LIGHTFLAGS, 1, gl.UNSIGNED_INT, 11 * 4, 10 * 4);


	// init VAO and VBO for model vertexdata: 9 floats
	// (X,Y,Z), (S,T), (R,G,B,A)

    gl3state.vaoAlias = gl.createVertexArray()
	gl3state.BindVAO(gl, gl3state.vaoAlias);

    gl3state.vboAlias = gl.createBuffer()
	gl3state.BindVBO(gl, gl3state.vboAlias);

	gl.enableVertexAttribArray(GL3_ATTRIB_POSITION);
	gl.vertexAttribPointer(GL3_ATTRIB_POSITION, 3, gl.FLOAT, false, 9*4, 0);

	gl.enableVertexAttribArray(GL3_ATTRIB_TEXCOORD);
	gl.vertexAttribPointer(GL3_ATTRIB_TEXCOORD, 2, gl.FLOAT, false, 9*4, 3*4);

	gl.enableVertexAttribArray(GL3_ATTRIB_COLOR);
	gl.vertexAttribPointer(GL3_ATTRIB_COLOR, 4, gl.FLOAT, false, 9*4, 5*4)

    gl3state.eboAlias = gl.createBuffer()

	// init VAO and VBO for particle vertexdata: 9 floats
	// (X,Y,Z), (point_size,distace_to_camera), (R,G,B,A)

    gl3state.vaoParticle = gl.createVertexArray()
	gl3state.BindVAO(gl, gl3state.vaoParticle);

    gl3state.vboParticle = gl.createBuffer()
	gl3state.BindVBO(gl, gl3state.vboParticle);

	gl.enableVertexAttribArray(GL3_ATTRIB_POSITION);
	gl.vertexAttribPointer(GL3_ATTRIB_POSITION, 3, gl.FLOAT, false, 9*4, 0);

	// TODO: maybe move point size and camera origin to UBO and calculate distance in vertex shader
	gl.enableVertexAttribArray(GL3_ATTRIB_TEXCOORD); // it's abused for (point_size, distance) here..
	gl.vertexAttribPointer(GL3_ATTRIB_TEXCOORD, 2, gl.FLOAT, false, 9*4, 3*4);

	gl.enableVertexAttribArray(GL3_ATTRIB_COLOR);
	gl.vertexAttribPointer(GL3_ATTRIB_COLOR, 4, gl.FLOAT, false, 9*4, 5*4);
}

/*
 * Returns true if the box is completely outside the frustom
 */
function CullBox(mins: number[], maxs: number[]): boolean {

	if (!gl_cull.bool) {
		return false;
	}

	for (let i = 0; i < 4; i++) {
		if (SHARED.BoxOnPlaneSide(mins, maxs, frustum[i]) == 2) {
			return true;
		}
	}

	return false;
}

/*
 * Returns the proper texture for a given time and base texture
 */
function TextureAnimation(tex: mtexinfo_t): webglimage_t {

	if (!tex.next) {
		return tex.image;
	}

	let c = currententity.frame % tex.numframes;

	while (c > 0) {
		tex = tex.next;
		c--;
	}

	return tex.image;
}

function SetLightFlags(surf: msurface_t) {
    let lightFlags = 0;
	if (surf.dlightframe == gl3_framecount) {
		lightFlags = surf.dlightbits;
	}

	for(let i=0; i<surf.polys.numverts; ++i) {
        surf.polys.vertice(i).lightFlags = lightFlags
	}
}


function WebGL_DrawGLPoly(gl: WebGL2RenderingContext, fa: msurface_t) {

    gl3state.BindVAO(gl, gl3state.vao3D)
    gl3state.BindVBO(gl, gl3state.vbo3D)

    let p = fa.polys

    gl.bufferData( gl.ARRAY_BUFFER,  p.data, gl.STREAM_DRAW );
    gl.drawArrays( gl.TRIANGLE_FAN, 0, p.numverts );

}

function UpdateLMscales(gl: WebGL2RenderingContext, lmScales: Float32Array, si: gl3ShaderInfo_t) {
	let hasChanged = false;

	for(let i=0; i<MAX_LIGHTMAPS_PER_SURFACE*4; ++i) {
		if(hasChanged) {
			si.lmScales[i] = lmScales[i];
		} else if(   si.lmScales[i] != lmScales[i] ) {
			si.lmScales[i] = lmScales[i];
			hasChanged = true;
		}
	}

	if (hasChanged) {
		gl.uniform4fv(si.uniLmScales, si.lmScales);
	}
}

function RenderBrushPoly(gl: WebGL2RenderingContext, fa: msurface_t) {

	c_brush_polys++;

	let image = TextureAnimation(fa.texinfo);

	if (fa.flags & SURF_DRAWTURB) {
		WebGL_Bind(gl, image.tex);

	// 	GL3_EmitWaterPolys(fa);

		return;
	}
	else
	{
		WebGL_Bind(gl, image.tex);
	}

    let lmScales = new Float32Array(MAX_LIGHTMAPS_PER_SURFACE * 4)
    for (let i = 0; i < 4; i++) {
        lmScales[i] = 1.0
    }

	WebGL_BindLightmap(gl, fa.lightmaptexturenum);

	// Any dynamic lights on this surface?
	for (let map = 0; map < MAX_LIGHTMAPS_PER_SURFACE && fa.styles[map] != 255; map++) {
		lmScales[map*4+0] = gl3_newrefdef.lightstyles[fa.styles[map]].rgb[0];
		lmScales[map*4+1] = gl3_newrefdef.lightstyles[fa.styles[map]].rgb[1];
		lmScales[map*4+2] = gl3_newrefdef.lightstyles[fa.styles[map]].rgb[2];
		lmScales[map*4+3] = 1.0;
	}

	if (fa.texinfo.flags & SURF_FLOWING)
	{
		gl3state.UseProgram(gl, gl3state.si3DlmFlow.shaderProgram);
		UpdateLMscales(gl, lmScales, gl3state.si3DlmFlow);
	// 	GL3_DrawGLFlowingPoly(fa);
	}
	else
	{
        gl3state.UseProgram(gl, gl3state.si3Dlm.shaderProgram)
		UpdateLMscales(gl, lmScales, gl3state.si3Dlm);
		WebGL_DrawGLPoly(gl, fa);
	}

	// Note: lightmap chains are gone, lightmaps are rendered together with normal texture in one pass
}


function DrawTextureChains(gl: WebGL2RenderingContext) {

	c_visible_textures = 0;

    for (let i in webgl_textures) {
        let image = webgl_textures[i]
		if (!image.registration_sequence) {
			continue;
		}

		let s = image.texturechain;
		if (!s) {
			continue;
		}

		c_visible_textures++;

		for ( ; s; s = s.texturechain) {
			SetLightFlags(s)
			RenderBrushPoly(gl, s);
		}

		image.texturechain = null
	}

	// TODO: maybe one loop for normal faces and one for SURF_DRAWTURB ???
}


function RecursiveWorldNode(model: webglbrushmodel_t, anode: mleaf_or_mode) {

	if (anode.contents == CONTENTS_SOLID) {
		return; /* solid */
	}

	if (anode.visframe != gl3_visframecount) {
		return;
	}

	if (CullBox(anode.minmaxs, anode.minmaxs.slice(3))) {
		return;
	}

	/* if a leaf node, draw stuff */
	if (anode.contents != -1) {
		let leaf = anode as mleaf_t

		/* check for door connected areas */
		if (gl3_newrefdef.areabits != null) {
			if (!(gl3_newrefdef.areabits[leaf.area >> 3] & (1 << (leaf.area & 7)))) {
				return; /* not visible */
			}
		}

		let mark = leaf.firstmarksurface;
		let c = leaf.nummarksurfaces;

		for (let c = 0; c < leaf.nummarksurfaces; c++){
            model.marksurfaces[mark + c].visframe = gl3_framecount 
		}

		return;
	}

	/* node is just a decision point, so go down the apropriate
	   sides find which side of the node we are on */
    let node  = anode as mnode_t
	let plane = node.plane;

    let dot: number
	switch (plane.type) {
		case PLANE_X:
			dot = modelorg[0] - plane.dist;
			break;
		case PLANE_Y:
			dot = modelorg[1] - plane.dist;
			break;
		case PLANE_Z:
			dot = modelorg[2] - plane.dist;
			break;
		default:
			dot = SHARED.DotProduct(modelorg, plane.normal) - plane.dist;
			break;
	}

    let side: number
    let sidebit: number
	if (dot >= 0) {
		side = 0;
		sidebit = 0;
	} else {
		side = 1;
		sidebit = SURF_PLANEBACK
	}

	/* recurse down the children, front side first */
	RecursiveWorldNode(model, node.children[side]);

	/* draw stuff */
    for (let c = 0;  c < node.numsurfaces; c++) {
        let surf = gl3_worldmodel.surfaces[node.firstsurface + c];
		if (surf.visframe != gl3_framecount) {
			continue;
		}

		if ((surf.flags & SURF_PLANEBACK) != sidebit) {
			continue; /* wrong side */
		}

		if (surf.texinfo.flags & SURF_SKY)
		{
			/* just adds to visible sky bounds */
// 			GL3_AddSkySurface(surf);
		}
		else if (surf.texinfo.flags & (SURF_TRANS33 | SURF_TRANS66))
		{
			/* add to the translucent chain */
			surf.texturechain = gl3_alpha_surfaces;
			gl3_alpha_surfaces = surf;
			gl3_alpha_surfaces.texinfo.image = TextureAnimation(surf.texinfo);
		}
		else
		{
			// calling RenderLightmappedPoly() here probably isn't optimal, rendering everything
			// through texturechains should be faster, because far less glBindTexture() is needed
			// (and it might allow batching the drawcalls of surfaces with the same texture)
            /* the polygon is visible, so add it to the texture sorted chain */
            let image = TextureAnimation(surf.texinfo);
            surf.texturechain = image.texturechain;
            image.texturechain = surf;
		}
	}

	/* recurse down the back side */
	RecursiveWorldNode(model, node.children[side ^ 1]);
}


export function WebGL_DrawWorld(gl: WebGL2RenderingContext) {
	// entity_t ent;

	// if (!r_drawworld->value) {
	// 	return;
	// }

    c_brush_polys = 0
	if (gl3_newrefdef.rdflags & SHARED.RDF_NOWORLDMODEL)  {
		return;
	}

    SetCurrentModel(gl3_worldmodel)

	SHARED.VectorCopy(gl3_newrefdef.vieworg, modelorg);

	/* auto cycle the world frame for texture animation */
    let ent = new entity_t()
	ent.frame = ~~(gl3_newrefdef.time * 2);
    SetCurrentEntity(ent)

	gl3state.currenttexture = -1;

	// GL3_ClearSkyBox();
	RecursiveWorldNode(gl3_worldmodel, gl3_worldmodel.nodes[0])
	DrawTextureChains(gl);
	// GL3_DrawSkyBox();
	// DrawTriangleOutlines();

	SetCurrentEntity(null)
}

/*
 * Mark the leaves and nodes that are
 * in the PVS for the current cluster
 */
export function WebGL_MarkLeaves() {
	// byte *vis;
	// YQ2_ALIGNAS_TYPE(int) byte fatvis[MAX_MAP_LEAFS / 8];
	// mnode_t *node;
	// int i, c;
	// mleaf_t *leaf;
	// int cluster;

	if ((gl3_oldviewcluster == gl3_viewcluster) &&
		(gl3_oldviewcluster2 == gl3_viewcluster2) &&
		!r_novis.bool &&
		(gl3_viewcluster != -1))
	{
		return;
	}

	// /* development aid to let you run around
	//    and see exactly where the pvs ends */
	// if (r_lockpvs->value)
	// {
	// 	return;
	// }

    IncrGl3VisFramecount()
    SetOldViewCluster(gl3_viewcluster, gl3_viewcluster2)

	// if (r_novis.bool || (gl3_viewcluster == -1) || !gl3_worldmodel.vis)
	{
		/* mark everything */
		for (let i = 0; i < gl3_worldmodel.numleafs; i++) {
			gl3_worldmodel.leafs[i].visframe = gl3_visframecount;
		}

		for (let i = 0; i < gl3_worldmodel.nodes.length; i++) {
			gl3_worldmodel.nodes[i].visframe = gl3_visframecount;
		}

		return;
	}

	// vis = GL3_Mod_ClusterPVS(gl3_viewcluster, gl3_worldmodel);

	// /* may have to combine two clusters because of solid water boundaries */
	// if (gl3_viewcluster2 != gl3_viewcluster)
	// {
	// 	memcpy(fatvis, vis, (gl3_worldmodel->numleafs + 7) / 8);
	// 	vis = GL3_Mod_ClusterPVS(gl3_viewcluster2, gl3_worldmodel);
	// 	c = (gl3_worldmodel->numleafs + 31) / 32;

	// 	for (i = 0; i < c; i++)
	// 	{
	// 		((int *)fatvis)[i] |= ((int *)vis)[i];
	// 	}

	// 	vis = fatvis;
	// }

	// for (i = 0, leaf = gl3_worldmodel->leafs;
	// 	 i < gl3_worldmodel->numleafs;
	// 	 i++, leaf++)
	// {
	// 	cluster = leaf->cluster;

	// 	if (cluster == -1)
	// 	{
	// 		continue;
	// 	}

	// 	if (vis[cluster >> 3] & (1 << (cluster & 7)))
	// 	{
	// 		node = (mnode_t *)leaf;

	// 		do
	// 		{
	// 			if (node->visframe == gl3_visframecount)
	// 			{
	// 				break;
	// 			}

	// 			node->visframe = gl3_visframecount;
	// 			node = node->parent;
	// 		}
	// 		while (node);
	// 	}
	// }
}

