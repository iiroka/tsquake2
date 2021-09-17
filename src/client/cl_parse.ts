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
 * This file implements the entity and network protocol parsing
 *
 * =======================================================================
 */

import * as SHARED from "../common/shared"
import * as COMMON from "../common/common"
import { Com_DPrintf, Com_Error, Com_Printf } from "../common/clientserver";
import { QReadbuf } from "../common/readbuf";
import { cl, cls, cl_shownet, cl_entities, CL_ClearState, cl_parse_entities, cl_vwep, cl_predict } from "./cl_main";
import { PROTOCOL_VERSION, svc_ops_e } from "../common/common";
import { Cbuf_AddText, Cbuf_Execute } from "../common/cmdparser";
import { clientinfo_t, connstate_t, frame_t, MAX_PARSE_ENTITIES } from "./client";
import { SCR_PlayCinematic } from "./cl_cin"
import { CL_ParseDownload } from "./cl_download"
import { R_RegisterModel, R_RegisterSkin } from "./vid";
import { cl_weaponmodels } from "./cl_view";
import { CL_SetLightstyle } from "./cl_light";
import { CL_CheckPredictionError } from "./cl_prediction"

const svc_strings: string[] = [
	"svc_bad",

	"svc_muzzleflash",
	"svc_muzzlflash2",
	"svc_temp_entity",
	"svc_layout",
	"svc_inventory",

	"svc_nop",
	"svc_disconnect",
	"svc_reconnect",
	"svc_sound",
	"svc_print",
	"svc_stufftext",
	"svc_serverdata",
	"svc_configstring",
	"svc_spawnbaseline",
	"svc_centerprint",
	"svc_download",
	"svc_playerinfo",
	"svc_packetentities",
	"svc_deltapacketentities",
	"svc_frame"
]

interface EntityBits {
    number: number
    bits: number
}
/*
 * Returns the entity number and the header bits
 */
function CL_ParseEntityBits(msg: QReadbuf): EntityBits {

	let total = msg.ReadByte();

	if ((total & COMMON.U_MOREBITS1) != 0) {
		let b = msg.ReadByte();
		total |= b << 8;
	}

	if ((total & COMMON.U_MOREBITS2) != 0) {
		let b = msg.ReadByte();
		total |= b << 16;
	}

	if ((total & COMMON.U_MOREBITS3) != 0) {
		let b = msg.ReadByte();
		total |= b << 24;
	}

	/* count the bits for net profiling */
	// for (i = 0; i < 32; i++)
	// {
	// 	if (total & (1 << i))
	// 	{
	// 		bitcounts[i]++;
	// 	}
	// }

    let number: number = 0
	if ((total & COMMON.U_NUMBER16) != 0) {
		number = msg.ReadShort();
	} else {
		number = msg.ReadByte();
	}

	return { number: number, bits: total };
}

/*
 * Can go from either a baseline or a previous packet_entity
 */
