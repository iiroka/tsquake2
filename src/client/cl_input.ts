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
 * This file implements the input handling like mouse events and
 * keyboard strokes.
 *
 * =======================================================================
 */

import * as SHARED from "../common/shared"
import { curtime } from "../common/frame";
import { CMD_BACKUP, connstate_t } from "./client";
import { sys_frame_time } from "./cl_keyboard";
import { cl, cls } from "./cl_main";

let frame_msec = 0;
let old_sys_frame_time = 0;

/*
 * Send the intended movement message to the server
 */
function CL_BaseMove(cmd: SHARED.usercmd_t) {
	// CL_AdjustAngles();

    cmd.copy(new SHARED.usercmd_t())

	SHARED.VectorCopy(cl.viewangles, cmd.angles);

	// if (in_strafe.state & 1)
	// {
	// 	cmd->sidemove += cl_sidespeed->value * CL_KeyState(&in_right);
	// 	cmd->sidemove -= cl_sidespeed->value * CL_KeyState(&in_left);
	// }

	// cmd->sidemove += cl_sidespeed->value * CL_KeyState(&in_moveright);
	// cmd->sidemove -= cl_sidespeed->value * CL_KeyState(&in_moveleft);

	// cmd->upmove += cl_upspeed->value * CL_KeyState(&in_up);
	// cmd->upmove -= cl_upspeed->value * CL_KeyState(&in_down);

	// if (!(in_klook.state & 1))
	// {
	// 	cmd->forwardmove += cl_forwardspeed->value * CL_KeyState(&in_forward);
	// 	cmd->forwardmove -= cl_forwardspeed->value * CL_KeyState(&in_back);
	// }

	// /* adjust for speed key / running */
	// if ((in_speed.state & 1) ^ (int)(cl_run->value))
	// {
	// 	cmd->forwardmove *= 2;
	// 	cmd->sidemove *= 2;
	// 	cmd->upmove *= 2;
	// }
}

function CL_ClampPitch() {

	let pitch = SHARED.SHORT2ANGLE(cl.frame.playerstate.pmove.delta_angles[SHARED.PITCH]);

	if (pitch > 180)
	{
		pitch -= 360;
	}

	if (cl.viewangles[SHARED.PITCH] + pitch < -360)
	{
		cl.viewangles[SHARED.PITCH] += 360; /* wrapped */
	}

	if (cl.viewangles[SHARED.PITCH] + pitch > 360)
	{
		cl.viewangles[SHARED.PITCH] -= 360; /* wrapped */
	}

	if (cl.viewangles[SHARED.PITCH] + pitch > 89)
	{
		cl.viewangles[SHARED.PITCH] = 89 - pitch;
	}

	if (cl.viewangles[SHARED.PITCH] + pitch < -89)
	{
		cl.viewangles[SHARED.PITCH] = -89 - pitch;
	}
}


export function CL_RefreshCmd()
{
	// int ms;
	// usercmd_t *cmd;

	// CMD to fill
	let cmd = cl.cmds[cls.netchan.outgoing_sequence & (CMD_BACKUP - 1)];

	// Calculate delta
	frame_msec = sys_frame_time - old_sys_frame_time;

	// Check bounds
	if (frame_msec < 1) {
		return;
	} else if (frame_msec > 200) {
		frame_msec = 200;
	}

	// Add movement
	CL_BaseMove(cmd);
	// IN_Move(cmd);

	// Clamp angels for prediction
	CL_ClampPitch();

	cmd.angles[0] = SHARED.ANGLE2SHORT(cl.viewangles[0]);
	cmd.angles[1] = SHARED.ANGLE2SHORT(cl.viewangles[1]);
	cmd.angles[2] = SHARED.ANGLE2SHORT(cl.viewangles[2]);

	// Update time for prediction
	let ms = ~~(cls.nframetime * 1000.0);

	if (ms > 250) {
		ms = 100;
	}

	cmd.msec = ms;

	// Update frame time for the next call
	old_sys_frame_time = sys_frame_time;

	// // Important events are send immediately
	// if (((in_attack.state & 2)) || (in_use.state & 2))
	// {
	// 	cls.forcePacket = true;
	// }
}

export function CL_RefreshMove()
{

	// CMD to fill
	let cmd = cl.cmds[cls.netchan.outgoing_sequence & (CMD_BACKUP - 1)];

	// Calculate delta
	frame_msec = sys_frame_time - old_sys_frame_time;

	// Check bounds
	if (frame_msec < 1) {
		return;
	} else if (frame_msec > 200) {
		frame_msec = 200;
	}

	// Add movement
	CL_BaseMove(cmd);
	// IN_Move(cmd);

	old_sys_frame_time = sys_frame_time;
}


