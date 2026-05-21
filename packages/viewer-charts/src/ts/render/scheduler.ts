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

import type { WebGLContextManager } from "../webgl/context-manager";

/**
 * Module-level render scheduler. The single entry point for driving a
 * chart frame. Every render-triggering caller — upload chunks, zoom /
 * pan, resize, theme invalidation, host-driven redraws — calls
 * `requestRender(glManager, fullRender)` and awaits the returned
 * promise.
 *
 * ## Guarantees
 *
 *   1. **At most one RAF queued globally.** The first request kicks
 *      off `requestAnimationFrame(drain)`; subsequent requests during
 *      that window enqueue without scheduling another callback.
 *
 *   2. **Coalesced per `glManager`.** The pending map is keyed by
 *      `WebGLContextManager`, so concurrent requests for the same
 *      chart share an entry — there is exactly one `_fullRender` call
 *      per glManager per RAF, regardless of how many requests landed.
 *
 *   3. **Promise resolves after the entry's own present.** Each
 *      waiter resolves when its entry's `_fullRender` +
 *      `awaitGpuFence` + `endFrame` chain completes. Independent
 *      glManagers run their fence waits in parallel (Phase 2 below),
 *      so a fast chart's waiters do not block on a slow chart in the
 *      same frame.
 *
 *   4. **At most one `_fullRender` per glManager per RAF.** GL
 *      contexts are not re-entered. `transferToImageBitmap` is called
 *      exactly once per glManager per frame, so the host blitter
 *      receives one bitmap per frame per chart and never an empty
 *      one.
 *
 * ## Drain ordering
 *
 *   - **Phase 1 (synchronous):** iterate the pending snapshot and call
 *     each entry's `fullRender()` in one un-yielded loop. This pushes
 *     all GL command buffers to all contexts before any fence wait
 *     begins, letting per-context GPU work overlap.
 *
 *   - **Phase 2 (parallel):** `Promise.all(snapshot.map(present))`
 *     where `present` does `await awaitGpuFence(); endFrame();
 *     resolve waiters`. Each entry's waiters resolve as soon as its
 *     own present completes — independent of other entries.
 *
 * ## Failure modes
 *
 *   - A throw from `fullRender()` rejects that entry's waiters and
 *     drops the entry; other entries continue to drain normally.
 *
 *   - A rejection from `awaitGpuFence` calls `endFrame` anyway (so
 *     canvas state stays consistent — `transferToImageBitmap` clears
 *     the offscreen even on the error path) and rejects that entry's
 *     waiters.
 *
 * ## Snapshot bypass
 *
 *   The scheduler always pairs `_fullRender` with `endFrame()`, which
 *   calls `transferToImageBitmap` and clears the offscreen. PNG
 *   export needs `gl.readPixels` against an intact backbuffer, so
 *   `snapshotPng` deliberately calls `_fullRender` directly and skips
 *   `endFrame`. That is the only sanctioned bypass; everything else
 *   goes through `requestRender`.
 */

interface Entry {
    glManager: WebGLContextManager;
    fullRender: () => void;
    waiters: PromiseWithResolvers<void>[];
}

const pending = new Map<WebGLContextManager, Entry>();
let rafId = 0;

/**
 * Set of `glManager`s currently in `present()` (Phase 2 — between
 * Phase 1 paint and `endFrame`). Mutations to these canvases must be
 * deferred until Phase 2 completes, otherwise they corrupt the bitmap
 * that `transferToImageBitmap` ships:
 *
 *   - `glManager.resize` sets `canvas.width = N`, which the spec
 *     mandates clears the drawing buffer immediately (out-of-band
 *     from the GL command queue).
 *   - `glManager.clear` queues `gl.clear` after Phase 1's draw
 *     commands but before the fence; if it executes before
 *     `transferToImageBitmap`, the canvas is wiped.
 *
 * Either path produces a blank frame on the host. `deferIfDraining`
 * is the gate; sibling message handlers (resize, clear) wrap their
 * canvas-mutating bodies in it.
 */
