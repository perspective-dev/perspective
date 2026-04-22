// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

type GL = WebGL2RenderingContext | WebGLRenderingContext;

export interface ManagedBuffer {
    buffer: WebGLBuffer;
    byteCapacity: number;
}

export class BufferPool {
    private _gl: GL;
    private _buffers: Map<string, ManagedBuffer> = new Map();
    private _totalCapacity = 0;
    private _maxCapacity = 0;

    constructor(gl: GL) {
        this._gl = gl;
    }

    get totalCapacity(): number {
        return this._totalCapacity;
    }

    set maxCapacity(cap: number) {
        this._maxCapacity = cap;
    }

    ensureCapacity(totalRows: number): void {
        this._totalCapacity =
            this._maxCapacity > 0
                ? Math.min(totalRows, this._maxCapacity)
                : totalRows;
    }

    getOrCreate(
        name: string,
        componentsPerVertex: number,
        bytesPerElement: number,
    ): ManagedBuffer {
        const requiredBytes =
            this._totalCapacity * componentsPerVertex * bytesPerElement;
        let managed = this._buffers.get(name);
        if (managed && managed.byteCapacity >= requiredBytes) return managed;

        const gl = this._gl;
        if (managed) {
            gl.deleteBuffer(managed.buffer);
        }
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, requiredBytes, gl.DYNAMIC_DRAW);

        managed = { buffer, byteCapacity: requiredBytes };
        this._buffers.set(name, managed);
        return managed;
    }

    upload(
        name: string,
        data: Float32Array | Int32Array,
        byteOffset: number,
        componentsPerVertex: number = 1,
    ): WebGLBuffer {
        const gl = this._gl;
        const managed = this.getOrCreate(
            name,
            componentsPerVertex,
            data.BYTES_PER_ELEMENT,
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, managed.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, data);

        return managed.buffer;
    }

    releaseAll(): void {
        for (const managed of this._buffers.values()) {
            this._gl.deleteBuffer(managed.buffer);
        }
        this._buffers.clear();
        this._totalCapacity = 0;
    }
}