function CL_ParseDelta(msg: QReadbuf, from: SHARED.entity_state_t, to: SHARED.entity_state_t, number: number, bits: number) {
	/* set everything to the state we are delta'ing from */
    to.copy(from)

	SHARED.VectorCopy(from.origin, to.old_origin);
	to.number = number;

	if (bits & COMMON.U_MODEL)
	{
		to.modelindex = msg.ReadByte();
	}

	if (bits & COMMON.U_MODEL2)
	{
		to.modelindex2 = msg.ReadByte();
	}

	if (bits & COMMON.U_MODEL3)
	{
		to.modelindex3 = msg.ReadByte();
	}

	if (bits & COMMON.U_MODEL4)
	{
		to.modelindex4 = msg.ReadByte();
	}

	if (bits & COMMON.U_FRAME8)
	{
		to.frame = msg.ReadByte();
	}

	if (bits & COMMON.U_FRAME16)
	{
		to.frame = msg.ReadShort();
	}

	/* used for laser colors */
	if ((bits & COMMON.U_SKIN8) && (bits & COMMON.U_SKIN16))
	{
		to.skinnum = msg.ReadLong();
	}
	else if (bits & COMMON.U_SKIN8)
	{
		to.skinnum = msg.ReadByte();
	}
	else if (bits & COMMON.U_SKIN16)
	{
		to.skinnum = msg.ReadShort();
	}

	if ((bits & (COMMON.U_EFFECTS8 | COMMON.U_EFFECTS16)) == (COMMON.U_EFFECTS8 | COMMON.U_EFFECTS16))
	{
		to.effects = msg.ReadLong();
	}
	else if (bits & COMMON.U_EFFECTS8)
	{
		to.effects = msg.ReadByte();
	}
	else if (bits & COMMON.U_EFFECTS16)
	{
		to.effects = msg.ReadShort();
	}

	if ((bits & (COMMON.U_RENDERFX8 | COMMON.U_RENDERFX16)) == (COMMON.U_RENDERFX8 | COMMON.U_RENDERFX16))
	{
		to.renderfx = msg.ReadLong();
	}
	else if (bits & COMMON.U_RENDERFX8)
	{
		to.renderfx = msg.ReadByte();
	}
	else if (bits & COMMON.U_RENDERFX16)
	{
		to.renderfx = msg.ReadShort();
	}

	if (bits & COMMON.U_ORIGIN1)
	{
		to.origin[0] = msg.ReadCoord();
	}

	if (bits & COMMON.U_ORIGIN2)
	{
		to.origin[1] = msg.ReadCoord();
	}

	if (bits & COMMON.U_ORIGIN3)
	{
		to.origin[2] = msg.ReadCoord();
	}

	if (bits & COMMON.U_ANGLE1)
	{
		to.angles[0] = msg.ReadAngle();
	}

	if (bits & COMMON.U_ANGLE2)
	{
		to.angles[1] = msg.ReadAngle();
	}

	if (bits & COMMON.U_ANGLE3)
	{
		to.angles[2] = msg.ReadAngle();
	}

	if (bits & COMMON.U_OLDORIGIN)
	{
        to.old_origin = msg.ReadPos()
	}

	if (bits & COMMON.U_SOUND)
	{
		to.sound = msg.ReadByte();
	}

	if (bits & COMMON.U_EVENT)
	{
		to.event = msg.ReadByte();
	}
	else
	{
		to.event = 0;
	}

	if (bits & COMMON.U_SOLID)
	{
		to.solid = msg.ReadShort();
	}
}

/*
 * Parses deltas from the given base and adds the resulting entity to
 * the current frame
 */
function CL_DeltaEntity(msg: QReadbuf, frame: frame_t, newnum: number, old: SHARED.entity_state_t, bits: number)
{

	let ent = cl_entities[newnum];

	let state = cl_parse_entities[cl.parse_entities & (MAX_PARSE_ENTITIES - 1)];
	cl.parse_entities++;
	frame.num_entities++;

	CL_ParseDelta(msg, old, state, newnum, bits);

	/* some data changes will force no lerping */
	if ((state.modelindex != ent.current.modelindex) ||
		(state.modelindex2 != ent.current.modelindex2) ||
		(state.modelindex3 != ent.current.modelindex3) ||
		(state.modelindex4 != ent.current.modelindex4) ||
		(state.event == SHARED.entity_event_t.EV_PLAYER_TELEPORT) ||
		(state.event == SHARED.entity_event_t.EV_OTHER_TELEPORT) ||
		(Math.abs(~~(state.origin[0] - ent.current.origin[0])) > 512) ||
		(Math.abs(~~(state.origin[1] - ent.current.origin[1])) > 512) ||
		(Math.abs(~~(state.origin[2] - ent.current.origin[2])) > 512)
		)
	{
		ent.serverframe = -99;
	}

	/* wasn't in last update, so initialize some things */
	if (ent.serverframe != cl.frame.serverframe - 1)
	{
		ent.trailcount = 1024; /* for diminishing rocket / grenade trails */

		/* duplicate the current state so
		   lerping doesn't hurt anything */
		ent.prev.copy(state);

		if (state.event == SHARED.entity_event_t.EV_OTHER_TELEPORT)
		{
			SHARED.VectorCopy(state.origin, ent.prev.origin);
			SHARED.VectorCopy(state.origin, ent.lerp_origin);
		}
		else
		{
			SHARED.VectorCopy(state.old_origin, ent.prev.origin);
			SHARED.VectorCopy(state.old_origin, ent.lerp_origin);
		}
	}
	else
	{
		/* shuffle the last state to previous */
		ent.prev.copy(ent.current);
	}

	ent.serverframe = cl.frame.serverframe;
	ent.current.copy(state);
}

/*
 * An svc_packetentities has just been
 * parsed, deal with the rest of the
 * data stream.
 */
