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
 *  =======================================================================
 *
 * This file implements the camera, e.g the player's view
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { Com_Error, Com_Printf } from "../common/clientserver";
import { cl, cls, cl_paused } from "./cl_main";
import { SCR_UpdateScreen, scr_vrect, SCR_TouchPics } from "./cl_screen";
import { R_BeginRegistration, R_RegisterModel, R_RenderFrame, Draw_FindPic } from "./vid"
import { connstate_t, MAX_CLIENTWEAPONMODELS } from "./client";
import { CL_AddEntities } from "./cl_entities"
import { CL_LoadClientinfo, CL_ParseClientinfo } from "./cl_parse";
import { entity_t, lightstyle_t, MAX_ENTITIES } from "./ref";
import { Key_Update } from "./cl_keyboard";
import { CL_RegisterTEntModels } from "./cl_tempentities"

export let cl_weaponmodels: string[] = []

let r_entities: entity_t[] = []
let r_lightstyles: lightstyle_t[] = new Array<lightstyle_t>(SHARED.MAX_LIGHTSTYLES)

/*
 * Specifies the model that will be used as the world
 */
function V_ClearScene() {
    r_entities = []
	// r_numdlights = 0;
	// r_numentities = 0;
	// r_numparticles = 0;
}

export function V_AddEntity(ent: entity_t) {
	if (r_entities.length >= MAX_ENTITIES) {
		return;
	}

	r_entities.push(ent.clone())
}

export function V_AddLightStyle(style: number, r: number, g: number, b: number) {

	if ((style < 0) || (style > SHARED.MAX_LIGHTSTYLES))
	{
		Com_Error(SHARED.ERR_DROP, `Bad light style ${style}`);
	}

	let ls = r_lightstyles[style];

	ls.white = r + g + b;
	ls.rgb[0] = r;
	ls.rgb[1] = g;
	ls.rgb[2] = b;
}


/*
 * Call before entering a new level, or after changing dlls
 */
