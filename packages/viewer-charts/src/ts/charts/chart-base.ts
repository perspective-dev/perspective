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
import {
    createNumberFormatter,
    createDatetimeFormatter,
    createDateFormatter,
    sourceColumn,
    type NumberFormatConfig,
    type DateFormatConfig,
} from "@perspective-dev/viewer/src/ts/column-format.js";
import type { ColumnDataMap } from "../data/view-reader";
import { LazyRowFetcher } from "../data/lazy-row";
import { formatTickValue, formatDateTickValue } from "../layout/ticks";
import type { WebGLContextManager } from "../webgl/context-manager";
import {
    ZoomController,
    type ZoomConfig,
} from "../interaction/zoom-controller";
import {
    DEFAULT_FACET_CONFIG,
    DEFAULT_PLUGIN_CONFIG,
    type ChartImplementation,
    type FacetConfig,
    type PluginConfig,
} from "./chart";
import {
    TooltipController,
    type HostSink,
    type TooltipCallbacks,
    type UserClickPayload,
    type UserSelectPayload,
} from "../interaction/tooltip-controller";
import type { PerspectiveClickDetail } from "../event-detail";
import type { ViewConfig } from "@perspective-dev/client";
import { resolveThemeFromVars, type Theme } from "../theme/theme";
import { requestRender as scheduleRender } from "../render/scheduler";

/**
 * Locale-aware fallback formatter applied to numeric tooltip / legend
 * values when the column has no `number_format` configured. Two
 * fractional digits matches the legacy datagrid default and gives
 * tooltips a stable display width.
 */
const DEFAULT_VALUE_FORMATTER: (v: number) => string = ((): ((
    v: number,
) => string) => {
    return formatTickValue;
    // const intl = createNumberFormatter("float");
    // return (v) => intl.format(v);
})();

/**
 * Locale-aware fallback formatter for datetime tooltip / legend values
 * when the column has no `date_format` configured. Uses the locale
 * default (no `dateStyle` / `timeStyle`) to match what most users
 * expect from an `Intl.DateTimeFormat()` constructed with no options.
 */
const DEFAULT_DATETIME_FORMATTER: (v: number) => string = ((): ((
    v: number,
) => string) => {
    return formatDateTickValue;
    // const intl = createDatetimeFormatter();
    // return (v) => intl.format(v);
})();

/**
 * Base class for WebGL chart implementations. Owns the common lifecycle
 * plumbing (canvas wiring, viewer config setters, tooltip controller)
 * so each concrete chart only implements data pipeline, rendering, and
 * destruction hooks.
 *
 * ## Frame lifecycle (three phases)
 *
 * Every render of a chart passes through three phases:
 *
 * 1. `uploadAndRender(glManager, columns, startRow, endRow)`.
 *    Driven by the plugin wrapper once per data chunk. The subclass
 *    runs its build pipeline (axis/series resolution, record
 *    generation, domain accumulation) and pushes typed-array results
 *    into GPU buffers via `glManager.bufferPool`. Most charts also
 *    compile their shaders lazily here on first call.
 *
 * 2. `requestRender(glManager)` — single entrypoint for triggering a
 *    paint. Routes through the module-level scheduler
 *    ([render/scheduler.ts]) which coalesces by glManager and runs
 *    `_fullRender` + `awaitGpuFence` + `endFrame` on the next RAF.
 *    Concurrent requests collapse to one `_fullRender` per frame and
 *    fence waits across charts run in parallel, so per-chart latency
 *    is bounded by that chart's own GPU work.
 *
 * 3. `_fullRender(glManager)` — the subclass implements its own draw
 *    loop: resolve visible domains from the zoom controller, build
 *    projection matrices, call into its glyph draw helpers, and paint
 *    the chrome overlay (axes, legend, tooltip).
 *
 * `destroy()` is called by the plugin wrapper on teardown. It detaches
 * tooltip listeners, then invokes the subclass's `destroyInternal()`
 * to free chart-specific GL resources.
 *
 * ## What subclasses implement
 *   - `uploadAndRender` — phase 1; ends by `await this.requestRender(glManager)`.
 *   - `tooltipCallbacks()` — return chart-specific hover/click handlers.
 *   - `_fullRender` — phase 3; must be safe to call with no data
 *     (subclass guards on its own state machine — empty trees, missing
 *     programs, etc — and returns early without touching GL).
 *   - `destroyInternal` — release chart-specific resources.
 *
 * `getZoomConfig()` is an optional override; default = both axes
 * zoom-unlocked. See {@link ZoomConfig}.
 */
