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
 * Drawing of all images that are not textures
 *
 * =======================================================================
 */
import * as SHARED from "../../common/shared"
import * as MAIN from "./webgl_main"
import { Com_Error, Com_Printf } from "../../common/clientserver";
import { LoadPCX } from "./pcx"
import { webglimage_t, imagetype_t, WebGL_FindImage, WebGL_Bind } from "./webgl_image"
import { WebGL_UpdateUBO3D, WebGL_UpdateUBOCommon } from "./webgl_shaders";

export let d_8to24table = new Uint32Array(256);

export let draw_chars: webglimage_t = null

// vao2D is for textured rendering, vao2Dcolor for color-only
let vao2D: WebGLVertexArrayObject
let vao2Dcolor: WebGLVertexArrayObject
let vbo2D: WebGLBuffer

export async function WebGL_Draw_InitLocal(gl: WebGL2RenderingContext)
{
	/* load console characters */
	draw_chars = await WebGL_FindImage(gl, "pics/conchars.pcx", imagetype_t.it_pic);
	if (draw_chars == null) {
		Com_Error(SHARED.ERR_FATAL, "Couldn't load pics/conchars.pcx");
	}

	// set up attribute layout for 2D textured rendering
    vao2D = gl.createVertexArray();
	gl.bindVertexArray(vao2D);

    vbo2D = gl.createBuffer();
	MAIN.gl3state.BindVBO(gl, vbo2D);

	MAIN.gl3state.UseProgram(gl, MAIN.gl3state.si2D.shaderProgram);

	gl.enableVertexAttribArray(MAIN.GL3_ATTRIB_POSITION);
	// // Note: the glVertexAttribPointer() configuration is stored in the VAO, not the shader or sth
	// //       (that's why I use one VAO per 2D shader)
	gl.vertexAttribPointer(MAIN.GL3_ATTRIB_POSITION, 2, gl.FLOAT, false, 4*4, 0);

	gl.enableVertexAttribArray(MAIN.GL3_ATTRIB_TEXCOORD);
	gl.vertexAttribPointer(MAIN.GL3_ATTRIB_TEXCOORD, 2, gl.FLOAT, false, 4*4, 2*4);

	// set up attribute layout for 2D flat color rendering

    vao2Dcolor = gl.createVertexArray();
    gl.bindVertexArray(vao2Dcolor);

	MAIN.gl3state.BindVBO(gl, vbo2D); // yes, both VAOs share the same VBO

	MAIN.gl3state.UseProgram(gl, MAIN.gl3state.si2Dcolor.shaderProgram);

	gl.enableVertexAttribArray(MAIN.GL3_ATTRIB_POSITION);
	gl.vertexAttribPointer(MAIN.GL3_ATTRIB_POSITION, 2, gl.FLOAT, false, 2*4, 0);

	MAIN.gl3state.BindVAO(gl, null);
}

// void
// GL3_Draw_ShutdownLocal(void)
// {
// 	glDeleteBuffers(1, &vbo2D);
// 	vbo2D = 0;
// 	glDeleteVertexArrays(1, &vao2D);
// 	vao2D = 0;
// 	glDeleteVertexArrays(1, &vao2Dcolor);
// 	vao2Dcolor = 0;
// }

// bind the texture before calling this
function drawTexturedRectangle(gl: WebGL2RenderingContext, x: number, y: number, w: number, h: number,
                      sl: number, tl: number, sh: number, th: number) {
	/*
	 *  x,y+h      x+w,y+h
	 * sl,th--------sh,th
	 *  |             |
	 *  |             |
	 *  |             |
	 * sl,tl--------sh,tl
	 *  x,y        x+w,y
	 */

    const vBuf = new Float32Array([
	//  X,   Y,   S,  T
		x,   y+h, sl, th,
		x,   y,   sl, tl,
		x+w, y+h, sh, th,
		x+w, y,   sh, tl
    ]);

	MAIN.gl3state.BindVAO(gl, vao2D);

	// Note: while vao2D "remembers" its vbo for drawing, binding the vao does *not*
	//       implicitly bind the vbo, so I need to explicitly bind it before glBufferData()
	MAIN.gl3state.BindVBO(gl, vbo2D);
	gl.bufferData(gl.ARRAY_BUFFER, vBuf, gl.STREAM_DRAW);

	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	//glMultiDrawArrays(mode, first, count, drawcount) ??
}

/*
 * Draws one 8*8 graphics character with 0 being transparent.
 * It can be clipped to the top of the screen to allow the console to be
 * smoothly scrolled off.
 */
