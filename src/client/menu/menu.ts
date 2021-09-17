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
 * This file implements the non generic part of the menu system, e.g.
 * the menu shown to the player. Beware! This code is very fragile and
 * should only be touched with great care and exessive testing.
 * Otherwise strange things and hard to track down bugs can occure. In a
 * better world someone would rewrite this file to something more like
 * Quake III Team Arena.
 *
 * =======================================================================
 */
import { Com_Error } from "../../common/clientserver";
import { Cmd_AddCommand, Cbuf_AddText } from "../../common/cmdparser"
import { Cvar_Set, Cvar_ForceSet } from "../../common/cvar"
import { ERR_FATAL } from "../../common/shared";
import { keydest_t } from "../client";
import { QKEYS } from "../cl_keyboard";
import { cls, cl } from "../cl_main"
import { viddef, Draw_PicScaled, Draw_GetPicSize, Draw_FindPic } from "../vid"
import { menuframework_s, menuaction_s, QMF_LEFT_JUSTIFY } from "./qmenu"

let m_main_cursor = 0

/* Number of the frames of the spinning quake logo */
const NUM_CURSOR_FRAMES = 15

const menu_in_sound = "misc/menu1.wav";
const menu_move_sound = "misc/menu2.wav";
const menu_out_sound = "misc/menu3.wav";

let m_drawfunc: () => Promise<any> = null;
let m_keyfunc: (key: number) => Promise<string> = null;

interface menulayer_t {
    draw: () => Promise<any>
    key: (k: number) => Promise<string>
} ;

let m_layers: menulayer_t[] = [];

async function M_Banner(name: string) {
    // int w, h;
	// float scale = SCR_GetMenuScale();
    const scale = 1.0

    const sz = await Draw_GetPicSize(name);
    await Draw_PicScaled(viddef.width / 2 - (sz[0] * scale) / 2, viddef.height / 2 - (110 * scale), name, scale);
}


function M_ForceMenuOff() {
    m_drawfunc = null;
    m_keyfunc = null;
    cls.key_dest = keydest_t.key_game;
    m_layers = [];
	// Key_MarkAllUp();
    // Cvar_Set("paused", "0");
}

function M_PopMenu() {
    // S_StartLocalSound(menu_out_sound);

    if (m_layers.length < 1) {
        Com_Error(ERR_FATAL, "M_PopMenu: depth < 1");
    }

    m_layers.pop()

    if (m_layers.length > 0) {
        m_drawfunc = m_layers[m_layers.length-1].draw;
        m_keyfunc = m_layers[m_layers.length-1].key;
    } else {
        M_ForceMenuOff();
    }
}


/*
 * This crappy function maintaines a stack of opened menus.
 * The steps in this horrible mess are:
 *
 * 1. But the game into pause if a menu is opened
 *
 * 2. If the requested menu is already open, close it.
 *
 * 3. If the requested menu is already open but not
 *    on top, close all menus above it and the menu
 *    itself. This is necessary since an instance of
 *    the reqeuested menu is in flight and will be
 *    displayed.
 *
 * 4. Save the previous menu on top (which was in flight)
 *    to the stack and make the requested menu the menu in
 *    flight.
 */
function M_PushMenu(draw: () => Promise<any>, key: (code: number) => Promise<string>): any {
//     int i;
//     int alreadyPresent = 0;

//     if ((Cvar_VariableValue("maxclients") == 1) &&
//             Com_ServerState())
//     {
//         Cvar_Set("paused", "1");
//     }

// #ifdef USE_OPENAL
//     if (cl.cinematic_file && sound_started == SS_OAL)
//     {
//         AL_UnqueueRawSamples();
//     }
// #endif

    /* if this menu is already open (and on top),
       close it => toggling behaviour */
    if ((m_drawfunc == draw) && (m_keyfunc == key)) {
        M_PopMenu();
        return;
    }

    /* if this menu is already present, drop back to
       that level to avoid stacking menus by hotkeys */
    // let alreadyPresent = false
    // for (let m of m_layers) {
    //     if ((m.draw == draw) && (m.key == key)) {
    //         alreadyPresent = true;
    //         break;
    //     }
    // }

    // /* menu was already opened further down the stack */
    // while (alreadyPresent && i <= m_menudepth) {
    //     M_PopMenu(); /* decrements m_menudepth */
    // }

//     if (m_menudepth >= MAX_MENU_DEPTH) {
//         Com_Printf("Too many open menus!\n");
//         return;
//     }

    if (m_drawfunc != null || m_keyfunc != null) {
        m_layers.push({draw: m_drawfunc, key: m_keyfunc})
    }

    m_drawfunc = draw;
    m_keyfunc = key;

//     m_entersound = true;

    cls.key_dest = keydest_t.key_menu;
}