export abstract class AbstractChart implements ChartImplementation {
    // Access is `public` so the per-chart helper modules
    // (e.g. `./bar/bar-build.ts`) can read/write these without fighting
    // TypeScript's `protected` check. The underscore prefix marks them
    // as internal by convention.
    _glManager: WebGLContextManager | null = null;
    _gridlineCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    _chromeCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

    /**
     * Host-supplied CSS-variable map. The host snapshots its DOM via
     * `snapshotThemeVars(el)` and ships it over the control channel;
     * the chart decodes via `resolveThemeFromVars` lazily in
     * `_resolveTheme()`. The chart never reads the DOM itself (it
     * always runs inside `WorkerRenderer`, possibly off-thread).
     */
    _themeVars: Record<string, string> = {};
    _zoomController: ZoomController | null = null;

    /**
     * Per-facet zoom controllers. Populated when `zoom_mode ===
     * "independent"` and the chart enters faceted mode; each facet's
     * render path reads its own viewport from the matching entry.
     *
     * Shared-zoom mode leaves this empty; `_zoomController` is the
     * single domain used for every facet.
     */
    _facetZoomControllers: ZoomController[] = [];

    _columnSlots: (string | null)[] = [];
    _groupBy: string[] = [];
    _splitBy: string[] = [];
    _columnTypes: Record<string, string> = {};

    /**
     * Effective shared-axis flags for the most recent faceted frame.
     * Derived per-frame from `_facetConfig.shared_x_axis` /
     * `shared_y_axis` and `zoom_mode` via
     * {@link computeEffectiveFacetFlags} — independent-zoom mode forces
     * both off because an outer axis band has no single domain it could
     * display. Stored here (rather than mutated back onto
     * `_facetConfig`) so the user's configured shared-axis preferences
     * survive a "shared → independent → shared" round-trip. Read by
     * chrome-overlay code (e.g. `renderFacetedChromeOverlay`,
     * `renderFacetedHeatmapChromeOverlay`) after the main render pass
     * sets them.
     */
    _lastEffectiveSharedX = false;
    _lastEffectiveSharedY = false;

    /**
     * Source-column types for `group_by` columns — sourced from
     * `table.schema()` (plain columns) merged with `view.expression_schema()`
     * (expression-typed group_bys). Distinct from `_columnTypes` (which
     * is the post-aggregation `view.schema()` map): the level-type
     * lookup for `__ROW_PATH_N__` columns must use the unaggregated
     * type, since `view.schema()` doesn't key these synthetic columns.
     */
    _groupByTypes: Record<string, string> = {};
    _columnsConfig: Record<string, any> = {};

    /**
     * Pre-compiled per-column value formatters, keyed by the **source**
     * column name (synthetic split-by paths are normalized via
     * `sourceColumn`). Rebuilt by `setColumnsConfig` from the active
     * plugin's `column_config_schema` output, then consulted by axis /
     * tooltip / legend paths via {@link getColumnFormatter}.
     *
     * `undefined` means "no configured formatter for this column" — the
     * caller falls back to the chart's hand-rolled tick formatter.
     */
    _columnFormatters: Map<string, (v: number) => string> = new Map();
    _defaultChartType: string | undefined = undefined;
    _facetConfig: FacetConfig = { ...DEFAULT_FACET_CONFIG };

    /**
     * Plugin-scoped global configuration. Updated by `setPluginConfig`
     * (driven from the host's `plugin.restore()`) and read by render-
     * path glyphs (`line_width_px`, `point_size_px`, etc.) and by the
     * build pipelines (`auto_alt_y_axis`, `band_inner_frac`,
     * `bar_inner_pad`). Defaults preserve the previous compile-time
     * constants so first-frame rendering before `restore()` matches
     * the pre-refactor output.
     */
    _pluginConfig: PluginConfig = { ...DEFAULT_PLUGIN_CONFIG };

    _tooltip = new TooltipController();