const inFlight = new Set<WebGLContextManager>();
const deferred = new Map<WebGLContextManager, (() => void)[]>();

/**
 * Request a coalesced render of `glManager` whose body is
 * `fullRender`. Returns a promise that resolves when this entry's
 * Phase 2 (`awaitGpuFence` + `endFrame`) completes.
 *
 * If a request is already pending for the same glManager, the new
 * call's `fullRender` closure replaces the prior one (latest call
 * wins; closures read chart state lazily so this is functionally a
 * no-op, but keeps the closure fresh) and the returned promise
 * resolves alongside the existing waiters.
 */
export function requestRender(
    glManager: WebGLContextManager,
    fullRender: () => void,
): Promise<void> {
    let entry = pending.get(glManager);
    if (entry) {
        entry.fullRender = fullRender;
    } else {
        entry = { glManager, fullRender, waiters: [] };
        pending.set(glManager, entry);
    }

    const waiter = Promise.withResolvers<void>();
    entry.waiters.push(waiter);

    if (!rafId) {
        rafId = scheduleFrame(drain);
    }

    return waiter.promise;
}

/**
 * Run `op` synchronously if no drain `present()` is currently active
 * for `glManager`. Otherwise queue `op` to run as soon as that
 * glManager's in-flight `present()` completes (after `endFrame`,
 * after the resolved/rejected waiters).
 *
 * Used by canvas-mutating callers — `WorkerRenderer.resize`,
 * `WorkerRenderer.clear` — to avoid wiping the offscreen between
 * Phase 1 paint and Phase 2 `endFrame`. `glManager.resize` setting
 * `canvas.width = N` clears the drawing buffer immediately
 * (per the WebGL spec, out-of-band from the GL command queue), and
 * a clear that lands in Phase 2's fence-wait yield window corrupts
 * the bitmap that `transferToImageBitmap` ships, producing a blank
 * frame on the host.
 *
 * Deferred ops execute in `present()`'s `finally` clause, so they
 * land *after* the in-flight drain's bitmap has been shipped and
 * before the next drain starts. If a deferred op itself triggers a
 * `requestRender`, the resulting entry queues into `pending` and
 * the drain's tail check (`pending.size > 0 → scheduleFrame(drain)`)
 * picks it up for the next RAF.
 */
export function deferIfDraining(
    glManager: WebGLContextManager,
    op: () => void,
): void {
    if (!inFlight.has(glManager)) {
        op();
        return;
    }

    let ops = deferred.get(glManager);
    if (!ops) {
        ops = [];
        deferred.set(glManager, ops);
    }

    ops.push(op);
}

/**
 * Test-only: clear pending state. Production callers must not use
 * this — outstanding waiters are silently dropped.
 */
export function _resetForTest(): void {
    if (rafId) {
        cancelFrame(rafId);
        rafId = 0;
    }

    pending.clear();
    inFlight.clear();
    deferred.clear();
}

// async function drain(): Promise<void> {
//     rafId = 0;

//     // Snapshot the pending set up front so requests that arrive during
//     // the drain (in microtasks between Phase 2 awaits, or in tasks
//     // unblocked by `awaitGpuFence`'s yields) queue into the next RAF
//     // rather than mutating this drain's working set.
//     const snapshot = Array.from(pending.values());
//     pending.clear();

//     // Phase 1: synchronously queue GL commands for every entry. One
//     // un-yielded loop so all contexts have their commands submitted
//     // before any fence wait begins; otherwise fence waits serialize
//     // behind each subsequent `_fullRender`'s draw submissions.
//     const ready: Entry[] = [];
//     for (const entry of snapshot) {
//         try {
//             entry.fullRender();
//             ready.push(entry);
//         } catch (err) {
//             console.error("scheduler: fullRender threw", err);
//             for (const w of entry.waiters) {
//                 w.reject(err);
//             }
//         }
//     }

