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
 * This file implements all static entities at client site.
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { UPDATE_MASK } from "../common/common";
import { connstate_t, frame_t, MAX_CLIENTWEAPONMODELS, MAX_PARSE_ENTITIES } from "./client";
import { cl, cls, cl_entities, cl_kickangles, cl_parse_entities, cl_paused, cl_predict, cl_showclamp, cl_vwep, horplus } from "./cl_main";
import { entity_t } from "./ref";
import { gun_frame, gun_model, V_AddEntity } from "./cl_view";
import { CL_AddDLights, CL_AddLightStyles } from "./cl_light";
import { Com_Printf } from "../common/clientserver";

function CL_AddPacketEntities(frame: frame_t) {
	// entity_t ent = {0};
	// entity_state_t *s1;
	// float autorotate;
	// int i;
	// int pnum;
	// centity_t *cent;
	// int autoanim;
	// clientinfo_t *ci;
	// unsigned int effects, renderfx;

    let ent = new entity_t()

	// /* To distinguish baseq2, xatrix and rogue. */
	// cvar_t *game = Cvar_Get("game",  "", CVAR_LATCH | CVAR_SERVERINFO);

	/* bonus items rotate at a fixed rate */
	// let autorotate = SHARED.anglemod(cl.time * 0.1);

	/* brush models can auto animate their frames */
	let autoanim = ~~(2 * cl.time / 1000);

	for (let pnum = 0; pnum < frame.num_entities; pnum++)
	{
		let s1 = cl_parse_entities[(frame.parse_entities + pnum) & (MAX_PARSE_ENTITIES - 1)];

		let cent = cl_entities[s1.number];

		let effects = s1.effects;
		let renderfx = s1.renderfx;

		/* set frame */
		if (effects & SHARED.EF_ANIM01) {
			ent.frame = autoanim & 1;
		}

		else if (effects & SHARED.EF_ANIM23)
		{
			ent.frame = 2 + (autoanim & 1);
		}

		else if (effects & SHARED.EF_ANIM_ALL)
		{
			ent.frame = autoanim;
		}

		else if (effects & SHARED.EF_ANIM_ALLFAST)
		{
			ent.frame = cl.time / 100;
		}

		else
		{
			ent.frame = s1.frame;
		}

		/* quad and pent can do different things on client */
		if (effects & SHARED.EF_PENT)
		{
			effects &= ~SHARED.EF_PENT;
			effects |= SHARED.EF_COLOR_SHELL;
			renderfx |= SHARED.RF_SHELL_RED;
		}

		if (effects & SHARED.EF_QUAD)
		{
			effects &= ~SHARED.EF_QUAD;
			effects |= SHARED.EF_COLOR_SHELL;
			renderfx |= SHARED.RF_SHELL_BLUE;
		}

		if (effects & SHARED.EF_DOUBLE)
		{
			effects &= ~SHARED.EF_DOUBLE;
			effects |= SHARED.EF_COLOR_SHELL;
			renderfx |= SHARED.RF_SHELL_DOUBLE;
		}

		if (effects & SHARED.EF_HALF_DAMAGE)
		{
			effects &= ~SHARED.EF_HALF_DAMAGE;
			effects |= SHARED.EF_COLOR_SHELL;
			renderfx |= SHARED.RF_SHELL_HALF_DAM;
		}

		ent.oldframe = cent.prev.frame;
		ent.backlerp = 1.0 - cl.lerpfrac;

		if (renderfx & (SHARED.RF_FRAMELERP | SHARED.RF_BEAM))
		{
			/* step origin discretely, because the
			   frames do the animation properly */
            SHARED.VectorCopy(cent.current.origin, ent.origin);
            SHARED.VectorCopy(cent.current.old_origin, ent.oldorigin);
		}
		else
		{
			/* interpolate origin */
			for (let i = 0; i < 3; i++)
			{
				ent.origin[i] = ent.oldorigin[i] = cent.prev.origin[i] + cl.lerpfrac *
				   	(cent.current.origin[i] - cent.prev.origin[i]);
			}
		}

		/* tweak the color of beams */
		if (renderfx & SHARED.RF_BEAM)
		{
			/* the four beam colors are encoded in 32 bits of skinnum (hack) */
			ent.alpha = 0.30;
			ent.skinnum = (s1.skinnum >> ((SHARED.randk() % 4) * 8)) & 0xff;
			ent.model = null;
		}
		else
		{
			/* set skin */
			if (s1.modelindex == 255)
			{
				/* use custom player skin */
				ent.skinnum = 0;
				let ci = cl.clientinfo[s1.skinnum & 0xff];
				ent.skin = ci.skin;
				ent.model = ci.model;

				if (!ent.skin || !ent.model) {
					ent.skin = cl.baseclientinfo.skin;
					ent.model = cl.baseclientinfo.model;
				}

	// 			if (renderfx & RF_USE_DISGUISE)
	// 			{
	// 				if (ent.skin != NULL)
	// 				{
	// 					if (!strncmp((char *)ent.skin, "players/male", 12))
	// 					{
	// 						ent.skin = R_RegisterSkin("players/male/disguise.pcx");
	// 						ent.model = R_RegisterModel("players/male/tris.md2");
	// 					}
	// 					else if (!strncmp((char *)ent.skin, "players/female", 14))
	// 					{
	// 						ent.skin = R_RegisterSkin("players/female/disguise.pcx");
	// 						ent.model = R_RegisterModel("players/female/tris.md2");
	// 					}
	// 					else if (!strncmp((char *)ent.skin, "players/cyborg", 14))
	// 					{
	// 						ent.skin = R_RegisterSkin("players/cyborg/disguise.pcx");
	// 						ent.model = R_RegisterModel("players/cyborg/tris.md2");
	// 					}
	// 				}
	// 			}
			}
			else
			{
				ent.skinnum = s1.skinnum;
				ent.skin = null;
				ent.model = cl.model_draw[s1.modelindex];
			}
		}

		/* only used for black hole model right now */
		if (renderfx & SHARED.RF_TRANSLUCENT && !(renderfx & SHARED.RF_BEAM))
		{
			ent.alpha = 0.70;
		}

		/* render effects (fullbright, translucent, etc) */
		if ((effects & SHARED.EF_COLOR_SHELL))
		{
			ent.flags = 0; /* renderfx go on color shell entity */
		}
		else
		{
			ent.flags = renderfx;
		}

		/* calculate angles */
	// 	if (effects & SHARED.EF_ROTATE)
	// 	{
	// 		/* some bonus items auto-rotate */
	// 		ent.angles[0] = 0;
	// 		ent.angles[1] = autorotate;
	// 		ent.angles[2] = 0;
	// 	}
	// 	else if (effects & SHARED.EF_SPINNINGLIGHTS)
	// 	{
	// 		ent.angles[0] = 0;
	// 		ent.angles[1] = anglemod(cl.time / 2) + s1->angles[1];
	// 		ent.angles[2] = 180;
	// 		{
	// 			vec3_t forward;
	// 			vec3_t start;

	// 			AngleVectors(ent.angles, forward, NULL, NULL);
	// 			VectorMA(ent.origin, 64, forward, start);
	// 			V_AddLight(start, 100, 1, 0, 0);
	// 		}
	// 	}
	// 	else
	// 	{
			/* interpolate angles */
			for (let i = 0; i < 3; i++)
			{
				let a1 = cent.current.angles[i];
				let a2 = cent.prev.angles[i];
				ent.angles[i] = SHARED.LerpAngle(a2, a1, cl.lerpfrac);
			}
	// 	}

		if (s1.number == cl.playernum + 1)
		{
			ent.flags |= SHARED.RF_VIEWERMODEL;

	// 		if (effects & SHARED.EF_FLAG1)
	// 		{
	// 			V_AddLight(ent.origin, 225, 1.0f, 0.1f, 0.1f);
	// 		}

	// 		else if (effects & SHARED.EF_FLAG2)
	// 		{
	// 			V_AddLight(ent.origin, 225, 0.1f, 0.1f, 1.0f);
	// 		}

	// 		else if (effects & SHARED.EF_TAGTRAIL)
	// 		{
	// 			V_AddLight(ent.origin, 225, 1.0f, 1.0f, 0.0f);
	// 		}

	// 		else if (effects & SHARED.EF_TRACKERTRAIL)
	// 		{
	// 			V_AddLight(ent.origin, 225, -1.0f, -1.0f, -1.0f);
	// 		}

			continue;
		}

		/* if set to invisible, skip */
		if (s1.modelindex == 0)
		{
			continue;
		}

	// 	if (effects & SHARED.EF_BFG)
	// 	{
	// 		ent.flags |= RF_TRANSLUCENT;
	// 		ent.alpha = 0.30f;
	// 	}

	// 	if (effects & SHARED.EF_PLASMA)
	// 	{
	// 		ent.flags |= RF_TRANSLUCENT;
	// 		ent.alpha = 0.6f;
	// 	}

	// 	if (effects & SHARED.EF_SPHERETRANS)
	// 	{
	// 		ent.flags |= RF_TRANSLUCENT;

	// 		if (effects & EF_TRACKERTRAIL)
	// 		{
	// 			ent.alpha = 0.6f;
	// 		}

	// 		else
	// 		{
	// 			ent.alpha = 0.3f;
	// 		}
	// 	}

		/* add to refresh list */
        V_AddEntity(ent);

		/* color shells generate a seperate entity for the main model */
	// 	if (effects & EF_COLOR_SHELL)
	// 	{
	// 		/* all of the solo colors are fine.  we need to catch any of
	// 		   the combinations that look bad (double & half) and turn
	// 		   them into the appropriate color, and make double/quad
	// 		   something special */
	// 		if (renderfx & RF_SHELL_HALF_DAM)
	// 		{
	// 			if (strcmp(game->string, "rogue") == 0)
	// 			{
	// 				/* ditch the half damage shell if any of red, blue, or double are on */
	// 				if (renderfx & (RF_SHELL_RED | RF_SHELL_BLUE | RF_SHELL_DOUBLE))
	// 				{
	// 					renderfx &= ~RF_SHELL_HALF_DAM;
	// 				}
	// 			}
	// 		}

	// 		if (renderfx & RF_SHELL_DOUBLE)
	// 		{
	// 			if (strcmp(game->string, "rogue") == 0)
	// 			{
	// 				/* lose the yellow shell if we have a red, blue, or green shell */
	// 				if (renderfx & (RF_SHELL_RED | RF_SHELL_BLUE | RF_SHELL_GREEN))
	// 				{
	// 					renderfx &= ~RF_SHELL_DOUBLE;
	// 				}

	// 				/* if we have a red shell, turn it to purple by adding blue */
	// 				if (renderfx & RF_SHELL_RED)
	// 				{
	// 					renderfx |= RF_SHELL_BLUE;
	// 				}

	// 				/* if we have a blue shell (and not a red shell),
	// 				   turn it to cyan by adding green */
	// 				else if (renderfx & RF_SHELL_BLUE)
	// 				{
	// 					/* go to green if it's on already,
	// 					   otherwise do cyan (flash green) */
	// 					if (renderfx & RF_SHELL_GREEN)
	// 					{
	// 						renderfx &= ~RF_SHELL_BLUE;
	// 					}

	// 					else
	// 					{
	// 						renderfx |= RF_SHELL_GREEN;
	// 					}
	// 				}
	// 			}
	// 		}

	// 		ent.flags = renderfx | RF_TRANSLUCENT;
	// 		ent.alpha = 0.30f;
	// 		V_AddEntity(&ent);
	// 	}

		ent.skin = null; /* never use a custom skin on others */
		ent.skinnum = 0;
		ent.flags = 0;
		ent.alpha = 0;

		/* duplicate for linked models */
		if (s1.modelindex2) {
			if (s1.modelindex2 == 255) {
				/* custom weapon */
				let ci = cl.clientinfo[s1.skinnum & 0xff];
				let i = (s1.skinnum >> 8); /* 0 is default weapon model */

				if (!cl_vwep.bool || (i > MAX_CLIENTWEAPONMODELS - 1)) {
					i = 0;
				}

				ent.model = ci.weaponmodel[i];

				if (!ent.model) {
					if (i != 0) {
						ent.model = ci.weaponmodel[0];
					}

					if (!ent.model) {
						ent.model = cl.baseclientinfo.weaponmodel[0];
					}
				}
			} else {
				ent.model = cl.model_draw[s1.modelindex2];
			}

	// 		/* check for the defender sphere shell and make it translucent */
	// 		if (!Q_strcasecmp(cl.configstrings[CS_MODELS + (s1->modelindex2)],
	// 					"models/items/shell/tris.md2"))
	// 		{
	// 			ent.alpha = 0.32f;
	// 			ent.flags = RF_TRANSLUCENT;
	// 		}

			V_AddEntity(ent);

			ent.flags = 0;
			ent.alpha = 0;
		}

		if (s1.modelindex3) {
			ent.model = cl.model_draw[s1.modelindex3];
			V_AddEntity(ent);
		}

		if (s1.modelindex4) {
			ent.model = cl.model_draw[s1.modelindex4];
			V_AddEntity(ent);
		}

	// 	if (effects & EF_POWERSCREEN)
	// 	{
	// 		ent.model = cl_mod_powerscreen;
	// 		ent.oldframe = 0;
	// 		ent.frame = 0;
	// 		ent.flags |= (RF_TRANSLUCENT | RF_SHELL_GREEN);
	// 		ent.alpha = 0.30f;
	// 		V_AddEntity(&ent);
	// 	}

	// 	/* add automatic particle trails */
	// 	if ((effects & ~EF_ROTATE))
	// 	{
	// 		if (effects & EF_ROCKET)
	// 		{
	// 			CL_RocketTrail(cent->lerp_origin, ent.origin, cent);

	// 			if (cl_r1q2_lightstyle->value)
	// 			{
	// 				V_AddLight(ent.origin, 200, 1, 0.23f, 0);
	// 			}
	// 			else
	// 			{
	// 				V_AddLight(ent.origin, 200, 1, 1, 0);
	// 			}
	// 		}

	// 		/* Do not reorder EF_BLASTER and EF_HYPERBLASTER.
	// 		   EF_BLASTER | EF_TRACKER is a special case for
	// 		   EF_BLASTER2 */
	// 		else if (effects & EF_BLASTER)
	// 		{
	// 			if (effects & EF_TRACKER)
	// 			{
	// 				CL_BlasterTrail2(cent->lerp_origin, ent.origin);
	// 				V_AddLight(ent.origin, 200, 0, 1, 0);
	// 			}
	// 			else
	// 			{
	// 				CL_BlasterTrail(cent->lerp_origin, ent.origin);
	// 				V_AddLight(ent.origin, 200, 1, 1, 0);
	// 			}
	// 		}
	// 		else if (effects & EF_HYPERBLASTER)
	// 		{
	// 			if (effects & EF_TRACKER)
	// 			{
	// 				V_AddLight(ent.origin, 200, 0, 1, 0);
	// 			}
	// 			else
	// 			{
	// 				V_AddLight(ent.origin, 200, 1, 1, 0);
	// 			}
	// 		}
	// 		else if (effects & EF_GIB)
	// 		{
	// 			CL_DiminishingTrail(cent->lerp_origin, ent.origin,
	// 					cent, effects);
	// 		}
	// 		else if (effects & EF_GRENADE)
	// 		{
	// 			CL_DiminishingTrail(cent->lerp_origin, ent.origin,
	// 					cent, effects);
	// 		}
	// 		else if (effects & EF_FLIES)
	// 		{
	// 			CL_FlyEffect(cent, ent.origin);
	// 		}
	// 		else if (effects & EF_BFG)
	// 		{
	// 			static int bfg_lightramp[6] = {300, 400, 600, 300, 150, 75};

	// 			if (effects & EF_ANIM_ALLFAST)
	// 			{
	// 				CL_BfgParticles(&ent);
	// 				i = 200;
	// 			}
	// 			else
	// 			{
	// 				i = bfg_lightramp[s1->frame];
	// 			}

	// 			V_AddLight(ent.origin, i, 0, 1, 0);
	// 		}
	// 		else if (effects & EF_TRAP)
	// 		{
	// 			ent.origin[2] += 32;
	// 			CL_TrapParticles(&ent);
	// 			i = (randk() % 100) + 100;
	// 			V_AddLight(ent.origin, i, 1, 0.8f, 0.1f);
	// 		}
	// 		else if (effects & EF_FLAG1)
	// 		{
	// 			CL_FlagTrail(cent->lerp_origin, ent.origin, 242);
	// 			V_AddLight(ent.origin, 225, 1, 0.1f, 0.1f);
	// 		}
	// 		else if (effects & EF_FLAG2)
	// 		{
	// 			CL_FlagTrail(cent->lerp_origin, ent.origin, 115);
	// 			V_AddLight(ent.origin, 225, 0.1f, 0.1f, 1);
	// 		}
	// 		else if (effects & EF_TAGTRAIL)
	// 		{
	// 			CL_TagTrail(cent->lerp_origin, ent.origin, 220);
	// 			V_AddLight(ent.origin, 225, 1.0, 1.0, 0.0);
	// 		}
	// 		else if (effects & EF_TRACKERTRAIL)
	// 		{
	// 			if (effects & EF_TRACKER)
	// 			{
	// 				float intensity;

	// 				intensity = 50 + (500 * ((float)sin(cl.time / 500.0f) + 1.0f));
	// 				V_AddLight(ent.origin, intensity, -1.0, -1.0, -1.0);
	// 			}
	// 			else
	// 			{
	// 				CL_Tracker_Shell(cent->lerp_origin);
	// 				V_AddLight(ent.origin, 155, -1.0, -1.0, -1.0);
	// 			}
	// 		}
	// 		else if (effects & EF_TRACKER)
	// 		{
	// 			CL_TrackerTrail(cent->lerp_origin, ent.origin, 0);
	// 			V_AddLight(ent.origin, 200, -1, -1, -1);
	// 		}
	// 		else if (effects & EF_IONRIPPER)
	// 		{
	// 			CL_IonripperTrail(cent->lerp_origin, ent.origin);
	// 			V_AddLight(ent.origin, 100, 1, 0.5, 0.5);
	// 		}
	// 		else if (effects & EF_BLUEHYPERBLASTER)
	// 		{
	// 			V_AddLight(ent.origin, 200, 0, 0, 1);
	// 		}
	// 		else if (effects & EF_PLASMA)
	// 		{
	// 			if (effects & EF_ANIM_ALLFAST)
	// 			{
	// 				CL_BlasterTrail(cent->lerp_origin, ent.origin);
	// 			}

	// 			V_AddLight(ent.origin, 130, 1, 0.5, 0.5);
	// 		}
	// 	}

		SHARED.VectorCopy(ent.origin, cent.lerp_origin);
	}
}

