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
 * Lightmaps and dynamic lighting
 *
 * =======================================================================
 */

import * as SHARED from "../../common/shared"
import { Com_Error } from "../../common/clientserver";
import { SURF_SKY, SURF_TRANS33, SURF_TRANS66, SURF_WARP } from "../../common/filesystem";
import { dlight_t, MAX_DLIGHTS } from "../ref";
import { gl3_lms, MAX_LIGHTMAPS_PER_SURFACE } from "./webgl_lightmap";
import { gl3state, gl3_framecount, gl3_newrefdef, gl3_worldmodel } from "./webgl_main";
import { mleaf_or_mode, mnode_t, msurface_t, SURF_PLANEBACK } from "./webgl_model";
import { WebGL_UpdateUBOLights } from "./webgl_shaders";

const DLIGHT_CUTOFF = 64

let r_dlightframecount = 0

// bit: 1 << i for light number i, will be or'ed into msurface_t::dlightbits if surface is affected by this light
export function WebGL_MarkLights(light: dlight_t, bit: number, anode: mleaf_or_mode) {
	// cplane_t *splitplane;
	// float dist;
	// msurface_t *surf;
	// int i;
	// int sidebit;

	if (anode.contents != -1) {
		return;
	}
	let node = anode as mnode_t

	let splitplane = node.plane;
	let dist = SHARED.DotProduct(light.origin, splitplane.normal) - splitplane.dist;

	if (dist > light.intensity - DLIGHT_CUTOFF) {
		WebGL_MarkLights(light, bit, node.children[0]);
		return;
	}

	if (dist < -light.intensity + DLIGHT_CUTOFF) {
		WebGL_MarkLights(light, bit, node.children[1]);
		return;
	}

	/* mark the polygons */
	for (let i = 0; i < node.numsurfaces; i++)
	{
		let surf = gl3_worldmodel.surfaces[node.firstsurface + i];
		if (surf.dlightframe != r_dlightframecount) {
			surf.dlightbits = 0;
			surf.dlightframe = r_dlightframecount;
		}

		let dist = SHARED.DotProduct(light.origin, surf.plane.normal) - surf.plane.dist;
		let sidebit = 0
		if (dist >= 0) {
			sidebit = 0;
		} else {
			sidebit = SURF_PLANEBACK;
		}

		if ((surf.flags & SURF_PLANEBACK) != sidebit) {
			continue;
		}

		surf.dlightbits |= bit;
	}

	WebGL_MarkLights(light, bit, node.children[0]);
	WebGL_MarkLights(light, bit, node.children[1]);
}


export function WebGL_PushDlights(gl: WebGL2RenderingContext)
{
	// int i;
	// dlight_t *l;

	/* because the count hasn't advanced yet for this frame */
	r_dlightframecount = gl3_framecount + 1;

    gl3state.uniLightsData.numDynLights = gl3_newrefdef.dlights.length;

    let i = 0
	for (i = 0; i < gl3_newrefdef.dlights.length; i++) {
		let l = gl3_newrefdef.dlights[i];
		let dl = gl3state.uniLightsData.dynLight(i);
		WebGL_MarkLights(l, 1 << i, gl3_worldmodel.nodes[0]);

		dl.origin = l.origin;
		dl.color = l.color;
		dl.intensity = l.intensity;
	}

	// assert(MAX_DLIGHTS == 32 && "If MAX_DLIGHTS changes, remember to adjust the uniform buffer definition in the shader!");

	if(i < MAX_DLIGHTS)
	{
        for (; i < MAX_DLIGHTS; i++) {
            let dl = gl3state.uniLightsData.dynLight(i);
            dl.origin = [0, 0, 0]
            dl.color = [0, 0, 0]
            dl.intensity = 0
        }
		// memset(&gl3state.uniLightsData.dynLights[i], 0, (MAX_DLIGHTS-i)*sizeof(gl3state.uniLightsData.dynLights[0]));
	}

	WebGL_UpdateUBOLights(gl);
}
/*
 * Combine and scale multiple lightmaps into the floating format in blocklights
 */
