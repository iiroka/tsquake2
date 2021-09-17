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
 * The Quake II CVAR subsystem. Implements dynamic variable handling.
 *
 * =======================================================================
 */
import * as SHARED from "./shared"
import { Cmd_AddCommand } from "./cmdparser"
import { Com_Printf } from "./clientserver";

let cvar_vars: Map<string, SHARED.cvar_t> = new Map();
let userinfo_modified = false

function Cvar_FindVar(var_name: string): SHARED.cvar_t {

	/* An ugly hack to rewrite changed CVARs */
	// for (i = 0; i < sizeof(replacements) / sizeof(replacement_t); i++)
	// {
	// 	if (!strcmp(var_name, replacements[i].old))
	// 	{
	// 		Com_Printf("cvar %s ist deprecated, use %s instead\n", replacements[i].old, replacements[i].new);

	// 		var_name = replacements[i].new;
	// 	}
	// }

	return cvar_vars.get(var_name);
}

export function Cvar_VariableString(var_name: string): string {

	let v = Cvar_FindVar(var_name);
	if (v == null) {
		return "";
	}

	return v.string;
}


/*
 * If the variable already exists, the value will not be set
 * The flags will be or'ed in if the variable exists.
 */
export function Cvar_Get(var_name: string, var_value: string | null, flags: number): SHARED.cvar_t {
	// cvar_t *var;
	// cvar_t **pos;

	if ((flags & (SHARED.CVAR_USERINFO | SHARED.CVAR_SERVERINFO)) != 0) {
	// 	if (!Cvar_InfoValidate(var_name))
	// 	{
	// 		Com_Printf("invalid info cvar name\n");
	// 		return NULL;
	// 	}
	}

	let v = Cvar_FindVar(var_name);
	if (v != null) {
		v.flags |= flags;

		if (!var_value) {
			v.default_string = ""
		} else {
			v.default_string = var_value
		}

		return v
	}

	if (var_value == null) {
		return null;
	}

	if ((flags & (SHARED.CVAR_USERINFO | SHARED.CVAR_SERVERINFO)) != 0) {
	// 	if (!Cvar_InfoValidate(var_value))
	// 	{
	// 		Com_Printf("invalid info cvar value\n");
	// 		return NULL;
	// 	}
	}

	// // if $game is the default one ("baseq2"), then use "" instead because
	// // other code assumes this behavior (e.g. FS_BuildGameSpecificSearchPath())
	// if(strcmp(var_name, "game") == 0 && strcmp(var_value, BASEDIRNAME) == 0)
	// {
	// 	var_value = "";
	// }

	v = new SHARED.cvar_t(var_name, var_value, flags);
    cvar_vars.set(var_name, v);
	return v
}

function Cvar_Set2(var_name: string, value: string, force: boolean): SHARED.cvar_t {
	// cvar_t *var;

	let v = Cvar_FindVar(var_name);
	if (v == null) {
		return Cvar_Get(var_name, value, 0);
	}

	if ((v.flags & (SHARED.CVAR_USERINFO | SHARED.CVAR_SERVERINFO)) != 0) {
		// if (!Cvar_InfoValidate(value)) {
		// 	Com_Printf("invalid info cvar value\n");
		// 	return v;
		// }
	}

	// if $game is the default one ("baseq2"), then use "" instead because
	// other code assumes this behavior (e.g. FS_BuildGameSpecificSearchPath())
	// if(strcmp(var_name, "game") == 0 && strcmp(value, BASEDIRNAME) == 0) {
	// 	value = "";
	// }

	if (!force)
	{
		if ((v.flags & SHARED.CVAR_NOSET) != 0) {
			Com_Printf(`${var_name} is write protected.\n`);
			return v;
		}

		if ((v.flags & SHARED.CVAR_LATCH) != 0)
		{
			if (v.latched_string != null)
			{
				if (value == v.latched_string) {
					return v;
				}

				v.latched_string = null;
			}
			else
			{
				if (value == v.string) {
					return v;
				}
			}

			// if (Com_ServerState())
			// {
			// 	Com_Printf("%s will be changed for next game.\n", var_name);
			// 	var->latched_string = CopyString(value);
			// }
			// else
			// {
				v.string = value;
				// var->value = (float)strtod(var->string, (char **)NULL);

				// if (!strcmp(var->name, "game"))
				// {
				// 	FS_BuildGameSpecificSearchPath(var->string);
				// }
			// }

			return v;
		}
	}
	else
	{
        v.latched_string = null
	}

	if (value == v.string) {
		return v;
	}

	v.modified = true;

	if ((v.flags & SHARED.CVAR_USERINFO) != 0) {
		userinfo_modified = true;
	}

	v.string = value;

	return v;
}

