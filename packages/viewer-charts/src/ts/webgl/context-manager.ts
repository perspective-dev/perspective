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

import { ShaderRegistry } from "./shader-registry";
import { BufferPool } from "./buffer-pool";

export class WebGLContextManager {
    private _canvas: HTMLCanvasElement;
    private _gl: WebGL2RenderingContext | WebGLRenderingContext;
    private _isWebGL2: boolean;
    private _shaders: ShaderRegistry;
    private _buffers: BufferPool;
    private _uploadedCount = 0;

    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
        const gl2 = canvas.getContext("webgl2", {
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
        });
        if (gl2) {
            this._gl = gl2;
            this._isWebGL2 = true;
        } else {
            const gl1 = canvas.getContext("webgl", {
                antialias: true,
                alpha: true,
                premultipliedAlpha: false,
            });
            if (!gl1) {
                throw new Error("WebGL is not supported");
            }
            this._gl = gl1;
            this._isWebGL2 = false;
        }

        this._shaders = new ShaderRegistry(this._gl);
        this._buffers = new BufferPool(this._gl);

        // Handle context loss
        canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
        });

        canvas.addEventListener("webglcontextrestored", () => {
            this._shaders.releaseAll();
            this._buffers.releaseAll();
            this._shaders = new ShaderRegistry(this._gl);
            this._buffers = new BufferPool(this._gl);
            this._uploadedCount = 0;
        });
    }

    get gl(): WebGL2RenderingContext | WebGLRenderingContext {
        return this._gl;
    }

    get isWebGL2(): boolean {
        return this._isWebGL2;
    }

    get shaders(): ShaderRegistry {
        return this._shaders;
    }

    get bufferPool(): BufferPool {
        return this._buffers;
    }

    get uploadedCount(): number {
        return this._uploadedCount;
    }

    set uploadedCount(count: number) {
        this._uploadedCount = count;
    }

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
        const rect = this._canvas.getBoundingClientRect();
        const width = Math.round(rect.width * dpr);
        const height = Math.round(rect.height * dpr);

        if (this._canvas.width !== width || this._canvas.height !== height) {
            this._canvas.width = width;
            this._canvas.height = height;
            this._gl.viewport(0, 0, width, height);
        }
    }

    clear(): void {
        this._gl.clearColor(0, 0, 0, 0);
        this._gl.clear(this._gl.COLOR_BUFFER_BIT | this._gl.DEPTH_BUFFER_BIT);
        this._uploadedCount = 0;
    }

    ensureBufferCapacity(totalRows: number): void {
        this._buffers.ensureCapacity(totalRows);
    }

    destroy(): void {
        this._buffers.releaseAll();
        this._shaders.releaseAll();
        const ext = this._gl.getExtension("WEBGL_lose_context");
        if (ext) {
            ext.loseContext();
        }
    }
}
