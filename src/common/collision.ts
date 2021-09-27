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
 * The collision model. Slaps "boxes" through the world and checks if
 * they collide with the world model, entities or other boxes.
 *
 * =======================================================================
 */
import * as FS from "./filesystem";
import * as SHARED from "./shared"
import { Com_Error } from "./clientserver";
import { Cvar_Get, Cvar_VariableBool } from "./cvar";

class cnode_t {
	plane: SHARED.cplane_t
	children = [0,0]; /* negative numbers are leafs */
}

class cbrushside_t {
	plane: SHARED.cplane_t
	surface: SHARED.mapsurface_t
}

class cleaf_t {
	contents = 0
	cluster = 0
	area = 0
	firstleafbrush = 0
	numleafbrushes = 0
}

class cbrush_t {
	contents = 0
	numsides = 0
	firstbrushside = 0
	checkcount = 0	/* to avoid repeated testings */
}

class carea_t {
	numareaportals = 0
	firstareaportal = 0
	floodnum = 0 /* if two areas have equal floodnums, they are connected */
	floodvalid = 0
}

// byte *cmod_base;
let map_visibility: Uint8Array
// DG: is casted to int32_t* in SV_FatPVS() so align accordingly
// static YQ2_ALIGNAS_TYPE(int32_t) byte pvsrow[MAX_MAP_LEAFS / 8];
// byte phsrow[MAX_MAP_LEAFS / 8];
let map_areas: carea_t[];
let map_brushes: cbrush_t[];
let map_brushsides: cbrushside_t[];
let map_name: string = ""
let map_entitystring: string = ""
let box_brush: cbrush_t = null
let box_leaf: cleaf_t = null
let map_leafs: cleaf_t[]; 
let map_cmodels: SHARED.cmodel_t[]; 
let map_nodes: cnode_t[];   /* extra for box hull */
let box_planes: SHARED.cplane_t[] = null
let map_planes: SHARED.cplane_t[];   /* extra for box hull */
let map_noareas: SHARED.cvar_t
let map_areaportals: FS.dareaportal_t[]; 
// dvis_t *map_vis = (dvis_t *)map_visibility;
let box_headnode = 0;
let checkcount = 0
let emptyleaf = 0
let solidleaf = 0
let floodvalid = 0
let leaf_mins: number[] = null
let leaf_maxs: number[] = null
let leaf_count = 0
let leaf_maxcount = 0
let leaf_list: number[] = null
let leaf_topnode = 0
let numareaportals = 0
let numareas = 1
let numbrushes = 0
let numbrushsides = 0
let numclusters = 1;
let numcmodels = 0
let numentitychars = 0
let numleafbrushes = 0
let numleafs = 1 /* allow leaf funcs to be called without a map */
let numnodes = 0
let numplanes = 0
let numtexinfo = 0
let numvisibility = 0
let trace_contents = 0
let map_surfaces: SHARED.mapsurface_t[]
let nullsurface = new SHARED.mapsurface_t()
let portalopen: boolean[]
let trace_ispoint = false /* optimized case */
let trace_trace = new SHARED.trace_t()
let map_leafbrushes: Uint16Array
let trace_start = [0,0,0]
let trace_end = [0,0,0]
let trace_mins = [0,0,0]
let trace_maxs = [0,0,0]
let trace_extents = [0,0,0]


/* 1/32 epsilon to keep floating point happy */
const DIST_EPSILON  = 0.03125

