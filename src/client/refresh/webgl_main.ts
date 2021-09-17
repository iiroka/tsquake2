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
 * Refresher setup and main part of the frame generation, for OpenGL3
 *
 * =======================================================================
 */
import * as SHARED from "../../common/shared"
import * as HMM from "./hmm"
import { entity_t, MAX_DLIGHTS, refdef_t, refexport_t } from "../ref";
import { VID_GetModeInfo, VID_SetMode, viddef } from "../vid"
import { AbortFrame, Com_Error, Com_Printf} from "../../common/clientserver"
import { Cvar_Get, Cvar_Set } from "../../common/cvar"
import { WebGL_InitParticleTexture, WebGL_SetDefaultState } from "./webgl_misc"
import { imagetype_t, webglimage_t, WebGL_FindImage, WebGL_ImageInit, WebGL_TextureMode } from "./webgl_image"
import { WebGL_InitShaders, WebGL_UpdateUBOCommon, WebGL_UpdateUBO2D, WebGL_UpdateUBO3D } from "./webgl_shaders"
import { WebGL_Draw_GetPalette, WebGL_Draw_InitLocal, WebGL_Draw_StretchPic, WebGL_Draw_CharScaled,
    WebGL_Draw_PicScaled, WebGL_Draw_GetPicSize, WebGL_Draw_FindPic } from "./webgl_draw"
import { Qcommon_Frame } from "../../common/frame";
import { WebGL_Mod_Init, WebGL_Mod_BeginRegistration, webglmodel_t, WebGL_Mod_RegisterModel, webglbrushmodel_t, modtype_t, WebGL_Mod_PointInLeaf } from "./webgl_model"
import { MAX_LIGHTMAPS, MAX_LIGHTMAPS_PER_SURFACE } from "./webgl_lightmap";
import { WebGL_DrawWorld, WebGL_MarkLeaves, WebGL_SurfInit } from "./webgl_surf"
import { CONTENTS_SOLID, PLANE_ANYZ } from "../../common/filesystem";
import { WebGL_PushDlights } from "./webgl_light";

// attribute locations for vertex shaders
export const GL3_ATTRIB_POSITION   = 0
export const GL3_ATTRIB_TEXCOORD   = 1 // for normal texture
export const GL3_ATTRIB_LMTEXCOORD = 2 // for lightmap
export const GL3_ATTRIB_COLOR      = 3 // per-vertex color
export const GL3_ATTRIB_NORMAL     = 4 // vertex normal
export const GL3_ATTRIB_LIGHTFLAGS = 5  // uint, each set bit means "dyn light i affects this surface"

export class gl3ShaderInfo_t {
	shaderProgram: WebGLProgram
	uniLmScales: WebGLUniformLocation
	lmScales = new Float32Array(16)
	// hmm_vec4 lmScales[4];
}

class gl3UniCommon_t {
    set gamma(v: number) {
        this.data[0] = v
    }
    set intensity(v: number) {
        this.data[1] = v
    }
    // for HUD, menus etc
    set intensity2D(v: number) {
        this.data[2] = v
    }

    // entries of std140 UBOs are aligned to multiples of their own size
    // so we'll need to pad accordingly for following vec4

    set color(v: number[]) {
        if (v.length > 0) this.data[4] = v[0]
        if (v.length > 1) this.data[5] = v[1]
        if (v.length > 2) this.data[6] = v[2]
        if (v.length > 3) this.data[7] = v[3]
    }

    data = new Float32Array(gl3UniCommon_size)
}
export const gl3UniCommon_size = 8

class gl3Uni2D_t {

    set transMat4(d: Float32Array) {
        for (let i = 0; i < 16 && i < d.length; i++) {
            this.data[i] = d[i]
        }
    }
    data = new Float32Array(gl3Uni2D_size)
}
export const gl3Uni2D_size = 16

class gl3Uni3D_t {
    set transProjMat4(v: Float32Array) {
		for (let i = 0; i < 16 && i < v.length; i++) {
        	this.data[i] = v[i]
		}
    }
    set transViewMat4(v: Float32Array) {
		for (let i = 0; i < 16 && i < v.length; i++) {
        	this.data[1 * 16 + i] = v[i]
		}
    }
    set transModelMat4(v: Float32Array) {
		for (let i = 0; i < 16 && i < v.length; i++) {
        	this.data[2 * 16 + i] = v[i]
		}
    }

    set scroll(v: number) { // for SURF_FLOWING
        this.data[3 * 16 + 0] = v
    }
    set time(v: number) { // for warping surfaces like water & possibly other things
        this.data[3 * 16 + 1] = v
    }
    set alpha(v: number) { // for translucent surfaces (water, glass, ..)
        this.data[3 * 16 + 2] = v
    }
    set overbrightbits(v: number) { // gl3_overbrightbits, applied to lightmaps (and elsewhere to models)
        this.data[3 * 16 + 3] = v
    }
    set particleFadeFactor(v: number) { // gl3_particle_fade_factor, higher => less fading out towards edges
        this.data[3 * 16 + 4] = v
    }

	// 	GLfloat _padding[3]; // again, some padding to ensure this has right size

    data = new Float32Array(gl3Uni3D_size)
}
export const gl3Uni3D_size = 3 * 16 + 8

class gl3UniDynLight {
	// vec3_t origin;
	// GLfloat _padding;
	// vec3_t color;
	// GLfloat intensity;
	set origin(v: number[]) {
		this.bfr[this.offset + 0] = v[0]
		this.bfr[this.offset + 1] = v[1]
		this.bfr[this.offset + 2] = v[2]
	}

	set color(v: number[]) {
		this.bfr[this.offset + 4] = v[0]
		this.bfr[this.offset + 5] = v[1]
		this.bfr[this.offset + 6] = v[2]
	}
	set intensity(v: number) {
		this.bfr[this.offset + 7] = v
	}

	private bfr: Float32Array
	private offset: number

	constructor(bfr: Float32Array, offset: number) {
		this.bfr = bfr
		this.offset = offset
	}
}
const gl3UniDynLigh_size = 8

