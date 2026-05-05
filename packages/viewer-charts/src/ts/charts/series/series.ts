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
import type { ZoomConfig } from "../../interaction/zoom-controller";
import { CategoricalYChart } from "../common/categorical-y-chart";
import { type PlotRect } from "../../layout/plot-layout";
import { type AxisDomain } from "../../axis/numeric-axis";
import {
    buildSeriesPipeline,
    type SeriesChartRecord,
    type NumericCategoryDomain,
    type SeriesInfo,
    type BarColumns,
    emptyBarColumns,
} from "./series-build";
import {
    renderBarFrame,
    uploadBarInstances,
    invalidateGlyphBuffers,
    rebuildGlyphBuffers,
} from "./series-render";
import {
    handleBarHover,
    handleBarLegendClick,
    showBarPinnedTooltip,
    showBarPinnedTooltipForSample,
} from "./series-interact";
import { resolvePalette } from "../../theme/palette";
import barVert from "../../shaders/bar.vert.glsl";
import barFrag from "../../shaders/bar.frag.glsl";

export interface CachedLocations {
    u_proj_left: WebGLUniformLocation | null;
    u_proj_right: WebGLUniformLocation | null;
    u_hover_series: WebGLUniformLocation | null;
    u_horizontal: WebGLUniformLocation | null;
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
 * Bar chart. Fields are package-internal (no `private`) so helper modules
 * in this folder can read/write them.
 *
 * Orientation: vertical (Y Bar) is the default — categorical X, numeric
 * Y. When `_isHorizontal` is true (X Bar) the roles swap: numeric X,
 * categorical Y reading top-to-bottom. The data pipeline + instance
 * attributes stay in *logical* coordinates (xCenter = category center,
 * y0/y1 = value extent); the swap happens in three places only:
 *   1. Projection matrix (`bar-render.ts`) — args reordered, Y flipped.
 *   2. Vertex shader — `u_horizontal` uniform transposes position.
 *   3. Chrome (`bar-axis.ts`) — categorical axis moves from bottom to
 *      left; numeric axis from left to bottom.
 * Hit-testing reads the swapped pixel→data mapping via the projected
 * `PlotLayout`, so its logical comparisons don't need changes.
 */
export class SeriesChart extends CategoricalYChart {
    readonly _isHorizontal: boolean;

    constructor(orientation: "vertical" | "horizontal" = "vertical") {
        super();
        this._isHorizontal = orientation === "horizontal";
    }

    /**
     * Lock the categorical axis — scrolling through category indices
     * isn't meaningful, and the layout code assumes all categories are
     * always present. The value axis stays freely zoomable.
     */
    protected override getZoomConfig(): ZoomConfig {
        return { lockAxis: this._isHorizontal ? "x" : "y" };
    }

    _locations: CachedLocations | null = null;

    // Series-specific categorical-axis bookkeeping. `_rowPaths`,
    // `_numCategories`, `_rowOffset`, `_program`, `_cornerBuffer`,
    // `_lastLayout`, `_lastXDomain`, `_lastYDomain`, `_lastYTicks`, and
    // `_autoFitValue` all live on `CategoricalYChart`.
    _aggregates: string[] = [];
    _splitPrefixes: string[] = [];
    _series: SeriesInfo[] = [];

    /**
     * Columnar bar/area record storage. Indexed by bar slot in
     * `[0, _bars.count)`. Replaces the legacy `SeriesChartRecord[]` to
     * avoid per-record POJO allocation on data load.
     */
    _bars: BarColumns = emptyBarColumns();

    /**
     * Pre-partitioned series indices by glyph type — populated at the end
     * of `uploadAndRender` and reused across frames. Eliminates per-glyph
     * `chart._series.filter(...)` allocations in the render loop. Each
     * holds the full list of that type (including hidden series); the
     * draw paths still skip hidden via `_hiddenSeries` lookup.
     */
    _barSeries: SeriesInfo[] = [];
    _lineSeries: SeriesInfo[] = [];
    _scatterSeries: SeriesInfo[] = [];
    _areaSeries: SeriesInfo[] = [];

