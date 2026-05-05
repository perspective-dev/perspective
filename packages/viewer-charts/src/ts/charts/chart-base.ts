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
import { LazyRowFetcher } from "../data/lazy-row";
import type { WebGLContextManager } from "../webgl/context-manager";
import {
    ZoomController,
    type ZoomConfig,
} from "../interaction/zoom-controller";
import {
    DEFAULT_FACET_CONFIG,
    type ChartImplementation,
    type FacetConfig,
} from "./chart";
import {
    TooltipController,
    type HostSink,
    type TooltipCallbacks,
} from "../interaction/tooltip-controller";
import { resolveThemeFromVars, type Theme } from "../theme/theme";
import { requestRender as scheduleRender } from "../render/scheduler";

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
     * Source-column types for `group_by` columns — sourced from
     * `table.schema()` (plain columns) merged with `view.expression_schema()`
     * (expression-typed group_bys). Distinct from `_columnTypes` (which
     * is the post-aggregation `view.schema()` map): the level-type
     * lookup for `__ROW_PATH_N__` columns must use the unaggregated
     * type, since `view.schema()` doesn't key these synthetic columns.
     */
    _groupByTypes: Record<string, string> = {};
    _columnsConfig: Record<string, any> = {};
    _defaultChartType: string | undefined = undefined;
    _facetConfig: FacetConfig = { ...DEFAULT_FACET_CONFIG };

    _tooltip = new TooltipController();

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
    }

    setGroupByTypes(schema: Record<string, string>): void {
        this._groupByTypes = schema;
    }

    setColumnsConfig(cfg: Record<string, any>): void {
        this._columnsConfig = cfg ?? {};
    }

    setDefaultChartType(chartType: string): void {
        this._defaultChartType = chartType;
    }

    setFacetConfig(cfg: FacetConfig): void {
        this._facetConfig = { ...cfg };
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
        this._tooltip.dismiss();
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
