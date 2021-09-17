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
 * This is the clients main loop as well as some miscelangelous utility
 * and support functions
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { Cbuf_Execute, Cmd_AddCommand } from "../common/cmdparser"
import { curtime } from "../common/frame"
import { Com_Printf, Sys_Milliseconds } from "../common/clientserver"
import { VID_Init } from "./vid"
import { SCR_Init, SCR_UpdateScreen } from "./cl_screen"
import { Con_Init } from "./cl_console"
import { client_static_t, client_state_t, connstate_t, MAX_PARSE_ENTITIES, centity_t} from "./client"
import { M_Init } from "./menu/menu"
import { Key_Update } from "./cl_keyboard"
import { Cvar_Get, Cvar_VariableString } from "../common/cvar"
import { Netchan_OutOfBandPrint } from "../common/netchan"
import { CL_ReadPackets, CL_CheckForResend, CL_ForwardToServer_f, CL_Changing_f, CL_Reconnect_f, CL_Disconnect_f } from "./cl_network"
import { CL_RefreshCmd, CL_RefreshMove, CL_SendCmd } from "./cl_input"
import { CL_ResetPrecacheCheck, CL_StartPrecache, CL_RequestNextDownload } from "./cl_download"
import { CL_InitHTTPDownloads, CL_RunHTTPDownloads } from "./download"
import { CL_PrepRefresh } from "./cl_view"
import { CL_ClearEffects } from "./cl_effects"
import { CL_RunLightStyles } from "./cl_light"
import { CL_PredictMovement } from "./cl_prediction"

export let cl = new client_state_t();
export let cls = new client_static_t();

export let server_address: SHARED.cvar_t
export let cl_shownet: SHARED.cvar_t
export let cl_paused: SHARED.cvar_t
export let cl_vwep: SHARED.cvar_t
export let cl_predict: SHARED.cvar_t
export let cl_kickangles: SHARED.cvar_t

export let cl_entities: centity_t[] = new Array<centity_t>(SHARED.MAX_EDICTS);

export let cl_parse_entities: SHARED.entity_state_t[] = new Array<SHARED.entity_state_t>(MAX_PARSE_ENTITIES);

async function CL_SinglePlayer_f(args: string[]) {
    cls.state = connstate_t.ca_preconnecting;
	Netchan_OutOfBandPrint(`singleplayer ${Cvar_VariableString("skill")}`)
}

export function CL_ClearState() {
	// S_StopAllSounds();
	CL_ClearEffects();
	// CL_ClearTEnts();

	/* wipe the entire cl structure */
	cl = new client_state_t()
	for (let i in cl_entities) {
		cl_entities[i] = new centity_t()
	}

	cls.netchan.message.Clear()
}


/*
 * The server will send this command right
 * before allowing the client into the server
 */
async function CL_Precache_f(args: string[]) {
	/* Yet another hack to let old demos work */
	if (args.length < 2) {
		// unsigned map_checksum;    /* for detecting cheater maps */

		// CM_LoadMap(cl.configstrings[CS_MODELS + 1], true, &map_checksum);
		// CL_RegisterSounds();
		await CL_PrepRefresh();
		return;
	}

	CL_StartPrecache(parseInt(args[1], 10))
	await CL_RequestNextDownload();
}

