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
 * Mesh handling
 *
 * =======================================================================
 */
import { Com_DPrintf } from "../../common/clientserver";
import { dmdl_t, dtrivertx_t, MAX_MD2SKINS, MAX_VERTS } from "../../common/filesystem";
import * as SHARED from "../../common/shared"
import { entity_t } from "../ref";
import { webglimage_t, WebGL_Bind } from "./webgl_image";
import { frustum, gl3depthmax, gl3depthmin, gl3state, gl3_newrefdef, r_farsee, r_gunfov, WebGL_MYgluPerspective, WebGL_RotateForEntity } from "./webgl_main";
import { gl3_notexture } from "./webgl_misc";
import { gl3_alias_vtx_t, webglaliasmodel_t, webglbrushmodel_t } from "./webgl_model";
import { WebGL_UpdateUBO3D } from "./webgl_shaders";

let s_lerped: number[][] = null

const SHADEDOT_QUANT = 16


function LerpVerts(powerUpEffect: boolean, nverts: number, v: dtrivertx_t[], ov: dtrivertx_t[],
		verts: dtrivertx_t[], lerp: number[][], move: number[], frontv: number[], backv: number[])
{
	// if (powerUpEffect) {
	// 	for (i = 0; i < nverts; i++, v++, ov++, lerp += 4)
	// 	{
	// 		float *normal = r_avertexnormals[verts[i].lightnormalindex];

	// 		lerp[0] = move[0] + ov->v[0] * backv[0] + v->v[0] * frontv[0] +
	// 				  normal[0] * POWERSUIT_SCALE;
	// 		lerp[1] = move[1] + ov->v[1] * backv[1] + v->v[1] * frontv[1] +
	// 				  normal[1] * POWERSUIT_SCALE;
	// 		lerp[2] = move[2] + ov->v[2] * backv[2] + v->v[2] * frontv[2] +
	// 				  normal[2] * POWERSUIT_SCALE;
	// 	}
	// }
	// else
	// {
        for (let i = 0; i < nverts; i++) {
            lerp[i][0] = move[0] + ov[i].v[0] * backv[0] + v[i].v[0] * frontv[0];
            lerp[i][1] = move[1] + ov[i].v[1] * backv[1] + v[i].v[1] * frontv[1];
            lerp[i][2] = move[2] + ov[i].v[2] * backv[2] + v[i].v[2] * frontv[2];
        }
	// }
}

/*
 * Interpolates between two frames and origins
 */
function DrawAliasFrameLerp(gl: WebGL2RenderingContext, model: webglaliasmodel_t, entity: entity_t, shadelight: number[])
{
	let backlerp = entity.backlerp;
	let frontlerp = 1.0 - backlerp;
	// draw without texture? used for quad damage effect etc, I think
	const colorOnly = 0 != (entity.flags &
			(SHARED.RF_SHELL_RED | SHARED.RF_SHELL_GREEN | SHARED.RF_SHELL_BLUE | SHARED.RF_SHELL_DOUBLE |
                SHARED.RF_SHELL_HALF_DAM));

	// TODO: maybe we could somehow store the non-rotated normal and do the dot in shader?
	const shadedots = r_avertexnormal_dots[(~~(entity.angles[1] * (SHADEDOT_QUANT / 360.0))) & (SHADEDOT_QUANT - 1)];

    let frame = model.frames[entity.frame]
	let verts = frame.verts;

    let oldframe = model.frames[entity.oldframe]
	let ov = oldframe.verts;

    let alpha = 1
	if (entity.flags & SHARED.RF_TRANSLUCENT) {
		alpha = entity.alpha * 0.666;
	}

	if (colorOnly)
	{
        gl3state.UseProgram(gl, gl3state.si3DaliasColor.shaderProgram);
	}
	else
	{
		gl3state.UseProgram(gl, gl3state.si3Dalias.shaderProgram);
	}

	/* move should be the delta back to the previous frame * backlerp */
    let delta = [0,0,0]
	SHARED.VectorSubtract(entity.oldorigin, entity.origin, delta);
    let vectors = [
        [0,0,0],
        [0,0,0],
        [0,0,0]
    ]
	SHARED.AngleVectors(entity.angles, vectors[0], vectors[1], vectors[2]);

	let move = [
        SHARED.DotProduct(delta, vectors[0]), /* forward */
	    -SHARED.DotProduct(delta, vectors[1]), /* left */
	    SHARED.DotProduct(delta, vectors[2]) /* up */
    ]

	SHARED.VectorAdd(move, oldframe.translate, move);

    let frontv = [0,0,0]
    let backv = [0,0,0]
	for (let i = 0; i < 3; i++)
	{
		move[i] = backlerp * move[i] + frontlerp * frame.translate[i];

		frontv[i] = frontlerp * frame.scale[i];
		backv[i] = backlerp * oldframe.scale[i];
	}

    // Count indices and vertices
    let order = 0
    let vtxCount = 0
    let idxCount = 0
	while (order < model.glcmds.length) {
		let count = model.glcmds[order++];
		if (!count) {
			break; /* done */
		}
        if (count < 0) {
            count = -count
        }
        order += 3 * count
        vtxCount += count
        idxCount += 3*(count - 2)
    }

	// lerp = s_lerped[0];
    if (s_lerped == null) {
        s_lerped = new Array<number[]>(MAX_VERTS)
        for (let i = 0; i < MAX_VERTS; i++) {
            s_lerped[i] = [0,0,0,0]
        }
    }

	LerpVerts(colorOnly, model.header.num_xyz, verts, ov, verts, s_lerped, move, frontv, backv);

	// all the triangle fans and triangle strips of this model will be converted to
	// just triangles: the vertices stay the same and are batched in vtxBuf,
	// but idxBuf will contain indices to draw them all as GL_TRIANGLE
	// this way there's only one draw call (and two glBufferData() calls)
	// instead of (at least) dozens. *greatly* improves performance.

	// so first clear out the data from last call to this function
	// (the buffers are static global so we don't have malloc()/free() for each rendered model)

    let vtxBuf = new Float32Array(vtxCount * 9)
    let idxBuf = new Uint16Array(idxCount)
    order = 0
    let vtxCounter = 0
    let idxCounter = 0
	while (true)
	{
		let nextVtxIdx = vtxCounter;

		/* get the vertex count and primitive type */
		let count = model.glcmds[order++];

		if (!count) {
			break; /* done */
		}

        let type = gl.TRIANGLE_STRIP;
		if (count < 0)
		{
			count = -count;

			type = gl.TRIANGLE_FAN;
		}

		if (colorOnly)
		{
			for(let i=0; i<count; ++i)
			{
                let cur = new gl3_alias_vtx_t(vtxBuf, 9 * vtxCounter);
				let index_xyz = model.glcmds[order+2];
				order += 3;
                vtxCounter++;

                cur.pos = s_lerped[index_xyz]
                cur.color3 = shadelight
                cur.alpha = alpha
			}
		}
		else
		{
			for(let i=0; i<count; ++i)
			{
                let cur = new gl3_alias_vtx_t(vtxBuf, 9 * vtxCounter);
                /* texture coordinates come from the draw list */
                let bfr = new Float32Array( model.glcmds.buffer, order * 4)
				cur.texCoord =[bfr[0], bfr[1]]
                let index_xyz = model.glcmds[order+2];

				order += 3;
                vtxCounter++;

				/* normals and vertexes come from the frame list */
				// shadedots is set above according to rotation (around Z axis I think)
				// to one of 16 (SHADEDOT_QUANT) presets in r_avertexnormal_dots
				let l = shadedots[verts[index_xyz].lightnormalindex];

                cur.pos = s_lerped[index_xyz]
                cur.color3 = [shadelight[0] * l, shadelight[1] * l, shadelight[2] * l]
                cur.alpha = alpha
			}
		}

		// translate triangle fan/strip to just triangle indices
		if (type == gl.TRIANGLE_FAN)
		{
			for(let i=1; i < count-1; ++i)
			{
                idxBuf[idxCounter++] = nextVtxIdx;
                idxBuf[idxCounter++] = nextVtxIdx+i;
                idxBuf[idxCounter++] = nextVtxIdx+i+1;
			}
		}
		else // triangle strip
		{
			let i = 0
			for(i=1; i < count-2; i+=2)
			{
				// add two triangles at once, because the vertex order is different
				// for odd vs even triangles

                idxBuf[idxCounter++] = nextVtxIdx+i-1;
                idxBuf[idxCounter++] = nextVtxIdx+i;
                idxBuf[idxCounter++] = nextVtxIdx+i+1;

                idxBuf[idxCounter++] = nextVtxIdx+i;
                idxBuf[idxCounter++] = nextVtxIdx+i+2;
                idxBuf[idxCounter++] = nextVtxIdx+i+1;
			}
			// add remaining triangle, if any
			if(i < count-1)
			{
                idxBuf[idxCounter++] = nextVtxIdx+i-1;
                idxBuf[idxCounter++] = nextVtxIdx+i;
                idxBuf[idxCounter++] = nextVtxIdx+i+1;
			}
		}
	}

    gl3state.BindVAO(gl, gl3state.vaoAlias);
    gl3state.BindVBO(gl, gl3state.vboAlias);

	gl.bufferData(gl.ARRAY_BUFFER, vtxBuf, gl.STREAM_DRAW);
	gl3state.BindEBO(gl, gl3state.eboAlias);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxBuf, gl.STREAM_DRAW);
	gl.drawElements(gl.TRIANGLES, idxCounter, gl.UNSIGNED_SHORT, 0);
}

