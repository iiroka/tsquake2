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
import { HMM_MultiplyMat4, HMM_Rotate, HMM_Translate } from "./hmm";
import { imagetype_t, webglimage_t, WebGL_Bind, WebGL_FindImage } from "./webgl_image";
import { gl3state, gl3_newrefdef, gl3_origin, r_farsee } from "./webgl_main";
import { gl3_notexture } from "./webgl_misc";
import { gl3_3D_vtx_t, glpoly_t, msurface_t, webglbrushmodel_t } from "./webgl_model";
import { WebGL_UpdateUBO3D } from "./webgl_shaders";


const	SIDE_FRONT	= 0
const	SIDE_BACK	= 1
const	SIDE_ON		= 2

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

/*
 * Does a water warp on the pre-fragmented glpoly_t chain
 */
export function WebGL_EmitWaterPolys(gl: WebGL2RenderingContext, fa: msurface_t)
{
	// glpoly_t *bp;
	let scroll = 0.0;

	if (fa.texinfo.flags & SHARED.SURF_FLOWING)
	{
		scroll = -64.0 * ((gl3_newrefdef.time * 0.5) - ~~(gl3_newrefdef.time * 0.5));
		if (scroll == 0.0) // this is done in GL3_DrawGLFlowingPoly() TODO: keep?
		{
			scroll = -64.0;
		}
	}

	if(gl3state.uni3DData.scroll != scroll)
	{
		gl3state.uni3DData.scroll = scroll;
		WebGL_UpdateUBO3D(gl);
	}

	gl3state.UseProgram(gl, gl3state.si3Dturb.shaderProgram);

	gl3state.BindVAO(gl, gl3state.vao3D);
	gl3state.BindVBO(gl, gl3state.vbo3D);

	for (let bp = fa.polys; bp != null; bp = bp.next) {
        gl.bufferData( gl.ARRAY_BUFFER,  bp.data, gl.STREAM_DRAW );
        gl.drawArrays( gl.TRIANGLE_FAN, 0, bp.numverts );
	}
}


// ########### below: Sky-specific stuff ##########

const ON_EPSILON = 0.1 /* point on plane side epsilon */
const MAX_CLIP_VERTS = 64


const skytexorder = [ 0, 2, 1, 3, 4, 5 ];

let skymins = [
    [0,0,0,0,0,0],
    [0,0,0,0,0,0]
]
let skymaxs = [
    [0,0,0,0,0,0],
    [0,0,0,0,0,0]
]
let sky_min = 0
let sky_max = 0

let skyrotate = 0
let skyaxis = [0,0,0]
let sky_images = new Array<webglimage_t>(6)

/* 3dstudio environment map names */
const suf = ["rt", "bk", "lf", "ft", "up", "dn"];

const skyclip = [
	[1, 1, 0],
	[1, -1, 0],
	[0, -1, 1],
	[0, 1, 1],
	[1, 0, 1],
	[-1, 0, 1]
];
let c_sky = 0;

const st_to_vec = [
	[3, -1, 2],
	[-3, 1, 2],

	[1, 3, 2],
	[-1, -3, 2],

	[-2, -1, 3], /* 0 degrees yaw, look straight up */
	[2, -1, -3] /* look straight down */
]

const vec_to_st = [
	[-2, 3, 1],
	[2, 3, -1],

	[1, 3, 2],
	[-1, 3, -2],

	[-2, -1, 3],
	[-2, 1, -3]
]

export async function WebGL_SetSky(gl: WebGL2RenderingContext, name: string, rotate: number, axis: number[])
{
	let skyname = name;
	skyrotate = rotate;
	SHARED.VectorCopy(axis, skyaxis);

	for (let i = 0; i < 6; i++)
	{
		// NOTE: there might be a paletted .pcx version, which was only used
		//       if gl_config.palettedtexture so it *shouldn't* be relevant for he GL3 renderer
		let pathname = `env/${skyname}${suf[i]}.tga`;

		sky_images[i] = await WebGL_FindImage(gl, pathname, imagetype_t.it_sky);

		if (sky_images[i] == null || sky_images[i] == gl3_notexture)
		{
            pathname = `pics/Skies/${skyname}${suf[i]}.m8`;

            sky_images[i] = await WebGL_FindImage(gl, pathname, imagetype_t.it_sky);
		}

		if (sky_images[i] == null) {
			sky_images[i] = gl3_notexture;
		}

		sky_min = 1.0 / 512;
		sky_max = 511.0 / 512;
	}
}