function Key_GetMenuKey(key: number): number {
	switch (key) {
		case QKEYS.K_KP_UPARROW:
		case QKEYS.K_UPARROW:
		case QKEYS.K_HAT_UP:
			return QKEYS.K_UPARROW;

		case QKEYS.K_TAB:
		case QKEYS.K_KP_DOWNARROW:
		case QKEYS.K_DOWNARROW:
		case QKEYS.K_HAT_DOWN:
			return QKEYS.K_DOWNARROW;

		case QKEYS.K_KP_LEFTARROW:
		case QKEYS.K_LEFTARROW:
		case QKEYS.K_HAT_LEFT:
		case QKEYS.K_TRIG_LEFT:
			return QKEYS.K_LEFTARROW;

		case QKEYS.K_KP_RIGHTARROW:
		case QKEYS.K_RIGHTARROW:
		case QKEYS.K_HAT_RIGHT:
		case QKEYS.K_TRIG_RIGHT:
			return QKEYS.K_RIGHTARROW;

		case QKEYS.K_MOUSE1:
		case QKEYS.K_MOUSE2:
		case QKEYS.K_MOUSE3:
		case QKEYS.K_MOUSE4:
		case QKEYS.K_MOUSE5:

		case QKEYS.K_JOY1:
		case QKEYS.K_JOY2:
		case QKEYS.K_JOY3:
		case QKEYS.K_JOY4:
		case QKEYS.K_JOY5:
		case QKEYS.K_JOY6:
		case QKEYS.K_JOY7:
		case QKEYS.K_JOY8:
		case QKEYS.K_JOY9:
		case QKEYS.K_JOY10:
		case QKEYS.K_JOY11:
		case QKEYS.K_JOY12:
		case QKEYS.K_JOY13:
		case QKEYS.K_JOY14:
		case QKEYS.K_JOY15:
		case QKEYS.K_JOY16:
		case QKEYS.K_JOY17:
		case QKEYS.K_JOY18:
		case QKEYS.K_JOY19:
		case QKEYS.K_JOY20:
		case QKEYS.K_JOY21:
		case QKEYS.K_JOY22:
		case QKEYS.K_JOY23:
		case QKEYS.K_JOY24:
		case QKEYS.K_JOY25:
		case QKEYS.K_JOY26:
		case QKEYS.K_JOY27:
		case QKEYS.K_JOY28:
		case QKEYS.K_JOY29:
		case QKEYS.K_JOY30:
		case QKEYS.K_JOY31:

		case QKEYS.K_KP_ENTER:
		case QKEYS.K_ENTER:
			return QKEYS.K_ENTER;

		case QKEYS.K_ESCAPE:
		case QKEYS.K_JOY_BACK:
			return QKEYS.K_ESCAPE;
	}

	return key;
}

async function Default_MenuKey(m: menuframework_s, key: number): Promise<string> {
    let sound: string = null;
    const menu_key = Key_GetMenuKey(key);

    if (m != null) {
        let item = m.ItemAtCursor()
        if (item != null) {
    //         if (item->type == MTYPE_FIELD) {
    //             if (Field_Key((menufield_s *)item, key)) {
    //                 return NULL;
    //             }
    //         }
        }
    }

    switch (menu_key) {
    case QKEYS.K_ESCAPE:
        M_PopMenu();
        return menu_out_sound;

    case QKEYS.K_UPARROW:
        if (m != null) {
            m.cursor--;
            m.AdjustCursor(-1);
            sound = menu_move_sound;
        }
        break;

    case QKEYS.K_DOWNARROW:
        if (m != null) {
            m.cursor++;
            m.AdjustCursor(1);
            sound = menu_move_sound;
        }
        break;

    case QKEYS.K_LEFTARROW:
        if (m != null) {
            // Menu_SlideItem(m, -1);
            sound = menu_move_sound;
        }
        break;

    case QKEYS.K_RIGHTARROW:
        if (m != null) {
            // Menu_SlideItem(m, 1);
            sound = menu_move_sound;
        }
        break;

    case QKEYS.K_ENTER:
        if (m != null) {
            await m.SelectItem();
        }
        sound = menu_move_sound;
        break;
    }

    return sound;
}