function CL_ParsePacketEntities(msg: QReadbuf, oldframe: frame_t | null, newframe: frame_t)
{

	newframe.parse_entities = cl.parse_entities;
	newframe.num_entities = 0;

	/* delta from the entities present in oldframe */
	let oldindex = 0;
    let oldnum = 0
    let oldstate: SHARED.entity_state_t = null

	if (oldframe == null) {
		oldnum = 99999;
	} else {
		if (oldindex >= oldframe.num_entities) {
			oldnum = 99999;
		} else {
			oldstate = cl_parse_entities[(oldframe.parse_entities + oldindex) & (MAX_PARSE_ENTITIES - 1)];
			oldnum = oldstate.number;
		}
	}

	while (true) {
        let r = CL_ParseEntityBits(msg) 

		if (r.number >= SHARED.MAX_EDICTS) {
			Com_Error(SHARED.ERR_DROP, `CL_ParsePacketEntities: bad number:${r.number}`);
		}

		if (msg.ReadCount() > msg.Size()) {
			Com_Error(SHARED.ERR_DROP, "CL_ParsePacketEntities: end of message");
		}

		if (!r.number) {
			break;
		}

		while (oldnum < r.number) {
			/* one or more entities from the old packet are unchanged */
			if (cl_shownet.int == 3) {
				Com_Printf(`   unchanged: ${oldnum}\n`);
			}

			CL_DeltaEntity(msg, newframe, oldnum, oldstate, 0);

			oldindex++;

			if (oldframe == null || oldindex >= oldframe.num_entities)
			{
				oldnum = 99999;
			}

			else
			{
				oldstate = cl_parse_entities[(oldframe.parse_entities + oldindex) & (MAX_PARSE_ENTITIES - 1)];
				oldnum = oldstate.number;
			}
		}

		if (r.bits & COMMON.U_REMOVE)
		{
			/* the entity present in oldframe is not in the current frame */
			if (cl_shownet.int == 3) {
				Com_Printf(`   remove: ${r.number}\n`);
			}

			if (oldnum != r.number) {
				Com_Printf("U_REMOVE: oldnum != newnum\n");
			}

			oldindex++;

			if (oldframe == null || oldindex >= oldframe?.num_entities) {
				oldnum = 99999;
			}

			else
			{
				oldstate = cl_parse_entities[(oldframe.parse_entities + oldindex) & (MAX_PARSE_ENTITIES - 1)];
				oldnum = oldstate.number;
			}

			continue;
		}

		if (oldnum == r.number)
		{
			/* delta from previous state */
			if (cl_shownet.int == 3) {
				Com_Printf(`   delta: ${r.number}\n`);
			}

			CL_DeltaEntity(msg, newframe, r.number, oldstate, r.bits);

			oldindex++;

			if (oldframe == null || oldindex >= oldframe?.num_entities)
			{
				oldnum = 99999;
			}

			else
			{
				oldstate = cl_parse_entities[(oldframe.parse_entities + oldindex) & (MAX_PARSE_ENTITIES - 1)];
				oldnum = oldstate.number;
			}

			continue;
		}

		if (oldnum > r.number)
		{
			/* delta from baseline */
			if (cl_shownet.int == 3) {
				Com_Printf(`   baseline: ${r.number}\n`);
			}

			CL_DeltaEntity(msg, newframe, r.number, cl_entities[r.number].baseline, r.bits);
			continue;
		}
	}

	/* any remaining entities in the old frame are copied over */
	while (oldnum != 99999)
	{
		/* one or more entities from the old packet are unchanged */
		if (cl_shownet.int == 3) {
			Com_Printf(`   unchanged: ${oldnum}\n`);
		}

		CL_DeltaEntity(msg, newframe, oldnum, oldstate, 0);

		oldindex++;

		if (oldframe == null || oldindex >= oldframe.num_entities)
		{
			oldnum = 99999;
		}

		else
		{
			let oldstate = cl_parse_entities[(oldframe.parse_entities +
									oldindex) & (MAX_PARSE_ENTITIES - 1)];
			oldnum = oldstate.number;
		}
	}
}

