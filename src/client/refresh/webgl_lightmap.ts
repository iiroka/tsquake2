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
 * Lightmap handling
 *
 * =======================================================================
 */
import * as SHARED from "../../common/shared"
import { Com_Error } from "../../common/clientserver"
import { lightstyle_t, MAX_LIGHTSTYLES } from "../ref"
import { gl3state, gl3_newrefdef, LIGHTMAP_BYTES, SetGl3Framecount } from "./webgl_main"
import { msurface_t, SURF_DRAWSKY, webglmodel_t, SURF_DRAWTURB, webglbrushmodel_t, glpoly_t, SURF_PLANEBACK } from "./webgl_model"
import { WebGL_BuildLightMap } from "./webgl_light"
import { MAXLIGHTMAPS } from "../../common/filesystem"
import { WebGL_BindLightmap } from "./webgl_image"

export const BLOCK_WIDTH = 1024
export const BLOCK_HEIGHT = 512
export const MAX_LIGHTMAPS = 4
export const MAX_LIGHTMAPS_PER_SURFACE = MAXLIGHTMAPS // 4

export class gl3lightmapstate_t {
	internal_format: number
	current_lightmap_texture: number // index into gl3state.lightmap_textureIDs[]

	//msurface_t *lightmap_surfaces[MAX_LIGHTMAPS]; - no more lightmap chains, lightmaps are rendered multitextured

    allocated = new Array<number>(BLOCK_WIDTH)

	/* the lightmap texture data needs to be kept in
	   main memory so texsubimage can update properly */
    lightmap_buffers: Uint8Array[]
	
    constructor() {
        this.lightmap_buffers = new Array<Uint8Array>(MAX_LIGHTMAPS_PER_SURFACE)
        for (let i = 0; i < MAX_LIGHTMAPS_PER_SURFACE; i++) {
            this.lightmap_buffers[i] = new Uint8Array(4 * BLOCK_WIDTH * BLOCK_HEIGHT);
        }
    }
}

export let gl3_lms = new gl3lightmapstate_t()

function WebGL_LM_InitBlock() {
    for (let i in gl3_lms.allocated) {
        gl3_lms.allocated[i] = 0
    }
}

function WebGL_LM_UploadBlock(gl: WebGL2RenderingContext) {

	// NOTE: we don't use the dynamic lightmap anymore - all lightmaps are loaded at level load
	//       and not changed after that. they're blended dynamically depending on light styles
	//       though, and dynamic lights are (will be) applied in shader, hopefully per fragment.

	WebGL_BindLightmap(gl, gl3_lms.current_lightmap_texture);

	// upload all 4 lightmaps
	for(let map=0; map < MAX_LIGHTMAPS_PER_SURFACE; ++map) {
        gl3state.SelectTMU(gl, gl.TEXTURE1+map); // this relies on GL_TEXTURE2 being GL_TEXTURE1+1 etc
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        for (let i = 0; i < gl3_lms.lightmap_buffers[map].length; i++) {
            gl3_lms.lightmap_buffers[map][i] = 0xFF
        }

		gl3_lms.internal_format = gl.RGBA;
		gl.texImage2D(gl.TEXTURE_2D, 0, gl3_lms.internal_format,
		             BLOCK_WIDTH, BLOCK_HEIGHT, 0, gl.RGBA,
		             gl.UNSIGNED_BYTE, gl3_lms.lightmap_buffers[map]);
	}

	if (++gl3_lms.current_lightmap_texture == MAX_LIGHTMAPS) {
		Com_Error(SHARED.ERR_DROP, "LM_UploadBlock() - MAX_LIGHTMAPS exceeded\n");
	}
}

/*
 * returns a texture number and the position inside it
 */
interface AllocResult {
    x: number
    y: number
}
function WebGL_LM_AllocBlock(w: number, h: number): AllocResult | null {
	// int i, j;
	// int best, best2;

	let best = BLOCK_HEIGHT;
    let x = -1
    let y = -1

	for (let i = 0; i < BLOCK_WIDTH - w; i++) {
		let best2 = 0;

        let j = 0
		for (j = 0; j < w; j++) {
			if (gl3_lms.allocated[i + j] >= best) {
				break;
			}

			if (gl3_lms.allocated[i + j] > best2) {
				best2 = gl3_lms.allocated[i + j];
			}
		}

		if (j == w) {
			/* this is a valid spot */
			x = i;
            best = best2;
			y = best;
		}
	}

	if (best + h > BLOCK_HEIGHT) {
		return null
	}

	for (let i = 0; i < w; i++) {
		gl3_lms.allocated[x + i] = best + h;
	}

	return { x: x, y: y};
}