function CullAliasModel(bbox: number[][], e: entity_t): boolean {

    let model = e.model as webglaliasmodel_t
    let paliashdr = model.header

	if ((e.frame >= paliashdr.num_frames) || (e.frame < 0))
	{
		Com_DPrintf( `R_CullAliasModel ${model.name}: no such frame ${e.frame}\n`);
		e.frame = 0;
	}

	if ((e.oldframe >= paliashdr.num_frames) || (e.oldframe < 0))
	{
		Com_DPrintf( `R_CullAliasModel ${model.name}: no such oldframe ${e.oldframe}\n`);
		e.oldframe = 0;
	}

    let pframe = model.frames[e.frame];
    let poldframe = model.frames[e.oldframe];

	/* compute axially aligned mins and maxs */
    let mins = [0,0,0]
    let maxs = [0,0,0]
	if (pframe == poldframe)
	{
		for (let i = 0; i < 3; i++)
		{
			mins[i] = pframe.translate[i];
			maxs[i] = mins[i] + pframe.scale[i] * 255;
		}
	}
	else
	{
        let thismins = [0,0,0]
        let thismaxs = [0,0,0]
        let oldmins = [0,0,0]
        let oldmaxs = [0,0,0]
        for (let i = 0; i < 3; i++)
		{
			thismins[i] = pframe.translate[i];
			thismaxs[i] = thismins[i] + pframe.scale[i] * 255;

			oldmins[i] = poldframe.translate[i];
			oldmaxs[i] = oldmins[i] + poldframe.scale[i] * 255;

			if (thismins[i] < oldmins[i])
			{
				mins[i] = thismins[i];
			}
			else
			{
				mins[i] = oldmins[i];
			}

			if (thismaxs[i] > oldmaxs[i])
			{
				maxs[i] = thismaxs[i];
			}
			else
			{
				maxs[i] = oldmaxs[i];
			}
		}
	}

	/* compute a full bounding box */
	for (let i = 0; i < 8; i++)
	{
		let tmp = [0,0,0];

		if (i & 1)
		{
			tmp[0] = mins[0];
		}
		else
		{
			tmp[0] = maxs[0];
		}

		if (i & 2)
		{
			tmp[1] = mins[1];
		}
		else
		{
			tmp[1] = maxs[1];
		}

		if (i & 4)
		{
			tmp[2] = mins[2];
		}
		else
		{
			tmp[2] = maxs[2];
		}

		SHARED.VectorCopy(tmp, bbox[i]);
	}

	/* rotate the bounding box */
    let angles = [0,0,0]
	SHARED.VectorCopy(e.angles, angles);
	angles[SHARED.YAW] = -angles[SHARED.YAW];
    let vectors = [
        [0,0,0],
        [0,0,0],
        [0,0,0]
    ]
	SHARED.AngleVectors(angles, vectors[0], vectors[1], vectors[2]);

	for (let i = 0; i < 8; i++)
	{
		let tmp = [0,0,0]

		SHARED.VectorCopy(bbox[i], tmp);

		bbox[i][0] = SHARED.DotProduct(vectors[0], tmp);
		bbox[i][1] = -SHARED.DotProduct(vectors[1], tmp);
		bbox[i][2] = SHARED.DotProduct(vectors[2], tmp);

		SHARED.VectorAdd(e.origin, bbox[i], bbox[i]);
	}

    let aggregatemask = 0xFFFFFFFF
	for (let p = 0; p < 8; p++)
	{
		let mask = 0;

		for (let f = 0; f < 4; f++)
		{
			let dp = SHARED.DotProduct(frustum[f].normal, bbox[p]);

			if ((dp - frustum[f].dist) < 0)
			{
				mask |= (1 << f);
			}
		}

		aggregatemask &= mask;
	}

	if (aggregatemask)
	{
		return true;
	}

	return false;
}