function CL_ParsePlayerstate(msg: QReadbuf, oldframe: frame_t, newframe: frame_t) {

	let state = newframe.playerstate;

	/* clear to old value before delta parsing */
	if (oldframe) {
        state.copy(oldframe.playerstate)
	} else {
        state.copy(new SHARED.player_state_t())
	}

	let flags = msg.ReadShort();

	/* parse the pmove_state_t */
	if (flags & COMMON.PS_M_TYPE)
	{
		state.pmove.pm_type = msg.ReadByte();
	}

	if (flags & COMMON.PS_M_ORIGIN)
	{
		state.pmove.origin[0] = msg.ReadShort();
		state.pmove.origin[1] = msg.ReadShort();
		state.pmove.origin[2] = msg.ReadShort();
	}

	if (flags & COMMON.PS_M_VELOCITY)
	{
		state.pmove.velocity[0] = msg.ReadShort();
		state.pmove.velocity[1] = msg.ReadShort();
		state.pmove.velocity[2] = msg.ReadShort();
	}

	if (flags & COMMON.PS_M_TIME)
	{
		state.pmove.pm_time = msg.ReadByte();
	}

	if (flags & COMMON.PS_M_FLAGS)
	{
		state.pmove.pm_flags = msg.ReadByte();
	}

	if (flags & COMMON.PS_M_GRAVITY)
	{
		state.pmove.gravity = msg.ReadShort();
	}

	if (flags & COMMON.PS_M_DELTA_ANGLES)
	{
		state.pmove.delta_angles[0] = msg.ReadShort();
		state.pmove.delta_angles[1] = msg.ReadShort();
		state.pmove.delta_angles[2] = msg.ReadShort();
	}

	if (cl.attractloop)
	{
		state.pmove.pm_type = SHARED.pmtype_t.PM_FREEZE; /* demo playback */
	}

	/* parse the rest of the player_state_t */
	if (flags & COMMON.PS_VIEWOFFSET)
	{
		state.viewoffset[0] = msg.ReadChar() * 0.25;
		state.viewoffset[1] = msg.ReadChar() * 0.25;
		state.viewoffset[2] = msg.ReadChar() * 0.25;
	}

	if (flags & COMMON.PS_VIEWANGLES)
	{
		state.viewangles[0] = msg.ReadAngle16();
		state.viewangles[1] = msg.ReadAngle16();
		state.viewangles[2] = msg.ReadAngle16();
	}

	if (flags & COMMON.PS_KICKANGLES)
	{
		state.kick_angles[0] = msg.ReadChar() * 0.25;
		state.kick_angles[1] = msg.ReadChar() * 0.25;
		state.kick_angles[2] = msg.ReadChar() * 0.25;
	}

	if (flags & COMMON.PS_WEAPONINDEX)
	{
		state.gunindex = msg.ReadByte();
	}

	if (flags & COMMON.PS_WEAPONFRAME)
	{
		state.gunframe = msg.ReadByte();
		state.gunoffset[0] = msg.ReadChar() * 0.25;
		state.gunoffset[1] = msg.ReadChar() * 0.25;
		state.gunoffset[2] = msg.ReadChar() * 0.25;
		state.gunangles[0] = msg.ReadChar() * 0.25;
		state.gunangles[1] = msg.ReadChar() * 0.25;
		state.gunangles[2] = msg.ReadChar() * 0.25;
	}

	if (flags & COMMON.PS_BLEND)
	{
		state.blend[0] = msg.ReadByte() / 255.0;
		state.blend[1] = msg.ReadByte() / 255.0;
		state.blend[2] = msg.ReadByte() / 255.0;
		state.blend[3] = msg.ReadByte() / 255.0;
	}

	if (flags & COMMON.PS_FOV)
	{
		state.fov = msg.ReadByte();
	}

	if (flags & COMMON.PS_RDFLAGS)
	{
		state.rdflags = msg.ReadByte();
	}

	/* parse stats */
	let statbits = msg.ReadLong();

	for (let i = 0; i < SHARED.MAX_STATS; i++)
	{
		if (statbits & (1 << i))
		{
			state.stats[i] = msg.ReadShort();
		}
	}
}


