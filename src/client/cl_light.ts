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
 * This file implements all client side lighting
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { cl } from "./cl_main"
import { V_AddLightStyle } from "./cl_view"


class clightstyle_t {
	length: number = 0
	value = [0,0,0]
	map = new Array<number>(SHARED.MAX_QPATH)
} ;

let cl_lightstyle = new Array<clightstyle_t>(SHARED.MAX_LIGHTSTYLES)
let lastofs = -1

export function CL_ClearLightStyles() {
    for (let i = 0; i < SHARED.MAX_LIGHTSTYLES; i++) {
        cl_lightstyle[i] = new clightstyle_t()
    }
	lastofs = -1;
}

export function CL_RunLightStyles() {

	let ofs = cl.time / 100;

	if (ofs == lastofs) {
		return;
	}

	lastofs = ofs;

	for (let i in cl_lightstyle) {
        let ls = cl_lightstyle[i]
        let value = 0
		if (!ls.length) {
            value = 1.0
		} else if (ls.length == 1) {
            value = ls.map[0]
		} else {
            value = ls.map[ofs % ls.length]
		}
        ls.value[0] = value
        ls.value[1] = value
        ls.value[2] = value
	}
}

export function CL_SetLightstyle(i: number) {

	let s = cl.configstrings[i + SHARED.CS_LIGHTS];

	cl_lightstyle[i].length = s.length;

    const scale = 'm'.charCodeAt(0) - 'a'.charCodeAt(0)
	for (let k = 0; k < s.length; k++) {
		cl_lightstyle[i].map[k] = (s.charCodeAt(k) - 'a'.charCodeAt(0)) / scale;
	}
}

export function CL_AddLightStyles() {
    for (let i = 0; i < SHARED.MAX_LIGHTSTYLES; i++) {
        V_AddLightStyle(i, cl_lightstyle[i].value[0], cl_lightstyle[i].value[1], cl_lightstyle[i].value[2])
	}
}
