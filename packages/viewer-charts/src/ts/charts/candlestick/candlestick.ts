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
    emptyCandleColumns,
    type CandleColumns,
    type CandleSeriesInfo,
    type NumericCategoryDomain,
} from "./candlestick-build";
import {
    renderCandlestickFrame,
    renderCandlestickChromeOverlay,
    invalidateGlyphBuffers,
    rebuildGlyphBuffers,
    ensureUpDownColors,
} from "./candlestick-render";
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

    /**
     * Columnar candle records. Indexed in `[0, _candles.count)`.
     * Replaces the legacy `CandleRecord[]` to avoid per-record POJO
     * allocation on data load.
     */
    _candles: CandleColumns = emptyCandleColumns();

    _yDomain: { min: number; max: number } = { min: 0, max: 1 };

    /**
     * Numeric category-axis state (single non-string group_by).
     */
    _categoryAxisMode: "category" | "numeric" = "category";
    _numericCategoryDomain: NumericCategoryDomain | null = null;
    _categoryPositions: Float64Array | null = null;
    _lastCatTicks: number[] | null = null;

    /**
     * Origin used to rebase candle xCenters before f32 narrowing — see {@link SeriesChart._categoryOrigin}.
     */
    _categoryOrigin = 0;

    /**
     * Gradient-sampled colors for the up (close ≥ open) / down sides.
     * Cached via `_upDownColorKey` — only `restyle()` (which clears the
     * theme cache) or a data load forces re-sampling.
     */
    _upColor: [number, number, number] = [0, 0.8, 0.4];
    _downColor: [number, number, number] = [0.8, 0.2, 0.2];

    /**
     * Identity of the gradient-stops reference last used to sample the
     * up/down colors. When this matches the current `theme.gradientStops`
     * reference, `ensureUpDownColors` short-circuits.
     */
    _upDownColorKey: unknown = null;

    _hoveredIdx = -1;
    _pinnedIdx = -1;

    /**
     * Lazy program / shared-resource cache. Each glyph (candlestick
     * body, wick, OHLC) lazily attaches its program + corner buffers
     * here on first use. Persistent vertex buffers (built once per
     * data load) live on `_glyphBuffers` instead.
     */
    _wickCache: unknown = undefined;

    /**
     * Persistent per-glyph vertex buffer state — built in
     * `rebuildGlyphBuffers` (called from `uploadAndRender`) and reused
     * across pan/zoom frames. Eliminates the legacy per-frame
     * `bufferData(DYNAMIC_DRAW)` of body / wick / OHLC vertex data.
     */
    _glyphBuffers: unknown = undefined;

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

    protected override tooltipCallbacks() {
        return {
            onHover: (mx: number, my: number) =>
                handleCandlestickHover(this, mx, my),
            onLeave: () => {
                if (this._hoveredIdx !== -1) {
                    this._hoveredIdx = -1;

                    // Hover state only affects the chrome overlay
                    // (tooltip box) — the WebGL pass is unchanged. Skip
                    // the full repaint (which would rebuild glyph
                    // buffers and shake out one more frame of latency).
                    renderCandlestickChromeOverlay(this);
                }
            },
            onPin: () => {
                if (this._hoveredIdx >= 0) {
                    showCandlestickPinnedTooltip(this, this._hoveredIdx);
                }
            },
        };
    }

    override invalidateTheme(): void {
        super.invalidateTheme();

        // Up/down colors are sampled from `theme.gradientStops`. Drop the
        // identity key so the next render re-samples after a `restyle()`.
        this._upDownColorKey = null;
    }

    async uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): Promise<void> {
        this._glManager = glManager;
        if (startRow !== 0) {
            return;
        }

        const result = buildCandlestickPipeline({
            columns,
            numRows: endRow,
            columnSlots: this._columnSlots,
            groupBy: this._groupBy,
            splitBy: this._splitBy,
            groupByTypes: this._groupByTypes,
            scratchCandles: this._candles,
        });
        this._rowPaths = result.rowPaths;
        this._numCategories = result.numCategories;
        this._rowOffset = result.rowOffset;
        this._splitPrefixes = result.splitPrefixes;
        this._series = result.series;
        this._candles = result.candles;
        this._yDomain = result.yDomain;
        this._categoryAxisMode = result.axisMode.mode;
        this._numericCategoryDomain = result.numericCategoryDomain;
        this._categoryPositions = result.categoryPositions;
        this._categoryOrigin = result.numericCategoryDomain?.min ?? 0;

        // New candles invalidate any auto-fit extent memo. Color key
        // stays — gradient stops are theme-bound, not data-bound — but
        // the persistent vertex buffers must be rebuilt to reflect the
        // new candle set.
        this._autoFitCache = null;

        // Resolve up/down colors (cheap on cache hit) before rebuilding
        // glyph buffers so the persistent body buffer captures the
        // correct per-candle RGB. Then rebuild buffers.
        ensureUpDownColors(this);
        invalidateGlyphBuffers(this);
        rebuildGlyphBuffers(this, glManager);

        await this.requestRender(glManager);
    }

    _fullRender(glManager: WebGLContextManager): void {
        this._glManager = glManager;
        renderCandlestickFrame(this, glManager);
    }

    protected destroyInternal(): void {
        if (this._glManager) {
            const gl = this._glManager.gl;
            if (this._cornerBuffer) {
                gl.deleteBuffer(this._cornerBuffer);
            }

            // Free the persistent vertex buffers and the program-local
            // GPU resources stashed on `_wickCache`. Without this each
            // `delete()` would leak ~6 GL buffers per chart instance.
            invalidateGlyphBuffers(this);
            destroyWickCache(this);
        }

        this._program = null;
        this._locations = null;
        this._cornerBuffer = null;
        this._wickCache = undefined;
        this._glyphBuffers = undefined;
        this._candles = emptyCandleColumns();
        this._series = [];
        this._rowPaths = [];
        this._numCategories = 0;
        this._upDownColorKey = null;
    }
}

/**
 * Free the program-local GPU buffers stashed on `_wickCache` (corner
 * buffer + segment buffer for wick / OHLC, quad + instance buffer for
 * the candlestick body shader). Programs themselves are owned by the
 * `WebGLContextManager.shaders` cache and are not freed here.
 */
function destroyWickCache(chart: CandlestickChart): void {
    if (!chart._glManager || !chart._wickCache) {
        return;
    }

    const gl = chart._glManager.gl;
    const cache = chart._wickCache as {
        body?: { quadBuffer?: WebGLBuffer; instanceBuffer?: WebGLBuffer };
        wick?: { cornerBuffer?: WebGLBuffer; segmentBuffer?: WebGLBuffer };
        ohlc?: { cornerBuffer?: WebGLBuffer; segmentBuffer?: WebGLBuffer };
    };

    if (cache.body) {
        if (cache.body.quadBuffer) {
            gl.deleteBuffer(cache.body.quadBuffer);
        }

        if (cache.body.instanceBuffer) {
            gl.deleteBuffer(cache.body.instanceBuffer);
        }
    }

    if (cache.wick) {
        if (cache.wick.cornerBuffer) {
            gl.deleteBuffer(cache.wick.cornerBuffer);
        }

        if (cache.wick.segmentBuffer) {
            gl.deleteBuffer(cache.wick.segmentBuffer);
        }
    }

    if (cache.ohlc) {
        if (cache.ohlc.cornerBuffer) {
            gl.deleteBuffer(cache.ohlc.cornerBuffer);
        }

        if (cache.ohlc.segmentBuffer) {
            gl.deleteBuffer(cache.ohlc.segmentBuffer);
        }
    }
}
