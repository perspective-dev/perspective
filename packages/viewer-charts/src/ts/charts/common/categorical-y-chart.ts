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

import type { PlotLayout } from "../../layout/plot-layout";
import type { AxisDomain } from "../../chrome/numeric-axis";
import type {
    CategoricalDomain,
    CategoricalLevel,
} from "../../chrome/categorical-axis";
import type { ZoomConfig } from "../../interaction/zoom-controller";
import { AbstractChart } from "../chart-base";

/**
 * Common base for charts with a categorical X axis, a numeric Y (value)
 * axis, and an optional zoom-on-categorical interaction. Today that's
 * Bar (all four Y-family plugins + X Bar) and Candlestick/OHLC.
 *
 * The class is deliberately thin: it consolidates the bookkeeping that
 * genuinely repeats across those chart families (categorical domain
 * state, last-frame cache for overlay-only redraws, value-axis lock
 * default, shared GL-program + corner-buffer fields) and nothing more.
 * Glyph rendering, hit-testing, build pipelines, and horizontal / dual-
 * axis variance live in the concrete subclasses because they diverge
 * too much to usefully share.
 */
export abstract class CategoricalYChart extends AbstractChart {
    // ── Categorical X axis state ─────────────────────────────────────────
    /** Row-path levels (group_by hierarchy) for X-axis tick rendering. */
    _rowPaths: CategoricalLevel[] = [];
    /** Number of categories on the X axis. */
    _numCategories = 0;
    /** Offset into the aggregated-row stream (total-rows are skipped). */
    _rowOffset = 0;

    // ── Shared GL resources ──────────────────────────────────────────────
    _program: WebGLProgram | null = null;
    _cornerBuffer: WebGLBuffer | null = null;

    // ── Last-frame cache (for chrome-only redraws) ───────────────────────
    _lastLayout: PlotLayout | null = null;
    _lastXDomain: CategoricalDomain | null = null;
    _lastYDomain: AxisDomain | null = null;
    _lastYTicks: number[] | null = null;

    // ── Auto-fit value axis (opt-in per chart) ───────────────────────────
    /**
     * When true, the value axis refits to the visible categorical
     * window each frame — so zooming the categorical axis tightens the
     * value axis to just the bars / candles in view. Subclasses own
     * the per-frame cache object because the cache key shape varies
     * (bar needs `hiddenSeries`, candlestick doesn't; bar may have
     * dual-axis extents, candlestick is single-axis).
     */
    _autoFitValue = false;

    /**
     * Lock the value axis by default — user wheel/pan should only
     * scroll the categorical axis. Subclasses override to flip
     * orientation (e.g. X Bar where the value axis is on X).
     */
    protected override getZoomConfig(): ZoomConfig {
        return { lockAxis: "y" };
    }
}