class gl3UniLights_t {
	// gl3UniDynLight dynLights[MAX_DLIGHTS];
	// GLuint numDynLights;
    set numDynLights(v: number) {
        let bfr = new Uint32Array(this.data.buffer)
		bfr[0] = v
    }
	// GLfloat _padding[3];
    data = new Float32Array(gl3UniLights_size)

	dynLight(index: number): gl3UniDynLight {
		return new gl3UniDynLight(this.data, 4 + gl3UniDynLigh_size)
	}
}
export const gl3UniLights_size = MAX_DLIGHTS * gl3UniDynLigh_size + 4


class gl3config_t {
	renderer_string: string
	vendor_string: string
	// const char *version_string;
	// const char *glsl_version_string;

	// int major_version;
	// int minor_version;

	// ----

	anisotropic: boolean // is GL_EXT_texture_filter_anisotropic supported?
	// qboolean debug_output; // is GL_ARB_debug_output supported?
	// qboolean stencil; // Do we have a stencil buffer?

	// qboolean useBigVBO; // workaround for AMDs windows driver for fewer calls to glBufferData()

	// ----

	max_anisotropy: number
}



// width and height used to be 128, so now we should be able to get the same lightmap data
// that used 32 lightmaps before into one, so 4 lightmaps should be enough
export const LIGHTMAP_BYTES = 4


class gl3state_t {
	// TODO: what of this do we need?
	// qboolean fullscreen;

	// int prev_mode;

	// // each lightmap consists of 4 sub-lightmaps allowing changing shadows on the same surface
	// // used for switching on/off light and stuff like that.
	// // most surfaces only have one really and the remaining for are filled with dummy data
	lightmap_textureIDs: WebGLTexture[][]
	// GLuint lightmap_textureIDs[MAX_LIGHTMAPS][MAX_LIGHTMAPS_PER_SURFACE]; // instead of lightmap_textures+i use lightmap_textureIDs[i]

	currenttexture: WebGLTexture // bound to GL_TEXTURE0
	currentlightmap: number = -1 // lightmap_textureIDs[currentlightmap] bound to GL_TEXTURE1
	currenttmu: GLenum // GL_TEXTURE0 or GL_TEXTURE1

	// //float camera_separation;
	// //enum stereo_modes stereo_mode;

	currentVAO: WebGLVertexArrayObject
	currentVBO: WebGLBuffer
	currentEBO: WebGLBuffer
	currentShaderProgram: WebGLProgram
	currentUBO: WebGLBuffer

	// NOTE: make sure si2D is always the first shaderInfo (or adapt GL3_ShutdownShaders())
	si2D = new gl3ShaderInfo_t()      // shader for rendering 2D with textures
	si2Dcolor = new gl3ShaderInfo_t() // shader for rendering 2D with flat colors
	si3Dlm = new gl3ShaderInfo_t()        // a regular opaque face (e.g. from brush) with lightmap
	// TODO: lm-only variants for gl_lightmap 1
	si3Dtrans = new gl3ShaderInfo_t()     // transparent is always w/o lightmap
	si3DcolorOnly = new gl3ShaderInfo_t() // used for beams - no lightmaps
	si3Dturb = new gl3ShaderInfo_t()      // for water etc - always without lightmap
	si3DlmFlow = new gl3ShaderInfo_t()    // for flowing/scrolling things with lightmap (conveyor, ..?)
	si3DtransFlow = new gl3ShaderInfo_t() // for transparent flowing/scrolling things (=> no lightmap)
	si3Dsky = new gl3ShaderInfo_t()       // guess what..
	si3Dsprite = new gl3ShaderInfo_t()    // for sprites
	si3DspriteAlpha = new gl3ShaderInfo_t() // for sprites with alpha-testing

	si3Dalias = new gl3ShaderInfo_t()      // for models
	si3DaliasColor = new gl3ShaderInfo_t() // for models w/ flat colors

	// NOTE: make sure siParticle is always the last shaderInfo (or adapt GL3_ShutdownShaders())
	siParticle = new gl3ShaderInfo_t() // for particles. surprising, right?

	// for brushes etc, using 10 floats and one uint as vertex input (x,y,z, s,t, lms,lmt, normX,normY,normZ ; lightFlags)
	vao3D: WebGLVertexArrayObject
	vbo3D: WebGLBuffer

	// // the next two are for gl3config.useBigVBO == true
	// int vbo3Dsize;
	// int vbo3DcurOffset;

	// for models, using 9 floats as (x,y,z, s,t, r,g,b,a)
	vaoAlias: WebGLVertexArrayObject
	vboAlias: WebGLBuffer
	eboAlias: WebGLBuffer
	// for particles, using 9 floats (x,y,z, size,distance, r,g,b,a)
	vaoParticle: WebGLVertexArrayObject
	vboParticle: WebGLBuffer

	// UBOs and their data
	uniCommonData = new gl3UniCommon_t()
	uni2DData = new gl3Uni2D_t()
	uni3DData = new gl3Uni3D_t()
	uniLightsData = new gl3UniLights_t()
	uniCommonUBO: WebGLBuffer
	uni2DUBO: WebGLBuffer
	uni3DUBO: WebGLBuffer
	uniLightsUBO: WebGLBuffer

    UseProgram(gl: WebGL2RenderingContext, shaderProgram: WebGLProgram) {
	    if (shaderProgram != this.currentShaderProgram) {
		    this.currentShaderProgram = shaderProgram;
		    gl.useProgram(shaderProgram);
	    }
    }

    BindVAO(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
        if(vao != this.currentVAO) {
            this.currentVAO = vao;
            gl.bindVertexArray(vao);
        }
    }

    BindVBO(gl: WebGL2RenderingContext, vbo: WebGLBuffer) {
        if(vbo != this.currentVBO) {
            this.currentVBO = vbo;
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        }
    }

    BindEBO(gl: WebGL2RenderingContext, ebo: WebGLBuffer) {
        if(ebo != this.currentEBO) {
            this.currentEBO = ebo;
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        }
    }

    SelectTMU(gl: WebGL2RenderingContext, tmu: GLenum) {
        if(gl3state.currenttmu != tmu) {
            gl.activeTexture(tmu);
            gl3state.currenttmu = tmu;
        }
    }
    
}


export let gl3config = new gl3config_t()
export let gl3state = new gl3state_t()

