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
 * API between the client and renderers.
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { Com_Error, Com_Printf } from "../common/clientserver"
import { Cvar_Get } from "../common/cvar"
import { refdef_t, refexport_t } from "./ref"
import { GetRefAPI } from "./refresh/webgl_main"

// Hold the video state.
class viddef_t {
	height: number = 0
	width: number = 0
}

let re: refexport_t
export let viddef = new viddef_t()

/*
 * Initializes the video stuff.
 */
export async function VID_Init() {
	// Console variables
	// vid_gamma = Cvar_Get("vid_gamma", "1.0", CVAR_ARCHIVE);

	// // Commands
	// Cmd_AddCommand("vid_restart", VID_Restart_f);
	// Cmd_AddCommand("vid_listmodes", VID_ListModes_f);

	// // Initializes the video backend. This is NOT the renderer
	// // itself, just the client side support stuff!
	// if (!GLimp_Init())
	// {
	// 	Com_Error(ERR_FATAL, "Couldn't initialize the graphics subsystem!\n");
	// }

	// Load the renderer and get things going.
	if (!await VID_LoadRenderer()) {
        Com_Error(SHARED.ERR_FATAL, "Failed to initialize renderer")
    }
}

/*
 * Loads and initializes a renderer.
 */
async function VID_LoadRenderer(): Promise<boolean>
{
// 	refimport_t	ri;
// 	GetRefAPI_t	GetRefAPI;

// #ifdef __APPLE__
// 	const char* lib_ext = "dylib";
// #elif defined(_WIN32)
// 	const char* lib_ext = "dll";
// #else
// 	const char* lib_ext = "so";
// #endif

// 	char reflib_name[64] = {0};
// 	char reflib_path[MAX_OSPATH] = {0};

// 	// If the refresher is already active we need
// 	// to shut it down before loading a new one
// 	VID_ShutdownRenderer();

	// Log what we're doing.
	Com_Printf("----- refresher initialization -----\n");

// 	snprintf(reflib_name, sizeof(reflib_name), "ref_%s.%s", vid_renderer->string, lib_ext);
// 	snprintf(reflib_path, sizeof(reflib_path), "%s%s", Sys_GetBinaryDir(), reflib_name);
// 	Com_Printf("Loading library: %s\n", reflib_name);

// 	// Mkay, let's load the requested renderer.
// 	GetRefAPI = Sys_LoadLibrary(reflib_path, "GetRefAPI", &reflib_handle);

// 	// Okay, we couldn't load it. It's up to the
// 	// caller to recover from this.
// 	if (GetRefAPI == NULL)
// 	{
// 		Com_Printf("Loading %s as renderer lib failed!", reflib_path);

// 		return false;
// 	}

// 	// Fill in the struct exported to the renderer.
// 	// FIXME: Do we really need all these?
// 	ri.Cmd_AddCommand = Cmd_AddCommand;
// 	ri.Cmd_Argc = Cmd_Argc;
// 	ri.Cmd_Argv = Cmd_Argv;
// 	ri.Cmd_ExecuteText = Cbuf_ExecuteText;
// 	ri.Cmd_RemoveCommand = Cmd_RemoveCommand;
// 	ri.Com_VPrintf = Com_VPrintf;
// 	ri.Cvar_Get = Cvar_Get;
// 	ri.Cvar_Set = Cvar_Set;
// 	ri.Cvar_SetValue = Cvar_SetValue;
// 	ri.FS_FreeFile = FS_FreeFile;
// 	ri.FS_Gamedir = FS_Gamedir;
// 	ri.FS_LoadFile = FS_LoadFile;
// 	ri.GLimp_InitGraphics = GLimp_InitGraphics;
// 	ri.GLimp_GetDesktopMode = GLimp_GetDesktopMode;
// 	ri.Sys_Error = Com_Error;
// 	ri.Vid_GetModeInfo = VID_GetModeInfo;
// 	ri.Vid_MenuInit = VID_MenuInit;
// 	ri.Vid_WriteScreenshot = VID_WriteScreenshot;

	// Exchange our export struct with the renderers import struct.
	re = GetRefAPI();

// 	// Declare the refresher as active.
// 	ref_active = true;

// 	// Let's check if we've got a compatible renderer.
// 	if (re.api_version != API_VERSION)
// 	{
// 		VID_ShutdownRenderer();

// 		Com_Printf("%s has incompatible api_version %d!\n", reflib_name, re.api_version);

// 		return false;
// 	}

	// Everything seems okay, initialize it.
	if (!await re.Init()) {
// 		VID_ShutdownRenderer();

		Com_Printf("ERROR: Loading rendering backend failed.\n");
		Com_Printf("------------------------------------\n\n");

		return false;
	}

// 	/* Ensure that all key states are cleared */
// 	Key_MarkAllUp();

	Com_Printf("Successfully loaded rendering backend.\n");
	Com_Printf("------------------------------------\n\n");

	return true;
}

// --------

// Video mode array
// ----------------

interface vidmode_t {
	readonly description: string
	readonly width: number
    readonly height: number
    readonly mode: number
}