export function WebGL_LM_BuildPolygonFromSurface(gl: WebGL2RenderingContext, mod: webglbrushmodel_t, fa: msurface_t) {

	/* reconstruct the polygon */
	let pedges = mod.edges;
	let lnumverts = fa.numedges;

    let total = [0,0,0]

	/* draw texture */
    let poly = new glpoly_t(lnumverts);
	poly.next = fa.polys;
	poly.flags = fa.flags;
	fa.polys = poly;

    let normal = [0,0,0]
	SHARED.VectorCopy(fa.plane.normal, normal);

	if(fa.flags & SURF_PLANEBACK) {
		// if for some reason the normal sticks to the back of the plane, invert it
		// so it's usable for the shader
		for (let i=0; i<3; ++i)  normal[i] = -normal[i];
	}

	for (let i = 0; i < lnumverts; i++) {
	    let vert = poly.vertice(i)

		let lindex = mod.surfedges[fa.firstedge + i];

        let vec: number[]
		if (lindex > 0) {
			let r_pedge = pedges[lindex];
			vec = mod.vertexes[r_pedge.v[0]].position;
		} else {
			let r_pedge = pedges[-lindex];
			vec = mod.vertexes[r_pedge.v[1]].position;
		}

		let s = SHARED.DotProduct(vec, fa.texinfo.vecs[0]) + fa.texinfo.vecs[0][3];
		s /= fa.texinfo.image.width;

		let t = SHARED.DotProduct(vec, fa.texinfo.vecs[1]) + fa.texinfo.vecs[1][3];
		t /= fa.texinfo.image.height;

		SHARED.VectorAdd(total, vec, total);
		vert.pos = vec;
		vert.texCoord = [s, t];

		/* lightmap texture coordinates */
		s = SHARED.DotProduct(vec, fa.texinfo.vecs[0]) + fa.texinfo.vecs[0][3];
		s -= fa.texturemins[0];
		s += fa.light_s * 16;
		s += 8;
		s /= BLOCK_WIDTH * 16; /* fa->texinfo->texture->width; */

		t = SHARED.DotProduct(vec, fa.texinfo.vecs[1]) + fa.texinfo.vecs[1][3];
		t -= fa.texturemins[1];
		t += fa.light_t * 16;
		t += 8;
		t /= BLOCK_HEIGHT * 16; /* fa->texinfo->texture->height; */

		vert.lmTexCoord = [s, t];

        vert.normal = normal;
		vert.lightFlags = 0;
	}
}

export function WebGL_LM_CreateSurfaceLightmap(gl: WebGL2RenderingContext, surf: msurface_t) {

	if (surf.flags & (SURF_DRAWSKY | SURF_DRAWTURB)) {
		return;
	}

	let smax = ~~(surf.extents[0] >> 4) + 1;
	let tmax = ~~(surf.extents[1] >> 4) + 1;

    let r = WebGL_LM_AllocBlock(smax, tmax)
	if (r == null) {
		WebGL_LM_UploadBlock(gl);
		WebGL_LM_InitBlock();

        r = WebGL_LM_AllocBlock(smax, tmax)
        if (r == null) {
			Com_Error(SHARED.ERR_FATAL, `Consecutive calls to LM_AllocBlock(${smax},${tmax}) failed\n`);
		}
    }
    surf.light_s = r.x
    surf.light_t = r.y

	surf.lightmaptexturenum = gl3_lms.current_lightmap_texture;

	WebGL_BuildLightMap(gl, surf, (surf.light_t * BLOCK_WIDTH + surf.light_s) * LIGHTMAP_BYTES, BLOCK_WIDTH * LIGHTMAP_BYTES);
}

export function WebGL_LM_BeginBuildingLightmaps(gl: WebGL2RenderingContext, m: webglmodel_t)
{

    for (let i in gl3_lms.allocated) {
        gl3_lms.allocated[i] = 0
    }

    SetGl3Framecount(1); /* no dlightcache */

	/* setup the base lightstyles so the lightmaps
	   won't have to be regenerated the first time
	   they're seen */
    let lightstyles = new Array<lightstyle_t>(MAX_LIGHTSTYLES)
    for (let i = 0; i < MAX_LIGHTSTYLES; i++) {
        lightstyles[i] = new lightstyle_t();
		lightstyles[i].rgb[0] = 1;
		lightstyles[i].rgb[1] = 1;
		lightstyles[i].rgb[2] = 1;
		lightstyles[i].white = 3;
	}

	gl3_newrefdef.lightstyles = lightstyles;

	gl3_lms.current_lightmap_texture = 0;
	gl3_lms.internal_format = gl.RGBA;

	// Note: the dynamic lightmap used to be initialized here, we don't use that anymore.
}

export function WebGL_LM_EndBuildingLightmaps(gl: WebGL2RenderingContext) {
	WebGL_LM_UploadBlock(gl);
}