function CL_ParseFrame(msg: QReadbuf) {

    cl.frame = new frame_t()

	cl.frame.serverframe = msg.ReadLong();
	cl.frame.deltaframe = msg.ReadLong();
	cl.frame.servertime = cl.frame.serverframe * 100;

	/* BIG HACK to let old demos continue to work */
	if (cls.serverProtocol != 26) {
		cl.surpressCount = msg.ReadByte();
	}

	if (cl_shownet.int == 3) {
		Com_Printf(`   frame:${cl.frame.serverframe}  delta:${cl.frame.deltaframe}\n`);
	}

	/* If the frame is delta compressed from data that we
	   no longer have available, we must suck up the rest of
	   the frame, but not use it, then ask for a non-compressed
	   message */
    let old: frame_t = null
	if (cl.frame.deltaframe <= 0) {
		cl.frame.valid = true; /* uncompressed frame */
	// 	cls.demowaiting = false; /* we can start recording now */
	} else {
		old = cl.frames[cl.frame.deltaframe & COMMON.UPDATE_MASK];

		if (!old.valid) {
			/* should never happen */
			Com_Printf("Delta from invalid frame (not supposed to happen!).\n");
		}

		if (old.serverframe != cl.frame.deltaframe) {
			/* The frame that the server did the delta from
			   is too old, so we can't reconstruct it properly. */
			Com_Printf("Delta frame too old.\n");
		} else if (cl.parse_entities - old.parse_entities > MAX_PARSE_ENTITIES - 128) {
			Com_Printf("Delta parse_entities too old.\n");
		} else {
			cl.frame.valid = true; /* valid delta parse */
		}
	}

	/* clamp time */
	if (cl.time > cl.frame.servertime) {
		cl.time = cl.frame.servertime;
	} else if (cl.time < cl.frame.servertime - 100) {
		cl.time = cl.frame.servertime - 100;
	}

	/* read areabits */
	let len = msg.ReadByte();
    cl.frame.areabits = msg.ReadData(len)

	/* read playerinfo */
	let cmd = msg.ReadByte();
	SHOWNET(svc_strings[cmd], msg);

	if (cmd != svc_ops_e.svc_playerinfo) {
		Com_Error(SHARED.ERR_DROP, `CL_ParseFrame: ${cmd} not playerinfo`);
	}

	CL_ParsePlayerstate(msg, old, cl.frame);

	/* read packet entities */
	cmd = msg.ReadByte();
	SHOWNET(svc_strings[cmd], msg);

	if (cmd != svc_ops_e.svc_packetentities) {
		Com_Error(SHARED.ERR_DROP, `CL_ParseFrame: ${cmd} not packetentities`);
	}

	CL_ParsePacketEntities(msg, old, cl.frame);

	/* save the frame off in the backup array for later delta comparisons */
	cl.frames[cl.frame.serverframe & COMMON.UPDATE_MASK] = cl.frame;

	if (cl.frame.valid)
	{
		/* getting a valid frame message ends the connection process */
		if (cls.state != connstate_t.ca_active) {
			cls.state = connstate_t.ca_active;
			cl.force_refdef = true;
			cl.predicted_origin[0] = cl.frame.playerstate.pmove.origin[0] * 0.125;
			cl.predicted_origin[1] = cl.frame.playerstate.pmove.origin[1] * 0.125;
			cl.predicted_origin[2] = cl.frame.playerstate.pmove.origin[2] * 0.125;
			SHARED.VectorCopy(cl.frame.playerstate.viewangles, cl.predicted_angles);

	// 		if ((cls.disable_servercount != cl.servercount) && cl.refresh_prepped)
	// 		{
	// 			SCR_EndLoadingPlaque();  /* get rid of loading plaque */
	// 		}

	// 		cl.sound_prepped = true;

	// 		if (paused_at_load) {
	// 			if (cl_loadpaused.value == 1) {
	// 				Cvar_Set("paused", "0");
	// 			}

	// 			paused_at_load = false;
	// 		}
		}

	// 	/* fire entity events */
	// 	CL_FireEntityEvents(&cl.frame);

		if (!(!cl_predict.bool ||
			  (cl.frame.playerstate.pmove.pm_flags & SHARED.PMF_NO_PREDICTION))) {
			CL_CheckPredictionError();
		}
	}
}

