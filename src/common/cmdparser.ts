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
 * This file implements the Quake II command processor. Every command
 * which is send via the command line at startup, via the console and
 * via rcon is processed here and send to the apropriate subsystem.
 *
 * =======================================================================
 */
import * as SHARED from "./shared"
import { Com_Printf } from "./clientserver"
import { FS_LoadFile } from "./filesystem"
import { Cvar_Command } from "./cvar"

const ALIAS_LOOP_COUNT = 16

let cmd_text = ""
let alias_count = 0
let cmd_functions: Map<string, (args: string[]) => Promise<any> | null> = new Map() 
let cmd_alias: Map<string, string> = new Map() 

/*
 * Adds command text at the end of the buffer
 */
export function Cbuf_AddText(text: string) {
    cmd_text = cmd_text + text
}

/*
 * Adds command text immediately after the current command
 * Adds a \n to the text
 */
export function Cbuf_InsertText(text: string) {
    cmd_text = text + "\n" + cmd_text
}

export async function Cbuf_Execute() {
	// int i;
	// char *text;
	// char line[1024];
	// int quotes;

	// if(cmd_wait > 0) {
	// 	// make sure that "wait" in scripts waits for ~16.66ms (1 frame at 60fps)
	// 	// regardless of framerate
	// 	if (Sys_Milliseconds() - cmd_wait <= 16)
	// 	{
	// 		return;
	// 	}
	// 	cmd_wait = 0;
	// }

	alias_count = 0; /* don't allow infinite alias loops */

	while (cmd_text.length > 0) {
		/* find a \n or ; line break */

		let quotes = 0;

        let i = 0
		for (i = 0; i < cmd_text.length; i++) {
			if (cmd_text[i] == '"') {
				quotes++;
			}

			if (!(quotes & 1) && (cmd_text[i] == ';')) {
				break; /* don't break if inside a quoted string */
			}

			if (cmd_text[i] == '\n') {
				break;
			}
		}

		/* delete the text from the command buffer and move remaining
		   commands down this is necessary because commands (exec,
		   alias) can insert data at the beginning of the text buffer */
        let line: string
		if (i >= cmd_text.length) {
            line = cmd_text;
			cmd_text = "";
		} else {
            line = cmd_text.substr(0, i)
            if (i + 1 >= cmd_text.length)
                cmd_text = ""
            else
                cmd_text = cmd_text.substr(i + 1)
		}

		/* execute the command line */
		await Cmd_ExecuteString(line);

		// if (cmd_wait > 0) {
		// 	/* skip out while text still remains in buffer,
		// 	   leaving it for after we're done waiting */
		// 	break;
		// }
	}
}



/*
 * Parses the given string into command line tokens.
 * $Cvars will be expanded unless they are in a quoted token
 */
export function Cmd_TokenizeString(text: string, macroExpand: boolean): string[] {
	// int i;
	// const char *com_token;

	/* clear the args from the last string */
	// for (i = 0; i < cmd_argc; i++) {
	// 	Z_Free(cmd_argv[i]);
	// }

	// cmd_argc = 0;
	// cmd_args[0] = 0;
    let cmd_args: string[] = []

	/* macro expand the text */
	// if (macroExpand) {
	// 	text = Cmd_MacroExpandString(text);
	// }

	if (!text) {
		return cmd_args;
	}

    let index = 0
	while (true) {
		/* skip whitespace up to a /n */
		while (index < text.length && text[index] <= ' ' && text[index] != '\n') {
			index++;
		}

		if (index >= text.length || text == '\n') {
			return cmd_args;
		}

		/* set cmd_args to everything after the first arg */
		// if (cmd_argc == 1) {
		// 	int l;

		// 	strcpy(cmd_args, text);

		// 	/* strip off any trailing whitespace */
		// 	l = strlen(cmd_args) - 1;

		// 	for ( ; l >= 0; l--) {
		// 		if (cmd_args[l] <= ' ')
		// 		{
		// 			cmd_args[l] = 0;
		// 		}

		// 		else
		// 		{
		// 			break;
		// 		}
		// 	}
		// }

		let r = SHARED.COM_Parse(text, index);
		if (r.index < 0) {
			return cmd_args;
		}

        index = r.index
        cmd_args.push(r.token)
	}
}