    /**
     * Cached primary / secondary axis labels — `_series.filter().map().
     * dedupe().join()` per axis, recomputed only on series-set change.
     */
    _primaryValueLabel = "";
    _altValueLabel = "";

    /**
     * (seriesId * 1e9 + catIdx) → bar-record index in `_bars`. Built once
     * per pipeline run for area-strip lookups; rebuilt on hidden-toggle
     * is unnecessary because the index keys don't depend on hidden state.
     */
    _areaBarIndex: Map<number, number> | null = null;

    /**
     * Cached Y-color buffer state for `uploadBarColors` short-circuit.
     * `_lastUploadedColors` mirrors the bytes last shipped to the GPU;
     * `uploadBarColors` skips when the new buffer matches byte-for-byte.
     * Reset (set to `null`) on data load or palette change.
     */
    _lastUploadedColors: Float32Array | null = null;

    /**
     * Cached palette + identity-keys for short-circuiting per-frame
     * resolution. Inputs (`seriesPalette` ref, `gradientStops` ref,
     * `series.length`) only change on data load or `restyle()`.
     */
    _paletteCache: [number, number, number][] | null = null;
    _paletteCacheKey: {
        seriesPalette: [number, number, number][] | null;
        gradientStops: unknown;
        seriesLength: number;
    } | null = null;

    /**
     * Reusable scratch for the build pipeline — keeps the stack ladder
     * `Float64Array(N*M)` capacity hot across data reloads. The pipeline
     * resizes if the new build's footprint exceeds capacity.
     */
    _posStackScratch: Float64Array | null = null;
    _negStackScratch: Float64Array | null = null;
    _leftDomain: { min: number; max: number } = { min: 0, max: 1 };
    _rightDomain: { min: number; max: number } | null = null;
    _hasRightAxis = false;

    /**
     * Numeric category-axis state. Populated only when `group_by` has
     * exactly one level and that level is `date | datetime | integer |
     * float` (boolean → category). When set, `_bars[].xCenter` lives in
     * real data units (not logical category indices), and the
     * categorical-side axis renders as a numeric axis instead of the
     * stringified-category one.
     */
    _categoryAxisMode: "category" | "numeric" = "category";
    _numericCategoryDomain: NumericCategoryDomain | null = null;

    /**
     * Origin used to rebase category positions before f32 narrowing.
     * Datetime numeric category axes carry ~1.7e12-magnitude values
     * which f32 cannot represent below ~256ms; the GPU buffers store
     * `(xCenter - _categoryOrigin)` and the projection matrix is built
     * with the same origin so its `tx` term stays small. Leftover
     * absolute coords are still available via `_numericCategoryDomain`
     * for axis-tick formatting and `dataToPixel`. `0` in category mode
     * (where positions are small integer indices) and in non-datetime
     * numeric modes (integer / float categories also fit in f32).
     */
    _categoryOrigin = 0;

    /**
     * Cached numeric category-axis ticks for the last frame.
     */
    _lastCatTicks: number[] | null = null;

    /**
     * Per-category X coordinate in real data units (numeric axis mode
     * only). `null` in category mode — line/scatter/area glyphs fall
     * back to using `catIdx` directly as the X coordinate.
     */
    _categoryPositions: Float64Array | null = null;

    _hiddenSeries: Set<number> = new Set();
    _hoveredBarIdx = -1;
    _pinnedBarIdx = -1;

    /**
     * Synthetic bar record for hover hits on line / scatter glyphs that
     * don't have a real `BarRecord` in `_bars`. At most one of
     * `_hoveredBarIdx` and `_hoveredSample` is populated per frame; see
     * {@link ./bar-interact.getHoveredBar}.
     */
    _hoveredSample: SeriesChartRecord | null = null;

    // Unstacked sample grid produced by buildBarPipeline: samples[catI * S + seriesId].
    _samples: Float32Array = new Float32Array(0);
    _sampleValid: Uint8Array = new Uint8Array(0);

