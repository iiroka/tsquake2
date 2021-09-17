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
 * Low level network code, based upon the BSD socket api.
 *
 * =======================================================================
 */

import { Com_Printf } from "./clientserver"

// export interface HttpResponse {
//     success: boolean
//     resp?: ArrayBuffer
// }

// let httpResponses: HttpResponse[] = []

// export function Network_HttpSendRequest(addr: String, path: String, params: string[]) {
//     const opts: RequestInit = {
//         method: 'GET'
//       };
//       let url = `${addr}/${path}`
//       if (params.length > 0) {
//         let paramStr = params.map((s) => encodeURI(s)).join("&")
//         url += "?" + paramStr
//       }
//       console.log("FETCH", url)
//       fetch(encodeURI(url), opts).then( (resp: Response) => {
//         if (resp.ok) {
//             console.log("Request ok:", resp)
//             resp.arrayBuffer().then( (b) => {
//                 console.log(b)
//                 httpResponses.push({ success: false, resp: b })
//             })
//         } else {
//             console.log("Request error:", resp)
//             httpResponses.push({ success: false })
//         }
//     }).catch( (e: Error) => {
//         console.log("Request failed:", e.message)
//         httpResponses.push({ success: false })
//     })
// }

// export function Network_HttpReceive(): HttpResponse | null {
//     if (httpResponses.length > 0) {
//         let resp = httpResponses[0]
//         httpResponses = httpResponses.slice(1)
//         return resp;
//     }
//     return null
// }

let webSocket: WebSocket = null
let receivedData: ArrayBuffer[] = []

function Network_OpenHandler(ev: Event): any {
    console.log("OpenHandler", ev)
}

function Network_CloseHandler(ev: CloseEvent): any {
    console.log("CloseHandler", ev)
}

function Network_ErrorHandler(ev: Event): any {
    console.log("ErrorHandler", ev)
}

function Network_MessageHandler(ev: MessageEvent): any {
    if (ev.data instanceof Blob) {
        ev.data.arrayBuffer().then( bfr => receivedData.push(bfr))
    } else {
        console.log("Unknown message ytype")
    }
}

export function Network_Connect(server: string) {

    if (webSocket != null) {
        webSocket.close(1000, "ChangeServer")
    }

    webSocket = new WebSocket(server + "/connect")

    webSocket.onopen = Network_OpenHandler
    webSocket.onclose = Network_CloseHandler
    webSocket.onerror = Network_ErrorHandler
    webSocket.onmessage = Network_MessageHandler

    console.log("ReadyState", webSocket.readyState)
}

export function Network_Disconnect() {
    if (webSocket != null) {
        webSocket.close(1000, "Disconnect")
        webSocket = null
    }
}

export function NET_SendPacket(data: Uint8Array) {
    if (webSocket == null) {
        Com_Printf("Network is not connected\n")
        return
    }
    if (webSocket.readyState != 1) {
        Com_Printf(`Network connection is not ready ${webSocket.readyState}\n`)
        return
    }
    webSocket.send(data)
}

export function  NET_GetPacket(): Uint8Array | null {
    if (receivedData.length == 0) {
        return null
    }
    let data = receivedData[0]
    receivedData = receivedData.slice(1)
    return new Uint8Array(data)
}