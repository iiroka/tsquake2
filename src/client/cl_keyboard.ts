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
 * Upper layer of the keyboard implementation. This file processes all
 * keyboard events which are generated by the low level keyboard layer.
 * Remeber, that the mouse is handled by the refresher and not by the
 * client!
 *
 * =======================================================================
 */
import { Sys_Milliseconds } from "../common/clientserver"
import { keydest_t } from "./client";
import { cls } from "./cl_main";
import { M_Keydown } from "./menu/menu"

// The last time input events were processed.
// Used throughout the client.
export let sys_frame_time = 0;

/* these are the key numbers that should be passed to Key_Event
   they must be matched by the low level key event processing! */
export enum QKEYS {
	K_TAB = 9,
	K_ENTER = 13,
	K_ESCAPE = 27,
	// Note: ASCII keys are generally valid but don't get constants here,
	// just use 'a' (yes, lowercase) or '2' or whatever, however there are
	// some special cases when writing/parsing configs (space or quotes or
	// also ; and $ have a special meaning there so we use e.g. "SPACE" instead),
	// see keynames[] in cl_keyboard.c
	K_SPACE = 32,

	K_BACKSPACE = 127,

	K_COMMAND = 128, // "Windows Key"
	K_CAPSLOCK,
	K_POWER,
	K_PAUSE,

	K_UPARROW,
	K_DOWNARROW,
	K_LEFTARROW,
	K_RIGHTARROW,

	K_ALT,
	K_CTRL,
	K_SHIFT,
	K_INS,
	K_DEL,
	K_PGDN,
	K_PGUP,
	K_HOME,
	K_END,

	K_F1,
	K_F2,
	K_F3,
	K_F4,
	K_F5,
	K_F6,
	K_F7,
	K_F8,
	K_F9,
	K_F10,
	K_F11,
	K_F12,
	K_F13,
	K_F14,
	K_F15,

	K_KP_HOME,
	K_KP_UPARROW,
	K_KP_PGUP,
	K_KP_LEFTARROW,
	K_KP_5,
	K_KP_RIGHTARROW,
	K_KP_END,
	K_KP_DOWNARROW,
	K_KP_PGDN,
	K_KP_ENTER,
	K_KP_INS,
	K_KP_DEL,
	K_KP_SLASH,
	K_KP_MINUS,
	K_KP_PLUS,
	K_KP_NUMLOCK,
	K_KP_STAR,
	K_KP_EQUALS,

	K_MOUSE1,
	K_MOUSE2,
	K_MOUSE3,
	K_MOUSE4,
	K_MOUSE5,

	K_MWHEELDOWN,
	K_MWHEELUP,

	K_JOY1,
	K_JOY2,
	K_JOY3,
	K_JOY4,
	K_JOY5,
	K_JOY6,
	K_JOY7,
	K_JOY8,
	K_JOY9,
	K_JOY10,
	K_JOY11,
	K_JOY12,
	K_JOY13,
	K_JOY14,
	K_JOY15,
	K_JOY16,
	K_JOY17,
	K_JOY18,
	K_JOY19,
	K_JOY20,
	K_JOY21,
	K_JOY22,
	K_JOY23,
	K_JOY24,
	K_JOY25,
	K_JOY26,
	K_JOY27,
	K_JOY28,
	K_JOY29,
	K_JOY30,
	K_JOY31,
	K_JOY32,

	K_HAT_UP,
	K_HAT_RIGHT,
	K_HAT_DOWN,
	K_HAT_LEFT,

	K_TRIG_LEFT,
	K_TRIG_RIGHT,

	// add other joystick/controller keys before this one
	// and adjust it accordingly, also remember to add corresponding _ALT key below!
	K_JOY_LAST_REGULAR = K_TRIG_RIGHT,

	/* Can't be mapped to any action (=> not regular) */
	K_JOY_BACK,

	K_JOY1_ALT,
	K_JOY2_ALT,
	K_JOY3_ALT,
	K_JOY4_ALT,
	K_JOY5_ALT,
	K_JOY6_ALT,
	K_JOY7_ALT,
	K_JOY8_ALT,
	K_JOY9_ALT,
	K_JOY10_ALT,
	K_JOY11_ALT,
	K_JOY12_ALT,
	K_JOY13_ALT,
	K_JOY14_ALT,
	K_JOY15_ALT,
	K_JOY16_ALT,
	K_JOY17_ALT,
	K_JOY18_ALT,
	K_JOY19_ALT,
	K_JOY20_ALT,
	K_JOY21_ALT,
	K_JOY22_ALT,
	K_JOY23_ALT,
	K_JOY24_ALT,
	K_JOY25_ALT,
	K_JOY26_ALT,
	K_JOY27_ALT,
	K_JOY28_ALT,
	K_JOY29_ALT,
	K_JOY30_ALT,
	K_JOY31_ALT,
	K_JOY32_ALT,

