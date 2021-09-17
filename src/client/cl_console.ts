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
 * This file implements the console
 *
 * =======================================================================
 */

import { Com_Printf } from "../common/clientserver"
import { YQ2VERSION } from "../common/common"
import { viddef, Draw_StretchPic, Draw_CharScaled } from "./vid"

const NUM_CON_TIMES = 4
const CON_TEXTSIZE	= 32768

class console_t {
	initialized: boolean = false

    text = new Int8Array(CON_TEXTSIZE)
	current: number /* line where next message will be printed */
	x: number /* offset in current line for next print */
	display: number /* bottom of console displays this line */

	ormask: number /* high bit mask for colored characters */

	linewidth: number /* characters across screen */
	totallines: number /* total lines in console scrollback */

	cursorspeed: number

	vislines: number

	// float	times[NUM_CON_TIMES]; /* cls.realtime time the line was generated */
}

export let con = new console_t()


/*
 * If the line width has changed, reformat the buffer.
 */
export function Con_CheckResize() {
	// int i, j, width, oldwidth, oldtotallines, numlines, numchars;
	// char tbuf[CON_TEXTSIZE];
	// float scale = SCR_GetConsoleScale();
    const scale = 1.0

	/* We need to clamp the line width to MAXCMDLINE - 2,
	   otherwise we may overflow the text buffer if the
	   vertical resultion / 8 (one char == 8 pixels) is
	   bigger then MAXCMDLINE.
	   MAXCMDLINE - 2 because 1 for the prompt and 1 for
	   the terminating \0. */
	let width = (~~(viddef.width / scale) / 8) - 2;
	// width = width > MAXCMDLINE - 2 ? MAXCMDLINE - 2 : width;

	if (width == con.linewidth) {
		return;
	}

	/* video hasn't been initialized yet */
	if (width < 1) {
		width = 38;
		con.linewidth = width;
		con.totallines = ~~(CON_TEXTSIZE / con.linewidth);
        con.text.fill(' '.charCodeAt(0))
	} else {
		let oldwidth = con.linewidth;
		con.linewidth = width;
		let oldtotallines = con.totallines;
		con.totallines = CON_TEXTSIZE / con.linewidth;
		let numlines = oldtotallines;

		if (con.totallines < numlines) {
			numlines = con.totallines;
		}

		let numchars = oldwidth;

		if (con.linewidth < numchars) {
			numchars = con.linewidth;
		}

        let tbuf = new Int8Array(CON_TEXTSIZE)
        const space = ' '.charCodeAt(0)
        for (let i = 0; i < CON_TEXTSIZE; i++) {
            tbuf[i] = con.text[i]
            con.text[i] = space
        }

		for (let i = 0; i < numlines; i++)
		{
			for (let j = 0; j < numchars; j++)
			{
				con.text[(con.totallines - 1 - i) * con.linewidth + j] =
					tbuf[((con.current - i + oldtotallines) %
						  oldtotallines) * oldwidth + j];
			}
		}

	// 	Con_ClearNotify();
	}

	con.current = con.totallines - 1;
	con.display = con.current;
}

export function Con_Init() {
	con.linewidth = -1;

	Con_CheckResize();

	Com_Printf("Console initialized.\n");

	/* register our commands */
	// con_notifytime = Cvar_Get("con_notifytime", "3", 0);

	// Cmd_AddCommand("toggleconsole", Con_ToggleConsole_f);
	// Cmd_AddCommand("togglechat", Con_ToggleChat_f);
	// Cmd_AddCommand("messagemode", Con_MessageMode_f);
	// Cmd_AddCommand("messagemode2", Con_MessageMode2_f);
	// Cmd_AddCommand("clear", Con_Clear_f);
	// Cmd_AddCommand("condump", Con_Dump_f);
	con.initialized = true;
}

function Con_Linefeed() {
	con.x = 0;

	if (con.display == con.current) {
		con.display++;
	}

	con.current++;
    const space = ' '.charCodeAt(0);
    for (let i = 0; i < con.linewidth; i++) {
        con.text[(con.current % con.totallines) * con.linewidth + i] = space;
    }
}

/*
 * Handles cursor positioning, line wrapping, etc All console printing
 * must go through this in order to be logged to disk If no console is
 * visible, the text will appear at the top of the game window
 */
let _cr = false
export function Con_Print(txt: string) {

	if (!con.initialized) {
		return;
	}

    let mask = 0;
    let index = 0;
	if ((txt.charCodeAt(0) == 1) || (txt.charCodeAt(0) == 2)) {
		mask = 128; /* go to colored text */
		index++;
	}

	while (index < txt.length) {
		/* count word length */
        let l = 0
		for (l = 0; l < con.linewidth; l++) {
			if (txt[l] <= ' ') {
				break;
			}
		}

		/* word wrap */
		if ((l != con.linewidth) && (con.x + l > con.linewidth)) {
			con.x = 0;
		}

        let c = txt[index];
		index++;

		if (_cr) {
			con.current--;
			_cr = false;
		}

		if (!con.x) {
			Con_Linefeed();

			/* mark time for transparent overlay */
			// if (con.current >= 0) {
			// 	con.times[con.current % NUM_CON_TIMES] = cls.realtime;
			// }
		}

		switch (c) {
			case '\n':
				con.x = 0;
				break;

			case '\r':
				con.x = 0;
				_cr = true;
				break;

			default: /* display character and advance */
				let y = con.current % con.totallines;
				con.text[y * con.linewidth + con.x] = c.charCodeAt(0) | mask | con.ormask;
				con.x++;

				if (con.x >= con.linewidth) {
					con.x = 0;
				}

				break;
		}
	}
}