function CL_InitLocal() {
	cls.state = connstate_t.ca_disconnected;
	cls.realtime = Sys_Milliseconds();

	for (let i = 0; i < cl_entities.length; i++) 
		cl_entities[i] = new centity_t()
	for (let i = 0; i < cl_parse_entities.length; i++) 
		cl_parse_entities[i] = new SHARED.entity_state_t()

// 	CL_InitInput();

	/* register our variables */
    server_address = Cvar_Get("server_address", "http://localhost:8081", SHARED.CVAR_ARCHIVE);
// 	cin_force43 = Cvar_Get("cin_force43", "1", 0);

// 	cl_add_blend = Cvar_Get("cl_blend", "1", 0);
// 	cl_add_lights = Cvar_Get("cl_lights", "1", 0);
// 	cl_add_particles = Cvar_Get("cl_particles", "1", 0);
// 	cl_add_entities = Cvar_Get("cl_entities", "1", 0);
	cl_kickangles = Cvar_Get("cl_kickangles", "1", 0);
// 	cl_gun = Cvar_Get("cl_gun", "2", CVAR_ARCHIVE);
// 	cl_footsteps = Cvar_Get("cl_footsteps", "1", 0);
// 	cl_noskins = Cvar_Get("cl_noskins", "0", 0);
	cl_predict = Cvar_Get("cl_predict", "1", 0);
// 	cl_showfps = Cvar_Get("cl_showfps", "0", CVAR_ARCHIVE);

// 	cl_upspeed = Cvar_Get("cl_upspeed", "200", 0);
// 	cl_forwardspeed = Cvar_Get("cl_forwardspeed", "200", 0);
// 	cl_sidespeed = Cvar_Get("cl_sidespeed", "200", 0);
// 	cl_yawspeed = Cvar_Get("cl_yawspeed", "140", 0);
// 	cl_pitchspeed = Cvar_Get("cl_pitchspeed", "150", 0);
// 	cl_anglespeedkey = Cvar_Get("cl_anglespeedkey", "1.5", 0);

// 	cl_run = Cvar_Get("cl_run", "0", CVAR_ARCHIVE);

	cl_shownet = Cvar_Get("cl_shownet", "0", 0);
// 	cl_showmiss = Cvar_Get("cl_showmiss", "0", 0);
// 	cl_showclamp = Cvar_Get("showclamp", "0", 0);
// 	cl_timeout = Cvar_Get("cl_timeout", "120", 0);
	cl_paused = Cvar_Get("paused", "0", 0);
// 	cl_loadpaused = Cvar_Get("cl_loadpaused", "1", CVAR_ARCHIVE);

// 	gl1_stereo = Cvar_Get( "gl1_stereo", "0", CVAR_ARCHIVE );
// 	gl1_stereo_separation = Cvar_Get( "gl1_stereo_separation", "1", CVAR_ARCHIVE );
// 	gl1_stereo_convergence = Cvar_Get( "gl1_stereo_convergence", "1.4", CVAR_ARCHIVE );

// 	rcon_client_password = Cvar_Get("rcon_password", "", 0);
// 	rcon_address = Cvar_Get("rcon_address", "", 0);

// 	cl_lightlevel = Cvar_Get("r_lightlevel", "0", 0);
// 	cl_r1q2_lightstyle = Cvar_Get("cl_r1q2_lightstyle", "1", CVAR_ARCHIVE);
// 	cl_limitsparksounds = Cvar_Get("cl_limitsparksounds", "0", CVAR_ARCHIVE);

// 	/* userinfo */
// 	name = Cvar_Get("name", "unnamed", CVAR_USERINFO | CVAR_ARCHIVE);
// 	skin = Cvar_Get("skin", "male/grunt", CVAR_USERINFO | CVAR_ARCHIVE);
// 	rate = Cvar_Get("rate", "8000", CVAR_USERINFO | CVAR_ARCHIVE);
// 	msg = Cvar_Get("msg", "1", CVAR_USERINFO | CVAR_ARCHIVE);
// 	hand = Cvar_Get("hand", "0", CVAR_USERINFO | CVAR_ARCHIVE);
// 	fov = Cvar_Get("fov", "90", CVAR_USERINFO | CVAR_ARCHIVE);
// 	horplus = Cvar_Get("horplus", "1", CVAR_ARCHIVE);
// 	windowed_mouse = Cvar_Get("windowed_mouse", "1", CVAR_USERINFO | CVAR_ARCHIVE);
// 	gender = Cvar_Get("gender", "male", CVAR_USERINFO | CVAR_ARCHIVE);
// 	gender_auto = Cvar_Get("gender_auto", "1", CVAR_ARCHIVE);
// 	gender->modified = false;

	// USERINFO cvars are special, they just need to be registered
// 	Cvar_Get("password", "", CVAR_USERINFO);
// 	Cvar_Get("spectator", "0", CVAR_USERINFO);

	cl_vwep = Cvar_Get("cl_vwep", "1", SHARED.CVAR_ARCHIVE);

	/* register our commands */
    Cmd_AddCommand("singleplayer", CL_SinglePlayer_f)
	Cmd_AddCommand("cmd", CL_ForwardToServer_f);
// 	Cmd_AddCommand("pause", CL_Pause_f);
// 	Cmd_AddCommand("pingservers", CL_PingServers_f);
// 	Cmd_AddCommand("skins", CL_Skins_f);

// 	Cmd_AddCommand("userinfo", CL_Userinfo_f);
// 	Cmd_AddCommand("snd_restart", CL_Snd_Restart_f);

	Cmd_AddCommand("changing", CL_Changing_f);
	Cmd_AddCommand("disconnect", CL_Disconnect_f);
// 	Cmd_AddCommand("record", CL_Record_f);
// 	Cmd_AddCommand("stop", CL_Stop_f);

// 	Cmd_AddCommand("quit", CL_Quit_f);

// 	Cmd_AddCommand("connect", CL_Connect_f);
	Cmd_AddCommand("reconnect", CL_Reconnect_f);

// 	Cmd_AddCommand("rcon", CL_Rcon_f);

// 	Cmd_AddCommand("setenv", CL_Setenv_f);

	Cmd_AddCommand("precache", CL_Precache_f);

// 	Cmd_AddCommand("download", CL_Download_f);

// 	Cmd_AddCommand("currentmap", CL_CurrentMap_f);

// 	/* forward to server commands
// 	 * the only thing this does is allow command completion
// 	 * to work -- all unknown commands are automatically
// 	 * forwarded to the server */
// 	Cmd_AddCommand("wave", NULL);
// 	Cmd_AddCommand("inven", NULL);
// 	Cmd_AddCommand("kill", NULL);
// 	Cmd_AddCommand("use", NULL);
// 	Cmd_AddCommand("drop", NULL);
// 	Cmd_AddCommand("say", NULL);
// 	Cmd_AddCommand("say_team", NULL);
// 	Cmd_AddCommand("info", NULL);
// 	Cmd_AddCommand("prog", NULL);
// 	Cmd_AddCommand("give", NULL);
// 	Cmd_AddCommand("god", NULL);
// 	Cmd_AddCommand("notarget", NULL);
// 	Cmd_AddCommand("noclip", NULL);
// 	Cmd_AddCommand("invuse", NULL);
// 	Cmd_AddCommand("invprev", NULL);
// 	Cmd_AddCommand("invnext", NULL);
// 	Cmd_AddCommand("invdrop", NULL);
// 	Cmd_AddCommand("weapnext", NULL);
// 	Cmd_AddCommand("weapprev", NULL);
// 	Cmd_AddCommand("listentities", NULL);
// 	Cmd_AddCommand("teleport", NULL);
// 	Cmd_AddCommand("cycleweap", NULL);
}