function CL_ParseServerData(msg: QReadbuf) {
	// extern cvar_t *fs_gamedirvar;
	// char *str;
	// int i;

	/* Clear all key states */
	// In_FlushQueue();

	Com_DPrintf("Serverdata packet received.\n");

	/* wipe the client_state_t struct */
	CL_ClearState();
	cls.state = connstate_t.ca_connected;

	/* parse protocol version number */
	let i = msg.ReadLong();
	cls.serverProtocol = i;

	/* another demo hack */
	// if (Com_ServerState() && (PROTOCOL_VERSION == 34)) {
	// } else 
    if (i != PROTOCOL_VERSION) {
		Com_Error(SHARED.ERR_DROP, `Server returned version ${i}, not ${PROTOCOL_VERSION}`);
	}

	cl.servercount = msg.ReadLong();
	cl.attractloop = msg.ReadByte() != 0;

	/* game directory */
	cl.gamedir = msg.ReadString();

	/* set gamedir */
	// if ((*str && (!fs_gamedirvar.string || !*fs_gamedirvar.string ||
	// 	  strcmp(fs_gamedirvar.string, str))) ||
	// 	(!*str && (fs_gamedirvar.string && !*fs_gamedirvar.string)))
	// {
	// 	Cvar_Set("game", str);
	// }

	/* parse player entity number */
	cl.playernum = msg.ReadShort();

	/* get the full level name */
	let str = msg.ReadString();

    console.log("playernum", cl.playernum)
	if (cl.playernum == -1) {
		/* playing a cinematic or showing a pic, not a level */
		SCR_PlayCinematic(str);
	} else {
		/* seperate the printfs so the server
		 * message can have a color */
		// Com_Printf("\n\n\35\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\36\37\n\n");
		// Com_Printf(`\2${str}\n`);
        Com_Printf(`${str}\n`);

		/* need to prep refresh at next oportunity */
		cl.refresh_prepped = false;
	}
}

function CL_ParseBaseline(msg: QReadbuf) {
    const r = CL_ParseEntityBits(msg)
    let newnum = r.number
    let bits = r.bits
    cl_entities[newnum].baseline = new SHARED.entity_state_t()
	CL_ParseDelta(msg, new SHARED.entity_state_t(), cl_entities[newnum].baseline, newnum, bits);
}

export async function CL_LoadClientinfo(ci: clientinfo_t, s: string) {
	// int i;
	// char *t;
	// char model_name[MAX_QPATH];
	// char skin_name[MAX_QPATH];
	// char model_filename[MAX_QPATH];
	// char skin_filename[MAX_QPATH];
	// char weapon_filename[MAX_QPATH];

	ci.cinfo = s;

	/* isolate the player's name */
    let index = s.indexOf("\\")

	if (index > 0) {
        ci.name = s.slice(0, index);
	 	s = s.slice(index+1);
	} else {
        ci.name = s;
        s = null;
    }

	// if (cl_noskins->value || (*s == 0))
    if (s == null) {
	    let model_filename = "players/male/tris.md2";
	    let weapon_filename = "players/male/weapon.md2";
	    let skin_filename = "players/male/grunt.pcx";
	    ci.iconname = "/players/male/grunt_i.pcx";
		ci.model = await R_RegisterModel(model_filename);
	// 	memset(ci->weaponmodel, 0, sizeof(ci->weaponmodel));
		ci.weaponmodel[0] = await R_RegisterModel(weapon_filename);
		ci.skin = await R_RegisterSkin(skin_filename);
	// 	ci->icon = Draw_FindPic(ci->iconname);
	}
	else
	{
		/* isolate the model and skin name */
        index = s.indexOf("/")
		if (index < 0) {
			index = s.indexOf("//")
		}
        let model_name: string
        let skin_name: string
		if (index < 0) {
            model_name = ""
            skin_name = s
        } else {
            model_name = s.slice(0, index)
            skin_name = s.slice(index + 1)

        }

		/* model file */
		let model_filename = `players/${model_name}/tris.md2`
		ci.model = await R_RegisterModel(model_filename);

		if (ci.model == null) {
	        model_name = "male";
            model_filename = `players/${model_name}/tris.md2`
            ci.model = await R_RegisterModel(model_filename);
		}

		/* skin file */
	    let skin_filename = `players/${model_name}/${skin_name}.pcx`;
		ci.skin = await R_RegisterSkin(skin_filename);

		/* if we don't have the skin and the model wasn't male,
		 * see if the male has it (this is for CTF's skins) */
		if (ci.skin == null && model_name != "male") {
			/* change model to male */
			model_name = "male";
	        model_filename = "players/male/tris.md2";
			ci.model = await R_RegisterModel(model_filename);

			/* see if the skin exists for the male model */
            skin_filename = `players/${model_name}/${skin_name}.pcx`;
            ci.skin = await R_RegisterSkin(skin_filename);
        }

		/* if we still don't have a skin, it means that the male model didn't have
		 * it, so default to grunt */
		if (ci.skin == null)
		{
			/* see if the skin exists for the male model */
            skin_filename = `players/${model_name}/grunt.pcx`;
            ci.skin = await R_RegisterSkin(skin_filename);
		}

		/* weapon file */
		for (let i in cl_weaponmodels) {
			let weapon_filename = `players/${model_name}/${cl_weaponmodels[i]}`
			ci.weaponmodel[i] = await R_RegisterModel(weapon_filename);

	// 		if (!ci->weaponmodel[i] && (strcmp(model_name, "cyborg") == 0)) {
	// 			/* try male */
	// 			Com_sprintf(weapon_filename, sizeof(weapon_filename),
	// 					"players/male/%s", cl_weaponmodels[i]);
	// 			ci->weaponmodel[i] = R_RegisterModel(weapon_filename);
	// 		}

			if (!cl_vwep.bool) {
				break; /* only one when vwep is off */
			}
		}

		/* icon file */
	    ci.iconname = `/players/${model_name}/${skin_name}_i.pcx`;
	// 	ci->icon = Draw_FindPic(ci->iconname);
	}

	// /* must have loaded all data types to be valid */
	// if (!ci->skin || !ci->icon || !ci->model || !ci->weaponmodel[0])
	// {
	// 	ci->skin = NULL;
	// 	ci->icon = NULL;
	// 	ci->model = NULL;
	// 	ci->weaponmodel[0] = NULL;
	// 	return;
	// }
}

