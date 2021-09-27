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
 * This file implements the 2D stuff. For example the HUD and the
 * networkgraph.
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { Cvar_Get, Cvar_Set } from "../common/cvar"
import { Com_Error, Com_Printf, Sys_Milliseconds } from "../common/clientserver"
import { R_EndFrame, R_BeginFrame, Draw_GetPicSize, Draw_PicScaled, Draw_FindPic, viddef, Draw_Fill } from "./vid"
import { con, Con_DrawConsole, Con_CheckResize, DrawStringScaled } from "./cl_console"
import { cls, cl } from "./cl_main"
import { M_Draw } from "./menu/menu"
import { Cmd_AddCommand } from "../common/cmdparser"
import { connstate_t, keydest_t } from "./client"
import { V_RenderView } from "./cl_view"

class vrect_t {
	x: number = 0
	y: number = 0
	width: number = 0
	height: number = 0
}

let scr_initialized = false
let scr_draw_loading = 0

export let scr_vrect = new vrect_t() /* position of render window on screen */

let scr_viewsize: SHARED.cvar_t
let scr_conspeed: SHARED.cvar_t
let scr_centertime: SHARED.cvar_t
let scr_showturtle: SHARED.cvar_t
let scr_showpause: SHARED.cvar_t

let scr_netgraph: SHARED.cvar_t
let scr_timegraph: SHARED.cvar_t
let scr_debuggraph: SHARED.cvar_t
let scr_graphheight: SHARED.cvar_t
let scr_graphscale: SHARED.cvar_t
let scr_graphshift: SHARED.cvar_t
let scr_drawall: SHARED.cvar_t

let r_hudscale: SHARED.cvar_t /* named for consistency with R1Q2 */
let r_consolescale: SHARED.cvar_t
let r_menuscale: SHARED.cvar_t

/*
 * Sets scr_vrect, the coordinates of the rendered window
 */
function SCR_CalcVrect() {

	/* bound viewsize */
	if (scr_viewsize.int < 40) {
		Cvar_Set("viewsize", "40");
	}

	if (scr_viewsize.int > 100)
	{
		Cvar_Set("viewsize", "100");
	}

	let size = scr_viewsize.int;

	scr_vrect.width = ~~(viddef.width * size / 100);
	scr_vrect.height = ~~(viddef.height * size / 100);

	scr_vrect.x = ~~((viddef.width - scr_vrect.width) / 2);
	scr_vrect.y = ~~((viddef.height - scr_vrect.height) / 2);
}


export function SCR_Init() {
	scr_viewsize = Cvar_Get("viewsize", "100", SHARED.CVAR_ARCHIVE);
	scr_conspeed = Cvar_Get("scr_conspeed", "3", 0);
	scr_centertime = Cvar_Get("scr_centertime", "2.5", 0);
	scr_showturtle = Cvar_Get("scr_showturtle", "0", 0);
	scr_showpause = Cvar_Get("scr_showpause", "1", 0);
	scr_netgraph = Cvar_Get("netgraph", "0", 0);
	scr_timegraph = Cvar_Get("timegraph", "0", 0);
	scr_debuggraph = Cvar_Get("debuggraph", "0", 0);
	scr_graphheight = Cvar_Get("graphheight", "32", 0);
	scr_graphscale = Cvar_Get("graphscale", "1", 0);
	scr_graphshift = Cvar_Get("graphshift", "0", 0);
	scr_drawall = Cvar_Get("scr_drawall", "0", 0);
	r_hudscale = Cvar_Get("r_hudscale", "-1", SHARED.CVAR_ARCHIVE);
	r_consolescale = Cvar_Get("r_consolescale", "-1", SHARED.CVAR_ARCHIVE);
	r_menuscale = Cvar_Get("r_menuscale", "-1", SHARED.CVAR_ARCHIVE);

	// /* register our commands */
	// Cmd_AddCommand("timerefresh", SCR_TimeRefresh_f);
	Cmd_AddCommand("loading", SCR_Loading_f);
	// Cmd_AddCommand("sizeup", SCR_SizeUp_f);
	// Cmd_AddCommand("sizedown", SCR_SizeDown_f);
	// Cmd_AddCommand("sky", SCR_Sky_f);

	scr_initialized = true;
}

