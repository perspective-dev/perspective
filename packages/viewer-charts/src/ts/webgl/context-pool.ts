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

import { GLContext } from "./gl-context";

/**
 * Renderer-scope pool of shared {@link GLContext}s for pooled blit mode.
 *
 * The browser caps live WebGL contexts per agent (~16 in Chromium) and
 * force-loses the oldest past that cap. A page with more than ~16 charts
 * therefore can't give each its own context. This pool caps the number
 * of live contexts at `size`, distributing renderers across them
 * round-robin (sticky for a renderer's lifetime — a renderer keeps the
 * same context so its resident GPU buffers and any cached textures/FBOs
 * stay valid frame to frame). N charts render through K = `size`
 * contexts; the scheduler serializes renders that land on the same
 * context.
 *
 * Pooling applies to blit mode only: direct mode renders into the host's
 * transferred visible canvas, which is permanently 1:1 with a context.
 *
 * One pool per renderer scope (the worker, or the main thread in
 * in-process mode). Contexts are created lazily on first `acquire` and
 * live until renderer-scope teardown — like the contexts they replace,
 * they are not refcounted, because a shared context outlives any single
 * borrowing renderer.
 */
export class ContextPool {
    private _size: number;
    private _precompile: boolean;
    private _contexts: GLContext[] = [];
    private _next = 0;

    constructor(size: number, options: { precompile?: boolean } = {}) {
        this._size = Math.max(1, size);
        this._precompile = options.precompile ?? false;
    }

    /**
     * Borrow a context for a new renderer. Fills the pool to `size`
     * before reusing, then round-robins. A dead context (browser
     * eviction) is replaced in place so a borrower never receives a lost
     * context.
     */
    acquire(): GLContext {
        let ctx: GLContext;
        if (this._contexts.length < this._size) {
            ctx = this._make();
            this._contexts.push(ctx);
        } else {
            const idx = this._next % this._contexts.length;
            this._next++;
            if (this._contexts[idx].isContextLost()) {
                this._contexts[idx] = this._make();
            }

            ctx = this._contexts[idx];
        }

        return ctx;
    }

    private _make(): GLContext {
        // Initial size is arbitrary — every render resizes the shared
        // canvas to the borrowing renderer's dimensions in `beginFrame`.
        const canvas = new OffscreenCanvas(1, 1);
        return new GLContext(canvas, { precompile: this._precompile });
    }
}
