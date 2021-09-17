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
 * Player movement code. This is the core of Quake IIs legendary physics
 * engine
 *
 * =======================================================================
 */
import * as SHARED from "./shared"

const STEPSIZE = 18

/* all of the locals will be zeroed before each
 * pmove, just to make damn sure we don't have
 * any differences when running on client or server */

class pml_t {
	origin = [0,0,0]; /* full float precision */
	velocity = [0,0,0] /* full float precision */

	forward = [0,0,0]
    right = [0,0,0]
    up = [0,0,0]
	frametime = 0

	// csurface_t *groundsurface;
	// cplane_t groundplane;
	groundcontents = 0

	previous_origin = [0,0,0]
	ladder = false
}

let pm: SHARED.pmove_t
let pml: pml_t

/* movement parameters */
let pm_stopspeed = 100;
let pm_maxspeed = 300;
let pm_duckspeed = 100;
let pm_accelerate = 10;
let pm_airaccelerate = 0;
let pm_wateraccelerate = 10;
let pm_friction = 6;
let pm_waterfriction = 1;
let pm_waterspeed = 400;

export function SetAirAccelerate(v: number) {
    pm_airaccelerate = v
}

const STOP_EPSILON = 0.1 /* Slide off of the impacting object returns the blocked flags (1 = floor, 2 = step / wall) */
const MIN_STEP_NORMAL = 0.7 /* can't step up onto very steep slopes */
const MAX_CLIP_PLANES = 5  

function PM_AirMove() {
	// int i;
	// vec3_t wishvel;
	// float fmove, smove;
	// vec3_t wishdir;
	// float wishspeed;
	// float maxspeed;

	let fmove = pm.cmd.forwardmove;
	let smove = pm.cmd.sidemove;

    let wishvel = [0,0,0]
	for (let i = 0; i < 2; i++) {
		wishvel[i] = pml.forward[i] * fmove + pml.right[i] * smove;
	}

	wishvel[2] = 0

	// PM_AddCurrents(wishvel);

    let wishdir = [0,0,0]
	SHARED.VectorCopy(wishvel, wishdir);
	let wishspeed = SHARED.VectorNormalize(wishdir);

	/* clamp to server defined max speed */
	let maxspeed = (pm.s.pm_flags & SHARED.PMF_DUCKED) ? pm_duckspeed : pm_maxspeed;

	if (wishspeed > maxspeed) {
		SHARED.VectorScale(wishvel, maxspeed / wishspeed, wishvel);
		wishspeed = maxspeed;
	}

	// if (pml.ladder)
	// {
	// 	PM_Accelerate(wishdir, wishspeed, pm_accelerate);

	// 	if (!wishvel[2])
	// 	{
	// 		if (pml.velocity[2] > 0)
	// 		{
	// 			pml.velocity[2] -= pm->s.gravity * pml.frametime;

	// 			if (pml.velocity[2] < 0)
	// 			{
	// 				pml.velocity[2] = 0;
	// 			}
	// 		}
	// 		else
	// 		{
	// 			pml.velocity[2] += pm->s.gravity * pml.frametime;

	// 			if (pml.velocity[2] > 0)
	// 			{
	// 				pml.velocity[2] = 0;
	// 			}
	// 		}
	// 	}

	// 	PM_StepSlideMove();
	// }
	// else if (pm->groundentity)
	// {
		/* walking on ground */
		pml.velocity[2] = 0;
	// 	PM_Accelerate(wishdir, wishspeed, pm_accelerate);

		if (pm.s.gravity > 0) {
			pml.velocity[2] = 0;
		} else {
			pml.velocity[2] -= pm.s.gravity * pml.frametime;
		}

		if (!pml.velocity[0] && !pml.velocity[1]) {
			return;
		}

	// 	PM_StepSlideMove();
	// }
	// else
	// {
	// 	/* not on ground, so little effect on velocity */
	// 	if (pm_airaccelerate)
	// 	{
	// 		PM_AirAccelerate(wishdir, wishspeed, pm_accelerate);
	// 	}
	// 	else
	// 	{
	// 		PM_Accelerate(wishdir, wishspeed, 1);
	// 	}

	// 	/* add gravity */
	// 	pml.velocity[2] -= pm->s.gravity * pml.frametime;
	// 	PM_StepSlideMove();
	// }
}


/*
 * Sets mins, maxs, and pm->viewheight
 */