function CL_AddViewWeapon(ps: SHARED.player_state_t, ops: SHARED.player_state_t)
{
    let gun = new entity_t()    /* view model */

	/* allow the gun to be completely removed */
	// if (!cl_gun->value)
	// {
	// 	return;
	// }

	/* don't draw gun if in wide angle view and drawing not forced */
	if (ps.fov > 90) {
	// 	if (cl_gun->value < 2)
	// 	{
	// 		return;
	// 	}
	}

	if (gun_model) {
		gun.model = gun_model;
	}  else {
		gun.model = cl.model_draw[ps.gunindex];
	}

	if (!gun.model) {
		return;
	}

	/* set up gun position */
	for (let i = 0; i < 3; i++)
	{
		gun.origin[i] = cl.refdef.vieworg[i] + ops.gunoffset[i]
			+ cl.lerpfrac * (ps.gunoffset[i] - ops.gunoffset[i]);
		gun.angles[i] = cl.refdef.viewangles[i] + SHARED.LerpAngle(ops.gunangles[i],
			ps.gunangles[i], cl.lerpfrac);
	}

	if (gun_frame)
	{
		gun.frame = gun_frame;
		gun.oldframe = gun_frame;
	}
	else
	{
		gun.frame = ps.gunframe;

		if (gun.frame == 0)
		{
			gun.oldframe = 0; /* just changed weapons, don't lerp from old */
		}
		else
		{
			gun.oldframe = ops.gunframe;
		}
	}

	gun.flags = SHARED.RF_MINLIGHT | SHARED.RF_DEPTHHACK | SHARED.RF_WEAPONMODEL;
	gun.backlerp = 1.0 - cl.lerpfrac;
	SHARED.VectorCopy(gun.origin, gun.oldorigin); /* don't lerp at all */
	V_AddEntity(gun);
}

