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
import { GLContext, type WebGLCanvas } from "./gl-context";

export type { WebGLCanvas } from "./gl-context";

export interface WebGLContextManagerOptions {
    /**
     * If `true`, compile + link every shader in `SHADER_MANIFEST`
     * during context construction (and again after a context-loss/
     * restore cycle). Trades ~30-100ms of init time for elimination of
     * the compile/link cost on the first-frame path. Ignored when the
     * manager is constructed against an already-built shared
     * {@link GLContext} — that context owns the precompile decision.
     * Default `false` keeps lazy-compile behavior.
     */
    precompile?: boolean;
}

/**
 * Per-chart render handle. Owns the chart's GPU **buffers** and frame
 * bookkeeping, but only *borrows* its GL **context** — either a private
 * one it constructs (the default 1:1 mode, where the manager is handed a
 * raw canvas) or a shared {@link GLContext} from the
 * [ContextPool](./context-pool.ts) (pooled blit mode, where many
 * managers share K contexts to stay under the browser's per-agent
 * context cap).
 *
 * Buffers are always per-manager: {@link BufferPool} keys buffers by
 * name, so two charts sharing one pool would stomp each other's `"x"` /
 * `"y"` / `"color"`. Shaders, the GL context, and the canvas drawing
 * buffer are shared per {@link GLContext}; the scheduler serializes
 * renders of managers that share a context so the shared drawing buffer
 * only ever holds one chart's frame at a time (see {@link beginFrame}).
 */
export class WebGLContextManager {
    private _ctx: GLContext;
    private _ownsCtx: boolean;
    private _disposeRestore: () => void;
    private _buffers: BufferPool;
    private _uploadedCount = 0;
    private _cssWidth = 0;
    private _cssHeight = 0;
    private _dpr = 1;
    private _destroyed = false;
    private _frameCallback: ((bitmap: ImageBitmap) => void) | null = null;

    /**
     * Per-instance `MessageChannel` used by `_yieldToTask` to resume a
     * polling `awaitGpuFence` loop on the next task. Allocated lazily.
     * Must be per-instance: a module-level singleton races when two
     * managers poll concurrently (the second `onmessage` assignment
     * clobbers the first's resolver, hanging that fence wait). Now that
     * fence waits across managers run in parallel within one scheduler
     * drain, concurrent poll loops are the common case.
     */
    private _yieldChannel: MessageChannel | null = null;

    private _pendingYieldResolve: (() => void) | null = null;

    /**
     * @param source A raw canvas (manager constructs and **owns** a
     *   private {@link GLContext}) or an existing shared `GLContext`
     *   (manager borrows it; the pool owns its lifecycle).
     */
    constructor(
        source: WebGLCanvas | GLContext,
        options: WebGLContextManagerOptions = {},
    ) {
        if (source instanceof GLContext) {
            this._ctx = source;
            this._ownsCtx = false;
        } else {
            this._ctx = new GLContext(source, {
                precompile: options.precompile ?? false,
            });
            this._ownsCtx = true;
        }

        this._buffers = new BufferPool(this._ctx.gl);

        // Rebuild this tenant's buffers after a context restore. The
        // shared `GLContext` rebuilds the shader cache itself, once.
        this._disposeRestore = this._ctx.onRestore(() => {
            this._buffers.releaseAll();
            this._buffers = new BufferPool(this._ctx.gl);
            this._uploadedCount = 0;
        });
    }

    get gl(): WebGL2RenderingContext | WebGLRenderingContext {
        return this._ctx.gl;
    }

    /**
     * Identifies the shared GL context behind this manager. The
     * scheduler groups pending renders by this id: managers on the same
     * backend serialize (they share one drawing buffer); managers on
     * different backends render in parallel. In the default 1:1 mode
     * every manager has its own backend, so every render is independent
     * — identical to the pre-pooling behavior.
     */
    get backendId(): number {
        return this._ctx.id;
    }

    /**
     * True once this manager's context has been lost — its own
     * {@link destroy}, or a browser eviction of the shared context.
     */
    isContextLost(): boolean {
        return this._destroyed || this._ctx.isContextLost();
    }

    get isWebGL2(): boolean {
        return this._ctx.isWebGL2;
    }

