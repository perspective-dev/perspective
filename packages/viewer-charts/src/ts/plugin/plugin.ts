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
    PluginStaticConfig,
} from "@perspective-dev/viewer";
import { ChartTypeConfig, PluginConfigField } from "./charts";
import style from "../../css/perspective-viewer-charts.css";
import {
    DEFAULT_FACET_CONFIG,
    DEFAULT_PLUGIN_CONFIG,
    type FacetConfig,
    type PluginConfig,
} from "../charts/chart";
import { RawEventForwarder } from "../interaction/raw-event-forwarder";
import { RendererTransport } from "../transport/renderer-transport";
import { RENDER_BLIT_MODE } from "../config";

/**
 * Facet-rendering defaults shared by every chart. Per-chart overrides
 * arrive through `plugin_config` (`facet_mode` + `facet_zoom_mode`);
 * the remaining fields (`shared_x_axis`, `shared_y_axis`,
 * `coordinated_tooltip`, `facet_padding`) are not yet user-configurable
 * — flip the defaults in `DEFAULT_FACET_CONFIG` to change globally.
 */
const FACET_CONFIG_DEFAULTS: FacetConfig = { ...DEFAULT_FACET_CONFIG };

/**
 * Static UI-control spec per `plugin_config` field. Mirrors the shape
 * `column_config_schema` already returns (datagrid). The runtime default
 * is sourced separately from the chart-type-effective defaults at
 * `fieldSpec` call time so per-chart overrides like
 * `include_zero=true` for Y Bar / Y Area / X Bar surface in the UI.
 */
type FieldSpec =
    | { kind: "Bool" }
    | {
          kind: "Enum";
          variants: ReadonlyArray<{ value: string; label: string }>;
      }
    | { kind: "Number"; min: number; max: number; step?: number };

const FIELD_SCHEMAS: Record<PluginConfigField, FieldSpec> = {
    auto_alt_y_axis: { kind: "Bool" },
    include_zero: { kind: "Bool" },
    domain_mode: {
        kind: "Enum",
        variants: [
            { value: "fit", label: "Fit" },
            { value: "expand", label: "Expand" },
        ],
    },
    facet_mode: {
        kind: "Enum",
        variants: [
            { value: "grid", label: "Grid" },
            { value: "overlay", label: "Overlay" },
        ],
    },
    facet_zoom_mode: {
        kind: "Enum",
        variants: [
            { value: "shared", label: "Shared" },
            { value: "independent", label: "Independent" },
        ],
    },
    series_zoom_mode: {
        kind: "Enum",
        variants: [
            { value: "dynamic", label: "Dynamic" },
            { value: "fixed", label: "Fixed" },
        ],
    },
    line_width_px: { kind: "Number", min: 0.5, step: 0.5, max: 16 },
    point_size_px: { kind: "Number", min: 1, max: 32 },
    band_inner_frac: { kind: "Number", min: 0.1, max: 1, step: 0.01 },
    bar_inner_pad: { kind: "Number", min: 0, max: 0.9, step: 0.01 },
    wick_width_px: { kind: "Number", min: 0.5, step: 0.5, max: 8 },
    ohlc_line_width_px: { kind: "Number", min: 0.5, step: 0.5, max: 8 },
    gradient_radius_px: { kind: "Number", min: 2, step: 1, max: 256 },
    gradient_intensity: { kind: "Number", min: 0.05, step: 0.05, max: 4 },
    gradient_heat_max: { kind: "Number", min: 0.1, step: 0.1, max: 64 },
    gradient_color_mode: {
        kind: "Enum",
        variants: [
            { value: "mean", label: "Mean (density-weighted)" },
            { value: "density", label: "Density only" },
            { value: "extreme", label: "Extremes" },
            { value: "signed", label: "Signed sum" },
        ],
    },
    map_tile_provider: {
        kind: "Enum",
        variants: [
            { value: "carto-positron", label: "Light (Positron)" },
            { value: "carto-dark-matter", label: "Dark Matter" },
            { value: "carto-voyager", label: "Voyager" },
        ],
    },
    map_tile_alpha: { kind: "Number", min: 0, max: 1, step: 0.05 },
};