export async function CL_Frame(msec:  number) {
// 	static int lasttimecalled;

	// Calculate simulation time.
	cls.nframetime = msec / 1000;
	cls.rframetime = msec / 1000;
	cls.realtime = curtime;
	cl.time = ~~(cl.time + msec);

	// Don't extrapolate too far ahead.
	if (cls.nframetime > 0.5) {
		cls.nframetime = 0.5;
	}

	if (cls.rframetime > 0.5) {
		cls.rframetime = 0.5;
	}

// 	// if in the debugger last frame, don't timeout.
// 	if (timedelta > 5000000)
// 	{
// 		cls.netchan.last_received = Sys_Milliseconds();
// 	}

// 	// Reset power shield / power screen sound counter.
// 	num_power_sounds = 0;

// 	if (!cl_timedemo->value)
// 	{
// 		// Don't throttle too much when connecting / loading.
// 		if ((cls.state == ca_connected) && (packetdelta > 100000))
// 		{
// 			packetframe = true;
// 		}
// 	}

	// Run HTTP downloads more often while connecting.
// #ifdef USE_CURL
	if (cls.state == connstate_t.ca_connected) {
		CL_RunHTTPDownloads();
	}
// #endif

// 	// Update input stuff.
// 	if (packetframe || renderframe)
// 	{
		await CL_ReadPackets();
// 		CL_UpdateWindowedMouse();
		await Key_Update();
		await Cbuf_Execute();
// 		CL_FixCvarCheats();

		if (cls.state > connstate_t.ca_connecting) {
			CL_RefreshCmd();
		} else {
			CL_RefreshMove();
		}
// 	}

// 	if (cls.forcePacket || userinfo_modified)
// 	{
// 		packetframe = true;
// 		cls.forcePacket = false;
// 	}

// 	if (packetframe)
// 	{
		await CL_SendCmd();
		CL_CheckForResend();

		// Run HTTP downloads during game.
		CL_RunHTTPDownloads();
// 	}

// 	if (renderframe)
// 	{
		// await VID_CheckChanges();
		CL_PredictMovement();

		if (!cl.refresh_prepped && (cls.state == connstate_t.ca_active)) {
			await CL_PrepRefresh();
		}

// 		/* update the screen */
// 		if (host_speeds->value)
// 		{
// 			time_before_ref = Sys_Milliseconds();
// 		}

		await SCR_UpdateScreen();

// 		if (host_speeds->value)
// 		{
// 			time_after_ref = Sys_Milliseconds();
// 		}

// 		/* update audio */
// 		S_Update(cl.refdef.vieworg, cl.v_forward, cl.v_right, cl.v_up);

		/* advance local effects for next frame */
// 		CL_RunDLights();
		CL_RunLightStyles();
// 		SCR_RunCinematic();
// 		SCR_RunConsole();

		/* Update framecounter */
		cls.framecount++;

// 		if (log_stats->value)
// 		{
// 			if (cls.state == ca_active)
// 			{
// 				if (!lasttimecalled)
// 				{
// 					lasttimecalled = Sys_Milliseconds();

// 					if (log_stats_file)
// 					{
// 						fprintf(log_stats_file, "0\n");
// 					}
// 				}

// 				else
// 				{
// 					int now = Sys_Milliseconds();

// 					if (log_stats_file)
// 					{
// 						fprintf(log_stats_file, "%d\n", now - lasttimecalled);
// 					}

// 					lasttimecalled = now;
// 				}
// 			}
// 		}
// 	}
}


export async function CL_Init() {

    /* all archived variables will now be loaded */
	Con_Init();

// 	S_Init();

	SCR_Init();

	await VID_Init();

// 	IN_Init();

// 	V_Init();

// 	net_message.data = net_message_buffer;

// 	net_message.maxsize = sizeof(net_message_buffer);

	M_Init();

	CL_InitHTTPDownloads();

// 	cls.disable_screen = true; /* don't draw yet */

	CL_InitLocal();

	await Cbuf_Execute();

// 	Key_ReadConsoleHistory();
}
