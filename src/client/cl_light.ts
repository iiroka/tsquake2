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
import { cl, cls } from "./cl_main"
import { V_AddLight, V_AddLightStyle } from "./cl_view"
import { MAX_DLIGHTS } from "./ref"


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

class cdlight_t {
	key: number = 0 /* so entities can reuse same entry */
	color = [0,0,0]
	origin = [0,0,0]
	radius = 0
	die = 0 /* stop lighting after this time */
	decay = 0 /* drop this each second */
	minlight = 0 /* don't add when contributing less */
}

let cl_dlights = new Array<cdlight_t>(MAX_DLIGHTS)

export function CL_ClearDlights()
{
	for (let i = 0; i < MAX_DLIGHTS; i++) {
		cl_dlights[i] = new cdlight_t();
	}
}

export function CL_AllocDlight(key: number): cdlight_t {

	/* first look for an exact key match */
	if (key) {

		for (let i = 0; i < MAX_DLIGHTS; i++) {
			if (cl_dlights[i].key == key) {
				return cl_dlights[i];
			}
		}
	}

	/* then look for anything else */
	for (let i = 0; i < MAX_DLIGHTS; i++) {
		if (cl_dlights[i].die < cl.time) {
			cl_dlights[i].key = key;
			return cl_dlights[i];
		}
	}

	cl_dlights[0].key = key;
	return cl_dlights[0];
}

// void
// CL_NewDlight(int key, float x, float y, float z, float radius, float time)
// {
// 	cdlight_t *dl;

// 	dl = CL_AllocDlight(key);
// 	dl->origin[0] = x;
// 	dl->origin[1] = y;
// 	dl->origin[2] = z;
// 	dl->radius = radius;
// 	dl->die = cl.time + time;
// }

export function CL_RunDLights() {

	for (let i = 0; i < MAX_DLIGHTS && cl_dlights[i] != null; i++)
	{
		let dl = cl_dlights[i];
		if (!dl.radius) {
			continue;
		}

		if (dl.die < cl.time) {
			dl.radius = 0;
			continue;
		}

		dl.radius -= cls.rframetime * dl.decay;

		if (dl.radius < 0) {
			dl.radius = 0;
		}
	}
}

export function CL_AddDLights() {
	// cdlight_t *dl;

	// dl = cl_dlights;

	for (let i = 0; i < MAX_DLIGHTS; i++) {
		let dl = cl_dlights[i];
		if (!dl.radius) {
			continue;
		}

		V_AddLight(dl.origin, dl.radius, dl.color[0], dl.color[1], dl.color[2]);
	}
}

