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

export class ShaderRegistry {
    private _gl: GL;
    private _programs: Map<string, WebGLProgram> = new Map();

    constructor(gl: GL) {
        this._gl = gl;
    }

    getOrCreate(name: string, vertSrc: string, fragSrc: string): WebGLProgram {
        let program = this._programs.get(name);
        if (program) return program;

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
