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
 * The PVS Decompress
 *
 * =======================================================================
 */
import { MAX_MAP_LEAFS } from "../../common/filesystem";
import * as SHARED from "../../common/shared"

/*
===================
Mod_DecompressVis
===================
*/
export function Mod_DecompressVis(ind: Uint8Array, ini: number, row: number): Uint8Array {
	// YQ2_ALIGNAS_TYPE(int) static byte decompressed[MAX_MAP_LEAFS / 8];
	// int c;
	// byte *out;

	// out = decompressed;
	let decompressed = new Uint8Array(MAX_MAP_LEAFS/8);

	if (ind == null) {
		/* no vis info, so make all visible */
		for (let i = 0; i < row; i++) {
			decompressed[i] = 0xff;
		}

		return decompressed;
	}

	let index = 0
	do
	{
		if (ind[ini]) {
			decompressed[index++] = ind[ini++]
			continue;
		}

		let c = ind[ini+1];
		ini += 2;

		while (c > 0) {
			decompressed[index++] = 0;
			c--;
		}
	} while (index < row);

	return decompressed;
}

export function Mod_RadiusFromBounds(mins: number[], maxs: number[]): number {

    let corner = [0,0,0]
	for (let i = 0; i < 3; i++) {
		corner[i] = Math.abs(mins[i]) > Math.abs(maxs[i]) ? Math.abs(mins[i]) : Math.abs(maxs[i]);
	}

	return SHARED.VectorLength(corner);
}