//     // Phase 2: run each entry's fence + endFrame + waiter-resolve as
//     // its own async task. `Promise.all` joins for the drain wall
//     // time, but per-entry waiters resolve as soon as their entry's
//     // present completes — a fast chart in this frame is not held up
//     // by a slow chart.
//     await Promise.all(ready.map(present));
// }

async function drain(): Promise<void> {
    const snapshot = Array.from(pending.values());
    pending.clear();
    const ready: Entry[] = [];
    for (const entry of snapshot) {
        try {
            // Apply any dimension change recorded by
            // `glManager.requestResize` *before* the paint, in the
            // same un-yielded synchronous Phase 1 loop. This pairs
            // the canvas-clearing `canvas.width = N` assignment
            // with the immediately-following `_fullRender`, so the
            // browser's compositor only ever observes the canvas
            // post-paint. In direct/in-process modes the visible
            // canvas IS the GL canvas, and a clear-without-matching-
            // paint in the previous task would otherwise present an
            // empty frame to the user.
            entry.glManager.applyPendingResize();
            entry.fullRender();
            ready.push(entry);
        } catch (err) {
            console.error("scheduler: fullRender threw", err);
            for (const w of entry.waiters) {
                w.reject(err);
            }
        }
    }

    await Promise.all(ready.map(present));

    // Now (and only now) clear rafId. If new requests landed during
    // this drain, schedule the next RAF.
    rafId = 0;
    if (pending.size > 0) {
        rafId = scheduleFrame(drain);
    }
}

async function present(entry: Entry): Promise<void> {
    // Mark this glManager as in-flight *synchronously*, before the
    // first await. `Promise.all(ready.map(present))` calls each
    // `present` synchronously to collect its returned promise, so
    // every entry's glManager is registered in `inFlight` before
    // any fence-wait yields and before any sibling message handler
    // can run. Mutations posted by sibling handlers (resize, clear)
    // route through `deferIfDraining` and queue into `deferred`
    // until the `finally` block flushes them.
    inFlight.add(entry.glManager);
    try {
        await entry.glManager.awaitGpuFence();
        entry.glManager.endFrame();
        for (const w of entry.waiters) {
            w.resolve();
        }
    } catch (err) {
        console.error("scheduler: present failed", err);
        // Still call `endFrame` so the canvas state is consistent —
        // `transferToImageBitmap` clears the offscreen, and skipping
        // it would leave a stale image bound to a context the host
        // already considers presented.
        try {
            entry.glManager.endFrame();
        } catch {
            // Swallow: already in a failure path.
        }

        for (const w of entry.waiters) {
            w.reject(err);
        }
    } finally {
        // Bitmap shipped (or error reported). Re-open the canvas to
        // mutations and flush any deferred ops in arrival order.
        // Deferred ops may call `requestRender`; the resulting
        // entry queues into `pending` and the drain's tail check
        // picks it up for the next RAF.
        inFlight.delete(entry.glManager);
        const ops = deferred.get(entry.glManager);
        if (ops) {
            deferred.delete(entry.glManager);
            for (const op of ops) {
                try {
                    op();
                } catch (err) {
                    console.error("scheduler: deferred op threw", err);
                }
            }
        }
    }
}

/**
 * RAF in worker scope is exposed by `DedicatedWorkerGlobalScope` for
 * `OffscreenCanvas` painting and is the same primitive as on the
 * main thread. Fall back to `setTimeout(16)` for environments
 * without RAF (jsdom, headless tests without a polyfill).
 */
function scheduleFrame(cb: () => void): number {
    if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(cb);
    }

    return setTimeout(cb, 16) as unknown as number;
}

function cancelFrame(id: number): void {
    if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(id);
    } else {
        clearTimeout(id);
    }
}