export function Cvar_ForceSet(var_name: string, value: string): SHARED.cvar_t {
	return Cvar_Set2(var_name, value, true);
}

export function Cvar_Set(var_name: string, value: string): SHARED.cvar_t {
	return Cvar_Set2(var_name, value, false);
}

export function Cvar_FullSet(var_name: string, value: string, flags: number): SHARED.cvar_t {

	let v = Cvar_FindVar(var_name);
	if (v == null) {
		return Cvar_Get(var_name, value, flags);
	}

	v.modified = true;

	if ((v.flags & SHARED.CVAR_USERINFO) != 0) {
		userinfo_modified = true;
	}

	// if $game is the default one ("baseq2"), then use "" instead because
	// other code assumes this behavior (e.g. FS_BuildGameSpecificSearchPath())
	// if(strcmp(var_name, "game") == 0 && strcmp(value, BASEDIRNAME) == 0)
	// {
	// 	value = "";
	// }

	v.string = value;
	v.flags = flags;

	return v;
}

export function Cvar_ClearUserinfoModified() {
	userinfo_modified = false
}

function Cvar_BitInfo(bit: number): string  {

	let info = "";

	for (let entry of Array.from(cvar_vars.entries())) {
		let key = entry[0];
		let value = entry[1];
		if ((value.flags & bit) != 0) {
			info += "//" + key + "//" + value.string
		}
	}

	return info;
}

/*
 * returns an info string containing
 * all the CVAR_USERINFO cvars
 */
export function Cvar_Userinfo(): string {
	return Cvar_BitInfo(SHARED.CVAR_USERINFO);
}

/*
 * returns an info string containing
 * all the CVAR_SERVERINFO cvars
 */
export function Cvar_Serverinfo(): string {
	return Cvar_BitInfo(SHARED.CVAR_SERVERINFO);
}

/*
 * Handles variable inspection and changing from the console
 */
export function Cvar_Command(args: string[]): boolean {

	/* check variables */
	let v = Cvar_FindVar(args[0]);
	if (v == null) {
		return false;
	}

	/* perform a variable print or set */
	if (args.length == 1) {
		Com_Printf(`"${v.name}" is "${v.string}"\n`);
		return true;
	}

	/* Another evil hack: The user has just changed 'game' trough
	   the console. We reset userGivenGame to that value, otherwise
	   we would revert to the initialy given game at disconnect. */
	// if (strcmp(v->name, "game") == 0)
	// {
	// 	Q_strlcpy(userGivenGame, Cmd_Argv(1), sizeof(userGivenGame));
	// }

	Cvar_Set(v.name, args[1]);
	return true;
}


/*
 * Allows setting and defining of arbitrary cvars from console
 */
async function Cvar_Set_f(args: string[]) {
	// char *firstarg;
	// int c, i;

	if ((args.length != 3) && (args.length != 4)) {
		Com_Printf("usage: set <variable> <value> [u / s]\n");
		return;
	}

	let firstarg = args[1];

	// /* An ugly hack to rewrite changed CVARs */
	// for (i = 0; i < sizeof(replacements) / sizeof(replacement_t); i++)
	// {
	// 	if (!strcmp(firstarg, replacements[i].old))
	// 	{
	// 		firstarg = replacements[i].new;
	// 	}
	// }

	if (args.length == 4) {
		let flags = 0

		if (args[3] == "u") {
			flags = SHARED.CVAR_USERINFO;
		}

		else if (args[3] == "s") {
			flags = SHARED.CVAR_SERVERINFO;
		}

		else {
			Com_Printf("flags can only be 'u' or 's'\n");
			return;
		}

		Cvar_FullSet(firstarg, args[2], flags);
	} else {
		Cvar_Set(firstarg, args[2]);
	}
}


/*
 * Reads in all archived cvars
 */
export function Cvar_Init() {
	// Cmd_AddCommand("cvarlist", Cvar_List_f);
	// Cmd_AddCommand("dec", Cvar_Inc_f);
	// Cmd_AddCommand("inc", Cvar_Inc_f);
	// Cmd_AddCommand("reset", Cvar_Reset_f);
	// Cmd_AddCommand("resetall", Cvar_ResetAll_f);
	Cmd_AddCommand("set", Cvar_Set_f);
	// Cmd_AddCommand("toggle", Cvar_Toggle_f);
}