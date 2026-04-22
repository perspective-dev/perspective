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
import { buildHeatmapPipeline, type HeatmapCell } from "./heatmap-build";
import {
    renderHeatmapFrame,
    renderHeatmapChromeOverlay,
    type HeatmapLocations,
} from "./heatmap-render";
import { handleHeatmapHover } from "./heatmap-interact";

/**
 * Heatmap chart. `yIdx` maps 1:1 to the arrow column iteration order
 * (after skipping `__ROW_PATH_N__` metadata). `xIdx` is the row index
 * post-`rowOffset`. The first column in the `Color` slot is the only one
 * consumed; additional columns are ignored (enforced externally).
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

        const result = buildHeatmapPipeline({
            columns,
            numRows: endRow,
            groupBy: this._groupBy,
        });

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
        this._aggName =
            this._columnSlots.find((s): s is string => !!s) ?? "Color";

        this._scheduleRender(glManager);
    }

    redraw(glManager: WebGLContextManager): void {
        this._glManager = glManager;
        if (this._numX === 0 || this._numY === 0) return;
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
    }
}