	K_HAT_UP_ALT,
	K_HAT_RIGHT_ALT,
	K_HAT_DOWN_ALT,
	K_HAT_LEFT_ALT,

	K_TRIG_LEFT_ALT,
	K_TRIG_RIGHT_ALT,

	// add other joystick/controller keys before this one and adjust it accordingly
	K_JOY_LAST_REGULAR_ALT = K_TRIG_RIGHT_ALT,

	K_SUPER, // TODO: what is this? SDL doesn't seem to know it..
	K_COMPOSE,
	K_MODE,
	K_HELP,
	K_PRINT,
	K_SYSREQ,
	K_SCROLLOCK,
	K_MENU,
	K_UNDO,

	// The following are mapped from SDL_Scancodes, used as a *fallback* for keys
	// whose SDL_KeyCode we don't have a K_ constant for, like German Umlaut keys.
	// The scancode name corresponds to the key at that position on US-QWERTY keyboards
	// *not* the one in the local layout (e.g. German 'Ö' key is K_SC_SEMICOLON)
	// !!! NOTE: if you add a scancode here, make sure to also add it to:
	// 1. keynames[] in cl_keyboard.c
	// 2. IN_TranslateScancodeToQ2Key() in input/sdl.c
	K_SC_A,
	K_SC_B,
	K_SC_C,
	K_SC_D,
	K_SC_E,
	K_SC_F,
	K_SC_G,
	K_SC_H,
	K_SC_I,
	K_SC_J,
	K_SC_K,
	K_SC_L,
	K_SC_M,
	K_SC_N,
	K_SC_O,
	K_SC_P,
	K_SC_Q,
	K_SC_R,
	K_SC_S,
	K_SC_T,
	K_SC_U,
	K_SC_V,
	K_SC_W,
	K_SC_X,
	K_SC_Y,
	K_SC_Z,
	// leaving out SDL_SCANCODE_1 ... _0, we handle them separately already
	// also return, escape, backspace, tab, space, already handled as keycodes
	K_SC_MINUS,
	K_SC_EQUALS,
	K_SC_LEFTBRACKET,
	K_SC_RIGHTBRACKET,
	K_SC_BACKSLASH,
	K_SC_NONUSHASH,
	K_SC_SEMICOLON,
	K_SC_APOSTROPHE,
	K_SC_GRAVE,
	K_SC_COMMA,
	K_SC_PERIOD,
	K_SC_SLASH,
	// leaving out lots of key incl. from keypad, we already handle them as normal keys
	K_SC_NONUSBACKSLASH,
	K_SC_INTERNATIONAL1, /**< used on Asian keyboards, see footnotes in USB doc */
	K_SC_INTERNATIONAL2,
	K_SC_INTERNATIONAL3, /**< Yen */
	K_SC_INTERNATIONAL4,
	K_SC_INTERNATIONAL5,
	K_SC_INTERNATIONAL6,
	K_SC_INTERNATIONAL7,
	K_SC_INTERNATIONAL8,
	K_SC_INTERNATIONAL9,
	K_SC_THOUSANDSSEPARATOR,
	K_SC_DECIMALSEPARATOR,
	K_SC_CURRENCYUNIT,
	K_SC_CURRENCYSUBUNIT,

	// hardcoded pseudo-key to open the console, emitted when pressing the "console key"
	// (SDL_SCANCODE_GRAVE, the one between Esc, 1 and Tab) on layouts that don't
	// have a relevant char there (unlike Brazilian which has quotes there which you
	// want to be able to type in the console) - the user can't bind this key.
	K_CONSOLE,

	K_LAST
};

/*
 * key up events are sent even if in console mode
 */

// char key_lines[NUM_KEY_LINES][MAXCMDLINE];
let key_linepos = 0
let anykeydown = 0

let edit_line = 0;
let history_line = 0;