    // Lazily-initialised per-glyph shader / buffer caches. Undefined until
    // the first frame that needs the corresponding glyph. Typed as `unknown`
    // so the glyph modules can own their own cache shape without forcing a
    // circular import into `bar.ts`.
    _lineCache: unknown = undefined;
    _scatterCache: unknown = undefined;
    _areaCache: unknown = undefined;

    // Dual-axis bar charts keep a secondary Y-axis domain + ticks for
    // the right-side axis chrome.
    _lastAltYDomain: AxisDomain | null = null;
    _lastAltYTicks: number[] | null = null;

    _uploadedBars = 0;

    /**
     * Bar-record indices uploaded to the instance buffers, in dispatch
     * order. `_uploadedBars` is the active prefix length; the trailing
     * capacity is reused across data reloads / legend toggles.
     */
    _visibleBarIndices: Int32Array = new Int32Array(0);

    _legendRects: { seriesId: number; rect: PlotRect }[] = [];

    /**
     * Cached legend layout — recomputed only on series-set / palette /
     * hidden-set / theme change. Frame-rate redraws read from this
     * directly; otherwise `ctx.measureText` would run per series each
     * frame. `null` flags an invalidation; `_legendRects` is rebuilt
     * lazily on the next chrome pass.
     */
    _legendCacheValid = false;

    /**
     * Persistent GPU buffer state for line / scatter / area glyphs.
     * Built in `uploadAndRender` and reused across pan/zoom frames —
     * the legacy code rebuilt these every frame which dominated the
     * frame budget at scale. Invalidated on data load and on
     * `_hiddenSeries` mutation; the latter only triggers a rebuild for
     * scatter (per-axis merged buffers) — line and area are per-series
     * and the draw paths just skip hidden entries.
     */
    _lineBuffers: unknown = undefined;
    _scatterBuffers: unknown = undefined;
    _areaBuffers: unknown = undefined;

    /**
     * Per-frame memo of the auto-fit value extent keyed on the visible
     * categorical window. Two comparisons per hit → no walk. Reset to
     * null on any mutation that would change the outcome (data reload,
     * legend toggle).
     *
     * Two axis slots because dual-axis bar charts refit left and right
     * independently.
     *
     * TODO(perf): when the visible window shrinks from a large N, the
     * linear walk over `_bars` dominates for N > ~100K. `_bars` is
     * already ordered by `catIdx`, so a binary-search pair to find the
     * visible slice drops this to O(log N + K_visible). Deferred until
     * profiling shows the walk in the hot path — current scale caps
     * keep it below 1% of frame time.
     */
    _autoFitCache: {
        catMin: number;
        catMax: number;
        hidden: Set<number>;
        leftMin: number;
        leftMax: number;
        hasLeft: boolean;
        rightMin: number;
        rightMax: number;
        hasRight: boolean;
    } | null = null;

    /**
     * Per-category extent buckets. Built once per data load (and
     * rebuilt when `_hiddenSeries` changes), then read per-frame by
     * `computeVisibleValueExtent` to compute the auto-fit window over
     * the visible cat range in O(visibleCats) instead of
     * O(`bars.count`). Capacity reused across builds via
     * length-checked grow.
     *
     * Memory: 4 × Float64 + 2 × Uint8 = 34 bytes per category. For
     * typical N (≤ 1000 cats) this is < 35 KB; for high-cardinality
     * N = 100k it's 3.4 MB. Acceptable trade for eliminating the
     * O(N×M×P) per-frame walk during pan/zoom animations.
     */
    _catExtents: {
        leftMin: Float64Array;
        leftMax: Float64Array;
        rightMin: Float64Array;
        rightMax: Float64Array;
        hasLeft: Uint8Array;
        hasRight: Uint8Array;
        n: number;
    } | null = null;

    /**
     * Identity of the `_hiddenSeries` set baked into `_catExtents`.
     * Pointer-compares to detect legend-toggle invalidations.
     */
    _catExtentsHidden: Set<number> | null = null;