export function COLL_Init() {
    map_visibility = new Uint8Array(FS.MAX_MAP_VISIBILITY)
    map_areas = new Array<carea_t>(FS.MAX_MAP_AREAS);
    for (let i = 0; i < FS.MAX_MAP_AREAS; i++) {
        map_areas[i] = new carea_t();
    }
    map_brushes = new Array<cbrush_t>(FS.MAX_MAP_BRUSHES);
    for (let i = 0; i < FS.MAX_MAP_BRUSHES; i++) {
        map_brushes[i] = new cbrush_t();
    }
    map_brushsides = new Array<cbrushside_t>(FS.MAX_MAP_BRUSHSIDES);
    for (let i = 0; i < FS.MAX_MAP_BRUSHSIDES; i++) {
        map_brushsides[i] = new cbrushside_t();
    }
    map_leafs = new Array<cleaf_t>(FS.MAX_MAP_LEAFS);     
    for (let i = 0; i < FS.MAX_MAP_LEAFS; i++) {
        map_leafs[i] = new cleaf_t();
    }
    map_cmodels = new Array<SHARED.cmodel_t>(FS.MAX_MAP_MODELS); 
    for (let i = 0; i < FS.MAX_MAP_MODELS; i++) {
        map_cmodels[i] = new SHARED.cmodel_t();
    }
    map_nodes = new Array<cnode_t>(FS.MAX_MAP_NODES + 6);   /* extra for box hull */
    for (let i = 0; i < FS.MAX_MAP_NODES+6; i++) {
        map_nodes[i] = new cnode_t();
    }
    map_planes = new Array<SHARED.cplane_t>(FS.MAX_MAP_PLANES + 6);   /* extra for box hull */
    for (let i = 0; i < FS.MAX_MAP_PLANES+6; i++) {
        map_planes[i] = new SHARED.cplane_t();
    }
    map_areaportals = new Array<FS.dareaportal_t>(FS.MAX_MAP_AREAPORTALS); 
    // for (let i = 0; i < FS.MAX_MAP_AREAPORTALS+6; i++) {
    //     map_areaportals[i] = new FS.dareaportal_t();
    // }
    map_surfaces = new Array<SHARED.mapsurface_t>(FS.MAX_MAP_TEXINFO)
    for (let i = 0; i < FS.MAX_MAP_TEXINFO; i++) {
        map_surfaces[i] = new SHARED.mapsurface_t();
    }
    portalopen = new Array<boolean>(FS.MAX_MAP_AREAPORTALS)
    map_leafbrushes = new Uint16Array(FS.MAX_MAP_LEAFBRUSHES)
    
}

function FloodArea_r(area: carea_t, floodnum: number) {
	// int i;
	// dareaportal_t *p;

	if (area.floodvalid == floodvalid)
	{
		if (area.floodnum == floodnum)
		{
			return;
		}

		Com_Error(SHARED.ERR_DROP, "FloodArea_r: reflooded");
	}

	area.floodnum = floodnum;
	area.floodvalid = floodvalid;

	for (let i = 0; i < area.numareaportals; i++)
	{
		let p = map_areaportals[area.firstareaportal + i];
		if (portalopen[p.portalnum])
		{
			FloodArea_r(map_areas[p.otherarea], floodnum);
		}
	}
}

function FloodAreaConnections()
{
	// int i;
	// carea_t *area;
	// int floodnum;

	/* all current floods are now invalid */
	floodvalid++;
	let floodnum = 0;

	/* area 0 is not used */
	for (let i = 1; i < numareas; i++)
	{
		let area = map_areas[i];

		if (area.floodvalid == floodvalid)
		{
			continue; /* already flooded into */
		}

		floodnum++;
		FloodArea_r(area, floodnum);
	}
}


/*
 * Set up the planes and nodes so that the six floats of a bounding box
 * can just be stored out and get a proper clipping hull structure.
 */
function CM_InitBoxHull() {

	box_headnode = numnodes;
	box_planes = map_planes.slice(numplanes);

	if ((numnodes + 6 > FS.MAX_MAP_NODES) ||
		(numbrushes + 1 > FS.MAX_MAP_BRUSHES) ||
		(numleafbrushes + 1 > FS.MAX_MAP_LEAFBRUSHES) ||
		(numbrushsides + 6 > FS.MAX_MAP_BRUSHSIDES) ||
		(numplanes + 12 > FS.MAX_MAP_PLANES))
	{
		Com_Error(SHARED.ERR_DROP, "Not enough room for box tree");
	}

	box_brush = map_brushes[numbrushes];
	box_brush.numsides = 6;
	box_brush.firstbrushside = numbrushsides;
	box_brush.contents = SHARED.CONTENTS_MONSTER;

	box_leaf = map_leafs[numleafs];
	box_leaf.contents = SHARED.CONTENTS_MONSTER;
	box_leaf.firstleafbrush = numleafbrushes;
	box_leaf.numleafbrushes = 1;

	map_leafbrushes[numleafbrushes] = numbrushes;

	for (let i = 0; i < 6; i++)
	{
		let side = i & 1;

		/* brush sides */
		let s = map_brushsides[numbrushsides + i];
		s.plane = map_planes[numplanes + i * 2 + side];
		s.surface = nullsurface;

		/* nodes */
		let c = map_nodes[box_headnode + i];
		c.plane = map_planes[numplanes + i * 2];
		c.children[side] = -1 - emptyleaf;

		if (i != 5)
		{
			c.children[side ^ 1] = box_headnode + i + 1;
		}

		else
		{
			c.children[side ^ 1] = -1 - numleafs;
		}

		/* planes */
		let p = box_planes[i * 2];
		p.type = i >> 1;
		p.signbits = 0;
		p.normal = [0,0,0]
		p.normal[i >> 1] = 1;

		p = box_planes[i * 2 + 1];
		p.type = 3 + (i >> 1);
		p.signbits = 0;
        p.normal = [0,0,0]
		p.normal[i >> 1] = -1;
	}
}

