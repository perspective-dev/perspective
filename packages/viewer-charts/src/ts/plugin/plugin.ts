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

import { colorsToCss, stopsToCss } from "../theme/gradient";
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
import { TILE_SOURCES, type TileSourceSpec } from "../map/tile-source";
import { RENDER_BLIT_MODE } from "../config";
import { snapshotThemeVars } from "../theme/theme-snapshot";
import { resolveThemeFromVars, type Theme } from "../theme/theme";
import { resolvePalette } from "../theme/palette";
import { vec3ToHexColor } from "../utils/css";

/**
 * Facet-rendering defaults shared by every chart. Per-chart overrides
 * arrive through `plugin_config` (`facet_mode` + `facet_zoom_mode`);
 * the remaining fields (`shared_x_axis`, `shared_y_axis`,
 * `coordinated_tooltip`, `facet_padding`) are not yet user-configurable
 * — flip the defaults in `DEFAULT_FACET_CONFIG` to change globally.
 */
const FACET_CONFIG_DEFAULTS: FacetConfig = { ...DEFAULT_FACET_CONFIG };

/**
 * Register a raster XYZ tile provider at runtime. The provider joins
 * the bundled [map/tile-sources.json] entries in the settings panel's
 * `map_tile_provider` enum and resolves on any map chart from its next
 * config forward onward — the resolved spec rides every outgoing
 * `setPluginConfig` / `init` message alongside the config that names
 * it, so no separate registry-sync operation exists. Re-registering an
 * id replaces it (a changed template drops cached tiles via the
 * content-derived cache identity); a chart currently displaying that
 * id picks the replacement up on its next `restore()`. Throws
 * `TypeError` on a malformed spec. Returns the normalized spec.
 *
 * A key-gated provider is registered with the key embedded in its
 * `template` — keys never enter `plugin_config`, so they never appear
 * in `save()` output.
 */
export function registerTileSource(spec: unknown): TileSourceSpec {
    return TILE_SOURCES.register(spec);
}

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

/**
 * A `FieldSpec` entry may be a thunk when its contents depend on
 * runtime state — `map_tile_provider`'s variants come from the tile-
 * source registry, which grows via `registerTileSource`, so the enum
 * must be resolved per `plugin_config_schema()` call rather than at
 * module init.
 */
const FIELD_SCHEMAS: Record<PluginConfigField, FieldSpec | (() => FieldSpec)> =
    {
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
        map_tile_provider: () => ({
            kind: "Enum",
            variants: TILE_SOURCES.list().map((s) => ({
                value: s.id,
                label: s.label,
            })),
        }),
        map_tile_alpha: { kind: "Number", min: 0, max: 1, step: 0.05 },
        numeric_axes: { kind: "Bool" },
        legend_mode: {
            kind: "Enum",
            variants: [
                { value: "auto", label: "Auto" },
                { value: "sidebar", label: "Sidebar" },
                { value: "none", label: "None" },
                { value: "floating", label: "Floating" },
            ],
        },
        legend_size_mode: {
            kind: "Enum",
            variants: [
                { value: "auto", label: "Auto" },
                { value: "fixed", label: "Fixed" },
            ],
        },
        // 0 = auto (the chart family's historical gutter width).
        legend_width_px: { kind: "Number", min: 0, max: 512, step: 1 },
        legend_height_px: { kind: "Number", min: 48, max: 1024, step: 1 },
        legend_anchor: {
            kind: "Enum",
            variants: [
                { value: "top-right", label: "Top Right" },
                { value: "top-left", label: "Top Left" },
                { value: "bottom-right", label: "Bottom Right" },
                { value: "bottom-left", label: "Bottom Left" },
            ],
        },
        legend_x: { kind: "Number", min: 0, max: 1, step: 0.01 },
        legend_y: { kind: "Number", min: 0, max: 1, step: 0.01 },
        legend_opacity: { kind: "Number", min: 0, max: 1, step: 0.05 },
    };

function fieldSpec(
    key: PluginConfigField,
    defaults: PluginConfig,
): Record<string, unknown> & { kind: string } {
    const entry = FIELD_SCHEMAS[key];
    const spec = typeof entry === "function" ? entry() : entry;
    return { ...spec, key, default: defaults[key] };
}

const GLOBAL_STYLES = (() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style);
    return [sheet];
})();

