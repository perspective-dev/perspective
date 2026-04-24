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
import { PlotLayout } from "../../layout/plot-layout";
import type { CategoricalLevel } from "../../chrome/categorical-axis";
import type { FacetGrid } from "../../layout/facet-grid";
import {
    buildHeatmapPipeline,
    partitionColumnsPerFacet,
    type HeatmapCell,
    type HeatmapPipelineResult,
} from "./heatmap-build";
import {
    renderHeatmapFrame,
    renderHeatmapChromeOverlay,
    type HeatmapLocations,
} from "./heatmap-render";
import { handleHeatmapHover } from "./heatmap-interact";

/**
 * One heatmap in a facet-grid layout. Each facet corresponds to one
 * user-selected column in the `Color` slot; its `pipeline` holds the
 * cell data, and `layout` is the cell's `PlotLayout` from `buildFacetGrid`.
 * `instanceStart`/`instanceCount` give the range of the packed
 * cell/colorT buffers that belong to this facet.
 */
export interface HeatmapFacet {
    label: string;
    pipeline: HeatmapPipelineResult;
    layout: PlotLayout;
    instanceStart: number;
    instanceCount: number;
}

/**
 * Heatmap chart. `yIdx` maps 1:1 to the arrow column iteration order
 * (after skipping `__ROW_PATH_N__` metadata). `xIdx` is the row index
 * post-`rowOffset`.
 *
 * With one user column in the `Color` slot the chart renders a single
 * heatmap filling the canvas. With more than one, each column becomes
 * its own heatmap in a facet grid; all facets share a common color
 * scale and a single legend.
 */
export class HeatmapChart extends AbstractChart {
    _program: WebGLProgram | null = null;
    _locations: HeatmapLocations | null = null;
    _cornerBuffer: WebGLBuffer | null = null;
    _gradientCache:
        | import("../../webgl/gradient-texture").GradientTextureCache
        | null = null;

    _xLevels: CategoricalLevel[] = [];
    _yLevels: CategoricalLevel[] = [];
    _yColumnNames: string[] = [];
    _numX = 0;
    _numY = 0;
    _rowOffset = 0;

    _cells: HeatmapCell[] = [];
    _cells2D: (HeatmapCell | null)[] = [];
    _uploadedCells = 0;

    _colorMin = 0;
    _colorMax = 1;
    _aggName = "";

    _hoveredCell: HeatmapCell | null = null;
    _lastLayout: PlotLayout | null = null;

    _facets: HeatmapFacet[] = [];
    _facetGrid: FacetGrid | null = null;
    _hoveredFacetIdx = -1;

    /** Bound accessor so the interact module can trigger a chrome redraw. */
    _renderChromeOverlay = () => renderHeatmapChromeOverlay(this);

    attachTooltip(glCanvas: HTMLCanvasElement): void {
        this._glCanvas = glCanvas;
        this._tooltip.attach(glCanvas, {
            onHover: (mx, my) => handleHeatmapHover(this, mx, my),
            onLeave: () => {
                if (this._hoveredCell) {
                    this._hoveredCell = null;
                    this._renderChromeOverlay();
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

        if (startRow !== 0) {
            // Heatmap renders a single consolidated pass; the viewer
            // should not chunk this but guard defensively.
            return;
        }
        this._cancelScheduledRender();

        const userColumns = this._columnSlots.filter((s): s is string => !!s);

        if (userColumns.length > 1) {
            const partitions = partitionColumnsPerFacet(columns, userColumns);
            const facets: HeatmapFacet[] = [];
            const allCells: HeatmapCell[] = [];
            let globalMin = Infinity;
            let globalMax = -Infinity;
            for (const part of partitions) {
                const pipeline = buildHeatmapPipeline({
                    columns: part.columns,
                    numRows: endRow,
                    groupBy: this._groupBy,
                });
                const instanceStart = allCells.length;
                // Re-stamp each cell with its facet offset so the packed
                // instance buffer can be drawn in one sweep; the facet's
                // own `pipeline.cells` keeps its original indices for
                // hit-testing via `cells2D`.
                for (const c of pipeline.cells) {
                    allCells.push({
                        xIdx: c.xIdx,
                        yIdx: c.yIdx,
                        value: c.value,
                    });
                }
                facets.push({
                    label: part.label,
                    pipeline,
                    layout: new PlotLayout(1, 1, {
                        hasXLabel: false,
                        hasYLabel: false,
                        hasLegend: false,
                    }),
                    instanceStart,
                    instanceCount: pipeline.cells.length,
                });
                if (
                    isFinite(pipeline.colorMin) &&
                    pipeline.colorMin < globalMin
                ) {
                    globalMin = pipeline.colorMin;
                }
                if (
                    isFinite(pipeline.colorMax) &&
                    pipeline.colorMax > globalMax
                ) {
                    globalMax = pipeline.colorMax;
                }
            }
            if (!isFinite(globalMin) || !isFinite(globalMax)) {
                globalMin = 0;
                globalMax = 1;
            } else if (globalMin === globalMax) {
                globalMax = globalMin + 1;
            }

            // Reset single-plot state so render-time dispatch on
            // `_facets.length > 0` is unambiguous.
            this._xLevels = [];
            this._yLevels = [];
            this._yColumnNames = [];
            this._numX = 0;
            this._numY = 0;
            this._rowOffset = 0;
            this._cells2D = [];
            this._lastLayout = null;

            this._facets = facets;
            this._cells = allCells;
            this._colorMin = globalMin;
            this._colorMax = globalMax;
            this._aggName = userColumns.join(", ");
        } else {
            const result = buildHeatmapPipeline({
                columns,
                numRows: endRow,
                groupBy: this._groupBy,
            });

            this._facets = [];
            this._facetGrid = null;
            this._xLevels = result.xLevels;
            this._yLevels = result.yLevels;
            this._yColumnNames = result.yColumnNames;
            this._numX = result.numX;
            this._numY = result.numY;
            this._rowOffset = result.rowOffset;
            this._cells = result.cells;
            this._cells2D = result.cells2D;
            this._colorMin = result.colorMin;
            this._colorMax = result.colorMax;
            this._aggName = userColumns[0] ?? "Color";
        }

        this._scheduleRender(glManager);
    }

    redraw(glManager: WebGLContextManager): void {
        this._glManager = glManager;
        const hasSingle = this._numX > 0 && this._numY > 0;
        const hasFacets = this._facets.length > 0;
        if (!hasSingle && !hasFacets) return;
        this._fullRender(glManager);
    }

    protected _fullRender(glManager: WebGLContextManager): void {
        renderHeatmapFrame(this, glManager);
    }

    protected destroyInternal(): void {
        if (this._cornerBuffer && this._glManager) {
            this._glManager.gl.deleteBuffer(this._cornerBuffer);
        }
        this._program = null;
        this._locations = null;
        this._cornerBuffer = null;
        this._xLevels = [];
        this._yLevels = [];
        this._yColumnNames = [];
        this._cells = [];
        this._cells2D = [];
        this._hoveredCell = null;
        this._facets = [];
        this._facetGrid = null;
        this._hoveredFacetIdx = -1;
    }
}