function DrawSkyPolygon(nump: number, vecs: number[][])
{
	c_sky++;

	/* decide which face it maps to */
	let v = [0,0,0];

	for (let i = 0; i < nump; i++) {
		SHARED.VectorAdd(vecs[i], v, v);
	}

	let av = [ Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]) ];

	let axis = 0
	if ((av[0] > av[1]) && (av[0] > av[2])) {
		if (v[0] < 0) {
			axis = 1;
		} else {
			axis = 0;
		}
	} else if ((av[1] > av[2]) && (av[1] > av[0])) {
		if (v[1] < 0) {
			axis = 3;
		} else {
			axis = 2;
		}
	} else {
		if (v[2] < 0) {
			axis = 5;
		} else {
			axis = 4;
		}
	}

	/* project new texture coords */
	for (let i = 0; i < nump; i++) {
		let j = vec_to_st[axis][2];

		let dv = 0
		if (j > 0) {
			dv = vecs[i][j - 1];
		}  else {
			dv = -vecs[i][-j - 1];
		}

		if (dv < 0.001) {
			continue; /* don't divide by zero */
		}

		j = vec_to_st[axis][0];
		let s = 0
		if (j < 0) {
			s = -vecs[i][-j - 1] / dv;
		} else {
			s = vecs[i][j - 1] / dv;
		}

		j = vec_to_st[axis][1];
		let t = 0
		if (j < 0) {
			t = -vecs[i][-j - 1] / dv;
		} else {
			t = vecs[i][j - 1] / dv;
		}

		if (s < skymins[0][axis]) {
			skymins[0][axis] = s;
		}

		if (t < skymins[1][axis]) {
			skymins[1][axis] = t;
		}

		if (s > skymaxs[0][axis]) {
			skymaxs[0][axis] = s;
		}

		if (t > skymaxs[1][axis]) {
			skymaxs[1][axis] = t;
		}
	}
}


function ClipSkyPolygon(nump: number, vecs: number[][], stage: number)
{
	if (nump > MAX_CLIP_VERTS - 2) {
		Com_Error(SHARED.ERR_DROP, "R_ClipSkyPolygon: MAX_CLIP_VERTS");
	}

	if (stage == 6)
	{
		/* fully clipped, so draw it */
		DrawSkyPolygon(nump, vecs);
		return;
	}

	let front = false
	let back = false;
	let norm = skyclip[stage];

	let sides = new Array<number>(MAX_CLIP_VERTS);
	let dists = new Array<number>(MAX_CLIP_VERTS);
	for (let i = 0; i < nump; i++)
	{
		let d = SHARED.DotProduct(vecs[i], norm);

		if (d > ON_EPSILON) {
			front = true;
			sides[i] = SIDE_FRONT;
		}  else if (d < -ON_EPSILON) {
			back = true;
			sides[i] = SIDE_BACK;
		} else {
			sides[i] = SIDE_ON;
		}

		dists[i] = d;
	}

	if (!front || !back) {
		/* not clipped */
		ClipSkyPolygon(nump, vecs, stage + 1);
		return;
	}

	/* clip it */
	sides[nump] = sides[0];
	dists[nump] = dists[0];
	SHARED.VectorCopy(vecs[0], vecs[nump]);
	let newc = [0, 0]
	let newv = [
		new Array<number[]>(MAX_CLIP_VERTS),
		new Array<number[]>(MAX_CLIP_VERTS)
	]
	for (let i = 0; i < MAX_CLIP_VERTS; i++) {
		newv[0][i] = [0,0,0]
		newv[1][i] = [0,0,0]
	}

	for (let i = 0; i < nump; i++)
	{
		switch (sides[i])
		{
			case SIDE_FRONT:
				SHARED.VectorCopy(vecs[i], newv[0][newc[0]]);
				newc[0]++;
				break;
			case SIDE_BACK:
				SHARED.VectorCopy(vecs[i], newv[1][newc[1]]);
				newc[1]++;
				break;
			case SIDE_ON:
				SHARED.VectorCopy(vecs[i], newv[0][newc[0]]);
				newc[0]++;
				SHARED.VectorCopy(vecs[i], newv[1][newc[1]]);
				newc[1]++;
				break;
		}

		if ((sides[i] == SIDE_ON) ||
			(sides[i + 1] == SIDE_ON) ||
			(sides[i + 1] == sides[i]))
		{
			continue;
		}

		let d = dists[i] / (dists[i] - dists[i + 1]);

		for (let j = 0; j < 3; j++)
		{
			let e = vecs[i][j] + d * (vecs[i + 1][j] - vecs[i][j]);
			newv[0][newc[0]][j] = e;
			newv[1][newc[1]][j] = e;
		}

		newc[0]++;
		newc[1]++;
	}

	/* continue */
	ClipSkyPolygon(newc[0], newv[0], stage + 1);
	ClipSkyPolygon(newc[1], newv[1], stage + 1);
}


export function WebGL_AddSkySurface(fa: msurface_t)
{
	let verts = new Array<number[]>(MAX_CLIP_VERTS)
	for (let i = 0; i < MAX_CLIP_VERTS; i++) {
		verts[i] = [0,0,0]
	}

	/* calculate vertex values for sky box */
	for (let p = fa.polys; p != null; p = p.next)
	{
		for (let i = 0; i < p.numverts; i++) {
			SHARED.VectorSubtract(p.vertice(i).pos, gl3_origin, verts[i]);
		}

		ClipSkyPolygon(p.numverts, verts, 0);
	}
}


