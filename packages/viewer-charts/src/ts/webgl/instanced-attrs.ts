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

import type { WebGLContextManager } from "./context-manager";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

export interface Instancing {
    setDivisor(location: number, divisor: number): void;
    drawArraysInstanced(
        mode: number,
        first: number,
        count: number,
        instances: number,
    ): void;
}

/**
 * Return an Instancing helper for the given GL context. On WebGL2, native
 * `vertexAttribDivisor`/`drawArraysInstanced` are used; on WebGL1 the
 * ANGLE_instanced_arrays extension is looked up and cached by caller.
 * Negative attribute locations (optimized-out attributes) are tolerated by
 * `setDivisor` and ignored.
 */
export function getInstancing(glManager: WebGLContextManager): Instancing {
    const gl = glManager.gl;
    if (glManager.isWebGL2) {
        const gl2 = gl as WebGL2RenderingContext;
        return {
            setDivisor(location, divisor) {
                if (location < 0) return;
                gl2.vertexAttribDivisor(location, divisor);
            },
            drawArraysInstanced(mode, first, count, instances) {
                gl2.drawArraysInstanced(mode, first, count, instances);
            },
        };
    }

    const ext = gl.getExtension(
        "ANGLE_instanced_arrays",
    ) as ANGLE_instanced_arrays | null;
    return {
        setDivisor(location, divisor) {
            if (location < 0) return;
            ext?.vertexAttribDivisorANGLE(location, divisor);
        },
        drawArraysInstanced(mode, first, count, instances) {
            ext?.drawArraysInstancedANGLE(mode, first, count, instances);
        },
    };
}

/**
 * Bind a per-instance float attribute from a named buffer in the buffer
 * pool. No-op when `attr` is negative. Caller is responsible for calling
 * `setDivisor(attr, 0)` after the draw if state must be reset.
 */
export function bindInstancedFloatAttr(
    glManager: WebGLContextManager,
    instancing: Instancing,
    attr: number,
    name: string,
    components: number,
): void {
    if (attr < 0) return;
    const gl: GL = glManager.gl;
    const buf = glManager.bufferPool.getOrCreate(
        name,
        components,
        Float32Array.BYTES_PER_ELEMENT,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, components, gl.FLOAT, false, 0, 0);
    instancing.setDivisor(attr, 1);
}