function CL_FinalizeCmd() {
	// usercmd_t *cmd;

	// CMD to fill
	let cmd = cl.cmds[cls.netchan.outgoing_sequence & (CMD_BACKUP - 1)];

	// Mouse button events
	// if (in_attack.state & 3)
	// {
	// 	cmd->buttons |= BUTTON_ATTACK;
	// }

	// in_attack.state &= ~2;

	// if (in_use.state & 3)
	// {
	// 	cmd->buttons |= BUTTON_USE;
	// }

	// in_use.state &= ~2;

	// // Keyboard events
	// if (anykeydown && cls.key_dest == key_game)
	// {
	// 	cmd->buttons |= BUTTON_ANY;
	// }

	// cmd->impulse = in_impulse;
	// in_impulse = 0;

	// Set light level for muzzle flash
	// cmd->lightlevel = (byte)cl_lightlevel->value;
}


export async function CL_SendCmd() {
	// sizebuf_t buf;
	// byte data[128];
	// int i;
	// usercmd_t *cmd, *oldcmd;
	// usercmd_t nullcmd;
	// int checksumIndex;

	// memset(&buf, 0, sizeof(buf));

	/* save this command off for prediction */
	let i = cls.netchan.outgoing_sequence & (CMD_BACKUP - 1);
	let cmd = cl.cmds[i];
	// cl.cmd_time[i] = cls.realtime; /* for netgraph ping calculation */

	CL_FinalizeCmd();

	cl.cmd.copy(cmd)

	if ((cls.state == connstate_t.ca_disconnected) || (cls.state == connstate_t.ca_connecting)) {
		return;
	}

	if (cls.state == connstate_t.ca_connected) {
		if (cls.netchan.message.cursize || (curtime - cls.netchan.last_sent > 1000)) {
            cls.netchan.Transmit(null)
		}

		return;
	}

	/* send a userinfo update if needed */
	// if (userinfo_modified) {
	// 	CL_FixUpGender();
	// 	userinfo_modified = false;
	// 	MSG_WriteByte(&cls.netchan.message, clc_userinfo);
	// 	MSG_WriteString(&cls.netchan.message, Cvar_Userinfo());
	// }

	// SZ_Init(&buf, data, sizeof(data));

	// if ((cls.realtime > abort_cinematic) && (cl.cinematictime > 0) &&
	// 		!cl.attractloop && (cls.realtime - cl.cinematictime > 1000) &&
	// 		(cls.key_dest == key_game))
	// {
	// 	/* skip the rest of the cinematic */
	// 	SCR_FinishCinematic();
	// }

	// /* begin a client move command */
	// MSG_WriteByte(&buf, clc_move);

	// /* save the position for a checksum byte */
	// checksumIndex = buf.cursize;
	// MSG_WriteByte(&buf, 0);

	// /* let the server know what the last frame we
	//    got was, so the next message can be delta
	//    compressed */
	// if (cl_nodelta->value || !cl.frame.valid || cls.demowaiting)
	// {
	// 	MSG_WriteLong(&buf, -1); /* no compression */
	// }
	// else
	// {
	// 	MSG_WriteLong(&buf, cl.frame.serverframe);
	// }

	// /* send this and the previous cmds in the message, so
	//    if the last packet was dropped, it can be recovered */
	// i = (cls.netchan.outgoing_sequence - 2) & (CMD_BACKUP - 1);
	// cmd = &cl.cmds[i];
	// memset(&nullcmd, 0, sizeof(nullcmd));
	// MSG_WriteDeltaUsercmd(&buf, &nullcmd, cmd);
	// oldcmd = cmd;

	// i = (cls.netchan.outgoing_sequence - 1) & (CMD_BACKUP - 1);
	// cmd = &cl.cmds[i];
	// MSG_WriteDeltaUsercmd(&buf, oldcmd, cmd);
	// oldcmd = cmd;

	// i = (cls.netchan.outgoing_sequence) & (CMD_BACKUP - 1);
	// cmd = &cl.cmds[i];
	// MSG_WriteDeltaUsercmd(&buf, oldcmd, cmd);

	// /* calculate a checksum over the move commands */
	// buf.data[checksumIndex] = COM_BlockSequenceCRCByte(
	// 		buf.data + checksumIndex + 1, buf.cursize - checksumIndex - 1,
	// 		cls.netchan.outgoing_sequence);

	// /* deliver the message */
	// Netchan_Transmit(&cls.netchan, buf.cursize, buf.data);

	// /* Reinit the current cmd buffer */
	// cmd = &cl.cmds[cls.netchan.outgoing_sequence & (CMD_BACKUP - 1)];
	// memset(cmd, 0, sizeof(*cmd));
}

