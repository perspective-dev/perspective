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
import { TooltipController } from "../interaction/tooltip-controller";

/**
 * Base class for WebGL chart implementations. Owns the common lifecycle
 * plumbing (canvas wiring, viewer config setters, render-batching RAF,
 * tooltip controller) so each concrete chart only implements data pipeline,
 * rendering, and destruction hooks.
 *
 * ## Frame lifecycle (three phases)
 *
 * Every render of a chart passes through three phases:
 *
 * 1. **Upload** — `uploadAndRender(glManager, columns, startRow, endRow)`.
 *    Driven by the plugin wrapper once per data chunk. The subclass
 *    runs its build pipeline (axis/series resolution, record
 *    generation, domain accumulation) and pushes typed-array results
 *    into GPU buffers via `glManager.bufferPool`. Most charts also
 *    compile their shaders lazily here on first call.
 *
 * 2. **Schedule** — `_scheduleRender(glManager)`, called by the
 *    subclass at the end of `uploadAndRender` (and any state-change
 *    path that needs a redraw: hover, legend toggle, zoom). This is a
 *    cheap RAF-coalesced trigger — idempotent within a frame, so
 *    multiple sources can call it without stacking work.
 *
 * 3. **Render** — `_fullRender(glManager)` fires on the next animation
 *    frame. The subclass implements its own draw loop here: resolve
 *    visible domains from the zoom controller, build projection
 *    matrices, call into its glyph draw helpers, and paint the chrome
 *    overlay (axes, legend, tooltip).
 *
 * `redraw(glManager)` is a public shortcut for "skip the upload,
 * re-render with whatever is already on the GPU" — used by the zoom
 * controller and the resize path.
 *
 * `destroy()` is called by the plugin wrapper on teardown. It detaches
 * tooltip listeners, cancels any pending RAF, then invokes the
 * subclass's `destroyInternal()` to free chart-specific GL resources.
 *
 * ## What subclasses implement
 *   - `uploadAndRender` — phase 1.
 *   - `redraw` — usually a one-liner that delegates to `_fullRender`.
 *   - `attachTooltip(glCanvas)` — wire `this._tooltip` hover/click
 *     callbacks into chart-specific state mutators.
 *   - `_fullRender` — phase 3.
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
    _gridlineCanvas: HTMLCanvasElement | null = null;
    _chromeCanvas: HTMLCanvasElement | null = null;
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
    _glCanvas: HTMLCanvasElement | null = null;

    _columnSlots: (string | null)[] = [];
    _groupBy: string[] = [];
    _splitBy: string[] = [];
    _columnTypes: Record<string, string> = {};
    _columnsConfig: Record<string, any> = {};
    _defaultChartType: string | undefined = undefined;
    _facetConfig: FacetConfig = { ...DEFAULT_FACET_CONFIG };

    _tooltip = new TooltipController();

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

    private _renderScheduled = false;
    private _renderRAFId = 0;

    // ── ChartImplementation setters (trivial stores) ───────────────────────

    setGridlineCanvas(canvas: HTMLCanvasElement): void {
        this._gridlineCanvas = canvas;
    }

    setChromeCanvas(canvas: HTMLCanvasElement): void {
        this._chromeCanvas = canvas;
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
        if (!this._zoomController) return null;
        let zc = this._facetZoomControllers[idx];
        if (!zc) {
            zc = new ZoomController();
            zc.configure(this.getZoomConfig());
            this._facetZoomControllers[idx] = zc;
        }
        return zc;
    }

    /**
     * Seed base domain on every zoom controller owned by this chart.
     * Build paths call this once per load with the accumulated data
     * extents; independent-zoom facets share the same base so visual
     * zoom levels stay comparable across facets.
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
            if (zc) zc.setBaseDomain(xMin, xMax, yMin, yMax);
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
     * Install a new view for lazy row fetches. Disposes any prior
     * fetcher and dismisses the pinned tooltip — the prior pinned
     * row index has no guaranteed correspondence in the new view
     * (pivot / filter / sort changes can all reshuffle rows).
     *
     * TODO: future work will keep pinned tooltips visible with their
     * last-resolved lines until the user explicitly dismisses them,
     * so a mid-session view update doesn't blow away focused context.
     */
    setView(view: View): void {
        if (this._lazyRows) {
            this._lazyRows.dispose();
        }
        this._lazyRows = new LazyRowFetcher(view);
        this._tooltip.dismissPinned();
    }

    // ── Render batching ────────────────────────────────────────────────────

    /** Schedule one `_fullRender` on the next animation frame (idempotent). */
    protected _scheduleRender(glManager: WebGLContextManager): void {
        if (this._renderScheduled) return;
        this._renderScheduled = true;
        this._renderRAFId = requestAnimationFrame(() => {
            this._renderScheduled = false;
            this._renderRAFId = 0;
            this._fullRender(glManager);
        });
    }

    /** Cancel any pending render (used when a new stream begins). */
    protected _cancelScheduledRender(): void {
        if (this._renderRAFId) {
            cancelAnimationFrame(this._renderRAFId);
            this._renderRAFId = 0;
            this._renderScheduled = false;
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    destroy(): void {
        this._tooltip.detach();
        this._tooltip.dismissPinned();
        this._cancelScheduledRender();
        if (this._lazyRows) {
            this._lazyRows.dispose();
            this._lazyRows = null;
        }
        this.destroyInternal();
    }

    // ── Abstract surface ───────────────────────────────────────────────────

    abstract uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): void;

    abstract redraw(glManager: WebGLContextManager): void;

    abstract attachTooltip(glCanvas: HTMLCanvasElement): void;

    protected abstract _fullRender(glManager: WebGLContextManager): void;

    /** Release chart-specific GL/CPU resources. `destroy` calls this. */
    protected abstract destroyInternal(): void;
}
