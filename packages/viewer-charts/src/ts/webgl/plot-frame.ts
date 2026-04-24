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

type GL = WebGL2RenderingContext | WebGLRenderingContext;

/** Return CSS-pixel dimensions of the GL canvas. */
export function cssSize(gl: GL): { cssWidth: number; cssHeight: number } {
    const dpr = window.devicePixelRatio || 1;
    return {
        cssWidth: gl.canvas.width / dpr,
        cssHeight: gl.canvas.height / dpr,
    };
}

/**
 * Clear the framebuffer + enable alpha blending. Call once per frame,
 * before any per-plot-rect {@link withScissor} invocations. Faceted
 * renderers call this once and then loop {@link withScissor} per cell
 * so the inter-facet clears don't wipe each other's pixels.
 */
export function clearAndSetupFrame(gl: GL): void {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

/**
 * Scissor-constrain `draw` to `layout.plotRect`. Caller handles
 * projection / uniforms / VBO bindings inside `draw`; this helper only
 * manages the scissor enable/disable bracket.
 *
 * Unlike {@link renderInPlotFrame}, this does *not* clear the
 * framebuffer — so it's safe to call repeatedly per frame (one per
 * facet). Pair with {@link clearAndSetupFrame} at the start of each
 * frame.
 */
export function withScissor(
    gl: GL,
    layout: PlotLayout,
    draw: () => void,
): void {
    const dpr = window.devicePixelRatio || 1;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
        Math.round(layout.margins.left * dpr),
        Math.round(layout.margins.bottom * dpr),
        Math.round(layout.plotRect.width * dpr),
        Math.round(layout.plotRect.height * dpr),
    );
    try {
        draw();
    } finally {
        gl.disable(gl.SCISSOR_TEST);
    }
}

/**
 * One-shot convenience: clear + setup blend + scissor + draw. Used by
 * single-plot callers (bar / heatmap / candlestick / scatter-without-
 * splits) that only draw into one plot rect per frame.
 *
 * Faceted callers must use {@link clearAndSetupFrame} +
 * {@link withScissor} instead; calling this helper in a per-facet loop
 * would clear the framebuffer on each invocation and wipe out every
 * previously-drawn facet.
 */
export function renderInPlotFrame(
    gl: GL,
    layout: PlotLayout,
    draw: () => void,
): void {
    clearAndSetupFrame(gl);
    withScissor(gl, layout, draw);
}
