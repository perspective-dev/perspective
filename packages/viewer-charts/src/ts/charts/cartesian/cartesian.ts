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

    //  GL resources
    // Shared: gradient LUT texture (used by both glyphs for color mapping).
    _gradientCache: GradientTextureCache | null = null;

    // Glyph-owned cache (program, attribute locations, scratch buffers).
    _glyphCache: any = null;

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
            onPin: () => {
                if (this._hoveredIndex >= 0) {
                    showCartesianPinnedTooltip(this, this._hoveredIndex);
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

        await this.requestRender(glManager);
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
        this._glyphCache = null;
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
