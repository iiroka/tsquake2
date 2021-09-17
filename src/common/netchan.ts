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
 * The low level, platform independant network code
 *
 * =======================================================================
 */
import * as SHARED from "./shared"
import { Cvar_Get } from "./cvar"
import { MAX_MSGLEN} from "./common"
import { QWritebuf } from "./writebuf"
import { NET_SendPacket } from "./network"
import { curtime } from "./frame"
import { Com_Printf } from "./clientserver"
import { QReadbuf } from "./readbuf"

/*
 * packet header
 * -------------
 * 31	sequence
 * 1	does this message contain a reliable payload
 * 31	acknowledge sequence
 * 1	acknowledge receipt of even/odd message
 * 16	qport
 *
 * The remote connection never knows if it missed a reliable message,
 * the local side detects that it has been dropped by seeing a sequence
 * acknowledge higher thatn the last reliable sequence, but without the
 * correct even/odd bit for the reliable set.
 *
 * If the sender notices that a reliable message has been dropped, it
 * will be retransmitted.  It will not be retransmitted again until a
 * message after the retransmit has been acknowledged and the reliable
 * still failed to get there.
 *
 * if the sequence number is -1, the packet should be handled without a
 * netcon
 *
 * The reliable message can be added to at any time by doing MSG_Write*
 * (&netchan->message, <data>).
 *
 * If the message buffer is overflowed, either by a single message, or
 * by multiple frames worth piling up while the last reliable transmit
 * goes unacknowledged, the netchan signals a fatal error.
 *
 * Reliable messages are always placed first in a packet, then the
 * unreliable message is included if there is sufficient room.
 *
 * To the receiver, there is no distinction between the reliable and
 * unreliable parts of the message, they are just processed out as a
 * single larger message.
 *
 * Illogical packet sequence numbers cause the packet to be dropped, but
 * do not kill the connection.  This, combined with the tight window of
 * valid reliable acknowledgement numbers provides protection against
 * malicious address spoofing.
 *
 * The qport field is a workaround for bad address translating routers
 * that sometimes remap the client's source port on a packet during
 * gameplay.
 *
 * If the base part of the net address matches and the qport matches,
 * then the channel matches even if the IP port differs.  The IP port
 * should be updated to the new value before sending out any replies.
 *
 * If there is no information that needs to be transfered on a given
 * frame, such as during the connection stage while waiting for the
 * client to load, then a packet only needs to be delivered if there is
 * something in the unacknowledged reliable
 */

let showpackets: SHARED.cvar_t
let showdrop: SHARED.cvar_t
let qport: SHARED.cvar_t

export function Netchan_Init() {

	/* This is a little bit fishy:

	   The original code used Sys_Milliseconds() as base. It worked
	   because the original Sys_Milliseconds included some amount of
	   random data (Windows) or was dependend on seconds since epoche
	   (Unix). Our Sys_Milliseconds() always starts at 0, so there's a
	   very high propability - nearly 100 percent for something like
	   `./quake2 +connect example.com - that two or more clients end up
	   with the same qport.

	   We can't use rand() because we're always starting with the same
	   seed. So right after client start we'll nearly always get the
	   same random numbers. Again there's a high propability that two or
	   more clients end up with the same qport.

	   Just calling time() should be portable and is more less what
	   Windows did in the original code. There's still a rather small
	   propability that two clients end up with the same qport, but
	   that needs to fixed somewhere else with some kind of fallback
	   logic. */
	const port = Date.now() & 0xffff;

	showpackets = Cvar_Get("showpackets", "0", 0);
	showdrop = Cvar_Get("showdrop", "0", 0);
	qport = Cvar_Get("qport", port.toString(), SHARED.CVAR_NOSET);
}

/*
 * Sends an out-of-band datagram
 */
export function Netchan_OutOfBand(data: Uint8Array) {

	/* write the packet header */
    let send = new QWritebuf(MAX_MSGLEN)

    send.WriteLong(-1); /* -1 sequence means out of band */
    send.Write(data);

	/* send the datagram */
	NET_SendPacket(send.Data());
}

/*
 * Sends a text message in an out-of-band datagram
 */
export function Netchan_OutOfBandPrint(msg: string) {
    let enc = new TextEncoder()
	Netchan_OutOfBand(enc.encode(msg));
}

export class netchan_t {
	fatal_error: boolean

	// netsrc_t sock;

	dropped: number                    /* between last packet and previous */

	last_received: number              /* for timeouts */
	last_sent: number                  /* for retransmits */

	// netadr_t remote_address;
	qport: number                      /* qport value to write when transmitting */

	/* sequencing variables */
	incoming_sequence: number
	incoming_acknowledged: number
	incoming_reliable_acknowledged: number         /* single bit */

	incoming_reliable_sequence: number             /* single bit, maintained local */

	outgoing_sequence: number
	reliable_sequence: number                  /* single bit */
	last_reliable_sequence: number             /* sequence number of last send */

	/* reliable staging and holding areas */
	message: QWritebuf          /* writing buffer to send to server */

	/* message is copied to this buffer when it is first transfered */
	reliable_length: number
	reliable_buf: Uint8Array        /* unacked reliable message */

    constructor() {
        this.message = new QWritebuf(MAX_MSGLEN)
        this.reliable_buf = new Uint8Array(MAX_MSGLEN)
    }

    /*
    * called to open a channel to a remote system
    */
    Setup(qport: number) {
        this.fatal_error = false
        this.dropped = 0
        this.last_received = curtime
        this.last_sent = 0
        this.qport = qport
        this.incoming_sequence = 0
        this.incoming_acknowledged = 0
        this.incoming_reliable_acknowledged = 0
        this.incoming_reliable_sequence = 0
        this.outgoing_sequence = 1
        this.reliable_sequence = 0
        this.last_reliable_sequence = 0
        this.message.Clear()
        this.reliable_length = 0
        this.message.allowoverflow = true;
    }

