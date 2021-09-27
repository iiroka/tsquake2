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
 * Texture handling
 *
 * =======================================================================
 */
import * as SHARED from "../../common/shared"
import * as MAIN from "./webgl_main"
import { Com_Error, Com_Printf } from "../../common/clientserver";
import { LoadPCX } from "./pcx";
import { d_8to24table, draw_chars } from "./webgl_draw"
import { msurface_t, registration_sequence } from "./webgl_model"
import { FS_LoadFile, miptex_size, miptex_t } from "../../common/filesystem";
import { MAX_LIGHTMAPS, MAX_LIGHTMAPS_PER_SURFACE } from "./webgl_lightmap";
import { gl3_notexture } from "./webgl_misc";

/*
 * skins will be outline flood filled and mip mapped
 * pics and sprites with alpha will be outline flood filled
 * pic won't be mip mapped
 *
 * model skin
 * sprite frame
 * wall texture
 * pic
 */
export enum imagetype_t {
    it_skin,
	it_sprite,
	it_wall,
	it_pic,
	it_sky
}


/* NOTE: struct image_s* is what re.RegisterSkin() etc return so no gl3image_s!
 *       (I think the client only passes the pointer around and doesn't know the
 *        definition of this struct, so this being different from struct image_s
 *        in ref_gl should be ok)
 */
export class webglimage_t {
	name: string               /* game path, including extension */
	type: imagetype_t
	width: number
    height: number                  /* source image */
	registration_sequence: number          /* 0 = free */
	texturechain: msurface_t = null    /* for sort-by-texture world drawing */
	tex: WebGLTexture = null                      /* gl texture binding */
	sl: number
    tl: number
    sh: number
    th: number               /* 0,0 - 1,1 unless part of the scrap */
	has_alpha: boolean
} 

const MAX_GL3TEXTURES = 1024
export let webgl_textures: webglimage_t[] = []

interface glmode_t {
	name: string
	minimize: number
    maximize: number
}

let modes: glmode_t[] = []
export let gl_filter_min: number
export let gl_filter_max: number


export function WebGL_ImageInit(gl: WebGL2RenderingContext) {
    modes.push({name: "GL_NEAREST", minimize: gl.NEAREST, maximize: gl.NEAREST})
    modes.push({name: "GL_LINEAR", minimize: gl.LINEAR, maximize: gl.LINEAR})
    modes.push({name: "GL_NEAREST_MIPMAP_NEAREST", minimize: gl.NEAREST_MIPMAP_NEAREST, maximize: gl.NEAREST})
    modes.push({name: "GL_LINEAR_MIPMAP_NEAREST", minimize: gl.LINEAR_MIPMAP_NEAREST, maximize: gl.LINEAR})
    modes.push({name: "GL_NEAREST_MIPMAP_LINEAR", minimize: gl.NEAREST_MIPMAP_LINEAR, maximize: gl.NEAREST})
    modes.push({name: "GL_LINEAR_MIPMAP_LINEAR", minimize: gl.LINEAR_MIPMAP_LINEAR, maximize: gl.LINEAR})
    gl_filter_min = gl.LINEAR_MIPMAP_NEAREST;
    gl_filter_max = gl.LINEAR;
}


