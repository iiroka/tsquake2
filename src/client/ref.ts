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
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA 02111-1307,
 * USA.
 *
 * =======================================================================
 *
 * ABI between client and refresher
 *
 * =======================================================================
 */

export const MAX_DLIGHTS		= 32
export const MAX_ENTITIES		= 128
export const MAX_PARTICLES		= 4096
export const MAX_LIGHTSTYLES	= 256

export const POWERSUIT_SCALE	= 4.0

export const SHELL_RED_COLOR	= 0xF2
export const SHELL_GREEN_COLOR	= 0xD0
export const SHELL_BLUE_COLOR	= 0xF3

export const SHELL_RG_COLOR		= 0xDC
export const SHELL_RB_COLOR		= 0x68
export const SHELL_BG_COLOR		= 0x78

export const SHELL_DOUBLE_COLOR		= 0xDF
export const SHELL_HALF_DAM_COLOR	= 0x90
export const SHELL_CYAN_COLOR		= 0x72

export const SHELL_WHITE_COLOR	= 0xD7

export const ENTITY_FLAGS	= 68

export class entity_t {
	model: object = null /* opaque type outside refresh */
	angles = [0,0,0]

	/* most recent data */
	origin = [0,0,0] /* also used as RF_BEAM's "from" */
	frame = 0 /* also used as RF_BEAM's diameter */

	/* previous data for lerping */
	oldorigin = [0,0,0] /* also used as RF_BEAM's "to" */
	oldframe = 0

	/* misc */
	backlerp = 0 /* 0.0 = current, 1.0 = old */
	skinnum = 0 /* also used as RF_BEAM's palette index */

	lightstyle = 0 /* for flashing entities */
	alpha = 0 /* ignore if RF_TRANSLUCENT isn't set */

	skin: object = null /* NULL for inline skin */
	flags = 0

	clone(): entity_t {
		let c = new entity_t()
		c.model = this.model
		c.frame = this.frame
		c.oldframe = this.oldframe
		c.backlerp = this.backlerp
		c.skinnum = this.skinnum
		c.lightstyle = this.lightstyle
		c.alpha = this.alpha
		c.skin = this.skin
		c.flags = this.flags
		for (let i = 0; i < 3; i++) {
			c.angles[i] = this.angles[i]
			c.origin[i] = this.origin[i]
			c.oldorigin[i] = this.oldorigin[i]
		}
		return c
	}
}

export class dlight_t  {
	origin = [0,0,0]
	color = [0,0,0]
	intensity = 0
}


export class particle_t {
	origin = [0,0,0]
	color = 0
	alpha = 0
}

export class lightstyle_t {
	rgb = [0,0,0] /* 0.0 - 2.0 */
	white = 0 /* r+g+b */
}

export class refdef_t {
	/* in virtual screen coordinates */
	x: number
	y: number
	width: number
	height: number
	fov_x: number
	fov_y: number
	vieworg = [0,0,0]
	viewangles = [0,0,0]
	blend = [0,0,0,0]		/* rgba 0-1 full screen blend */
	time = 0 /* time is used to auto animate */
	rdflags = 0 /* RDF_UNDERWATER, etc */

	areabits: Uint8Array /* if not NULL, only areas with set bits will be drawn */

	lightstyles: lightstyle_t[] /* [MAX_LIGHTSTYLES] */

	// int			num_entities;
	entities: entity_t[]

	dlights: dlight_t[]

	particles: particle_t[]
}

//
// these are the functions exported by the refresh module
//
export interface refexport_t {
	// if api_version is different, the dll cannot be used
	// int		api_version;

	// called when the library is loaded
    Init(): Promise<boolean>

	// // called before the library is unloaded
	// void	(EXPORT *Shutdown) (void);

	// // called by GLimp_InitGraphics() before creating window,
	// // returns flags for SDL window creation, returns -1 on error
	// int		(EXPORT *PrepareForWindow)(void);

	// // called by GLimp_InitGraphics() *after* creating window,
	// // passing the SDL_Window* (void* so we don't spill SDL.h here)
	// // (or SDL_Surface* for SDL1.2, another reason to use void*)
	// // returns true (1) on success
	// int		(EXPORT *InitContext)(void* sdl_window);

	// // shuts down rendering (OpenGL) context.
	// void	(EXPORT *ShutdownContext)(void);

	// // returns true if vsync is active, else false
	// qboolean (EXPORT *IsVSyncActive)(void);

	// All data that will be used in a level should be
	// registered before rendering any frames to prevent disk hits,
	// but they can still be registered at a later time
	// if necessary.
	//
	// EndRegistration will free any remaining data that wasn't registered.
	// Any model_s or skin_s pointers from before the BeginRegistration
	// are no longer valid after EndRegistration.
	//
	// Skins and images need to be differentiated, because skins
	// are flood filled to eliminate mip map edge errors, and pics have
	// an implicit "pics/" prepended to the name. (a pic name that starts with a
	// slash will not use the "pics/" prefix or the ".pcx" postfix)
	BeginRegistration(map: string): Promise<void>
	RegisterModel(name: string): Promise<object>
	RegisterSkin(name: string): Promise<object>

	SetSky(name: string, rotate: number, axis: number[]): Promise<void>
	// void	(EXPORT *EndRegistration) (void);

	RenderFrame(fd: refdef_t): Promise<void>;

	DrawFindPic(name: string): Promise<void>

	DrawGetPicSize(name: string): Promise<number[]>	// will return 0 0 if not found
	DrawPicScaled(x: number, y: number, pic: string, factor: number): Promise<void>
	DrawStretchPic (x: number, y: number, w: number, h: number, name: string): Promise<any>
	DrawCharScaled(x: number, y: number, num: number, scale: number): void
	// void	(EXPORT *DrawTileClear) (int x, int y, int w, int h, char *name);
	DrawFill(x: number, y: number, w: number, h: number, c: number): void
	// void	(EXPORT *DrawFadeScreen) (void);

	// // Draw images for cinematic rendering (which can have a different palette). Note that calls
	// void	(EXPORT *DrawStretchRaw) (int x, int y, int w, int h, int cols, int rows, byte *data);

	// /*
	// ** video mode and refresh state management entry points
	// */
	// void	(EXPORT *SetPalette)( const unsigned char *palette);	// NULL = game palette
	BeginFrame( camera_separation: number ): void
	EndFrame(): any
	// qboolean	(EXPORT *EndWorldRenderpass) (void); // finish world rendering, apply postprocess and switch to UI render pass

	//void	(EXPORT *AppActivate)( qboolean activate );

    Start(): any
    Stop(): any
}