export function Cmd_AddCommand(cmd_name: string, funct: (args: string[]) => Promise<any>)
{
	// /* fail if the command is a variable name */
	// if (Cvar_VariableString(cmd_name)[0]) {
	// 	Cmd_RemoveCommand(cmd_name);
	// }

	/* fail if the command already exists */
    if (cmd_functions.has(cmd_name)) {
        Com_Printf(`Cmd_AddCommand: ${cmd_name} already defined\n`);
        return;
    }

	/* link the command in */
    cmd_functions.set(cmd_name, funct);
}


/*
 * A complete command line has been parsed, so try to execute it
 */
export async function Cmd_ExecuteString(text: string) {

	let args = Cmd_TokenizeString(text, true);

	/* execute the command line */
	if (args.length == 0) {
		return; /* no tokens */
	}

// 	if(Cmd_Argc() > 1 && Q_strcasecmp(cmd_argv[0], "exec") == 0 && Q_strcasecmp(cmd_argv[1], "yq2.cfg") == 0)
// 	{
// 		/* exec yq2.cfg is done directly after exec default.cfg, see Qcommon_Init() */
// 		doneWithDefaultCfg = true;
// 	}

	/* check functions */
    if (cmd_functions.has(args[0])) {
        let f = cmd_functions.get(args[0]);
        if (f) {
            await f(args)
        } else {
            /* forward to server command */
            await Cmd_ExecuteString(`cmd ${text}`)
        }
        return
    }

	/* check alias */
    let a = cmd_alias.get(args[0])
    if (a != null) {
        if (++alias_count == ALIAS_LOOP_COUNT) {
            Com_Printf("ALIAS_LOOP_COUNT\n");
            return;
        }

        Cbuf_InsertText(a);
        return;
    }


	/* check cvars */
	if (Cvar_Command(args)) {
		return;
	}

// #ifndef DEDICATED_ONLY
// 	/* send it as a server command if we are connected */
// 	Cmd_ForwardToServer();
// #endif
    console.log("Unknown command", args[0]);
}

/*
 * Execute a script file
 */
async function Cmd_Exec_f(args: string[]) {

	if (args.length != 2) {
		Com_Printf("exec <filename> : execute a script file\n");
		return;
	}

	let f = await FS_LoadFile(args[1]);
	if (f == null) {
		Com_Printf(`couldn't exec ${args[1]}\n`);
		return;
	}

	Com_Printf(`execing ${args[1]}.\n`);

	/* the file doesn't have a trailing 0, so we need to copy it off */
	/* we also add a newline */
    let enc = new TextDecoder("utf-8");
	Cbuf_InsertText(enc.decode(f))
}

/*
 * Creates a new command that executes
 * a command string (possibly ; seperated)
 */
async function Cmd_Alias_f(args: string[]) {

	if (args.length == 1) {
		Com_Printf("Current alias commands:\n");

		for (let entry of Array.from(cmd_alias.entries())) {
			Com_Printf(`${entry[0]} : ${entry[1]}\n`);
		}
		return;
	}

	/* copy the rest of the command line */
	let cmd = ""; /* start out with a null string */

	for (let i = 2; i < args.length; i++) {
		cmd += args[i]

		if (i != (args.length - 1)) {
			cmd += " ";
		}
	}

	cmd += "\n";

	cmd_alias.set(args[1], cmd)
}


export function Cmd_Init() {
	/* register our commands */
	// Cmd_AddCommand("cmdlist", Cmd_List_f);
	Cmd_AddCommand("exec", Cmd_Exec_f);
	// Cmd_AddCommand("vstr", Cmd_Vstr_f);
	// Cmd_AddCommand("echo", Cmd_Echo_f);
	Cmd_AddCommand("alias", Cmd_Alias_f);
	// Cmd_AddCommand("wait", Cmd_Wait_f);
}