/**
 * Process-global GL presentation strategy, shared by *every* chart-type
 * plugin in this renderer. Seeded from the build-time {@link RENDER_BLIT_MODE}
 * and overridable at runtime via
 * {@link HTMLPerspectiveViewerWebGLPluginElement.setBlitMode}.
 *
 * Module scope (not per-instance) on purpose: blit-vs-direct is a
 * whole-renderer decision — in `"blit"` mode the worker shares a pool of
 * GL contexts across all charts ([webgl/context-pool.ts]), so a page
 * can't sensibly mix strategies per chart. Every per-chart-type subclass
 * registered in [index.ts] reads this one value when it builds its
 * renderer, so setting it once (before the first chart renders) applies
 * to all of them.
 */
let BLIT_MODE: "direct" | "blit" = RENDER_BLIT_MODE;

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

    /**
     * Per-column config (`alt_axis`, `chart_type`, formats, …), held on
     * the element for the same reason as `_pluginConfigStore`: the host
     * calls `restore()` BEFORE the first draw builds the renderer, so
     * forwarding only to a live renderer silently drops the initial
     * `columns_config` — `_buildRenderer` ships it in the `InitMsg`
     * instead.
     */
    private _columnsConfig: Record<string, any> = {};

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

        // `_buildRenderer` is async — it awaits `getClient`, `getTable`,
        // and a full worker handshake — so a `disconnectedCallback`
        // (toggle / chart-type switch) frequently lands *before* this
        // `.then` runs. At that point `this._renderer` is still null,
        // so `delete()`'s `if (this._renderer)` teardown is skipped and
        // the freshly-built transport (and its WebGL context) would be
        // assigned to a detached element and leak — one context per
        // raced toggle, until the browser evicts the oldest.
        //
        // `delete()` sets `_rendererPromise = null`, so promise identity
        // is the dispose signal: if `this._rendererPromise` no longer
        // points at *this* build when it resolves, the element was
        // deleted (or a reconnect started a newer build) and we destroy
        // the orphan instead of adopting it. Promise identity is the
        // right token: a rapid draw→update must NOT tear down the
        // single in-flight build it shares via this memoized promise.
        const p: Promise<RendererTransport> = this._buildRenderer(view).then(
            (r) => {
                if (this._rendererPromise !== p) {
                    r.destroy();
                    throw new Error("renderer disposed during init");
                }

                this._renderer = r;
                this._setupInteraction(r);
                return r;
            },
        );

        // Swallow the dispose rejection so it doesn't surface as an
        // unhandled rejection; `_drawImpl` catches it and bails.
        p.catch(() => {});
        this._rendererPromise = p;
        return p;
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
        // This chart's own panel (its `slot`). Used to scope the client/table
        // to THIS panel rather than the host's active/seed panel (the bare
        // getClient()/getTable() resolve element-wide in a multi-panel viewer),
        // and to tag the dispatched interaction events with their source panel.
        const panel = this.getAttribute("slot") ?? undefined;
        const client = await viewer.getClient({ panel });
        const viewer_class = customElements.get("perspective-viewer");
        const clientWasm = viewer_class.get_wasm_module();
        const clientWorkerURL = viewer_class.get_worker_url();
        const table = await viewer?.getTable?.({ panel });
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
            panel,
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
            onPluginConfigDelta: (fields) => {
                this._pluginConfig = { ...this._pluginConfig, ...fields };
                const host = this
                    .parentElement as HTMLPerspectiveViewerElement | null;
                (
                    host?.restore(
                        { plugin_config: fields },
                        panel ? { panel } : undefined,
                    ) as Promise<void> | undefined
                )?.catch((e: unknown) => {
                    console.error("legend config persistence failed", e);
                });
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
            columnsConfig: this._columnsConfig,
            defaultChartType: this._chartType.default_chart_type,
            renderBlitMode: BLIT_MODE,
        });

        return transport;
    }

    /**
     * Select the GL presentation strategy for *all* chart-type plugins
     * in this renderer. Static + process-global: the value is shared by
     * every per-chart-type subclass, so it must be set once before the
     * charts that should use it build their renderers (a renderer reads
     * {@link BLIT_MODE} at construction in `_buildRenderer`; charts
     * already built keep their mode until torn down and rebuilt).
     *
     * - `"direct"` — each chart owns a GL context 1:1 with its visible
     *   canvas (lowest latency; bounded by the browser's ~16-context
     *   cap).
     * - `"blit"` — charts render off-screen and share a pool of GL
     *   contexts ([webgl/context-pool.ts]), so a page can exceed the cap.
     */
    static setBlitMode(mode: "direct" | "blit") {
        BLIT_MODE = mode;
    }

    static registerTileSource(spec: unknown): TileSourceSpec {
        return registerTileSource(spec);
    }

    static tileSources(): readonly TileSourceSpec[] {
        return TILE_SOURCES.list();
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
            split_rollup_modes: ["flat"],
            group_by_role: this._chartType.group_by_role,
            split_by_role: this._chartType.split_by_role,
            connects_row_order: !!this._chartType.connects_row_order,
            priority: 0,
            can_render_column_styles:
                !!this._chartType.default_chart_type ||
                this._chartType.category === "Cartesian Charts" ||
                this._chartType.category === "Hierarchical Charts" ||
                this._chartType.category === "Map Charts",
        };
    }

    column_config_schema(
        column_type: string,
        group: string | undefined,
        column_name: string,
        current_value: Record<string, unknown> | null,
        viewer_config?: {
            columns?: (string | null)[];
            group_by?: string[];
            split_by?: string[];
            group_rollup_mode?: string;
        },
    ) {
        const fields: Array<Record<string, unknown> & { kind: string }> = [];

        if (group === "Color") {
            const numeric_gradient =
                this._chartType.category === "Hierarchical Charts"
                    ? column_type === "integer" ||
                      column_type === "float" ||
                      column_type === "date" ||
                      column_type === "datetime"
                    : column_type !== "string";
            if (numeric_gradient) {
                fields.push({
                    kind: "GradientStops",
                    key: "gradient",
                    default: this._themeGradientStopsSpec(),
                });
            } else {
                fields.push({
                    kind: "Palette",
                    key: "palette",
                    default: this._themeSeriesPaletteHex(),
                });
            }
        }

        // Y-series plugins expose the per-column chart_type picker; non-Y
        // plugins leave `default_chart_type` unset.
        const def = this._chartType.default_chart_type;
        if (def && (column_type === "integer" || column_type === "float")) {
            const is_series_glyph =
                def === "bar" ||
                def === "line" ||
                def === "scatter" ||
                def === "area";

            if (is_series_glyph) {
                const has_split = (viewer_config?.split_by?.length ?? 0) > 0;
                if (has_split) {
                    fields.push({
                        kind: "Palette",
                        key: "palette",
                        default: this._themeSeriesPaletteHex(),
                    });
                } else {
                    const slot = (viewer_config?.columns ?? [])
                        .filter((c): c is string => !!c)
                        .indexOf(column_name);
                    fields.push({
                        kind: "Color",
                        key: "color",
                        default: this._themeSeriesColorHex(Math.max(0, slot)),
                    });
                }
            }

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

            if (is_series_glyph) {
                fields.push({
                    kind: "Bool",
                    key: "alt_axis",
                    default: false,
                });
            }

            // Line / area glyphs can bridge interior nulls by linear
            // interpolation. Bar / scatter ignore the flag.
            const supports_interpolate =
                effective_chart_type === "line" ||
                effective_chart_type === "area";

            if (supports_interpolate) {
                const variants =
                    effective_chart_type === "area"
                        ? [
                              { value: "skip", label: "Skip" },
                              { value: "solid", label: "Solid" },
                          ]
                        : [
                              { value: "skip", label: "Skip" },
                              { value: "solid", label: "Solid" },
                              { value: "transparent", label: "Transparent" },
                          ];
                fields.push({
                    kind: "Enum",
                    key: "interpolate",
                    default: "solid",
                    variants,
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

    private _resolvedTheme(): Theme {
        return resolveThemeFromVars(snapshotThemeVars(this));
    }

    private static readonly GRADIENT_PALETTE_FALLBACK_COUNT = 6;

    private _themeSeriesPaletteHex(): string {
        const theme = this._resolvedTheme();
        const count =
            theme.seriesPalette.length ||
            HTMLPerspectiveViewerWebGLPluginElement.GRADIENT_PALETTE_FALLBACK_COUNT;
        return colorsToCss(
            resolvePalette(theme.seriesPalette, theme.gradientStops, count),
        );
    }

    private _themeSeriesColorHex(idx: number): string {
        const theme = this._resolvedTheme();
        const count = Math.max(theme.seriesPalette.length, idx + 1);
        return vec3ToHexColor(
            resolvePalette(theme.seriesPalette, theme.gradientStops, count)[
                idx
            ],
        );
    }

    private _themeGradientStopsSpec(): string {
        return stopsToCss(this._resolvedTheme().gradientStops);
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

    /**
     * Shared body of `draw` / `update`. No re-entrancy guard: the host
     * serializes every rendering call (`draw`, `update`, `render`,
     * `resize`) and `delete` on its per-renderer draw lock, so this
     * method never overlaps itself or a teardown. The one exception —
     * an external DOM disconnect `delete()`ing the element mid-draw —
     * is absorbed by `RendererTransport`, whose post-`destroy()`
     * requests settle immediately instead of pending forever.
     */
    private async _drawImpl(view: View): Promise<void> {
        let renderer: RendererTransport;
        try {
            renderer = await this._ensureRenderer(view);
        } catch {
            // Renderer was disposed mid-init (element disconnected
            // during the async build) — nothing to draw.
            return;
        }

        renderer.setView(view);
        renderer.setBufferMaxCapacity(this._chartType.max_cells);
        const panel = this.getAttribute("slot") ?? undefined;
        const viewer = this
            .parentElement as HTMLPerspectiveViewerElement | null;

        if (viewer === null) {
            return;
        }

        const viewerConfig = await viewer.getViewConfig({ panel });
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
        this._renderer?.clear();
    }

    async resize(): Promise<void> {
        // Hidden (an unslotted tab-stack panel, a `display: none` host):
        // the 0×0 rect a hidden element reports would resize the worker
        // canvas to zero — CLEARING the retained frame, so the next
        // activation repaints from blank (the two-stage tab-switch
        // artifact). Skip instead and keep the last frame for an instant,
        // single-blit reveal — mirroring the datagrid's guard. The host's
        // activation nudge is also a `resize()`, so a hidden panel's nudge
        // is free by the same check.
        if (!this.isConnected || this.offsetParent == null) {
            return;
        }

        // AWAITED to the resized frame's PRESENT (the worker's
        // `resizeAck`) — the host's presize protocol style-overrides
        // this element to its target box and holds the layout commit on
        // this promise, so resolving at message-post would commit the
        // settings-pane layout against the old-dimensions bitmap (the
        // aspect-ratio warp the datagrid's synchronous resize never
        // shows).
        await this._renderer?.resize();
    }

    /**
     * OPTIONAL host presize protocol: render at the TARGET element box
     * `(width, height)` — the box the host's pending layout commit will
     * produce — holding the resulting frame offscreen, so nothing on
     * screen changes during the round-trip. Resolves, once the resized
     * frame is staged, to a present closure; the host calls it in the
     * same task as the layout commit, landing geometry and pixels in
     * one paint. Plugins without this method get the host's held
     * style-override presize path instead.
     */
    async presize(width: number, height: number): Promise<(() => void) | void> {
        if (
            !this.isConnected ||
            this.offsetParent == null ||
            !this._renderer ||
            !this._glCanvas
        ) {
            return;
        }

        // Target GL-canvas box = its current box shifted by the element's
        // box delta — the chrome between the element edge and the canvas
        // is constant across a resize.
        const hostRect = this.getBoundingClientRect();
        const glRect = this._glCanvas.getBoundingClientRect();
        return await this._renderer.presize(
            Math.max(0, glRect.width + (width - hostRect.width)),
            Math.max(0, glRect.height + (height - hostRect.height)),
        );
    }

    restyle() {
        this._renderer?.invalidateTheme();
    }

    /**
     * Clear any active selection state (pinned tooltip) WITHOUT emitting
     * selection events — the host calls this when a global filter
     * contributed by this panel's selection is removed from the global
     * filter bar, so the pin can't outlive the filter it produced. The
     * transport's `_lastInsertConfig` (remove-set memory) is deliberately
     * RETAINED so a subsequent selection still replaces any leftover
     * clauses rather than accumulating.
     */
    async deselect(): Promise<void> {
        this._renderer?.deselect();
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

        this._columnsConfig = columns_config ?? {};
        this._renderer?.setPluginConfig(this._pluginConfig);
        this._renderer?.setColumnsConfig(this._columnsConfig);
    }

    delete() {
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