let webgl_canvas: HTMLCanvasElement
let webgl_gl: WebGL2RenderingContext

/* screen size info */
export let gl3_newrefdef = new refdef_t()

export let gl3_worldmodel: webglbrushmodel_t
export function WebGL_SetWorldModel(v: webglbrushmodel_t) {
	gl3_worldmodel = v
}

export let currentmodel: webglmodel_t
export function SetCurrentModel(m: webglmodel_t) {
	currentmodel = m
}
export let currententity: entity_t
export function SetCurrentEntity(m: entity_t) {
	currententity = m
}

let gl3depthmin = 0
let gl3depthmax = 0

export let gl3_visframecount = 0; /* bumped when going to a new PVS */
export function IncrGl3VisFramecount() {
	gl3_visframecount++
}

export let gl3_framecount = 0; /* used for dlight push checking */
export function SetGl3Framecount(v: number) {
	gl3_framecount = v
}

export let frustum = [
	new SHARED.cplane_t(),
	new SHARED.cplane_t(),
	new SHARED.cplane_t(),
	new SHARED.cplane_t()
]


/* view origin */
let vup = [0,0,0]
let vpn = [0,0,0]
let vright = [0,0,0]
let gl3_origin = [0,0,0]

export let gl3_viewcluster = 0
export let gl3_viewcluster2 = 0
export let gl3_oldviewcluster = 0
export let gl3_oldviewcluster2 = 0
export function ClearViewCluster() {
	gl3_oldviewcluster = -1
	gl3_viewcluster = -1
}
export function SetOldViewCluster(v: number, v2: number) {
	gl3_oldviewcluster = v
	gl3_oldviewcluster2 = v2
}

export const gl3_identityMat4 = new Float32Array([
	1, 0, 0, 0,
	0, 1, 0, 0,
	0, 0, 1, 0,
	0, 0, 0, 1
])


// let fullscreen: SHARED.cvar_t
let r_mode: SHARED.cvar_t
export let r_farsee: SHARED.cvar_t
export let gl_texturemode: SHARED.cvar_t
export let vid_gamma: SHARED.cvar_t
export let gl3_intensity: SHARED.cvar_t
export let gl3_intensity_2D: SHARED.cvar_t
export let gl_anisotropic: SHARED.cvar_t
export let gl_nolerp_list: SHARED.cvar_t
export let gl_nobind: SHARED.cvar_t
export let gl3_particle_square: SHARED.cvar_t
export let gl3_particle_size: SHARED.cvar_t
export let gl3_particle_fade_factor: SHARED.cvar_t
export let gl3_overbrightbits: SHARED.cvar_t 
export let r_fullbright: SHARED.cvar_t
let r_norefresh: SHARED.cvar_t
let gl_drawbuffer: SHARED.cvar_t
let gl_zfix: SHARED.cvar_t
let r_clear: SHARED.cvar_t
export let gl_cull: SHARED.cvar_t
export let r_novis: SHARED.cvar_t


function WebGL_Strings(gl: WebGL2RenderingContext) {
	// GLint i, numExtensions;
	Com_Printf( `GL_VENDOR: ${gl3config.vendor_string}\n`);
	Com_Printf( `GL_RENDERER: ${gl3config.renderer_string}\n`);
	// R_Printf(PRINT_ALL, "GL_VERSION: %s\n", gl3config.version_string);
	// R_Printf(PRINT_ALL, "GL_SHADING_LANGUAGE_VERSION: %s\n", gl3config.glsl_version_string);

	Com_Printf( "GL_EXTENSIONS:");
    const extensions = gl.getSupportedExtensions()
	for(let ext of extensions) {
        if (ext == "EXT_texture_filter_anisotropic") {
            gl3config.anisotropic = true
        }
		Com_Printf( ` ${ext}`);
	}
	Com_Printf( "\n");
}