/*
 * To keep everything totally uniform, bounding boxes are turned into
 * small BSP trees instead of being compared directly.
 */
function CM_HeadnodeForBox(mins: number[], maxs: number[]): number
{
	box_planes[0].dist = maxs[0];
	box_planes[1].dist = -maxs[0];
	box_planes[2].dist = mins[0];
	box_planes[3].dist = -mins[0];
	box_planes[4].dist = maxs[1];
	box_planes[5].dist = -maxs[1];
	box_planes[6].dist = mins[1];
	box_planes[7].dist = -mins[1];
	box_planes[8].dist = maxs[2];
	box_planes[9].dist = -maxs[2];
	box_planes[10].dist = mins[2];
	box_planes[11].dist = -mins[2];

	return box_headnode;
}


function CM_PointLeafnum_r(p: number[], num: number): number {

	while (num >= 0) {
		let node = map_nodes[num];
		let plane = node.plane;

        let d = 0
		if (plane.type < 3)
		{
			d = p[plane.type] - plane.dist;
		}

		else
		{
			d = SHARED.DotProduct(plane.normal, p) - plane.dist;
		}

		if (d < 0)
		{
			num = node.children[1];
		}

		else
		{
			num = node.children[0];
		}
	}

// #ifndef DEDICATED_ONLY
// 	c_pointcontents++; /* optimize counter */
// #endif

	return -1 - num;
}

export function CM_PointLeafnum(p: number[]): number
{
	if (!numplanes) {
		return 0; /* sound may call this without map loaded */
	}

	return CM_PointLeafnum_r(p, 0);
}

/*
 * Fills in a list of all the leafs touched
 */

function CM_BoxLeafnums_r(nodenum: number)
{
	// cplane_t *plane;
	// cnode_t *node;
	// int s;

	while (true) {
		if (nodenum < 0)
		{
			if (leaf_count >= leaf_maxcount)
			{
				return;
			}

			leaf_list[leaf_count++] = -1 - nodenum;
			return;
		}

		let node = map_nodes[nodenum];
		let plane = node.plane;
		let s = SHARED.BoxOnPlaneSide(leaf_mins, leaf_maxs, plane);

		if (s == 1)
		{
			nodenum = node.children[0];
		}

		else if (s == 2)
		{
			nodenum = node.children[1];
		}

		else
		{
			/* go down both */
			if (leaf_topnode == -1)
			{
				leaf_topnode = nodenum;
			}

			CM_BoxLeafnums_r(node.children[0]);
			nodenum = node.children[1];
		}
	}
}

function CM_BoxLeafnums_headnode(mins: number[], maxs: number[], list: number[],
		listsize: number, headnode: number, topnode: number[]): number {
	leaf_list = list;
	leaf_count = 0;
	leaf_maxcount = listsize;
	leaf_mins = mins;
	leaf_maxs = maxs;

	leaf_topnode = -1;

	CM_BoxLeafnums_r(headnode);

	if (topnode) {
		topnode[0] = leaf_topnode;
	}

	return leaf_count;
}


export function CM_BoxLeafnums(mins: number[], maxs: number[], list: number[], listsize: number, topnode: number[])
{
	return CM_BoxLeafnums_headnode(mins, maxs, list,
			listsize, map_cmodels[0].headnode, topnode);
}


export function CM_PointContents(p: number[], headnode: number) {

	if (!numnodes) { /* map not loaded */
		return 0;
	}

	let l = CM_PointLeafnum_r(p, headnode);

	return map_leafs[l].contents;
}

/*
 * Handles offseting and rotation of the end points for moving and
 * rotating entities
 */
export function CM_TransformedPointContents(p: number[], headnode: number,
		origin: number[], angles: number[]): number
{
	/* subtract origin offset */
    let p_l = [0,0,0]
	SHARED.VectorSubtract(p, origin, p_l);

	/* rotate start and end into the models frame of reference */
	if ((headnode != box_headnode) &&
		(angles[0] || angles[1] || angles[2]))
	{
        let forward = [0,0,0]
        let right = [0,0,0]
        let up = [0,0,0]
		SHARED.AngleVectors(angles, forward, right, up);

        let temp = [0,0,0]
		SHARED.VectorCopy(p_l, temp);
		p_l[0] = SHARED.DotProduct(temp, forward);
		p_l[1] = -SHARED.DotProduct(temp, right);
		p_l[2] = SHARED.DotProduct(temp, up);
	}

	let l = CM_PointLeafnum_r(p_l, headnode);

	return map_leafs[l].contents;
}

