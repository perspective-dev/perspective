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
import { AbstractChart } from "../chart-base";
import { SpatialHitTester } from "../../interaction/hit-test";
import { PlotLayout } from "../../layout/plot-layout";
import { type AxisDomain } from "../../chrome/numeric-axis";
import type { GradientTextureCache } from "../../webgl/gradient-texture";
import type { Glyph } from "./glyph";
import {
    initContinuousPipeline,
    processContinuousChunk,
} from "./continuous-build";
import {
    renderContinuousFrame,
    renderContinuousChromeOverlay,
} from "./continuous-render";
import {
    handleContinuousHover,
    showContinuousPinnedTooltip,
    dismissContinuousPinnedTooltip,
} from "./continuous-interact";

export interface SplitGroup {
    prefix: string;
    xColName: string;
    yColName: string;
    colorColName: string;
    sizeColName: string;
}

/**
 * Unified continuous (numeric X/Y) chart. Glyphs plug in to render
 * points, lines, or (future) areas over the shared data pipeline:
 * streaming chunk upload, per-series slotted buffer layout, pan/zoom,
 * spatial hit testing, chrome overlay, tooltip controller.
 *
 * Fields are package-internal (no `private`) so the split helper
 * modules and glyphs can read/write them.
 */
export class ContinuousChart extends AbstractChart {
    readonly glyph: Glyph;

    constructor(glyph: Glyph) {
        super();
        this.glyph = glyph;
    }

    // ── GL resources ──────────────────────────────────────────────────────
    // Shared: gradient LUT texture (used by both glyphs for color mapping).
    _gradientCache: GradientTextureCache | null = null;
    // Glyph-owned cache (program, attribute locations, scratch buffers).
    _glyphCache: any = null;

    // ── Column roles ──────────────────────────────────────────────────────
    _allColumns: string[] = [];
    _xName = "";
    _yName = "";
    _xLabel = "";
    _yLabel = "";
    _xIsRowIndex = false;
    _colorName = "";
    _sizeName = "";
    _colorIsString = false;
    _tooltipColumns: string[] = [];
    _splitGroups: SplitGroup[] = [];

    // ── Data extents ──────────────────────────────────────────────────────
    _xMin = Infinity;
    _xMax = -Infinity;
    _yMin = Infinity;
    _yMax = -Infinity;
    _colorMin = Infinity;
    _colorMax = -Infinity;
    _sizeMin = Infinity;
    _sizeMax = -Infinity;

    // ── Data buffers (per-series slotted) ─────────────────────────────────
    // Series `s` owns indices `[s*_seriesCapacity, (s+1)*_seriesCapacity)`
    // in the flat `_xData`/`_yData`/`_colorData` arrays and their GPU
    // counterparts. `_seriesUploadedCounts[s]` tracks how many slots at
    // the head of series `s` hold valid data; glyphs dispatch tight
    // per-series draws using this count so the tail slots are never
    // rasterized.
    _seriesCapacity = 0;
    _seriesUploadedCounts: number[] = [];
    _maxSeriesUploaded = 0;

    _xData: Float32Array | null = null;
    _yData: Float32Array | null = null;
    _colorData: Float32Array | null = null;
    _numericRowData: Map<string, Float32Array> = new Map();
    _stringRowData: Map<string, string[]> = new Map();
    _dataCount = 0;
    _uniqueColorLabels: Map<string, number> = new Map();

    // ── Staging scratch (reused across chunks) ───────────────────────────
    _stagingPositions: Float32Array | null = null;
    _stagingColors: Float32Array | null = null;
    _stagingSizes: Float32Array | null = null;
    _stagingChunkSize = 0;

    // ── Interaction ───────────────────────────────────────────────────────
    _hitTest = new SpatialHitTester();
    _lastLayout: PlotLayout | null = null;
    _hoveredIndex = -1;
    _pinnedIndex = -1;

    // ── Last-frame cache (for chrome overlay-only redraws) ────────────────
    _lastXDomain: AxisDomain | null = null;
    _lastYDomain: AxisDomain | null = null;
    _lastXTicks: number[] | null = null;
    _lastYTicks: number[] | null = null;
    _lastGradientStops: import("../../theme/gradient").GradientStop[] | null =
        null;
    _lastHasColorCol = false;

    // ── Per-frame theme/palette cache (shared across render + overlay) ────
    // resolveTheme / readSeriesPalette each call getComputedStyle — ~100µs.
    // Zoom dispatches redraw at 60Hz; we resolve once per frame and reuse.
    // Null until first render populates; chrome-only redraws fall back to
    // fresh resolution if these are null (should never happen in practice).
    _lastTheme: import("../../theme/theme").Theme | null = null;
    _lastSeriesPalette: [number, number, number][] | null = null;
    // Memoized categorical LUT stops — `ensureGradientTexture` uses
    // reference-equality on this array to skip rebuilding the 256-sample
    // texture. Key is a cheap identity over inputs; hit means reuse prior
    // reference so the GPU upload elides.
    _lastLutStops: import("../../theme/gradient").GradientStop[] | null = null;
    _lastLutKey = "";

    attachTooltip(glCanvas: HTMLCanvasElement): void {
        this._glCanvas = glCanvas;
        this._tooltip.attach(glCanvas, {
            onHover: (mx, my) => handleContinuousHover(this, mx, my),
            onLeave: () => {
                if (this._hoveredIndex !== -1) {
                    this._hoveredIndex = -1;
                    renderContinuousChromeOverlay(this);
                }
            },
            onPin: () => {
                if (this._hoveredIndex >= 0) {
                    showContinuousPinnedTooltip(this, this._hoveredIndex);
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
        const chunkLength = endRow - startRow;
        this._glManager = glManager;
        if (startRow === 0) {
            this._cancelScheduledRender();
            initContinuousPipeline(this, glManager, columns, endRow);
        }

        if (chunkLength === 0) return;
        processContinuousChunk(
            this,
            glManager,
            columns,
            startRow,
            chunkLength,
            endRow,
        );

        this._scheduleRender(glManager);
    }

    redraw(glManager: WebGLContextManager): void {
        if (glManager.uploadedCount === 0 && this._dataCount === 0) return;
        this._glManager = glManager;
        this._fullRender(glManager);
    }

    protected _fullRender(glManager: WebGLContextManager): void {
        renderContinuousFrame(this, glManager);
    }

    protected destroyInternal(): void {
        this.glyph.destroy(this);
        this._glyphCache = null;
        this._gradientCache = null;
        this._allColumns = [];
        this._xData = null;
        this._yData = null;
        this._colorData = null;
        this._numericRowData.clear();
        this._stringRowData.clear();
        this._uniqueColorLabels.clear();
        this._hitTest.clear();
        this._stagingPositions = null;
        this._stagingColors = null;
        this._stagingSizes = null;
        this._splitGroups = [];
        this._seriesUploadedCounts = [];
        dismissContinuousPinnedTooltip(this);
    }
}

// ── Convenience subclasses with nullary constructors ─────────────────────
// `index.ts` registers plugin tags via `new ImplClass()`, so each chart
// type needs a parameterless constructor. These wrappers pin the glyph.

import { PointGlyph } from "./glyphs/points";
import { LineGlyph } from "./glyphs/lines";

/** X/Y Scatter — continuous chart with the point glyph. */
export class ScatterChart extends ContinuousChart {
    constructor() {
        super(new PointGlyph());
    }
}

/** X/Y Line — continuous chart with the line glyph. */
export class LineChart extends ContinuousChart {
    constructor() {
        super(new LineGlyph());
    }
}
