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
import { type AxisDomain } from "../../chrome/numeric-axis";
import { buildBarPipeline, type BarRecord, type SeriesInfo } from "./bar-build";
import { renderBarFrame, uploadBarInstances } from "./bar-render";
import {
    handleBarHover,
    handleBarLegendClick,
    showBarPinnedTooltip,
    showBarPinnedTooltipForSample,
} from "./bar-interact";
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
export class BarChart extends CategoricalYChart {
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

    // Bar-specific categorical-axis bookkeeping. `_rowPaths`,
    // `_numCategories`, `_rowOffset`, `_program`, `_cornerBuffer`,
    // `_lastLayout`, `_lastXDomain`, `_lastYDomain`, `_lastYTicks`, and
    // `_autoFitValue` all live on `CategoricalYChart`.
    _aggregates: string[] = [];
    _splitPrefixes: string[] = [];
    _series: SeriesInfo[] = [];
    _bars: BarRecord[] = [];
    _leftDomain: { min: number; max: number } = { min: 0, max: 1 };
    _rightDomain: { min: number; max: number } | null = null;
    _hasRightAxis = false;

    _hiddenSeries: Set<number> = new Set();
    _hoveredBarIdx = -1;
    _pinnedBarIdx = -1;

    /**
     * Synthetic bar record for hover hits on line / scatter glyphs that
     * don't have a real `BarRecord` in `_bars`. At most one of
     * `_hoveredBarIdx` and `_hoveredSample` is populated per frame; see
     * {@link ./bar-interact.getHoveredBar}.
     */
    _hoveredSample: BarRecord | null = null;

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
    _visibleBars: BarRecord[] = [];

    _legendRects: { seriesId: number; rect: PlotRect }[] = [];

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

    attachTooltip(glCanvas: HTMLCanvasElement): void {
        this._glCanvas = glCanvas;
        this._tooltip.attach(glCanvas, {
            onHover: (mx, my) => handleBarHover(this, mx, my),
            onLeave: () => {
                if (this._hoveredBarIdx !== -1 || this._hoveredSample) {
                    this._hoveredBarIdx = -1;
                    this._hoveredSample = null;
                    if (this._glManager) renderBarFrame(this, this._glManager);
                }
            },
            onClickPre: (mx, my) => handleBarLegendClick(this, mx, my),
            onPin: () => {
                if (this._hoveredBarIdx >= 0) {
                    showBarPinnedTooltip(this, this._hoveredBarIdx);
                } else if (this._hoveredSample) {
                    showBarPinnedTooltipForSample(this, this._hoveredSample);
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
        const gl = glManager.gl;

        if (startRow !== 0) {
            // Bar charts render a single consolidated pass — the viewer
            // should not chunk this, but guard defensively.
            return;
        }

        this._cancelScheduledRender();

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

        const result = buildBarPipeline({
            columns,
            numRows: endRow,
            columnSlots: this._columnSlots,
            groupBy: this._groupBy,
            splitBy: this._splitBy,
            columnsConfig: this._columnsConfig,
            defaultChartType: this._defaultChartType as
                | "bar"
                | "line"
                | "scatter"
                | "area"
                | undefined,
        });
        this._aggregates = result.aggregates;
        this._splitPrefixes = result.splitPrefixes;
        this._rowPaths = result.rowPaths;
        this._numCategories = result.numCategories;
        this._rowOffset = result.rowOffset;
        this._series = result.series;
        this._bars = result.bars;
        this._samples = result.samples;
        // New bar records invalidate the auto-fit extent cache — the
        // underlying `_bars` content just changed.
        this._autoFitCache = null;
        this._sampleValid = result.sampleValid;
        this._leftDomain = result.leftDomain;
        this._rightDomain = result.rightDomain;
        this._hasRightAxis = result.hasRightAxis;

        uploadBarInstances(this, glManager);
        this._scheduleRender(glManager);
    }

    redraw(glManager: WebGLContextManager): void {
        if (!this._program) return;
        this._glManager = glManager;
        this._fullRender(glManager);
    }

    protected _fullRender(glManager: WebGLContextManager): void {
        renderBarFrame(this, glManager);
    }

    protected destroyInternal(): void {
        if (this._cornerBuffer && this._glManager) {
            this._glManager.gl.deleteBuffer(this._cornerBuffer);
        }
        this._program = null;
        this._locations = null;
        this._cornerBuffer = null;
        this._bars = [];
        this._series = [];
        this._rowPaths = [];
        this._numCategories = 0;
        this._hiddenSeries.clear();
    }
}

/** Horizontal bar chart — numeric X, categorical Y. */
export class XBarChart extends BarChart {
    constructor() {
        super("horizontal");
    }
}