/*
 * Load the skin, icon, and model for a client
 */
export async function CL_ParseClientinfo(player: number) {
	let s = cl.configstrings[player + SHARED.CS_PLAYERSKINS];
	let ci = cl.clientinfo[player];
	await CL_LoadClientinfo(ci, s);
}


async function CL_ParseConfigString(msg: QReadbuf) {
	// int i, length;
	// char *s;
	// char olds[MAX_QPATH];

	let i = msg.ReadShort();
	if ((i < 0) || (i >= SHARED.MAX_CONFIGSTRINGS)) {
		Com_Error(SHARED.ERR_DROP, "configstring > MAX_CONFIGSTRINGS");
	}

	let s = msg.ReadString();

	// Q_strlcpy(olds, cl.configstrings[i], sizeof(olds));

	// length = strlen(s);
	// if (length > sizeof(cl.configstrings) - sizeof(cl.configstrings[0])*i - 1)
	// {
	// 	Com_Error(ERR_DROP, "CL_ParseConfigString: oversize configstring");
	// }

	cl.configstrings[i] = s;

	/* do something apropriate */
	if ((i >= SHARED.CS_LIGHTS) && (i < SHARED.CS_LIGHTS + SHARED.MAX_LIGHTSTYLES)) {
        CL_SetLightstyle(i - SHARED.CS_LIGHTS);
	// } else if (i == SHARED.CS_CDTRACK) {
	// 	if (cl.refresh_prepped)
	// 	{
	// 		OGG_PlayTrack((int)strtol(cl.configstrings[CS_CDTRACK], (char **)NULL, 10));
	// 	}
	} else if ((i >= SHARED.CS_MODELS) && (i < SHARED.CS_MODELS + SHARED.MAX_MODELS)) {
	// 	if (cl.refresh_prepped)
	// 	{
	// 		cl.model_draw[i - CS_MODELS] = (cl.configstrings[i]);

	// 		if (cl.configstrings[i][0] == '*')
	// 		{
	// 			cl.model_clip[i - CS_MODELS] = CM_InlineModel(cl.configstrings[i]);
	// 		}

	// 		else
	// 		{
	// 			cl.model_clip[i - CS_MODELS] = NULL;
	// 		}
	// 	}
	} else if ((i >= SHARED.CS_SOUNDS) && (i < SHARED.CS_SOUNDS + SHARED.MAX_MODELS)) {
	// 	if (cl.refresh_prepped)
	// 	{
	// 		cl.sound_precache[i - CS_SOUNDS] =
	// 			S_RegisterSound(cl.configstrings[i]);
	// 	}
	} else if ((i >= SHARED.CS_IMAGES) && (i < SHARED.CS_IMAGES + SHARED.MAX_MODELS)) {
	// 	if (cl.refresh_prepped)
	// 	{
	// 		cl.image_precache[i - CS_IMAGES] = Draw_FindPic(cl.configstrings[i]);
	// 	}
	} else if ((i >= SHARED.CS_PLAYERSKINS) && (i < SHARED.CS_PLAYERSKINS + SHARED.MAX_CLIENTS)) {
	// 	if (cl.refresh_prepped && strcmp(olds, s))
	// 	{
	// 		CL_ParseClientinfo(i - CS_PLAYERSKINS);
	// 	}
	}
}

