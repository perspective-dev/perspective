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

/**
 * Renderer mode. `"worker"` runs the chart code in a Web Worker (off
 * the main thread, gets parallelism but pays a postMessage hop on
 * every interaction). `"inprocess"` dynamic-imports the same worker
 * module on the main thread so the bundle stays single-copy without
 * the worker boundary. The two paths share a `MessageChannel`-shaped
 * control protocol — only the handle around it differs.
 */
export const RUNTIME_MODE: "worker" | "inprocess" = "worker";

/**
 * Build-time toggle between the two GL-canvas display strategies.
 *
 * - `"direct"` — host transfers `.webgl-canvas` to the renderer via
 *   `transferControlToOffscreen`. The renderer's GL context renders
 *   straight into the visible drawing buffer.
 *
 * - `"blit"` — host keeps the visible canvas main-thread with a 2D
 *   context. The renderer creates its own internal `OffscreenCanvas`
 *   for GL rendering and emits each completed frame as an
 *   `ImageBitmap` over the control channel; the host blits the bitmap
 *   into the visible canvas via `drawImage`.
 */
export const RENDER_BLIT_MODE: "direct" | "blit" = "blit";

/**
 * Number of shared WebGL contexts in pooled blit mode.
 *
 * The browser caps live contexts per agent (~16 in Chromium) and
 * force-loses the oldest past that cap, so a page with more charts than
 * the cap cannot give each its own context. When `> 0` *and*
 * `RENDER_BLIT_MODE === "blit"`, every chart borrows one of this many
 * shared contexts (round-robin, sticky for the chart's lifetime) instead
 * of allocating its own — decoupling live-context count from chart
 * count. N charts render through K = this many contexts; the scheduler
 * serializes renders that land on the same context.
 *
 * `0` disables pooling (every chart gets its own context — the original
 * behavior). Pooling never applies to `"direct"` mode, which renders
 * into the host's transferred visible canvas and is permanently 1:1 with
 * a context; keep pages that need more than ~16 simultaneous charts on
 * `"blit"`.
 */
export const RENDER_CONTEXT_POOL_SIZE: number = 4;

/**
 * Strict-mode validation for `BufferPool.upload`.
 */
export const BUFFER_POOL_STRICT: boolean = false;