function WebGL_Register() {
	// gl_lefthand = ri.Cvar_Get("hand", "0", CVAR_USERINFO | CVAR_ARCHIVE);
	// r_gunfov = ri.Cvar_Get("r_gunfov", "80", CVAR_ARCHIVE);
	r_farsee = Cvar_Get("r_farsee", "0", SHARED.CVAR_LATCH | SHARED.CVAR_ARCHIVE);

	gl_drawbuffer = Cvar_Get("gl_drawbuffer", "GL_BACK", 0);
	// r_vsync = ri.Cvar_Get("r_vsync", "1", CVAR_ARCHIVE);
	// gl_msaa_samples = ri.Cvar_Get ( "r_msaa_samples", "0", CVAR_ARCHIVE );
	// gl_retexturing = ri.Cvar_Get("r_retexturing", "1", CVAR_ARCHIVE);
	// gl3_debugcontext = ri.Cvar_Get("gl3_debugcontext", "0", 0);
	r_mode = Cvar_Get("r_mode", "4", SHARED.CVAR_ARCHIVE);
	// r_customwidth = ri.Cvar_Get("r_customwidth", "1024", CVAR_ARCHIVE);
	// r_customheight = ri.Cvar_Get("r_customheight", "768", CVAR_ARCHIVE);
	gl3_particle_size = Cvar_Get("gl3_particle_size", "40", SHARED.CVAR_ARCHIVE);
	gl3_particle_fade_factor = Cvar_Get("gl3_particle_fade_factor", "1.2", SHARED.CVAR_ARCHIVE);
	gl3_particle_square = Cvar_Get("gl3_particle_square", "0", SHARED.CVAR_ARCHIVE);

	//  0: use lots of calls to glBufferData()
	//  1: reduce calls to glBufferData() with one big VBO (see GL3_BufferAndDraw3D())
	// -1: auto (let yq2 choose to enable/disable this based on detected driver)
	// gl3_usebigvbo = ri.Cvar_Get("gl3_usebigvbo", "-1", CVAR_ARCHIVE);

	r_norefresh = Cvar_Get("r_norefresh", "0", 0);
	// r_drawentities = ri.Cvar_Get("r_drawentities", "1", 0);
	// r_drawworld = ri.Cvar_Get("r_drawworld", "1", 0);
	r_fullbright = Cvar_Get("r_fullbright", "0", 0);
	// r_fixsurfsky = ri.Cvar_Get("r_fixsurfsky", "0", CVAR_ARCHIVE);

	/* don't bilerp characters and crosshairs */
	gl_nolerp_list = Cvar_Get("r_nolerp_list", "pics/conchars.pcx pics/ch1.pcx pics/ch2.pcx pics/ch3.pcx", 0);
	gl_nobind = Cvar_Get("gl_nobind", "0", 0);

	gl_texturemode = Cvar_Get("gl_texturemode", "GL_LINEAR_MIPMAP_NEAREST", SHARED.CVAR_ARCHIVE);
	gl_anisotropic = Cvar_Get("r_anisotropic", "0", SHARED.CVAR_ARCHIVE);

	// vid_fullscreen = ri.Cvar_Get("vid_fullscreen", "0", CVAR_ARCHIVE);
	vid_gamma = Cvar_Get("vid_gamma", "1.2", SHARED.CVAR_ARCHIVE);
	gl3_intensity = Cvar_Get("gl3_intensity", "1.5", SHARED.CVAR_ARCHIVE);
	gl3_intensity_2D = Cvar_Get("gl3_intensity_2D", "1.5", SHARED.CVAR_ARCHIVE);

	// r_lightlevel = ri.Cvar_Get("r_lightlevel", "0", 0);
	gl3_overbrightbits = Cvar_Get("gl3_overbrightbits", "1.3", SHARED.CVAR_ARCHIVE);

	// gl_lightmap = ri.Cvar_Get("gl_lightmap", "0", 0);
	// gl_shadows = ri.Cvar_Get("r_shadows", "0", CVAR_ARCHIVE);

	// r_modulate = ri.Cvar_Get("r_modulate", "1", CVAR_ARCHIVE);
	gl_zfix = Cvar_Get("gl_zfix", "0", 0);
	r_clear = Cvar_Get("r_clear", "1", 0);
	gl_cull = Cvar_Get("gl_cull", "1", 0);
	// r_lockpvs = ri.Cvar_Get("r_lockpvs", "0", 0);
	r_novis = Cvar_Get("r_novis", "0", 0);
	// r_speeds = ri.Cvar_Get("r_speeds", "0", 0);
	// gl_finish = ri.Cvar_Get("gl_finish", "0", CVAR_ARCHIVE);


	// ri.Cmd_AddCommand("imagelist", GL3_ImageList_f);
	// ri.Cmd_AddCommand("screenshot", GL3_ScreenShot);
	// ri.Cmd_AddCommand("modellist", GL3_Mod_Modellist_f);
	// ri.Cmd_AddCommand("gl_strings", GL3_Strings);
}


function WebGL_SetMode(): WebGL2RenderingContext {
	// int err;
	// int fullscreen;

    webgl_canvas = document.querySelector("#glCanvas") as HTMLCanvasElement;
    console.log("Canvas", webgl_canvas.clientWidth, webgl_canvas.clientHeight)
    webgl_gl = webgl_canvas.getContext("webgl2") as WebGL2RenderingContext;

	// fullscreen = (int)vid_fullscreen->value;

	// vid_fullscreen->modified = false;
	r_mode.modified = false;

	// /* a bit hackish approach to enable custom resolutions:
	//    Glimp_SetMode needs these values set for mode -1 */
	// vid.width = r_customwidth->value;
	// vid.height = r_customheight->value;
    Com_Printf( `Setting mode ${r_mode.int}:`);
    let info = VID_GetModeInfo(r_mode.int)
    if (info.height < 0 || info.width < 0) {
        Com_Printf( " invalid mode\n");
        return null
    }
    Com_Printf( ` ${info.width}x${info.height} \n`)
    webgl_canvas.width = info.width
    webgl_canvas.height = info.height
    console.log("Canvas", webgl_canvas.clientWidth, webgl_canvas.clientHeight)
    console.log(webgl_canvas)
    VID_SetMode(info.width, info.height)

	// if ((err = SetMode_impl(&vid.width, &vid.height, r_mode->value, fullscreen)) == rserr_ok)
	// {
	// 	if (r_mode->value == -1)
	// 	{
	// 		gl3state.prev_mode = 4; /* safe default for custom mode */
	// 	}
	// 	else
	// 	{
	// 		gl3state.prev_mode = r_mode->value;
	// 	}
	// }
	// else
	// {
	// 	if (err == rserr_invalid_mode)
	// 	{
	// 		R_Printf(PRINT_ALL, "ref_gl3::GL3_SetMode() - invalid mode\n");

	// 		if (gl_msaa_samples->value != 0.0f)
	// 		{
	// 			R_Printf(PRINT_ALL, "gl_msaa_samples was %d - will try again with gl_msaa_samples = 0\n", (int)gl_msaa_samples->value);
	// 			ri.Cvar_SetValue("r_msaa_samples", 0.0f);
	// 			gl_msaa_samples->modified = false;

	// 			if ((err = SetMode_impl(&vid.width, &vid.height, r_mode->value, 0)) == rserr_ok)
	// 			{
	// 				return true;
	// 			}
	// 		}
	// 		if(r_mode->value == gl3state.prev_mode)
	// 		{
	// 			// trying again would result in a crash anyway, give up already
	// 			// (this would happen if your initing fails at all and your resolution already was 640x480)
	// 			return false;
	// 		}

	// 		ri.Cvar_SetValue("r_mode", gl3state.prev_mode);
	// 		r_mode->modified = false;
	// 	}

	// 	/* try setting it back to something safe */
	// 	if ((err = SetMode_impl(&vid.width, &vid.height, gl3state.prev_mode, 0)) != rserr_ok)
	// 	{
	// 		R_Printf(PRINT_ALL, "ref_gl3::GL3_SetMode() - could not revert to safe mode\n");
	// 		return false;
	// 	}
	// }

	return webgl_gl;
}

