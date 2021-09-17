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
 * Prototypes witch are shared between the client, the server and the
 * game. This is the main game API, changes here will most likely
 * requiere changes to the game ddl.
 *
 * =======================================================================
 */

export const YQ2VERSION = "8.00pre"
export const BASEDIRNAME = "baseq2"

export const MAX_MSGLEN = 1400             /* max length of a message */

export const PROTOCOL_VERSION = 34

/* ========================================= */

export const UPDATE_BACKUP = 16    /* copies of entity_state_t to keep buffered */
export const UPDATE_MASK = (UPDATE_BACKUP - 1)

/* server to client */
export enum svc_ops_e
{
	svc_bad = 0,

	/* these ops are known to the game dll */
	svc_muzzleflash,
	svc_muzzleflash2,
	svc_temp_entity,
	svc_layout,
	svc_inventory,

	/* the rest are private to the client and server */
	svc_nop,
	svc_disconnect,
	svc_reconnect,
	svc_sound,                  /* <see code> */
	svc_print,                  /* [byte] id [string] null terminated string */
	svc_stufftext,              /* [string] stuffed into client's console buffer, should be \n terminated */
	svc_serverdata,             /* [long] protocol ... */
	svc_configstring,           /* [short] [string] */
	svc_spawnbaseline,
	svc_centerprint,            /* [string] to put in center of the screen */
	svc_download,               /* [short] size [size bytes] */
	svc_playerinfo,             /* variable */
	svc_packetentities,         /* [...] */
	svc_deltapacketentities,    /* [...] */
	svc_frame
};

/* ============================================== */

/* client to server */
export enum clc_ops_e {
	clc_bad = 0,
	clc_nop,
	clc_move,               /* [[usercmd_t] */
	clc_userinfo,           /* [[userinfo string] */
	clc_stringcmd           /* [string] message */
};

/* ============================================== */

/* plyer_state_t communication */
export const PS_M_TYPE = (1 << 0)
export const PS_M_ORIGIN = (1 << 1)
export const PS_M_VELOCITY = (1 << 2)
export const PS_M_TIME = (1 << 3)
export const PS_M_FLAGS = (1 << 4)
export const PS_M_GRAVITY = (1 << 5)
export const PS_M_DELTA_ANGLES = (1 << 6)

export const PS_VIEWOFFSET = (1 << 7)
export const PS_VIEWANGLES = (1 << 8)
export const PS_KICKANGLES = (1 << 9)
export const PS_BLEND = (1 << 10)
export const PS_FOV = (1 << 11)
export const PS_WEAPONINDEX = (1 << 12)
export const PS_WEAPONFRAME = (1 << 13)
export const PS_RDFLAGS = (1 << 14)

/*============================================== */

/* user_cmd_t communication */

/* ms and light always sent, the others are optional */
export const CM_ANGLE1 = (1 << 0)
export const CM_ANGLE2 = (1 << 1)
export const CM_ANGLE3 = (1 << 2)
export const CM_FORWARD = (1 << 3)
export const CM_SIDE = (1 << 4)
export const CM_UP = (1 << 5)
export const CM_BUTTONS = (1 << 6)
export const CM_IMPULSE = (1 << 7)

/*============================================== */

/* a sound without an ent or pos will be a local only sound */
export const SND_VOLUME = (1 << 0)         /* a byte */
export const SND_ATTENUATION = (1 << 1)      /* a byte */
export const SND_POS = (1 << 2)            /* three coordinates */
export const SND_ENT = (1 << 3)            /* a short 0-2: channel, 3-12: entity */
export const SND_OFFSET = (1 << 4)         /* a byte, msec offset from frame start */

export const DEFAULT_SOUND_PACKET_VOLUME = 1.0
export const DEFAULT_SOUND_PACKET_ATTENUATION = 1.0

/*============================================== */

/* entity_state_t communication */

/* try to pack the common update flags into the first byte */
export const U_ORIGIN1 = (1 << 0)
export const U_ORIGIN2 = (1 << 1)
export const U_ANGLE2 = (1 << 2)
export const U_ANGLE3 = (1 << 3)
export const U_FRAME8 = (1 << 4)       /* frame is a byte */
export const U_EVENT = (1 << 5)
export const U_REMOVE = (1 << 6)       /* REMOVE this entity, don't add it */
export const U_MOREBITS1 = (1 << 7)      /* read one additional byte */

/* second byte */
export const U_NUMBER16 = (1 << 8)      /* NUMBER8 is implicit if not set */
export const U_ORIGIN3 = (1 << 9)
export const U_ANGLE1 = (1 << 10)
export const U_MODEL = (1 << 11)
export const U_RENDERFX8 = (1 << 12)     /* fullbright, etc */
export const U_EFFECTS8 = (1 << 14)     /* autorotate, trails, etc */
export const U_MOREBITS2 = (1 << 15)     /* read one additional byte */

/* third byte */
export const U_SKIN8 = (1 << 16)
export const U_FRAME16 = (1 << 17)     /* frame is a short */
export const U_RENDERFX16 = (1 << 18)    /* 8 + 16 = 32 */
export const U_EFFECTS16 = (1 << 19)     /* 8 + 16 = 32 */
export const U_MODEL2 = (1 << 20)      /* weapons, flags, etc */
export const U_MODEL3 = (1 << 21)
export const U_MODEL4 = (1 << 22)
export const U_MOREBITS3 = (1 << 23)     /* read one additional byte */

/* fourth byte */
export const U_OLDORIGIN = (1 << 24)
export const U_SKIN16 = (1 << 25)
export const U_SOUND = (1 << 26)
export const U_SOLID = (1 << 27)