async function SCR_DrawLoading() {
	// int w, h;
	// float scale = SCR_GetMenuScale();
    const scale = 1.0

	if (scr_draw_loading == 0) {
		return;
	}

	const sz = await Draw_GetPicSize("loading");
	await Draw_PicScaled((viddef.width - sz[0] * scale) / 2, (viddef.height - sz[1] * scale) / 2, "loading", scale);
}


async function SCR_DrawConsole() {
	Con_CheckResize();

	if ((cls.state == connstate_t.ca_disconnected) || (cls.state == connstate_t.ca_connecting) || 
        (cls.state == connstate_t.ca_queing) || (cls.state == connstate_t.ca_preconnecting)) {
		/* forced full screen console */
		Con_DrawConsole(1.0);
		return;
	}

	if ((cls.state != connstate_t.ca_active) || !cl.refresh_prepped) {
		/* connected, but can't render */
		Con_DrawConsole(0.5);
		Draw_Fill(0, viddef.height / 2, viddef.width, viddef.height / 2, 0);
		return;
	}

	// if (scr_con_current)
	// {
	// 	Con_DrawConsole(scr_con_current);
	// }
	// else
	// {
	// 	if ((cls.key_dest == key_game) || (cls.key_dest == key_message))
	// 	{
	// 		Con_DrawNotify(); /* only draw notify in game */
	// 	}
	// }
}

export async function SCR_BeginLoadingPlaque() {
	// S_StopAllSounds();
	// cl.sound_prepped = false; /* don't play ambients */

	// OGG_Stop();

	if (cls.disable_screen != 0) {
		return;
	}

	// if (developer->value)
	// {
	// 	return;
	// }

	if (cls.state == connstate_t.ca_disconnected) {
		/* if at console, don't bring up the plaque */
		return;
	}

	if (cls.key_dest == keydest_t.key_console) {
		return;
	}

	// if (cl.cinematictime > 0)
	// {
	// 	scr_draw_loading = 2; /* clear to balack first */
	// }
	// else
	// {
		scr_draw_loading = 1;
	// }

	await SCR_UpdateScreen();

	scr_draw_loading = 0;

	// SCR_StopCinematic();
	cls.disable_screen = Sys_Milliseconds();
	cls.disable_servercount = cl.servercount;
}

export function SCR_EndLoadingPlaque() {
	cls.disable_screen = 0;
	// Con_ClearNotify();
}

async function SCR_Loading_f(args: string[]) {
	await SCR_BeginLoadingPlaque();
}

const STAT_MINUS = 10
const sb_nums = [
	[
		"num_0", "num_1", "num_2", "num_3", "num_4", "num_5",
		"num_6", "num_7", "num_8", "num_9", "num_minus"
	],
	[
		"anum_0", "anum_1", "anum_2", "anum_3", "anum_4", "anum_5",
		"anum_6", "anum_7", "anum_8", "anum_9", "anum_minus"
	]
];

const ICON_WIDTH = 24
const ICON_HEIGHT = 24
const CHAR_WIDTH = 16
const ICON_SPACE = 8

async function SCR_DrawFieldScaled(x: number, y: number, color: number, width: number, value: number, factor: number)
{
	// char num[16], *ptr;
	// int l;
	// int frame;

	if (width < 1)
	{
		return;
	}

	/* draw number string */
	if (width > 5)
	{
		width = 5;
	}


	let num = `${value}`
	let l = num.length

	if (l > width)
	{
		l = width;
	}

	x += (2 + CHAR_WIDTH * (width - l)) * factor;

	for (let i =  0; i < l; i++) {
		let frame = 0
		if (num[i] == '-')
		{
			frame = STAT_MINUS;
		}

		else
		{
			frame = num.charCodeAt(i) - 0x30;
		}

		Draw_PicScaled(x, y, sb_nums[color][frame], factor);
		x += CHAR_WIDTH*factor;
	}
}