async function WebGL_Init(): Promise<boolean>
{
// 	Swap_Init(); // FIXME: for fucks sake, this doesn't have to be done at runtime!

// 	R_Printf(PRINT_ALL, "Refresh: " REF_VERSION "\n");
// 	R_Printf(PRINT_ALL, "Client: " YQ2VERSION "\n\n");

// 	if(sizeof(float) != sizeof(GLfloat))
// 	{
// 		// if this ever happens, things would explode because we feed vertex arrays and UBO data
// 		// using floats to OpenGL, which expects GLfloat (can't easily change, those floats are from HMM etc)
// 		// (but to be honest I very much doubt this will ever happen.)
// 		R_Printf(PRINT_ALL, "ref_gl3: sizeof(float) != sizeof(GLfloat) - we're in real trouble here.\n");
// 		return false;
// 	}

    await WebGL_Draw_GetPalette();

	WebGL_Register();

	/* set our "safe" mode */
// 	gl3state.prev_mode = 4;
// 	//gl_state.stereo_mode = gl1_stereo->value;

	/* create the window and set up the context */
    let gl = WebGL_SetMode()
	if (gl == null) {
		Com_Printf("ref_gl3::R_Init() - could not R_SetMode()\n");
		return false;
	}

    WebGL_ImageInit(gl)

// 	ri.Vid_MenuInit();

	/* get our various GL strings */
    var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo != null) {
        gl3config.vendor_string = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string
        gl3config.renderer_string = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string
// 	gl3config.version_string = (const char*)glGetString(GL_VERSION);
// 	gl3config.glsl_version_string = (const char*)glGetString(GL_SHADING_LANGUAGE_VERSION);
    }

    Com_Printf( "\nOpenGL setting:\n");
	WebGL_Strings(gl);

// 	/*
// 	if (gl_config.major_version < 3)
// 	{
// 		// if (gl_config.major_version == 3 && gl_config.minor_version < 2)
// 		{
// 			QGL_Shutdown();
// 			R_Printf(PRINT_ALL, "Support for OpenGL 3.2 is not available\n");

// 			return false;
// 		}
// 	}
// 	*/

    Com_Printf("\n\nProbing for OpenGL extensions:\n");


	/* Anisotropic */
	Com_Printf(" - Anisotropic Filtering: ");

	if(gl3config.anisotropic)
	{
        const ext = gl.getExtension("EXT_texture_filter_anisotropic")
        gl3config.max_anisotropy = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
        Com_Printf(`Max level: ${gl3config.max_anisotropy}x\n`);
	}
	else
	{
		gl3config.max_anisotropy = 0.0;

		Com_Printf("Not supported\n");
	}

// 	if(gl3config.debug_output)
// 	{
// 		R_Printf(PRINT_ALL, " - OpenGL Debug Output: Supported ");
// 		if(gl3_debugcontext->value == 0.0f)
// 		{
// 			R_Printf(PRINT_ALL, "(but disabled with gl3_debugcontext = 0)\n");
// 		}
// 		else
// 		{
// 			R_Printf(PRINT_ALL, "and enabled with gl3_debugcontext = %i\n", (int)gl3_debugcontext->value);
// 		}
// 	}
// 	else
// 	{
		Com_Printf(" - OpenGL Debug Output: Not Supported\n");
// 	}


	// generate texture handles for all possible lightmaps
	// gl.createTexture
	// GLuint lightmap_textureIDs[MAX_LIGHTMAPS][MAX_LIGHTMAPS_PER_SURFACE]; // instead of lightmap_textures+i use lightmap_textureIDs[i]
	gl3state.lightmap_textureIDs = new Array<WebGLTexture[]>(MAX_LIGHTMAPS);
	for (let i = 0; i < MAX_LIGHTMAPS; i++) {
		gl3state.lightmap_textureIDs[i] = new Array<WebGLTexture>(MAX_LIGHTMAPS_PER_SURFACE);
		for (let j = 0; j < MAX_LIGHTMAPS_PER_SURFACE; j++) {
			gl3state.lightmap_textureIDs[i][j] = gl.createTexture()
		}
	}
// 	glGenTextures(MAX_LIGHTMAPS*MAX_LIGHTMAPS_PER_SURFACE, gl3state.lightmap_textureIDs[0]);

	WebGL_SetDefaultState(gl);

	if(WebGL_InitShaders(gl)) {
		Com_Printf( "Loading shaders succeeded.\n");
	} else {
		Com_Printf( "Loading shaders failed.\n");
		return false;
	}

	WebGL_Mod_Init();

	WebGL_InitParticleTexture(gl);

	await WebGL_Draw_InitLocal(gl);

	WebGL_SurfInit(gl);

    Com_Printf( "\n");
	return true;
}

function WebGL_DrawEntitiesOnList(gl: WebGL2RenderingContext) {

	// if (!r_drawentities->value)
	// {
	// 	return;
	// }

	// GL3_ResetShadowAliasModels();

	/* draw non-transparent first */
	for (let i in gl3_newrefdef.entities) {
		currententity = gl3_newrefdef.entities[i];

		if (currententity.flags & SHARED.RF_TRANSLUCENT)
		{
			continue; /* solid */
		}

		if (currententity.flags & SHARED.RF_BEAM)
		{
			// GL3_DrawBeam(currententity);
		}
		else
		{

			if (!currententity.model) {
				console.log("NULL")
				// GL3_DrawNullModel();
				continue;
			}

			currentmodel = currententity.model as webglmodel_t;
			switch (currentmodel.type) {
				case modtype_t.mod_alias:
	// 				GL3_DrawAliasModel(currententity);
					break;
				case modtype_t.mod_brush:
	// 				GL3_DrawBrushModel(currententity);
					break;
	// 			case mod_sprite:
	// 				GL3_DrawSpriteModel(currententity);
	// 				break;
				default:
					Com_Error(SHARED.ERR_DROP, "Bad modeltype");
					break;
			}
		}
	}

	/* draw transparent entities
	   we could sort these if it ever
	   becomes a problem... */
	gl.depthMask(false);

	for (let i in gl3_newrefdef.entities) {
		currententity = gl3_newrefdef.entities[i];

		if ((currententity.flags & SHARED.RF_TRANSLUCENT) == 0)
		{
			continue; /* solid */
		}

		if (currententity.flags & SHARED.RF_BEAM)
		{
			// GL3_DrawBeam(currententity);
		}
		else
		{

			if (!currententity.model) {
				console.log("NULL")
				// GL3_DrawNullModel();
				continue;
			}

			currentmodel = currententity.model as webglmodel_t;
			switch (currentmodel.type) {
				case modtype_t.mod_alias:
	// 				GL3_DrawAliasModel(currententity);
					break;
				case modtype_t.mod_brush:
	// 				GL3_DrawBrushModel(currententity);
					break;
	// 			case mod_sprite:
	// 				GL3_DrawSpriteModel(currententity);
	// 				break;
				default:
					Com_Error(SHARED.ERR_DROP, "Bad modeltype");
					break;
			}
		}
	}

	// GL3_DrawAliasShadows();

	gl.depthMask(true); /* back to writing */

}


