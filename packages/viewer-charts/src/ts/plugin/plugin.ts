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
import type {
    HTMLPerspectiveViewerElement,
    IPerspectiveViewerPlugin,
} from "@perspective-dev/viewer";
import { ChartTypeConfig } from "./charts";
import style from "../../css/perspective-viewer-charts.css";
import { DEFAULT_FACET_CONFIG, type FacetConfig } from "../charts/chart";
import { RawEventForwarder } from "../interaction/raw-event-forwarder";
import { RendererTransport } from "../transport/renderer-transport";
import { RENDER_BLIT_MODE } from "../config";

/**
 * Compile-time facet configuration. Baked in at module load for now —
 * flip values here + rebuild to toggle small-multiples behavior. When
 * the UI wires `columns_config` through `restore`, this const seeds
 * the default and per-column overrides win.
 */
const FACET_CONFIG: FacetConfig = {
    ...DEFAULT_FACET_CONFIG,

    // Flip to "overlay" to fall back to the pre-facet single-plot
    // rendering of split_by (all splits drawn in one plot rect,
    // differentiated by color).
    facet_mode: "grid",
    shared_x_axis: true,
    shared_y_axis: true,
    coordinated_tooltip: false,

    // "independent" routes wheel/pan to the facet under the cursor and
    // each facet draws its own viewport.
    zoom_mode: "shared",
};

const GLOBAL_STYLES = (() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style);
    return [sheet];
})();

