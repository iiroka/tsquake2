import { ERR_FATAL, SHORT2ANGLE } from "./shared"
import { Com_Error, Com_Printf } from "./clientserver"

export class QReadbuf {
    private data: Uint8Array
    private readcount: number

    constructor(data: Uint8Array) {
        this.data = data
        this.readcount = 0
    }

    DataAt(offset: number): string {
        return (this.data[this.readcount + offset] & 0xFF).toString(16)
    }

    Size(): number {
        return this.data.byteLength
    }

    ReadCount(): number {
        return this.readcount
    }

    BeginReading() {
        this.readcount = 0
    }
    
    ReadByte(): number {
    
        let c = -1
        if (this.readcount+1 > this.data.length) {
            c = -1
        } else {
            c = this.data[this.readcount] & 0xFF
        }
        this.readcount += 1
        return c
    }
    
    ReadChar(): number {
    
        let c = -1
        if (this.readcount+1 > this.data.length) {
            c = -1
        } else {
            c = new DataView(this.data.buffer, this.readcount).getInt8(0)
        }
        this.readcount += 1
        return c
    }

    ReadShort(): number {
    
        let c = -1
        if (this.readcount+2 > this.data.length) {
            c = -1
        } else {
            c = new DataView(this.data.buffer, this.readcount).getInt16(0, true)
        }
        this.readcount += 2
        return c
    }
    
    ReadLong(): number {
    
        let c = -1
        if (this.readcount+4 > this.data.length) {
            c = -1
        } else {
            c = new DataView(this.data.buffer, this.readcount).getInt32(0, true)
        }
        this.readcount += 4
        return c
    }

    
    ReadString(): string {
    
        let r = ""
        while (true) {
            let c = this.ReadByte()
            if ((c == -1) || (c == 0)) {
                break
            }
    
            r += String.fromCharCode(c)
        }
        return r
    }

    ReadStringLine(): string {
    
        let r = ""
        while (true) {
            let c = this.ReadByte()
            if ((c == -1) || (c == 0) || (c == ("\n").charCodeAt(0))) {
                break
            }
    
            r += String.fromCharCode(c)
        }
        return r
    }

    ReadCoord(): number {
	    return this.ReadShort() * 0.125
    }

    ReadPos(): number[] {
        return [
            this.ReadShort() * 0.125,
            this.ReadShort() * 0.125,
            this.ReadShort() * 0.125
        ]
    }

    ReadAngle(): number {
        return this.ReadChar() * 1.40625
    }

    ReadAngle16(): number {
        return SHORT2ANGLE(this.ReadShort());
    }
    

    ReadData(size: number): Uint8Array {
        let res = this.data.slice(this.readcount, this.readcount + size)
        this.readcount += size
        return res
    }
}