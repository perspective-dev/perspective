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
import { type AxisDomain } from "../../axis/numeric-axis";
import type { GradientTextureCache } from "../../webgl/gradient-texture";
import type { Glyph } from "./glyph";
import {
    initCartesianPipeline,
    processCartesianChunk,
} from "./cartesian-build";
import {
    renderCartesianFrame,
    renderCartesianChromeOverlay,
} from "./cartesian-render";
import {
    handleCartesianHover,
    showCartesianPinnedTooltip,
    dismissCartesianPinnedTooltip,
} from "./cartesian-interact";
import type { LabelInterner } from "./label-interner";
import { LazyTooltip } from "../../interaction/lazy-tooltip";

export interface SplitGroup {
    prefix: string;
    xColName: string;
    yColName: string;
    colorColName: string;
    sizeColName: string;
    labelColName: string;
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
export class CartesianChart extends AbstractChart {
    readonly glyph: Glyph;

    constructor(glyph: Glyph) {
        super();
        this.glyph = glyph;
    }

    /**
     * Rendering pipeline selector. `"cartesian"` is the default —
     * draws axes, gridlines, and ticks via the chrome canvas.
     * `"map"` (set by `MapChart` subclasses) suppresses cartesian
     * chrome and inserts a raster tile layer underneath the glyph
     * draw in `_fullRender`, so the same glyphs (point / line /
     * density) render on top of a basemap.
     *
     * Read in `cartesian-render.ts` at three branch points; the
     * `"cartesian"` path is byte-for-byte unchanged by the addition
     * of this enum.
     */
    _renderMode: "cartesian" | "map" = "cartesian";

    /**
     * Per-point data-space projection hook. Default is identity; map
     * subclasses override to map (lon, lat) → Mercator meters. Called
     * from `processCartesianChunk` immediately after the NaN guard,
     * before extent accumulation and the `_xData` / `_yData` slot
     * writes — so every downstream consumer (axis domain, projection
     * matrix, spatial hit-test, glyph buffers) sees projected space
     * uniformly. Returning `[NaN, NaN]` from a subclass discards the
     * row (e.g. Mercator's ±85° latitude clamp).
     */
    projectPoint(x: number, y: number): [number, number] {
        return [x, y];
    }

    /**
     * Paint a per-frame background inside the plot-frame scissor,
     * before the glyph draw. Map subclasses override to render the
     * raster tile basemap; the default no-op leaves cartesian charts
     * byte-for-byte unchanged.
     *
     * Called once per facet in faceted mode (each call's `projection`
     * and `domain` are that cell's), wrapped in the cell's scissor —
     * just like `glyph.drawSeries`.
     *
     * `xOrigin` / `yOrigin` are the rebase origins the projection
     * matrix bakes in (see `buildProjectionMatrix`). Glyphs ship
     * pre-rebased positions, so the background pass must subtract
     * them from absolute-domain coords (e.g. tile Mercator extents)
     * before uploading vertex positions; otherwise the matrix
     * over-corrects and the background lands off-screen by
     * `sx * xOrigin` clip units.
     */
    renderBackground(
        _glManager: import("../../webgl/context-manager").WebGLContextManager,
        _layout: import("../../layout/plot-layout").PlotLayout,
        _projection: Float32Array,
        _domain: { xMin: number; xMax: number; yMin: number; yMax: number },
        _xOrigin: number,
        _yOrigin: number,
    ): void {
        // no-op for cartesian charts
    }

    /**
     * Paint chrome (attribution, scale bar) for map mode on top of the
     * chrome canvas, in place of the cartesian axes/gridlines/legend.
     * Called only when `_renderMode === "map"`. Default no-op so
     * cartesian charts still go through `renderAxesChrome`.
     */
    renderMapChrome(
        _canvas: import("../canvas-types").Canvas2D | null,
        _layout: import("../../layout/plot-layout").PlotLayout,
        _theme: import("../../theme/theme").Theme,
        _dpr: number,
    ): void {
        // no-op for cartesian charts
    }

    //  GL resources
    // Shared: gradient LUT texture (used by both glyphs for color mapping).
    _gradientCache: GradientTextureCache | null = null;

    //  Column roles
    _xName = "";
    _yName = "";
    _xLabel = "";
    _yLabel = "";
    _xIsRowIndex = false;
    _colorName = "";
    _sizeName = "";
    _labelName = "";
    _colorIsString = false;
    _splitGroups: SplitGroup[] = [];

    //  Data extents
    _xMin = Infinity;
    _xMax = -Infinity;
    _yMin = Infinity;
    _yMax = -Infinity;

    /**
     * Origin used to rebase x values before f32 narrowing. With datetime
     * x columns the absolute timestamp is ~1.7e12, beyond f32 precision;
     * storing `(x - _xOrigin)` keeps sub-millisecond fidelity in the
     * `_xData` mirror, the GPU position attribute, and the projection
     * matrix's `tx` term, avoiding the catastrophic cancellation that
     * would otherwise push points outside the clip volume. NaN until
     * the first valid x sample is observed.
     */
    _xOrigin = NaN;
    _yOrigin = NaN;
    _colorMin = Infinity;
    _colorMax = -Infinity;
    _sizeMin = Infinity;
    _sizeMax = -Infinity;