let key_waiting = 0
let keybindings = Array<string>(QKEYS.K_LAST);
let consolekeys = Array<boolean>(QKEYS.K_LAST); /* if true, can't be rebound while in console */
let menubound = Array<boolean>(QKEYS.K_LAST); /* if true, can't be rebound while in menu */
let key_repeats = Array<number>(QKEYS.K_LAST); /* if > 1, it is autorepeating */
let keydown = Array<boolean>(QKEYS.K_LAST);

interface QKeyEvent {
    event: KeyboardEvent
    down: boolean
}

let keyEvents: QKeyEvent[] = []

function keydownEventHandler (event: KeyboardEvent) {
    console.log(event);
    keyEvents.push({ event: event, down: true})
}

function keyupEventHandler (event: KeyboardEvent) {
    keyEvents.push({ event: event, down: false})
}

export function Key_Init() {
	// int i;
	// for (i = 0; i < NUM_KEY_LINES; i++)
	// {
	// 	key_lines[i][0] = ']';
	// 	key_lines[i][1] = 0;
	// }
	// can't call Key_ReadConsoleHistory() here because FS_Gamedir() isn't set yet

	key_linepos = 1;

	/* init 128 bit ascii characters in console mode */
	for (let i = 32; i < 128; i++) {
		consolekeys[i] = true;
	}

	consolekeys[QKEYS.K_ENTER] = true;
	consolekeys[QKEYS.K_KP_ENTER] = true;
	consolekeys[QKEYS.K_TAB] = true;
	consolekeys[QKEYS.K_LEFTARROW] = true;
	consolekeys[QKEYS.K_KP_LEFTARROW] = true;
	consolekeys[QKEYS.K_RIGHTARROW] = true;
	consolekeys[QKEYS.K_KP_RIGHTARROW] = true;
	consolekeys[QKEYS.K_UPARROW] = true;
	consolekeys[QKEYS.K_KP_UPARROW] = true;
	consolekeys[QKEYS.K_DOWNARROW] = true;
	consolekeys[QKEYS.K_KP_DOWNARROW] = true;
	consolekeys[QKEYS.K_BACKSPACE] = true;
	consolekeys[QKEYS.K_HOME] = true;
	consolekeys[QKEYS.K_KP_HOME] = true;
	consolekeys[QKEYS.K_END] = true;
	consolekeys[QKEYS.K_KP_END] = true;
	consolekeys[QKEYS.K_PGUP] = true;
	consolekeys[QKEYS.K_KP_PGUP] = true;
	consolekeys[QKEYS.K_PGDN] = true;
	consolekeys[QKEYS.K_KP_PGDN] = true;
	consolekeys[QKEYS.K_SHIFT] = true;
	consolekeys[QKEYS.K_INS] = true;
	consolekeys[QKEYS.K_KP_INS] = true;
	consolekeys[QKEYS.K_KP_DEL] = true;
	consolekeys[QKEYS.K_KP_SLASH] = true;
	consolekeys[QKEYS.K_KP_STAR] = true;
	consolekeys[QKEYS.K_KP_PLUS] = true;
	consolekeys[QKEYS.K_KP_MINUS] = true;
	consolekeys[QKEYS.K_KP_5] = true;
	consolekeys[QKEYS.K_MWHEELUP] = true;
	consolekeys[QKEYS.K_MWHEELDOWN] = true;
	consolekeys[QKEYS.K_MOUSE4] = true;
	consolekeys[QKEYS.K_MOUSE5] = true;

	consolekeys['`'.charCodeAt(0)] = false;
	consolekeys['~'.charCodeAt(0)] = false;
	consolekeys['^'.charCodeAt(0)] = false;

	menubound[QKEYS.K_ESCAPE] = true;

	for (let i = 0; i < 12; i++) {
		menubound[QKEYS.K_F1 + i] = true;
	}

	// /* register our variables */
	// cfg_unbindall = Cvar_Get("cfg_unbindall", "1", CVAR_ARCHIVE);

	// /* register our functions */
	// Cmd_AddCommand("bind", Key_Bind_f);
	// Cmd_AddCommand("unbind", Key_Unbind_f);
	// Cmd_AddCommand("unbindall", Key_Unbindall_f);
	// Cmd_AddCommand("bindlist", Key_Bindlist_f);

    document.addEventListener('keydown', keydownEventHandler);
    document.addEventListener('keyup', keyupEventHandler);
}