    /**
     * Reference to the active host sink, captured in {@link attachTooltip}.
     * Used to emit `perspective-click` / `perspective-global-filter` user
     * events back to the host. Distinct from `_tooltip._host` to avoid
     * reaching into the tooltip controller's internals.
     */
    _hostSink: HostSink | null = null;

    /**
     * Promise chain that serializes user-event emissions so a rapid
     * pin → unpin sequence stays in order even when `buildClickDetail`
     * awaits `_lazyRows.fetchRow`. Without the queue, click 1's async
     * row fetch could resolve AFTER click 2's synchronous `emitUnselect`
     * — flipping the host's observed event order. All emit helpers
     * (`emitClickAndSelect`, `emitUserClick`, `emitUserSelect`,
     * `emitUnselect`) chain through this.
     */
    _emitQueue: Promise<void> = Promise.resolve();

    /**
     * Cached resolved theme — populated on first `_resolveTheme()` call,
     * cleared by `invalidateTheme()` (driven from `plugin.restyle()`).
     * `getComputedStyle` / `getPropertyValue` reads cost ~100µs each;
     * zoom/hover dispatch redraws at 60Hz so we resolve once and reuse.
     */
    _theme: Theme | null = null;

    /**
     * On-demand single-row fetcher used by lazy tooltip column
     * lookups. Reset on every `setView` call; subclasses read
     * `_lazyRows.fetchRow(rowIdx)` from their hover/pin paths and
     * compare a captured serial against the current hovered/pinned
     * state at resolution time, so stale fetches never paint.
     *
     * Can be `null` on chart types that don't surface the View
     * (unit-tested charts) or before the first `draw`.
     */
    _lazyRows: LazyRowFetcher | null = null;

    //  ChartImplementation setters (trivial stores)

    setGridlineCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
        this._gridlineCanvas = canvas;
    }

    setChromeCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
        this._chromeCanvas = canvas;
    }

    setTheme(vars: Record<string, string>): void {
        this._themeVars = vars;
        this._theme = null;
    }

    setZoomController(zc: ZoomController): void {
        this._zoomController = zc;
        zc.configure(this.getZoomConfig());
    }

    /**
     * Resolve the zoom controller that owns facet `idx`. In shared-zoom
     * mode (default) this is always the chart's single `_zoomController`.
     * In independent-zoom mode the router provisions one controller per
     * facet; this returns the matching entry, allocating on demand so
     * the render path never has to check `zoom_mode` itself.
     */
    getZoomControllerForFacet(idx: number): ZoomController | null {
        if (this._facetConfig.zoom_mode === "shared") {
            return this._zoomController;
        }

        if (!this._zoomController) {
            return null;
        }

        let zc = this._facetZoomControllers[idx];
        if (!zc) {
            zc = new ZoomController();
            zc.configure(this.getZoomConfig());
            this._facetZoomControllers[idx] = zc;
        }

        return zc;
    }

    /**
     * Derive the effective shared-X / shared-Y flags for the current
     * frame and stamp them onto `_lastEffectiveSharedX/Y` for downstream
     * chrome-overlay code to consume. Independent-zoom mode forces both
     * shared flags off — the outer axis band cannot display per-cell
     * viewports — without mutating the user's stored `_facetConfig`.
     *
     * Returns `{ independentZoom, effectiveSharedX, effectiveSharedY }`
     * for callers that need the values immediately (e.g. to pass
     * `xAxis: "outer" | "cell"` into `buildFacetGrid`).
     */
    computeEffectiveFacetFlags(): {
        independentZoom: boolean;
        effectiveSharedX: boolean;
        effectiveSharedY: boolean;
    } {
        const independentZoom = this._facetConfig.zoom_mode === "independent";
        const effectiveSharedX =
            !independentZoom && this._facetConfig.shared_x_axis;
        const effectiveSharedY =
            !independentZoom && this._facetConfig.shared_y_axis;
        this._lastEffectiveSharedX = effectiveSharedX;
        this._lastEffectiveSharedY = effectiveSharedY;
        return { independentZoom, effectiveSharedX, effectiveSharedY };
    }

    /**
     * Wire every active zoom controller's layout pointer for the
     * supplied facet cells. In shared-zoom mode every
     * `getZoomControllerForFacet(i)` returns the same `_zoomController`,
     * so iterating past the first cell would just re-write the same
     * pointer — `break`-on-shared keeps the cost O(1) and avoids the
     * subtle bug where every facet's `updateLayout` overwrites the
     * previous one with the last cell's layout.
     */
    syncFacetZoomLayouts(
        cells: ReadonlyArray<{
            layout: import("../layout/plot-layout").PlotLayout;
        }>,
    ): void {
        const independent = this._facetConfig.zoom_mode === "independent";
        for (let i = 0; i < cells.length; i++) {
            this.getZoomControllerForFacet(i)?.updateLayout(cells[i].layout);
            if (!independent) {
                return;
            }
        }
    }

    /**
     * Set base domain on every zoom controller owned by this chart.
     */
    setZoomBaseDomain(
        xMin: number,
        xMax: number,
        yMin: number,
        yMax: number,
    ): void {
        if (this._zoomController) {
            this._zoomController.setBaseDomain(xMin, xMax, yMin, yMax);
        }

        for (const zc of this._facetZoomControllers) {
            if (zc) {
                zc.setBaseDomain(xMin, xMax, yMin, yMax);
            }
        }
    }

    /**
     * Zoom-controller config for this chart type. Subclasses override to
     * pin an axis (e.g. bar charts pin the categorical axis). Default:
     * both axes freely zoomable.
     */
    protected getZoomConfig(): ZoomConfig {
        return {};
    }

    setColumnSlots(slots: (string | null)[]): void {
        this._columnSlots = slots;
    }

    setViewPivots(groupBy: string[], splitBy: string[]): void {
        this._groupBy = groupBy;
        this._splitBy = splitBy;
    }

    setColumnTypes(schema: Record<string, string>): void {
        this._columnTypes = schema;
        this._rebuildColumnFormatters();
    }

    /**
     * Clear any `domain_mode: "expand"` accumulator state. Driven by
     * `plugin.draw()` (a fresh `draw` always indicates a view-level
     * change — viewer config, filters, sorts, etc. — that invalidates
     * the previously-accumulated extent) and by the worker's
     * `resetAllZooms` path (user clicked "Reset Zoom"). `plugin.update()`
     * deliberately does *not* call this — same view, more data, the
     * accumulator should keep growing. No-op on the base; chart
     * families that hold accumulator fields override.
     */
    resetExpandedDomain(): void {}

    setGroupByTypes(schema: Record<string, string>): void {
        this._groupByTypes = schema;
    }

    setColumnsConfig(cfg: Record<string, any>): void {
        this._columnsConfig = cfg ?? {};
        this._rebuildColumnFormatters();
    }

    /**
     * Rebuild {@link _columnFormatters} from `_columnsConfig` +
     * `_columnTypes`. Called from both `setColumnsConfig` and
     * `setColumnTypes` since either side of the (config, types) pair
     * can arrive first depending on the host's restore order. Idempotent.
     */
    private _rebuildColumnFormatters(): void {
        this._columnFormatters = new Map();
        for (const [name, columnCfg] of Object.entries(this._columnsConfig)) {
            // `_columnTypes` is the post-aggregation `view.schema()` map
            // and doesn't key group_by source columns; fall back to
            // `_groupByTypes` so a configured `date_format` on a
            // group_by column (e.g. an "Order Date" pivot) still
            // compiles to an `Intl.DateTimeFormat` rather than being
            // silently dropped.
            const type = this._columnTypes[name] ?? this._groupByTypes[name];
            const fmt = this._compileColumnFormatter(type, columnCfg);
            if (fmt) {
                this._columnFormatters.set(name, fmt);
            }
        }
    }

    private _compileColumnFormatter(
        type: string | undefined,
        cfg: Record<string, any> | undefined,
    ): ((v: number) => string) | undefined {
        if (!type || !cfg) {
            return undefined;
        }

        if (type === "integer" || type === "float") {
            const numberFormat = cfg.number_format as
                | NumberFormatConfig
                | undefined;
            if (!numberFormat) {
                return undefined;
            }

            const intl = createNumberFormatter(type, numberFormat);
            return (v) => intl.format(v);
        }

        if (type === "datetime") {
            const dateFormat = cfg.date_format as DateFormatConfig | undefined;
            if (!dateFormat) {
                return undefined;
            }

            const intl = createDatetimeFormatter(dateFormat);
            return (v) => intl.format(v);
        }

        if (type === "date") {
            const dateFormat = cfg.date_format as DateFormatConfig | undefined;
            if (!dateFormat) {
                return undefined;
            }

            const intl = createDateFormatter(dateFormat);
            return (v) => intl.format(v);
        }

        return undefined;
    }

    /**
     * Returns the formatter for `columnName` if one has been configured
     * (via `column_config_schema` + the user's sidebar choices), else a
     * type-appropriate fallback for the chart context.
     *
     * @param columnName May be a synthetic split-by path
     *   (`<split_val>|...|<source_col>`); the source column is recovered
     *   internally before lookup.
     * @param context `"tick"` returns `undefined` when no per-column
     *   formatter is configured, so the receiving axis renderer can
     *   apply its own step-aware default (adaptive date precision from
     *   tick spacing, K/M/B suffixes for numerics). `"value"` returns
     *   a precise `Intl.NumberFormat` / `Intl.DateTimeFormat` fallback —
     *   appropriate for tooltips, legends, overlays where the caller
     *   invokes the formatter directly and needs a guaranteed function.
     */
    getColumnFormatter(
        columnName: string | null | undefined,
        context: "tick",
    ): ((v: number) => string) | undefined;
    getColumnFormatter(
        columnName: string | null | undefined,
        context?: "value",
    ): (v: number) => string;
    getColumnFormatter(
        columnName: string | null | undefined,
        context: "tick" | "value" = "value",
    ): ((v: number) => string) | undefined {
        if (columnName) {
            const formatter = this._columnFormatters.get(
                sourceColumn(columnName),
            );
            if (formatter) {
                return formatter;
            }
        }

        if (context === "tick") {
            return undefined;
        }

        // `_columnTypes` is the post-aggregation schema and doesn't
        // key group_by source columns (their post-aggregate form is
        // `__ROW_PATH_N__`); fall back to `_groupByTypes` so date /
        // datetime group_by axes don't get formatted as numbers.
        const sourceName = columnName ? sourceColumn(columnName) : undefined;
        const type = sourceName
            ? (this._columnTypes[sourceName] ?? this._groupByTypes[sourceName])
            : undefined;

        if (type === "date" || type === "datetime") {
            return DEFAULT_DATETIME_FORMATTER;
        }

        return DEFAULT_VALUE_FORMATTER;
    }

    setDefaultChartType(chartType: string): void {
        this._defaultChartType = chartType;
    }

    setFacetConfig(cfg: FacetConfig): void {
        this._facetConfig = { ...cfg };
    }

    /**
     * Apply plugin-scoped global config. Stores `cfg` for later reads
     * and mirrors the overlapping fields onto adjacent state so deep
     * render code keeps reading the single struct it already does:
     *
     *  - `facet_mode` / `facet_zoom_mode` sync into `_facetConfig` so
     *    `cartesian-render.ts` (and the treemap/sunburst grid checks)
     *    keep working unchanged.
     *  - `series_zoom_mode` toggles the `_autoFitValue` flag declared
     *    on `CategoricalYChart` ("dynamic" = refit on zoom, "fixed" =
     *    pinned to full extent). Harmless write on charts that don't
     *    expose the field.
     *
     * Render-path uniform fields (`line_width_px`, `point_size_px`,
     * `wick_width_px`, `ohlc_line_width_px`) are read directly from
     * `_pluginConfig` by their respective glyphs on each draw — no
     * sync needed. Build-time fields (`auto_alt_y_axis`,
     * `band_inner_frac`, `bar_inner_pad`) are read by the pipeline
     * inputs in `uploadAndRender`; they take effect on next data load.
     */
    setPluginConfig(cfg: PluginConfig): void {
        this._pluginConfig = { ...cfg };
        this._facetConfig = {
            ...this._facetConfig,
            facet_mode: cfg.facet_mode,
            zoom_mode: cfg.facet_zoom_mode,
        };

        (this as { _autoFitValue?: boolean })._autoFitValue =
            cfg.series_zoom_mode === "dynamic";
    }

    /**
     * Lazily decode the host-supplied theme vars. Subsequent calls hit
     * the cache until `invalidateTheme()` clears it. Render-path
     * callers should always read theme values through this method so
     * the parsed `Theme` (gradient stops, palette, etc.) amortizes
     * across an entire frame.
     */
    _resolveTheme(): Theme {
        if (!this._theme) {
            this._theme = resolveThemeFromVars(this._themeVars);
        }

        return this._theme;
    }

    /**
     * Drop the cached theme so the next `_resolveTheme()` call re-decodes
     * from `_themeVars`. Wired to `plugin.restyle()` — the host pushes
     * a fresh var snapshot before invalidating.
     */
    invalidateTheme(): void {
        this._theme = null;
    }

    /**
     * Install a new view for lazy row fetches. Disposes any prior
     * fetcher and dismisses the pinned tooltip — the prior pinned
     * row index has no guaranteed correspondence in the new view
     * (pivot / filter / sort changes can all reshuffle rows).
     */
    setView(view: View): void {
        if (this._lazyRows) {
            this._lazyRows.dispose();
        }

        this._lazyRows = new LazyRowFetcher(view);
        // A view change (filter / pivot / sort / schema) implicitly
        // dismisses any active pin — the prior row index has no
        // guaranteed correspondence in the new view. Emit a matching
        // `selected: false` so downstream filter-coordinated consumers
        // can roll back their derived state.
        const wasPinned = this._tooltip.isPinned;
        this._tooltip.dismiss();
        if (wasPinned) {
            this.emitUnselect();
        }
    }

    /**
     * Build the chart-specific {@link TooltipCallbacks} object — the
     * `onHover` / `onLeave` / `onClickPre` / `onPin` / `onDblClick`
     * surface that mediates between the cursor and chart state.
     * Subclasses override this; the base returns a no-op pair.
     */
    protected tooltipCallbacks(): TooltipCallbacks {
        return {
            onHover: () => {},
            onLeave: () => {},
        };
    }

    /**
     * Wire the chart's `TooltipController` for virtual-dispatch
     * `InteractionEvent`s forwarded from the host, and install the
     * host sink that materializes pinned tooltips and cursor changes
     * host-side.
     */
    attachTooltip(host: HostSink): void {
        this._tooltip.attach(this.tooltipCallbacks());
        this._tooltip.setHost(host);
        this._hostSink = host;
    }

    /**
     * Build a `PerspectiveClickDetail` payload from a per-family
     * resolved click target. Fetches the source-view row via
     * `_lazyRows` (returns `row: {}` if the row can't be resolved —
     * e.g., aggregate / density cells), and concatenates the
     * `group_by` and `split_by` pivot values into a
     * `viewer.restore({ filter })`-shaped patch.
     *
     * Mirrors the filter-building logic in datagrid's
     * `getCellConfig` ([packages/viewer-datagrid/src/ts/get_cell_config.ts]),
     * but operates on `AbstractChart` state rather than a `DatagridModel`.
     */
    async buildClickDetail(target: {
        rowIdx: number | null;
        columnName: string;
        groupByValues: (string | number | null)[];
        splitByValues: (string | number | null)[];
    }): Promise<PerspectiveClickDetail> {
        let row: Record<string, unknown> = {};
        if (target.rowIdx != null && target.rowIdx >= 0 && this._lazyRows) {
            try {
                const r = await this._lazyRows.fetchRow(target.rowIdx);
                row = Object.fromEntries(r);
            } catch {
                // Fetcher may have been disposed mid-flight; treat as
                // "no row" and emit the filter-only detail anyway.
                row = {};
            }
        }

        const filter: Array<[string, "==", string | number]> = [];
        for (let i = 0; i < this._groupBy.length; i++) {
            const v = target.groupByValues[i];
            if (v != null && v !== "") {
                filter.push([this._groupBy[i], "==", v]);
            }
        }

        for (let i = 0; i < this._splitBy.length; i++) {
            const v = target.splitByValues[i];
            if (v != null && v !== "") {
                filter.push([this._splitBy[i], "==", v]);
            }
        }

        return {
            row,
            column_names: [target.columnName],
            config: { filter } as Partial<ViewConfig>,
        };
    }

    /**
     * Forward a `perspective-click` to the host. No-op when the chart
     * has not been wired to a host sink (e.g., unit-tested charts).
     * Synchronous; callers needing ordering with async emits should
     * chain through `_emitQueue`.
     */
    emitUserClick(detail: PerspectiveClickDetail): void {
        const payload: UserClickPayload = {
            row: detail.row,
            column_names: detail.column_names,
            config: detail.config as { filter?: unknown[] },
        };
        this._hostSink?.emitUserClick?.(payload);
    }

    /**
     * Forward a `perspective-global-filter` to the host. The host
     * transport materializes a `PerspectiveSelectDetail` from this plus
     * its cached previous-insert config and dispatches. Synchronous.
     */
    emitUserSelect(args: {
        selected: boolean;
        row: Record<string, unknown>;
        column_names: string[];
        insertConfig: Partial<ViewConfig>;
    }): void {
        const payload: UserSelectPayload = {
            selected: args.selected,
            row: args.row,
            column_names: args.column_names,
            insertConfig: args.insertConfig as { filter?: unknown[] },
        };
        this._hostSink?.emitUserSelect?.(payload);
    }

    /**
     * Convenience: fire both `perspective-click` and
     * `perspective-global-filter` (`selected: true`) from a resolved
     * click target. Used by chart families where every click both
     * "selects" and "filters" (series, heatmap, candlestick, scatter,
     * treemap-leaf, etc.). Treemap branch / breadcrumb gestures use
     * the lower-level helpers directly.
     *
     * Chains through `_emitQueue` so the row-fetch await can't reorder
     * this emit behind a follow-up `emitUnselect`.
     */
    emitClickAndSelect(target: {
        rowIdx: number | null;
        columnName: string;
        groupByValues: (string | number | null)[];
        splitByValues: (string | number | null)[];
    }): Promise<void> {
        const next = this._emitQueue.then(async () => {
            const detail = await this.buildClickDetail(target);
            this.emitUserClick(detail);
            this.emitUserSelect({
                selected: true,
                row: detail.row,
                column_names: detail.column_names,
                insertConfig: detail.config,
            });
        });
        // Swallow errors on the chain so a single failure doesn't
        // poison subsequent emits; surface to console for debugging.
        this._emitQueue = next.catch((e) => {
            console.error("emitClickAndSelect failed", e);
        });
        return next;
    }

    /**
     * Fire a `perspective-global-filter` with `selected: false`. Used
     * by treemap / sunburst breadcrumb navigation and by chart-base's
     * own `setView` when a view change implicitly dismisses any active
     * pin. Chains through `_emitQueue` so it lands AFTER any in-flight
     * `emitClickAndSelect`.
     */
    emitUnselect(
        args: {
            row?: Record<string, unknown>;
            column_names?: string[];
        } = {},
    ): void {
        const next = this._emitQueue.then(() => {
            this.emitUserSelect({
                selected: false,
                row: args.row ?? {},
                column_names: args.column_names ?? [],
                insertConfig: { filter: [] },
            });
        });
        this._emitQueue = next.catch((e) => {
            console.error("emitUnselect failed", e);
        });
    }

    //  Render entrypoint

    /**
     * Public coalesced render. Routes through the module-level
     * scheduler so concurrent calls collapse to one `_fullRender` per
     * RAF and the host blitter receives one bitmap per frame. The
     * returned promise resolves after this chart's `awaitGpuFence` +
     * `endFrame` chain — independent of other charts in the same
     * RAF, which run their fence waits in parallel.
     *
     * Every render-triggering caller — upload chunks, zoom / pan,
     * resize, theme invalidation, host-driven redraws — calls this.
     * The only sanctioned bypass is `snapshotPng`, which calls
     * `_fullRender` directly to keep the GL backbuffer intact for
     * `gl.readPixels`.
     */
    requestRender(glManager: WebGLContextManager): Promise<void> {
        return scheduleRender(glManager, () => this._fullRender(glManager));
    }

    //  Lifecycle

    destroy(): void {
        this._tooltip.detach();
        this._tooltip.dismiss();
        if (this._lazyRows) {
            this._lazyRows.dispose();
            this._lazyRows = null;
        }

        this.destroyInternal();
    }

    //  Abstract surface

    abstract uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): Promise<void>;

    abstract _fullRender(glManager: WebGLContextManager): void;

    /**
     * Release chart-specific GL/CPU resources. `destroy` calls this.
     */
    protected abstract destroyInternal(): void;
}