    /*
    * Returns true if the last reliable message has acked
    */
    private CanReliable(): boolean {
        if (this.reliable_length > 0) {
            return false; /* waiting for ack */
        }
        return true;
    }

    private NeedReliable(): boolean {

        /* if the remote side dropped the last reliable message, resend it */
        let send_reliable = false;

        if ((this.incoming_acknowledged > this.last_reliable_sequence) &&
            (this.incoming_reliable_acknowledged != this.reliable_sequence)) {
            send_reliable = true;
        }

        /* if the reliable transmit buffer is empty, copy the current message out */
        if (this.reliable_length == 0 && this.message.cursize) {
            send_reliable = true;
        }

        return send_reliable;
    }

    /*
    * tries to send an unreliable message to a connection, and handles the
    * transmition / retransmition of the reliable messages.
    *
    * A 0 length will still generate a packet and deal with the reliable messages.
    */
    Transmit(data?: Uint8Array) {
        // sizebuf_t send;
        // byte send_buf[MAX_MSGLEN];
        // qboolean send_reliable;
        // unsigned w1, w2;

        /* check for message overflow */
        if (this.message.overflowed) {
            this.fatal_error = true;
            Com_Printf(":Outgoing message overflow\n");
            return;
        }

        const send_reliable = this.NeedReliable();

        if (!this.reliable_length && this.message.cursize) {
            for (let i = 0; i < this.message.cursize; i++) {
                this.reliable_buf[i] = this.message.data[i]
            }
            this.reliable_length = this.message.cursize;
            this.message.cursize = 0;
            this.reliable_sequence ^= 1;
        }

        /* write the packet header */
        let send = new QWritebuf(MAX_MSGLEN)

        let w1 = (this.outgoing_sequence & 0x7FFFFFFF) | (send_reliable ? 0x80000000 : 0);
        let w2 = (this.incoming_sequence & 0x7FFFFFFF) | ((this.incoming_reliable_sequence & 1) << 31);

        this.outgoing_sequence++;
        this.last_sent = curtime;

        send.WriteLong(w1);
        send.WriteLong(w2);

        /* send the qport if we are a client */
        send.WriteShort(qport.int);

        /* copy the reliable message to the packet first */
        if (send_reliable) {
            send.Write(this.reliable_buf.slice(0, this.reliable_length))
            this.last_reliable_sequence = this.outgoing_sequence;
        }

        /* add the unreliable part if space is available */
        if (data != null) {
            if (send.data.byteLength - send.cursize >= length) {
                send.Write(data);
            } else {
                Com_Printf("Netchan_Transmit: dumped unreliable\n");
            }
        }

        /* send the datagram */
        NET_SendPacket(send.Data());

        if (showpackets.bool) {
            if (send_reliable) {
                Com_Printf(`send ${send.cursize} : s=${this.outgoing_sequence-1} reliable=${this.reliable_sequence} ack=${this.incoming_sequence} rack=${this.incoming_reliable_sequence}\n`);
            } else {
                Com_Printf(`send ${send.cursize} : s=${this.outgoing_sequence-1} ack=${this.incoming_sequence} rack=${this.incoming_reliable_sequence}\n`);
            }
        }
    }

    /*
    * called when the current net_message is from remote_address
    * modifies net_message so that it points to the packet payload
    */
    Process(msg: QReadbuf): boolean {
        // unsigned sequence, sequence_ack;
        // unsigned reliable_ack, reliable_message;

        /* get sequence numbers */
        msg.BeginReading();
        let sequence = msg.ReadLong();
        let sequence_ack = msg.ReadLong();

        /* read the qport if we are a server */
        // if (chan->sock == NS_SERVER)
        // {
        //     (void)MSG_ReadShort(msg);
        // }

        let reliable_message = ((sequence >> 31) & 1) != 0
        let reliable_ack = (sequence_ack >> 31) & 1

        sequence &= 0x7FFFFFFF;
        sequence_ack &= 0x7FFFFFFF;

        if (showpackets.bool) {
            if (reliable_message) {
                Com_Printf(`recv ${msg.Size()} : s=${sequence} reliable=${this.incoming_reliable_sequence ^ 1} ack=${sequence_ack} rack=${reliable_ack}\n`);
            } else {
                Com_Printf(`recv ${msg.Size()} : s=${sequence} ack=${sequence_ack} rack=${reliable_ack}\n`);
            }
        }

        /* discard stale or duplicated packets */
        if (sequence <= this.incoming_sequence) {
            if (showdrop.bool) {
                Com_Printf(`:Out of order packet ${sequence} at ${this.incoming_sequence}\n`);
            }

            return false;
        }

        /* dropped packets don't keep the message from being used */
        this.dropped = sequence - (this.incoming_sequence + 1);

        if (this.dropped > 0) {
            if (showdrop.bool) {
                Com_Printf(`:Dropped ${this.dropped} packets at ${sequence}\n`);
            }
        }

        /* if the current outgoing reliable message has been acknowledged
        * clear the buffer to make way for the next */
        if (reliable_ack == this.reliable_sequence) {
            this.reliable_length = 0; /* it has been received */
        }

        /* if this message contains a reliable message, bump incoming_reliable_sequence */
        this.incoming_sequence = sequence;
        this.incoming_acknowledged = sequence_ack;
        this.incoming_reliable_acknowledged = reliable_ack;

        if (reliable_message) {
            this.incoming_reliable_sequence ^= 1;
        }

        /* the message can now be read from the current message pointer */
        this.last_received = curtime;

        return true;
    }


}