    get shaders(): ShaderRegistry {
        return this._ctx.shaders;
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
     * host measures the DOM element and DPR — the manager never touches
     * DOM, so the same path works for an `HTMLCanvasElement`
     * (in-process), a transferred `OffscreenCanvas` (direct/worker), or
     * a pool-shared `OffscreenCanvas` (pooled blit).
     */
    resize(cssWidth: number, cssHeight: number, dpr: number): void {
        this._cssWidth = cssWidth;
        this._cssHeight = cssHeight;
        this._dpr = dpr;

        const width = Math.round(cssWidth * dpr);
        const height = Math.round(cssHeight * dpr);
        const canvas = this._ctx.canvas;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            this._ctx.gl.viewport(0, 0, width, height);
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
     * Record a dimension change to be applied at the start of the next
     * render's Phase 1, before `_fullRender` runs. The actual
     * `canvas.width = N` assignment (which clears the drawing buffer per
     * the WebGL spec) happens inside {@link applyPendingResize} /
     * {@link beginFrame}, paired in the same synchronous task as the
     * paint that fills the new buffer — eliminating the one-frame blank
     * the compositor would otherwise show in direct/in-process modes
     * (where the GL canvas IS the visible canvas).
     *
     * Multiple calls before the next render coalesce to last-write-wins.
     */
    requestResize(cssWidth: number, cssHeight: number, dpr: number): void {
        this._pendingResize = { cssWidth, cssHeight, dpr };
    }

    /**
     * Apply any pending dimension change recorded by
     * {@link requestResize}. Returns `true` when a resize was applied.
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
     * Prepare the shared GL surface for *this* manager's render. Called
     * by the scheduler immediately before `_fullRender` (and by the
     * `snapshotPng` bypass).
     *
     * - **Own context (1:1):** identical to the old Phase-1 step — apply
     *   only a *pending* resize. The context isn't shared, so there is
     *   no sibling state to reset and no need to touch the canvas when
     *   dimensions are unchanged.
     * - **Shared context (pooled):** a co-tenant chart rendered last and
     *   left the shared canvas at *its* dimensions with *its* GL state.
     *   Force the canvas to this manager's dimensions and reset the
     *   global GL state a sibling might have left dirty (bound
     *   framebuffer, viewport, scissor/depth enables) so frames can't
     *   bleed across charts. Per-frame draw state (blend, clear) is
     *   re-established by the chart's `clearAndSetupFrame`.
     */
    beginFrame(): void {
        if (this._ownsCtx) {
            this.applyPendingResize();
            return;
        }

        // Honor a queued `requestResize` (it carries the latest dims but
        // hasn't touched the canvas yet), then force the shared canvas
        // to this manager's dims — a co-tenant chart may have left it at
        // its own size. `resize` is a no-op when dims already match.
        const pending = this._pendingResize;
        this._pendingResize = null;
        if (pending) {
            this.resize(pending.cssWidth, pending.cssHeight, pending.dpr);
        } else {
            this.resize(this._cssWidth, this._cssHeight, this._dpr);
        }

        const gl = this._ctx.gl;
        const canvas = this._ctx.canvas;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.DEPTH_TEST);
        this._ctx.resetVertexArrayState();
    }

    get cssWidth(): number {
        return this._cssWidth;
    }

    get cssHeight(): number {
        return this._cssHeight;
    }

    get dpr(): number {
        return this._dpr;
    }

    clear(): void {
        this._ctx.gl.clearColor(0, 0, 0, 0);
        this._ctx.gl.clear(
            this._ctx.gl.COLOR_BUFFER_BIT | this._ctx.gl.DEPTH_BUFFER_BIT,
        );
        this._uploadedCount = 0;
    }

    /**
     * Register a per-frame hook invoked at the end of each render. In
     * blit-mode rendering the worker installs a callback that transfers
     * an `ImageBitmap` from the canvas back to the host. In direct mode
     * the callback is null and `endFrame` is a no-op. Pass `null` to
     * detach.
     */
    setFrameCallback(cb: ((bitmap: ImageBitmap) => void) | null): void {
        this._frameCallback = cb;
    }

    /**
     * Ship the current canvas contents as an `ImageBitmap` to the host
     * when a frame callback is registered and the surface is an
     * `OffscreenCanvas`. Otherwise no-op (direct mode paints straight to
     * the visible drawing buffer).
     */
    endFrame(): void {
        if (!this._frameCallback) {
            return;
        }

        // A context lost mid-frame (our own `destroy`, or a browser
        // eviction between paint and present) makes
        // `transferToImageBitmap` throw. Bail quietly.
        if (this.isContextLost()) {
            return;
        }

        const canvas = this._ctx.canvas as
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
     * executed by the GPU. WebGL2 issues a `fenceSync` and polls
     * `clientWaitSync` (yielding to the task queue between polls); WebGL1
     * falls back to a blocking `gl.finish()` (acceptable in a worker).
     */
    async awaitGpuFence(): Promise<void> {
        if (!this._ctx.isWebGL2) {
            this._ctx.gl.finish();
            return;
        }

        const gl = this._ctx.gl as WebGL2RenderingContext;
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

                if (this._destroyed) {
                    return;
                }
            }
        } finally {
            gl.deleteSync(fence);
        }
    }

    ensureBufferCapacity(totalRows: number): void {
        this._buffers.ensureCapacity(totalRows);
    }

    /**
     * Yield to the task queue between fence polls. `setTimeout(0)` is
     * avoided because Chromium clamps nested worker `setTimeout` to
     * ~4ms; a reused per-instance `MessageChannel` resumes in the next
     * task with sub-ms latency. `{ once: true }` over `onmessage = ...`
     * so concurrent resumes can't clobber each other's resolvers.
     */
    private _yieldToTask(): Promise<void> {
        if (!this._yieldChannel) {
            this._yieldChannel = new MessageChannel();
            this._yieldChannel.port1.start();
        }

        return new Promise<void>((resolve) => {
            const ch = this._yieldChannel!;
            this._pendingYieldResolve = resolve;
            ch.port1.addEventListener(
                "message",
                () => {
                    this._pendingYieldResolve = null;
                    resolve();
                },
                { once: true },
            );
            ch.port2.postMessage(null);
        });
    }

    destroy(): void {
        this._destroyed = true;
        this._frameCallback = null;
        this._disposeRestore();
        this._buffers.releaseAll();
        if (this._pendingYieldResolve) {
            const resolve = this._pendingYieldResolve;
            this._pendingYieldResolve = null;
            resolve();
        }

        if (this._yieldChannel) {
            this._yieldChannel.port1.close();
            this._yieldChannel.port2.close();
            this._yieldChannel = null;
        }

        // Only lose the GL context when we own it. A shared context
        // outlives any one tenant — the pool destroys it.
        if (this._ownsCtx) {
            this._ctx.destroy();
        }
    }
}
