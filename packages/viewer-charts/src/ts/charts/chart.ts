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
     * zoom routing mode. Seeded from `DEFAULT_FACET_CONFIG` at init;
     * `plugin_config.facet_mode` / `facet_zoom_mode` override the
     * matching fields via `AbstractChart.setPluginConfig`.
     */
    setFacetConfig?(cfg: FacetConfig): void;

    /**
     * Set the plugin-scoped global configuration — the values backing
     * `plugin_config_schema` / `plugin_config` in `restore`. Replaces
     * the previous module-level constants (`LINE_WIDTH_PX`,
     * `POINT_SIZE_PX`, `BAND_INNER_FRAC`, `BAR_INNER_PAD`,
     * `WICK_WIDTH_PX`, `OHLC_LINE_WIDTH_PX`, `AUTO_ALT_Y_AXIS`) plus
     * the faceted/series zoom-mode semantics described in
     * {@link PluginConfig}.
     */
    setPluginConfig?(cfg: PluginConfig): void;

    /**
     * Drop any cached theme values so the next render re-reads CSS
     * variables. Driven from `plugin.restyle()`.
     */
    invalidateTheme?(): void;

    /**
     * Clear the `domain_mode: "expand"` accumulator state so the next
     * data load starts from the current data extent. Driven from
     * `resetAllZooms` (the user clicked "Reset Zoom"). View-config
     * mutations route through `AbstractChart`'s `setColumnSlots` /
     * `setViewPivots` / `setColumnTypes` setters, which call the same
     * hook internally.
     */
    resetExpandedDomain?(): void;

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

/**
 * Plugin-scoped global configuration — the user-facing settings backing
 * `plugin_config_schema()` / the `plugin_config` slot in `restore`.
 *
 * Each chart type's `plugin_config_schema` returns only the fields that
 * are applicable for that chart (see `applicable_plugin_fields` on
 * `ChartTypeConfig`); inapplicable fields are hidden in the UI. The
 * chart impl receives the full struct on `setPluginConfig` and reads
 * only the fields its render / build pipeline cares about.
 *
 * Some fields overlap with {@link FacetConfig} (`facet_mode`,
 * `facet_zoom_mode`); the base `AbstractChart.setPluginConfig` syncs
 * those onto `_facetConfig` so deep render code keeps reading the
 * single facet struct it already does. `series_zoom_mode` toggles the
 * categorical-Y chart base's `_autoFitValue` flag.
 */
export interface PluginConfig {
    /**
     * Auto-detect Y dual-axis splits when aggregate magnitudes differ
     * by more than `DUAL_Y_RATIO_THRESHOLD`×. Series charts only.
     * Replaces the `AUTO_ALT_Y_AXIS` compile-time toggle.
     */
    auto_alt_y_axis: boolean;

    /**
     * Faceting strategy when `split_by` is non-empty.
     *
     * - `"grid"` — one small-multiple sub-plot per split group.
     * - `"overlay"` — single plot with split groups differentiated by
     *   color. Synced into `_facetConfig.facet_mode`.
     */
    facet_mode: "grid" | "overlay";

    /**
     * Faceted-cartesian zoom routing. `"shared"` — one viewport across
     * all facets; `"independent"` — wheel/pan routes to the facet under
     * the cursor with its own viewport. Synced into
     * `_facetConfig.zoom_mode`.
     */
    facet_zoom_mode: "shared" | "independent";

    /**
     * Series-chart value-axis behavior on zoom.
     *
     * - `"dynamic"` — value axis refits to the visible categorical
     *   slice (current default; `CategoricalYChart._autoFitValue` =
     *   true).
     * - `"fixed"` — value axis stays pinned to the full-data extent.
     */
    series_zoom_mode: "fixed" | "dynamic";

    /**
     * Anchor the value axis to zero — when true, `0` is forced into
     * the rendered domain even if all data sits well above or below
     * it. Natural for bar / area glyphs (which grow from the zero
     * baseline) and surprising for line / scatter (where the
     * interesting variation often lives far from zero). Per-chart-type
     * defaults route through `ChartTypeConfig.plugin_field_defaults`:
     * `true` for Y Bar / Y Area / X Bar, `false` elsewhere.
     */
    include_zero: boolean;

    /**
     * Domain accumulation policy across successive `View` updates.
     *
     * - `"fit"` — every update recomputes the rendered domain (and on
     *   cartesian charts, the X/Y range and color/size scales) from
     *   the current data extent. Can grow or shrink frame-to-frame.
     * - `"expand"` — the rendered domain monotonically *grows*: each
     *   update unions the new data extent with the previously rendered
     *   extent, so once a value is in scope it stays in scope. Reset
     *   by the "Reset Zoom" button, view-config changes (group_by /
     *   split_by / column-slot / column-type), or toggling back to
     *   `"fit"`.
     */
    domain_mode: "fit" | "expand";