function fieldSpec(
    key: PluginConfigField,
    defaults: PluginConfig,
): Record<string, unknown> & { kind: string } {
    return { ...FIELD_SCHEMAS[key], key, default: defaults[key] };
}

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

    private _initialized = false;
    private _glCanvas!: HTMLCanvasElement;
    private _gridlineCanvas!: HTMLCanvasElement;
    private _chromeCanvas!: HTMLCanvasElement;
    private _renderer: RendererTransport | null = null;
    private _rendererPromise: Promise<RendererTransport> | null = null;
    private _rawEventForwarder: RawEventForwarder | null = null;
    private _generation = 0;
    private _renderBlitMode: "direct" | "blit" = RENDER_BLIT_MODE;
    private _resetClickAbort: AbortController | null = null;

    /**
     * Plugin-scoped global config. Seeded lazily from
     * `_effectiveDefaults()` (which folds
     * `_chartType.plugin_field_defaults` over `DEFAULT_PLUGIN_CONFIG`)
     * because base-class field initializers run before the subclass
     * `_chartType` assignment. `restore({ plugin_config })` merges
     * incoming values on top of the same effective defaults so fields
     * the host omits fall back to the chart-type default
     * (`include_zero = true` for Y Bar / Y Area / X Bar, `false`
     * elsewhere). Held on the element (not just inside the worker) so
     * a `_buildRenderer` triggered after a `restore` ships the
     * resolved values in the `InitMsg`.
     */
    private _pluginConfigStore: PluginConfig | null = null;

    private get _pluginConfig(): PluginConfig {
        if (!this._pluginConfigStore) {
            this._pluginConfigStore = this._effectiveDefaults();
        }

        return this._pluginConfigStore;
    }

    private set _pluginConfig(value: PluginConfig) {
        this._pluginConfigStore = value;
    }

    private _effectiveDefaults(): PluginConfig {
        return {
            ...DEFAULT_PLUGIN_CONFIG,
            ...(this._chartType.plugin_field_defaults ?? {}),
        };
    }

    connectedCallback() {
        if (!this._initialized) {
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

        if (!this._glCanvas?.isConnected) {
            this._buildCanvasStack();
        }
    }

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
        const table = await viewer?.getTable?.();
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
            facetConfig: {
                ...FACET_CONFIG_DEFAULTS,
                facet_mode: this._pluginConfig.facet_mode,
                zoom_mode: this._pluginConfig.facet_zoom_mode,
            },
            pluginConfig: this._pluginConfig,
            defaultChartType: this._chartType.default_chart_type,
            renderBlitMode: this._renderBlitMode,
        });

        return transport;
    }

    setBlitMode(mode: "direct" | "blit") {
        console.assert(this._initialized, "Already initialized");
        this._renderBlitMode = mode;
    }

    get_static_config(): PluginStaticConfig {
        return {
            name: this._chartType.name,
            category: this._chartType.category,
            select_mode: this._chartType.selectMode,
            min_config_columns: this._chartType.initial.count,
            config_column_names: this._chartType.initial.names,
            max_cells: this._chartType.max_cells,
            max_columns: this._chartType.max_columns,
            group_rollup_modes: ["flat"],
            priority: 0,
            can_render_column_styles:
                !!this._chartType.default_chart_type ||
                this._chartType.category === "Cartesian Charts",
        };
    }

    column_config_schema(
        column_type: string,
        _group: string | undefined,
        _column_name: string,
        current_value: Record<string, unknown> | null,
        _viewer_config?: { group_by?: string[]; group_rollup_mode?: string },
    ) {
        const fields: Array<Record<string, unknown> & { kind: string }> = [];

        // Y-series plugins expose the per-column chart_type picker; non-Y
        // plugins leave `default_chart_type` unset.
        const def = this._chartType.default_chart_type;
        if (def && (column_type === "integer" || column_type === "float")) {
            fields.push({
                kind: "Enum",
                key: "chart_type",
                default: def,
                variants: [
                    { value: "bar", label: "Bar" },
                    { value: "line", label: "Line" },
                    { value: "scatter", label: "Scatter" },
                    { value: "area", label: "Area" },
                ],
            });

            const effective_chart_type =
                (current_value?.chart_type as string | undefined) ?? def;

            const supports_stack =
                effective_chart_type === "bar" ||
                effective_chart_type === "area";

            if (supports_stack) {
                fields.push({
                    kind: "Bool",
                    key: "stack",
                    default: supports_stack,
                });
            }

            const is_series_glyph =
                def === "bar" ||
                def === "line" ||
                def === "scatter" ||
                def === "area";

            if (is_series_glyph) {
                fields.push({
                    kind: "Bool",
                    key: "alt_axis",
                    default: false,
                });
            }
        }

        // Per-column formatter widgets. Surfaced for every chart type so
        // axes / tooltips / legends honor the user's format choice.
        if (column_type === "integer" || column_type === "float") {
            fields.push({ kind: "NumberFormat" });
        } else if (column_type === "date" || column_type === "datetime") {
            fields.push({ kind: "DatetimeFormat" });
        }

        return { fields };
    }

    plugin_config_schema(_view_config?: {
        group_by?: string[];
        group_rollup_mode?: string;
    }) {
        const defaults = this._effectiveDefaults();
        const fields = this._chartType.applicable_plugin_fields.map((key) =>
            fieldSpec(key, defaults),
        );

        return { fields };
    }

    async draw(view: View): Promise<void> {
        // `draw` always indicates a view-level change (pivots, columns,
        // filters, sorts, schema, …) — invalidate the `domain_mode:
        // "expand"` accumulator so the new view's extent starts fresh.
        // `update` (data-only redraw on the same view) shares
        // `_drawImpl` but skips this reset.
        this._renderer?.resetExpandedDomain();
        this._renderer?.resetAllZooms();
        return this._drawImpl(view);
    }

    async update(view: View): Promise<void> {
        return this._drawImpl(view);
    }

    private async _drawImpl(view: View): Promise<void> {
        const gen = ++this._generation;
        const renderer = await this._ensureRenderer(view);
        if (this._generation !== gen) {
            return;
        }

        renderer.setView(view);
        renderer.setBufferMaxCapacity(this._chartType.max_cells);
        const viewer = this
            .parentElement as HTMLPerspectiveViewerElement | null;
        const viewerConfig = (await viewer?.getViewConfig?.()) ?? {};
        if (this._generation !== gen) {
            return;
        }

        await renderer.loadAndRender({
            viewerConfig: {
                group_by: viewerConfig?.group_by ?? [],
                split_by: viewerConfig?.split_by ?? [],
                columns: viewerConfig?.columns ?? [],
            },
            options: { float32: true },
        });
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

    async render(view: View): Promise<Blob> {
        await this._ensureRenderer(view);
        await this.draw(view);
        return this._renderer!.snapshotPng();
    }

    restore(config: any, columns_config?: Record<string, any>) {
        if (config?.zoom) {
            this._renderer?.restoreZoom(config.zoom);
        }

        // Merge incoming plugin_config on top of the `chart_type`
        // effective defaults so a partial restore (UI emits only
        // changed fields) keeps untouched defaults in place — and
        // chart-type overrides (e.g. `include_zero=true` for Y Bar /
        // Y Area / X Bar) survive when the host elides their values.
        this._pluginConfig = {
            ...this._effectiveDefaults(),
            ...config,
        };

        this._renderer?.setPluginConfig(this._pluginConfig);
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

        this._rendererPromise = null;
    }
}
