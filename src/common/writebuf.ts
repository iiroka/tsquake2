
import { ERR_FATAL } from "./shared"
import { Com_Error, Com_Printf } from "./clientserver"

export class QWritebuf {
	allowoverflow: boolean     /* if false, do a Com_Error */
	overflowed: boolean        /* set to true if the buffer size failed */
	data: Uint8Array
	cursize: number

    constructor(size: number) {
        this.allowoverflow = false
        this.overflowed = false
        this.data = new Uint8Array(size)
        this.cursize = 0
    }

    Clear() {
        this.cursize = 0;
        this.overflowed = false;
    }

    Data(): Uint8Array {
        return this.data.slice(0, this.cursize)
    }

    private GetSpace(length: number): number {

        if (this.cursize + length > this.data.byteLength) {
            if (!this.allowoverflow) {
                Com_Error(ERR_FATAL, "SZ_GetSpace: overflow without allowoverflow set");
            }

            if (length > this.data.byteLength) {
                Com_Error(ERR_FATAL, `SZ_GetSpace: ${length} is > full buffer size`);
            }

            this.Clear();
            this.overflowed = true;
            Com_Printf("SZ_GetSpace: overflow\n");
        }

        let index = this.cursize;
        this.cursize += length;

        return index;
    }

    WriteChar(c: number) {
        const index = this.GetSpace(1);
        this.data[index] = ~~c;
    }

    WriteByte(c: number) {
        const index = this.GetSpace(1);
        this.data[index] = c & 0xFF
    }

    WriteShort(c: number) {
        const index = this.GetSpace(2);
        this.data[index] = c & 0xFF
        this.data[index+1] = c >> 8
    }

    WriteLong(c: number) {
        const index = this.GetSpace(4);
        this.data[index] = c & 0xFF
        this.data[index+1] = (c >> 8) & 0xFF
        this.data[index+2] = (c >> 16) & 0xFF
        this.data[index+3] = c >> 24
    }

    Write(data: Uint8Array) {
        const index = this.GetSpace(data.byteLength);
	    for (let i = 0; i < data.byteLength; i++) {
            this.data[index + i] = data[i]
        }
    }

    WriteString(data: string) {
        const index = this.GetSpace(data.length + 1);
	    for (let i = 0; i < data.length; i++) {
            this.data[index + i] = data.charCodeAt(i)
        }
        this.data[index + data.length] = 0
    }

}