/*
 * Draws the console with the solid background
 */
export async function Con_DrawConsole(frac: number) {
// 	int i, j, x, y, n;
// 	int rows;
// 	int verLen;
// 	char *text;
// 	int row;
// 	int lines;
// 	float scale;
// 	char version[48];
// 	char dlbar[1024];
// 	char timebuf[48];
// 	char tmpbuf[48];

// 	time_t t;
// 	struct tm *today;

// 	scale = SCR_GetConsoleScale();
    const scale = 1.0
	let lines = ~~(viddef.height * frac)
	if (lines <= 0) {
		return;
	}

	if (lines > viddef.height) {
		lines = viddef.height;
	}

	/* draw the background */
	await Draw_StretchPic(0, -viddef.height + lines, viddef.width, viddef.height, "conback");
// 	SCR_AddDirtyPoint(0, 0);
// 	SCR_AddDirtyPoint(viddef.width - 1, lines - 1);

	const version = `Yamagi Quake II v${YQ2VERSION}`;
	for (let x = 0; x < version.length; x++) {
		Draw_CharScaled(viddef.width - ((version.length*8+5) * scale) + x * 8 * scale, lines - 35 * scale, 128 + version.charCodeAt(x), scale);
	}

// 	t = time(NULL);
// 	today = localtime(&t);
// 	strftime(timebuf, sizeof(timebuf), "%H:%M:%S - %m/%d/%Y", today);

// 	Com_sprintf(tmpbuf, sizeof(tmpbuf), "%s", timebuf);

// 	for (x = 0; x < 21; x++)
// 	{
// 		Draw_CharScaled(viddef.width - (173 * scale) + x * 8 * scale, lines - 25 * scale, 128 + tmpbuf[x], scale);
// 	}

	/* draw the text */
	con.vislines = lines;

	let rows = (lines - 22) >> 3; /* rows of text to draw */
	let y = ~~((lines - 30 * scale) / scale);

	/* draw from the bottom up */
	if (con.display != con.current) {
// 		/* draw arrows to show the buffer is backscrolled */
// 		for (x = 0; x < con.linewidth; x += 4) {
// 			Draw_CharScaled(((x + 1) << 3) * scale, y * scale, '^', scale);
// 		}

		y -= 8;
		rows--;
	}

	let row = con.display;

	for (let i = 0; i < rows; i++, y -= 8, row--) {
		if (row < 0) {
			break;
		}

		if (con.current - row >= con.totallines) {
			break; /* past scrollback wrap point */
		}

		let text_i = (row % con.totallines) * con.linewidth;

		for (let x = 0; x < con.linewidth; x++) {
			Draw_CharScaled(((x + 1) << 3) * scale, y * scale, con.text[text_i + x], scale);
		}
	}

// 	/* draw the download bar, figure out width */
// #ifdef USE_CURL
// 	if (cls.downloadname[0] && (cls.download || cls.downloadposition))
// #else
// 	if (cls.download)
// #endif
// 	{
// 		if ((text = strrchr(cls.downloadname, '/')) != NULL)
// 		{
// 			text++;
// 		}

// 		else
// 		{
// 			text = cls.downloadname;
// 		}

// 		x = con.linewidth - ((con.linewidth * 7) / 40);
// 		y = x - strlen(text) - 8;
// 		i = con.linewidth / 3;

// 		if (strlen(text) > i)
// 		{
// 			y = x - i - 11;
// 			memcpy(dlbar, text, i);
// 			dlbar[i] = 0;
// 			strcat(dlbar, "...");
// 		}
// 		else
// 		{
// 			strcpy(dlbar, text);
// 		}

// 		strcat(dlbar, ": ");
// 		i = strlen(dlbar);
// 		dlbar[i++] = '\x80';

// 		/* where's the dot gone? */
// 		if (cls.downloadpercent == 0)
// 		{
// 			n = 0;
// 		}

// 		else
// 		{
// 			n = y * cls.downloadpercent / 100;
// 		}

// 		for (j = 0; j < y; j++)
// 		{
// 			if (j == n)
// 			{
// 				dlbar[i++] = '\x83';
// 			}

// 			else
// 			{
// 				dlbar[i++] = '\x81';
// 			}
// 		}

// 		dlbar[i++] = '\x82';
// 		dlbar[i] = 0;

// 		sprintf(dlbar + strlen(dlbar), " %02d%%", cls.downloadpercent);

// 		/* draw it */
// 		y = con.vislines - 12;

// 		for (i = 0; i < strlen(dlbar); i++)
// 		{
// 			Draw_CharScaled(((i + 1) << 3) * scale, y * scale, dlbar[i], scale);
// 		}
// 	}

// 	/* draw the input prompt, user text, and cursor if desired */
// 	Con_DrawInput();
}

