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
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA 02111-1307,
 * USA.
 *
 * =======================================================================
 *
 * Main header for the client
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { netchan_t } from "../common/netchan"
import { UPDATE_BACKUP } from "../common/common"
import { refdef_t } from "./ref"

export const MAX_CLIENTWEAPONMODELS = 20
export const CMD_BACKUP = 256 /* allow a lot of command backups for very fast systems */

/* the cl_parse_entities must be large enough to hold UPDATE_BACKUP frames of
   entities, so that when a delta compressed message arives from the server
   it can be un-deltad from the original */
export const MAX_PARSE_ENTITIES	= 1024

export class frame_t {
	valid: boolean = false /* cleared if delta parsing was invalid */
	serverframe: number = 0
	servertime: number = 0 /* server time the message is valid for (in msec) */
	deltaframe: number = 0
    areabits: Uint8Array /* portalarea visibility bits */
    playerstate = new SHARED.player_state_t()
	num_entities: number = 0
	parse_entities: number = 0 /* non-masked index into cl_parse_entities array */
}


export class centity_t {
	baseline = new SHARED.entity_state_t() /* delta from this if not from a previous frame */
	current = new SHARED.entity_state_t()
	prev = new SHARED.entity_state_t() /* will always be valid, but might just be a copy of current */

	serverframe: number = 0 /* if not current, this ent isn't in the frame */

	trailcount: number = 0	 /* for diminishing grenade trails */
	lerp_origin: number[] = [0, 0, 0] /* for trails (variable hz) */

	fly_stoptime: number = 0
}

export class clientinfo_t {
	name: string
	cinfo: string

	skin: object

	icon: object
	iconname: string

	model: object

    weaponmodel = new Array<object>(MAX_CLIENTWEAPONMODELS)
}

/* the client_state_t structure is wiped
   completely at every server map change */
export class client_state_t {
    //    int			timeoutcount;
   
    //    int			timedemo_frames;
    //    int			timedemo_start;
   
    refresh_prepped: boolean = false /* false if on new level or new ref dll */
    //    qboolean	sound_prepped; /* ambient sounds can start */
    force_refdef: boolean = false /* vid has changed, so we can't use a paused refdef */
   
    parse_entities: number = 0 /* index (not anded off) into cl_parse_entities[] */
   
    cmd = new SHARED.usercmd_t()
    cmds: SHARED.usercmd_t[] /* each mesage will send several old cmds */
    //    int			cmd_time[CMD_BACKUP]; /* time sent, for calculating pings */
    predicted_origins: number[][] /* for debug comparing against server */
    
   
    predicted_step = 0 /* for stair up smoothing */
    predicted_step_time = 0
   
    predicted_origin = [0,0,0] /* generated by CL_PredictMovement */
    predicted_angles = [0,0,0]
    prediction_error = [0,0,0]
   
    frame = new frame_t() /* received from server */
    surpressCount: number = 0 /* number of messages rate supressed */
    frames: frame_t[] //[UPDATE_BACKUP];
   
    /* the client maintains its own idea of view angles, which are
        sent to the server each frame.  It is cleared to 0 upon entering each level.
        the server sends a delta each frame which is added to the locally
        tracked view angles to account for standing on rotating objects,
        and teleport direction changes */
    viewangles = [0,0,0]
   
    time: number = 0 /* this is the time value that the client is rendering at. always <= cls.realtime */
    lerpfrac: number = 0 /* between oldframe and frame */
   
    refdef = new refdef_t()
   
    /* set when refdef.angles is set */
    v_forward = [0,0,0]
    v_right = [0,0,0]
    v_up = [0,0,0]
   
    //    /* transient data from server */
    //    char		layout[1024]; /* general 2D overlay */
    //    int			inventory[MAX_ITEMS];
   
