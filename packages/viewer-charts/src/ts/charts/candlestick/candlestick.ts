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
import { BodyWickGlyph } from "./glyphs/draw-candlesticks";
import { OHLCGlyph } from "./glyphs/draw-ohlc";

/**
 * Per-frame memo of the auto-fit Y extent for a {@link CandlestickChart},
 * keyed on the visible X window. Hover-only redraws hit the cache.
 */
export interface CandlestickAutoFitCache {
    // Cache key — the categorical (X) window.
    xMin: number;
    xMax: number;

    // VisibleExtent payload — value axis min/max + hasFit flag.
    min: number;
    max: number;
    hasFit: boolean;
}

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
     * `domain_mode: "expand"` accumulators. Hold the running union of
     * the value-axis (and, in numeric-category mode, category-axis)
     * extent across data loads. Cleared in `resetExpandedDomain` —
     * wired from the worker's `resetAllZooms` and from view-config
     * mutations on `AbstractChart`. `null` whenever the option is
     * `"fit"` or the accumulator has just been cleared.
     */
    _expandedYDomain: { min: number; max: number } | null = null;
    _expandedCategoryDomain: { min: number; max: number } | null = null;

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
     * Typed glyph composition. Each glyph owns its own program cache
     * and persistent vertex buffers privately; the chart routes
     * draw/rebuild/invalidate via `_glyphs`. `_defaultChartType`
     * (`"candlestick"` vs `"ohlc"`) selects which glyph the frame
     * builder dispatches to.
     */
    readonly _glyphs = {
        bodyWick: new BodyWickGlyph(),
        ohlc: new OHLCGlyph(),
    } as const;

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
    _autoFitCache: CandlestickAutoFitCache | null = null;

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
            onPin: (mx: number, my: number) => {
                // Refresh the hit-test at the click coords so the pin
                // path doesn't depend on the RAF-throttled hover state
                // — see comment in `series.ts` `onPin`.
                handleCandlestickHover(this, mx, my);
                if (this._hoveredIdx >= 0) {
                    const idx = this._hoveredIdx;
                    showCandlestickPinnedTooltip(this, idx);
                    void this._emitCandleClickSelect(idx);
                }
            },
            onUnpin: () => {
                this.emitUnselect();
            },
        };
    }

    /**
     * Resolve a clicked candle into a `PerspectiveClickDetail` and
     * emit both `perspective-click` and
     * `perspective-global-filter selected:true`.
     *
     * One candle per (catIdx, splitIdx). Like the series pipeline,
     * `catIdx + _rowOffset` is the source-view row; the column name is
     * the Close column (the canonical "y" target for OHLC). Group-by
     * values come from `_rowPaths`; split-by values come from
     * `_splitPrefixes[splitIdx]` split on `|`.
     */
    private async _emitCandleClickSelect(idx: number): Promise<void> {
        if (idx < 0 || idx >= this._candles.count) {
            return;
        }

        const catIdx = this._candles.catIdx[idx];
        const splitIdx = this._candles.splitIdx[idx];
        const groupByValues: (string | null)[] = this._rowPaths.map(
            (level) => level.labels[catIdx] ?? null,
        );
        const splitKey = this._splitPrefixes[splitIdx] ?? "";
        const splitByValues =
            this._splitBy.length > 0 && splitKey !== ""
                ? splitKey.split("|")
                : [];

        // OHLC plugins put Close in slot 1 (FIN_NAMES = ["Open",
        // "Close", "High", "Low", "Tooltip"]). Fall back to the first
        // non-null slot if Close isn't configured.
        const columnName =
            this._columnSlots[1] ||
            this._columnSlots.find((s): s is string => !!s) ||
            "";

        await this.emitClickAndSelect({
            rowIdx: catIdx + this._rowOffset,
            columnName,
            groupByValues,
            splitByValues,
        });
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
            bandInnerFrac: this._pluginConfig.band_inner_frac,
            barInnerPad: this._pluginConfig.bar_inner_pad,
            scratchCandles: this._candles,
        });
        // `domain_mode: "expand"` post-build union — mirrors the series
        // pipeline. Mutate the pipeline result in place so the
        // assignments below pick up the grown extent automatically.
        if (this._pluginConfig.domain_mode === "expand") {
            if (this._expandedYDomain) {
                result.yDomain.min = Math.min(
                    this._expandedYDomain.min,
                    result.yDomain.min,
                );
                result.yDomain.max = Math.max(
                    this._expandedYDomain.max,
                    result.yDomain.max,
                );
            }

            this._expandedYDomain = { ...result.yDomain };

            if (result.numericCategoryDomain) {
                if (this._expandedCategoryDomain) {
                    result.numericCategoryDomain.min = Math.min(
                        this._expandedCategoryDomain.min,
                        result.numericCategoryDomain.min,
                    );
                    result.numericCategoryDomain.max = Math.max(
                        this._expandedCategoryDomain.max,
                        result.numericCategoryDomain.max,
                    );
                }

                this._expandedCategoryDomain = {
                    min: result.numericCategoryDomain.min,
                    max: result.numericCategoryDomain.max,
                };
            }
        } else {
            this._expandedYDomain = null;
            this._expandedCategoryDomain = null;
        }

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

    override resetExpandedDomain(): void {
        this._expandedYDomain = null;
        this._expandedCategoryDomain = null;
    }

    protected destroyInternal(): void {
        if (this._glManager) {
            const gl = this._glManager.gl;
            if (this._cornerBuffer) {
                gl.deleteBuffer(this._cornerBuffer);
            }

            // Each glyph owns its program-local GPU resources +
            // persistent vertex buffers; `destroy` frees both.
            this._glyphs.bodyWick.destroy(this);
            this._glyphs.ohlc.destroy(this);
        }

        this._program = null;
        this._locations = null;
        this._cornerBuffer = null;
        this._candles = emptyCandleColumns();
        this._series = [];
        this._rowPaths = [];
        this._numCategories = 0;
        this._upDownColorKey = null;
    }
}