export class HTMLPerspectiveViewerWebGLPluginElement
    extends HTMLElement
    implements IPerspectiveViewerPlugin
{
    declare _chartType: ChartTypeConfig;
    declare static _chartType: ChartTypeConfig;

    private _initialized = false;
    private _glCanvas!: HTMLCanvasElement;
    private _gridlineCanvas!: HTMLCanvasElement;
    private _chromeCanvas!: HTMLCanvasElement;
    private _renderer: RendererTransport | null = null;
    private _rendererPromise: Promise<RendererTransport> | null = null;
    private _rawEventForwarder: RawEventForwarder | null = null;
    private _generation = 0;
    private _renderBlitMode: "direct" | "blit" = RENDER_BLIT_MODE;

    /**
     * Aborts the reset-zoom button click listener installed by
     * `_setupInteraction`. The button is part of the one-time scaffold
     * so it survives across renderer lifetimes, but each renderer
     * installs its own listener that captures its own
     * `RendererTransport` in a closure — without this, every
     * disconnect/reconnect cycle leaks one listener that fires
     * `resetAllZooms()` against a destroyed transport.
     */
    private _resetClickAbort: AbortController | null = null;

    connectedCallback() {
        if (!this._initialized) {
            // One-time scaffold: shadow root, adopted stylesheet, and
            // the persistent `.webgl-container` + `.zoom-controls`
            // subtree. The zoom controls live across renderer
            // lifetimes; only the canvas children get torn down on
            // disconnect because `transferControlToOffscreen` is a
            // one-shot operation per `<canvas>` element.
            this.attachShadow({ mode: "open" });
            for (const sheet of GLOBAL_STYLES) {
                this.shadowRoot!.adoptedStyleSheets.push(sheet);
            }

            this.shadowRoot!.innerHTML =
                `<div class="webgl-container">` +
                `<div class="zoom-controls">` +
                `<button class="zoom-reset">Reset Zoom</button>` +
                `</div>` +
                `</div>`;

            this._initialized = true;
        }

        // (Re)build the canvas stack on every connect — the previous
        // disconnect tore it down so its `transferControlToOffscreen`
        // poisoning doesn't leak into the next renderer.
        if (!this._glCanvas?.isConnected) {
            this._buildCanvasStack();
        }
    }

    /**
     * Insert a fresh canvas stack as the first children of
     * `.webgl-container`, leaving the trailing `.zoom-controls` div
     * untouched. Requeries the canvas references for the new
     * elements. Called from `connectedCallback` whenever the prior
     * stack has been removed (initial mount + every reconnect after
     * `_clearCanvasStack`).
     */
    private _buildCanvasStack(): void {
        const container = this.shadowRoot!.querySelector(".webgl-container")!;
        container.insertAdjacentHTML(
            "afterbegin",
            `<canvas class="webgl-gridlines"></canvas>` +
                `<canvas class="webgl-canvas"></canvas>` +
                `<canvas class="webgl-chrome"></canvas>`,
        );

        this._glCanvas =
            container.querySelector<HTMLCanvasElement>(".webgl-canvas")!;
        this._gridlineCanvas =
            container.querySelector<HTMLCanvasElement>(".webgl-gridlines")!;
        this._chromeCanvas =
            container.querySelector<HTMLCanvasElement>(".webgl-chrome")!;
    }

    /**
     * Remove the canvas children of `.webgl-container` and clear the
     * cached references. `transferControlToOffscreen` permanently
     * marks a canvas element as having relinquished control; the
     * elements are unrecoverable, so the only correct path is to
     * discard them and rebuild on the next connect.
     */
    private _clearCanvasStack(): void {
        const container = this.shadowRoot?.querySelector(".webgl-container");
        if (container) {
            for (const c of Array.from(container.querySelectorAll("canvas"))) {
                c.remove();
            }
        }

        this._glCanvas = null!;
        this._gridlineCanvas = null!;
        this._chromeCanvas = null!;
    }

    /**
     * Fires when the host (`<perspective-viewer>`) removes this plugin
     * from the DOM on chart-type switch — see
     * `renderer/activate.rs::remove_inactive_plugin`. Without this,
     * inactive plugin instances retain their `RendererTransport`
     * (worker + WebGL context + compiled shader programs) until the
     * entire viewer is torn down, so a user cycling all 12 chart kinds
     * holds 12 GL contexts per viewer and routinely exceeds the
     * browser's per-page context cap (~16) in workspaces.
     *
     * Order: `delete()` first so the worker tears down its
     * `WorkerRenderer` (which holds the only references to the
     * transferred `OffscreenCanvas` siblings); `_clearCanvasStack`
     * after, so we're not removing canvas elements that a live worker
     * is still painting into. The next `connectedCallback` rebuilds a
     * fresh canvas stack — `transferControlToOffscreen` is a one-shot
     * operation per element, so the prior canvases can't be reused.
     * Pays the ~30-100ms shader-precompile cost per activation — same
     * cost the `precompileShaders: true` flag was added to amortize on
     * first draw.
     */
    disconnectedCallback() {
        this.delete();
        this._clearCanvasStack();
    }

    /**
     * Lazy renderer construction. Memoizes the in-flight `init()`
     * promise so concurrent `draw()` calls during async setup await
     * the same initialization rather than racing.
     */
    private _ensureRenderer(view: View): Promise<RendererTransport> {
        if (!this._initialized) {
            this.connectedCallback();
        }

        if (this._rendererPromise) {
            return this._rendererPromise;
        }

        this._rendererPromise = this._buildRenderer(view).then((r) => {
            this._renderer = r;
            this._setupInteraction(r);
            return r;
        });

        return this._rendererPromise;
    }

    /**
     * Capture raw DOM events on the GL canvas with `RawEventForwarder`
     * and post them over the control channel. The renderer dispatches
     * them through its own resolver + `applyWheel` / `applyPan` for
     * zoom/pan, and through `TooltipController` virtual dispatch for
     * hover/click; `zoomChanged` updates push back so the reset-zoom
     * button visibility tracks the renderer-side state.
     *
     * The `zoomChanged` callback was wired at `RendererTransport`
     * construction time; here we just attach the event forwarder and
     * the reset-button click handler.
     */
    private _setupInteraction(renderer: RendererTransport): void {
        if (this._rawEventForwarder) {
            return;
        }

        const zoomControls = this.shadowRoot!.querySelector(
            ".zoom-controls",
        ) as HTMLDivElement | null;

        this._rawEventForwarder = new RawEventForwarder();
        this._rawEventForwarder.attach(this._glCanvas, (event) => {
            renderer.forwardInteraction(event);
        });

        // The reset-zoom button is part of the persistent scaffold —
        // not torn down on disconnect — so each new renderer must use
        // a fresh `AbortController` to install its click handler, and
        // `delete()` aborts it on teardown. Without the abort, every
        // disconnect/reconnect cycle would leak a listener that
        // captures the destroyed transport in its closure.
        const resetBtn = this.shadowRoot!.querySelector(".zoom-reset");
        if (resetBtn) {
            this._resetClickAbort = new AbortController();
            resetBtn.addEventListener(
                "click",
                () => {
                    renderer.resetAllZooms();
                    if (zoomControls) {
                        zoomControls.classList.remove("visible");
                    }
                },
                { signal: this._resetClickAbort.signal },
            );
        }
    }

    private async _buildRenderer(view: View): Promise<RendererTransport> {
        const viewer = this.parentElement as HTMLPerspectiveViewerElement;
        const client = await viewer.getClient();
        const viewer_class = customElements.get("perspective-viewer");
        const clientWasm = viewer_class.get_wasm_module();
        const clientWorkerURL = viewer_class.get_worker_url();

        // Resolve the source table name once at init so the worker can
        // open its own `Table` handle and serve `table.schema()` lookups
        // on the render path without a host-side await. `getTable()` may
        // be unavailable if the viewer hasn't loaded a table yet — pass
        // through `undefined` and the worker falls back to an empty
        // source schema.
        const table = await (viewer as any)?.getTable?.();
        const tableName: string | undefined = table
            ? await table.get_name()
            : undefined;

        const zoomControls = this.shadowRoot!.querySelector(
            ".zoom-controls",
        ) as HTMLDivElement | null;

        const transport = new RendererTransport({
            client,
            view,
            tableName,
            clientWorkerURL,
            clientWasm,
            chartTag: this._chartType.tag,
            maxCells: this._chartType.max_cells,

            // Eagerly compile every program in `SHADER_MANIFEST`
            // during renderer construction so the first-frame path
            // doesn't pay the inline compile cost. Trade-off: ~30-100ms
            // of init time per chart instance for a smoother first
            // paint. Flip to `false` if a deployment ships a
            // single-chart page where most shaders are dead weight.
            precompileShaders: true,
            onZoomChanged: (isDefault: boolean) => {
                if (zoomControls) {
                    zoomControls.classList.toggle("visible", !isDefault);
                }
            },
        });

        await transport.init({
            gl: this._glCanvas,
            gridlines: this._gridlineCanvas,
            chrome: this._chromeCanvas,
            facetConfig: FACET_CONFIG,
            defaultChartType: this._chartType.default_chart_type,
            renderBlitMode: this._renderBlitMode,
        });

        return transport;
    }

    setBlitMode(mode: "direct" | "blit") {
        console.assert(this._initialized, "Already initialized");
        this._renderBlitMode = mode;
    }

    get name() {
        return this._chartType.name;
    }

    get category() {
        return this._chartType.category;
    }

    get select_mode() {
        return this._chartType.selectMode;
    }

    get min_config_columns() {
        return this._chartType.initial.count;
    }

    get config_column_names() {
        return this._chartType.initial.names;
    }

    get max_cells() {
        return this._chartType.max_cells;
    }

    get max_columns() {
        return this._chartType.max_columns;
    }

    get priority() {
        return 0;
    }

    get group_rollups(): string[] {
        return ["flat"];
    }

    get render_warning() {
        return false;
    }

    set render_warning(_value: boolean) {
        // No-op: viewer toggles this after draw
    }

    can_render_column_styles(column_type: string, _group?: string) {
        // Every Y-series plugin exposes the Chart Type picker; they're
        // identified by having a `default_chart_type`.
        if (!this._chartType.default_chart_type) {
            return false;
        }

        return column_type === "integer" || column_type === "float";
    }

    column_config_schema(
        column_type: string,
        _group: string | undefined,
        _column_name: string,
        current_value: Record<string, unknown> | null,
        _viewer_config?: { group_by?: string[]; group_rollup_mode?: string },
    ) {
        const def = this._chartType.default_chart_type;
        if (!def) {
            return { fields: [] };
        }

        if (column_type !== "integer" && column_type !== "float") {
            return { fields: [] };
        }

        const fields: Array<Record<string, unknown> & { kind: string }> = [
            {
                kind: "Enum",
                key: "chart_type",
                label: "Chart Type",
                default: def,
                variants: [
                    { value: "bar", label: "Bar" },
                    { value: "line", label: "Line" },
                    { value: "scatter", label: "Scatter" },
                    { value: "area", label: "Area" },
                ],
            },
        ];

        // Stack only meaningful for Bar / Area. Re-query model: when the
        // user changes chart_type to line/scatter, the schema is fetched
        // again and `stack` is dropped.
        const effective_chart_type =
            (current_value?.chart_type as string | undefined) ?? def;
        const supports_stack =
            effective_chart_type === "bar" || effective_chart_type === "area";
        if (supports_stack) {
            fields.push({
                kind: "Bool",
                key: "stack",
                label: "Stack",
                default: true,
            });
        }

        return { fields };
    }

    async draw(view: View): Promise<void> {
        const gen = ++this._generation;
        const renderer = await this._ensureRenderer(view);
        if (this._generation !== gen) {
            return;
        }

        // Install the current View on the chart impl in the worker so
        // it can make on-demand per-row queries for lazy tooltip
        // lookups. Hover/tooltip is the one path that still drives
        // `View` calls outside `loadAndRender`.
        renderer.setView(view);
        renderer.setBufferMaxCapacity(this._chartType.max_cells);

        const viewer = this.parentElement as any;
        const viewerConfig = (await viewer?.getViewConfig?.()) ?? {};
        if (this._generation !== gen) {
            return;
        }

        // The worker owns every `Client`/`Table`/`View` await on the
        // render path now: row count, post-aggregation schema, expr
        // schema, source-table schema, and the `with_typed_arrays`
        // chunk fetch all run there. `viewerConfig` is a
        // `<perspective-viewer>` element API (not a `Client` method),
        // so it stays host-side and ships in the trigger msg.
        await renderer.loadAndRender({
            viewerConfig: {
                group_by: viewerConfig?.group_by ?? [],
                split_by: viewerConfig?.split_by ?? [],
                columns: viewerConfig?.columns ?? [],
            },
            options: { float32: true },
        });
    }

    async update(view: View): Promise<void> {
        return this.draw(view);
    }

    async clear(): Promise<void> {
        this._generation++;
        this._renderer?.clear();
    }

    async resize(): Promise<void> {
        this._renderer?.resize();
    }

    restyle() {
        this._renderer?.invalidateTheme();
        return 5;
    }

    save() {
        const state: any = {};
        const zoom = this._renderer?.saveZoom();
        if (zoom) {
            state.zoom = zoom;
        }

        return state;
    }

    async render(view: View): Promise<Blob> {
        // Cold-export safe: ensure the renderer exists and has drawn
        // the supplied view at least once before snapshotting. The
        // plugin may be invoked while not focused (e.g. programmatic
        // export from a viewer that hasn't yet displayed this chart).
        await this._ensureRenderer(view);
        await this.draw(view);
        return this._renderer!.snapshotPng();
    }

    restore(config: any, columns_config?: Record<string, any>) {
        if (config?.zoom) {
            this._renderer?.restoreZoom(config.zoom);
        }

        this._renderer?.setColumnsConfig(columns_config ?? {});
    }

    delete() {
        this._generation++;

        if (this._rawEventForwarder) {
            this._rawEventForwarder.detach();
            this._rawEventForwarder = null;
        }

        if (this._resetClickAbort) {
            this._resetClickAbort.abort();
            this._resetClickAbort = null;
        }

        if (this._renderer) {
            this._renderer.destroy();
            this._renderer = null;
        }

        // Clear the memoized init promise so re-activation rebuilds
        // the renderer instead of handing back a resolved promise that
        // points to the just-destroyed transport.
        this._rendererPromise = null;
    }
}