function CM_ClipBoxToBrush(mins: number[], maxs: number[], p1: number[],
		p2: number[], trace: SHARED.trace_t, brush: cbrush_t)
{
	let enterfrac = -1;
	let leavefrac = 1;
	let clipplane: SHARED.cplane_t = null;

	if (!brush.numsides) {
		return;
	}

// #ifndef DEDICATED_ONLY
// 	c_brush_traces++;
// #endif

	let getout = false;
	let startout = false;
	let leadside: cbrushside_t = null;

	for (let i = 0; i < brush.numsides; i++)
	{
		let side = map_brushsides[brush.firstbrushside + i];
		let plane = side.plane;
		let dist = 0

		if (!trace_ispoint)
		{
			/* general box case
			   push the plane out
			   apropriately for mins/maxs */
			let ofs = [0,0,0]
			for (let j = 0; j < 3; j++)
			{
				if (plane.normal[j] < 0)
				{
					ofs[j] = maxs[j];
				}

				else
				{
					ofs[j] = mins[j];
				}
			}

			dist = SHARED.DotProduct(ofs, plane.normal);
			dist = plane.dist - dist;
		}

		else
		{
			/* special point case */
			dist = plane.dist;
		}

		let d1 = SHARED.DotProduct(p1, plane.normal) - dist;
		let d2 = SHARED.DotProduct(p2, plane.normal) - dist;

		if (d2 > 0)
		{
			getout = true; /* endpoint is not in solid */
		}

		if (d1 > 0)
		{
			startout = true;
		}

		/* if completely in front of face, no intersection */
		if ((d1 > 0) && (d2 >= d1))
		{
			return;
		}

		if ((d1 <= 0) && (d2 <= 0))
		{
			continue;
		}

		/* crosses face */
		if (d1 > d2)
		{
			/* enter */
			let f = (d1 - DIST_EPSILON) / (d1 - d2);

			if (f > enterfrac)
			{
				enterfrac = f;
				clipplane = plane;
				leadside = side;
			}
		}

		else
		{
			/* leave */
			let f = (d1 + DIST_EPSILON) / (d1 - d2);

			if (f < leavefrac) {
				leavefrac = f;
			}
		}
	}

	if (!startout)
	{
		/* original point was inside brush */
		trace.startsolid = true;

		if (!getout)
		{
			trace.allsolid = true;
		}

		return;
	}

	if (enterfrac < leavefrac)
	{
		if ((enterfrac > -1) && (enterfrac < trace.fraction))
		{
			if (enterfrac < 0)
			{
				enterfrac = 0;
			}

			if (clipplane == null)
			{
				Com_Error(SHARED.ERR_FATAL, "clipplane was NULL!\n");
			}

			trace.fraction = enterfrac;
			trace.plane.copy(clipplane);
			trace.surface = leadside.surface.c;
			trace.contents = brush.contents;
		}
	}
}

function CM_TestBoxInBrush(mins: number[], maxs: number[], p1: number[],
		trace: SHARED.trace_t, brush: cbrush_t)
{
	if (!brush.numsides)
	{
		return;
	}

	for (let i = 0; i < brush.numsides; i++)
	{
		let side = map_brushsides[brush.firstbrushside + i];
		let plane = side.plane;

		/* general box case
		   push the plane out
		   apropriately for mins/maxs */
        let ofs = [0,0,0]
		for (let j = 0; j < 3; j++)
		{
			if (plane.normal[j] < 0)
			{
				ofs[j] = maxs[j];
			}

			else
			{
				ofs[j] = mins[j];
			}
		}

		let dist = SHARED.DotProduct(ofs, plane.normal);
		dist = plane.dist - dist;

		let d1 = SHARED.DotProduct(p1, plane.normal) - dist;

		/* if completely in front of face, no intersection */
		if (d1 > 0)
		{
			return;
		}
	}

	/* inside this brush */
	trace.startsolid = trace.allsolid = true;
	trace.fraction = 0;
	trace.contents = brush.contents;
}