function PM_CheckDuck()
{
	// trace_t trace;

	pm.mins[0] = -16;
	pm.mins[1] = -16;

	pm.maxs[0] = 16;
	pm.maxs[1] = 16;

	if (pm.s.pm_type == SHARED.pmtype_t.PM_GIB)
	{
		pm.mins[2] = 0;
		pm.maxs[2] = 16;
		pm.viewheight = 8;
		return;
	}

	pm.mins[2] = -24;

	if (pm.s.pm_type == SHARED.pmtype_t.PM_DEAD)
	{
		pm.s.pm_flags |= SHARED.PMF_DUCKED;
	}
	else if ((pm.cmd.upmove < 0) && (pm.s.pm_flags & SHARED.PMF_ON_GROUND))
	{
		/* duck */
		pm.s.pm_flags |= SHARED.PMF_DUCKED;
	}
	else
	{
		/* stand up if possible */
		if (pm.s.pm_flags & SHARED.PMF_DUCKED)
		{
			/* try to stand up */
			pm.maxs[2] = 32;
			// trace = pm->trace(pml.origin, pm->mins, pm->maxs, pml.origin);

			// if (!trace.allsolid)
			// {
			// 	pm->s.pm_flags &= ~SHARED.PMF_DUCKED;
			// }
		}
	}

	if (pm.s.pm_flags & SHARED.PMF_DUCKED)
	{
		pm.maxs[2] = 4;
		pm.viewheight = -2;
	}
	else
	{
		pm.maxs[2] = 32;
		pm.viewheight = 22;
	}
}

function PM_GoodPosition(): boolean {

	if (pm.s.pm_type == SHARED.pmtype_t.PM_SPECTATOR) {
		return true;
	}

    // let origin = [0,0,0]
    // let end = [0,0,0]
	// for (let i = 0; i < 3; i++) {
	// 	origin[i] = end[i] = pm.s.origin[i] * 0.125;
	// }

	// trace = pm->trace(origin, pm->mins, pm->maxs, end);

	// return !trace.allsolid;
    return true
}

/*
 * On exit, the origin will have a value that is pre-quantized to the 0.125
 * precision of the network channel and in a valid position.
 */
function PM_SnapPosition()
{
	/* try all single bits first */
	const jitterbits = [ 0, 4, 1, 2, 3, 5, 6, 7 ];

	/* snap velocity to eigths */
	for (let i = 0; i < 3; i++) {
		pm.s.velocity[i] = ~~(pml.velocity[i] * 8);
	}

    let sign = [0,0,0]
	for (let i = 0; i < 3; i++) {
		if (pml.origin[i] >= 0) {
			sign[i] = 1;
		} else {
			sign[i] = -1;
		}

		pm.s.origin[i] = ~~(pml.origin[i] * 8);

		if (pm.s.origin[i] * 0.125 == pml.origin[i]) {
			sign[i] = 0;
		}
	}

    let base = [0,0,0]
	SHARED.VectorCopy(pm.s.origin, base);

	/* try all combinations */
	for (let j = 0; j < 8; j++)
	{
		let bits = jitterbits[j];
		SHARED.VectorCopy(base, pm.s.origin);

		for (let i = 0; i < 3; i++) {
			if (bits & (1 << i)) {
				pm.s.origin[i] += sign[i];
			}
		}

		if (PM_GoodPosition()) {
			return;
		}
	}

	/* go back to the last position */
	SHARED.VectorCopy(pml.previous_origin, pm.s.origin);
}

function PM_ClampAngles() {
	// short temp;
	// int i;

	if (pm.s.pm_flags & SHARED.PMF_TIME_TELEPORT)
	{
		pm.viewangles[SHARED.YAW] = SHARED.SHORT2ANGLE(
				pm.cmd.angles[SHARED.YAW] + pm.s.delta_angles[SHARED.YAW]);
		pm.viewangles[SHARED.PITCH] = 0;
		pm.viewangles[SHARED.ROLL] = 0;
	}
	else
	{
		/* circularly clamp the angles with deltas */
		for (let i = 0; i < 3; i++)
		{
			let temp = ~~(pm.cmd.angles[i] + pm.s.delta_angles[i]);
			pm.viewangles[i] = SHARED.SHORT2ANGLE(temp);
		}

		/* don't let the player look up or down more than 90 degrees */
		if ((pm.viewangles[SHARED.PITCH] > 89) && (pm.viewangles[SHARED.PITCH] < 180))
		{
			pm.viewangles[SHARED.PITCH] = 89;
		}
		else if ((pm.viewangles[SHARED.PITCH] < 271) && (pm.viewangles[SHARED.PITCH] >= 180))
		{
			pm.viewangles[SHARED.PITCH] = 271;
		}
	}

	SHARED.AngleVectors(pm.viewangles, pml.forward, pml.right, pml.up);
}