function convertKeyCode(event: KeyboardEvent): number {
    if (event.code == "ArrowDown") return QKEYS.K_DOWNARROW;
    if (event.code == "ArrowUp") return QKEYS.K_UPARROW;
    if (event.code == "Enter") return QKEYS.K_ENTER;
    if (event.code == "Escape") return QKEYS.K_ESCAPE;
    if (event.code == "Space") return QKEYS.K_SPACE;
    if (event.code >= "a" && event.code <= "z") return event.code.charCodeAt(0);
    return -1
}

export async function Key_Update () {
    for (let i = 0; i < keyEvents.length; i++) {
        await Key_Event(convertKeyCode(keyEvents[i].event), keyEvents[i].down)
    }
    keyEvents = []

	// We need to save the frame time so other subsystems
	// know the exact time of the last input events.
	sys_frame_time = Sys_Milliseconds();

}

/*
 * Called every frame for every detected keypress.
 * This is only for movement and special characters,
 * anything else is handled by Char_Event().
 */
async function Key_Event(key: number, down: boolean) {
	// char cmd[1024];
	// char *kb;
	// cvar_t *fullscreen;
	let time = Sys_Milliseconds();

    console.log(key, down)
    if (key < 0) return

	// // evil hack for the joystick key altselector, which turns K_JOYx into K_JOYx_ALT
	// if(joy_altselector_pressed && key >= K_JOY1 && key <= K_JOY_LAST_REGULAR)
	// {
	// 	// make sure key is not the altselector itself (which we won't turn into *_ALT)
	// 	if(keybindings[key] == NULL || strcmp(keybindings[key], "+joyaltselector") != 0)
	// 	{
	// 		int altkey = key + (K_JOY1_ALT - K_JOY1);
	// 		// allow fallback to binding with non-alt key
	// 		if(keybindings[altkey] != NULL || keybindings[key] == NULL)
	// 			key = altkey;
	// 	}
	// }

	/* Track if key is down */
	keydown[key] = down;

	// /* Evil hack against spurious cinematic aborts. */
	// if (down && (key != K_ESCAPE) && !keydown[K_SHIFT])
	// {
	// 	abort_cinematic = cls.realtime;
	// }

	/* Ignore most autorepeats */
	if (down)
	{
		key_repeats[key]++;

		if ((key != QKEYS.K_BACKSPACE) &&
			(key != QKEYS.K_PAUSE) &&
			(key != QKEYS.K_PGUP) &&
			(key != QKEYS.K_KP_PGUP) &&
			(key != QKEYS.K_PGDN) &&
			(key != QKEYS.K_KP_PGDN) &&
			(key_repeats[key] > 1))
		{
			return;
		}
	}
	else
	{
		key_repeats[key] = 0;
	}

	// /* Fullscreen switch through Alt + Return */
	// if (down && keydown[K_ALT] && key == K_ENTER)
	// {
	// 	fullscreen = Cvar_Get("vid_fullscreen", "0", CVAR_ARCHIVE);

	// 	if (!fullscreen->value)
	// 	{
	// 		Cvar_Set("vid_fullscreen", "1");
	// 		fullscreen->modified = true;
	// 	}
	// 	else
	// 	{
	// 		Cvar_Set("vid_fullscreen", "0");
	// 		fullscreen->modified = true;
	// 	}

	// 	return;
	// }

	// /* Toogle console through Shift + Escape or special K_CONSOLE key */
	// if (key == K_CONSOLE || (keydown[K_SHIFT] && key == K_ESCAPE))
	// {
	// 	if (down)
	// 	{
	// 		Con_ToggleConsole_f();
	// 	}
	// 	return;
	// }

	// /* Key is unbound */
	// if ((key >= K_MOUSE1 && key != K_JOY_BACK) && !keybindings[key] && (cls.key_dest != key_console) &&
	// 	(cls.state == ca_active))
	// {
	// 	Com_Printf("%s (%d) is unbound, hit F4 to set.\n", Key_KeynumToString(key), key);
	// }

	// /* While in attract loop all keys besides F1 to F12 (to
	//    allow quick load and the like) are treated like escape. */
	// if (cl.attractloop && (cls.key_dest != key_menu) &&
	// 	!((key >= K_F1) && (key <= K_F12)))
	// {
	// 	key = K_ESCAPE;
	// }

	// /* Escape has a special meaning. Depending on the situation it
	//    - pauses the game and breaks into the menu
	//    - stops the attract loop and breaks into the menu
	//    - closes the console and breaks into the menu
	//    - moves one menu level up
	//    - closes the menu
	//    - closes the help computer
	//    - closes the chat window
	//    Fully same logic for K_JOY_BACK */
	// if (!cls.disable_screen)
	// {
	// 	if (key == K_ESCAPE || key == K_JOY_BACK)
	// 	{
	// 		if (!down)
	// 		{
	// 			return;
	// 		}

	// 		/* Close the help computer */
	// 		if (cl.frame.playerstate.stats[STAT_LAYOUTS] &&
	// 			(cls.key_dest == key_game))
	// 		{
	// 			Cbuf_AddText("cmd putaway\n");
	// 			return;
	// 		}

	// 		switch (cls.key_dest)
	// 		{
	// 			/* Close chat window */
	// 			case key_message:
	// 				Key_Message(key);
	// 				break;

	// 			/* Close menu or one layer up */
	// 			case key_menu:
	// 				M_Keydown(key);
	// 				break;

	// 			/* Pause game and / or leave console,
	// 			   break into the menu. */
	// 			case key_game:
	// 			case key_console:
	// 				M_Menu_Main_f();
	// 				break;
	// 		}

	// 		return;
	// 	}
	// }

	// /* This is one of the most ugly constructs I've
	//    found so far in Quake II. When the game is in
	//    the intermission, the player can press any key
	//    to end it and advance into the next level. It
	//    should be easy to figure out at server level if
	//    a button is pressed. But somehow the developers
	//    decided, that they'll need special move state
	//    BUTTON_ANY to solve this problem. So there's
	//    this global variable anykeydown. If it's not
	//    0, CL_FinishMove() encodes BUTTON_ANY into the
	//    button state. The server reads this value and
	//    sends it to gi->ClientThink() where it's used
	//    to determine if the intermission shall end.
	//    Needless to say that this is the only consumer
	//    of BUTTON_ANY.

	//    Since we cannot alter the network protocol nor
	//    the server <-> game API, I'll leave things alone
	//    and try to forget. */
	if (down)
	{
		if (key_repeats[key] == 1)
		{
			anykeydown++;
		}
	}
	else
	{
		anykeydown--;

		if (anykeydown < 0)
		{
			anykeydown = 0;
		}
	}

	/* key up events only generate commands if the game key binding
	   is a button command (leading+ sign). These will occur even in
	   console mode, to keep the character from continuing an action
	   started before a console switch. Button commands include the
	   kenum as a parameter, so multiple downs can be matched with ups */
	if (!down) {
	// 	kb = keybindings[key];

	// 	if (kb && (kb[0] == '+'))
	// 	{
	// 		Com_sprintf(cmd, sizeof(cmd), "-%s %i %i\n", kb + 1, key, time);
	// 		Cbuf_AddText(cmd);
	// 	}

		return;
	}
	// else if (((cls.key_dest == key_menu) && menubound[key]) ||
	// 		((cls.key_dest == key_console) && !consolekeys[key]) ||
	// 		((cls.key_dest == key_game) && ((cls.state == ca_active) ||
	// 		  !consolekeys[key])))
	// {
	// 	kb = keybindings[key];

	// 	if (kb)
	// 	{
	// 		if (kb[0] == '+')
	// 		{
	// 			/* button commands add keynum and time as a parm */
	// 			Com_sprintf(cmd, sizeof(cmd), "%s %i %i\n", kb, key, time);
	// 			Cbuf_AddText(cmd);
	// 		}
	// 		else
	// 		{
	// 			Cbuf_AddText(kb);
	// 			Cbuf_AddText("\n");
	// 		}
	// 	}

	// 	return;
	// }

	// /* All input subsystems handled after this point only
	//    care for key down events (=> if(!down) returns above). */

	// /* Everything that's not a special char
	//    is processed by Char_Event(). */
	// if (!special)
	// {
	// 	return;
	// }

	/* Send key to the active input subsystem */
	switch (cls.key_dest)
	{
	// 	/* Chat */
	// 	case key_message:
	// 		Key_Message(key);
	// 		break;

		/* Menu */
		case keydest_t.key_menu:
			await M_Keydown(key);
			break;

	// 	/* Console */
	// 	case key_game:
	// 	case key_console:
	// 		Key_Console(key);
	// 		break;
	}
}