export function WebGL_TextureMode(gl: WebGL2RenderingContext, str: string) {

    let i = 0
	for (i = 0; i < modes.length; i++) {
		if (modes[i].name == str) {
			break;
		}
	}

	if (i == modes.length) {
		Com_Printf( `bad filter name '${str}' (probably from gl_texturemode)\n`);
		return;
	}

	gl_filter_min = modes[i].minimize;
	gl_filter_max = modes[i].maximize;

	/* clamp selected anisotropy */
	if (MAIN.gl3config.anisotropic) {
		// if (gl_anisotropic->value > gl3config.max_anisotropy) {
		// 	ri.Cvar_SetValue("r_anisotropic", gl3config.max_anisotropy);
		// }
	} else {
		// ri.Cvar_SetValue("r_anisotropic", 0.0);
	}

	// gl3image_t *glt;

	// const char* nolerplist = gl_nolerp_list->string;

	/* change all the existing texture objects */
	for (let glt of webgl_textures) {
		if (MAIN.gl_nolerp_list != null && MAIN.gl_nolerp_list.string.includes(glt.name)) {
			continue /* those (by default: font and crosshairs) always only use GL_NEAREST */
		}

		MAIN.gl3state.SelectTMU(gl, gl.TEXTURE0);
		WebGL_Bind(gl, glt.tex);
		const ext = gl.getExtension("EXT_texture_filter_anisotropic")
		if ((glt.type != imagetype_t.it_pic) && (glt.type != imagetype_t.it_sky)) /* mipmapped texture */
		{
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl_filter_min);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl_filter_max);

			/* Set anisotropic filter if supported and enabled */
			if (MAIN.gl3config.anisotropic && MAIN.gl_anisotropic.bool) {
				gl.texParameteri(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.max(MAIN.gl_anisotropic.float, 1.0));
			}
		}
		else /* texture has no mipmaps */
		{
			// we can't use gl_filter_min which might be GL_*_MIPMAP_*
			// also, there's no anisotropic filtering for textures w/o mipmaps
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl_filter_max);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl_filter_max);
		}
	}
}

export function WebGL_Bind(gl: WebGL2RenderingContext, tex: WebGLTexture) {

	if (MAIN.gl_nobind.bool && draw_chars != null) /* performance evaluation option */
	{
		tex = draw_chars.tex;
	}

	if (MAIN.gl3state.currenttexture == tex) {
		return;
	}

	MAIN.gl3state.currenttexture = tex;
	MAIN.gl3state.SelectTMU(gl, gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, tex);
}

export function WebGL_BindLightmap(gl: WebGL2RenderingContext, lightmapnum: number) {

	if(lightmapnum < 0 || lightmapnum >= MAX_LIGHTMAPS) {
		Com_Printf( `WARNING: Invalid lightmapnum ${lightmapnum} used!\n`);
		return;
	}

	if (MAIN.gl3state.currentlightmap == lightmapnum) {
		return;
	}

	MAIN.gl3state.currentlightmap = lightmapnum;
	for(let i=0; i<MAX_LIGHTMAPS_PER_SURFACE; ++i) {
		// this assumes that GL_TEXTURE<i+1> = GL_TEXTURE<i> + 1
		// at least for GL_TEXTURE0 .. GL_TEXTURE31 that's true
		MAIN.gl3state.SelectTMU(gl, gl.TEXTURE1+i);
		gl.bindTexture(gl.TEXTURE_2D, MAIN.gl3state.lightmap_textureIDs[lightmapnum][i]);
	}
}

/*
 * Returns has_alpha
 */
function WebGL_Upload32(gl: WebGL2RenderingContext, data: ArrayBuffer, width: number, height: number, mipmap: boolean): boolean {

	const c = width * height;
	const scan = new Uint8Array(data);
	let samples = gl.RGB;
	let comp = gl.RGB;

	for (let i = 0; i < c; i++) {
		if (scan[4 * i + 3] != 255) {
			samples = gl.RGBA;
			comp = gl.RGBA;
			break;
		}
	}

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height,
	             0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data));

	const res = (samples == gl.RGBA);

	if (mipmap) 
    {
		// TODO: some hardware may require mipmapping disabled for NPOT textures!
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl_filter_min);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl_filter_max);
	}
	else // if the texture has no mipmaps, we can't use gl_filter_min which might be GL_*_MIPMAP_*
	{
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl_filter_max);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl_filter_max);
	}

	if (mipmap && MAIN.gl3config.anisotropic && MAIN.gl_anisotropic.bool) {
        const ext = gl.getExtension("EXT_texture_filter_anisotropic")
		gl.texParameteri(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.max(MAIN.gl_anisotropic.float, 1.0));
	}

	return res;
}