function CM_TraceToLeaf(leafnum: number)
{
	// int k;
	// int brushnum;
	// cleaf_t *leaf;
	// cbrush_t *b;

	let leaf = map_leafs[leafnum];

	if (!(leaf.contents & trace_contents))
	{
		return;
	}

	/* trace line against all brushes in the leaf */
	for (let k = 0; k < leaf.numleafbrushes; k++)
	{
		let brushnum = map_leafbrushes[leaf.firstleafbrush + k];
		let b = map_brushes[brushnum];

		if (b.checkcount == checkcount)
		{
			continue; /* already checked this brush in another leaf */
		}

		b.checkcount = checkcount;

		if (!(b.contents & trace_contents))
		{
			continue;
		}

		CM_ClipBoxToBrush(trace_mins, trace_maxs, trace_start, trace_end, trace_trace, b);

		if (!trace_trace.fraction)
		{
			return;
		}
	}
}

function CM_TestInLeaf(leafnum: number)
{
	let leaf = map_leafs[leafnum];

	if (!(leaf.contents & trace_contents))
	{
		return;
	}

	/* trace line against all brushes in the leaf */
	for (let k = 0; k < leaf.numleafbrushes; k++)
	{
		let brushnum = map_leafbrushes[leaf.firstleafbrush + k];
		let b = map_brushes[brushnum];

		if (b.checkcount == checkcount)
		{
			continue; /* already checked this brush in another leaf */
		}

		b.checkcount = checkcount;

		if (!(b.contents & trace_contents))
		{
			continue;
		}

		CM_TestBoxInBrush(trace_mins, trace_maxs, trace_start, trace_trace, b);

		if (!trace_trace.fraction)
		{
			return;
		}
	}
}

function CM_RecursiveHullCheck(num: number, p1f: number, p2f: number, p1: number[], p2: number[])
{

	if (trace_trace.fraction <= p1f)
	{
		return; /* already hit something nearer */
	}

	/* if < 0, we are in a leaf node */
	if (num < 0)
	{
		CM_TraceToLeaf(-1 - num);
		return;
	}

	/* find the point distances to the seperating plane
	   and the offset for the size of the box */
	let node = map_nodes[num];
	let plane = node.plane;

    let t1 = 0
    let t2 = 0
    let offset = 0
	if (plane.type < 3)
	{
		t1 = p1[plane.type] - plane.dist;
		t2 = p2[plane.type] - plane.dist;
		offset = trace_extents[plane.type];
	}

	else
	{
		t1 = SHARED.DotProduct(plane.normal, p1) - plane.dist;
		t2 = SHARED.DotProduct(plane.normal, p2) - plane.dist;

		if (trace_ispoint) {
			offset = 0;
		}

		else
		{
			offset = Math.abs(trace_extents[0] * plane.normal[0]) +
                    Math.abs(trace_extents[1] * plane.normal[1]) +
                    Math.abs(trace_extents[2] * plane.normal[2]);
		}
	}

	/* see which sides we need to consider */
	if ((t1 >= offset) && (t2 >= offset))
	{
		CM_RecursiveHullCheck(node.children[0], p1f, p2f, p1, p2);
		return;
	}

	if ((t1 < -offset) && (t2 < -offset))
	{
		CM_RecursiveHullCheck(node.children[1], p1f, p2f, p1, p2);
		return;
	}

	/* put the crosspoint DIST_EPSILON pixels on the near side */
    let side = 0
    let frac = 1
    let frac2 = 0
	if (t1 < t2)
	{
		let idist = 1.0 / (t1 - t2);
		side = 1;
		frac2 = (t1 + offset + DIST_EPSILON) * idist;
		frac = (t1 - offset + DIST_EPSILON) * idist;
	}

	else if (t1 > t2)
	{
		let idist = 1.0 / (t1 - t2);
		side = 0;
		frac2 = (t1 - offset - DIST_EPSILON) * idist;
		frac = (t1 + offset + DIST_EPSILON) * idist;
	}

	/* move up to the node */
	if (frac < 0)
	{
		frac = 0;
	}

	if (frac > 1)
	{
		frac = 1;
	}

	let midf = p1f + (p2f - p1f) * frac;

    let mid = [0,0,0]
	for (let i = 0; i < 3; i++)
	{
		mid[i] = p1[i] + frac * (p2[i] - p1[i]);
	}

	CM_RecursiveHullCheck(node.children[side], p1f, midf, p1, mid);

	/* go past the node */
	if (frac2 < 0)
	{
		frac2 = 0;
	}

	if (frac2 > 1)
	{
		frac2 = 1;
	}

	midf = p1f + (p2f - p1f) * frac2;

	for (let i = 0; i < 3; i++)
	{
		mid[i] = p1[i] + frac2 * (p2[i] - p1[i]);
	}

	CM_RecursiveHullCheck(node.children[side ^ 1], midf, p2f, mid, p2);
}