// This must be the same as VID_MenuInit()->resolutions[] in videomenu.c!
const vid_modes: vidmode_t[] = [
	{description: "Mode  0:  320x240", width: 320, height: 240, mode: 0},
	{description: "Mode  1:  400x300", width: 400, height: 300, mode: 1},
	{description: "Mode  2:  512x384", width: 512, height: 384, mode: 2},
	{description: "Mode  3:  640x400", width: 640, height: 400, mode: 3},
	{description: "Mode  4:  640x480", width: 640, height: 480, mode: 4},
	{description: "Mode  5:  800x500", width: 800, height: 500, mode: 5},
	{description: "Mode  6:  800x600", width: 800, height: 600, mode: 6},
	{description: "Mode  7:  960x720", width: 960, height: 720, mode: 7},
	{description: "Mode  8: 1024x480", width: 1024, height: 480, mode: 8},
	{description: "Mode  9: 1024x640", width: 1024, height: 640, mode: 9},
	{description: "Mode 10: 1024x768", width: 1024, height: 768, mode: 10},
	{description: "Mode 11: 1152x768", width: 1152, height: 768, mode: 11},
	{description: "Mode 12: 1152x864", width: 1152, height: 864, mode: 12},
	{description: "Mode 13: 1280x800", width: 1280, height: 800, mode: 13},
	{description: "Mode 14: 1280x720", width: 1280, height: 720, mode: 14},
	{description: "Mode 15: 1280x960", width: 1280, height: 960, mode: 15},
	{description: "Mode 16: 1280x1024", width: 1280, height: 1024, mode: 16},
	{description: "Mode 17: 1366x768", width: 1366, height: 768, mode: 17},
	{description: "Mode 18: 1440x900", width: 1440, height: 900, mode: 18},
	{description: "Mode 19: 1600x1200", width: 1600, height: 1200, mode: 19},
	{description: "Mode 20: 1680x1050", width: 1680, height: 1050, mode: 20},
	{description: "Mode 21: 1920x1080", width: 1920, height: 1080, mode: 21},
	{description: "Mode 22: 1920x1200", width: 1920, height: 1200, mode: 22},
	{description: "Mode 23: 2048x1536", width: 2048, height: 1536, mode: 23},
	{description: "Mode 24: 2560x1080", width: 2560, height: 1080, mode: 24},
	{description: "Mode 25: 2560x1440", width: 2560, height: 1440, mode: 25},
	{description: "Mode 26: 2560x1600", width: 2560, height: 1600, mode: 26},
	{description: "Mode 27: 3440x1440", width: 3440, height: 1440, mode: 27},
	{description: "Mode 28: 3840x1600", width: 3840, height: 1600, mode: 28},
	{description: "Mode 29: 3840x2160", width: 3840, height: 2160, mode: 29},
	{description: "Mode 30: 4096x2160", width: 4096, height: 2160, mode: 30},
	{description: "Mode 31: 5120x2880", width: 5120, height: 2880, mode: 31},
]

/*
 * Callback function for the 'vid_listmodes' cmd.
 */
// void
// VID_ListModes_f(void)
// {
// 	int i;

// 	Com_Printf("Supported video modes (r_mode):\n");

// 	for (i = 0; i < VID_NUM_MODES; ++i)
// 	{
// 		Com_Printf("  %s\n", vid_modes[i].description);
// 	}
// 	Com_Printf("  Mode -1: r_customwidth x r_customheight\n");
// }

/*
 * Returns informations about the given mode.
 */
export function VID_GetModeInfo(mode: number): vidmode_t {
	if ((mode < 0) || (mode >= vid_modes.length)) {
		return {description: "INVALID", width: -1, height: -1, mode: -1};
	}

	return vid_modes[mode];
}

export function VID_SetMode(width: number, height: number) {
    viddef.width = width
    viddef.height = height
}

export async function Draw_FindPic(name: string): Promise<any> {
    return re?.DrawFindPic(name);
}

export async function Draw_GetPicSize(name: string): Promise<number[]> {
    return re?.DrawGetPicSize(name);
}

export async function Draw_StretchPic(x: number, y: number, w: number, h: number, name: string) {
    re?.DrawStretchPic(x, y, w, h, name);
}

export async function Draw_PicScaled(x: number, y: number, pic: string, factor: number) {
    re?.DrawPicScaled(x, y, pic, factor);
}


export function Draw_CharScaled(x: number, y: number, num: number, scale: number) {
    re?.DrawCharScaled(x, y, num, scale);
}

export function Draw_Fill(x: number, y: number, w: number, h: number, c: number) {
	re?.DrawFill(x, y, w, h, c);
}


export function VID_StartRendering() {
    re?.Start()
}

export function VID_StopRendering() {
    re?.Start()
}

export function R_BeginFrame(camera_separation: number) {
    re?.BeginFrame(camera_separation);
}

export function R_EndFrame() {
    re?.EndFrame();
}

export async function R_BeginRegistration(name: string) {
	await re?.BeginRegistration(name);
}

export async function R_RegisterModel(name: string): Promise<object> {
	return await re?.RegisterModel(name);
}

export async function R_RegisterSkin(name: string): Promise<object> {
	return await re?.RegisterSkin(name);
}

export async function R_RenderFrame(r: refdef_t) {
	await re?.RenderFrame(r);
}

export async function R_SetSky(name: string, rotate: number, axis: number[]) {
	await re?.SetSky(name, rotate, axis);
}
