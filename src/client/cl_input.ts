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
import { CMD_BACKUP, connstate_t, keydest_t } from "./client";
import { anykeydown, sys_frame_time } from "./cl_keyboard";
import { cl, cls, cl_anglespeedkey, cl_forwardspeed, cl_lightlevel, cl_pitchspeed, cl_sidespeed, cl_upspeed, cl_yawspeed } from "./cl_main";
import { Cmd_AddCommand } from "../common/cmdparser";
import { Com_Printf } from "../common/clientserver";
import { QWritebuf } from "../common/writebuf";
import { clc_ops_e, MAX_MSGLEN } from "../common/common";
import { Cvar_ClearUserinfoModified, Cvar_Get, Cvar_Userinfo, userinfo_modified } from "../common/cvar";

let frame_msec = 0;
let old_sys_frame_time = 0;

/*
 * KEY BUTTONS
 *
 * Continuous button event tracking is complicated by the fact that two different
 * input sources (say, mouse button 1 and the control key) can both press the
 * same button, but the button should only be released when both of the
 * pressing key have been released.
 *
 * When a key event issues a button command (+forward, +attack, etc), it appends
 * its key number as a parameter to the command so it can be matched up with
 * the release.
 *
 * state bit 0 is the current state of the key
 * state bit 1 is edge triggered on the up to down transition
 * state bit 2 is edge triggered on the down to up transition
 *
 *
 * Key_Event (int key, qboolean down, unsigned time);
 *
 *   +mlook src time
 */

class kbutton_t {
	down = [0,0]; /* key nums holding it down */
	downtime = 0 /* msec timestamp */
	msec = 0 /* msec down this frame */
	state = 0
}


let in_klook = new kbutton_t();
let in_left = new kbutton_t();
let in_right = new kbutton_t();
let in_forward = new kbutton_t();
let in_back = new kbutton_t();
let in_lookup = new kbutton_t();
let in_lookdown = new kbutton_t();
let in_moveleft = new kbutton_t();
let in_moveright = new kbutton_t();
let in_strafe = new kbutton_t();
let in_speed = new kbutton_t();
let in_use = new kbutton_t();
let in_attack = new kbutton_t();
let in_up = new kbutton_t();
let in_down = new kbutton_t();

let in_impulse = 0

function KeyDown(args: string[], b: kbutton_t) {

    let k = -1 /* typed manually at the console for continuous down */
	if (args[1]) {
        k = parseInt(args[1])
	}

	if ((k == b.down[0]) || (k == b.down[1])) {
		return; /* repeating key */
	}

	if (!b.down[0]) {
		b.down[0] = k;
	} else if (!b.down[1]) {
		b.down[1] = k;
	} else {
		Com_Printf("Three keys down for a button!\n");
		return;
	}

	if (b.state & 1)
	{
		return; /* still down */
	}

	/* save timestamp */
	b.downtime = parseInt(args[2])

	if (!b.downtime) {
		b.downtime = sys_frame_time - 100;
	}

	b.state |= 1 + 2; /* down + impulse down */
}

function KeyUp(args: string[], b: kbutton_t) {

    let k  = 0
	if (args[1]) {
		k = parseInt(args[1])
	} else {
		/* typed manually at the console, assume for unsticking, so clear all */
		b.down[0] = b.down[1] = 0;
		b.state = 4; /* impulse up */
		return;
	}

	if (b.down[0] == k)
	{
		b.down[0] = 0;
	}

	else if (b.down[1] == k)
	{
		b.down[1] = 0;
	}

	else
	{
		return; /* key up without coresponding down (menu pass through) */
	}

	if (b.down[0] || b.down[1])
	{
		return; /* some other key is still holding it down */
	}

	if (!(b.state & 1))
	{
		return; /* still up (this should not happen) */
	}

	/* save timestamp */
	let uptime = parseInt(args[2])

	if (uptime) {
		b.msec += uptime - b.downtime;
	}

	else
	{
		b.msec += 10;
	}

	b.state &= ~1; /* now up */
	b.state |= 4; /* impulse up */
}

async function IN_UpDown(args: string[]) {
	KeyDown(args, in_up);
}

async function IN_UpUp(args: string[]) {
	KeyUp(args, in_up);
}

async function IN_DownDown(args: string[]) {
	KeyDown(args, in_down);
}

async function IN_DownUp(args: string[]) {
	KeyUp(args, in_down);
}

async function IN_LeftDown(args: string[]) {
	KeyDown(args, in_left);
}

async function IN_LeftUp(args: string[]) {
	KeyUp(args, in_left);
}

async function IN_RightDown(args: string[]) {
	KeyDown(args, in_right);
}

async function IN_RightUp(args: string[]) {
	KeyUp(args, in_right);
}

async function IN_ForwardDown(args: string[]) {
	KeyDown(args, in_forward);
}

async function IN_ForwardUp(args: string[]) {
	KeyUp(args, in_forward);
}