export function CM_BoxTrace(start: number[], end: number[], mins: number[], maxs: number[],
		headnode: number, brushmask: number): SHARED.trace_t
{
	checkcount++; /* for multi-check avoidance */

// #ifndef DEDICATED_ONLY
// 	c_traces++; /* for statistics, may be zeroed */
// #endif

	/* fill in a default trace */
    trace_trace = new SHARED.trace_t()
	trace_trace.fraction = 1;
	trace_trace.surface = nullsurface.c;

	if (!numnodes)  /* map not loaded */
	{
		return trace_trace;
	}

	trace_contents = brushmask;
	SHARED.VectorCopy(start, trace_start);
	SHARED.VectorCopy(end, trace_end);
	SHARED.VectorCopy(mins, trace_mins);
	SHARED.VectorCopy(maxs, trace_maxs);

	/* check for position test special case */
	if ((start[0] == end[0]) && (start[1] == end[1]) && (start[2] == end[2]))
	{
        let c1 = [0,0,0]
        SHARED.VectorAdd(start, mins, c1);
        let c2 = [0,0,0]
		SHARED.VectorAdd(start, maxs, c2);

		for (let i = 0; i < 3; i++)
		{
			c1[i] -= 1;
			c2[i] += 1;
		}

        let leafs = new Array<number>(1024);
        let topnode = [0]
		numleafs = CM_BoxLeafnums_headnode(c1, c2, leafs, 1024, headnode, topnode);

		for (let i = 0; i < numleafs; i++) {
			CM_TestInLeaf(leafs[i]);

			if (trace_trace.allsolid)
			{
				break;
			}
		}

		SHARED.VectorCopy(start, trace_trace.endpos);
		return trace_trace;
	}

	// /* check for point special case */
	if ((mins[0] == 0) && (mins[1] == 0) && (mins[2] == 0) &&
		(maxs[0] == 0) && (maxs[1] == 0) && (maxs[2] == 0))
	{
		trace_ispoint = true;
        trace_extents = [0,0,0]
	}

	else
	{
		trace_ispoint = false;
		trace_extents[0] = -mins[0] > maxs[0] ? -mins[0] : maxs[0];
		trace_extents[1] = -mins[1] > maxs[1] ? -mins[1] : maxs[1];
		trace_extents[2] = -mins[2] > maxs[2] ? -mins[2] : maxs[2];
	}

	/* general sweeping through world */
	CM_RecursiveHullCheck(headnode, 0, 1, start, end);

	if (trace_trace.fraction == 1) {
		SHARED.VectorCopy(end, trace_trace.endpos);
	}

	else
	{
		for (let i = 0; i < 3; i++)
		{
			trace_trace.endpos[i] = start[i] + trace_trace.fraction * (end[i] - start[i]);
		}
	}

	return trace_trace;
}

function CMod_LoadSubmodels(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.dmodel_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadSubmodels: funny lump size");
	}

	let count = l.filelen / FS.dmodel_size;

	if (count < 1)
	{
		Com_Error(SHARED.ERR_DROP, "Map with no models");
	}

	if (count > FS.MAX_MAP_MODELS)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many models");
	}

	numcmodels = count;


	for (let i = 0; i < count; i++)
	{
        let src = new FS.dmodel_t(view, l.fileofs + i * FS.dmodel_size);
        let out = map_cmodels[i];

		for (let j = 0; j < 3; j++)
		{
			/* spread the mins / maxs by a pixel */
			out.mins[j] = src.mins[j] - 1;
			out.maxs[j] = src.maxs[j] + 1;
			out.origin[j] = src.origin[j];
		}

		out.headnode = src.headnode;
	}
}

function CMod_LoadSurfaces(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.texinfo_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadSurfaces: funny lump size");
	}

	let count = l.filelen / FS.texinfo_size;

	if (count < 1)
	{
		Com_Error(SHARED.ERR_DROP, "Map with no surfaces");
	}

	if (count > FS.MAX_MAP_TEXINFO)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many surfaces");
	}

	numtexinfo = count;


	for (let i = 0; i < count; i++)
	{
        let src = new FS.texinfo_t(view, l.fileofs + i * FS.texinfo_size);
        let out = map_surfaces[i];

		out.c.name = src.texture;
		out.rname = src.texture;
		out.c.flags = src.flags;
		out.c.value = src.value;
	}
}

function CMod_LoadNodes(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.dnode_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadNodes: funny lump size");
	}

	let count = l.filelen / FS.dnode_size;

	if (count < 1)
	{
		Com_Error(SHARED.ERR_DROP, "Map with no nodes");
	}

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_NODES)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many nodes");
	}

	numnodes = count;


	for (let i = 0; i < count; i++)
	{
        let src = new FS.dnode_t(view, l.fileofs + i * FS.dnode_size);
        let out = map_nodes[i];

		out.plane = map_planes[src.planenum];

		for (let j = 0; j < 2; j++)
		{
			let child = src.children[j];
			out.children[j] = child;
		}
	}
}