async function SCR_DrawField(x: number, y: number, color: number, width: number, value: number)
{
	await SCR_DrawFieldScaled(~~x, ~~y, ~~color, ~~width, ~~value, 1.0);
}


/*
 * Allows rendering code to cache all needed sbar graphics
 */
export async function SCR_TouchPics() {

	for (let i = 0; i < 2; i++) {
		for (let j = 0; j < 11; j++) {
			await Draw_FindPic(sb_nums[i][j]);
		}
	}

	// if (crosshair->value) {
	// 	if ((crosshair->value > 3) || (crosshair->value < 0)) {
	// 		crosshair->value = 3;
	// 	}

	// 	Com_sprintf(crosshair_pic, sizeof(crosshair_pic), "ch%i",
	// 			(int)(crosshair->value));
	// 	Draw_GetPicSize(&crosshair_width, &crosshair_height, crosshair_pic);

	// 	if (!crosshair_width)
	// 	{
	// 		crosshair_pic[0] = 0;
	// 	}
	// }
}

async function SCR_ExecuteLayoutString(s: string)
{
	// int x, y;
	// int value;
	// char *token;
	// int width;
	// int index;
	// clientinfo_t *ci;

	// float scale = SCR_GetHUDScale();
	const scale = 1.0

	if ((cls.state != connstate_t.ca_active) || !cl.refresh_prepped)
	{
		return;
	}

	if (!s)
	{
		return;
	}

	let x = 0;
	let y = 0;
	let r = { token: "", index: 0}

	while (r.index >= 0 && r.index < s.length)
	{
		r = SHARED.COM_Parse(s, r.index)
		if (r.index < 0) break;

		if (r.token == "xl") {
			r = SHARED.COM_Parse(s, r.index)
			x = ~~(scale * parseInt(r.token))
			continue
		}

		if (r.token == "xr") {
			r = SHARED.COM_Parse(s, r.index)
			x = viddef.width + ~~(scale * parseInt(r.token))
			continue
		}

		if (r.token == "xv") {
			r = SHARED.COM_Parse(s, r.index)
			x = ~~(viddef.width / 2 - scale * 160 + scale * parseInt(r.token))
			continue
		}

		if (r.token == "yt") {
			r = SHARED.COM_Parse(s, r.index)
			y = ~~(scale * parseInt(r.token))
			continue
		}

		if (r.token == "yb") {
			r = SHARED.COM_Parse(s, r.index)
			y = ~~(viddef.height + scale * parseInt(r.token))
			continue
		}

		if (r.token == "yv") {
			r = SHARED.COM_Parse(s, r.index)
			y = ~~(viddef.height / 2 - scale*120 + scale * parseInt(r.token))
			continue
		}

		if (r.token == "pic")
		{
			/* draw a pic from a stat number */
			r = SHARED.COM_Parse(s, r.index);
			let index = parseInt(r.token)

			if ((index < 0) || (index >= cl.frame.playerstate.stats.length))
			{
				Com_Error(SHARED.ERR_DROP, `bad stats index ${index} (0x${index.toString(16)})`);
			}

			let value = cl.frame.playerstate.stats[index];

			if (value >= SHARED.MAX_IMAGES)
			{
				Com_Error(SHARED.ERR_DROP, "Pic >= MAX_IMAGES");
			}

			if (cl.configstrings[SHARED.CS_IMAGES + value])
			{
				// SCR_AddDirtyPoint(x, y);
				// SCR_AddDirtyPoint(x + 23*scale, y + 23*scale);
				Draw_PicScaled(x, y, cl.configstrings[SHARED.CS_IMAGES + value], scale);
			}

			continue;
		}

	// 	if (!strcmp(token, "client"))
	// 	{
	// 		/* draw a deathmatch client block */
	// 		int score, ping, time;

	// 		token = COM_Parse(&s);
	// 		x = viddef.width / 2 - scale*160 + scale*(int)strtol(token, (char **)NULL, 10);
	// 		token = COM_Parse(&s);
	// 		y = viddef.height / 2 - scale*120 + scale*(int)strtol(token, (char **)NULL, 10);
	// 		SCR_AddDirtyPoint(x, y);
	// 		SCR_AddDirtyPoint(x + scale*159, y + scale*31);

	// 		token = COM_Parse(&s);
	// 		value = (int)strtol(token, (char **)NULL, 10);

	// 		if ((value >= MAX_CLIENTS) || (value < 0))
	// 		{
	// 			Com_Error(ERR_DROP, "client >= MAX_CLIENTS");
	// 		}

	// 		ci = &cl.clientinfo[value];

	// 		token = COM_Parse(&s);
	// 		score = (int)strtol(token, (char **)NULL, 10);

	// 		token = COM_Parse(&s);
	// 		ping = (int)strtol(token, (char **)NULL, 10);

	// 		token = COM_Parse(&s);
	// 		time = (int)strtol(token, (char **)NULL, 10);

	// 		DrawAltStringScaled(x + scale*32, y, ci->name, scale);
	// 		DrawAltStringScaled(x + scale*32, y + scale*8, "Score: ", scale);
	// 		DrawAltStringScaled(x + scale*(32 + 7 * 8), y + scale*8, va("%i", score), scale);
	// 		DrawStringScaled(x + scale*32, y + scale*16, va("Ping:  %i", ping), scale);
	// 		DrawStringScaled(x + scale*32, y + scale*24, va("Time:  %i", time), scale);

	// 		if (!ci->icon)
	// 		{
	// 			ci = &cl.baseclientinfo;
	// 		}

	// 		Draw_PicScaled(x, y, ci->iconname, scale);
	// 		continue;
	// 	}

	// 	if (!strcmp(token, "ctf"))
	// 	{
	// 		/* draw a ctf client block */
	// 		int score, ping;
	// 		char block[80];

	// 		token = COM_Parse(&s);
	// 		x = viddef.width / 2 - scale*160 + scale*(int)strtol(token, (char **)NULL, 10);
	// 		token = COM_Parse(&s);
	// 		y = viddef.height / 2 - scale*120 + scale*(int)strtol(token, (char **)NULL, 10);
	// 		SCR_AddDirtyPoint(x, y);
	// 		SCR_AddDirtyPoint(x + scale*159, y + scale*31);

	// 		token = COM_Parse(&s);
	// 		value = (int)strtol(token, (char **)NULL, 10);

	// 		if ((value >= MAX_CLIENTS) || (value < 0))
	// 		{
	// 			Com_Error(ERR_DROP, "client >= MAX_CLIENTS");
	// 		}

	// 		ci = &cl.clientinfo[value];

	// 		token = COM_Parse(&s);
	// 		score = (int)strtol(token, (char **)NULL, 10);

	// 		token = COM_Parse(&s);
	// 		ping = (int)strtol(token, (char **)NULL, 10);

	// 		if (ping > 999)
	// 		{
	// 			ping = 999;
	// 		}

	// 		sprintf(block, "%3d %3d %-12.12s", score, ping, ci->name);

	// 		if (value == cl.playernum)
	// 		{
	// 			DrawAltStringScaled(x, y, block, scale);
	// 		}

	// 		else
	// 		{
	// 			DrawStringScaled(x, y, block, scale);
	// 		}

	// 		continue;
	// 	}

	// 	if (!strcmp(token, "picn"))
	// 	{
	// 		/* draw a pic from a name */
	// 		token = COM_Parse(&s);
	// 		SCR_AddDirtyPoint(x, y);
	// 		SCR_AddDirtyPoint(x + scale*23, y + scale*23);
	// 		Draw_PicScaled(x, y, (char *)token, scale);
	// 		continue;
	// 	}

	// 	if (!strcmp(token, "num"))
	// 	{
	// 		/* draw a number */
	// 		token = COM_Parse(&s);
	// 		width = (int)strtol(token, (char **)NULL, 10);
	// 		token = COM_Parse(&s);
	// 		value = cl.frame.playerstate.stats[(int)strtol(token, (char **)NULL, 10)];
	// 		SCR_DrawFieldScaled(x, y, 0, width, value, scale);
	// 		continue;
	// 	}

		if (r.token == "hnum") {
			/* health number */
			let color = 0;

			let value = cl.frame.playerstate.stats[SHARED.STAT_HEALTH];

			if (value > 25)
			{
				color = 0;  /* green */
			}
			else if (value > 0)
			{
				color = (cl.frame.serverframe >> 2) & 1; /* flash */
			}
			else
			{
				color = 1;
			}

			if (cl.frame.playerstate.stats[SHARED.STAT_FLASHES] & 1)
			{
				await Draw_PicScaled(x, y, "field_3", scale);
			}

			SCR_DrawFieldScaled(x, y, color, 3, value, scale);
			continue;
		}

		if (r.token == "anum")
		{
			/* ammo number */
			let color = 0;

			let value = cl.frame.playerstate.stats[SHARED.STAT_AMMO];

			if (value > 5)
			{
				color = 0; /* green */
			}
			else if (value >= 0)
			{
				color = (cl.frame.serverframe >> 2) & 1; /* flash */
			}
			else
			{
				continue; /* negative number = don't show */
			}

			if (cl.frame.playerstate.stats[SHARED.STAT_FLASHES] & 4)
			{
				Draw_PicScaled(x, y, "field_3", scale);
			}

			SCR_DrawFieldScaled(x, y, color, 3, value, scale);
			continue;
		}

		if (r.token == "rnum")
		{
			/* armor number */
			let value = cl.frame.playerstate.stats[SHARED.STAT_ARMOR];
			if (value < 1) {
				continue;
			}

			if (cl.frame.playerstate.stats[SHARED.STAT_FLASHES] & 2) {
				Draw_PicScaled(x, y, "field_3", scale);
			}

			SCR_DrawFieldScaled(x, y, 0, 3, value, scale);
			continue;
		}

		if (r.token == "stat_string")
		{
			r = SHARED.COM_Parse(s, r.index);
			let index = parseInt(r.token)

			if ((index < 0) || (index >= SHARED.MAX_CONFIGSTRINGS)) {
				Com_Error(SHARED.ERR_DROP, "Bad stat_string index");
			}

			index = cl.frame.playerstate.stats[index];

			if ((index < 0) || (index >= SHARED.MAX_CONFIGSTRINGS))
			{
				Com_Error(SHARED.ERR_DROP, "Bad stat_string index");
			}

			DrawStringScaled(x, y, cl.configstrings[index], scale);
			continue;
		}

	// 	if (!strcmp(token, "cstring"))
	// 	{
	// 		token = COM_Parse(&s);
	// 		DrawHUDStringScaled(token, x, y, 320, 0, scale); // FIXME: or scale 320 here?
	// 		continue;
	// 	}

	// 	if (!strcmp(token, "string"))
	// 	{
	// 		token = COM_Parse(&s);
	// 		DrawStringScaled(x, y, token, scale);
	// 		continue;
	// 	}

	// 	if (!strcmp(token, "cstring2"))
	// 	{
	// 		token = COM_Parse(&s);
	// 		DrawHUDStringScaled(token, x, y, 320, 0x80, scale); // FIXME: or scale 320 here?
	// 		continue;
	// 	}

	// 	if (!strcmp(token, "string2"))
	// 	{
	// 		token = COM_Parse(&s);
	// 		DrawAltStringScaled(x, y, token, scale);
	// 		continue;
	// 	}

		if (r.token == "if")
		{
			r = SHARED.COM_Parse(s, r.index)
			let value = cl.frame.playerstate.stats[parseInt(r.token)];

			if (!value)
			{
				/* skip to endif */
				while (r.index >= 0  && r.index < s.length && r.token != "endif") {
					r = SHARED.COM_Parse(s, r.index)
				}
			}

			continue;
		}
		if (r.token == "endif") {
			continue
		}
		console.log(r.token)
	}
}