async function IN_BackDown(args: string[]) {
	KeyDown(args, in_back);
}

async function IN_BackUp(args: string[]) {
	KeyUp(args, in_back);
}

async function IN_StrafeDown(args: string[]) {
	KeyDown(args, in_strafe);
}

async function IN_StrafeUp(args: string[]) {
	KeyUp(args, in_strafe);
}

async function IN_SpeedDown(args: string[]) {
	KeyDown(args, in_speed);
}

async function IN_SpeedUp(args: string[]) {
	KeyUp(args, in_speed);
}

async function IN_AttackDown(args: string[]) {
	KeyDown(args, in_attack);
}

async function IN_AttackUp(args: string[]) {
	KeyUp(args, in_attack);
}


/*
 * Moves the local angle positions
 */
function CL_AdjustAngles() {

    let speed = 0
	if (in_speed.state & 1) {
		speed = cls.nframetime * cl_anglespeedkey.float;
	} else {
		speed = cls.nframetime;
	}

	if (!(in_strafe.state & 1)) {
		cl.viewangles[SHARED.YAW] -= speed * cl_yawspeed.float * CL_KeyState(in_right);
		cl.viewangles[SHARED.YAW] += speed * cl_yawspeed.float * CL_KeyState(in_left);
	}

	if (in_klook.state & 1) {
		cl.viewangles[SHARED.PITCH] -= speed * cl_pitchspeed.float * CL_KeyState(in_forward);
		cl.viewangles[SHARED.PITCH] += speed * cl_pitchspeed.float * CL_KeyState(in_back);
	}

	let up = CL_KeyState(in_lookup);
	let down = CL_KeyState(in_lookdown);

	cl.viewangles[SHARED.PITCH] -= speed * cl_pitchspeed.float * up;
	cl.viewangles[SHARED.PITCH] += speed * cl_pitchspeed.float * down;
}

/*
 * Returns the fraction of the
 * frame that the key was down
 */
function CL_KeyState(key: kbutton_t): number {

	key.state &= 1; /* clear impulses */

	let msec = key.msec;
	key.msec = 0;

	if (key.state)
	{
		/* still down */
		msec += sys_frame_time - key.downtime;
		key.downtime = sys_frame_time;
	}

	let val = msec / frame_msec;

	if (val < 0)
	{
		val = 0;
	}

	if (val > 1)
	{
		val = 1;
	}

	return val;
}
/*
 * Send the intended movement message to the server
 */
function CL_BaseMove(cmd: SHARED.usercmd_t) {
	CL_AdjustAngles();

    cmd.copy(new SHARED.usercmd_t())

	SHARED.VectorCopy(cl.viewangles, cmd.angles);

	if (in_strafe.state & 1) {
		cmd.sidemove += cl_sidespeed.float * CL_KeyState(in_right);
		cmd.sidemove -= cl_sidespeed.float * CL_KeyState(in_left);
	}

	cmd.sidemove += cl_sidespeed.float * CL_KeyState(in_moveright);
	cmd.sidemove -= cl_sidespeed.float * CL_KeyState(in_moveleft);

	cmd.upmove += cl_upspeed.float * CL_KeyState(in_up);
	cmd.upmove -= cl_upspeed.float * CL_KeyState(in_down);

	if (!(in_klook.state & 1)) {
		cmd.forwardmove += cl_forwardspeed.float * CL_KeyState(in_forward);
		cmd.forwardmove -= cl_forwardspeed.float * CL_KeyState(in_back);
	}

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

	if (pitch > 180) {
		pitch -= 360;
	}

	if (cl.viewangles[SHARED.PITCH] + pitch < -360) {
		cl.viewangles[SHARED.PITCH] += 360; /* wrapped */
	}

	if (cl.viewangles[SHARED.PITCH] + pitch > 360) {
		cl.viewangles[SHARED.PITCH] -= 360; /* wrapped */
	}

	if (cl.viewangles[SHARED.PITCH] + pitch > 89) {
		cl.viewangles[SHARED.PITCH] = 89 - pitch;
	}

	if (cl.viewangles[SHARED.PITCH] + pitch < -89) {
		cl.viewangles[SHARED.PITCH] = -89 - pitch;
	}
}

let cl_nodelta: SHARED.cvar_t