export async function CL_PrepRefresh() {
 
	if (!cl.configstrings[SHARED.CS_MODELS + 1]) {
		return;
	}

    for (let i = 0; i < SHARED.MAX_LIGHTSTYLES; i++) {
        r_lightstyles[i] = new lightstyle_t();
    }

// 	SCR_AddDirtyPoint(0, 0);
// 	SCR_AddDirtyPoint(viddef.width - 1, viddef.height - 1);

	/* let the refresher load the map */
    let mapname = cl.configstrings[SHARED.CS_MODELS + 1].substring(5) /* skip "maps/" */
    mapname = mapname.substring(0, mapname.length - 4) /* cut off ".bsp" */

	/* register models, pics, and skins */
	Com_Printf(`Map: ${mapname}\r`);
	await SCR_UpdateScreen();
	await R_BeginRegistration (mapname);
	Com_Printf("                                     \r");

	/* precache status bar pics */
	Com_Printf("pics\r");
	await SCR_UpdateScreen();
	await SCR_TouchPics();
	Com_Printf("                                     \r");

	await CL_RegisterTEntModels();

    cl_weaponmodels = ["weapon.md2"];

	for (let i = 1; i < SHARED.MAX_MODELS && cl.configstrings[SHARED.CS_MODELS + i]; i++) {
		let name = cl.configstrings[SHARED.CS_MODELS + i];

		if (name[0] != '*') {
			Com_Printf(`${name}\r`);
		}

		await SCR_UpdateScreen();
		await Key_Update();

		if (name[0] == '#') {
			/* special player weapon model */
			if (cl_weaponmodels.length < MAX_CLIENTWEAPONMODELS) {
				cl_weaponmodels.push(cl.configstrings[SHARED.CS_MODELS + i].substring(1))
			}
		} else {
			cl.model_draw[i] = await R_RegisterModel(cl.configstrings[SHARED.CS_MODELS + i])

// 			if (name[0] == '*') {
// 				cl.model_clip[i] = CM_InlineModel(cl.configstrings[CS_MODELS + i]);
// 			} else {
// 				cl.model_clip[i] = NULL;
// 			}
		}

		if (name[0] != '*') {
			Com_Printf("                                     \r");
		}
	}

	Com_Printf("images\r");
	await SCR_UpdateScreen();

	for (let i = 1; i < SHARED.MAX_IMAGES && cl.configstrings[SHARED.CS_IMAGES + i]; i++) {
		cl.image_precache[i] = await Draw_FindPic(cl.configstrings[SHARED.CS_IMAGES + i]);
		await Key_Update();
	}

	Com_Printf("                                     \r");

	for (let i = 0; i < SHARED.MAX_CLIENTS; i++) {
		if (!cl.configstrings[SHARED.CS_PLAYERSKINS + i]) {
			continue;
		}

		Com_Printf(`client ${i}\r`);
		await SCR_UpdateScreen();
		await Key_Update();
        await CL_ParseClientinfo(i);
		Com_Printf("                                     \r");
	}

	await CL_LoadClientinfo(cl.baseclientinfo, "unnamed\\male/grunt");

	/* set sky textures and speed */
	Com_Printf("sky\r");
	await SCR_UpdateScreen();
    let rotate = parseFloat(cl.configstrings[SHARED.CS_SKYROTATE]);
    let axisStrs = cl.configstrings[SHARED.CS_SKYAXIS].split(' ');
    let axis = [0,0,0]
    if (axisStrs.length > 0) axis[0] = parseFloat(axisStrs[0])
    if (axisStrs.length > 1) axis[1] = parseFloat(axisStrs[1])
    if (axisStrs.length > 2) axis[2] = parseFloat(axisStrs[2])
// 	R_SetSky(cl.configstrings[CS_SKY], rotate, axis);
	Com_Printf("                                     \r");

	/* the renderer can now free unneeded stuff */
// 	R_EndRegistration();

	/* clear any lines of console text */
// 	Con_ClearNotify();

	await SCR_UpdateScreen();
	cl.refresh_prepped = true;
	cl.force_refdef = true; /* make sure we have a valid refdef */

	/* start the cd track */
// 	int track = (int)strtol(cl.configstrings[CS_CDTRACK], (char **)NULL, 10);

// 	OGG_PlayTrack(track);
}

function CalcFov(fov_x: number, width: number, height: number): number {

	if ((fov_x < 1) || (fov_x > 179)) {
		Com_Error(SHARED.ERR_DROP, `Bad fov: ${fov_x}`);
	}

	let x = width / Math.tan(fov_x / 360 * Math.PI);

	let a = Math.atan(height / x);

	a = a * 360 / Math.PI;

	return a;
}