export function WebGL_Draw_CharScaled(gl: WebGL2RenderingContext, x: number, y: number, num: number, scale: number) {
	num &= 255;

	if ((num & 127) == 32) {
		return; /* space */
	}

	if (y <= -8) {
		return; /* totally off screen */
	}

	let row = ~~(num >> 4);
	let col = ~~(num & 15);

	let frow = row * 0.0625;
	let fcol = col * 0.0625;
	let size = 0.0625;

	let scaledSize = 8*scale;

	// TODO: batchen?

	MAIN.gl3state.UseProgram(gl, MAIN.gl3state.si2D.shaderProgram);
	WebGL_Bind(gl, draw_chars.tex);
	drawTexturedRectangle(gl, x, y, scaledSize, scaledSize, fcol, frow, fcol+size, frow+size);
}

export async function WebGL_Draw_FindPic(gl: WebGL2RenderingContext, name: string): Promise<webglimage_t> {

	if ((name[0] != '/') && (name[0] != '\\')) {
		let fullname = `pics/${name}.pcx`;
		return await WebGL_FindImage(gl, fullname, imagetype_t.it_pic);
	} else {
		return await WebGL_FindImage(gl, name.substr(1), imagetype_t.it_pic);
	}
}

export async function WebGL_Draw_GetPicSize(gl: WebGL2RenderingContext, name: string): Promise<number[]> {
		const pic = await WebGL_Draw_FindPic(gl, name);
	if (!gl) {
		return [-1, -1];
	}

	return [pic.width, pic.height];
}


export async function WebGL_Draw_StretchPic(gl: WebGL2RenderingContext, x: number, y: number, w: number, h: number, name: string) {
	const pic = await WebGL_Draw_FindPic(gl, name);
	if (pic == null) {
		Com_Printf( `Can't find pic: ${name}\n`);
		return;
	}

	MAIN.gl3state.UseProgram(gl, MAIN.gl3state.si2D.shaderProgram);
	WebGL_Bind(gl, pic.tex);

	drawTexturedRectangle(gl, x, y, w, h, pic.sl, pic.tl, pic.sh, pic.th);
}

export async function WebGL_Draw_PicScaled(gl: WebGL2RenderingContext, x: number, y: number, name: string, factor: number) {
	const pic = await WebGL_Draw_FindPic(gl, name);
	if (pic == null) {
		Com_Printf( `Can't find pic: ${name}\n`);
		return;
	}

	MAIN.gl3state.UseProgram(gl, MAIN.gl3state.si2D.shaderProgram);
	WebGL_Bind(gl, pic.tex);

	drawTexturedRectangle(gl, x, y, pic.width*factor, pic.height*factor, pic.sl, pic.tl, pic.sh, pic.th);
}

/*
 * Fills a box of pixels with a single color
 */
export function WebGL_Draw_Fill(gl: WebGL2RenderingContext, x: number, y: number, w: number, h: number, c: number) {

	if ( c < 0 || c > 255) {
		Com_Error(SHARED.ERR_FATAL, "Draw_Fill: bad color");
	}

	const color = d_8to24table[c];

	const vBuf = new Float32Array([
	//  X,   Y
		x,   y+h,
		x,   y,
		x+w, y+h,
		x+w, y
	]);

	MAIN.gl3state.uniCommonData.color = [
		(color & 0xFF) / 255,
		((color >> 8) & 0xFF) / 255,
		((color >> 16) & 0xFF) / 255,
		1.0
	]

	WebGL_UpdateUBOCommon(gl);

	MAIN.gl3state.UseProgram(gl, MAIN.gl3state.si2Dcolor.shaderProgram);
	MAIN.gl3state.BindVAO(gl, vao2Dcolor);

	MAIN.gl3state.BindVBO(gl, vbo2D);
	gl.bufferData(gl.ARRAY_BUFFER, vBuf, gl.STREAM_DRAW);

	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}


export async function WebGL_Draw_GetPalette() {

	/* get the palette */
	const res = await LoadPCX("pics/colormap.pcx", false, true);
	if (res.palette == null) {
        Com_Error(SHARED.ERR_FATAL, "Couldn't load pics/colormap.pcx")
	}

	for (let i = 0; i < 256; i++) {
		const r = res.palette[i * 3 + 0] & 0xFF
		const g = res.palette[i * 3 + 1] & 0xFF
		const b = res.palette[i * 3 + 2] & 0xFF

		const v = (255 << 24) + (r << 0) + (g << 8) + (b << 16);
		d_8to24table[i] = v
	}

	d_8to24table[255] &= 0xffffff; /* 255 is transparent */
}
