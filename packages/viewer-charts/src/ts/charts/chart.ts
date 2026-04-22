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

import type { ColumnDataMap } from "../data/view-reader";
import type { WebGLContextManager } from "../webgl/context-manager";
import type { ZoomController } from "../interaction/zoom-controller";

export interface ChartImplementation {
    uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): void;

    /** Re-render with existing GPU buffer data (e.g., after resize). */
    redraw(glManager: WebGLContextManager): void;

    /** Set the gridline canvas (behind WebGL, for gridlines). */
    setGridlineCanvas?(canvas: HTMLCanvasElement): void;

    /** Set the chrome canvas (above WebGL, for axes/labels/legend/tooltip). */
    setChromeCanvas?(canvas: HTMLCanvasElement): void;

    /** Set the zoom controller for interactive zoom/pan. */
    setZoomController?(zc: ZoomController): void;

    /** Attach tooltip mouse handlers to the GL canvas. */
    attachTooltip?(glCanvas: HTMLCanvasElement): void;

    /** Set the column slot config (with nulls for empty slots). */
    setColumnSlots?(slots: (string | null)[]): void;

    /** Set group_by and split_by config from the viewer. */
    setViewPivots?(groupBy: string[], splitBy: string[]): void;

    /** Set column type schema from the view (e.g., { "col": "date" }). */
    setColumnTypes?(schema: Record<string, string>): void;

    /**
     * Set per-column render config (the second argument to `plugin.restore`).
     * Key is the aggregate base name; value is an open object whose
     * `chart_type` / `stack` fields are consumed by the Y-bar glyph router.
     */
    setColumnsConfig?(cfg: Record<string, any>): void;

    /**
     * Set the plugin's default glyph type. Used by the Y-series chart
     * family (Y Bar / Y Line / Y Scatter / Y Area): each tag is the same
     * `BarChart` impl with a different starting `chart_type` applied to
     * columns that lack an explicit entry in `columns_config`.
     */
    setDefaultChartType?(chartType: string): void;

    destroy(): void;
}
