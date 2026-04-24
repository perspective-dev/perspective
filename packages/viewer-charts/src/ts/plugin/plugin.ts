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
import { ChartTypeConfig } from "./charts";
import style from "../../css/perspective-viewer-charts.css";
import { WebGLContextManager } from "../webgl/context-manager";
import { viewToColumnDataMap, ColumnDataMap } from "../data/view-reader";
import {
    ChartImplementation,
    DEFAULT_FACET_CONFIG,
    type FacetConfig,
} from "../charts/chart";
import { ZoomController } from "../interaction/zoom-controller";
import { ZoomRouter } from "../interaction/zoom-router";
import { PlotLayout } from "../layout/plot-layout";

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

export class HTMLPerspectiveViewerWebGLPluginElement extends HTMLElement {
    declare _chartType: ChartTypeConfig;
    declare static _chartType: ChartTypeConfig;

    private _initialized = false;
    private _glCanvas!: HTMLCanvasElement;
    private _gridlineCanvas!: HTMLCanvasElement;
    private _chromeCanvas!: HTMLCanvasElement;
    private _glManager: WebGLContextManager | null = null;
    private _chartImpl: ChartImplementation | null = null;
    private _zoomController: ZoomController | null = null;
    private _zoomRouter: ZoomRouter | null = null;
    private _generation = 0;

    connectedCallback() {
        if (!this._initialized) {
            this.attachShadow({ mode: "open" });
            for (const sheet of GLOBAL_STYLES) {
                this.shadowRoot!.adoptedStyleSheets.push(sheet);
            }

            const zoom_button = `<button class="zoom-reset">Reset Zoom</button>`;
            const canvas_stack =
                `<canvas class="webgl-gridlines"></canvas>` +
                `<canvas class="webgl-canvas"></canvas>` +
                `<canvas class="webgl-chrome"></canvas>` +
                `<div class="zoom-controls">` +
                zoom_button +
                `</div>`;

            this.shadowRoot!.innerHTML =
                `<div class="webgl-container">` + canvas_stack + `</div>`;

            this._glCanvas =
                this.shadowRoot!.querySelector<HTMLCanvasElement>(
                    ".webgl-canvas",
                )!;

            this._gridlineCanvas =
                this.shadowRoot!.querySelector<HTMLCanvasElement>(
                    ".webgl-gridlines",
                )!;

            this._chromeCanvas =
                this.shadowRoot!.querySelector<HTMLCanvasElement>(
                    ".webgl-chrome",
                )!;

            this._initialized = true;
        }
    }

    private _ensureGL(): WebGLContextManager {
        if (!this._initialized) {
            this.connectedCallback();
        }
        if (!this._glManager) {
            this._glManager = new WebGLContextManager(this._glCanvas);
            this._setupChartIntegration();
        }
        return this._glManager;
    }

    private _setupChartIntegration(): void {
        if (!this._chartImpl) return;

        // Wire overlay and tooltip canvases
        if (this._chartImpl.setGridlineCanvas) {
            this._chartImpl.setGridlineCanvas(this._gridlineCanvas);
        }
        if (this._chartImpl.setChromeCanvas) {
            this._chartImpl.setChromeCanvas(this._chromeCanvas);
        }

        // Parameterised default glyph for Y-series plugins. Non-Y plugins
        // leave `default_chart_type` unset so this is a no-op for them.
        if (
            this._chartImpl.setDefaultChartType &&
            this._chartType.default_chart_type
        ) {
            this._chartImpl.setDefaultChartType(
                this._chartType.default_chart_type,
            );
        }

        // Seed the facet config. Currently a compile-time const; when UI
        // wiring lands, `restore` merges viewer-provided overrides on
        // top of this default so call order is "set default → restore
        // override".
        if (this._chartImpl.setFacetConfig) {
            this._chartImpl.setFacetConfig(FACET_CONFIG);
        }

        // Create and wire zoom controller(s)
        if (this._chartImpl.setZoomController && !this._zoomController) {
            this._zoomController = new ZoomController();
            this._chartImpl.setZoomController(this._zoomController);
            this._setupZoomRouter();
        }

        // Attach tooltip
        if (this._chartImpl.attachTooltip) {
            this._chartImpl.attachTooltip(this._glCanvas);
        }
    }