/*
 * The status bar is a small layout program that
 * is based on the stats array
 */
async function SCR_DrawStats()
{
	await SCR_ExecuteLayoutString(cl.configstrings[SHARED.CS_STATUSBAR]);
}

const STAT_LAYOUTS = 13

async function SCR_DrawLayout()
{
	if (!cl.frame.playerstate.stats[STAT_LAYOUTS])
	{
		return;
	}

	await SCR_ExecuteLayoutString(cl.layout);
}


// ----
/*
 * This is called every frame, and can also be called
 * explicitly to flush text to the screen.
 */
export async function SCR_UpdateScreen() {
	// int numframes;
	// int i;
	// float separation[2] = {0, 0};
	// float scale = SCR_GetMenuScale();
	const scale = 1.0

	/* if the screen is disabled (loading plaque is
	   up, or vid mode changing) do nothing at all */
	if (cls.disable_screen != 0) {
		if (Sys_Milliseconds() - cls.disable_screen > 120000)
		{
			cls.disable_screen = 0;
			Com_Printf("Loading plaque timed out.\n");
		}

		return;
	}

	if (!scr_initialized || !con.initialized) {
		return; /* not initialized yet */
	}

    let separation = [0,0]
    let numframes = 1
	// if ( gl1_stereo->value )
	// {
	// 	numframes = 2;
	// 	separation[0] = -gl1_stereo_separation->value / 2;
	// 	separation[1] = +gl1_stereo_separation->value / 2;
	// }
	// else
	// {
	// 	separation[0] = 0;
	// 	separation[1] = 0;
	// 	numframes = 1;
	// }

	for (let i = 0; i < numframes; i++)
	{
		R_BeginFrame(separation[i]);

		if (scr_draw_loading == 2) {
			/* loading plaque over black screen */
	// 		R_EndWorldRenderpass();
	// 		if(i == 0){
	// 			R_SetPalette(NULL);
	// 		}

	// 		if(i == numframes - 1){
	// 			scr_draw_loading = false;
	// 		}

			let r = await Draw_GetPicSize("loading")
			await Draw_PicScaled((viddef.width - r[0] * scale) / 2, (viddef.height - r[1] * scale) / 2, "loading", scale);
		// }

		/* if a cinematic is supposed to be running,
		   handle menus and console specially */
	// 	else if (cl.cinematictime > 0)
	// 	{
	// 		if (cls.key_dest == key_menu)
	// 		{
	// 			if (cl.cinematicpalette_active)
	// 			{
	// 				R_SetPalette(NULL);
	// 				cl.cinematicpalette_active = false;
	// 			}

	// 			R_EndWorldRenderpass();
	// 			M_Draw();
	// 		}
	// 		else if (cls.key_dest == key_console)
	// 		{
	// 			if (cl.cinematicpalette_active)
	// 			{
	// 				R_SetPalette(NULL);
	// 				cl.cinematicpalette_active = false;
	// 			}

	// 			R_EndWorldRenderpass();
	// 			SCR_DrawConsole();
	// 		}
	// 		else
	// 		{
	// 			R_EndWorldRenderpass();
	// 			SCR_DrawCinematic();
	// 		}
		}
		else
		{
	// 		/* make sure the game palette is active */
	// 		if (cl.cinematicpalette_active)
	// 		{
	// 			R_SetPalette(NULL);
	// 			cl.cinematicpalette_active = false;
	// 		}

			/* do 3D refresh drawing, and then update the screen */
			SCR_CalcVrect();

			/* clear any dirty part of the background */
	// 		SCR_TileClear();

			await V_RenderView(separation[i]);

			await SCR_DrawStats();

			if (cl.frame.playerstate.stats[SHARED.STAT_LAYOUTS] & 1)
			{
				await SCR_DrawLayout();
			}

			if (cl.frame.playerstate.stats[SHARED.STAT_LAYOUTS] & 2)
			{
				// CL_DrawInventory();
			}

	// 		SCR_DrawNet();
	// 		SCR_CheckDrawCenterString();

	// 		if (scr_timegraph->value)
	// 		{
	// 			SCR_DebugGraph(cls.rframetime * 300, 0);
	// 		}

	// 		if (scr_debuggraph->value || scr_timegraph->value ||
	// 			scr_netgraph->value)
	// 		{
	// 			SCR_DrawDebugGraph();
	// 		}

	// 		SCR_DrawPause();

			await SCR_DrawConsole();

			await M_Draw();

			SCR_DrawLoading();
		}
	}

	// SCR_Framecounter();
	R_EndFrame();
}
