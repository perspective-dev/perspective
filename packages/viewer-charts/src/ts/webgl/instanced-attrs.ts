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
                if (location < 0) {
                    return;
                }

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
            if (location < 0) {
                return;
            }

            ext?.vertexAttribDivisorANGLE(location, divisor);
        },
        drawArraysInstanced(mode, first, count, instances) {
            ext?.drawArraysInstancedANGLE(mode, first, count, instances);
        },
    };
}

/**
 * Allocate the static `[0, 1, 2, 3]` line-strip corner buffer used by
 * every instanced line/wick glyph: each corner index is multiplied by
 * `LINE_WIDTH_PX` in the shader to expand a 2-vertex segment into a
 * `TRIANGLE_STRIP` quad. Identical contents across all callers; one
 * helper avoids the four-way `createBuffer` / `bufferData` boilerplate.
 */
export function createLineCornerBuffer(gl: GL): WebGLBuffer {
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 2, 3]),
        gl.STATIC_DRAW,
    );
    return buffer;
}

/**
 * Allocate the static `[(0,0), (1,0), (0,1), (1,1)]` quad-strip corner
 * buffer used by instanced rect glyphs (candlestick body). Used as a
 * `vec2 a_corner` attribute that the shader scales by per-instance
 * width/height to expand into a `TRIANGLE_STRIP` rect.
 */
export function createQuadCornerBuffer(gl: GL): WebGLBuffer {
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        gl.STATIC_DRAW,
    );
    return buffer;
}

/**
 * Bind a per-instance float attribute from a named buffer in the buffer
 * pool. Returns `true` when the bind happened, `false` when the buffer
 * has not yet been allocated (caller should skip the draw rather than
 * paint zero data). No-op return `true` when `attr` is negative
 * (optimized-out attribute — drawing the rest is still valid).
 *
 * Render-path uses `peek`, never `getOrCreate`: the latter recreates
 * with zero-initialized contents when `_totalCapacity` has grown past
 * the current buffer, which would wipe the previous draw's vertex
 * data and leave `drawArraysInstanced` to render zeros. See
 * {@link BufferPool#peek} for the full rationale.
 */
export function bindInstancedFloatAttr(
    glManager: WebGLContextManager,
    instancing: Instancing,
    attr: number,
    name: string,
    components: number,
): boolean {
    if (attr < 0) {
        return true;
    }

    const buf = glManager.bufferPool.peek(name);
    if (!buf) {
        return false;
    }

    const gl: GL = glManager.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, components, gl.FLOAT, false, 0, 0);
    instancing.setDivisor(attr, 1);
    return true;
}