/*
 * Draws an animating cursor with the point at
 * x,y. The pic will extend to the left of x,
 * and both above and below y.
 */
let _cached = false
async function M_DrawCursor(x: number, y: number, f: number) {
	// float scale = SCR_GetMenuScale();
    let scale = 1.0

    if (!_cached) {
        for (let i = 0; i < NUM_CURSOR_FRAMES; i++) {
            const cursorname = `m_cursor${i}`
            await Draw_FindPic(cursorname);
        }

        _cached = true;
    }

    let cursorname = `m_cursor${f}`
    await Draw_PicScaled(x * scale, y * scale, cursorname, scale);
}


/*
 * MAIN MENU
 */

const MAIN_ITEMS = 4

async function M_Main_Draw() {
    // int i;
    // int w, h;
    // int ystart;
    // int xoffset;
    // int widest = -1;
    // int totalheight = 0;
    // char litname[80];
	// float scale = SCR_GetMenuScale();
    let scale = 1.0
    const names = [
        "m_main_game",
        "m_main_multiplayer",
        "m_main_options",
        "m_main_video"
    ];

    let widest = 0
    let totalheight = 0
    for (let n of names) {
        let sz = await Draw_GetPicSize(n)
        if (sz[0] > widest) {
            widest = sz[0];
        }

        totalheight += (sz[1] + 12);
    }

    let ystart = ~~(viddef.height / (2 * scale) - 110);
    let xoffset = ~~((viddef.width / scale - widest + 70) / 2);

    for (let i = 0; i < names.length; i++) {
        if (i != m_main_cursor) {
            await Draw_PicScaled(xoffset * scale, (ystart + i * 40 + 13) * scale, names[i], scale);
        }
    }

    let litname = `${names[m_main_cursor]}_sel`;
    await Draw_PicScaled(xoffset * scale, (ystart + m_main_cursor * 40 + 13) * scale, litname, scale);

    await M_DrawCursor(xoffset - 25, ystart + m_main_cursor * 40 + 11, ~~(cls.realtime / 100) % NUM_CURSOR_FRAMES);

    let sz = await Draw_GetPicSize("m_main_plaque")
    await Draw_PicScaled((xoffset - 30 - sz[0]) * scale, ystart * scale, "m_main_plaque", scale);
    await Draw_PicScaled((xoffset - 30 - sz[0]) * scale, (ystart + sz[1] + 5) * scale, "m_main_logo", scale);
}

async function M_Main_Key(key: number): Promise<string> {
	const sound = menu_move_sound;
	const menu_key = Key_GetMenuKey(key);

    switch (menu_key) {
    // case K_ESCAPE:
    //     M_PopMenu();
    //     break;

    case QKEYS.K_DOWNARROW:
        if (++m_main_cursor >= MAIN_ITEMS) {
            m_main_cursor = 0;
        }
        return sound;

    case QKEYS.K_UPARROW:
        if (--m_main_cursor < 0) {
            m_main_cursor = MAIN_ITEMS - 1;
        }
        return sound;

    case QKEYS.K_ENTER:
        // m_entersound = true;

        switch (m_main_cursor) {
        case 0:
            M_Menu_Game_f([]);
            break;

    //     case 1:
    //         M_Menu_Multiplayer_f();
    //         break;

    //     case 2:
    //         M_Menu_Options_f();
    //         break;

    //     case 3:
    //         M_Menu_Video_f();
    //         break;

    //     case 4:
    //         M_Menu_Quit_f();
    //         break;
        }
    }

    return null;
}

export async function M_Menu_Main_f(args: string[]) {
    M_PushMenu(M_Main_Draw, M_Main_Key);
}