export function WebGL_DrawAliasModel(gl: WebGL2RenderingContext, entity: entity_t) {

    let bbox = new Array<number[]>(8)
    for (let i = 0; i < 8; i++) {
        bbox[i] = [0,0,0]
    }
	if (!(entity.flags & SHARED.RF_WEAPONMODEL))
	{
		if (CullAliasModel(bbox, entity))
		{
			return;
		}
	}

	if (entity.flags & SHARED.RF_WEAPONMODEL)
	{
// 		if (gl_lefthand->value == 2)
// 		{
// 			return;
// 		}
	}

	let model = entity.model as webglaliasmodel_t;
    let paliashdr = model.header

	/* get lighting information */
    let shadelight = [0,0,0]
	if (entity.flags &
		(SHARED.RF_SHELL_HALF_DAM | SHARED.RF_SHELL_GREEN | SHARED.RF_SHELL_RED |
            SHARED.RF_SHELL_BLUE | SHARED.RF_SHELL_DOUBLE))
	{

		if (entity.flags & SHARED.RF_SHELL_HALF_DAM)
		{
			shadelight[0] = 0.56;
			shadelight[1] = 0.59;
			shadelight[2] = 0.45;
		}

		if (entity.flags & SHARED.RF_SHELL_DOUBLE)
		{
			shadelight[0] = 0.9;
			shadelight[1] = 0.7;
		}

		if (entity.flags & SHARED.RF_SHELL_RED)
		{
			shadelight[0] = 1.0;
		}

		if (entity.flags & SHARED.RF_SHELL_GREEN)
		{
			shadelight[1] = 1.0;
		}

		if (entity.flags & SHARED.RF_SHELL_BLUE)
		{
			shadelight[2] = 1.0;
		}
	}
	else if (entity.flags & SHARED.RF_FULLBRIGHT)
	{
		for (let i = 0; i < 3; i++)
		{
			shadelight[i] = 1.0;
		}
	}
	else
	{
		for (let i = 0; i < 3; i++)
		{
			shadelight[i] = 1.0;
		}
// 		GL3_LightPoint(entity->origin, shadelight);

// 		/* player lighting hack for communication back to server */
// 		if (entity->flags & RF_WEAPONMODEL)
// 		{
// 			/* pick the greatest component, which should be
// 			   the same as the mono value returned by software */
// 			if (shadelight[0] > shadelight[1])
// 			{
// 				if (shadelight[0] > shadelight[2])
// 				{
// 					r_lightlevel->value = 150 * shadelight[0];
// 				}
// 				else
// 				{
// 					r_lightlevel->value = 150 * shadelight[2];
// 				}
// 			}
// 			else
// 			{
// 				if (shadelight[1] > shadelight[2])
// 				{
// 					r_lightlevel->value = 150 * shadelight[1];
// 				}
// 				else
// 				{
// 					r_lightlevel->value = 150 * shadelight[2];
// 				}
// 			}
// 		}
	}

// 	if (entity->flags & RF_MINLIGHT)
// 	{
// 		for (i = 0; i < 3; i++)
// 		{
// 			if (shadelight[i] > 0.1)
// 			{
// 				break;
// 			}
// 		}

// 		if (i == 3)
// 		{
// 			shadelight[0] = 0.1;
// 			shadelight[1] = 0.1;
// 			shadelight[2] = 0.1;
// 		}
// 	}

// 	if (entity->flags & RF_GLOW)
// 	{
// 		/* bonus items will pulse with time */
// 		float scale;
// 		float min;

// 		scale = 0.1 * sin(gl3_newrefdef.time * 7);

// 		for (i = 0; i < 3; i++)
// 		{
// 			min = shadelight[i] * 0.8;
// 			shadelight[i] += scale;

// 			if (shadelight[i] < min)
// 			{
// 				shadelight[i] = min;
// 			}
// 		}
// 	}

	// Note: gl_overbrightbits are now applied in shader.

// 	/* ir goggles color override */
// 	if ((gl3_newrefdef.rdflags & RDF_IRGOGGLES) && (entity->flags & RF_IR_VISIBLE))
// 	{
// 		shadelight[0] = 1.0;
// 		shadelight[1] = 0.0;
// 		shadelight[2] = 0.0;
// 	}

	// let an = entity.angles[1] / 180 * Math.PI;
// 	shadevector[0] = cos(-an);
// 	shadevector[1] = sin(-an);
// 	shadevector[2] = 1;
// 	VectorNormalize(shadevector);

	/* locate the proper data */
// 	c_alias_polys += paliashdr->num_tris;

    let origProjMat: Float32Array

	/* draw all the triangles */
	if (entity.flags & SHARED.RF_DEPTHHACK)
	{
		/* hack the depth range to prevent view model from poking into walls */
		gl.depthRange(gl3depthmin, gl3depthmin + 0.3 * (gl3depthmax - gl3depthmin));
	}

	if (entity.flags & SHARED.RF_WEAPONMODEL)
	{
		origProjMat = gl3state.uni3DData.transProjMat4;

		// render weapon with a different FOV (r_gunfov) so it's not distorted at high view FOV
		let screenaspect = gl3_newrefdef.width / gl3_newrefdef.height;
		let dist = (!r_farsee.bool) ? 4096.0 : 8192.0;

		if (r_gunfov.float < 0)
		{
			gl3state.uni3DData.transProjMat4 = WebGL_MYgluPerspective(gl3_newrefdef.fov_y, screenaspect, 4, dist);
		}
		else
		{
			gl3state.uni3DData.transProjMat4 = WebGL_MYgluPerspective(r_gunfov.float, screenaspect, 4, dist);
		}

// 		if(gl_lefthand.value == 1.0F)
// 		{
// 			// to mirror gun so it's rendered left-handed, just invert X-axis column
// 			// of projection matrix
// 			for(int i=0; i<4; ++i)
// 			{
// 				gl3state.uni3DData.transProjMat4.Elements[0][i] = -gl3state.uni3DData.transProjMat4.Elements[0][i];
// 			}
// 			//GL3_UpdateUBO3D(); Note: GL3_RotateForEntity() will call this,no need to do it twice before drawing

// 			glCullFace(GL_BACK);
// 		}
	}


// 	//glPushMatrix();
	let origModelMat = gl3state.uni3DData.transModelMat4;

	entity.angles[SHARED.PITCH] = -entity.angles[SHARED.PITCH];
	WebGL_RotateForEntity(gl, entity);
	entity.angles[SHARED.PITCH] = -entity.angles[SHARED.PITCH];


	/* select skin */
    let skino: object 
	if (entity.skin) {
		skino = entity.skin; /* custom player skin */
	} else {
		if (entity.skinnum >= MAX_MD2SKINS) {
			skino = model.skins[0];
		} else {
			skino = model.skins[entity.skinnum];
			if (!skino) {
				skino = model.skins[0];
			}
		}
	}

	if (!skino) {
		skino = gl3_notexture; /* fallback... */
	}

    let skin = skino as webglimage_t
	WebGL_Bind(gl, skin.tex);

	if (entity.flags & SHARED.RF_TRANSLUCENT)
	{
		gl.enable(gl.BLEND);
	}


	if ((entity.frame >= paliashdr.num_frames) ||
		(entity.frame < 0))
	{
		Com_DPrintf( `R_DrawAliasModel ${model.name}: no such frame ${entity.frame}\n`);
		entity.frame = 0;
		entity.oldframe = 0;
	}

	if ((entity.oldframe >= paliashdr.num_frames) ||
		(entity.oldframe < 0))
	{
		Com_DPrintf( `R_DrawAliasModel ${model.name}: no such oldframe ${entity.oldframe}\n`);
		entity.frame = 0;
		entity.oldframe = 0;
	}

	DrawAliasFrameLerp(gl, model, entity, shadelight);

	//glPopMatrix();
	gl3state.uni3DData.transModelMat4 = origModelMat;
	WebGL_UpdateUBO3D(gl);

	if (entity.flags & SHARED.RF_WEAPONMODEL)
	{
		gl3state.uni3DData.transProjMat4 = origProjMat;
		WebGL_UpdateUBO3D(gl);
// 		if(gl_lefthand->value == 1.0F)
// 			glCullFace(GL_FRONT);
	}

	if (entity.flags & SHARED.RF_TRANSLUCENT)
	{
		gl.disable(gl.BLEND);
	}

	if (entity.flags & SHARED.RF_DEPTHHACK)
	{
		gl.depthRange(gl3depthmin, gl3depthmax);
	}

// 	if (gl_shadows->value && gl3config.stencil && !(entity->flags & (RF_TRANSLUCENT | RF_WEAPONMODEL | RF_NOSHADOW)))
// 	{
// 		gl3_shadowinfo_t si = {0};
// 		VectorCopy(lightspot, si.lightspot);
// 		VectorCopy(shadevector, si.shadevector);
// 		si.paliashdr = paliashdr;
// 		si.entity = entity;

// 		da_push(shadowModels, si);
// 	}
}