function SignbitsForPlane(out: SHARED.cplane_t): number {

	/* for fast box on planeside test */
	let bits = 0;

	for (let j = 0; j < 3; j++) {
		if (out.normal[j] < 0) {
			bits |= 1 << j;
		}
	}

	return bits;
}

function SetFrustum() {

	/* rotate VPN right by FOV_X/2 degrees */
	SHARED.RotatePointAroundVector(frustum[0].normal, vup, vpn,
			-(90 - gl3_newrefdef.fov_x / 2));
	/* rotate VPN left by FOV_X/2 degrees */
	SHARED.RotatePointAroundVector(frustum[1].normal,
			vup, vpn, 90 - gl3_newrefdef.fov_x / 2);
	/* rotate VPN up by FOV_X/2 degrees */
	SHARED.RotatePointAroundVector(frustum[2].normal,
			vright, vpn, 90 - gl3_newrefdef.fov_y / 2);
	/* rotate VPN down by FOV_X/2 degrees */
	SHARED.RotatePointAroundVector(frustum[3].normal, vright, vpn,
			-(90 - gl3_newrefdef.fov_y / 2));

	for (let i = 0; i < 4; i++) {
		frustum[i].type = PLANE_ANYZ;
		frustum[i].dist = SHARED.DotProduct(gl3_origin, frustum[i].normal);
		frustum[i].signbits = SignbitsForPlane(frustum[i]);
	}
}