function CMod_LoadBrushes(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.dbrush_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadBrushes: funny lump size");
	}

	let count = l.filelen / FS.dbrush_size;

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_BRUSHES)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many brushes");
	}

	numbrushes = count;

	for (let i = 0; i < count; i++)
	{
        let src = new FS.dbrush_t(view, l.fileofs + i * FS.dbrush_size);
        let out = map_brushes[i];

		out.firstbrushside = src.firstside;
		out.numsides = src.numsides;
		out.contents = src.contents;
	}
}


function CMod_LoadLeafs(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.dleaf_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadLeafs: funny lump size");
	}

	let count = l.filelen / FS.dleaf_size;

	if (count < 1)
	{
		Com_Error(SHARED.ERR_DROP, "Map with no leafs");
	}

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_PLANES)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many planes");
	}

	// out = map_leafs;
	numleafs = count;
	numclusters = 0;

	for (let i = 0; i < count; i++)
	{
        let src = new FS.dleaf_t(view, l.fileofs + i * FS.dleaf_size);
        let out = map_leafs[i];
		out.contents = src.contents;
		out.cluster = src.cluster;
		out.area = src.area;
		out.firstleafbrush = src.firstleafbrush;
		out.numleafbrushes = src.numleafbrushes;

		if (out.cluster >= numclusters) {
			numclusters = out.cluster + 1;
		}
	}

	if (map_leafs[0].contents != SHARED.CONTENTS_SOLID)
	{
		Com_Error(SHARED.ERR_DROP, "Map leaf 0 is not CONTENTS_SOLID");
	}

	solidleaf = 0;
	emptyleaf = -1;

	for (let i = 1; i < numleafs; i++)
	{
		if (!map_leafs[i].contents)
		{
			emptyleaf = i;
			break;
		}
	}

	if (emptyleaf == -1)
	{
		Com_Error(SHARED.ERR_DROP, "Map does not have an empty leaf");
	}
}

function CMod_LoadPlanes(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.dplane_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadPlanes: funny lump size");
	}

	let count = l.filelen / FS.dplane_size;

	if (count < 1)
	{
		Com_Error(SHARED.ERR_DROP, "Map with no planes");
	}

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_PLANES)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many planes");
	}

	numplanes = count;

	for (let i = 0; i < count; i++)
	{
        let src = new FS.dplane_t(view, l.fileofs + i * FS.dplane_size);
        let out = map_planes[i];

		let bits = 0;

		for (let j = 0; j < 3; j++)
		{
			out.normal[j] = src.normal[j];
			if (out.normal[j] < 0) {
				bits |= 1 << j;
			}
		}

		out.dist = src.dist;
		out.type = src.type;
		out.signbits = bits;
	}
}


function CMod_LoadLeafBrushes(l: FS.lump_t, view: DataView) {

	if (l.filelen % 2)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadLeafBrushes: funny lump size");
	}

	let count = l.filelen / 2;

	if (count < 1)
	{
		Com_Error(SHARED.ERR_DROP, "Map with no leafbrushes");
	}

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_LEAFBRUSHES)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many leafbrushes");
	}

	numleafbrushes = count;

	for (let i = 0; i < count; i++)
	{
        map_leafbrushes[i] = view.getUint16(l.fileofs + i * FS.dleaf_size, true);
	}
}

function CMod_LoadBrushSides(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.dbrushside_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadBrushSides: funny lump size");
	}

	let count = l.filelen / FS.dbrushside_size;

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_BRUSHSIDES)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many brushsides");
	}

	numbrushsides = count;

	for (let i = 0; i < count; i++)
	{
        let src = new FS.dbrushside_t(view, l.fileofs + i * FS.dbrushside_size);
        let out = map_brushsides[i];

		let num = src.planenum;
		out.plane = map_planes[num];
		let j = src.texinfo;

		if (j >= numtexinfo) {
			Com_Error(SHARED.ERR_DROP, "Bad brushside texinfo");
		}

		out.surface = map_surfaces[j];
	}
}

function CMod_LoadAreas(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.darea_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadAreas: funny lump size");
	}

	let count = l.filelen / FS.darea_size;

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_AREAS)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many areas");
	}

	numareas = count;

	for (let i = 0; i < count; i++)
	{
        let src = new FS.darea_t(view, l.fileofs + i * FS.darea_size);
        let out = map_areas[i];

		out.numareaportals = src.numareaportals;
		out.firstareaportal = src.firstareaportal;
		out.floodvalid = 0;
		out.floodnum = 0;
	}
}