export async function V_RenderView(stereo_separation: number) {
	if (cls.state != connstate_t.ca_active) {
	// 	R_EndWorldRenderpass();
		return;
	}

	if (!cl.refresh_prepped) {
		// R_EndWorldRenderpass();
		return;			// still loading
	}

	// if (cl_timedemo->value)
	// {
	// 	if (!cl.timedemo_start)
	// 	{
	// 		cl.timedemo_start = Sys_Milliseconds();
	// 	}

	// 	cl.timedemo_frames++;
	// }

	/* an invalid frame will just use the exact previous refdef
	   we can't use the old frame if the video mode has changed, though... */
	if (cl.frame.valid && (cl.force_refdef || !cl_paused.bool)) {
		cl.force_refdef = false;

		V_ClearScene();

		/* build a refresh entity list and calc cl.sim*
		   this also calls CL_CalcViewValues which loads
		   v_forward, etc. */
		CL_AddEntities();

		// // before changing viewport we should trace the crosshair position
		// V_Render3dCrosshair();

		// if (cl_testparticles->value)
		// {
		// 	V_TestParticles();
		// }

		// if (cl_testentities->value)
		// {
		// 	V_TestEntities();
		// }

		// if (cl_testlights->value)
		// {
		// 	V_TestLights();
		// }

		// if (cl_testblend->value)
		// {
		// 	cl.refdef.blend[0] = 1;
		// 	cl.refdef.blend[1] = 0.5;
		// 	cl.refdef.blend[2] = 0.25;
		// 	cl.refdef.blend[3] = 0.5;
		// }

		// /* offset vieworg appropriately if
		//    we're doing stereo separation */

		// if (stereo_separation != 0)
		// {
		// 	vec3_t tmp;

		// 	VectorScale(cl.v_right, stereo_separation, tmp);
		// 	VectorAdd(cl.refdef.vieworg, tmp, cl.refdef.vieworg);
		// }

		/* never let it sit exactly on a node line, because a water plane can
		   dissapear when viewed with the eye exactly on it. the server protocol
		   only specifies to 1/8 pixel, so add 1/16 in each axis */
		cl.refdef.vieworg[0] += 1.0 / 16;
		cl.refdef.vieworg[1] += 1.0 / 16;
		cl.refdef.vieworg[2] += 1.0 / 16;

		cl.refdef.time = cl.time * 0.001;

		cl.refdef.areabits = cl.frame.areabits;

		// if (!cl_add_entities->value)
		// {
		// 	r_numentities = 0;
		// }

		// if (!cl_add_particles->value)
		// {
		// 	r_numparticles = 0;
		// }

		// if (!cl_add_lights->value)
		// {
		// 	r_numdlights = 0;
		// }

		// if (!cl_add_blend->value)
		// {
		// 	VectorClear(cl.refdef.blend);
		// }

		cl.refdef.entities = r_entities
		// cl.refdef.particles = r_particles;
		// cl.refdef.dlights = r_dlights;
		cl.refdef.lightstyles = r_lightstyles;

		cl.refdef.rdflags = cl.frame.playerstate.rdflags;

		// /* sort entities for better cache locality */
		// qsort(cl.refdef.entities, cl.refdef.num_entities,
		// 		sizeof(cl.refdef.entities[0]), (int (*)(const void *, const void *))
		// 		entitycmpfnc);
	// } else if (cl.frame.valid && cl_paused.bool && gl1_stereo->value) {
	// 	// We need to adjust the refdef in stereo mode when paused.
	// 	vec3_t tmp;
	// 	CL_CalcViewValues();
	// 	VectorScale( cl.v_right, stereo_separation, tmp );
	// 	VectorAdd( cl.refdef.vieworg, tmp, cl.refdef.vieworg );

	// 	cl.refdef.vieworg[0] += 1.0/16;
	// 	cl.refdef.vieworg[1] += 1.0/16;
	// 	cl.refdef.vieworg[2] += 1.0/16;

	// 	cl.refdef.time = cl.time*0.001;
	}

	cl.refdef.x = scr_vrect.x;
	cl.refdef.y = scr_vrect.y;
	cl.refdef.width = scr_vrect.width;
	cl.refdef.height = scr_vrect.height;
	cl.refdef.fov_y = CalcFov(cl.refdef.fov_x, cl.refdef.width, cl.refdef.height);

	await R_RenderFrame(cl.refdef);

	// if (cl_stats->value)
	// {
	// 	Com_Printf("ent:%i  lt:%i  part:%i\n", r_numentities,
	// 			r_numdlights, r_numparticles);
	// }

	// if (log_stats->value && (log_stats_file != 0))
	// {
	// 	fprintf(log_stats_file, "%i,%i,%i,", r_numentities,
	// 			r_numdlights, r_numparticles);
	// }

	// SCR_AddDirtyPoint(scr_vrect.x, scr_vrect.y);
	// SCR_AddDirtyPoint(scr_vrect.x + scr_vrect.width - 1,
	// 		scr_vrect.y + scr_vrect.height - 1);

	// SCR_DrawCrosshair();
}