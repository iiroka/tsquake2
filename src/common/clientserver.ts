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
 * Client / Server interactions
 *
 * =======================================================================
 */
import * as SHARED from "./shared"
import { Con_Print } from "../client/cl_console"
import { CL_Drop } from "../client/cl_network";

/*
 * Both client and server can use this, and it will output
 * to the apropriate place.
 */
export function Com_VPrintf(print_level: number, msg: string) {
	// if((print_level == PRINT_DEVELOPER) && (!developer || !developer->value)) {
	// 	return; /* don't confuse non-developers with techie stuff... */
	// }
	// else
	// {
	// 	int i;
	// 	char msg[MAXPRINTMSG];

	// 	int msgLen = vsnprintf(msg, MAXPRINTMSG, fmt, argptr);
	// 	if (msgLen >= MAXPRINTMSG || msgLen < 0) {
	// 		msgLen = MAXPRINTMSG-1;
	// 		msg[msgLen] = '\0';
	// 	}

	// 	if (rd_target)
	// 	{
	// 		if ((msgLen + strlen(rd_buffer)) > (rd_buffersize - 1))
	// 		{
	// 			rd_flush(rd_target, rd_buffer);
	// 			*rd_buffer = 0;
	// 		}

	// 		strcat(rd_buffer, msg);
	// 		return;
	// 	}

		Con_Print(msg);

	// 	// remove unprintable characters
	// 	for(i=0; i<msgLen; ++i)
	// 	{
	// 		char c = msg[i];
	// 		if(c < ' ' && (c < '\t' || c > '\r'))
	// 		{
	// 			switch(c)
	// 			{
	// 				// no idea if the following two are ever sent here, but in conchars.pcx they look like this
	// 				// so do the replacements.. won't hurt I guess..
	// 				case 0x10:
	// 					msg[i] = '[';
	// 					break;
	// 				case 0x11:
	// 					msg[i] = ']';
	// 					break;
	// 				// horizontal line chars
	// 				case 0x1D:
	// 				case 0x1F:
	// 					msg[i] = '-';
	// 					break;
	// 				case 0x1E:
	// 					msg[i] = '=';
	// 					break;
	// 				default: // just replace all other unprintable chars with space, should be good enough
	// 					msg[i] = ' ';
	// 			}
	// 		}
	// 	}

	// 	/* also echo to debugging console */
	// 	Sys_ConsoleOutput(msg);

	// 	/* logfile */
	// 	if (logfile_active && logfile_active->value)
	// 	{
	// 		char name[MAX_OSPATH];

	// 		if (!logfile)
	// 		{
	// 			Com_sprintf(name, sizeof(name), "%s/qconsole.log", FS_Gamedir());

	// 			if (logfile_active->value > 2)
	// 			{
	// 				logfile = Q_fopen(name, "a");
	// 			}

	// 			else
	// 			{
	// 				logfile = Q_fopen(name, "w");
	// 			}
	// 		}

	// 		if (logfile)
	// 		{
	// 			fprintf(logfile, "%s", msg);
	// 		}

	// 		if (logfile_active->value > 1)
	// 		{
	// 			fflush(logfile);  /* force it to save every time */
	// 		}
	// 	}
	// }
    console.log(msg)
}


/*
 * Both client and server can use this, and it will output
 * to the apropriate place.
 */
export function Com_Printf(msg: string) {
	Com_VPrintf(SHARED.PRINT_ALL, msg);
}

export function Com_DPrintf(msg: string) {
	Com_VPrintf(SHARED.PRINT_DEVELOPER, msg);
}

export class AbortFrame extends Error {
	constructor() {
	  super("AbortFrame")
	}
  }

/*
 * Both client and server can use this, and it will
 * do the apropriate things.
 */
export function Com_Error(code: number, msg: string) {
	// va_list argptr;
	// static char msg[MAXPRINTMSG];
	// static qboolean recursive;

	// if (recursive)
	// {
	// 	Sys_Error("recursive error after: %s", msg);
	// }

	// recursive = true;

	// va_start(argptr, fmt);
	// vsnprintf(msg, MAXPRINTMSG, fmt, argptr);
	// va_end(argptr);

	if (code == SHARED.ERR_DISCONNECT) {
		CL_Drop();
		// recursive = false;
		throw new AbortFrame()
	} else if (code == SHARED.ERR_DROP) {
		Com_Printf(`********************\nERROR: ${msg}\n********************\n`);
		// SV_Shutdown(va("Server crashed: %s\n", msg), false);
		CL_Drop();
		// recursive = false;
		throw new AbortFrame()
	} else {
// 		SV_Shutdown(va("Server fatal crashed: %s\n", msg), false);
// #ifndef DEDICATED_ONLY
// 		CL_Shutdown();
// #endif
	}

	// if (logfile) {
	// 	fclose(logfile);
	// 	logfile = NULL;
	// }

    throw new Error(msg)
}

let startTime: number = -1

export function Sys_Milliseconds(): number {
    const time = Date.now()
    if (startTime < 0) {
        startTime = time;
        return 0;
    }
    return ~~(time - startTime);
}