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
 * This file implements the generic part of the menu
 *
 * =======================================================================
 */

import { viddef, Draw_CharScaled } from "../vid"
import { Sys_Milliseconds } from "../../common/clientserver"

export const QMF_LEFT_JUSTIFY = 0x00000001
export const QMF_GRAYED = 0x00000002
export const QMF_NUMBERSONLY = 0x00000004

const RCOLUMN_OFFSET = 16
const LCOLUMN_OFFSET = -16


export class menuframework_s {
    x: number = 0
    y: number = 0
	cursor: number = 0

	nslots: number
    items: menucommon_s[] = []

	statusbar: string = null

	// void (*cursordraw)(struct _tag_menuframework *m);

    public AddItem(item: menucommon_s) {
        this.items.push(item);
        item.parent = this;

        this.nslots = this.TallySlots();
    }

    /*
    * This function takes the given menu, the direction, and attempts
    * to adjust the menu's cursor so that it's at the next available
    * slot.
    */
    public AdjustCursor(dir: number) {
        // menucommon_s *citem;

        /* see if it's in a valid spot */
        if ((this.cursor >= 0) && (this.cursor < this.items.length)) {
            // if ((citem = Menu_ItemAtCursor(m)) != 0) {
            //     if (citem->type != MTYPE_SEPARATOR)
            //     {
            //         return;
            //     }
            // }
        }

        /* it's not in a valid spot, so crawl in the direction
        indicated until we find a valid spot */
        if (dir == 1) {
            while (true) {
                let item = this.ItemAtCursor();

                if (item != null) {
                    // if (citem->type != MTYPE_SEPARATOR) {
                        break;
                    // }
                }

                this.cursor += dir;

                if (this.cursor >= this.items.length) {
                    this.cursor = 0;
                }
            }
        } else {
            while (true) {
                let item = this.ItemAtCursor();
                if (item != null) {
                    // if (citem->type != MTYPE_SEPARATOR) {
                        break;
                    // }
                }

                this.cursor += dir;
                if (this.cursor < 0) {
                    this.cursor = this.items.length - 1;
                }
            }
        }
    }

    public Center() {
        // float scale = SCR_GetMenuScale();
        const scale = 1.0

        let height = this.items[this.items.length - 1].y;
        height += 10;

        this.y = ~~((viddef.height / scale - height) / 2);
    }

    public async Draw() {
        // int i;
        // menucommon_s *item;
        // float scale = SCR_GetMenuScale();
        const scale = 1.0

        /* draw contents */
        for (let i in this.items) {
            await this.items[i].Draw();
        }

        let item = this.ItemAtCursor();

    //     if (item != null && item->cursordraw)
    //     {
    //         item->cursordraw(item);
    //     }
    //     else if (menu->cursordraw)
    //     {
    //         menu->cursordraw(menu);
    //     }
    //     else if (item && (item->type != MTYPE_FIELD))
        if (item != null) {
            if ((item.flags & QMF_LEFT_JUSTIFY) != 0) {
                Draw_CharScaled(this.x + (item.x / scale - 24 + item.cursor_offset) * scale,
                        (this.y + item.y) * scale,
                        12 + (~~(Sys_Milliseconds() / 250) & 1), scale);
            } else {
                Draw_CharScaled(this.x + (item.cursor_offset) * scale,
                        (this.y + item.y) * scale,
                        12 + (~~(Sys_Milliseconds() / 250) & 1), scale);
            }
        }

        if (item != null) {
    //         if (item.statusbarfunc != null)
    //         {
    //             item->statusbarfunc((void *)item);
    //         }

    //         else if (item.statusbar != null)
    //         {
    //             Menu_DrawStatusBar(item->statusbar);
    //         }

    //         else
    //         {
                Menu_DrawStatusBar(this.statusbar);
    //         }
        } else {
            Menu_DrawStatusBar(this.statusbar);
        }
    }

    public ItemAtCursor(): menucommon_s {
        if ((this.cursor < 0) || (this.cursor >= this.items.length)) {
            return null;
        }

        return this.items[this.cursor];
    }

    public async SelectItem(): Promise<boolean> {
        let item = this.ItemAtCursor();
        if (item != null) {
            return await item.DoEnter();
            // switch (item->type)
            // {
            //     case MTYPE_FIELD:
            //         return Field_DoEnter((menufield_s *)item);
            //     case MTYPE_ACTION:
            //         Action_DoEnter((menuaction_s *)item);
            //         return true;
            //     case MTYPE_LIST:
            //         return false;
            //     case MTYPE_SPINCONTROL:
            //         return false;
            // }
        }
    
        return false;
    }
    

