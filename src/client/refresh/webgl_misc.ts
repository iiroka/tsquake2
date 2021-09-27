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
 * Misc OpenGL3 refresher functions
 *
 * =======================================================================
 */
import { gl_filter_max, gl_filter_min, imagetype_t, webglimage_t, WebGL_LoadPic, WebGL_TextureMode } from "./webgl_image"
import { gl_texturemode } from "./webgl_main"

export let gl3_notexture: webglimage_t /* use for bad textures */
let gl3_particletexture: webglimage_t /* little dot for particles */


export function WebGL_SetDefaultState(gl: WebGL2RenderingContext) {
	gl.clearColor(1, 0, 0.5, 0.5);
	// gl.disable(GL_MULTISAMPLE);
    gl.cullFace(gl.FRONT)

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.BLEND)

	// glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);

	// TODO: gl1_texturealphamode?
	WebGL_TextureMode(gl, gl_texturemode.string);
	//R_TextureAlphaMode(gl1_texturealphamode->string);
	//R_TextureSolidMode(gl1_texturesolidmode->string);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl_filter_min);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl_filter_max);

    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

	// if (gl_msaa_samples->value)
	// {
	// 	glEnable(GL_MULTISAMPLE);
	// 	// glHint(GL_MULTISAMPLE_FILTER_HINT_NV, GL_NICEST); TODO what is this for?
	// }
}

const dottexture = [
	[0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 1, 1, 0, 0, 0, 0],
	[0, 1, 1, 1, 1, 0, 0, 0],
	[0, 1, 1, 1, 1, 0, 0, 0],
	[0, 0, 1, 1, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0]
]

export function WebGL_InitParticleTexture(gl: WebGL2RenderingContext) {

	let data = new Uint8Array(8 * 8 * 4)

	/* particle texture */
	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			let index = (8 * y + x) * 4
			data[index + 0] = 255;
			data[index + 1] = 255;
			data[index + 2] = 255;
			data[index + 3] = dottexture[x][y] * 255;
		}
	}

	gl3_particletexture = WebGL_LoadPic(gl, "***particle***", data,
	                                  8, 0, 8, 0, imagetype_t.it_sprite, 32);

	/* also use this for bad textures, but without alpha */
	for (let x = 0; x < 8; x++)
	{
		for (let y = 0; y < 8; y++)
		{
			let index = (8 * y + x) * 4
			data[index + 0] = dottexture[x & 3][y & 3] * 255;
			data[index + 1] = 0;
			data[index + 2] = 0;
			data[index + 3] = 255;
		}
	}

	gl3_notexture = WebGL_LoadPic(gl, "***r_notexture***", data,
	                            8, 0, 8, 0, imagetype_t.it_wall, 32);
}
