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

import type { PlotLayout } from "../layout/plot-layout";

/**
 * Destructive per-frame canvas setup: resize to CSS pixels × DPR,
 * clear, and return a DPR-scaled 2D context. Call this exactly once
 * per canvas per frame — setting `canvas.width` / `canvas.height`
 * always wipes the bitmap and resets the transform, so calling it in
 * a per-facet loop wipes every previously-drawn facet.
 *
 * Faceted renderers call this once per frame and then
 * {@link getScaledContext} per facet to obtain the same context
 * without re-wiping.
 */
export function initCanvas(
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.cssWidth * dpr);
    canvas.height = Math.round(layout.cssHeight * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);
    return ctx;
}

/**
 * Non-destructive variant: returns the 2D context with its transform
 * forced to `scale(dpr, dpr)` via `setTransform` (idempotent — no
 * stacking). Assumes `initCanvas` was already called on this canvas
 * this frame; does NOT resize or clear.
 *
 * Intended for per-facet render helpers that must not wipe the shared
 * canvas bitmap mid-frame.
 */
export function getScaledContext(
    canvas: HTMLCanvasElement,
): CanvasRenderingContext2D | null {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}
