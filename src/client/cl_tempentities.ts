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
 * This file implements all temporary (dynamic created) entities
 *
 * =======================================================================
 */
import { R_RegisterModel, Draw_FindPic } from "./vid"

// struct sfx_s *cl_sfx_ric1;
// struct sfx_s *cl_sfx_ric2;
// struct sfx_s *cl_sfx_ric3;
// struct sfx_s *cl_sfx_lashit;
// struct sfx_s *cl_sfx_spark5;
// struct sfx_s *cl_sfx_spark6;
// struct sfx_s *cl_sfx_spark7;
// struct sfx_s *cl_sfx_railg;
// struct sfx_s *cl_sfx_rockexp;
// struct sfx_s *cl_sfx_grenexp;
// struct sfx_s *cl_sfx_watrexp;
// struct sfx_s *cl_sfx_plasexp;
// struct sfx_s *cl_sfx_footsteps[4];

let cl_mod_explode: object
let cl_mod_smoke: object
let cl_mod_flash: object
let cl_mod_parasite_segment: object
let cl_mod_grapple_cable: object
let cl_mod_parasite_tip: object
let cl_mod_explo4: object
let cl_mod_bfg_explo: object
let cl_mod_powerscreen: object
let cl_mod_plasmaexplo: object

// struct sfx_s *cl_sfx_lightning;
// struct sfx_s *cl_sfx_disrexp;
let cl_mod_lightning: object
let cl_mod_heatbeam: object
let cl_mod_monster_heatbeam: object
let cl_mod_explo4_big: object

export async function CL_RegisterTEntModels()
{
	cl_mod_explode = await R_RegisterModel("models/objects/explode/tris.md2");
	cl_mod_smoke = await R_RegisterModel("models/objects/smoke/tris.md2");
	cl_mod_flash = await R_RegisterModel("models/objects/flash/tris.md2");
	cl_mod_parasite_segment = await R_RegisterModel("models/monsters/parasite/segment/tris.md2");
	cl_mod_grapple_cable = await R_RegisterModel("models/ctf/segment/tris.md2");
	cl_mod_parasite_tip = await R_RegisterModel("models/monsters/parasite/tip/tris.md2");
	cl_mod_explo4 = await R_RegisterModel("models/objects/r_explode/tris.md2");
	cl_mod_bfg_explo = await R_RegisterModel("sprites/s_bfg2.sp2");
	cl_mod_powerscreen = await R_RegisterModel("models/items/armor/effect/tris.md2");

	await R_RegisterModel("models/objects/laser/tris.md2");
	await R_RegisterModel("models/objects/grenade2/tris.md2");
	await R_RegisterModel("models/weapons/v_machn/tris.md2");
	await R_RegisterModel("models/weapons/v_handgr/tris.md2");
	await R_RegisterModel("models/weapons/v_shotg2/tris.md2");
	await R_RegisterModel("models/objects/gibs/bone/tris.md2");
	await R_RegisterModel("models/objects/gibs/sm_meat/tris.md2");
	await R_RegisterModel("models/objects/gibs/bone2/tris.md2");

	await Draw_FindPic("w_machinegun");
	await Draw_FindPic("a_bullets");
	await Draw_FindPic("i_health");
	await Draw_FindPic("a_grenades");

	cl_mod_explo4_big = await R_RegisterModel("models/objects/r_explode2/tris.md2");
	cl_mod_lightning = await R_RegisterModel("models/proj/lightning/tris.md2");
	cl_mod_heatbeam = await R_RegisterModel("models/proj/beam/tris.md2");
	cl_mod_monster_heatbeam = await R_RegisterModel("models/proj/widowbeam/tris.md2");
}
