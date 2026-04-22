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

import type { ColumnDataMap } from "../../data/view-reader";
import type { WebGLContextManager } from "../../webgl/context-manager";
import { CategoricalYChart } from "../common/categorical-y-chart";
import {
    buildCandlestickPipeline,
    type CandleRecord,
    type CandleSeriesInfo,
} from "./candlestick-build";
import { renderCandlestickFrame } from "./candlestick-render";
import {
    handleCandlestickHover,
    showCandlestickPinnedTooltip,
} from "./candlestick-interact";

export interface CandlestickLocations {
    u_proj_left: WebGLUniformLocation | null;
    u_proj_right: WebGLUniformLocation | null;
    u_hover_series: WebGLUniformLocation | null;
    a_corner: number;
    a_x_center: number;
    a_half_width: number;
    a_y0: number;
    a_y1: number;
    a_color: number;
    a_series_id: number;
    a_axis: number;
}

/**
 * Candlestick / OHLC chart. Both plugins (`y-candlestick`, `y-ohlc`)
 * share this class — the only per-plugin difference is
 * `_defaultChartType` (`"candlestick"` vs `"ohlc"`), which
 * {@link renderCandlestickFrame} uses to pick the glyph draw function.
 *
 * Fields are package-internal (no `private`) so helper modules in this
 * folder can read/write them.
 */
export class CandlestickChart extends CategoricalYChart {
    _locations: CandlestickLocations | null = null;

    // `_rowPaths`, `_numCategories`, `_rowOffset`, `_program`,
    // `_cornerBuffer`, `_lastLayout`, `_lastXDomain`, `_lastYDomain`,
    // and `_lastYTicks` all live on `CategoricalYChart`.
    _splitPrefixes: string[] = [];
    _series: CandleSeriesInfo[] = [];
    _candles: CandleRecord[] = [];

    _yDomain: { min: number; max: number } = { min: 0, max: 1 };

    /** Gradient-sampled colors for the up (close ≥ open) / down sides. */
    _upColor: [number, number, number] = [0, 0.8, 0.4];
    _downColor: [number, number, number] = [0.8, 0.2, 0.2];

    _hoveredIdx = -1;
    _pinnedIdx = -1;

    // Lazy glyph caches.
    _wickCache: unknown = undefined;

    /** Uploaded instance count for the body shader. */
    _uploadedBodies = 0;

    /**
     * Auto-fit the price (Y) axis to the `low`/`high` extent of
     * candles whose `xCenter` falls inside the visible X window. Pairs
     * with the locked Y axis: the lock means user input can't zoom Y
     * directly, auto-fit is what actually moves it as the user scrolls
     * through time. Default: on (financial-chart convention).
     */
    override _autoFitValue = true;

    /**
     * Per-frame memo of the auto-fit Y extent keyed on the visible X
     * window. Hover-only redraws (X window unchanged) hit the cache.
     * Reset to null on data upload.
     *
     * TODO(perf): O(|_candles|) linear scan. `_candles` is ordered by
     * `xCenter`, so a binary-search pair to find the visible slice
     * would drop this to O(log N + K_visible). Deferred — the
     * `max_cells = 100_000` cap keeps the scan within the frame budget.
     */
    _autoFitCache: {
        // Cache key — the categorical (X) window.
        xMin: number;
        xMax: number;
        // VisibleExtent payload — value axis min/max + hasFit flag.
        min: number;
        max: number;
        hasFit: boolean;
    } | null = null;

    attachTooltip(glCanvas: HTMLCanvasElement): void {
        this._glCanvas = glCanvas;
        this._tooltip.attach(glCanvas, {
            onHover: (mx, my) => handleCandlestickHover(this, mx, my),
            onLeave: () => {
                if (this._hoveredIdx !== -1) {
                    this._hoveredIdx = -1;
                    if (this._glManager)
                        renderCandlestickFrame(this, this._glManager);
                }
            },
            onPin: () => {
                if (this._hoveredIdx >= 0) {
                    showCandlestickPinnedTooltip(this, this._hoveredIdx);
                }
            },
        });
    }

    uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): void {
        this._glManager = glManager;
        if (startRow !== 0) return;

        this._cancelScheduledRender();

        const result = buildCandlestickPipeline({
            columns,
            numRows: endRow,
            columnSlots: this._columnSlots,
            groupBy: this._groupBy,
            splitBy: this._splitBy,
        });
        this._rowPaths = result.rowPaths;
        this._numCategories = result.numCategories;
        this._rowOffset = result.rowOffset;
        this._splitPrefixes = result.splitPrefixes;
        this._series = result.series;
        this._candles = result.candles;
        this._yDomain = result.yDomain;
        // New candles invalidate any auto-fit extent memo.
        this._autoFitCache = null;

        this._scheduleRender(glManager);
    }

    redraw(glManager: WebGLContextManager): void {
        this._glManager = glManager;
        this._fullRender(glManager);
    }

    protected _fullRender(glManager: WebGLContextManager): void {
        renderCandlestickFrame(this, glManager);
    }

    protected destroyInternal(): void {
        if (this._cornerBuffer && this._glManager) {
            this._glManager.gl.deleteBuffer(this._cornerBuffer);
        }
        this._program = null;
        this._locations = null;
        this._cornerBuffer = null;
        this._wickCache = undefined;
        this._candles = [];
        this._series = [];
        this._rowPaths = [];
        this._numCategories = 0;
    }
}