/*
 * Can be called by either the server or the client
 */
export function Pmove(pmove: SHARED.pmove_t) {
	pm = pmove;

	/* clear results */
	pm.numtouch = 0;
    pm.viewangles = [0,0,0]
	pm.viewheight = 0;
	// pm.groundentity = 0;
	pm.watertype = 0;
	pm.waterlevel = 0;

	/* clear all pmove local vars */
    pml = new pml_t();

	/* convert origin and velocity to float values */
	pml.origin[0] = pm.s.origin[0] * 0.125;
	pml.origin[1] = pm.s.origin[1] * 0.125;
	pml.origin[2] = pm.s.origin[2] * 0.125;

	pml.velocity[0] = pm.s.velocity[0] * 0.125;
	pml.velocity[1] = pm.s.velocity[1] * 0.125;
	pml.velocity[2] = pm.s.velocity[2] * 0.125;

	/* save old org in case we get stuck */
	SHARED.VectorCopy(pm.s.origin, pml.previous_origin);

	pml.frametime = pm.cmd.msec * 0.001;

	PM_ClampAngles();

	if (pm.s.pm_type == SHARED.pmtype_t.PM_SPECTATOR)
	{
// 		PM_FlyMove(false);
		PM_SnapPosition();
		return;
	}

	if (pm.s.pm_type >= SHARED.pmtype_t.PM_DEAD)
	{
		pm.cmd.forwardmove = 0;
		pm.cmd.sidemove = 0;
		pm.cmd.upmove = 0;
	}

	if (pm.s.pm_type == SHARED.pmtype_t.PM_FREEZE)
	{
// 		if (cl.attractloop) {
// 			PM_CalculateViewHeightForDemo();
// 			PM_CalculateWaterLevelForDemo();
// 			PM_UpdateUnderwaterSfx();
// 		}
		return; /* no movement at all */
	}

	/* set mins, maxs, and viewheight */
	PM_CheckDuck();

	if (pm.snapinitial) {
// 		PM_InitialSnapPosition();
	}

	/* set groundentity, watertype, and waterlevel */
// 	PM_CatagorizePosition();

	if (pm.s.pm_type == SHARED.pmtype_t.PM_DEAD) {
// 		PM_DeadMove();
	}

// 	PM_CheckSpecialMovement();

	/* drop timing counter */
	if (pm.s.pm_time) {

		let msec = pm.cmd.msec >> 3;
		if (!msec) {
			msec = 1;
		}

		if (msec >= pm.s.pm_time) {
			pm.s.pm_flags &= ~(SHARED.PMF_TIME_WATERJUMP | SHARED.PMF_TIME_LAND | SHARED.PMF_TIME_TELEPORT);
			pm.s.pm_time = 0;
		} else {
			pm.s.pm_time -= msec;
		}
	}

	if (pm.s.pm_flags & SHARED.PMF_TIME_TELEPORT)
	{
		/* teleport pause stays exactly in place */
	}
	else if (pm.s.pm_flags & SHARED.PMF_TIME_WATERJUMP)
	{
		/* waterjump has no control, but falls */
		pml.velocity[2] -= pm.s.gravity * pml.frametime;

		if (pml.velocity[2] < 0) {
			/* cancel as soon as we are falling down again */
			pm.s.pm_flags &= ~(SHARED.PMF_TIME_WATERJUMP | SHARED.PMF_TIME_LAND | SHARED.PMF_TIME_TELEPORT);
			pm.s.pm_time = 0;
		}

// 		PM_StepSlideMove();
	}
	else
	{
// 		PM_CheckJump();

// 		PM_Friction();

		if (pm.waterlevel >= 2) {
// 			PM_WaterMove();
		} else {

            let angles = [0,0,0]
			SHARED.VectorCopy(pm.viewangles, angles);

			if (angles[SHARED.PITCH] > 180) {
				angles[SHARED.PITCH] = angles[SHARED.PITCH] - 360;
			}

			angles[SHARED.PITCH] /= 3;

			SHARED.AngleVectors(angles, pml.forward, pml.right, pml.up);

// 			PM_AirMove();
		}
	}

	/* set groundentity, watertype, and waterlevel for final spot */
// 	PM_CatagorizePosition();

//     PM_UpdateUnderwaterSfx();

	PM_SnapPosition();
}