/*
 * GAME MENU
 */

let m_game_cursor = 0

let s_game_menu = new menuframework_s();
let s_easy_game_action = new menuaction_s();
let s_medium_game_action = new menuaction_s();
let s_hard_game_action = new menuaction_s();
let s_hardp_game_action = new menuaction_s();
let s_load_game_action = new menuaction_s();
let s_save_game_action = new menuaction_s();
let s_credits_action = new menuaction_s();
let s_mods_action = new menuaction_s();
// static menuseparator_s s_blankline;

async function StartGame() {
// 	if (cls.state != ca_disconnected && cls.state != ca_uninitialized) {
// 		CL_Disconnect();
// 	}

    /* disable updates and start the cinematic going */
    cl.servercount = -1;
    M_ForceMenuOff();
    Cvar_Set("deathmatch", "0");
    Cvar_Set("coop", "0");

    Cbuf_AddText("disconnect ; wait ; newgame\n");
    cls.key_dest = keydest_t.key_game;
}

async function EasyGameFunc(self: menuaction_s) {
    Cvar_ForceSet("skill", "0");
    await StartGame();
}

async function MediumGameFunc(self: menuaction_s) {
    Cvar_ForceSet("skill", "1");
    await StartGame();
}

async function HardGameFunc(self: menuaction_s) {
    Cvar_ForceSet("skill", "2");
    await StartGame();
}

async function HardpGameFunc(self: menuaction_s) {
    Cvar_ForceSet("skill", "3");
    await StartGame();
}

// static void
// LoadGameFunc(void *unused)
// {
//     M_Menu_LoadGame_f();
// }

// static void
// SaveGameFunc(void *unused)
// {
//     M_Menu_SaveGame_f();
// }

// static void
// CreditsFunc(void *unused)
// {
//     M_Menu_Credits_f();
// }

// static void
// ModsFunc(void *unused)
// {
//     M_Menu_Mods_f();
// }

async function Game_MenuInit() {
//     Mods_NamesInit();

    s_game_menu.x = ~~(viddef.width * 0.50);

    s_easy_game_action.flags = QMF_LEFT_JUSTIFY;
    s_easy_game_action.x = 0;
    s_easy_game_action.y = 0;
    s_easy_game_action.name = "easy";
    s_easy_game_action.callback = EasyGameFunc;

    s_medium_game_action.flags = QMF_LEFT_JUSTIFY;
    s_medium_game_action.x = 0;
    s_medium_game_action.y = 10;
    s_medium_game_action.name = "medium";
    s_medium_game_action.callback = MediumGameFunc;

    s_hard_game_action.flags = QMF_LEFT_JUSTIFY;
    s_hard_game_action.x = 0;
    s_hard_game_action.y = 20;
    s_hard_game_action.name = "hard";
    s_hard_game_action.callback = HardGameFunc;

    s_hardp_game_action.flags = QMF_LEFT_JUSTIFY;
    s_hardp_game_action.x = 0;
    s_hardp_game_action.y = 30;
    s_hardp_game_action.name = "nightmare";
    s_hardp_game_action.callback = HardpGameFunc;

//     s_blankline.generic.type = MTYPE_SEPARATOR;

    s_load_game_action.flags = QMF_LEFT_JUSTIFY;
    s_load_game_action.x = 0;
    s_load_game_action.y = 50;
    s_load_game_action.name = "load game";
//     s_load_game_action.generic.callback = LoadGameFunc;

    s_save_game_action.flags = QMF_LEFT_JUSTIFY;
    s_save_game_action.x = 0;
    s_save_game_action.y = 60;
    s_save_game_action.name = "save game";
//     s_save_game_action.generic.callback = SaveGameFunc;

    s_credits_action.flags = QMF_LEFT_JUSTIFY;
    s_credits_action.x = 0;
    s_credits_action.y = 70;
    s_credits_action.name = "credits";
//     s_credits_action.generic.callback = CreditsFunc;

    s_game_menu.AddItem(s_easy_game_action);
    s_game_menu.AddItem(s_medium_game_action);
    s_game_menu.AddItem(s_hard_game_action);
    s_game_menu.AddItem(s_hardp_game_action);
//     Menu_AddItem(&s_game_menu, (void *)&s_blankline);
    s_game_menu.AddItem(s_load_game_action);
    s_game_menu.AddItem(s_save_game_action);
    s_game_menu.AddItem(s_credits_action);

//     if(nummods > 1)
//     {
//         s_mods_action.generic.type = MTYPE_ACTION;
//         s_mods_action.generic.flags = QMF_LEFT_JUSTIFY;
//         s_mods_action.generic.x = 0;
//         s_mods_action.generic.y = 90;
//         s_mods_action.generic.name = "mods";
//         s_mods_action.generic.callback = ModsFunc;

//         Menu_AddItem(&s_game_menu, (void *)&s_blankline);
//         Menu_AddItem(&s_game_menu, (void *)&s_mods_action);
//     }

    s_game_menu.Center();
}

