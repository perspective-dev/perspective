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

import type { Canvas2D, Context2D } from "../canvas-types";

export interface ChromeCacheChart {
    _chromeCanvas: Canvas2D | null;
    _chromeCache: ImageBitmap | null;
    _chromeCacheDirty: boolean;
    _chromeCacheGen: number;
}

/**
 * Run the static-chrome cache pattern shared by sunburst + treemap.
 * Resizes the canvas, paints the static layer (and snapshots it as an
 * `ImageBitmap`) when dirty, otherwise blits the cache; then runs the
 * caller-provided overlay layer for hover/highlight state.
 *
 * Returns the prepared `ctx` already in DPR-scaled space so the overlay
 * callback can paint in CSS pixels — except `null` if either the canvas
 * is missing a 2D context or the chart has nothing to paint.
 */
export function withChromeCache(
    chart: ChromeCacheChart,
    canvas: Canvas2D,
    dpr: number,
    cssWidth: number,
    cssHeight: number,
    drawStatic: (ctx: Context2D) => void,
    drawOverlay: ((ctx: Context2D) => void) | null,
): void {
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        chart._chromeCacheDirty = true;
    }

    const ctx = canvas.getContext("2d") as Context2D | null;
    if (!ctx) {
        return;
    }

    if (chart._chromeCacheDirty) {
        chart._chromeCache?.close();
        chart._chromeCache = null;
        chart._chromeCacheDirty = false;
        const gen = ++chart._chromeCacheGen;
        drawStatic(ctx);
        createImageBitmap(canvas).then((bmp) => {
            if (chart._chromeCacheGen === gen) {
                chart._chromeCache?.close();
                chart._chromeCache = bmp;
            } else {
                bmp.close();
            }
        });
    } else if (chart._chromeCache) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(chart._chromeCache, 0, 0);
    }

    if (drawOverlay) {
        ctx.save();
        ctx.scale(dpr, dpr);
        drawOverlay(ctx);
        ctx.restore();
    }
}
