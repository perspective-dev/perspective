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

import type { WebGLContextManager } from "../../webgl/context-manager";
import type { ContinuousChart } from "./continuous-chart";

/**
 * A Glyph is a pluggable renderer for a {@link ContinuousChart}. The
 * chart owns all data and shared pipeline (init, chunk processing, hover,
 * chrome, tooltip plumbing); the glyph owns its shader program, draw
 * call, and per-glyph tooltip lines.
 */
export interface Glyph {
    /** `"point"` for scatter-style markers; `"line"` for polylines. */
    readonly name: "point" | "line";

    /**
     * Compile the program + cache attrib/uniform locations on first
     * frame. Subsequent frames are a no-op.
     */
    ensureProgram(chart: ContinuousChart, glManager: WebGLContextManager): void;

    /** Issue the draw call(s) for this glyph's visible geometry. */
    draw(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
    ): void;

    /**
     * Issue draw calls for a single series' slice only. Used by
     * faceted rendering: one facet per split, each facet's scissor
     * clips to its plot rect and only that series rasterizes inside.
     *
     * Implementations should bind uniforms/buffers once (same as
     * `draw`) and dispatch only the drawArrays call(s) for
     * `seriesIdx`.
     */
    drawSeries(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
        seriesIdx: number,
    ): void;

    /**
     * Per-hover tooltip content for the point at `flatIdx`. Returns a
     * Promise because some glyphs (notably `PointGlyph`) need to fetch
     * the source row from the view on demand for extra-column lookups.
     * Glyphs whose tooltip is geometry-only (e.g. `LineGlyph`) return
     * a microtask-resolved promise.
     */
    buildTooltipLines(
        chart: ContinuousChart,
        flatIdx: number,
    ): Promise<string[]>;

    /** Hover-overlay options (crosshair, highlight radius). */
    tooltipOptions(): { crosshair: boolean; highlightRadius: number };

    /** Release GL resources created by `ensureProgram`. */
    destroy(chart: ContinuousChart): void;
}