    private TallySlots(): number {
        let total = 0;

        for (let i = 0; i < this.items.length; i++) {
            // if (((menucommon_s *)menu->items[i])->type == MTYPE_LIST)
            // {
            //     int nitems = 0;
            //     const char **n = ((menulist_s *)menu->items[i])->itemnames;

            //     while (*n)
            //     {
            //         nitems++, n++;
            //     }

            //     total += nitems;
            // }
            // else
            // {
                total++;
            // }
        }

        return total;
    }
}

abstract class menucommon_s {
	// int type;
	name: string
    x: number
    y: number
    parent: menuframework_s
	cursor_offset: number
	// int localdata[4];
	flags: number

    abstract Draw(): Promise<any>

    public async DoEnter(): Promise<boolean> {
        return false;
    }

	statusbar: string = null

    callback: (self: menucommon_s) => Promise<any>
	// void (*statusbarfunc)(void *self);
	// void (*ownerdraw)(void *self);
	// void (*cursordraw)(void *self);
}

export class menuaction_s extends menucommon_s {
    public async Draw() {
        // float scale = SCR_GetMenuScale();
        const scale = 1.0

        if ((this.flags & QMF_LEFT_JUSTIFY) != 0) {
            if ((this.flags & QMF_GRAYED) != 0) {
                Menu_DrawStringDark(this.x + this.parent.x + (LCOLUMN_OFFSET * scale),
                    this.y + this.parent.y, this.name);
            } else {
                Menu_DrawString(this.x + this.parent.x + (LCOLUMN_OFFSET * scale),
                    this.y + this.parent.y, this.name);
            }
        } else {
            if ((this.flags & QMF_GRAYED) != 0) {
                Menu_DrawStringR2LDark(this.x + this.parent.x + (LCOLUMN_OFFSET * scale),
                    this.y + this.parent.y, this.name);
            } else {
                Menu_DrawStringR2L(this.x + this.parent.x + (LCOLUMN_OFFSET * scale),
                    this.y + this.parent.y, this.name);
            }
        }
    
        // if (this.ownerdraw) {
        //     this.ownerdraw(this);
        // }        
    }

    public async DoEnter(): Promise<boolean> {
        if (this.callback != null) {
            await this.callback(this);
        }
        return true;
    }
    
}

function Menu_DrawStatusBar(str: string) {
	// float scale = SCR_GetMenuScale();
    const scale = 1.0

	if (str != null) {
		const l = str.length
		const col = ~~((viddef.width / 2) - (l*8 / 2) * scale);

		// Draw_Fill(0, viddef.height - 8 * scale, viddef.width, 8 * scale, 4);
		Menu_DrawString(col, viddef.height / scale - 8, str);
	} else {
		// Draw_Fill(0, VID_HEIGHT - 8 * scale, VID_WIDTH, 8 * scale, 0);
	}
}


function Menu_DrawString(x: number, y: number, str: string ) {
	// float scale = SCR_GetMenuScale();
    const scale = 1.0

	for (let i = 0; i < str.length; i++) {
		Draw_CharScaled(x + i * 8 * scale, y * scale, str.charCodeAt(i), scale);
	}
}

function Menu_DrawStringDark(x: number, y: number, str: string ) {
	// float scale = SCR_GetMenuScale();
    const scale = 1.0

	for (let i = 0; i < str.length; i++) {
		Draw_CharScaled(x + i * 8 * scale, y * scale, str.charCodeAt(i) + 128, scale);
	}
}

function Menu_DrawStringR2L(x: number, y: number, str: string ) {
	// float scale = SCR_GetMenuScale();
    const scale = 1.0

	for (let i = 0; i < str.length; i++) {
		Draw_CharScaled(x - i * 8 * scale, y * scale, str.charCodeAt(str.length - i - 1), scale);
	}
}

function Menu_DrawStringR2LDark(x: number, y: number, str: string ) {
	// float scale = SCR_GetMenuScale();
    const scale = 1.0

	for (let i = 0; i < str.length; i++) {
		Draw_CharScaled(x - i * 8 * scale, y * scale, str.charCodeAt(str.length - i - 1) + 128, scale);
	}
}
