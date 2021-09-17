/*
 * Copyright (C) 1997-2001 Id Software, Inc.
 * Copyright (C) 2016-2017 Daniel Gibson
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
 * Warps. Used on water surfaces und for skybox rotation.
 *
 * =======================================================================
 */
import { Com_Error } from "../../common/clientserver";
import * as SHARED from "../../common/shared"
import { glpoly_t, msurface_t, webglbrushmodel_t } from "./webgl_model";


function R_BoundPoly(numverts: number, verts: number[][], mins: number[], maxs: number[]) {

	mins = [9999, 9999, 9999]
	maxs = [-9999, -9999, -9999]

	for (let i = 0; i < numverts; i++) {
		for (let j = 0; j < 3; j++) {
			if (verts[i][j] < mins[j]) {
				mins[j] = verts[i][j];
			}

			if (verts[i][j] > maxs[j]) {
				maxs[j] = verts[i][j];
			}
		}
	}
}

const SUBDIVIDE_SIZE = 64.0

function R_SubdividePolygon(numverts: number, verts: number[][], warpface: msurface_t) {

    let normal = [0,0,0]
	SHARED.VectorCopy(warpface.plane.normal, normal);

	if (numverts > 60) {
		Com_Error(SHARED.ERR_DROP, `numverts = ${numverts}`);
	}

    let mins = [0,0,0]
    let maxs = [0,0,0]
	R_BoundPoly(numverts, verts, mins, maxs);

    let dist  = new Array<number>(64)
    let front  = new Array<number[]>(64)
    let back  = new Array<number[]>(64)
	for (let i = 0; i < 64; i++) {
        front[i] = [0,0,0]
        back[i] = [0,0,0]
    }

	for (let i = 0; i < 3; i++) {
		let m = (mins[i] + maxs[i]) * 0.5;
		m = SUBDIVIDE_SIZE * Math.floor(m / SUBDIVIDE_SIZE + 0.5);

		if (maxs[i] - m < 8) {
			continue;
		}

		if (m - mins[i] < 8) {
			continue;
		}

		/* cut it */
		for (let j = 0; j < numverts; j++) {
			dist[j] = verts[j][i] - m;
		}

		/* wrap cases */
		dist[numverts] = dist[0];
		SHARED.VectorCopy(verts[0], verts[numverts]);

		let f = 0
        let b = 0

		for (let j = 0; j < numverts; j++)
		{
			if (dist[j] >= 0)
			{
				SHARED.VectorCopy(verts[j], front[f]);
				f++;
			}

			if (dist[j] <= 0)
			{
				SHARED.VectorCopy(verts[j], back[b]);
				b++;
			}

			if ((dist[j] == 0) || (dist[j + 1] == 0))
			{
				continue;
			}

			if ((dist[j] > 0) != (dist[j + 1] > 0))
			{
				/* clip point */
				let frac = dist[j] / (dist[j] - dist[j + 1]);

				for (let k = 0; k < 3; k++) {
					front[f][k] = back[b][k] = verts[j][k] + frac * (verts[j+1][k] - verts[j][k]);
				}

				f++;
				b++;
			}
		}

		R_SubdividePolygon(f, front, warpface);
		R_SubdividePolygon(b, back, warpface);
		return;
	}

	/* add a point in the center to help keep warp valid */
    let poly = new glpoly_t(numverts + 2)
	poly.next = warpface.polys;
	warpface.polys = poly;
	poly.numverts = numverts + 2;
	let total = [0,0,0];
	let total_s = 0;
	let total_t = 0;

	for (let i = 0; i < numverts; i++) {
        let v = poly.vertice(i + 1)
        v.pos = verts[i]
		let s = SHARED.DotProduct(verts[i], warpface.texinfo.vecs[0]);
		let t = SHARED.DotProduct(verts[i], warpface.texinfo.vecs[1]);

		total_s += s;
		total_t += t;
		SHARED.VectorAdd(total, verts[i], total);

		v.texCoord = [s, t];
		v.normal = normal;
		v.lightFlags = 0;
	}

    let v = poly.vertice(0)
    let pos = [0,0,0]
	SHARED.VectorScale(total, (1.0 / numverts), pos);
    v.pos = pos
    v.texCoord = [total_s / numverts, total_t / numverts]
    v.normal = normal;

	/* copy first vertex to last */
    v = poly.vertice(numverts + 1)
    v.pos = pos
    v.texCoord = [total_s / numverts, total_t / numverts]
    v.normal = normal;
}

/*
 * Breaks a polygon up along axial 64 unit
 * boundaries so that turbulent and sky warps
 * can be done reasonably.
 */
export function WebGL_SubdivideSurface(fa: msurface_t, loadmodel: webglbrushmodel_t) {

	/* convert edges back to a normal polygon */
	let numverts = 0;
    let verts  = new Array<number[]>(64)
	for (let i = 0; i < 64; i++) {
        verts[i] = [0,0,0]
    }

	for (let i = 0; i < fa.numedges; i++)
	{
		let lindex = loadmodel.surfedges[fa.firstedge + i];

        let vec: number[]
		if (lindex > 0) {
			vec = loadmodel.vertexes[loadmodel.edges[lindex].v[0]].position;
		} else {
			vec = loadmodel.vertexes[loadmodel.edges[-lindex].v[1]].position;
		}

		SHARED.VectorCopy(vec, verts[numverts]);
		numverts++;
	}

	R_SubdividePolygon(numverts, verts, fa);
}
