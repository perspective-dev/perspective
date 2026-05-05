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

/**
 * Compile (or fetch from the shader registry) a program and resolve a
 * flat record of uniform + attribute locations keyed by name. Uniforms
 * resolve to `WebGLUniformLocation | null`; attribs resolve to `number`.
 *
 * Each glyph drawer used to repeat ~10 lines of `gl.getUniformLocation`
 * / `gl.getAttribLocation` calls — replacing those with one
 * `compileProgram(...)` call shrinks the worker bundle by ~80 bytes per
 * site (uniform/attrib name strings still ship — WebGL needs them
 * verbatim — but the per-call wrapper goes away).
 */
export function compileProgram<C>(
    glManager: WebGLContextManager,
    key: string,
    vert: string,
    frag: string,
    uniforms: readonly string[],
    attrs: readonly string[],
): C {
    const program = glManager.shaders.getOrCreate(key, vert, frag);
    const gl = glManager.gl;
    const out: any = { program };
    for (const n of uniforms) {
        out[n] = gl.getUniformLocation(program, n);
    }

    for (const n of attrs) {
        out[n] = gl.getAttribLocation(program, n);
    }

    return out as C;
}