/*
 * Returns has_alpha
 */
function WebGL_Upload8(gl: WebGL2RenderingContext, data: Uint8Array, width: number, height: number, mipmap: boolean, is_sky: boolean): boolean {

	const s = width * height;
    let trans = new Uint32Array(s);

	for (let i = 0; i < s; i++) {
		let p = data[i];
		trans[i] = d_8to24table[p];

	// 	/* transparent, so scan around for
	// 	   another color to avoid alpha fringes */
	// 	if (p == 255)
	// 	{
	// 		if ((i > width) && (data[i - width] != 255))
	// 		{
	// 			p = data[i - width];
	// 		}
	// 		else if ((i < s - width) && (data[i + width] != 255))
	// 		{
	// 			p = data[i + width];
	// 		}
	// 		else if ((i > 0) && (data[i - 1] != 255))
	// 		{
	// 			p = data[i - 1];
	// 		}
	// 		else if ((i < s - 1) && (data[i + 1] != 255))
	// 		{
	// 			p = data[i + 1];
	// 		}
	// 		else
	// 		{
	// 			p = 0;
	// 		}

	// 		/* copy rgb components */
	// 		((byte *)&trans[i])[0] = ((byte *)&d_8to24table[p])[0];
	// 		((byte *)&trans[i])[1] = ((byte *)&d_8to24table[p])[1];
	// 		((byte *)&trans[i])[2] = ((byte *)&d_8to24table[p])[2];
	// 	}
	}
	return WebGL_Upload32(gl, trans.buffer, width, height, mipmap);
}


/*
 * This is also used as an entry point for the generated r_notexture
 */
export function WebGL_LoadPic(gl: WebGL2RenderingContext, name: string, pic: Uint8Array, width: number, realwidth: number,
            height: number, realheight: number, type: imagetype_t, bits: number): webglimage_t {
	let image: webglimage_t = null;

	let nolerp = false;

	if (MAIN.gl_nolerp_list != null && MAIN.gl_nolerp_list.string) {
		nolerp = MAIN.gl_nolerp_list.string.includes(name)
	}

	/* find a free gl3image_t */
    for (let i in webgl_textures) {
        if (webgl_textures[i].tex == null) {
            image = webgl_textures[i];
            break;
        }
    }

	if (image == null) {
		if (webgl_textures.length >= MAX_GL3TEXTURES) {
			Com_Error(SHARED.ERR_DROP, "MAX_GLTEXTURES");
		}

		image = new webglimage_t();
        webgl_textures.push(image);
	}

	image.name = name;
	image.registration_sequence = registration_sequence;

	image.width = width;
	image.height = height;
	image.type = type;

	// if ((type == it_skin) && (bits == 8)) {
	// 	FloodFillSkin(pic, width, height);
	// }

	// image->scrap = false; // TODO: reintroduce scrap? would allow optimizations in 2D rendering..

    image.tex = gl.createTexture()

	MAIN.gl3state.SelectTMU(gl, gl.TEXTURE0);
	WebGL_Bind(gl, image.tex);

	if (bits == 8) {
		image.has_alpha = WebGL_Upload8(gl, pic, width, height,
					(image.type != imagetype_t.it_pic && image.type != imagetype_t.it_sky),
					image.type == imagetype_t.it_sky);
	} else {
		image.has_alpha = WebGL_Upload32(gl, pic, width, height,
					(image.type != imagetype_t.it_pic && image.type != imagetype_t.it_sky));
	}

	// if (realwidth && realheight) {
	// 	if ((realwidth <= image->width) && (realheight <= image->height)) {
	// 		image->width = realwidth;
	// 		image->height = realheight;
	// 	} else {
	// 		R_Printf(PRINT_DEVELOPER,
	// 				"Warning, image '%s' has hi-res replacement smaller than the original! (%d x %d) < (%d x %d)\n",
	// 				name, image->width, image->height, realwidth, realheight);
	// 	}
	// }

	image.sl = 0;
	image.sh = 1;
	image.tl = 0;
	image.th = 1;

	if (nolerp) {
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	}
	return image;
}