    protected override tooltipCallbacks() {
        return {
            onHover: (mx: number, my: number) => handleBarHover(this, mx, my),
            onLeave: () => {
                if (this._hoveredBarIdx !== -1 || this._hoveredSample) {
                    this._hoveredBarIdx = -1;
                    this._hoveredSample = null;
                    if (this._glManager) {
                        renderBarFrame(this, this._glManager);
                    }
                }
            },
            onClickPre: (mx: number, my: number) =>
                handleBarLegendClick(this, mx, my),
            onPin: () => {
                if (this._hoveredBarIdx >= 0) {
                    showBarPinnedTooltip(this, this._hoveredBarIdx);
                } else if (this._hoveredSample) {
                    showBarPinnedTooltipForSample(this, this._hoveredSample);
                }
            },
        };
    }

    async uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): Promise<void> {
        this._glManager = glManager;
        const gl = glManager.gl;

        if (startRow !== 0) {
            // Bar charts render a single consolidated pass — the viewer
            // should not chunk this, but guard defensively.
            return;
        }

        if (!this._program) {
            this._program = glManager.shaders.getOrCreate(
                "bar",
                barVert,
                barFrag,
            );
            const p = this._program;
            this._locations = {
                u_proj_left: gl.getUniformLocation(p, "u_proj_left"),
                u_proj_right: gl.getUniformLocation(p, "u_proj_right"),
                u_hover_series: gl.getUniformLocation(p, "u_hover_series"),
                u_horizontal: gl.getUniformLocation(p, "u_horizontal"),
                a_corner: gl.getAttribLocation(p, "a_corner"),
                a_x_center: gl.getAttribLocation(p, "a_x_center"),
                a_half_width: gl.getAttribLocation(p, "a_half_width"),
                a_y0: gl.getAttribLocation(p, "a_y0"),
                a_y1: gl.getAttribLocation(p, "a_y1"),
                a_color: gl.getAttribLocation(p, "a_color"),
                a_series_id: gl.getAttribLocation(p, "a_series_id"),
                a_axis: gl.getAttribLocation(p, "a_axis"),
            };

            this._cornerBuffer = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, this._cornerBuffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
                gl.STATIC_DRAW,
            );
        }

        const result = buildSeriesPipeline({
            columns,
            numRows: endRow,
            columnSlots: this._columnSlots,
            groupBy: this._groupBy,
            splitBy: this._splitBy,
            groupByTypes: this._groupByTypes,
            columnsConfig: this._columnsConfig,
            defaultChartType: this._defaultChartType as
                | "bar"
                | "line"
                | "scatter"
                | "area"
                | undefined,
            scratchBars: this._bars,
            scratchPosStack: this._posStackScratch,
            scratchNegStack: this._negStackScratch,
        });

        this._aggregates = result.aggregates;
        this._splitPrefixes = result.splitPrefixes;
        this._rowPaths = result.rowPaths;
        this._numCategories = result.numCategories;
        this._rowOffset = result.rowOffset;
        this._categoryAxisMode = result.axisMode.mode;
        this._numericCategoryDomain = result.numericCategoryDomain;
        this._categoryPositions = result.categoryPositions;

        // Rebase origin for the category axis. Pin to the domain min so
        // every bar/sample can be uploaded as `(xCenter - origin)` and
        // the f32 GPU pipeline never sees the full ~1.7e12 timestamp.
        // Non-numeric modes (categorical, no domain) leave origin at 0.
        this._categoryOrigin = result.numericCategoryDomain?.min ?? 0;
        this._series = result.series;
        this._bars = result.bars;
        this._posStackScratch = result.posStack;
        this._negStackScratch = result.negStack;
        this._samples = result.samples;

