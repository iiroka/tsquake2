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
 * This file implements all generic particle stuff
 *
 * =======================================================================
 */
import * as SHARED from "../common/shared"
import { INSTANT_PARTICLE, PARTICLE_GRAVITY } from "./client"
import { cl } from "./cl_main"
import { V_AddParticle } from "./cl_view"
import { MAX_PARTICLES } from "./ref"

class cparticle_t {

	// struct particle_s	*next;

	time: number = 0

	org = [0,0,0]
	vel = [0,0,0]
	accel = [0,0,0]
	color = 0
	colorvel = 0
	alpha = 0
	alphavel = 0
}

// cparticle_t *active_particles, *free_particles;
// cparticle_t particles[MAX_PARTICLES];
// int cl_numparticles = MAX_PARTICLES;
let free_particles: cparticle_t[] = []
let active_particles: cparticle_t[] = []

export function CL_ClearParticles() {

	free_particles = [];
	active_particles = [];

	for (let i = 0; i < MAX_PARTICLES; i++)
	{
        free_particles.push(new cparticle_t())
	}
}

export function CL_AllocateParticle(): cparticle_t {

    if (free_particles.length == 0) {
        return null;
    }

    let p = free_particles.pop();
    active_particles.push(p);
    return p;
}

export function CL_ParticleEffect(org: number[], dir: number[], color: number, count: number) {

	for (let i = 0; i < count; i++)
	{
        let p = CL_AllocateParticle();
		if (p == null) {
			return;
		}

		p.time = cl.time;
		p.color = color + (SHARED.randk() & 7);
		let d = SHARED.randk() & 31;

		for (let j = 0; j < 3; j++) {
			p.org[j] = org[j] + ((SHARED.randk() & 7) - 4) + d * dir[j];
			p.vel[j] = SHARED.crandk() * 20;
		}

		p.accel[0] = p.accel[1] = 0;
		p.accel[2] = -PARTICLE_GRAVITY + 0.2;
		p.alpha = 1.0;

		p.alphavel = -1.0 / (0.5 + SHARED.frandk() * 0.3);
	}
}

export function CL_AddParticles() {

	for (let p of active_particles) {

        let time = 0
        let alpha = p.alpha
		if (p.alphavel != INSTANT_PARTICLE) {
			time = (cl.time - p.time) * 0.001;
			alpha = p.alpha + time * p.alphavel;

			if (alpha <= 0) {
				/* faded out */
				free_particles.push(p);
				continue;
			}
		}

		if (alpha > 1.0) {
			alpha = 1;
		}

		let color = p.color;
		let time2 = time * time;

		let org = [
            p.org[0] + p.vel[0] * time + p.accel[0] * time2,
		    p.org[1] + p.vel[1] * time + p.accel[1] * time2,
		    p.org[2] + p.vel[2] * time + p.accel[2] * time2
        ]

		V_AddParticle(org, color, alpha);

		if (p.alphavel == INSTANT_PARTICLE) {
			p.alphavel = 0.0;
			p.alpha = 0.0;
		}
	}

	active_particles = [];
}
