
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
 * Player movement code. This is the core of Quake IIs legendary physics
 * engine
 *
 * =======================================================================
 */
import * as COMMON from "./common"
import { ERR_FATAL, usercmd_t } from "./shared"
import { Com_Error, Com_Printf } from "./clientserver"

export class QWritebuf {
	allowoverflow: boolean     /* if false, do a Com_Error */
	overflowed: boolean        /* set to true if the buffer size failed */
	data: Uint8Array
	cursize: number

    constructor(size: number) {
        this.allowoverflow = false
        this.overflowed = false
        this.data = new Uint8Array(size)
        this.cursize = 0
    }

    Clear() {
        this.cursize = 0;
        this.overflowed = false;
    }

    Data(): Uint8Array {
        return this.data.slice(0, this.cursize)
    }

    private GetSpace(length: number): number {

        if (this.cursize + length > this.data.byteLength) {
            if (!this.allowoverflow) {
                Com_Error(ERR_FATAL, "SZ_GetSpace: overflow without allowoverflow set");
            }

            if (length > this.data.byteLength) {
                Com_Error(ERR_FATAL, `SZ_GetSpace: ${length} is > full buffer size`);
            }

            this.Clear();
            this.overflowed = true;
            Com_Printf("SZ_GetSpace: overflow\n");
        }

        let index = this.cursize;
        this.cursize += length;

        return index;
    }

    WriteChar(c: number) {
        const index = this.GetSpace(1);
        this.data[index] = ~~c;
    }

    WriteByte(c: number) {
        const index = this.GetSpace(1);
        this.data[index] = c & 0xFF
    }

    WriteShort(c: number) {
        const index = this.GetSpace(2);
        this.data[index] = c & 0xFF
        this.data[index+1] = c >> 8
    }

    WriteLong(c: number) {
        const index = this.GetSpace(4);
        this.data[index] = c & 0xFF
        this.data[index+1] = (c >> 8) & 0xFF
        this.data[index+2] = (c >> 16) & 0xFF
        this.data[index+3] = c >> 24
    }

    Write(data: Uint8Array) {
        const index = this.GetSpace(data.byteLength);
	    for (let i = 0; i < data.byteLength; i++) {
            this.data[index + i] = data[i]
        }
    }

    WriteString(data: string) {
        const index = this.GetSpace(data.length + 1);
	    for (let i = 0; i < data.length; i++) {
            this.data[index + i] = data.charCodeAt(i)
        }
        this.data[index + data.length] = 0
    }

    WriteDeltaUsercmd(from: usercmd_t, cmd: usercmd_t) {
    
        /* Movement messages */
        let bits = 0;
    
        if (cmd.angles[0] != from.angles[0])
        {
            bits |= COMMON.CM_ANGLE1;
        }
    
        if (cmd.angles[1] != from.angles[1])
        {
            bits |= COMMON.CM_ANGLE2;
        }
    
        if (cmd.angles[2] != from.angles[2])
        {
            bits |= COMMON.CM_ANGLE3;
        }
    
        if (cmd.forwardmove != from.forwardmove)
        {
            bits |= COMMON.CM_FORWARD;
        }
    
        if (cmd.sidemove != from.sidemove)
        {
            bits |= COMMON.CM_SIDE;
        }
    
        if (cmd.upmove != from.upmove)
        {
            bits |= COMMON.CM_UP;
        }
    
        if (cmd.buttons != from.buttons)
        {
            bits |= COMMON.CM_BUTTONS;
        }
    
        if (cmd.impulse != from.impulse)
        {
            bits |= COMMON.CM_IMPULSE;
        }
    
        this.WriteByte(bits);
    
        if (bits & COMMON.CM_ANGLE1)
        {
            this.WriteShort(cmd.angles[0]);
        }
    
        if (bits & COMMON.CM_ANGLE2)
        {
            this.WriteShort(cmd.angles[1]);
        }
    
        if (bits & COMMON.CM_ANGLE3)
        {
            this.WriteShort(cmd.angles[2]);
        }
    
        if (bits & COMMON.CM_FORWARD)
        {
            this.WriteShort(cmd.forwardmove);
        }
    
        if (bits & COMMON.CM_SIDE)
        {
            this.WriteShort(cmd.sidemove);
        }
    
        if (bits & COMMON.CM_UP)
        {
            this.WriteShort(cmd.upmove);
        }
    
        if (bits & COMMON.CM_BUTTONS)
        {
            this.WriteByte(cmd.buttons);
        }
    
        if (bits & COMMON.CM_IMPULSE)
        {
            this.WriteByte(cmd.impulse);
        }
    
        this.WriteByte(cmd.msec);
        this.WriteByte(cmd.lightlevel);
    }
    

}