        // Pre-partition `_series` by glyph type once per build. Frame
        // paths read these directly instead of `_series.filter(...)`.
        // Single bucket-push pass over the source array — replaces
        // four `Array.filter` allocations with in-place `length = 0`
        // resets on the chart-owned arrays. Same total memory in
        // steady state, but skips three array-header allocations and
        // one redundant pass over `result.series` per data load.
        this._barSeries.length = 0;
        this._lineSeries.length = 0;
        this._scatterSeries.length = 0;
        this._areaSeries.length = 0;
        for (const s of result.series) {
            switch (s.chartType) {
                case "bar":
                    this._barSeries.push(s);
                    break;
                case "line":
                    this._lineSeries.push(s);
                    break;
                case "scatter":
                    this._scatterSeries.push(s);
                    break;
                case "area":
                    this._areaSeries.push(s);
                    break;
            }
        }

        // Cache the per-axis label string. Recomputing the dedupe-and-
        // join per frame allocated four arrays + a string, all stable
        // between data loads.
        this._primaryValueLabel = uniqueAggLabels(result.series, 0);
        this._altValueLabel = uniqueAggLabels(result.series, 1);

        // Pre-build the area-strip lookup index (seriesId * 1e9 + catIdx
        // → bar slot). Legacy code rebuilt this every frame inside
        // `drawAreas`. The index is derived purely from `_bars` and is
        // valid for the lifetime of this build.
        this._areaBarIndex = buildAreaBarIndex(this._bars);

        // New bar records invalidate downstream caches — auto-fit extent,
        // legend layout (text widths can shift on series-set change),
        // palette + color upload (palette length changes), and persistent
        // glyph buffers (vertex data is rebuilt below). Also drop the
        // per-category extent identity so the bucket rebuilds on
        // next read.
        this._autoFitCache = null;
        this._legendCacheValid = false;
        this._paletteCache = null;
        this._paletteCacheKey = null;
        this._catExtentsHidden = null;
        this._lastUploadedColors = null;
        this._sampleValid = result.sampleValid;
        this._leftDomain = result.leftDomain;
        this._rightDomain = result.rightDomain;
        this._hasRightAxis = result.hasRightAxis;

        // Resolve the palette eagerly. Both `uploadBarInstances` (color
        // attribute) and `rebuildGlyphBuffers` (per-series RGB capture)
        // read `_series[i].color`, so the stamp has to happen first.
        ensurePalette(this);

        uploadBarInstances(this, glManager);

        invalidateGlyphBuffers(this);
        rebuildGlyphBuffers(this, glManager);

        await this.requestRender(glManager);
    }

    _fullRender(glManager: WebGLContextManager): void {
        if (!this._program) {
            return;
        }

        this._glManager = glManager;
        renderBarFrame(this, glManager);
    }

    protected destroyInternal(): void {
        if (this._glManager) {
            const gl = this._glManager.gl;
            if (this._cornerBuffer) {
                gl.deleteBuffer(this._cornerBuffer);
            }

            destroyGlyphBuffers(this);
        }

        this._program = null;
        this._locations = null;
        this._cornerBuffer = null;
        this._bars = emptyBarColumns();
        this._series = [];
        this._barSeries = [];
        this._lineSeries = [];
        this._scatterSeries = [];
        this._areaSeries = [];
        this._areaBarIndex = null;
        this._paletteCache = null;
        this._paletteCacheKey = null;
        this._lastUploadedColors = null;
        this._posStackScratch = null;
        this._negStackScratch = null;
        this._rowPaths = [];
        this._numCategories = 0;
        this._hiddenSeries.clear();
    }
}

/**
 * Build the `(seriesId * 1e9 + catIdx) → bar-record-index` lookup for
 * area glyphs. Areas read y0/y1 by (seriesId, catIdx) on every strip;
 * legacy code rebuilt this map per frame from the bars list. Invariant:
 * 1e9 is safe since category counts never approach it.
 */
function buildAreaBarIndex(bars: BarColumns): Map<number, number> {
    const m = new Map<number, number>();
    for (let i = 0; i < bars.count; i++) {
        if (bars.chartType[i] !== 1 /* AREA */) {
            continue;
        }

        m.set(bars.seriesId[i] * 1_000_000_000 + bars.catIdx[i], i);
    }

    return m;
}