    /**
     * `domain_mode: "expand"` accumulators. The build pipeline seeds
     * `_xMin/_xMax/_yMin/_yMax/_colorMin/_colorMax/_sizeMin/_sizeMax`
     * from these instead of `±Infinity` when expand mode is active, so
     * the per-row scan naturally unions new data into the running
     * extent. Mirrored back from the live fields at the end of every
     * `processCartesianChunk` so multi-chunk uploads accumulate into
     * the same union. Cleared via `resetExpandedDomain` (called from
     * the worker's `resetAllZooms` and the view-config setters on
     * `AbstractChart`).
     */
    _expandedXMin = Infinity;
    _expandedXMax = -Infinity;
    _expandedYMin = Infinity;
    _expandedYMax = -Infinity;
    _expandedColorMin = Infinity;
    _expandedColorMax = -Infinity;
    _expandedSizeMin = Infinity;
    _expandedSizeMax = -Infinity;

    //  Data buffers (per-series slotted)
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

    /**
     * Source view row index for each slot in `_xData` / `_yData`,
     * sized and laid out identically. Split expansion duplicates the
     * same arrow source row across every series; this sidecar stores
     * that source index so lazy tooltip fetches can retrieve the
     * original row. Int32 for compactness — at 1M points this is
     * ~4 MB, a small fraction of the ~70 MB that the prior eager
     * row-data buffers cost.
     */
    _rowIndexData: Int32Array | null = null;

    /**
     * Slot-indexed string store for the scatter "Label" column. `null`
     * when no label column was wired. See {@link LabelInterner} — the
     * three formerly-separate label fields (`_labelData`,
     * `_labelDictionary`, `_labelDictMap`) live there as one unit, so
     * future label-related state stays cohesive instead of accreting
     * sibling fields on the chart.
     */
    _labels: LabelInterner | null = null;
    _dataCount = 0;
    _uniqueColorLabels: Map<string, number> = new Map();

    /**
     * Lazy-tooltip cache. `lines` is `null` until the async row fetch
     * resolves — the chrome overlay skips the tooltip text box in
     * that state but still paints the crosshair + highlight ring
     * from geometry data so the hover cue is immediate. The
     * controller owns the serial dance that drops stale resolves
     * when the user moves before the fetch returns. Target type is
     * the flat slot index of the hovered point.
     */
    _lazyTooltip = new LazyTooltip<number>();

    //  Staging scratch (reused across chunks)
    _stagingPositions: Float32Array | null = null;
    _stagingColors: Float32Array | null = null;
    _stagingSizes: Float32Array | null = null;
    _stagingChunkSize = 0;

    //  Interaction
    _hitTest = new SpatialHitTester();
    _lastLayout: PlotLayout | null = null;
    _hoveredIndex = -1;
    _pinnedIndex = -1;

    /**
     * Source facet for the current hover (`-1` when not over any facet).
     * Drives coordinated hover indicator painting in other facets.
     */
    _hoveredFacet = -1;

    //  Facet state (set when rendering in grid mode)
    _facetGrid: import("../../layout/facet-grid").FacetGrid | null = null;

    //  Last-frame cache (for chrome overlay-only redraws)
    _lastXDomain: AxisDomain | null = null;
    _lastYDomain: AxisDomain | null = null;
    _lastXTicks: number[] | null = null;
    _lastYTicks: number[] | null = null;
    _lastGradientStops: import("../../theme/gradient").GradientStop[] | null =
        null;
    _lastHasColorCol = false;

    // Memoized categorical LUT stops — `ensureGradientTexture` uses
    // reference-equality on this array to skip rebuilding the 256-sample
    // texture. The cache key carries the inputs that determine the
    // resolved palette: `seriesPalette` reference (changes per theme,
    // since `_resolveTheme` returns a fresh `Theme` after
    // `invalidateTheme()` clears the cache) plus `labelCount`. Without
    // the `seriesPalette` reference compare a `restyle()` could leave
    // the chart painting with the prior theme's colors — same
    // `labelCount`/palette length but different RGB values.
    _lastLutStops: import("../../theme/gradient").GradientStop[] | null = null;
    _lastLutSeriesPalette: [number, number, number][] | null = null;
    _lastLutLabelCount = -1;

    protected override tooltipCallbacks() {
        return {
            onHover: (mx: number, my: number) =>
                handleCartesianHover(this, mx, my),
            onLeave: () => {
                if (this._hoveredIndex !== -1) {
                    this._hoveredIndex = -1;
                    renderCartesianChromeOverlay(this);
                }
            },
            onPin: (mx: number, my: number) => {
                // Refresh the hit-test at the click coords so the pin
                // path doesn't depend on the RAF-throttled hover state
                // — see comment in `series.ts` `onPin`.
                handleCartesianHover(this, mx, my);
                if (this._hoveredIndex >= 0) {
                    const flatIdx = this._hoveredIndex;
                    showCartesianPinnedTooltip(this, flatIdx);
                    void this._emitCartesianClickSelect(flatIdx);
                }
            },
            onUnpin: () => {
                this.emitUnselect();
            },
        };
    }

