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
import type { HostSink } from "../interaction/tooltip-controller";

export interface ChartImplementation {
    uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): void;

    /**
     * The single render entrypoint. Every render-triggering caller —
     * upload chunks, zoom / pan, resize, theme invalidation,
     * host-driven redraws — calls this. Routes through the
     * module-level scheduler ([render/scheduler.ts]) so concurrent
     * calls collapse to one `_fullRender` per RAF and the host
     * blitter receives one bitmap per frame per chart.
     *
     * The returned promise resolves after this entry's `_fullRender`
     * + `awaitGpuFence` + `endFrame` chain completes — independent
     * of other charts in the same RAF, which run their fence waits
     * in parallel.
     *
     * The synchronous-render bypass for `snapshotPng` (calls
     * `_fullRender` directly, skips `endFrame`) is the only
     * sanctioned exception and lives inside the worker renderer.
     */
    requestRender(glManager: WebGLContextManager): Promise<void>;

    /**
     * The chart-specific frame builder. The scheduler wraps this with
     * fence + `endFrame`; callers must not invoke it directly except
     * for `snapshotPng`, which needs an intact GL backbuffer for
     * `gl.readPixels` and so must skip the `endFrame` pair.
     */
    _fullRender(glManager: WebGLContextManager): void;

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

    /**
     * Set the gridline canvas (behind WebGL, for gridlines).
     */
    setGridlineCanvas?(canvas: HTMLCanvasElement | OffscreenCanvas): void;

    /**
     * Set the chrome canvas (above WebGL, for axes/labels/legend/tooltip).
     */
    setChromeCanvas?(canvas: HTMLCanvasElement | OffscreenCanvas): void;

    /**
     * Hand the chart a pre-computed CSS-variable map produced on the
     * main thread via `snapshotThemeVars(el)`, which it can decode into
     * a full `Theme` without touching the DOM (charts always run inside
     * the renderer scope, which has no `getComputedStyle`).
     */
    setTheme?(vars: Record<string, string>): void;

    /**
     * Set the zoom controller for interactive zoom/pan.
     */
    setZoomController?(zc: ZoomController): void;

    /**
     * Wire the chart's `TooltipController` for virtual-dispatch hover /
     * click events forwarded from the host. The renderer drives
     * `dispatchHover` / `dispatchLeave` / `dispatchClick` /
     * `dispatchDblClick` from `InteractionEvent`s; the supplied
     * `HostSink` posts pin / dismiss / setCursor intents back to the
     * host so the resulting DOM mutations happen there (the renderer
     * scope has no DOM in worker mode, and uses the same channel
     * in-process for symmetry).
     */
    attachTooltip?(host: HostSink): void;

    /**
     * Set the column slot config (with nulls for empty slots).
     */
    setColumnSlots?(slots: (string | null)[]): void;

    /**
     * Set group_by and split_by config from the viewer.
     */
    setViewPivots?(groupBy: string[], splitBy: string[]): void;

    /**
     * Set column type schema from the view (e.g., { "col": "date" }).
     */
    setColumnTypes?(schema: Record<string, string>): void;

    /**
     * Set the source-column types used for `group_by` level lookups —
     * sourced from `table.schema()` + `view.expression_schema()`. Used
     * by categorical-axis charts to detect numeric / date / boolean
     * group_by levels (which are not keyed in `view.schema()` because
     * they surface as `__ROW_PATH_N__` columns).
     */
    setGroupByTypes?(schema: Record<string, string>): void;

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

    /**
     * Drop any cached theme values so the next render re-reads CSS
     * variables. Driven from `plugin.restyle()`.
     */
    invalidateTheme?(): void;

    destroy(): void;
}

export interface FacetConfig {
    /**
     * "grid" = small multiples (default); "overlay" = legacy single-plot.
     */
    facet_mode: "grid" | "overlay";

    /**
     * Share one bottom X axis across all columns of facets.
     */
    shared_x_axis: boolean;

    /**
     * Share one left Y axis across all rows of facets.
     */
    shared_y_axis: boolean;

    /**
     * Paint a tooltip in every facet (otherwise only the source facet).
     */
    coordinated_tooltip: boolean;

    /**
     * "shared" = one viewport for all facets; "independent" = per-facet.
     */
    zoom_mode: "shared" | "independent";

    /**
     * Pixel gap between adjacent facet cells in grid mode.
     */
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
