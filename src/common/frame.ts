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
 * Platform independent initialization, main loop and frame handling.
 *
 * =======================================================================
 */
import * as SHARED from "./shared"
import { Com_Printf, Sys_Milliseconds } from "./clientserver"
import { Cvar_Init, Cvar_Get } from "./cvar"
import { Cbuf_AddText, Cbuf_Execute, Cmd_Init } from "./cmdparser"
import { FS_InitFilesystem } from "./filesystem"
import { CL_Init, CL_Frame } from "../client/cl_main"
import { VID_StartRendering } from "../client/vid"
import { Key_Init } from "../client/cl_keyboard"
import { Network_Connect } from "./network"
import {Netchan_Init } from "./netchan"

let developer: SHARED.cvar_t
let modder: SHARED.cvar_t
let timescale: SHARED.cvar_t
let fixedtime: SHARED.cvar_t
let cl_maxfps: SHARED.cvar_t
let dedicated: SHARED.cvar_t

let busywait: SHARED.cvar_t
let cl_async: SHARED.cvar_t
let cl_timedemo: SHARED.cvar_t
let vid_maxfps: SHARED.cvar_t
let host_speeds: SHARED.cvar_t
let log_stats: SHARED.cvar_t
let showtrace: SHARED.cvar_t
let server_name: SHARED.cvar_t

export let curtime = 0

async function  Qcommon_ExecConfigs(gameStartUp: boolean) {
	Cbuf_AddText("exec default.cfg\n");
	Cbuf_AddText("exec yq2.cfg\n");
	Cbuf_AddText("exec config.cfg\n");
	Cbuf_AddText("exec autoexec.cfg\n");

	// if (gameStartUp) {
	// 	/* Process cmd arguments only startup. */
	// 	Cbuf_AddEarlyCommands(true);
	// }

	await Cbuf_Execute();
}



export async function Qcommon_Init() {
    Sys_Milliseconds();
	// Jump point used in emergency situations.
// 	if (setjmp(abortframe))
// 	{
// 		Sys_Error("Error during initialization");
// 	}

// 	if (checkForHelp(argc, argv))
// 	{
// 		// ok, --help or similar commandline option was given
// 		// and info was printed, exit the game now
// 		exit(1);
// 	}

// 	// Print the build and version string
// 	Qcommon_Buildstring();

// 	// Seed PRNG
// 	randk_seed();

// 	// Initialize zone malloc().
// 	z_chain.next = z_chain.prev = &z_chain;

	// Start early subsystems.
	Cmd_Init();
	Cvar_Init();

	Key_Init();

    let t1 = Cvar_Get("test", "42", 0)
    let t = Cvar_Get("test1", "foo", 0)
    console.log("test", t1.string, t1.int, t1.float)
    console.log("test1", t.string, t.int, t.float)
    t1.string = "5.42"
    console.log("test now", t1.string, t1.int, t1.float)


	/* we need to add the early commands twice, because
	   a basedir or cddir needs to be set before execing
	   config files, but we want other parms to override
	   the settings of the config files */
	// Cbuf_AddEarlyCommands(false);
	await Cbuf_Execute()

// 	// remember the initial game name that might have been set on commandline
// 	{
// 		cvar_t* gameCvar = Cvar_Get("game", "", CVAR_LATCH | CVAR_SERVERINFO);
// 		const char* game = "";

// 		if(gameCvar->string && gameCvar->string[0])
// 		{
// 			game = gameCvar->string;
// 		}

// 		Q_strlcpy(userGivenGame, game, sizeof(userGivenGame));
// 	}

	// The filesystems needs to be initialized after the cvars.
	await FS_InitFilesystem();

	// Add and execute configuration files.
	await Qcommon_ExecConfigs(true)

// 	// Zone malloc statistics.
// 	Cmd_AddCommand("z_stats", Z_Stats_f);

	// cvars

	cl_maxfps = Cvar_Get("cl_maxfps", "60", SHARED.CVAR_ARCHIVE);

	developer = Cvar_Get("developer", "0", 0);
	fixedtime = Cvar_Get("fixedtime", "0", 0);

	// logfile_active = Cvar_Get("logfile", "1", CVAR_ARCHIVE);
	modder = Cvar_Get("modder", "0", 0);
	timescale = Cvar_Get("timescale", "1", 0);

// 	char *s;
// 	s = va("%s %s %s %s", YQ2VERSION, YQ2ARCH, BUILD_DATE, YQ2OSTYPE);
// 	Cvar_Get("version", s, CVAR_SERVERINFO | CVAR_NOSET);

	busywait = Cvar_Get("busywait", "1", SHARED.CVAR_ARCHIVE);
	cl_async = Cvar_Get("cl_async", "1", SHARED.CVAR_ARCHIVE);
	cl_timedemo = Cvar_Get("timedemo", "0", 0);
	dedicated = Cvar_Get("dedicated", "0", SHARED.CVAR_NOSET);
	vid_maxfps = Cvar_Get("vid_maxfps", "300", SHARED.CVAR_ARCHIVE);
	host_speeds = Cvar_Get("host_speeds", "0", 0);
	log_stats = Cvar_Get("log_stats", "0", 0);
	showtrace = Cvar_Get("showtrace", "0", 0);

	server_name = Cvar_Get("server_name", "ws://localhost:8081", SHARED.CVAR_ARCHIVE);
	server_name.modified = false

// 	// Start late subsystem.
// 	Sys_Init();
// 	NET_Init();
	Netchan_Init()
	Network_Connect(server_name.string)
// 	SV_Init();
	await CL_Init();

    Cbuf_AddText("menu_main\n");
    await Cbuf_Execute();

	Com_Printf("==== Yamagi Quake II Initialized ====\n\n");
	Com_Printf("*************************************\n\n");

    VID_StartRendering()
}

export async function Qcommon_Frame(msec: number) {

	// Save global time for network- und input code.
	curtime = Sys_Milliseconds();

	if (server_name.modified) {
		server_name.modified = false
		Network_Connect(server_name.string)
	}

	// // Dedicated server terminal console.
	// do {
	// 	s = Sys_ConsoleInput();

	// 	if (s) {
	// 		Cbuf_AddText(va("%s\n", s));
	// 	}
	// } while (s);

	await Cbuf_Execute();


	// if (host_speeds->value)
	// {
	// 	time_before = Sys_Milliseconds();
	// }


	// Run the client frame.
    await CL_Frame(msec)


	// if (host_speeds->value)
	// {
	// 	int all, sv, gm, cl, rf;

	// 	time_after = Sys_Milliseconds();
	// 	all = time_after - time_before;
	// 	sv = time_between - time_before;
	// 	cl = time_after - time_between;
	// 	gm = time_after_game - time_before_game;
	// 	rf = time_after_ref - time_before_ref;
	// 	sv -= gm;
	// 	cl -= rf;
	// 	Com_Printf("all:%3i sv:%3i gm:%3i cl:%3i rf:%3i\n", all, sv, gm, cl, rf);
	// }


	// // Reset deltas and mark frame.
	// if (packetframe) {
	// 	packetdelta = 0;
	// }

	// if (renderframe) {
	// 	renderdelta = 0;
	// }
}