    /* non-gameserver infornamtion */
    cinematic_buf: Uint8Array
    cinematic_offs: number = 0
    //    fileHandle_t cinematic_file;
    //    int			cinematictime; /* cls.realtime for first cinematic frame */
    //    int			cinematicframe;
    //    unsigned char	cinematicpalette[768];
    //    qboolean	cinematicpalette_active;
   
       /* server state information */
    attractloop: boolean = false /* running the attract loop, any key will menu */
    servercount: number = 0 /* server identification for prespawns */
    gamedir: string = ""
    playernum: number = 0
   
    configstrings: string[] = new Array<string>(SHARED.MAX_CONFIGSTRINGS)
   
    /* locally derived information from server state */
   
    model_draw: object[] = []
   
    //    struct cmodel_s	*model_clip[MAX_MODELS];
   
    //    struct sfx_s	*sound_precache[MAX_SOUNDS];
   
    image_precache = new Array<object>(SHARED.MAX_IMAGES);
   
    clientinfo = new Array<clientinfo_t>(SHARED.MAX_CLIENTS);
    baseclientinfo = new clientinfo_t()

    constructor() {
        this.frames = new Array<frame_t>(UPDATE_BACKUP)
        for (let i = 0; i < UPDATE_BACKUP; i++) {
            this.frames[i] = new frame_t()
        }
        for (let i = 0; i < SHARED.MAX_CLIENTS; i++) {
            this.clientinfo[i] = new clientinfo_t()
        }
        this.predicted_origins = new Array<number[]>(CMD_BACKUP)
        for (let i = 0; i < CMD_BACKUP; i++) {
            this.predicted_origins[i] = [0,0,0]
        }
        this.cmds = new Array<SHARED.usercmd_t>(CMD_BACKUP)
        for (let i = 0; i < CMD_BACKUP; i++) {
            this.cmds[i] = new SHARED.usercmd_t()
        }
    }
}
   
/* the client_static_t structure is persistant through
   an arbitrary number of server connections */
export enum connstate_t {
    ca_uninitialized,
    ca_disconnected,  /* not talking to a server */
    ca_preconnecting,
    ca_queing,
    ca_connecting, /* sending request packets to the server */
    ca_connected, /* netchan_t established, waiting for svc_serverdata */
    ca_active /* game views should be displayed */
}
   
export enum dltype_t {
    dl_none,
    dl_model,
    dl_sound,
    dl_skin,
    dl_single
}
   
export enum keydest_t {key_game, key_console, key_message, key_menu}

export class client_static_t {
    state = connstate_t.ca_uninitialized
    key_dest = keydest_t.key_game

    framecount: number = 0
    realtime: number = 0 /* always increasing, no clamping, etc */
    rframetime: number = 0 /* seconds since last render frame */
    nframetime: number = 0 /* network frame time */

    // /* screen rendering information */
    disable_screen: number = 0 /* showing loading plaque between levels */
                          /* or changing rendering dlls */

    /* if time gets > 30 seconds ahead, break it */
    // int			disable_servercount; /* when we receive a frame and cl.servercount */
    //                                 /* > cls.disable_servercount, clear disable_screen */

    /* connection information */
    servername = ""; /* name of server from original connect */
    connect_time: number = 0 /* for connection retransmits */

    quakePort: number /* a 16 bit value that allows quake servers */
                            /* to work around address translating routers */
    netchan: netchan_t = new netchan_t()
    serverProtocol: number = 0 /* in case we are doing some kind of version hack */

    challenge: number = 0 /* from the server to use for connecting */

    // qboolean	forcePacket; /* Forces a package to be send at the next frame. */

    // FILE		*download; /* file transfer from server */
    downloadtempname: string = null
    downloadname: string = null
    downloadnumber: number = 0
    // dltype_t	downloadtype;
    downloadposition: number = 0
    downloadpercent: number = 0

    // /* demo recording info must be here, so it isn't cleared on level change */
    // qboolean	demorecording;
    // qboolean	demowaiting; /* don't record until a non-delta message is received */
    // FILE		*demofile;
}