async function Game_MenuDraw() {
    M_Banner("m_banner_game");
    s_game_menu.AdjustCursor(1);
    await s_game_menu.Draw()
}

async function Game_MenuKey(key: number): Promise<string> {
    return await Default_MenuKey(s_game_menu, key)
}

async function M_Menu_Game_f(args: string[]) {
    await Game_MenuInit();
    M_PushMenu(Game_MenuDraw, Game_MenuKey);
    m_game_cursor = 1;
}


export function M_Init() {
    Cmd_AddCommand("menu_main", M_Menu_Main_f);
    Cmd_AddCommand("menu_game", M_Menu_Game_f);
    // Cmd_AddCommand("menu_loadgame", M_Menu_LoadGame_f);
    // Cmd_AddCommand("menu_savegame", M_Menu_SaveGame_f);
    // Cmd_AddCommand("menu_joinserver", M_Menu_JoinServer_f);
    // Cmd_AddCommand("menu_addressbook", M_Menu_AddressBook_f);
    // Cmd_AddCommand("menu_startserver", M_Menu_StartServer_f);
    // Cmd_AddCommand("menu_dmoptions", M_Menu_DMOptions_f);
    // Cmd_AddCommand("menu_playerconfig", M_Menu_PlayerConfig_f);
    // Cmd_AddCommand("menu_downloadoptions", M_Menu_DownloadOptions_f);
    // Cmd_AddCommand("menu_credits", M_Menu_Credits_f);
    // Cmd_AddCommand("menu_mods", M_Menu_Mods_f);
    // Cmd_AddCommand("menu_multiplayer", M_Menu_Multiplayer_f);
    // Cmd_AddCommand("menu_video", M_Menu_Video_f);
    // Cmd_AddCommand("menu_options", M_Menu_Options_f);
    // Cmd_AddCommand("menu_keys", M_Menu_Keys_f);
    // Cmd_AddCommand("menu_joy", M_Menu_Joy_f);
    // Cmd_AddCommand("menu_quit", M_Menu_Quit_f);

    // /* initialize the server address book cvars (adr0, adr1, ...)
    //  * so the entries are not lost if you don't open the address book */
    // for (int index = 0; index < NUM_ADDRESSBOOK_ENTRIES; index++)
    // {
    //     char buffer[20];
    //     Com_sprintf(buffer, sizeof(buffer), "adr%d", index);
    //     Cvar_Get(buffer, "", CVAR_ARCHIVE);
    // }
}

export async function M_Draw() {
    if (cls.key_dest != keydest_t.key_menu) {
        return;
    }

    /* repaint everything next frame */
    // SCR_DirtyScreen();

    /* dim everything behind it down */
    // if (cl.cinematictime > 0) {
    //     Draw_Fill(0, 0, viddef.width, viddef.height, 0);
    // } else {
    //     Draw_FadeScreen();
    // }

    await m_drawfunc();

    /* delay playing the enter sound until after the
       menu has been drawn, to avoid delay while
       caching images */
    // if (m_entersound) {
    //     S_StartLocalSound(menu_in_sound);
    //     m_entersound = false;
    // }
}

export async function M_Keydown(key: number) {
    if (m_keyfunc != null) {
        const s = await m_keyfunc(key)
        if (s != null) {
            // S_StartLocalSound((char *)s);
        }
    }
}