/* precalculated dot products for quantized angles */
const r_avertexnormal_dots = [
	[ 1.23, 1.30, 1.47, 1.35, 1.56, 1.71, 1.37, 1.38, 1.59, 1.60, 1.79, 1.97, 1.88, 1.92, 1.79, 1.02, 0.93, 1.07, 0.82, 0.87,
        0.88, 0.94, 0.96, 1.14, 1.11, 0.82, 0.83, 0.89, 0.89, 0.86, 0.94, 0.91, 1.00, 1.21, 0.98, 1.48, 1.30, 1.57, 0.96, 1.07,
        1.14, 1.60, 1.61, 1.40, 1.37, 1.72, 1.78, 1.79, 1.93, 1.99, 1.90, 1.68, 1.71, 1.86, 1.60, 1.68, 1.78, 1.86, 1.93, 1.99,
        1.97, 1.44, 1.22, 1.49, 0.93, 0.99, 0.99, 1.23, 1.22, 1.44, 1.49, 0.89, 0.89, 0.97, 0.91, 0.98, 1.19, 0.82, 0.76, 0.82,
        0.71, 0.72, 0.73, 0.76, 0.79, 0.86, 0.83, 0.72, 0.76, 0.76, 0.89, 0.82, 0.89, 0.82, 0.89, 0.91, 0.83, 0.96, 1.14, 0.97,
        1.40, 1.19, 0.98, 0.94, 1.00, 1.07, 1.37, 1.21, 1.48, 1.30, 1.57, 1.61, 1.37, 0.86, 0.83, 0.91, 0.82, 0.82, 0.88, 0.89,
        0.96, 1.14, 0.98, 0.87, 0.93, 0.94, 1.02, 1.30, 1.07, 1.35, 1.38, 1.11, 1.56, 1.92, 1.79, 1.79, 1.59, 1.60, 1.72, 1.90,
        1.79, 0.80, 0.85, 0.79, 0.93, 0.80, 0.85, 0.77, 0.74, 0.72, 0.77, 0.74, 0.72, 0.70, 0.70, 0.71, 0.76, 0.73, 0.79, 0.79,
        0.73, 0.76, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.26, 1.26, 1.48, 1.23, 1.50, 1.71, 1.14, 1.19, 1.38, 1.46, 1.64, 1.94, 1.87, 1.84, 1.71, 1.02, 0.92, 1.00, 0.79, 0.85,
        0.84, 0.91, 0.90, 0.98, 0.99, 0.77, 0.77, 0.83, 0.82, 0.79, 0.86, 0.84, 0.92, 0.99, 0.91, 1.24, 1.03, 1.33, 0.88, 0.94,
        0.97, 1.41, 1.39, 1.18, 1.11, 1.51, 1.61, 1.59, 1.80, 1.91, 1.76, 1.54, 1.65, 1.76, 1.70, 1.70, 1.85, 1.85, 1.97, 1.99,
        1.93, 1.28, 1.09, 1.39, 0.92, 0.97, 0.99, 1.18, 1.26, 1.52, 1.48, 0.83, 0.85, 0.90, 0.88, 0.93, 1.00, 0.77, 0.73, 0.78,
        0.72, 0.71, 0.74, 0.75, 0.79, 0.86, 0.81, 0.75, 0.81, 0.79, 0.96, 0.88, 0.94, 0.86, 0.93, 0.92, 0.85, 1.08, 1.33, 1.05,
        1.55, 1.31, 1.01, 1.05, 1.27, 1.31, 1.60, 1.47, 1.70, 1.54, 1.76, 1.76, 1.57, 0.93, 0.90, 0.99, 0.88, 0.88, 0.95, 0.97,
        1.11, 1.39, 1.20, 0.92, 0.97, 1.01, 1.10, 1.39, 1.22, 1.51, 1.58, 1.32, 1.64, 1.97, 1.85, 1.91, 1.77, 1.74, 1.88, 1.99,
        1.91, 0.79, 0.86, 0.80, 0.94, 0.84, 0.88, 0.74, 0.74, 0.71, 0.82, 0.77, 0.76, 0.70, 0.73, 0.72, 0.73, 0.70, 0.74, 0.85,
        0.77, 0.82, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.34, 1.27, 1.53, 1.17, 1.46, 1.71, 0.98, 1.05, 1.20, 1.34, 1.48, 1.86, 1.82, 1.71, 1.62, 1.09, 0.94, 0.99, 0.79, 0.85,
        0.82, 0.90, 0.87, 0.93, 0.96, 0.76, 0.74, 0.79, 0.76, 0.74, 0.79, 0.78, 0.85, 0.92, 0.85, 1.00, 0.93, 1.06, 0.81, 0.86,
        0.89, 1.16, 1.12, 0.97, 0.95, 1.28, 1.38, 1.35, 1.60, 1.77, 1.57, 1.33, 1.50, 1.58, 1.69, 1.63, 1.82, 1.74, 1.91, 1.92,
        1.80, 1.04, 0.97, 1.21, 0.90, 0.93, 0.97, 1.05, 1.21, 1.48, 1.37, 0.77, 0.80, 0.84, 0.85, 0.88, 0.92, 0.73, 0.71, 0.74,
        0.74, 0.71, 0.75, 0.73, 0.79, 0.84, 0.78, 0.79, 0.86, 0.81, 1.05, 0.94, 0.99, 0.90, 0.95, 0.92, 0.86, 1.24, 1.44, 1.14,
        1.59, 1.34, 1.02, 1.27, 1.50, 1.49, 1.80, 1.69, 1.86, 1.72, 1.87, 1.80, 1.69, 1.00, 0.98, 1.23, 0.95, 0.96, 1.09, 1.16,
        1.37, 1.63, 1.46, 0.99, 1.10, 1.25, 1.24, 1.51, 1.41, 1.67, 1.77, 1.55, 1.72, 1.95, 1.89, 1.98, 1.91, 1.86, 1.97, 1.99,
        1.94, 0.81, 0.89, 0.85, 0.98, 0.90, 0.94, 0.75, 0.78, 0.73, 0.89, 0.83, 0.82, 0.72, 0.77, 0.76, 0.72, 0.70, 0.71, 0.91,
        0.83, 0.89, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.46, 1.34, 1.60, 1.16, 1.46, 1.71, 0.94, 0.99, 1.05, 1.26, 1.33, 1.74, 1.76, 1.57, 1.54, 1.23, 0.98, 1.05, 0.83, 0.89,
        0.84, 0.92, 0.87, 0.91, 0.96, 0.78, 0.74, 0.79, 0.72, 0.72, 0.75, 0.76, 0.80, 0.88, 0.83, 0.94, 0.87, 0.95, 0.76, 0.80,
        0.82, 0.97, 0.96, 0.89, 0.88, 1.08, 1.11, 1.10, 1.37, 1.59, 1.37, 1.07, 1.27, 1.34, 1.57, 1.45, 1.69, 1.55, 1.77, 1.79,
        1.60, 0.93, 0.90, 0.99, 0.86, 0.87, 0.93, 0.96, 1.07, 1.35, 1.18, 0.73, 0.76, 0.77, 0.81, 0.82, 0.85, 0.70, 0.71, 0.72,
        0.78, 0.73, 0.77, 0.73, 0.79, 0.82, 0.76, 0.83, 0.90, 0.84, 1.18, 0.98, 1.03, 0.92, 0.95, 0.90, 0.86, 1.32, 1.45, 1.15,
        1.53, 1.27, 0.99, 1.42, 1.65, 1.58, 1.93, 1.83, 1.94, 1.81, 1.88, 1.74, 1.70, 1.19, 1.17, 1.44, 1.11, 1.15, 1.36, 1.41,
        1.61, 1.81, 1.67, 1.22, 1.34, 1.50, 1.42, 1.65, 1.61, 1.82, 1.91, 1.75, 1.80, 1.89, 1.89, 1.98, 1.99, 1.94, 1.98, 1.92,
        1.87, 0.86, 0.95, 0.92, 1.14, 0.98, 1.03, 0.79, 0.84, 0.77, 0.97, 0.90, 0.89, 0.76, 0.82, 0.82, 0.74, 0.72, 0.71, 0.98,
        0.89, 0.97, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.60, 1.44, 1.68, 1.22, 1.49, 1.71, 0.93, 0.99, 0.99, 1.23, 1.22, 1.60, 1.68, 1.44, 1.49, 1.40, 1.14, 1.19, 0.89, 0.96,
        0.89, 0.97, 0.89, 0.91, 0.98, 0.82, 0.76, 0.82, 0.71, 0.72, 0.73, 0.76, 0.79, 0.86, 0.83, 0.91, 0.83, 0.89, 0.72, 0.76,
        0.76, 0.89, 0.89, 0.82, 0.82, 0.98, 0.96, 0.97, 1.14, 1.40, 1.19, 0.94, 1.00, 1.07, 1.37, 1.21, 1.48, 1.30, 1.57, 1.61,
        1.37, 0.86, 0.83, 0.91, 0.82, 0.82, 0.88, 0.89, 0.96, 1.14, 0.98, 0.70, 0.72, 0.73, 0.77, 0.76, 0.79, 0.70, 0.72, 0.71,
        0.82, 0.77, 0.80, 0.74, 0.79, 0.80, 0.74, 0.87, 0.93, 0.85, 1.23, 1.02, 1.02, 0.93, 0.93, 0.87, 0.85, 1.30, 1.35, 1.07,
        1.38, 1.11, 0.94, 1.47, 1.71, 1.56, 1.97, 1.88, 1.92, 1.79, 1.79, 1.59, 1.60, 1.30, 1.35, 1.56, 1.37, 1.38, 1.59, 1.60,
        1.79, 1.92, 1.79, 1.48, 1.57, 1.72, 1.61, 1.78, 1.79, 1.93, 1.99, 1.90, 1.86, 1.78, 1.86, 1.93, 1.99, 1.97, 1.90, 1.79,
        1.72, 0.94, 1.07, 1.00, 1.37, 1.21, 1.30, 0.86, 0.91, 0.83, 1.14, 0.98, 0.96, 0.82, 0.88, 0.89, 0.79, 0.76, 0.73, 1.07,
        0.94, 1.11, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.74, 1.57, 1.76, 1.33, 1.54, 1.71, 0.94, 1.05, 0.99, 1.26, 1.16, 1.46, 1.60, 1.34, 1.46, 1.59, 1.37, 1.37, 0.97, 1.11,
        0.96, 1.10, 0.95, 0.94, 1.08, 0.89, 0.82, 0.88, 0.72, 0.76, 0.75, 0.80, 0.80, 0.88, 0.87, 0.91, 0.83, 0.87, 0.72, 0.76,
        0.74, 0.83, 0.84, 0.78, 0.79, 0.96, 0.89, 0.92, 0.98, 1.23, 1.05, 0.86, 0.92, 0.95, 1.11, 0.98, 1.22, 1.03, 1.34, 1.42,
        1.14, 0.79, 0.77, 0.84, 0.78, 0.76, 0.82, 0.82, 0.89, 0.97, 0.90, 0.70, 0.71, 0.71, 0.73, 0.72, 0.74, 0.73, 0.76, 0.72,
        0.86, 0.81, 0.82, 0.76, 0.79, 0.77, 0.73, 0.90, 0.95, 0.86, 1.18, 1.03, 0.98, 0.92, 0.90, 0.83, 0.84, 1.19, 1.17, 0.98,
        1.15, 0.97, 0.89, 1.42, 1.65, 1.44, 1.93, 1.83, 1.81, 1.67, 1.61, 1.36, 1.41, 1.32, 1.45, 1.58, 1.57, 1.53, 1.74, 1.70,
        1.88, 1.94, 1.81, 1.69, 1.77, 1.87, 1.79, 1.89, 1.92, 1.98, 1.99, 1.98, 1.89, 1.65, 1.80, 1.82, 1.91, 1.94, 1.75, 1.61,
        1.50, 1.07, 1.34, 1.27, 1.60, 1.45, 1.55, 0.93, 0.99, 0.90, 1.35, 1.18, 1.07, 0.87, 0.93, 0.96, 0.85, 0.82, 0.77, 1.15,
        0.99, 1.27, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.86, 1.71, 1.82, 1.48, 1.62, 1.71, 0.98, 1.20, 1.05, 1.34, 1.17, 1.34, 1.53, 1.27, 1.46, 1.77, 1.60, 1.57, 1.16, 1.38,
        1.12, 1.35, 1.06, 1.00, 1.28, 0.97, 0.89, 0.95, 0.76, 0.81, 0.79, 0.86, 0.85, 0.92, 0.93, 0.93, 0.85, 0.87, 0.74, 0.78,
        0.74, 0.79, 0.82, 0.76, 0.79, 0.96, 0.85, 0.90, 0.94, 1.09, 0.99, 0.81, 0.85, 0.89, 0.95, 0.90, 0.99, 0.94, 1.10, 1.24,
        0.98, 0.75, 0.73, 0.78, 0.74, 0.72, 0.77, 0.76, 0.82, 0.89, 0.83, 0.73, 0.71, 0.71, 0.71, 0.70, 0.72, 0.77, 0.80, 0.74,
        0.90, 0.85, 0.84, 0.78, 0.79, 0.75, 0.73, 0.92, 0.95, 0.86, 1.05, 0.99, 0.94, 0.90, 0.86, 0.79, 0.81, 1.00, 0.98, 0.91,
        0.96, 0.89, 0.83, 1.27, 1.50, 1.23, 1.80, 1.69, 1.63, 1.46, 1.37, 1.09, 1.16, 1.24, 1.44, 1.49, 1.69, 1.59, 1.80, 1.69,
        1.87, 1.86, 1.72, 1.82, 1.91, 1.94, 1.92, 1.95, 1.99, 1.98, 1.91, 1.97, 1.89, 1.51, 1.72, 1.67, 1.77, 1.86, 1.55, 1.41,
        1.25, 1.33, 1.58, 1.50, 1.80, 1.63, 1.74, 1.04, 1.21, 0.97, 1.48, 1.37, 1.21, 0.93, 0.97, 1.05, 0.92, 0.88, 0.84, 1.14,
        1.02, 1.34, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.94, 1.84, 1.87, 1.64, 1.71, 1.71, 1.14, 1.38, 1.19, 1.46, 1.23, 1.26, 1.48, 1.26, 1.50, 1.91, 1.80, 1.76, 1.41, 1.61,
        1.39, 1.59, 1.33, 1.24, 1.51, 1.18, 0.97, 1.11, 0.82, 0.88, 0.86, 0.94, 0.92, 0.99, 1.03, 0.98, 0.91, 0.90, 0.79, 0.84,
        0.77, 0.79, 0.84, 0.77, 0.83, 0.99, 0.85, 0.91, 0.92, 1.02, 1.00, 0.79, 0.80, 0.86, 0.88, 0.84, 0.92, 0.88, 0.97, 1.10,
        0.94, 0.74, 0.71, 0.74, 0.72, 0.70, 0.73, 0.72, 0.76, 0.82, 0.77, 0.77, 0.73, 0.74, 0.71, 0.70, 0.73, 0.83, 0.85, 0.78,
        0.92, 0.88, 0.86, 0.81, 0.79, 0.74, 0.75, 0.92, 0.93, 0.85, 0.96, 0.94, 0.88, 0.86, 0.81, 0.75, 0.79, 0.93, 0.90, 0.85,
        0.88, 0.82, 0.77, 1.05, 1.27, 0.99, 1.60, 1.47, 1.39, 1.20, 1.11, 0.95, 0.97, 1.08, 1.33, 1.31, 1.70, 1.55, 1.76, 1.57,
        1.76, 1.70, 1.54, 1.85, 1.97, 1.91, 1.99, 1.97, 1.99, 1.91, 1.77, 1.88, 1.85, 1.39, 1.64, 1.51, 1.58, 1.74, 1.32, 1.22,
        1.01, 1.54, 1.76, 1.65, 1.93, 1.70, 1.85, 1.28, 1.39, 1.09, 1.52, 1.48, 1.26, 0.97, 0.99, 1.18, 1.00, 0.93, 0.90, 1.05,
        1.01, 1.31, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.97, 1.92, 1.88, 1.79, 1.79, 1.71, 1.37, 1.59, 1.38, 1.60, 1.35, 1.23, 1.47, 1.30, 1.56, 1.99, 1.93, 1.90, 1.60, 1.78,
        1.61, 1.79, 1.57, 1.48, 1.72, 1.40, 1.14, 1.37, 0.89, 0.96, 0.94, 1.07, 1.00, 1.21, 1.30, 1.14, 0.98, 0.96, 0.86, 0.91,
        0.83, 0.82, 0.88, 0.82, 0.89, 1.11, 0.87, 0.94, 0.93, 1.02, 1.07, 0.80, 0.79, 0.85, 0.82, 0.80, 0.87, 0.85, 0.93, 1.02,
        0.93, 0.77, 0.72, 0.74, 0.71, 0.70, 0.70, 0.71, 0.72, 0.77, 0.74, 0.82, 0.76, 0.79, 0.72, 0.73, 0.76, 0.89, 0.89, 0.82,
        0.93, 0.91, 0.86, 0.83, 0.79, 0.73, 0.76, 0.91, 0.89, 0.83, 0.89, 0.89, 0.82, 0.82, 0.76, 0.72, 0.76, 0.86, 0.83, 0.79,
        0.82, 0.76, 0.73, 0.94, 1.00, 0.91, 1.37, 1.21, 1.14, 0.98, 0.96, 0.88, 0.89, 0.96, 1.14, 1.07, 1.60, 1.40, 1.61, 1.37,
        1.57, 1.48, 1.30, 1.78, 1.93, 1.79, 1.99, 1.92, 1.90, 1.79, 1.59, 1.72, 1.79, 1.30, 1.56, 1.35, 1.38, 1.60, 1.11, 1.07,
        0.94, 1.68, 1.86, 1.71, 1.97, 1.68, 1.86, 1.44, 1.49, 1.22, 1.44, 1.49, 1.22, 0.99, 0.99, 1.23, 1.19, 0.98, 0.97, 0.97,
        0.98, 1.19, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.94, 1.97, 1.87, 1.91, 1.85, 1.71, 1.60, 1.77, 1.58, 1.74, 1.51, 1.26, 1.48, 1.39, 1.64, 1.99, 1.97, 1.99, 1.70, 1.85,
        1.76, 1.91, 1.76, 1.70, 1.88, 1.55, 1.33, 1.57, 0.96, 1.08, 1.05, 1.31, 1.27, 1.47, 1.54, 1.39, 1.20, 1.11, 0.93, 0.99,
        0.90, 0.88, 0.95, 0.88, 0.97, 1.32, 0.92, 1.01, 0.97, 1.10, 1.22, 0.84, 0.80, 0.88, 0.79, 0.79, 0.85, 0.86, 0.92, 1.02,
        0.94, 0.82, 0.76, 0.77, 0.72, 0.73, 0.70, 0.72, 0.71, 0.74, 0.74, 0.88, 0.81, 0.85, 0.75, 0.77, 0.82, 0.94, 0.93, 0.86,
        0.92, 0.92, 0.86, 0.85, 0.79, 0.74, 0.79, 0.88, 0.85, 0.81, 0.82, 0.83, 0.77, 0.78, 0.73, 0.71, 0.75, 0.79, 0.77, 0.74,
        0.77, 0.73, 0.70, 0.86, 0.92, 0.84, 1.14, 0.99, 0.98, 0.91, 0.90, 0.84, 0.83, 0.88, 0.97, 0.94, 1.41, 1.18, 1.39, 1.11,
        1.33, 1.24, 1.03, 1.61, 1.80, 1.59, 1.91, 1.84, 1.76, 1.64, 1.38, 1.51, 1.71, 1.26, 1.50, 1.23, 1.19, 1.46, 0.99, 1.00,
        0.91, 1.70, 1.85, 1.65, 1.93, 1.54, 1.76, 1.52, 1.48, 1.26, 1.28, 1.39, 1.09, 0.99, 0.97, 1.18, 1.31, 1.01, 1.05, 0.90,
        0.93, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.86, 1.95, 1.82, 1.98, 1.89, 1.71, 1.80, 1.91, 1.77, 1.86, 1.67, 1.34, 1.53, 1.51, 1.72, 1.92, 1.91, 1.99, 1.69, 1.82,
        1.80, 1.94, 1.87, 1.86, 1.97, 1.59, 1.44, 1.69, 1.05, 1.24, 1.27, 1.49, 1.50, 1.69, 1.72, 1.63, 1.46, 1.37, 1.00, 1.23,
        0.98, 0.95, 1.09, 0.96, 1.16, 1.55, 0.99, 1.25, 1.10, 1.24, 1.41, 0.90, 0.85, 0.94, 0.79, 0.81, 0.85, 0.89, 0.94, 1.09,
        0.98, 0.89, 0.82, 0.83, 0.74, 0.77, 0.72, 0.76, 0.73, 0.75, 0.78, 0.94, 0.86, 0.91, 0.79, 0.83, 0.89, 0.99, 0.95, 0.90,
        0.90, 0.92, 0.84, 0.86, 0.79, 0.75, 0.81, 0.85, 0.80, 0.78, 0.76, 0.77, 0.73, 0.74, 0.71, 0.71, 0.73, 0.74, 0.74, 0.71,
        0.76, 0.72, 0.70, 0.79, 0.85, 0.78, 0.98, 0.92, 0.93, 0.85, 0.87, 0.82, 0.79, 0.81, 0.89, 0.86, 1.16, 0.97, 1.12, 0.95,
        1.06, 1.00, 0.93, 1.38, 1.60, 1.35, 1.77, 1.71, 1.57, 1.48, 1.20, 1.28, 1.62, 1.27, 1.46, 1.17, 1.05, 1.34, 0.96, 0.99,
        0.90, 1.63, 1.74, 1.50, 1.80, 1.33, 1.58, 1.48, 1.37, 1.21, 1.04, 1.21, 0.97, 0.97, 0.93, 1.05, 1.34, 1.02, 1.14, 0.84,
        0.88, 0.92, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.74, 1.89, 1.76, 1.98, 1.89, 1.71, 1.93, 1.99, 1.91, 1.94, 1.82, 1.46, 1.60, 1.65, 1.80, 1.79, 1.77, 1.92, 1.57, 1.69,
        1.74, 1.87, 1.88, 1.94, 1.98, 1.53, 1.45, 1.70, 1.18, 1.32, 1.42, 1.58, 1.65, 1.83, 1.81, 1.81, 1.67, 1.61, 1.19, 1.44,
        1.17, 1.11, 1.36, 1.15, 1.41, 1.75, 1.22, 1.50, 1.34, 1.42, 1.61, 0.98, 0.92, 1.03, 0.83, 0.86, 0.89, 0.95, 0.98, 1.23,
        1.14, 0.97, 0.89, 0.90, 0.78, 0.82, 0.76, 0.82, 0.77, 0.79, 0.84, 0.98, 0.90, 0.98, 0.83, 0.89, 0.97, 1.03, 0.95, 0.92,
        0.86, 0.90, 0.82, 0.86, 0.79, 0.77, 0.84, 0.81, 0.76, 0.76, 0.72, 0.73, 0.70, 0.72, 0.71, 0.73, 0.73, 0.72, 0.74, 0.71,
        0.78, 0.74, 0.72, 0.75, 0.80, 0.76, 0.94, 0.88, 0.91, 0.83, 0.87, 0.84, 0.79, 0.76, 0.82, 0.80, 0.97, 0.89, 0.96, 0.88,
        0.95, 0.94, 0.87, 1.11, 1.37, 1.10, 1.59, 1.57, 1.37, 1.33, 1.05, 1.08, 1.54, 1.34, 1.46, 1.16, 0.99, 1.26, 0.96, 1.05,
        0.92, 1.45, 1.55, 1.27, 1.60, 1.07, 1.34, 1.35, 1.18, 1.07, 0.93, 0.99, 0.90, 0.93, 0.87, 0.96, 1.27, 0.99, 1.15, 0.77,
        0.82, 0.85, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.60, 1.78, 1.68, 1.93, 1.86, 1.71, 1.97, 1.99, 1.99, 1.97, 1.93, 1.60, 1.68, 1.78, 1.86, 1.61, 1.57, 1.79, 1.37, 1.48,
        1.59, 1.72, 1.79, 1.92, 1.90, 1.38, 1.35, 1.60, 1.23, 1.30, 1.47, 1.56, 1.71, 1.88, 1.79, 1.92, 1.79, 1.79, 1.30, 1.56,
        1.35, 1.37, 1.59, 1.38, 1.60, 1.90, 1.48, 1.72, 1.57, 1.61, 1.79, 1.21, 1.00, 1.30, 0.89, 0.94, 0.96, 1.07, 1.14, 1.40,
        1.37, 1.14, 0.96, 0.98, 0.82, 0.88, 0.82, 0.89, 0.83, 0.86, 0.91, 1.02, 0.93, 1.07, 0.87, 0.94, 1.11, 1.02, 0.93, 0.93,
        0.82, 0.87, 0.80, 0.85, 0.79, 0.80, 0.85, 0.77, 0.72, 0.74, 0.71, 0.70, 0.70, 0.71, 0.72, 0.77, 0.74, 0.72, 0.76, 0.73,
        0.82, 0.79, 0.76, 0.73, 0.79, 0.76, 0.93, 0.86, 0.91, 0.83, 0.89, 0.89, 0.82, 0.72, 0.76, 0.76, 0.89, 0.82, 0.89, 0.82,
        0.89, 0.91, 0.83, 0.96, 1.14, 0.97, 1.40, 1.44, 1.19, 1.22, 0.99, 0.98, 1.49, 1.44, 1.49, 1.22, 0.99, 1.23, 0.98, 1.19,
        0.97, 1.21, 1.30, 1.00, 1.37, 0.94, 1.07, 1.14, 0.98, 0.96, 0.86, 0.91, 0.83, 0.88, 0.82, 0.89, 1.11, 0.94, 1.07, 0.73,
        0.76, 0.79, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.46, 1.65, 1.60, 1.82, 1.80, 1.71, 1.93, 1.91, 1.99, 1.94, 1.98, 1.74, 1.76, 1.89, 1.89, 1.42, 1.34, 1.61, 1.11, 1.22,
        1.36, 1.50, 1.61, 1.81, 1.75, 1.15, 1.17, 1.41, 1.18, 1.19, 1.42, 1.44, 1.65, 1.83, 1.67, 1.94, 1.81, 1.88, 1.32, 1.58,
        1.45, 1.57, 1.74, 1.53, 1.70, 1.98, 1.69, 1.87, 1.77, 1.79, 1.92, 1.45, 1.27, 1.55, 0.97, 1.07, 1.11, 1.34, 1.37, 1.59,
        1.60, 1.35, 1.07, 1.18, 0.86, 0.93, 0.87, 0.96, 0.90, 0.93, 0.99, 1.03, 0.95, 1.15, 0.90, 0.99, 1.27, 0.98, 0.90, 0.92,
        0.78, 0.83, 0.77, 0.84, 0.79, 0.82, 0.86, 0.73, 0.71, 0.73, 0.72, 0.70, 0.73, 0.72, 0.76, 0.81, 0.76, 0.76, 0.82, 0.77,
        0.89, 0.85, 0.82, 0.75, 0.80, 0.80, 0.94, 0.88, 0.94, 0.87, 0.95, 0.96, 0.88, 0.72, 0.74, 0.76, 0.83, 0.78, 0.84, 0.79,
        0.87, 0.91, 0.83, 0.89, 0.98, 0.92, 1.23, 1.34, 1.05, 1.16, 0.99, 0.96, 1.46, 1.57, 1.54, 1.33, 1.05, 1.26, 1.08, 1.37,
        1.10, 0.98, 1.03, 0.92, 1.14, 0.86, 0.95, 0.97, 0.90, 0.89, 0.79, 0.84, 0.77, 0.82, 0.76, 0.82, 0.97, 0.89, 0.98, 0.71,
        0.72, 0.74, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.34, 1.51, 1.53, 1.67, 1.72, 1.71, 1.80, 1.77, 1.91, 1.86, 1.98, 1.86, 1.82, 1.95, 1.89, 1.24, 1.10, 1.41, 0.95, 0.99,
        1.09, 1.25, 1.37, 1.63, 1.55, 0.96, 0.98, 1.16, 1.05, 1.00, 1.27, 1.23, 1.50, 1.69, 1.46, 1.86, 1.72, 1.87, 1.24, 1.49,
        1.44, 1.69, 1.80, 1.59, 1.69, 1.97, 1.82, 1.94, 1.91, 1.92, 1.99, 1.63, 1.50, 1.74, 1.16, 1.33, 1.38, 1.58, 1.60, 1.77,
        1.80, 1.48, 1.21, 1.37, 0.90, 0.97, 0.93, 1.05, 0.97, 1.04, 1.21, 0.99, 0.95, 1.14, 0.92, 1.02, 1.34, 0.94, 0.86, 0.90,
        0.74, 0.79, 0.75, 0.81, 0.79, 0.84, 0.86, 0.71, 0.71, 0.73, 0.76, 0.73, 0.77, 0.74, 0.80, 0.85, 0.78, 0.81, 0.89, 0.84,
        0.97, 0.92, 0.88, 0.79, 0.85, 0.86, 0.98, 0.92, 1.00, 0.93, 1.06, 1.12, 0.95, 0.74, 0.74, 0.78, 0.79, 0.76, 0.82, 0.79,
        0.87, 0.93, 0.85, 0.85, 0.94, 0.90, 1.09, 1.27, 0.99, 1.17, 1.05, 0.96, 1.46, 1.71, 1.62, 1.48, 1.20, 1.34, 1.28, 1.57,
        1.35, 0.90, 0.94, 0.85, 0.98, 0.81, 0.89, 0.89, 0.83, 0.82, 0.75, 0.78, 0.73, 0.77, 0.72, 0.76, 0.89, 0.83, 0.91, 0.71,
        0.70, 0.72, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ],
      [ 1.26, 1.39, 1.48, 1.51, 1.64, 1.71, 1.60, 1.58, 1.77, 1.74, 1.91, 1.94, 1.87, 1.97, 1.85, 1.10, 0.97, 1.22, 0.88, 0.92,
        0.95, 1.01, 1.11, 1.39, 1.32, 0.88, 0.90, 0.97, 0.96, 0.93, 1.05, 0.99, 1.27, 1.47, 1.20, 1.70, 1.54, 1.76, 1.08, 1.31,
        1.33, 1.70, 1.76, 1.55, 1.57, 1.88, 1.85, 1.91, 1.97, 1.99, 1.99, 1.70, 1.65, 1.85, 1.41, 1.54, 1.61, 1.76, 1.80, 1.91,
        1.93, 1.52, 1.26, 1.48, 0.92, 0.99, 0.97, 1.18, 1.09, 1.28, 1.39, 0.94, 0.93, 1.05, 0.92, 1.01, 1.31, 0.88, 0.81, 0.86,
        0.72, 0.75, 0.74, 0.79, 0.79, 0.86, 0.85, 0.71, 0.73, 0.75, 0.82, 0.77, 0.83, 0.78, 0.85, 0.88, 0.81, 0.88, 0.97, 0.90,
        1.18, 1.00, 0.93, 0.86, 0.92, 0.94, 1.14, 0.99, 1.24, 1.03, 1.33, 1.39, 1.11, 0.79, 0.77, 0.84, 0.79, 0.77, 0.84, 0.83,
        0.90, 0.98, 0.91, 0.85, 0.92, 0.91, 1.02, 1.26, 1.00, 1.23, 1.19, 0.99, 1.50, 1.84, 1.71, 1.64, 1.38, 1.46, 1.51, 1.76,
        1.59, 0.84, 0.88, 0.80, 0.94, 0.79, 0.86, 0.82, 0.77, 0.76, 0.74, 0.74, 0.71, 0.73, 0.70, 0.72, 0.82, 0.77, 0.85, 0.74,
        0.70, 0.73, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00 ]
      ]      