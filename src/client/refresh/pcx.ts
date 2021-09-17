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
 * The PCX file format
 *
 * =======================================================================
 */
import { Com_DPrintf, Com_Printf } from "../../common/clientserver";
import { FS_LoadFile } from "../../common/filesystem"

/* PCX files are used for as many images as possible */

class pcx_t {
	readonly manufacturer: number
	readonly version: number
	readonly encoding: number
	readonly bits_per_pixel: number
    readonly xmin: number // u16
    readonly ymin: number // u16
    readonly xmax: number // u16
    readonly ymax: number // u16
    readonly hres: number // u16
    readonly vres: number // u16
	// unsigned char palette[48];
	// char reserved;
	readonly color_planes: number
	readonly bytes_per_line: number // u16
	readonly palette_type: number // u16
	// char filler[58];
	// unsigned char data;   /* unbounded */

    constructor(data: Uint8Array) {
        let view = new DataView(data.buffer, 0, PcxSize)
        this.manufacturer = view.getInt8(0)
        this.version = view.getInt8(1)
        this.encoding = view.getInt8(2)
        this.bits_per_pixel = view.getInt8(3)
        this.xmin = view.getUint16(4, true)
        this.ymin = view.getUint16(6, true)
        this.xmax = view.getUint16(8, true)
        this.ymax = view.getUint16(10, true)
        this.hres = view.getUint16(12, true)
        this.vres = view.getUint16(14, true)
        this.color_planes = view.getInt8(65)
        this.bytes_per_line = view.getUint16(66, true)
        this.palette_type = view.getUint16(68, true)
    }
}

const PcxSize = 128

interface PCXResult {
    width: number
    height: number
    pix: Uint8Array | null
    palette: Uint8Array | null
}

export async function LoadPCX(origname: string, loadPic: boolean = true, loadPal: boolean = false): Promise<PCXResult> {
	// byte *raw;
	// pcx_t *pcx;
	// int x, y;
	// int len, full_size;
	// int pcx_width, pcx_height;
	// qboolean image_issues = false;
	// int dataByte, runLength;
	// byte *out, *pix;
	// char filename[256];

	let filename = origname;

	/* Add the extension */
	if (!filename.endsWith("pcx")) {
		filename += ".pcx";
	}

    let pic: Uint8Array = null
    let palette: Uint8Array = null

	/* load the file */
	let raw = await FS_LoadFile(filename);

	if (raw == null || raw.byteLength < PcxSize) {
		Com_DPrintf( `Bad pcx file ${filename}\n`);
		return { width: -1, height: -1, pix: null, palette: null }
	}

	/* parse the PCX file */
	let pcx = new pcx_t(new Uint8Array(raw))

	const pcx_width = pcx.xmax - pcx.xmin;
	const pcx_height = pcx.ymax - pcx.ymin;

	if ((pcx.manufacturer != 0x0a) || (pcx.version != 5) ||
		(pcx.encoding != 1) || (pcx.bits_per_pixel != 8) ||
		(pcx_width >= 4096) || (pcx_height >= 4096)) {
		Com_Printf( `Bad pcx file ${filename}\n`);
		return { width: -1, height: -1, pix: null, palette: null }
	}

	const full_size = (pcx_height + 1) * (pcx_width + 1);
	// out = malloc(full_size);
	// if (!out)
	// {
	// 	R_Printf(PRINT_ALL, "Can't allocate\n");
	// 	ri.FS_FreeFile(pcx);
	// 	return;
	// }

	// *pic = out;

	// pix = out;

	if (loadPal) {
        palette = new Uint8Array(raw.slice(raw.byteLength - 768))
	}

    if (loadPic) {
        pic = new Uint8Array(full_size)
        let pix_i = 0
        let src_i = PcxSize
        let src = new Uint8Array(raw)
	    for (let y = 0; y <= pcx_height; y++, pix_i += pcx_width + 1) {
		    for (let x = 0; x <= pcx_width; ) {
			    let dataByte = src[src_i++]
                let runLength = 1

			    if ((dataByte & 0xC0) == 0xC0) {
				    runLength = dataByte & 0x3F;
                    dataByte = src[src_i++]
			    }
    			while (runLength-- > 0) {
					pic[pix_i + x++] = dataByte;
				}
			}
		}
    }

    return { width: pcx_width + 1, height: pcx_height + 1, pix: pic, palette: palette }
}
