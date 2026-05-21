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
import { BufferPool } from "./buffer-pool";

export type WebGLCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface WebGLContextManagerOptions {
    /**
     * If `true`, compile + link every shader in `SHADER_MANIFEST`
     * during construction (and again after a context-loss/restore
     * cycle). Trades ~30-100ms of init time for elimination of the
     * compile/link cost on the first-frame path of every chart type
     * that ends up rendered. Default `false` keeps the original
     * lazy-compile behavior — programs are compiled on first
     * `getOrCreate(name, ...)` call from a glyph's render path.
     */
    precompile?: boolean;
}

export class WebGLContextManager {
    private _canvas: WebGLCanvas;
    private _gl: WebGL2RenderingContext | WebGLRenderingContext;
    private _isWebGL2: boolean;
    private _shaders: ShaderRegistry;
    private _buffers: BufferPool;
    private _uploadedCount = 0;
    private _cssWidth = 0;
    private _cssHeight = 0;
    private _dpr = 1;
    private _precompile: boolean;
    private _frameCallback: ((bitmap: ImageBitmap) => void) | null = null;

    /**
     * Per-instance `MessageChannel` used by `_yieldToTask` to resume a
     * polling `awaitGpuFence` loop on the next task. Allocated lazily —
     * the polling path is rarely hit when the GPU is idle, and many
     * `WebGLContextManager` instances never need one.
     *
     * Must be per-instance: a module-level singleton races when two
     * managers poll concurrently. Both call sites assign
     * `port1.onmessage = resolve`, the second assignment overwrites the
     * first, and the first poll's promise never settles — leaving its
     * `awaitGpuFence` hung. The hang propagates up through the render
     * scheduler's `present` → `uploadAndRender` → the worker's
     * `uploadChunkAck` → the host's `with_typed_arrays` callback,
     * stalling `draw()` indefinitely. (Now that fence waits across
     * different `WebGLContextManager`s run in parallel inside one
     * scheduler drain, the per-instance discipline matters even
     * more — concurrent poll loops are the common case, not the
     * exception.)
     *
     * Cost of per-instance allocation: one extra `MessageChannel` (two
     * `MessagePort`s, ~negligible bytes, zero idle CPU) per chart on
     * top of the per-chart proxy channel that the transport already
     * holds. Bounded by chart count; safe even for pathological pages
     * with hundreds of charts. The alternative — allocating a fresh
     * channel on every `_yieldToTask` call — would churn ports on every
     * fence poll (potentially many per frame on slow GPUs), which is
     * far worse for the structured-clone subsystem than holding one
     * port pair for the manager's lifetime.
     */
    private _yieldChannel: MessageChannel | null = null;