function SetupFrame(gl: WebGL2RenderingContext) {
	// int i;
	// mleaf_t *leaf;

	gl3_framecount++;

	/* build the transformation matrix for the given view angles */
	SHARED.VectorCopy(gl3_newrefdef.vieworg, gl3_origin);

	SHARED.AngleVectors(gl3_newrefdef.viewangles, vpn, vright, vup);

	/* current viewcluster */
	if ((gl3_newrefdef.rdflags & SHARED.RDF_NOWORLDMODEL) == 0) {
		gl3_oldviewcluster = gl3_viewcluster;
		gl3_oldviewcluster2 = gl3_viewcluster2;
		let leaf = WebGL_Mod_PointInLeaf(gl3_origin, gl3_worldmodel);
		gl3_viewcluster = gl3_viewcluster2 = leaf.cluster;

		/* check above and below so crossing solid water doesn't draw wrong */
		if (!leaf.contents) {
			/* look down a bit */
			let temp = [gl3_origin[0], gl3_origin[1], gl3_origin[2] - 16]
			leaf = WebGL_Mod_PointInLeaf(temp, gl3_worldmodel);

			if (!(leaf.contents & CONTENTS_SOLID) &&
				(leaf.cluster != gl3_viewcluster2))
			{
				gl3_viewcluster2 = leaf.cluster;
			}
		} else {
			/* look up a bit */
			let temp = [gl3_origin[0], gl3_origin[1], gl3_origin[2] + 16]
			leaf = WebGL_Mod_PointInLeaf(temp, gl3_worldmodel);

			if (!(leaf.contents & CONTENTS_SOLID) &&
				(leaf.cluster != gl3_viewcluster2))
			{
				gl3_viewcluster2 = leaf.cluster;
			}
		}
	}

	// for (i = 0; i < 4; i++)
	// {
	// 	v_blend[i] = gl3_newrefdef.blend[i];
	// }

	// c_brush_polys = 0;
	// c_alias_polys = 0;

	/* clear out the portion of the screen that the NOWORLDMODEL defines */
	if ((gl3_newrefdef.rdflags & SHARED.RDF_NOWORLDMODEL) != 0) {
		gl.enable(gl.SCISSOR_TEST);
		gl.clearColor(0.3, 0.3, 0.3, 1);
		gl.scissor(gl3_newrefdef.x,
				viddef.height - gl3_newrefdef.height - gl3_newrefdef.y,
				gl3_newrefdef.width, gl3_newrefdef.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.clearColor(1, 0, 0.5, 0.5);
		gl.disable(gl.SCISSOR_TEST);
	}
}


function WebGL_SetGL2D(gl: WebGL2RenderingContext) {
	let x = 0;
	let w = viddef.width;
	let y = 0;
	let h = viddef.height;

	gl.viewport(x, y, w, h);

	let transMatr = HMM.HMM_Orthographic(0, viddef.width, viddef.height, 0, -99999, 99999);

	gl3state.uni2DData.transMat4 = transMatr;

	WebGL_UpdateUBO2D(gl);

	gl.disable(gl.DEPTH_TEST);
	gl.disable(gl.CULL_FACE);
	gl.disable(gl.BLEND);
}


function WebGL_Clear(gl: WebGL2RenderingContext)
{
	// Check whether the stencil buffer needs clearing, and do so if need be.
	let stencilFlags = 0;


	if (r_clear.bool) {
		gl.clear(gl.COLOR_BUFFER_BIT | stencilFlags | gl.DEPTH_BUFFER_BIT);
	} else {
		gl.clear(gl.DEPTH_BUFFER_BIT | stencilFlags);
	}

	gl3depthmin = 0;
	gl3depthmax = 1;
	gl.depthFunc(gl.LEQUAL);

	gl.depthRange(gl3depthmin, gl3depthmax);

	if (gl_zfix.bool) {
		if (gl3depthmax > gl3depthmin) {
			gl.polygonOffset(0.05, 1);
		} else {
			gl.polygonOffset(-0.05, -1);
		}
	}

	/* stencilbuffer shadows */
	// if (gl_shadows.bool && gl3config.stencil) {
	// 	glClearStencil(1);
	// 	glClear(GL_STENCIL_BUFFER_BIT);
	// }
}

function WebGL_BeginFrame(gl: WebGL2RenderingContext) {
	/* change modes if necessary */
	// if (r_mode->modified) {
	// 	vid_fullscreen->modified = true;
	// }

	if (vid_gamma.modified || gl3_intensity.modified || gl3_intensity_2D.modified)
	{
		vid_gamma.modified = false;
		gl3_intensity.modified = false;
		gl3_intensity_2D.modified = false;

		gl3state.uniCommonData.gamma = 1.0/vid_gamma.float;
		gl3state.uniCommonData.intensity = gl3_intensity.float;
		gl3state.uniCommonData.intensity2D = gl3_intensity_2D.float;
		WebGL_UpdateUBOCommon(gl);
	}

	// in GL3, overbrightbits can have any positive value
	if (gl3_overbrightbits.modified)
	{
		gl3_overbrightbits.modified = false;

		if(gl3_overbrightbits.float < 0.0)
		{
			Cvar_Set("gl3_overbrightbits", "0");
		}

		gl3state.uni3DData.overbrightbits = (gl3_overbrightbits.float <= 0.0) ? 1.0 : gl3_overbrightbits.float;
		WebGL_UpdateUBO3D(gl);
	}

	if (gl3_particle_fade_factor.modified) {
		gl3_particle_fade_factor.modified = false;
		gl3state.uni3DData.particleFadeFactor = gl3_particle_fade_factor.float;
		WebGL_UpdateUBO3D(gl);
	}

	// if(gl3_particle_square->modified) {
	// 	gl3_particle_square->modified = false;
	// 	GL3_RecreateShaders();
	// }


	/* go into 2D mode */

	WebGL_SetGL2D(gl);

	/* draw buffer stuff */
	if (gl_drawbuffer.modified)
	{
		gl_drawbuffer.modified = false;

		// TODO: stereo stuff
		//if ((gl3state.camera_separation == 0) || gl3state.stereo_mode != STEREO_MODE_OPENGL)
	// 	{
			// if (gl_drawbuffer.string == "GL_FRONT") {
			// 	gl.drawBuffer(gl.FRONT);
			// } else {
				// gl.drawBuffer(gl.BACK);
			// }
	// 	}
	}

	/* texturemode stuff */
	if (gl_texturemode.modified || (gl3config.anisotropic && gl_anisotropic.modified))
	{
		WebGL_TextureMode(gl, gl_texturemode.string);
		gl_texturemode.modified = false;
		gl_anisotropic.modified = false;
	}

	// if (r_vsync->modified)
	// {
	// 	r_vsync->modified = false;
	// 	GL3_SetVsync();
	// }

	/* clear screen if desired */
	WebGL_Clear(gl);
}

// equivalent to R_x * R_y * R_z where R_x is the trans matrix for rotating around X axis for aroundXdeg
function rotAroundAxisXYZ(aroundXdeg: number, aroundYdeg: number, aroundZdeg: number): Float32Array
{
	const alpha = HMM.HMM_ToRadians(aroundXdeg);
	const beta = HMM.HMM_ToRadians(aroundYdeg);
	const gamma = HMM.HMM_ToRadians(aroundZdeg);

	const sinA = Math.sin(alpha);
	const cosA = Math.cos(alpha);
	const sinB = Math.sin(beta);
	const cosB = Math.cos(beta);
	const sinG = Math.sin(gamma);
	const cosG = Math.cos(gamma);

	return new Float32Array([
		 cosB*cosG,  sinA*sinB*cosG + cosA*sinG, -cosA*sinB*cosG + sinA*sinG, 0, // first *column*
		-cosB*sinG, -sinA*sinB*sinG + cosA*cosG,  cosA*sinB*sinG + sinA*cosG, 0,
		 sinB,      -sinA*cosB,                   cosA*cosB,                  0,
		 0,          0,                           0,                          1
	])
}


// equivalent to R_MYgluPerspective() but returning a matrix instead of setting internal OpenGL state
export function GL3_MYgluPerspective(fovy: number, aspect: number, zNear: number, zFar: number): Float32Array {
	// calculation of left, right, bottom, top is from R_MYgluPerspective() of old gl backend
	// which seems to be slightly different from the real gluPerspective()
	// and thus also from HMM_Perspective()
	// GLdouble left, right, bottom, top;
	// float A, B, C, D;

	let top = zNear * Math.tan(fovy * Math.PI / 360.0);
	let bottom = -top;

	let left = bottom * aspect;
	let right = top * aspect;

	// TODO:  stereo stuff
	// left += - gl1_stereo_convergence->value * (2 * gl_state.camera_separation) / zNear;
	// right += - gl1_stereo_convergence->value * (2 * gl_state.camera_separation) / zNear;

	// the following emulates glFrustum(left, right, bottom, top, zNear, zFar)
	// see https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/glFrustum.xml
	let A = (right+left)/(right-left);
	let B = (top+bottom)/(top-bottom);
	let C = -(zFar+zNear)/(zFar-zNear);
	let D = -(2.0*zFar*zNear)/(zFar-zNear);

	return new Float32Array([
		(2.0*zNear)/(right-left), 0, 0, 0, // first *column*
		0, (2.0*zNear)/(top-bottom), 0, 0,
		A, B, C, -1.0,
		0, 0, D, 0
	])
}

function SetupGL(gl: WebGL2RenderingContext) {

	/* set up viewport */
	let x = ~~Math.floor(gl3_newrefdef.x * viddef.width / viddef.width);
	let x2 = ~~Math.ceil((gl3_newrefdef.x + gl3_newrefdef.width) * viddef.width / viddef.width);
	let y = ~~Math.floor(viddef.height - gl3_newrefdef.y * viddef.height / viddef.height);
	let y2 = ~~Math.ceil(viddef.height - (gl3_newrefdef.y + gl3_newrefdef.height) * viddef.height / viddef.height);

	let w = x2 - x;
	let h = y - y2;

	gl.viewport(x, y2, w, h);

	/* set up projection matrix (eye coordinates -> clip coordinates) */
	{
		let screenaspect = gl3_newrefdef.width / gl3_newrefdef.height;
		let dist = (r_farsee.bool) ? 8192.0 : 4096.0
		gl3state.uni3DData.transProjMat4 = GL3_MYgluPerspective(gl3_newrefdef.fov_y, screenaspect, 4, dist);
	}

	gl.cullFace(gl.FRONT);

	/* set up view matrix (world coordinates -> eye coordinates) */
	{
		// first put Z axis going up
		let viewMat = new Float32Array([
			  0, 0, -1, 0, // first *column* (the matrix is colum-major)
			 -1, 0,  0, 0,
			  0, 1,  0, 0,
			  0, 0,  0, 1
		])

		// now rotate by view angles
		let rotMat = rotAroundAxisXYZ(-gl3_newrefdef.viewangles[2], -gl3_newrefdef.viewangles[0], -gl3_newrefdef.viewangles[1]);

		viewMat = HMM.HMM_MultiplyMat4( viewMat, rotMat );

		// .. and apply translation for current position
		let trans = new Float32Array([-gl3_newrefdef.vieworg[0], -gl3_newrefdef.vieworg[1], -gl3_newrefdef.vieworg[2]])
		viewMat = HMM.HMM_MultiplyMat4( viewMat, HMM.HMM_Translate(trans) );

		gl3state.uni3DData.transViewMat4 = viewMat;
	}

	gl3state.uni3DData.transModelMat4 = gl3_identityMat4;

	gl3state.uni3DData.time = gl3_newrefdef.time;

	WebGL_UpdateUBO3D(gl);

	/* set drawing parms */
	if (gl_cull.bool) {
		gl.enable(gl.CULL_FACE);
	} else {
		gl.disable(gl.CULL_FACE);
	}

	gl.enable(gl.DEPTH_TEST);
}


/*
 * gl3_newrefdef must be set before the first call
 */
function WebGL_RenderView(gl: WebGL2RenderingContext, fd: refdef_t) {

	if (r_norefresh.bool) {
		return;
	}

	gl3_newrefdef = fd;

	if (gl3_worldmodel == null && !(gl3_newrefdef.rdflags & SHARED.RDF_NOWORLDMODEL)) {
		Com_Error(SHARED.ERR_DROP, "R_RenderView: NULL worldmodel");
	}

	// if (r_speeds->value) {
	// 	c_brush_polys = 0;
	// 	c_alias_polys = 0;
	// }

	WebGL_PushDlights(gl);

	// if (gl_finish->value) {
	// 	glFinish();
	// }

	SetupFrame(gl);

	SetFrustum();

	SetupGL(gl);

	WebGL_MarkLeaves(); /* done here so we know if we're in water */

	WebGL_DrawWorld(gl);

	WebGL_DrawEntitiesOnList(gl);

	// // kick the silly gl1_flashblend poly lights
	// // GL3_RenderDlights();

	// GL3_DrawParticles();

	// GL3_DrawAlphaSurfaces();

	// Note: R_Flash() is now GL3_Draw_Flash() and called from GL3_RenderFrame()

	// if (r_speeds->value)
	// {
	// 	R_Printf(PRINT_ALL, "%4i wpoly %4i epoly %i tex %i lmaps\n",
	// 			c_brush_polys, c_alias_polys, c_visible_textures,
	// 			c_visible_lightmaps);
	// }

}

async function WebGL_RenderFrame(gl: WebGL2RenderingContext, fd: refdef_t) {
	WebGL_RenderView(gl, fd);
	// GL3_SetLightLevel();
	WebGL_SetGL2D(gl);

	// if(v_blend[3] != 0.0f)
	// {
	// 	int x = (vid.width - gl3_newrefdef.width)/2;
	// 	int y = (vid.height - gl3_newrefdef.height)/2;

	// 	GL3_Draw_Flash(v_blend, x, y, gl3_newrefdef.width, gl3_newrefdef.height);
	// }
}

let is_running = false
let last_frame: number

function WebGl_Frame(timestamp: number) {

    Qcommon_Frame(timestamp - last_frame).then( () => {
        last_frame = timestamp
        if (is_running) {
            window.requestAnimationFrame(WebGl_Frame);
        }
    }).catch( (reason) => {
		if (reason instanceof AbortFrame) {
			console.log("AbortFrame")
			last_frame = timestamp
			if (is_running) {
				window.requestAnimationFrame(WebGl_Frame);
			}
		} else {
			console.log("Exception", reason.message)
        	throw reason
		}
	})
}


class WebGl_Ref implements refexport_t {


    public async Init(): Promise<boolean> {
        return await WebGL_Init()
    }
    public async DrawFindPic(name: string): Promise<any> {
        return WebGL_Draw_FindPic(webgl_gl, name)
    }
    public async DrawGetPicSize(name: string): Promise<number[]> {
        return WebGL_Draw_GetPicSize(webgl_gl, name)
    }
    public async DrawStretchPic (x: number, y: number, w: number, h: number, name: string): Promise<any> {
        await WebGL_Draw_StretchPic(webgl_gl, ~~x, ~~y, ~~w, ~~h, name)
    }
    public async DrawPicScaled(x: number, y: number, pic: string, factor: number): Promise<any> {
        await WebGL_Draw_PicScaled(webgl_gl, ~~x, ~~y, pic, factor)
    }
    public DrawCharScaled(x: number, y: number, num: number, scale: number) {
        WebGL_Draw_CharScaled(webgl_gl, ~~x, ~~y, ~~num, scale)
    }
    public Start(): any {
        is_running = true
        last_frame = Date.now();
        window.requestAnimationFrame(WebGl_Frame);
    }
    public Stop(): any {
        is_running = false
    }
    public BeginFrame(sep: number) {
        WebGL_BeginFrame(webgl_gl)
    }
    public EndFrame() {
    }
	public async BeginRegistration(map: string): Promise<any> {
		await WebGL_Mod_BeginRegistration(webgl_gl, map)
	}
	public async RegisterModel(name: string): Promise<object> {
		return await WebGL_Mod_RegisterModel(webgl_gl, name)
	}
	public async RegisterSkin(name: string): Promise<object> {
		return await WebGL_FindImage(webgl_gl, name, imagetype_t.it_skin)
	}
	public async RenderFrame(fd: refdef_t): Promise<any> {
		await WebGL_RenderFrame(webgl_gl, fd)
	}
}

export function GetRefAPI(): refexport_t {
    return new WebGl_Ref();
}