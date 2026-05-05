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

import { BUFFER_POOL_STRICT } from "../config";

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

    get maxCapacity() {
        return this._maxCapacity;
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

    /**
     * Read-only lookup by name. Returns the existing managed buffer, or
     * `undefined` if no buffer has been allocated under that name yet.
     *
     * Render-path callers that bind buffers for `drawArrays` /
     * `drawArraysInstanced` MUST use this rather than `getOrCreate`:
     * the latter recreates (zero-initialized) when `_totalCapacity` has
     * grown past the current `byteCapacity`. That recreate is desired
     * during `upload` (where `bufferSubData` immediately writes the
     * actual data) but catastrophic during render — it wipes the
     * previous draw's vertex data, leaving `drawArrays` to issue
     * against zeros and produce no visible glyphs (a one-frame blank
     * plot area while gridlines/chrome remain correct).
     *
     * Specifically, `ensureBufferCapacity(totalRows)` from a pending
     * draw updates `_totalCapacity` *before* its matching `uploadChunk`
     * has run; a pan/zoom-induced render landing in that window would
     * otherwise see `requiredBytes > byteCapacity` and recreate.
     */
    peek(name: string): ManagedBuffer | undefined {
        return this._buffers.get(name);
    }

    getOrCreate(
        name: string,
        componentsPerVertex: number,
        bytesPerElement: number,
    ): ManagedBuffer {
        const requiredBytes =
            this._totalCapacity * componentsPerVertex * bytesPerElement;
        let managed = this._buffers.get(name);
        if (managed && managed.byteCapacity >= requiredBytes) {
            return managed;
        }

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

    /**
     * Upload `data` into the named GPU buffer at `byteOffset`. The
     * buffer is sized lazily by `getOrCreate` to
     * `_totalCapacity × componentsPerVertex × data.BYTES_PER_ELEMENT`.
     * Callers MUST keep `byteOffset + data.byteLength` within that
     * capacity — `bufferSubData` raises `INVALID_VALUE` on overflow
     * and the upload is silently dropped at the GL layer.
     *
     * Common pitfall: passing a module-level scratch typed array whose
     * `length` exceeds the current frame's valid-data count. Scratch
     * buffers in chart impls grow monotonically across frames; the
     * GPU buffer is sized to the *current* `_totalCapacity`. After a
     * renderer-session reset (e.g. plugin disconnect/reconnect) the
     * GPU buffer is fresh while the scratch retains its historical-
     * peak length, and the upload writes past the buffer end. Always
     * pass `data.subarray(0, n × componentsPerVertex)` when uploading
     * from a scratch.
     *
     * Set `BUFFER_POOL_STRICT = true` in `config.ts` to convert
     * overflows from opaque GL errors into descriptive throws at the
     * offending stack frame.
     */
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

        if (BUFFER_POOL_STRICT) {
            const writeEnd = byteOffset + data.byteLength;
            if (writeEnd > managed.byteCapacity) {
                throw new Error(
                    `BufferPool.upload("${name}"): write ${byteOffset}..${writeEnd} ` +
                        `exceeds capacity ${managed.byteCapacity} ` +
                        `(_totalCapacity=${this._totalCapacity}, ` +
                        `components=${componentsPerVertex}, ` +
                        `bytes=${data.BYTES_PER_ELEMENT}). ` +
                        `Did you pass the full scratch buffer instead of a subarray(0, n)?`,
                );
            }
        }

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