    constructor(canvas: WebGLCanvas, options: WebGLContextManagerOptions = {}) {
        this._canvas = canvas;
        this._precompile = options.precompile ?? false;
        const gl2 = canvas.getContext("webgl2", {
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
        });

        if (gl2) {
            this._gl = gl2 as WebGL2RenderingContext;
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

            this._gl = gl1 as WebGLRenderingContext;
            this._isWebGL2 = false;
        }

        this._shaders = new ShaderRegistry(this._gl);
        this._buffers = new BufferPool(this._gl);

        if (this._precompile) {
            this._shaders.precompile(SHADER_MANIFEST);
        }

        // Both `HTMLCanvasElement` and `OffscreenCanvas` dispatch
        // `webglcontextlost` / `webglcontextrestored` events on the
        // canvas itself. `addEventListener` exists on both.
        (canvas as EventTarget).addEventListener(
            "webglcontextlost",
            (e: Event) => {
                e.preventDefault();
            },
        );

        (canvas as EventTarget).addEventListener("webglcontextrestored", () => {
            this._shaders.releaseAll();
            this._buffers.releaseAll();
            this._shaders = new ShaderRegistry(this._gl);
            this._buffers = new BufferPool(this._gl);
            this._uploadedCount = 0;

            // Re-prime the cache after restore so post-recovery
            // first-frame doesn't re-pay the lazy compile cost.
            if (this._precompile) {
                this._shaders.precompile(SHADER_MANIFEST);
            }
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

    /**
     * Resize the GL canvas's bitmap to match the host's CSS layout. The
     * Host is responsible for measuring the DOM element (or otherwise
     * deciding the target CSS size) and the device pixel ratio — the
     * manager itself does not touch DOM, so the same code path works
     * whether the canvas is an `HTMLCanvasElement` (in-process) or an
     * `OffscreenCanvas` (in-process via transfer, or in a worker).
     */
    resize(cssWidth: number, cssHeight: number, dpr: number): void {
        this._cssWidth = cssWidth;
        this._cssHeight = cssHeight;
        this._dpr = dpr;

        const width = Math.round(cssWidth * dpr);
        const height = Math.round(cssHeight * dpr);

        if (this._canvas.width !== width || this._canvas.height !== height) {
            this._canvas.width = width;
            this._canvas.height = height;
            this._gl.viewport(0, 0, width, height);
        }
    }

    /**
     * Pending dimensions to apply at the start of the next render.
     * `null` when no resize is queued. See {@link requestResize} /
     * {@link applyPendingResize}.
     */
    private _pendingResize: {
        cssWidth: number;
        cssHeight: number;
        dpr: number;
    } | null = null;

    /**
     * Record a dimension change to be applied at the start of the
     * next render's Phase 1, *before* `_fullRender` runs. The actual
     * `canvas.width = N` assignment (which clears the drawing buffer
     * per the WebGL spec) happens inside `applyPendingResize()`,
     * paired in the same synchronous task as the paint that fills
     * the new buffer.
     *
     * Why split the dimension change off from the existing
     * {@link resize} method: in direct / in-process modes the
     * GL canvas IS the host's visible canvas, and `canvas.width = N`
     * is immediately observable to the browser's compositor as a
     * cleared buffer. If the resize lands in the message handler
     * (one task) but the matching `_fullRender` lands in the next
     * RAF (a later task), the compositor cycles between them and
     * presents one full frame of empty canvas — visible flicker.
     * Deferring the dimension change to the same RAF as the paint
     * eliminates the inter-frame gap; both happen inside Phase 1's
     * un-yielded loop.
     *
     * Multiple `requestResize` calls before the next render coalesce
     * to last-write-wins — five rapid width changes from a window
     * drag produce one resize+paint, not five.
     */
    requestResize(cssWidth: number, cssHeight: number, dpr: number): void {
        this._pendingResize = { cssWidth, cssHeight, dpr };
    }

    /**
     * Apply any pending dimension change recorded by
     * {@link requestResize}. Called by the scheduler's Phase 1
     * (immediately before each entry's `fullRender`) and by the
     * `snapshotPng` bypass path. Returns `true` when a resize was
     * applied, `false` when there was nothing pending — useful for
     * callers that want to skip a no-op render.
     */
    applyPendingResize(): boolean {
        if (!this._pendingResize) {
            return false;
        }

        const { cssWidth, cssHeight, dpr } = this._pendingResize;
        this._pendingResize = null;
        this.resize(cssWidth, cssHeight, dpr);
        return true;
    }

    /**
     * Last CSS width passed to `resize()`.
     */
    get cssWidth(): number {
        return this._cssWidth;
    }

    /**
     * Last CSS height passed to `resize()`.
     */
    get cssHeight(): number {
        return this._cssHeight;
    }

    /**
     * Last device pixel ratio passed to `resize()`.
     */
    get dpr(): number {
        return this._dpr;
    }

    clear(): void {
        this._gl.clearColor(0, 0, 0, 0);
        this._gl.clear(this._gl.COLOR_BUFFER_BIT | this._gl.DEPTH_BUFFER_BIT);
        this._uploadedCount = 0;
    }

    /**
     * Register a per-frame hook invoked at the end of each render. In
     * blit-mode rendering, the worker installs a callback that
     * transfers an `ImageBitmap` from `_canvas` (an `OffscreenCanvas`)
     * back to the host so the visible display canvas can `drawImage`
     * it. In direct mode the callback is left null and `endFrame` is a
     * no-op.
     *
     * Pass `null` to detach.
     */
    setFrameCallback(cb: ((bitmap: ImageBitmap) => void) | null): void {
        this._frameCallback = cb;
    }

    /**
     * Called by chart impls at the bottom of `_fullRender` (and any
     * other path that produces a complete frame). When a frame
     * callback is registered AND the GL surface is an
     * `OffscreenCanvas`, ship its current contents as an
     * `ImageBitmap` to the host. Otherwise no-op — direct-mode
     * rendering has nothing to ship; the visible canvas already holds
     * the drawing buffer.
     */
    endFrame(): void {
        if (!this._frameCallback) {
            return;
        }

        const canvas = this._canvas as
            | OffscreenCanvas
            | (HTMLCanvasElement & { transferToImageBitmap?: never });
        if (
            typeof (canvas as OffscreenCanvas).transferToImageBitmap !==
            "function"
        ) {
            return;
        }

        const bitmap = (canvas as OffscreenCanvas).transferToImageBitmap();
        this._frameCallback(bitmap);
    }

    /**
     * Resolve when every GL command submitted up to this call has been
     * executed by the GPU.
     *
     * On WebGL2 this issues a `fenceSync(SYNC_GPU_COMMANDS_COMPLETE)`
     * and polls `clientWaitSync` with a zero timeout, yielding to the
     * task queue between polls. The first poll passes
     * `SYNC_FLUSH_COMMANDS_BIT` so the fence becomes reachable without
     * a separate `gl.flush()`.
     *
     * On WebGL1 there is no fenceSync; we fall back to the blocking
     * `gl.finish()`. This is acceptable in a worker — never call this
     * from the main thread on a heavy frame.
     *
     * Used as a per-frame "GPU is idle" barrier so callers can serialize
     * follow-on work (`endFrame` snapshot, present roundtrip, the next
     * chunk upload) against actual GPU completion instead of the
     * implicit, implementation-defined timing of `transferToImageBitmap`.
     */
    async awaitGpuFence(): Promise<void> {
        if (!this._isWebGL2) {
            this._gl.finish();
            return;
        }

        const gl = this._gl as WebGL2RenderingContext;
        const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!fence) {
            gl.finish();
            return;
        }

        try {
            let flags: GLbitfield = gl.SYNC_FLUSH_COMMANDS_BIT;
            while (true) {
                const status = gl.clientWaitSync(fence, flags, 0);
                if (
                    status === gl.ALREADY_SIGNALED ||
                    status === gl.CONDITION_SATISFIED
                ) {
                    return;
                }

                if (status === gl.WAIT_FAILED) {
                    gl.finish();
                    return;
                }

                flags = 0;
                await this._yieldToTask();
            }
        } finally {
            gl.deleteSync(fence);
        }
    }

    ensureBufferCapacity(totalRows: number): void {
        this._buffers.ensureCapacity(totalRows);
    }

    /**
     * Yield to the task queue between fence polls. We avoid
     * `setTimeout(0)` because Chromium clamps nested `setTimeout` to
     * ~4ms in workers, which would inflate the measured cost of
     * `awaitGpuFence`. A reused per-instance `MessageChannel` lands the
     * resume in the next task with sub-ms latency.
     *
     * `addEventListener(..., { once: true })` is used over
     * `port1.onmessage = ...` so concurrent in-flight resumes (should
     * any path ever introduce them) cannot clobber each other's
     * resolvers — the previous module-level singleton lost a resolver
     * on every overlap and hung one chart's `draw()` indefinitely.
     */
    private _yieldToTask(): Promise<void> {
        if (!this._yieldChannel) {
            this._yieldChannel = new MessageChannel();
            // `addEventListener` does not auto-start a `MessagePort` —
            // only `onmessage = ...` does. Start once at allocation so
            // posted resumes are actually delivered.
            this._yieldChannel.port1.start();
        }

        return new Promise<void>((resolve) => {
            const ch = this._yieldChannel!;
            ch.port1.addEventListener("message", () => resolve(), {
                once: true,
            });
            ch.port2.postMessage(null);
        });
    }

    destroy(): void {
        this._buffers.releaseAll();
        this._shaders.releaseAll();
        if (this._yieldChannel) {
            this._yieldChannel.port1.close();
            this._yieldChannel.port2.close();
            this._yieldChannel = null;
        }

        const ext = this._gl.getExtension("WEBGL_lose_context");
        if (ext) {
            ext.loseContext();
        }
    }
}