function SHOWNET(s: string, msg: QReadbuf) {
	if (cl_shownet.int >= 2) {
		Com_Printf(`${msg.ReadCount()-1}:${s}\n`);
	}
}

export async function CL_ParseServerMessage(msg: QReadbuf) {

	/* if recording demos, copy the message out */
	if (cl_shownet.int == 1)
	{
		Com_Printf(`${msg.Size()} `);
	}

	else if (cl_shownet.int >= 2)
	{
		Com_Printf("------------------\n");
	}

	/* parse the message */
	while (1)
	{
		if (msg.ReadCount() > msg.Size()) {
			Com_Error(SHARED.ERR_DROP, "CL_ParseServerMessage: Bad server message");
			break;
		}

		let cmd = msg.ReadByte();
		if (cmd == -1) {
			SHOWNET("END OF MESSAGE", msg);
			break;
		}

		if (cl_shownet.int >= 2)
		{
			if (!svc_strings[cmd])
			{
				Com_Printf(`${msg.ReadCount()-1}:BAD CMD ${cmd}\n`);
			}

			else
			{
				SHOWNET(svc_strings[cmd], msg);
			}
		}

		/* other commands */
		switch (cmd)
		{
			case svc_ops_e.svc_nop:
				break;

			case svc_ops_e.svc_disconnect:
				Com_Error(SHARED.ERR_DISCONNECT, "Server disconnected\n");
				break;

			// case svc_ops_e.svc_reconnect:
			// 	Com_Printf("Server disconnected, reconnecting\n");

			// 	if (cls.download)
			// 	{
			// 		/* close download */
			// 		fclose(cls.download);
			// 		cls.download = NULL;
			// 	}

			// 	cls.state = ca_connecting;
			// 	cls.connect_time = -99999; /* CL_CheckForResend() will fire immediately */
			// 	break;

			// case svc_print:
			// 	i = MSG_ReadByte(&net_message);

			// 	if (i == PRINT_CHAT)
			// 	{
			// 		S_StartLocalSound("misc/talk.wav");
			// 		con.ormask = 128;
			// 	}

			// 	Com_Printf("%s", MSG_ReadString(&net_message));
			// 	con.ormask = 0;
			// 	break;

			// case svc_centerprint:
			// 	SCR_CenterPrint(MSG_ReadString(&net_message));
			// 	break;

			case svc_ops_e.svc_stufftext:
				let s = msg.ReadString();
				Com_DPrintf(`stufftext: ${s}\n`);
				Cbuf_AddText(s);
				break;

			case svc_ops_e.svc_serverdata:
				await Cbuf_Execute();  /* make sure any stuffed commands are done */
				CL_ParseServerData(msg);
				break;

			case svc_ops_e.svc_configstring:
				await CL_ParseConfigString(msg);
				break;

			// case svc_sound:
			// 	CL_ParseStartSoundPacket();
			// 	break;

			case svc_ops_e.svc_spawnbaseline:
				CL_ParseBaseline(msg);
				break;

			// case svc_temp_entity:
			// 	CL_ParseTEnt();
			// 	break;

			// case svc_muzzleflash:
			// 	CL_AddMuzzleFlash();
			// 	break;

			// case svc_muzzleflash2:
			// 	CL_AddMuzzleFlash2();
			// 	break;

			case svc_ops_e.svc_download:
				CL_ParseDownload(msg);
				break;

			case svc_ops_e.svc_frame:
				CL_ParseFrame(msg);
				break;

			// case svc_inventory:
			// 	CL_ParseInventory();
			// 	break;

			// case svc_layout:
			// 	s = MSG_ReadString(&net_message);
			// 	Q_strlcpy(cl.layout, s, sizeof(cl.layout));
			// 	break;

			case svc_ops_e.svc_playerinfo:
			case svc_ops_e.svc_packetentities:
			case svc_ops_e.svc_deltapacketentities:
				Com_Error(SHARED.ERR_DROP, "Out of place frame data");
				break;

			default:
				Com_Error(SHARED.ERR_DROP, "CL_ParseServerMessage: Illegible server message\n");
				break;
		}
	}

// 	CL_AddNetgraph();

// 	/* we don't know if it is ok to save a demo message
// 	   until after we have parsed the frame */
// 	if (cls.demorecording && !cls.demowaiting)
// 	{
// 		CL_WriteDemoMessage();
// 	}
}