export function CL_InitInput()
{
	// Cmd_AddCommand("centerview", IN_CenterView);
	// Cmd_AddCommand("force_centerview", IN_ForceCenterView);

	Cmd_AddCommand("+moveup", IN_UpDown);
	Cmd_AddCommand("-moveup", IN_UpUp);
	Cmd_AddCommand("+movedown", IN_DownDown);
	Cmd_AddCommand("-movedown", IN_DownUp);
	Cmd_AddCommand("+left", IN_LeftDown);
	Cmd_AddCommand("-left", IN_LeftUp);
	Cmd_AddCommand("+right", IN_RightDown);
	Cmd_AddCommand("-right", IN_RightUp);
    Cmd_AddCommand("+forward", IN_ForwardDown);
    Cmd_AddCommand("-forward", IN_ForwardUp);
	Cmd_AddCommand("+back", IN_BackDown);
	Cmd_AddCommand("-back", IN_BackUp);
	// Cmd_AddCommand("+lookup", IN_LookupDown);
	// Cmd_AddCommand("-lookup", IN_LookupUp);
	// Cmd_AddCommand("+lookdown", IN_LookdownDown);
	// Cmd_AddCommand("-lookdown", IN_LookdownUp);
	Cmd_AddCommand("+strafe", IN_StrafeDown);
	Cmd_AddCommand("-strafe", IN_StrafeUp);
	// Cmd_AddCommand("+moveleft", IN_MoveleftDown);
	// Cmd_AddCommand("-moveleft", IN_MoveleftUp);
	// Cmd_AddCommand("+moveright", IN_MoverightDown);
	// Cmd_AddCommand("-moveright", IN_MoverightUp);
	Cmd_AddCommand("+speed", IN_SpeedDown);
	Cmd_AddCommand("-speed", IN_SpeedUp);
	Cmd_AddCommand("+attack", IN_AttackDown);
	Cmd_AddCommand("-attack", IN_AttackUp);
	// Cmd_AddCommand("+use", IN_UseDown);
	// Cmd_AddCommand("-use", IN_UseUp);
	// Cmd_AddCommand("impulse", IN_Impulse);
	// Cmd_AddCommand("+klook", IN_KLookDown);
	// Cmd_AddCommand("-klook", IN_KLookUp);

	cl_nodelta = Cvar_Get("cl_nodelta", "0", 0);
}


export function CL_RefreshCmd()
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
	if (in_attack.state & 3)
	{
		cmd.buttons |= SHARED.BUTTON_ATTACK;
	}

	in_attack.state &= ~2;

	if (in_use.state & 3)
	{
		cmd.buttons |= SHARED.BUTTON_USE;
	}

	in_use.state &= ~2;

	// Keyboard events
	if (anykeydown && cls.key_dest == keydest_t.key_game)
	{
		cmd.buttons |= SHARED.BUTTON_ANY;
	}

	cmd.impulse = in_impulse;
	in_impulse = 0;

	// Set light level for muzzle flash
	cmd.lightlevel = cl_lightlevel.int
}


export async function CL_SendCmd() {

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
	if (userinfo_modified) {
	// 	CL_FixUpGender();
        Cvar_ClearUserinfoModified();
        cls.netchan.message.WriteByte(clc_ops_e.clc_userinfo);
        cls.netchan.message.WriteString(Cvar_Userinfo());
	}

    let buf = new QWritebuf(MAX_MSGLEN)

	// if ((cls.realtime > abort_cinematic) && (cl.cinematictime > 0) &&
	// 		!cl.attractloop && (cls.realtime - cl.cinematictime > 1000) &&
	// 		(cls.key_dest == key_game)) {
	// 	/* skip the rest of the cinematic */
	// 	SCR_FinishCinematic();
	// }

	/* begin a client move command */
	buf.WriteByte(clc_ops_e.clc_move);

	/* save the position for a checksum byte */
	// checksumIndex = buf.cursize;
	buf.WriteByte(0);

	/* let the server know what the last frame we
	   got was, so the next message can be delta
	   compressed */
	if (cl_nodelta.bool || !cl.frame.valid /* || cls.demowaiting */) {
	    buf.WriteLong(-1); /* no compression */
	} else {
        buf.WriteLong(cl.frame.serverframe);
	}

	/* send this and the previous cmds in the message, so
	   if the last packet was dropped, it can be recovered */
	i = (cls.netchan.outgoing_sequence - 2) & (CMD_BACKUP - 1);
	cmd = cl.cmds[i];
	// memset(&nullcmd, 0, sizeof(nullcmd));
	buf.WriteDeltaUsercmd(new SHARED.usercmd_t(), cmd);
	let oldcmd = cmd;

	i = (cls.netchan.outgoing_sequence - 1) & (CMD_BACKUP - 1);
	cmd = cl.cmds[i];
	buf.WriteDeltaUsercmd(oldcmd, cmd);
	oldcmd = cmd;

	i = (cls.netchan.outgoing_sequence) & (CMD_BACKUP - 1);
	cmd = cl.cmds[i];
	buf.WriteDeltaUsercmd(oldcmd, cmd);

	// /* calculate a checksum over the move commands */
	// buf.data[checksumIndex] = COM_BlockSequenceCRCByte(
	// 		buf.data + checksumIndex + 1, buf.cursize - checksumIndex - 1,
	// 		cls.netchan.outgoing_sequence);

	/* deliver the message */
	cls.netchan.Transmit(buf.Data());

	/* Reinit the current cmd buffer */
	cl.cmds[cls.netchan.outgoing_sequence & (CMD_BACKUP - 1)] = new SHARED.usercmd_t()
}