function CMod_LoadAreaPortals(l: FS.lump_t, view: DataView) {

	if (l.filelen % FS.dareaportal_size)
	{
		Com_Error(SHARED.ERR_DROP, "Mod_LoadAreaPortals: funny lump size");
	}

	let count = l.filelen / FS.dareaportal_size;

	/* need to save space for box planes */
	if (count > FS.MAX_MAP_AREAS)
	{
		Com_Error(SHARED.ERR_DROP, "Map has too many areas");
	}

	numareaportals = count;

	for (let i = 0; i < count; i++)
	{
        map_areaportals[i] = new FS.dareaportal_t(view, l.fileofs + i * FS.dareaportal_size);
	}
}


/*
 * Loads in the map and all submodels
 */
export async function CM_LoadMap(name: string, clientload: boolean, checksum: number[]): Promise<SHARED.cmodel_t>
{

	map_noareas = Cvar_Get("map_noareas", "0", 0);

	if (map_name == name && (clientload || !Cvar_VariableBool("flushmap"))) {
	// 	*checksum = last_checksum;

		if (!clientload)
		{
            for (let i in portalopen) {
                portalopen[i] = false
            }
			FloodAreaConnections();
		}

		return map_cmodels[0]; /* still have the right version */
	}

	/* free old stuff */
	numplanes = 0;
	numnodes = 0;
	numleafs = 0;
	numcmodels = 0;
	numvisibility = 0;
	numentitychars = 0;
	map_entitystring = "";
	map_name = "";

	if (!name)
	{
		numleafs = 1;
		numclusters = 1;
		numareas = 1;
		checksum[0] = 0;
		return map_cmodels[0]; /* cinematic servers won't have anything at all */
	}

	let buf = await FS.FS_LoadFile(name);
	if (buf == null) {
		Com_Error(SHARED.ERR_DROP, `Couldn't load ${name}`);
	}

	// last_checksum = LittleLong(Com_BlockChecksum(buf, length));
	// *checksum = last_checksum;

    let view = new DataView(buf);
    let header = new FS.dheader_t(view);

    if (header.version != FS.BSPVERSION)
	{
		Com_Error(SHARED.ERR_DROP,
				`CMod_LoadBrushModel: ${name} has wrong version number (${header.version} should be ${FS.BSPVERSION})`);
	}

	/* load into heap */
	CMod_LoadSurfaces(header.lumps[FS.LUMP_TEXINFO], view);
	CMod_LoadLeafs(header.lumps[FS.LUMP_LEAFS], view);
	CMod_LoadLeafBrushes(header.lumps[FS.LUMP_LEAFBRUSHES], view);
	CMod_LoadPlanes(header.lumps[FS.LUMP_PLANES], view);
	CMod_LoadBrushes(header.lumps[FS.LUMP_BRUSHES], view);
	CMod_LoadBrushSides(header.lumps[FS.LUMP_BRUSHSIDES], view);
	CMod_LoadSubmodels(header.lumps[FS.LUMP_MODELS], view);
	CMod_LoadNodes(header.lumps[FS.LUMP_NODES], view);
	CMod_LoadAreas(header.lumps[FS.LUMP_AREAS], view);
	CMod_LoadAreaPortals(header.lumps[FS.LUMP_AREAPORTALS], view);
	// CMod_LoadVisibility(header.lumps[FS.LUMP_VISIBILITY]);
	// /* From kmquake2: adding an extra parameter for .ent support. */
	// CMod_LoadEntityString(header.lumps[LUMP_ENTITIES], name);

	// FS_FreeFile(buf);

	CM_InitBoxHull();

    for (let i in portalopen) {
        portalopen[i] = false
    }
	FloodAreaConnections();

	map_name = name;

	return map_cmodels[0];
}

export function CM_InlineModel(name: string): SHARED.cmodel_t
{
	if (!name || (name[0] != '*'))
	{
		Com_Error(SHARED.ERR_DROP, "CM_InlineModel: bad name");
	}

	let num = parseInt(name.substr(1));

	if ((num < 1) || (num >= numcmodels))
	{
		Com_Error(SHARED.ERR_DROP, "CM_InlineModel: bad number");
	}

	return map_cmodels[num];
}

export function CM_NumClusters(): number
{
	return numclusters;
}

export function CM_NumInlineModels(): number
{
	return numcmodels;
}