export function WebGL_ClearSkyBox() {
	for (let i = 0; i < 6; i++)
	{
		skymins[0][i] = skymins[1][i] = 9999;
		skymaxs[0][i] = skymaxs[1][i] = -9999;
	}
}

function MakeSkyVec(s: number, t: number, axis: number, vert: gl3_3D_vtx_t) {

	let dist = (r_farsee.int == 0) ? 2300.0 : 4096.0;

	let b = [s * dist, t * dist, dist];

	let v = [0,0,0]
	for (let j = 0; j < 3; j++) {
		let k = st_to_vec[axis][j];

		if (k < 0) {
			v[j] = -b[-k - 1];
		} else {
			v[j] = b[k - 1];
		}
	}

	/* avoid bilerp seam */
	s = (s + 1) * 0.5;
	t = (t + 1) * 0.5;

	if (s < sky_min)
	{
		s = sky_min;
	}
	else if (s > sky_max)
	{
		s = sky_max;
	}

	if (t < sky_min)
	{
		t = sky_min;
	}
	else if (t > sky_max)
	{
		t = sky_max;
	}

	t = 1.0 - t;

	vert.pos = v
	vert.texCoord = [s, t]
	vert.lmTexCoord = [0,0]
}

export function WebGL_DrawSkyBox(gl: WebGL2RenderingContext)
{
	if (skyrotate)
	{   /* check for no sky at all */
		let i = 0
		for (i = 0; i < 6; i++)
		{
			if ((skymins[0][i] < skymaxs[0][i]) &&
			    (skymins[1][i] < skymaxs[1][i]))
			{
				break;
			}
		}

		if (i == 6)
		{
			return; /* nothing visible */
		}
	}

	// glPushMatrix();
	let origModelMat = gl3state.uni3DData.transModelMat4;

	// glTranslatef(gl3_origin[0], gl3_origin[1], gl3_origin[2]);
	let transl = new Float32Array([gl3_origin[0], gl3_origin[1], gl3_origin[2]]);
	let modMVmat = HMM_MultiplyMat4(origModelMat, HMM_Translate(transl));
	if(skyrotate != 0.0)
	{
		// glRotatef(gl3_newrefdef.time * skyrotate, skyaxis[0], skyaxis[1], skyaxis[2]);
		let rotAxis = new Float32Array([skyaxis[0], skyaxis[1], skyaxis[2]]);
		modMVmat = HMM_MultiplyMat4(modMVmat, HMM_Rotate(gl3_newrefdef.time * skyrotate, rotAxis));
	}
	gl3state.uni3DData.transModelMat4 = modMVmat;
	WebGL_UpdateUBO3D(gl);

	gl3state.UseProgram(gl, gl3state.si3Dsky.shaderProgram);
	gl3state.BindVAO(gl, gl3state.vao3D);
	gl3state.BindVBO(gl, gl3state.vbo3D);

	// TODO: this could all be done in one drawcall.. but.. whatever, it's <= 6 drawcalls/frame

	// gl3_3D_vtx_t skyVertices[4];
	let skyVertices = new Float32Array(4 * 11)

	for (let i = 0; i < 6; i++)
	{
		if (skyrotate != 0.0)
		{
			skymins[0][i] = -1;
			skymins[1][i] = -1;
			skymaxs[0][i] = 1;
			skymaxs[1][i] = 1;
		}

		if ((skymins[0][i] >= skymaxs[0][i]) ||
		    (skymins[1][i] >= skymaxs[1][i]))
		{
			continue;
		}

		WebGL_Bind(gl, sky_images[skytexorder[i]].tex);

		MakeSkyVec( skymins [ 0 ] [ i ], skymins [ 1 ] [ i ], i, new gl3_3D_vtx_t(skyVertices, 0 * 11) );
		MakeSkyVec( skymins [ 0 ] [ i ], skymaxs [ 1 ] [ i ], i, new gl3_3D_vtx_t(skyVertices, 1 * 11) );
		MakeSkyVec( skymaxs [ 0 ] [ i ], skymaxs [ 1 ] [ i ], i, new gl3_3D_vtx_t(skyVertices, 2 * 11) );
		MakeSkyVec( skymaxs [ 0 ] [ i ], skymins [ 1 ] [ i ], i, new gl3_3D_vtx_t(skyVertices, 3 * 11) );

		gl.bufferData( gl.ARRAY_BUFFER,  skyVertices, gl.STREAM_DRAW );
		gl.drawArrays( gl.TRIANGLE_FAN, 0, 4 );
	}

	// glPopMatrix();
	gl3state.uni3DData.transModelMat4 = origModelMat;
	WebGL_UpdateUBO3D(gl);
}