/*
 * Adapts a 4:3 aspect FOV to the current aspect (Hor+)
 */
function AdaptFov(fov: number, w: number, h: number): number {

	if (w <= 0 || h <= 0)
		return fov;

	/*
	 * Formula:
	 *
	 * fov = 2.0 * atan(width / height * 3.0 / 4.0 * tan(fov43 / 2.0))
	 *
	 * The code below is equivalent but precalculates a few values and
	 * converts between degrees and radians when needed.
	 */
	return (Math.atan(Math.tan(fov / 360.0 * Math.PI) * (w / h * 0.75)) / Math.PI * 360.0);
}

/*
 * Sets cl.refdef view values
 */
export function CL_CalcViewValues() {

	/* find the previous frame to interpolate from */
	let ps = cl.frame.playerstate;
	let i = (cl.frame.serverframe - 1) & UPDATE_MASK;
	let oldframe = cl.frames[i];

	if ((oldframe.serverframe != cl.frame.serverframe - 1) || !oldframe.valid) {
		oldframe = cl.frame; /* previous frame was dropped or invalid */
	}

	let ops = oldframe.playerstate;

	/* see if the player entity was teleported this frame */
	if ((Math.abs(ops.pmove.origin[0] - ps.pmove.origin[0]) > 256 * 8) ||
		(Math.abs(ops.pmove.origin[1] - ps.pmove.origin[1]) > 256 * 8) ||
		(Math.abs(ops.pmove.origin[2] - ps.pmove.origin[2]) > 256 * 8))
	{
		ops = ps; /* don't interpolate */
	}

    let lerp = cl.lerpfrac
	if(cl_paused.bool){
		lerp = 1.0;
	}

	/* calculate the origin */
	if ((cl_predict.bool) && (cl.frame.playerstate.pmove.pm_flags & SHARED.PMF_NO_PREDICTION) == 0) {
		/* use predicted values */

		let backlerp = 1.0 - lerp;

		for (let i = 0; i < 3; i++) {
			cl.refdef.vieworg[i] = cl.predicted_origin[i] + ops.viewoffset[i] +
				cl.lerpfrac * (ps.viewoffset[i] - ops.viewoffset[i]) -
				backlerp * cl.prediction_error[i];
		}

		/* smooth out stair climbing */
		let delta = ~~(cls.realtime - cl.predicted_step_time)

		if (delta < 100) {
			cl.refdef.vieworg[2] -= cl.predicted_step * (100 - delta) * 0.01;
		}
	} else {

		/* just use interpolated values */
		for (let i = 0; i < 3; i++)
		{
			cl.refdef.vieworg[i] = ops.pmove.origin[i] * 0.125 +
				ops.viewoffset[i] + lerp * (ps.pmove.origin[i] * 0.125 +
						ps.viewoffset[i] - (ops.pmove.origin[i] * 0.125 +
							ops.viewoffset[i]));
		}
	}

	/* if not running a demo or on a locked frame, add the local angle movement */
	if (cl.frame.playerstate.pmove.pm_type < SHARED.pmtype_t.PM_DEAD) {
		/* use predicted values */
		for (let i = 0; i < 3; i++) {
			cl.refdef.viewangles[i] = cl.predicted_angles[i];
		}
	}
	else
	{
		/* just use interpolated values */
		for (let i = 0; i < 3; i++)
		{
			cl.refdef.viewangles[i] = SHARED.LerpAngle(ops.viewangles[i], ps.viewangles[i], lerp);
		}
	}

	if (cl_kickangles.bool) {
		for (let i = 0; i < 3; i++) {
			cl.refdef.viewangles[i] += SHARED.LerpAngle(ops.kick_angles[i], ps.kick_angles[i], lerp);
		}
	}

	SHARED.AngleVectors(cl.refdef.viewangles, cl.v_forward, cl.v_right, cl.v_up);

	/* interpolate field of view */
	let ifov = ops.fov + lerp * (ps.fov - ops.fov);
	if (horplus.bool) {
		cl.refdef.fov_x = AdaptFov(ifov, cl.refdef.width, cl.refdef.height);
	} else {
		cl.refdef.fov_x = ifov;
	}

	/* don't interpolate blend color */
	for (let i = 0; i < 4; i++) {
		cl.refdef.blend[i] = ps.blend[i];
	}

	/* add the weapon */
	CL_AddViewWeapon(ps, ops);
}

/*
 * Emits all entities, particles, and lights to the refresh
 */
export function CL_AddEntities() {
	if (cls.state != connstate_t.ca_active) {
		return;
	}

	if (cl.time > cl.frame.servertime) {
		if (cl_showclamp.bool) {
			Com_Printf(`high clamp ${~~(cl.time - cl.frame.servertime)}\n`);
		}

		cl.time = cl.frame.servertime;
		cl.lerpfrac = 1.0;
	}
	else if (cl.time < cl.frame.servertime - 100)
	{
		if (cl_showclamp.bool) {
			Com_Printf(`low clamp ${~~(cl.frame.servertime - 100 - cl.time)}\n`);
		}

		cl.time = ~~(cl.frame.servertime - 100);
		cl.lerpfrac = 0;
	}
	else
	{
		cl.lerpfrac = 1.0 - (cl.frame.servertime - cl.time) * 0.01;
	}

	// if (cl_timedemo->value)
	// {
	// 	cl.lerpfrac = 1.0;
	// }

	CL_CalcViewValues();
	CL_AddPacketEntities(cl.frame);
	// CL_AddTEnts();
	// CL_AddParticles();
	CL_AddDLights();
	CL_AddLightStyles();
}