    /**
     * Resolve a clicked cartesian point into a `PerspectiveClickDetail`
     * and emit both `perspective-click` and
     * `perspective-global-filter selected:true`.
     *
     * Cartesian charts don't use `group_by` for positioning; X and Y
     * come from explicit user-selected columns. The only filter clause
     * we can build is the split-by prefix (when present). The source
     * row index is the chart's per-point `_rowIndexData[flatIdx]`
     * mirror — same lookup the lazy tooltip uses.
     */
    private async _emitCartesianClickSelect(flatIdx: number): Promise<void> {
        if (!this._rowIndexData) {
            return;
        }

        const rowIdx = this._rowIndexData[flatIdx];
        const yColumn = this._columnSlots[1] || this._columnSlots[0] || "";

        let splitByValues: (string | null)[] = [];
        if (this._splitGroups.length > 0 && this._seriesCapacity > 0) {
            const seriesIdx = Math.floor(flatIdx / this._seriesCapacity);
            const sg = this._splitGroups[seriesIdx];
            if (sg?.prefix && this._splitBy.length > 0) {
                splitByValues = sg.prefix.split("|");
            }
        }

        await this.emitClickAndSelect({
            rowIdx: rowIdx != null && rowIdx >= 0 ? rowIdx : null,
            columnName: yColumn,
            groupByValues: [],
            splitByValues,
        });
    }

    async uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): Promise<void> {
        const chunkLength = endRow - startRow;
        this._glManager = glManager;
        if (startRow === 0) {
            initCartesianPipeline(this, glManager, columns, endRow);
        }

        if (chunkLength === 0) {
            return;
        }

        processCartesianChunk(
            this,
            glManager,
            columns,
            startRow,
            chunkLength,
            endRow,
        );

        // `domain_mode: "expand"` mirror-back. `processCartesianChunk`
        // updates `_xMin/_xMax` etc. in place against the seeded value
        // (the prior accumulator); the union is in `_xMin` etc., so we
        // copy it back. Idempotent across multi-chunk uploads — every
        // chunk leaves the accumulator equal to the running union.
        if (this._pluginConfig.domain_mode === "expand") {
            this._expandedXMin = this._xMin;
            this._expandedXMax = this._xMax;
            this._expandedYMin = this._yMin;
            this._expandedYMax = this._yMax;
            this._expandedColorMin = this._colorMin;
            this._expandedColorMax = this._colorMax;
            this._expandedSizeMin = this._sizeMin;
            this._expandedSizeMax = this._sizeMax;
        }

        await this.requestRender(glManager);
    }

    override resetExpandedDomain(): void {
        this._expandedXMin = Infinity;
        this._expandedXMax = -Infinity;
        this._expandedYMin = Infinity;
        this._expandedYMax = -Infinity;
        this._expandedColorMin = Infinity;
        this._expandedColorMax = -Infinity;
        this._expandedSizeMin = Infinity;
        this._expandedSizeMax = -Infinity;
    }

    _fullRender(glManager: WebGLContextManager): void {
        if (glManager.uploadedCount === 0 && this._dataCount === 0) {
            return;
        }

        this._glManager = glManager;
        renderCartesianFrame(this, glManager);
    }

    protected destroyInternal(): void {
        this.glyph.destroy(this);
        this._gradientCache = null;
        this._xData = null;
        this._yData = null;
        this._colorData = null;
        this._rowIndexData = null;
        this._labels = null;
        this._lazyTooltip.clearHover();
        this._uniqueColorLabels.clear();
        this._hitTest.clear();
        this._stagingPositions = null;
        this._stagingColors = null;
        this._stagingSizes = null;
        this._splitGroups = [];
        this._seriesUploadedCounts = [];
        dismissCartesianPinnedTooltip(this);
    }
}

//  Convenience subclasses with nullary constructors
// `index.ts` registers plugin tags via `new ImplClass()`, so each chart
// type needs a parameterless constructor. These wrappers pin the glyph.

import { PointGlyph } from "./glyphs/points";
import { LineGlyph } from "./glyphs/lines";
import { DensityGlyph } from "./glyphs/density";

/**
 * X/Y Scatter — continuous chart with the point glyph.
 */
export class ScatterChart extends CartesianChart {
    constructor() {
        super(new PointGlyph());
    }
}

/**
 * X/Y Line — continuous chart with the line glyph.
 */
export class LineChart extends CartesianChart {
    constructor() {
        super(new LineGlyph());
    }
}

/**
 * Density — continuous chart that rasterizes each row as an
 * additive radial splat, producing a density field over the plot rect.
 * Shares the cartesian pipeline (build, hit-test, zoom, facets,
 * tooltips); the glyph swaps the per-point glyph for the heat
 * accumulation + resolve pair.
 */
export class DensityChart extends CartesianChart {
    constructor() {
        super(new DensityGlyph());
    }
}
