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

import type { View } from "@perspective-dev/client";
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

    /**
     * Hand the current View to the chart so it can make on-demand
     * per-row queries (for lazy tooltip column lookups). Called on
     * every `draw`; the chart disposes any prior fetcher and clears
     * dependent UI (pinned tooltip) so stale rows never surface.
     *
     * TODO: pinned tooltips are dismissed on view update today. A
     * future enhancement is to keep a pinned tooltip visible (with its
     * captured data) until the user dismisses it, even after the
     * underlying view no longer contains that row.
     */
    setView?(view: View): void;

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

    /**
     * Set the faceting config: one small-multiple sub-plot per
     * `split_by` group, optional shared axes, coordinated tooltip, and
     * zoom routing mode. Currently seeded from the `FACET_CONFIG`
     * const in `plugin.ts`; eventually this will pass through
     * `columns_config`.
     */
    setFacetConfig?(cfg: FacetConfig): void;

    destroy(): void;
}

export interface FacetConfig {
    /** "grid" = small multiples (default); "overlay" = legacy single-plot. */
    facet_mode: "grid" | "overlay";
    /** Share one bottom X axis across all columns of facets. */
    shared_x_axis: boolean;
    /** Share one left Y axis across all rows of facets. */
    shared_y_axis: boolean;
    /** Paint a tooltip in every facet (otherwise only the source facet). */
    coordinated_tooltip: boolean;
    /** "shared" = one viewport for all facets; "independent" = per-facet. */
    zoom_mode: "shared" | "independent";
    /** Pixel gap between adjacent facet cells in grid mode. */
    facet_padding: number;
}

export const DEFAULT_FACET_CONFIG: FacetConfig = {
    facet_mode: "grid",
    shared_x_axis: true,
    shared_y_axis: true,
    coordinated_tooltip: false,
    zoom_mode: "shared",
    facet_padding: 6,
};
