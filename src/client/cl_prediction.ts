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
 * This file implements interpolation between two frames. This is used
 * to smooth down network play
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { Pmove, SetAirAccelerate } from "../common/pmove"
import { CMD_BACKUP, connstate_t } from "./client";
import { cl, cls, cl_paused, cl_predict } from "./cl_main";


export function CL_CheckPredictionError() {

	if (!cl_predict.bool ||
		(cl.frame.playerstate.pmove.pm_flags & SHARED.PMF_NO_PREDICTION)) {
		return;
	}

	/* calculate the last usercmd_t we sent that the server has processed */
	let frame = cls.netchan.incoming_acknowledged;
	frame &= (CMD_BACKUP - 1);

	/* compare what the server returned with what we had predicted it to be */
    let delta = [0,0,0]
	SHARED.VectorSubtract(cl.frame.playerstate.pmove.origin, cl.predicted_origins[frame], delta);

	/* save the prediction error for interpolation */
	let len = ~~(Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2]));

	/* 80 world units */
	if (len > 640) {
		/* a teleport or something */
        cl.prediction_error = [0,0,0]
	} else {
		// if (cl_showmiss.bool && (delta[0] || delta[1] || delta[2])) {
		// 	Com_Printf("prediction miss on %i: %i\n", cl.frame.serverframe,
		// 			delta[0] + delta[1] + delta[2]);
		// }

		SHARED.VectorCopy(cl.frame.playerstate.pmove.origin, cl.predicted_origins[frame]);

		/* save for error itnerpolation */
		for (let i = 0; i < 3; i++) {
            cl.predicted_origins[frame][i] = ~~cl.predicted_origins[frame][i]
			cl.prediction_error[i] = delta[i] * 0.125;
		}
	}
}

/*
 * Sets cl.predicted_origin and cl.predicted_angles
 */
export function CL_PredictMovement() {

	if (cls.state != connstate_t.ca_active) {
		return;
	}

	if (cl_paused.bool) {
		return;
	}

	if (!cl_predict.bool ||
		(cl.frame.playerstate.pmove.pm_flags & SHARED.PMF_NO_PREDICTION))
	{
		/* just set angles */
		for (let i = 0; i < 3; i++) {
			cl.predicted_angles[i] = cl.viewangles[i] + SHARED.SHORT2ANGLE(
					cl.frame.playerstate.pmove.delta_angles[i]);
		}

		return;
	}

	let ack = cls.netchan.incoming_acknowledged;
	let current = cls.netchan.outgoing_sequence;

	/* if we are too far out of date, just freeze */
	if (current - ack >= CMD_BACKUP) {
		// if (cl_showmiss->value) {
		// 	Com_Printf("exceeded CMD_BACKUP\n");
		// }

		return;
	}

	/* copy current state to pmove */
    let pm  = new SHARED.pmove_t()
	// pm.trace = CL_PMTrace;
	// pm.pointcontents = CL_PMpointcontents;
	SetAirAccelerate(parseFloat(cl.configstrings[SHARED.CS_AIRACCEL]))
	pm.s = cl.frame.playerstate.pmove;

	/* run frames */
	while (++ack <= current) {
		let frame = ack & (CMD_BACKUP - 1);
		let cmd = cl.cmds[frame];

		// Ignore null entries
		if (!cmd.msec) {
			continue;
		}

		pm.cmd.copy(cmd);
		Pmove(pm);

		/* save for debug checking */
		SHARED.VectorCopy(pm.s.origin, cl.predicted_origins[frame]);
	}

	let step = ~~pm.s.origin[2] - ~~(cl.predicted_origin[2] * 8);

	if (((step > 126 && step < 130))
		&& (pm.s.velocity[0] || pm.s.velocity[1] || pm.s.velocity[2])
		&& (pm.s.pm_flags & SHARED.PMF_ON_GROUND))
	{
		cl.predicted_step = step * 0.125;
		cl.predicted_step_time = cls.realtime - ~~(cls.nframetime * 500);
	}

	/* copy results out for rendering */
	cl.predicted_origin[0] = pm.s.origin[0] * 0.125;
	cl.predicted_origin[1] = pm.s.origin[1] * 0.125;
	cl.predicted_origin[2] = pm.s.origin[2] * 0.125;

	SHARED.VectorCopy(pm.viewangles, cl.predicted_angles);
}

