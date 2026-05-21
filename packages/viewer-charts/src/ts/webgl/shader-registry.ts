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

import type { ShaderSpec } from "./shader-manifest";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

export class ShaderRegistry {
    private _gl: GL;
    private _programs: Map<string, WebGLProgram> = new Map();

    constructor(gl: GL) {
        this._gl = gl;
    }

    /**
     * Compile + link every program in `specs` eagerly. Used by
     * `WebGLContextManager` when constructed with `precompile: true`
     * so the first-frame path doesn't pay the compile cost inline.
     *
     * Compilation is synchronous and serial — single-digit ms per
     * program on a modern GPU. With `KHR_parallel_shader_compile`
     * (browser-supported but not yet wired here) the work could be
     * dispatched to driver threads; today we accept the wall-time
     * cost in exchange for simpler code and a deterministic init.
     */
    precompile(specs: readonly ShaderSpec[]): void {
        for (const spec of specs) {
            this.getOrCreate(spec.name, spec.vert, spec.frag);
        }
    }

    getOrCreate(name: string, vertSrc: string, fragSrc: string): WebGLProgram {
        let program = this._programs.get(name);
        if (program) {
            return program;
        }

        const gl = this._gl;

        const vert = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vert, vertSrc);
        gl.compileShader(vert);
        if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(vert);
            gl.deleteShader(vert);
            throw new Error(`Vertex shader compile error [${name}]: ${info}`);
        }

        const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(frag, fragSrc);
        gl.compileShader(frag);
        if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(frag);
            gl.deleteShader(vert);
            gl.deleteShader(frag);
            throw new Error(`Fragment shader compile error [${name}]: ${info}`);
        }

        program = gl.createProgram()!;
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            gl.deleteShader(vert);
            gl.deleteShader(frag);
            throw new Error(`Shader link error [${name}]: ${info}`);
        }

        // Shaders can be deleted after linking
        gl.deleteShader(vert);
        gl.deleteShader(frag);

        this._programs.set(name, program);
        return program;
    }

    releaseAll(): void {
        for (const program of this._programs.values()) {
            this._gl.deleteProgram(program);
        }

        this._programs.clear();
    }
}