/**
 * Dedupe + join the aggregate names for series on a given axis. Stable
 * across pan/zoom — caches on the chart so the legacy O(S²) `indexOf`-
 * based dedupe doesn't run per frame.
 */
function uniqueAggLabels(series: SeriesInfo[], axis: 0 | 1): string {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const s of series) {
        if (s.axis !== axis) {
            continue;
        }

        if (seen.has(s.aggName)) {
            continue;
        }

        seen.add(s.aggName);
        ordered.push(s.aggName);
    }

    return ordered.join(", ");
}

/**
 * Resolve the per-series palette and stamp it onto `_series[i].color`.
 * Cached on `_paletteCache` keyed by reference identity of the theme
 * inputs + series count — only `restyle()` (which clears `_paletteCache`
 * via `invalidateTheme`) or a data load (which clears it explicitly)
 * forces re-resolution.
 *
 * Returns true when the cache changed (caller invalidates color upload).
 */
export function ensurePalette(chart: SeriesChart): boolean {
    const theme = chart._resolveTheme();
    const seriesPalette = theme.seriesPalette;
    const gradientStops = theme.gradientStops;
    const seriesLength = chart._series.length;

    const key = chart._paletteCacheKey;
    if (
        chart._paletteCache &&
        key &&
        key.seriesPalette === seriesPalette &&
        key.gradientStops === gradientStops &&
        key.seriesLength === seriesLength
    ) {
        return false;
    }

    const palette = resolvePaletteCached(
        seriesPalette,
        gradientStops,
        seriesLength,
    );
    chart._paletteCache = palette;
    chart._paletteCacheKey = { seriesPalette, gradientStops, seriesLength };

    for (let i = 0; i < chart._series.length; i++) {
        chart._series[i].color = palette[i];
    }

    return true;
}

/**
 * Module-local indirection so `series.ts` can call into the palette
 * resolver without pulling the entire `series-render.ts` import graph
 * into its file scope. Re-exported through `series-render.ts`.
 */
function resolvePaletteCached(
    seriesPalette: [number, number, number][],
    gradientStops: import("../../theme/gradient").GradientStop[],
    seriesLength: number,
): [number, number, number][] {
    return resolvePalette(seriesPalette, gradientStops, seriesLength);
}

/**
 * Tear down the per-glyph GPU buffers built in `uploadAndRender`. Each
 * glyph module owns its own resource set (line, scatter, area).
 */
function destroyGlyphBuffers(chart: SeriesChart): void {
    if (!chart._glManager) {
        return;
    }

    const gl = chart._glManager.gl;
    const lb = chart._lineBuffers as
        | { gpuBuffer?: WebGLBuffer | null }
        | null
        | undefined;
    if (lb?.gpuBuffer) {
        gl.deleteBuffer(lb.gpuBuffer);
    }

    chart._lineBuffers = undefined;

    const sb = chart._scatterBuffers as
        | {
              posLeft?: WebGLBuffer | null;
              posRight?: WebGLBuffer | null;
              colLeft?: WebGLBuffer | null;
              colRight?: WebGLBuffer | null;
          }
        | null
        | undefined;
    if (sb) {
        if (sb.posLeft) {
            gl.deleteBuffer(sb.posLeft);
        }

        if (sb.posRight) {
            gl.deleteBuffer(sb.posRight);
        }

        if (sb.colLeft) {
            gl.deleteBuffer(sb.colLeft);
        }

        if (sb.colRight) {
            gl.deleteBuffer(sb.colRight);
        }
    }

    chart._scatterBuffers = undefined;

    const ab = chart._areaBuffers as
        | { gpuBuffer?: WebGLBuffer | null }
        | null
        | undefined;
    if (ab?.gpuBuffer) {
        gl.deleteBuffer(ab.gpuBuffer);
    }

    chart._areaBuffers = undefined;
}

/**
 * Horizontal bar chart — numeric X, categorical Y.
 */
export class XBarChart extends SeriesChart {
    constructor() {
        super("horizontal");
    }
}