async function LoadWal(gl: WebGL2RenderingContext, origname: string, type: imagetype_t): Promise<webglimage_t | null> {

	let name = origname;

	/* Add the extension */
	if (!name.endsWith("wal")) {
		name += ".wal";
	}

	let buf = await FS_LoadFile(name)
	if (buf == null) {
		Com_Printf( `LoadWal: can't load ${name}\n`);
		return gl3_notexture;
	}

	if (buf.byteLength < miptex_size) {
		Com_Printf( `LoadWal: can't load ${name}, small header\n`);
		return gl3_notexture;
	}
	const mt = new miptex_t(new DataView(buf))

	if ((mt.offsets[0] <= 0) || (mt.width <= 0) || (mt.height <= 0) ||
	    (((buf.byteLength - mt.offsets[0]) / mt.height) < mt.width))
	{
		Com_Printf( `LoadWal: can't load ${name}, small body\n`);
		return gl3_notexture;
	}

	let data = new Uint8Array(buf, mt.offsets[0])
	return WebGL_LoadPic(gl, name, data, mt.width, 0, mt.height, 0, type, 8);
}

/*
 * Finds or loads the given image
 */
export async function WebGL_FindImage(gl: WebGL2RenderingContext, name: string, type: imagetype_t): Promise<webglimage_t | null> {
	// gl3image_t *image;
	// int i, len;
	// byte *pic;
	// int width, height;
	// char *ptr;
	// char namewe[256];
	// int realwidth = 0, realheight = 0;
	// const char* ext;

	if (!name) {
		return null;
	}

	// ext = COM_FileExtension(name);
	// if(!ext[0])
	// {
	// 	/* file has no extension */
	// 	return NULL;
	// }

	// len = strlen(name);

	// /* Remove the extension */
	// memset(namewe, 0, 256);
	// memcpy(namewe, name, len - (strlen(ext) + 1));

	// if (len < 5)
	// {
	// 	return NULL;
	// }

	// /* fix backslashes */
	// while ((ptr = strchr(name, '\\')))
	// {
	// 	*ptr = '/';
	// }

	/* look for it */
    for (let i in webgl_textures) {
        if (webgl_textures[i].name == name) {
            webgl_textures[i].registration_sequence = registration_sequence
            return webgl_textures[i];
        }
    }

	/* load the pic from disk */
	if (name.endsWith("pcx")) {
	// 	if (gl_retexturing->value)
	// 	{
	// 		GetPCXInfo(name, &realwidth, &realheight);
	// 		if(realwidth == 0)
	// 		{
	// 			/* No texture found */
	// 			return NULL;
	// 		}

	// 		/* try to load a tga, png or jpg (in that order/priority) */
	// 		if (  LoadSTB(namewe, "tga", &pic, &width, &height)
	// 		   || LoadSTB(namewe, "png", &pic, &width, &height)
	// 		   || LoadSTB(namewe, "jpg", &pic, &width, &height) )
	// 		{
	// 			/* upload tga or png or jpg */
	// 			image = GL3_LoadPic(name, pic, width, realwidth, height,
	// 					realheight, type, 32);
	// 		}
	// 		else
	// 		{
	// 			/* PCX if no TGA/PNG/JPEG available (exists always) */
	// 			LoadPCX(name, &pic, NULL, &width, &height);

	// 			if (!pic)
	// 			{
	// 				/* No texture found */
	// 				return NULL;
	// 			}

	// 			/* Upload the PCX */
	// 			image = GL3_LoadPic(name, pic, width, 0, height, 0, type, 8);
	// 		}
	// 	}
	// 	else /* gl_retexture is not set */
	// 	{
			let pic = await LoadPCX(name);
			if (pic.pix == null) {
				return null;
			}

			return WebGL_LoadPic(gl, name, pic.pix, pic.width, 0, pic.height, 0, type, 8);
	// 	}
	} else if (name.endsWith("wal")) {
	// else if (strcmp(ext, "wal") == 0 || strcmp(ext, "m8") == 0)
	// {
	// 	if (gl_retexturing->value)
	// 	{
	// 		/* Get size of the original texture */
	// 		if (strcmp(ext, "m8") == 0)
	// 		{
	// 			GetM8Info(name, &realwidth, &realheight);
	// 		}
	// 		else
	// 		{
	// 			GetWalInfo(name, &realwidth, &realheight);
	// 		}

	// 		if(realwidth == 0)
	// 		{
	// 			/* No texture found */
	// 			return NULL;
	// 		}

	// 		/* try to load a tga, png or jpg (in that order/priority) */
	// 		if (  LoadSTB(namewe, "tga", &pic, &width, &height)
	// 		   || LoadSTB(namewe, "png", &pic, &width, &height)
	// 		   || LoadSTB(namewe, "jpg", &pic, &width, &height) )
	// 		{
	// 			/* upload tga or png or jpg */
	// 			image = GL3_LoadPic(name, pic, width, realwidth, height, realheight, type, 32);
	// 		}
	// 		else if (strcmp(ext, "m8") == 0)
	// 		{
	// 			image = LoadM8(namewe, type);
	// 		}
	// 		else
	// 		{
	// 			/* WAL if no TGA/PNG/JPEG available (exists always) */
	// 			image = LoadWal(namewe, type);
	// 		}

	// 		if (!image)
	// 		{
	// 			/* No texture found */
	// 			return NULL;
	// 		}
	// 	}
	// 	else if (strcmp(ext, "m8") == 0)
	// 	{
	// 		image = LoadM8(name, type);

	// 		if (!image)
	// 		{
	// 			/* No texture found */
	// 			return NULL;
	// 		}
	// 	}
	// 	else /* gl_retexture is not set */
	// 	{
			return await LoadWal(gl, name, type);

	// 		if (!image)
	// 		{
	// 			/* No texture found */
	// 			return NULL;
	// 		}
	// 	}
	// }
	// else if (strcmp(ext, "tga") == 0 || strcmp(ext, "png") == 0 || strcmp(ext, "jpg") == 0)
	// {
	// 	char tmp_name[256];

	// 	realwidth = 0;
	// 	realheight = 0;

	// 	strcpy(tmp_name, namewe);
	// 	strcat(tmp_name, ".wal");
	// 	GetWalInfo(tmp_name, &realwidth, &realheight);

	// 	if (realwidth == 0 || realheight == 0) {
	// 		strcpy(tmp_name, namewe);
	// 		strcat(tmp_name, ".m8");
	// 		GetM8Info(tmp_name, &realwidth, &realheight);
	// 	}

	// 	if (realwidth == 0 || realheight == 0) {
	// 		/* It's a sky or model skin. */
	// 		strcpy(tmp_name, namewe);
	// 		strcat(tmp_name, ".pcx");
	// 		GetPCXInfo(tmp_name, &realwidth, &realheight);
	// 	}

	// 	/* TODO: not sure if not having realwidth/heigth is bad - a tga/png/jpg
	// 	 * was requested, after all, so there might be no corresponding wal/pcx?
	// 	 * if (realwidth == 0 || realheight == 0) return NULL;
	// 	 */

	// 	if(LoadSTB(name, ext, &pic, &width, &height))
	// 	{
	// 		image = GL3_LoadPic(name, pic, width, realwidth, height, realheight, type, 32);
	// 	} else {
	// 		return NULL;
	// 	}
	// }
	// else
	// {
	// 	return NULL;
	}

	// if (pic)
	// {
	// 	free(pic);
	// }

	return null;
}
