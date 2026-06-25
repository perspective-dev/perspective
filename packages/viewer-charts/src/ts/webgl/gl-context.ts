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
import { SHADER_MANIFEST } from "./shader-manifest";

export type WebGLCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * The unit the browser actually counts against its per-agent WebGL
 * context cap (~16 in Chromium): one canvas + one GL context + the
 * shader programs compiled against it.
 *
 * Factored out of {@link WebGLContextManager} so that *many* managers
 * (one per chart) can share *one* GL context. The browser limit is on
 * contexts, not on the buffers/programs living inside one — a single
 * context can host an arbitrary number of independent
 * `WebGLBuffer`s/programs (bounded only by memory). So N charts can
 * render through K ≪ N contexts as long as each keeps its own
 * `BufferPool` (buffers are keyed by name; two charts would otherwise
 * collide) and renders are serialized per context (the shared drawing
 * buffer can hold one chart's frame at a time). See
 * [context-pool.ts](./context-pool.ts) and the scheduler's per-backend
 * grouping in [../render/scheduler.ts](../render/scheduler.ts).
 *
 * Shaders are shared per context: programs are immutable GLSL once
 * compiled (uniforms are set per draw), so co-tenant charts reuse them
 * and only pay the compile cost once per context.
 */
let NEXT_CONTEXT_ID = 1;

export class GLContext {
    readonly id: number;
    readonly canvas: WebGLCanvas;
    readonly gl: WebGL2RenderingContext | WebGLRenderingContext;
    readonly isWebGL2: boolean;
    shaders: ShaderRegistry;
    private _maxVertexAttribs: number;
    private _angle: ANGLE_instanced_arrays | null = null;
    private _precompile: boolean;
    private _destroyed = false;

    /**
     * Per-tenant hooks fired after a `webglcontextrestored`. Each
     * {@link WebGLContextManager} on this context registers one that
     * rebuilds its `BufferPool` (the shaders are rebuilt here, once, for
     * all tenants). On an intentional {@link destroy} these are dropped
     * without firing.
     */
    private _onRestore = new Set<() => void>();

    constructor(canvas: WebGLCanvas, options: { precompile?: boolean } = {}) {
        this.id = NEXT_CONTEXT_ID++;
        this.canvas = canvas;
        this._precompile = options.precompile ?? false;
        const gl2 = canvas.getContext("webgl2", {
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
        });

        if (gl2) {
            this.gl = gl2 as WebGL2RenderingContext;
            this.isWebGL2 = true;
        } else {
            const gl1 = canvas.getContext("webgl", {
                antialias: true,
                alpha: true,
                premultipliedAlpha: false,
            });

            if (!gl1) {
                throw new Error("WebGL is not supported");
            }

            this.gl = gl1 as WebGLRenderingContext;
            this.isWebGL2 = false;
        }

        this.shaders = new ShaderRegistry(this.gl);
        if (this._precompile) {
            this.shaders.precompile(SHADER_MANIFEST);
        }

        this._maxVertexAttribs = this.gl.getParameter(
            this.gl.MAX_VERTEX_ATTRIBS,
        ) as number;
        if (!this.isWebGL2) {
            this._angle = this.gl.getExtension("ANGLE_instanced_arrays");
        }

        // Both `HTMLCanvasElement` and `OffscreenCanvas` dispatch
        // `webglcontextlost` / `webglcontextrestored` on the canvas.
        (canvas as EventTarget).addEventListener(
            "webglcontextlost",
            (e: Event) => {
                // Don't reserve the slot for a restore once we've
                // intentionally torn the context down — `destroy()`
                // calls `loseContext()`, which fires this event.
                if (this._destroyed) {
                    return;
                }

                e.preventDefault();
            },
        );

        (canvas as EventTarget).addEventListener("webglcontextrestored", () => {
            // Rebuild the shared program cache once for the whole
            // context, then let each tenant rebuild its own buffers.
            this.shaders.releaseAll();
            this.shaders = new ShaderRegistry(this.gl);
            if (this._precompile) {
                this.shaders.precompile(SHADER_MANIFEST);
            }

            for (const cb of this._onRestore) {
                cb();
            }
        });
    }

    /**
     * Return every vertex-attribute slot to its default state: disabled,
     * with a zero instance divisor. Vertex-array state (enable flags,
     * pointers, divisors) is global to a context's default VAO — there
     * are no per-chart VAOs in this codebase — so when many charts share
     * one pooled context, a slot a prior chart enabled stays enabled for
     * the next chart, now pointing at a buffer the prior chart's
     * teardown deleted. Its next `drawArraysInstanced` then fails GL
     * validation: "no buffer is bound to enabled attribute", silently
     * dropping the draw.
     *
     * Glyphs already (re)enable + bind + set the divisor for every slot
     * they use on each frame, so clearing to the default here is a safe
     * baseline — it only removes the *leftover* enables a sibling chart
     * left behind. Called from {@link WebGLContextManager.beginFrame} in
     * shared (pooled) mode only; the 1:1 default never shares a context
     * and so keeps its original, reset-free path.
     */
    resetVertexArrayState(): void {
        const gl = this.gl;
        for (let i = 0; i < this._maxVertexAttribs; i++) {
            gl.disableVertexAttribArray(i);
            if (this.isWebGL2) {
                (gl as WebGL2RenderingContext).vertexAttribDivisor(i, 0);
            } else {
                this._angle?.vertexAttribDivisorANGLE(i, 0);
            }
        }
    }

    /**
     * Register a tenant's post-restore rebuild hook. Returns a disposer.
     */
    onRestore(cb: () => void): () => void {
        this._onRestore.add(cb);
        return () => this._onRestore.delete(cb);
    }

    /**
     * True once lost — either our own {@link destroy} or a browser
     * eviction of the oldest context past the per-agent cap.
     */
    isContextLost(): boolean {
        return this._destroyed || this.gl.isContextLost();
    }

    get destroyed(): boolean {
        return this._destroyed;
    }

    destroy(): void {
        this._destroyed = true;
        this._onRestore.clear();
        this.shaders.releaseAll();
        const ext = this.gl.getExtension("WEBGL_lose_context");
        if (ext) {
            ext.loseContext();
        }
    }
}