    /**
     * Width of polyline glyphs in CSS pixels (multiplied by DPR at GL
     * upload). Replaces the duplicated `LINE_WIDTH_PX` constants in
     * the cartesian + series line glyphs.
     */
    line_width_px: number;

    /**
     * Diameter of scatter point glyphs in CSS pixels. Replaces
     * `POINT_SIZE_PX`.
     */
    point_size_px: number;

    /**
     * Fraction of each category band occupied by its slot(s). Replaces
     * `BAND_INNER_FRAC`. Affects buffer contents — takes effect on
     * next data load.
     */
    band_inner_frac: number;

    /**
     * Relative inner padding between adjacent slots within a band.
     * Replaces `BAR_INNER_PAD`. Affects buffer contents — takes effect
     * on next data load.
     */
    bar_inner_pad: number;

    /**
     * Candlestick wick stroke width in CSS pixels. Replaces
     * `WICK_WIDTH_PX`.
     */
    wick_width_px: number;

    /**
     * OHLC bar stroke width in CSS pixels. Replaces
     * `OHLC_LINE_WIDTH_PX`.
     */
    ohlc_line_width_px: number;

    /**
     * density splat radius in CSS pixels. Each data point is
     * rasterized as a soft disk of this radius into the accumulation
     * FBO before the gradient LUT pass resolves to a heat color.
     */
    gradient_radius_px: number;

    /**
     * density per-splat intensity multiplier. Controls how
     * fast the density grows when points overlap (low values produce
     * a smoother, more diffuse field; high values produce sharper
     * peaks).
     */
    gradient_intensity: number;

    /**
     * density clamp on the maximum accumulated heat used for
     * the gradient-LUT lookup. Lower values saturate sooner (more of
     * the LUT's hot stops show up); higher values stay cooler. In
     * every mode this controls the alpha (intensity) ramp; in
     * `density` mode it also drives the hue, and in `signed` mode it
     * scales the signed-sum-to-hue mapping.
     */
    gradient_heat_max: number;

    /**
     * density color-reduction mode. Controls how each pixel's
     * stack of overlapping splats is reduced to a single LUT-t / alpha
     * pair in the resolve pass.
     *
     * - `mean` (default) — hue is the density-weighted average of
     *   per-point color-t. Reads as "the typical color-column value
     *   in this region." Uses robust (5th/95th-percentile) bounds so
     *   one outlier can't compress the rest of the data toward the
     *   gradient midpoint.
     * - `density` — ignore the color column even when wired; hue and
     *   alpha both follow density. Reads as "where do points cluster."
     *   Useful when the color column is attached for tooltip lookup
     *   only.
     * - `extreme` — keep the per-pixel maximum signed deviation of
     *   `t - 0.5` (split into positive and negative channels, MAX-
     *   blended). Reads as "where are the outliers." Density still
     *   drives alpha so a single-point extreme fades naturally.
     *   Requires a second framebuffer; uses MRT on WebGL2 hardware
     *   with `OES_draw_buffers_indexed`, two passes otherwise.
     * - `signed` — accumulate signed `t - 0.5` and let positive vs
     *   negative cancel out. Reads as "net positive vs net negative
     *   in each region." Requires a float-capable framebuffer; on
     *   `UNSIGNED_BYTE` fallback hardware degrades silently to
     *   `mean` with a one-line console warning.
     */
    gradient_color_mode: "mean" | "density" | "extreme" | "signed";

    /**
     * Map basemap tile provider. Applies only to map plugin tags
     * (`map-scatter`, `map-line`, `map-density`). Cartesian charts
     * ignore the field. Surfaced as an enum on the settings panel so
     * users can switch light/dark/voyager without writing custom
     * tile-source code.
     */
    map_tile_provider: "carto-positron" | "carto-dark-matter" | "carto-voyager";

    /**
     * Map basemap alpha (0..1). Pre-multiplied into the tile fragment
     * shader's output so the chart's glyph layer composites over a
     * dimmer or brighter version of the basemap. `1.0` (default)
     * shows the tiles at full opacity.
     */
    map_tile_alpha: number;
}

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
    auto_alt_y_axis: false,
    facet_mode: "grid",
    facet_zoom_mode: "shared",
    series_zoom_mode: "dynamic",
    include_zero: false,
    domain_mode: "fit",
    line_width_px: 2.0,
    point_size_px: 8.0,
    band_inner_frac: 0.5,
    bar_inner_pad: 0.1,
    wick_width_px: 1.0,
    ohlc_line_width_px: 1.0,
    gradient_radius_px: 32.0,
    gradient_intensity: 0.6,
    gradient_heat_max: 4.0,
    gradient_color_mode: "mean",
    map_tile_provider: "carto-positron",
    map_tile_alpha: 1.0,
};