    /**
     * Wire the `ZoomRouter` to the GL canvas with a resolver that
     * dispatches events to the facet under the cursor. In shared-zoom
     * mode the resolver always returns the single `_zoomController`
     * with the facet's own layout (so data/pixel math uses the right
     * plot rect). In independent-zoom mode the resolver walks the
     * chart's facet grid and routes to the per-facet controller.
     */
    private _setupZoomRouter(): void {
        if (!this._zoomController || this._zoomRouter) return;

        this._zoomRouter = new ZoomRouter();
        const router = this._zoomRouter;
        const zoomControls = this.shadowRoot!.querySelector(
            ".zoom-controls",
        ) as HTMLDivElement | null;

        // Dummy seed layout — replaced per-frame via the chart's
        // `updateLayout` call inside its render paths. Also used by the
        // shared-mode resolver as a fallback when no facet grid exists.
        const rect = this._glCanvas.getBoundingClientRect();
        const seedLayout = new PlotLayout(
            rect.width || 100,
            rect.height || 100,
            {
                hasXLabel: true,
                hasYLabel: true,
                hasLegend: false,
            },
        );

        router.attach(
            this._glCanvas,
            (mx, my) => {
                const chart = this._chartImpl as any;
                const facetGrid = chart?._facetGrid;
                if (facetGrid) {
                    for (let i = 0; i < facetGrid.cells.length; i++) {
                        const cell = facetGrid.cells[i];
                        const plot = cell.layout.plotRect;
                        if (
                            mx >= plot.x &&
                            mx <= plot.x + plot.width &&
                            my >= plot.y &&
                            my <= plot.y + plot.height
                        ) {
                            const zc =
                                chart.getZoomControllerForFacet?.(i) ??
                                this._zoomController!;
                            return { controller: zc, layout: cell.layout };
                        }
                    }
                    return null;
                }
                // Non-facet chart: consult the single controller, using
                // the chart's current layout (or seed) for pixel math.
                const layout = chart?._lastLayout ?? seedLayout;
                const plot = layout.plotRect;
                if (
                    mx < plot.x ||
                    mx > plot.x + plot.width ||
                    my < plot.y ||
                    my > plot.y + plot.height
                ) {
                    return null;
                }
                return {
                    controller: this._zoomController!,
                    layout,
                };
            },
            () => {
                if (this._chartImpl && this._glManager) {
                    this._chartImpl.redraw(this._glManager);
                }
                if (zoomControls) {
                    zoomControls.classList.toggle(
                        "visible",
                        !this._allZoomsDefault(),
                    );
                }
            },
        );

        const resetBtn = this.shadowRoot!.querySelector(".zoom-reset");
        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                this._resetAllZooms();
                if (zoomControls) {
                    zoomControls.classList.remove("visible");
                }
                if (this._chartImpl && this._glManager) {
                    this._chartImpl.redraw(this._glManager);
                }
            });
        }
    }

    private _allZoomsDefault(): boolean {
        if (this._zoomController && !this._zoomController.isDefault()) {
            return false;
        }
        const chart = this._chartImpl as any;
        if (chart?._facetZoomControllers) {
            for (const zc of chart._facetZoomControllers) {
                if (zc && !zc.isDefault()) return false;
            }
        }
        return true;
    }

    private _resetAllZooms(): void {
        this._zoomController?.reset();
        const chart = this._chartImpl as any;
        if (chart?._facetZoomControllers) {
            for (const zc of chart._facetZoomControllers) {
                zc?.reset();
            }
        }
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
        if (!this._chartType.default_chart_type) return false;
        return column_type === "integer" || column_type === "float";
    }

    column_style_controls(column_type: string, _group?: string) {
        // Pre-select the plugin's default glyph in the sidebar Chart Type
        // picker so e.g. Y Line shows "Line" on first render rather than
        // Bar.
        const def = this._chartType.default_chart_type;
        if (!def) return {};
        if (column_type !== "integer" && column_type !== "float") return {};
        return {
            number_series_style: {
                chart_type: def,
            },
        };
    }

    async draw(view: View): Promise<void> {
        const gen = ++this._generation;
        const glManager = this._ensureGL();
        glManager.resize();
        // glManager.clear();
        glManager.bufferPool.maxCapacity = this._chartType.max_cells;
        const viewer = this.parentElement as any;
        const [numRows, schema, viewerConfig] = await Promise.all([
            view.num_rows(),
            view.schema(),
            viewer?.getViewConfig?.() ?? {},
        ]);

        if (this._generation !== gen) return;
        // Install the current View on the chart so it can make
        // on-demand per-row queries for lazy tooltip lookups.
        // Called before any chunk processing so the first hover after
        // a (slow) upload completes can already dispatch a fetch.
        if (this._chartImpl?.setView) {
            this._chartImpl.setView(view);
        }
        const groupBy: string[] = viewerConfig?.group_by ?? [];
        const splitBy: string[] = viewerConfig?.split_by ?? [];
        if (this._chartImpl?.setViewPivots) {
            this._chartImpl.setViewPivots(groupBy, splitBy);
        }

        if (this._chartImpl?.setColumnTypes && schema) {
            this._chartImpl.setColumnTypes(schema as Record<string, string>);
        }

        const columnSlots: (string | null)[] = viewerConfig?.columns ?? [];
        if (this._chartImpl?.setColumnSlots) {
            this._chartImpl.setColumnSlots(columnSlots);
        }

        const numCols =
            Object.keys(schema as Record<string, string>).length || 1;

        const maxRows = Math.floor(this._chartType.max_cells / numCols);
        const totalRows = Math.min(numRows, maxRows);
        glManager.ensureBufferCapacity(totalRows);
        const callback = (columns: ColumnDataMap) => {
            if (this._generation !== gen) return;
            this._renderChunkData(columns, 0, totalRows);
        };

        await viewToColumnDataMap(view, callback, {
            end_row: totalRows,
            float32: true,
        });
    }

    async update(view: View): Promise<void> {
        return this.draw(view);
    }

    async clear(): Promise<void> {
        this._generation++;
        if (this._glManager) {
            this._glManager.clear();
        }
        // Clear overlay
        if (this._gridlineCanvas) {
            const ctx = this._gridlineCanvas.getContext("2d");
            if (ctx) {
                ctx.clearRect(
                    0,
                    0,
                    this._gridlineCanvas.width,
                    this._gridlineCanvas.height,
                );
            }
        }
    }

    async resize(): Promise<void> {
        if (this._glManager) {
            this._glManager.resize();
            if (this._chartImpl) {
                this._chartImpl.redraw(this._glManager);
            }
        }
    }

    async restyle(): Promise<void> {
        await this.resize();
    }

    save() {
        const state: any = {};
        if (this._zoomController) {
            state.zoom = this._zoomController.serialize();
        }
        return state;
    }

    restore(config: any, columns_config?: Record<string, any>) {
        if (config?.zoom && this._zoomController) {
            this._zoomController.restore(config.zoom);
        }

        if (this._chartImpl?.setColumnsConfig) {
            this._chartImpl.setColumnsConfig(columns_config ?? {});
        }
    }

    delete() {
        this._generation++;
        // Destroy chart first — it may need the GL context for cleanup.
        if (this._chartImpl) {
            this._chartImpl.destroy();
            this._chartImpl = null;
        }
        if (this._zoomRouter) {
            this._zoomRouter.detach();
            this._zoomRouter = null;
        }
        this._zoomController = null;
        if (this._glManager) {
            this._glManager.destroy();
            this._glManager = null;
        }
    }

    private _renderChunkData(
        columns: ColumnDataMap,
        startRow: number,
        endRow: number,
    ): void {
        if (!this._glManager) return;

        if (this._chartImpl) {
            this._chartImpl.uploadAndRender(
                this._glManager,
                columns,
                startRow,
                endRow,
            );
        }
    }
}