export function WebGL_BuildLightMap(gl: WebGL2RenderingContext, surf: msurface_t, offsetInLMbuf: number, stride: number) {

	if (surf.texinfo.flags & (SURF_SKY | SURF_TRANS33 | SURF_TRANS66 | SURF_WARP)) {
		Com_Error(SHARED.ERR_DROP, "GL3_BuildLightMap called for non-lit surface");
	}

	let smax = (surf.extents[0] >> 4) + 1;
	let tmax = (surf.extents[1] >> 4) + 1;
	let size = smax * tmax;

	stride -= (smax << 2);

	if (size > 34*34*3) {
		Com_Error(SHARED.ERR_DROP, "Bad s_blocklights size");
	}

	// count number of lightmaps surf actually has
    let numMaps = 0
	for (numMaps = 0; numMaps < MAX_LIGHTMAPS_PER_SURFACE && surf.styles[numMaps] != 255; ++numMaps) {}

	if (surf.samples == null)
	{
		// no lightmap samples? set at least one lightmap to fullbright, rest to 0 as normal

		if (numMaps == 0)  numMaps = 1; // make sure at least one lightmap is set to fullbright

		for (let map = 0; map < MAX_LIGHTMAPS_PER_SURFACE; ++map)
		{
			// we always create 4 (MAX_LIGHTMAPS_PER_SURFACE) lightmaps.
			// if surf has less (numMaps < 4), the remaining ones are zeroed out.
			// this makes sure that all 4 lightmap textures in gl3state.lightmap_textureIDs[i] have the same layout
			// and the shader can use the same texture coordinates for all of them

			// const c = (map < numMaps) ? 255 : 0;
            const c = 255
            let dest_i = offsetInLMbuf

			for (let i = 0; i < tmax; i++, dest_i += stride) {
                for (let j = 0; j < 4*smax; j++) {
                    gl3_lms.lightmap_buffers[map][dest_i + j] = c
                }
				dest_i += 4*smax;
			}
		}

		return;
	}

	/* add all the lightmaps */

	// Note: dynamic lights aren't handled here anymore, they're handled in the shader

	// as we don't apply scale here anymore, nor blend the numMaps lightmaps together,
	// the code has gotten a lot easier and we can copy directly from surf->samples to dest
	// without converting to float first etc

	// lightmap = surf->samples;
    let lightmap_i = 0

    let map = 0
	for(map=0; map<numMaps; ++map)
	{
        let dest_i = offsetInLMbuf
		let idxInLightmap = 0;
		for (let i = 0; i < tmax; i++, dest_i += stride)
		{
			for (let j = 0; j < smax; j++)
			{
                const r = surf.samples[lightmap_i + idxInLightmap * 3 + 0]
                const g = surf.samples[lightmap_i + idxInLightmap * 3 + 1]
                const b = surf.samples[lightmap_i + idxInLightmap * 3 + 2]

				/* determine the brightest of the three color components */
                let max = 0
				if (r > g)  max = r;
				else  max = g;

				if (b > max)  max = b;

				/* alpha is ONLY used for the mono lightmap case. For this
				   reason we set it to the brightest of the color components
				   so that things don't get too dim. */
				const a = max;

				gl3_lms.lightmap_buffers[map][dest_i + 0] = r;
				gl3_lms.lightmap_buffers[map][dest_i + 1] = g;
				gl3_lms.lightmap_buffers[map][dest_i + 2] = b;
				gl3_lms.lightmap_buffers[map][dest_i + 3] = a;

				dest_i += 4;
				++idxInLightmap;
			}
		}

		lightmap_i += size * 3; /* skip to next lightmap */
	}

	for ( ; map < MAX_LIGHTMAPS_PER_SURFACE; ++map)
	{
		// like above, fill up remaining lightmaps with 0

        let dest_i = offsetInLMbuf

		for (let i = 0; i < tmax; i++, dest_i += stride) {
            for (let j = 0; j < 4*smax; j++) {
                gl3_lms.lightmap_buffers[map][dest_i + j] = 0
            }
			dest_i += 4*smax;
		}
	}
}

