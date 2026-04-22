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
import { ChartImplementation } from "../charts/chart";
import { ZoomController } from "../interaction/zoom-controller";
import { PlotLayout } from "../layout/plot-layout";

const GLOBAL_STYLES = (() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style);
    return [sheet];
})();

export class HTMLPerspectiveViewerWebGLPluginElement extends HTMLElement {
    _chartType: ChartTypeConfig;
    static _chartType: ChartTypeConfig;

    private _initialized = false;
    private _glCanvas: HTMLCanvasElement;
    private _gridlineCanvas: HTMLCanvasElement;
    private _chromeCanvas: HTMLCanvasElement;
    private _glManager: WebGLContextManager | null = null;
    private _chartImpl: ChartImplementation | null = null;
    private _zoomController: ZoomController | null = null;
    private _generation = 0;

    connectedCallback() {
        if (!this._initialized) {
            this.attachShadow({ mode: "open" });
            for (const sheet of GLOBAL_STYLES) {
                this.shadowRoot!.adoptedStyleSheets.push(sheet);
            }

            this.shadowRoot!.innerHTML = `
                <div class="webgl-container">
                    <canvas class="webgl-gridlines"></canvas>
                    <canvas class="webgl-canvas"></canvas>
                    <canvas class="webgl-chrome"></canvas>
                    <div class="zoom-controls">
                        <button class="zoom-reset">Reset Zoom</button>
                    </div>
                </div>
            `;

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

        // Create and wire zoom controller
        if (this._chartImpl.setZoomController && !this._zoomController) {
            this._zoomController = new ZoomController();
            this._chartImpl.setZoomController(this._zoomController);

            // Create a dummy layout for initial attachment; it will be
            // updated on each render via scatter's _fullRender.
            const rect = this._glCanvas.getBoundingClientRect();
            const layout = new PlotLayout(
                rect.width || 100,
                rect.height || 100,
                {
                    hasXLabel: true,
                    hasYLabel: true,
                    hasLegend: false,
                },
            );

            const zoomControls = this.shadowRoot!.querySelector(
                ".zoom-controls",
            ) as HTMLDivElement;

            this._zoomController.attach(this._glCanvas, layout, () => {
                if (this._chartImpl && this._glManager) {
                    this._chartImpl.redraw(this._glManager);
                }
                // Show reset button when zoomed/panned
                if (zoomControls && this._zoomController) {
                    zoomControls.classList.toggle(
                        "visible",
                        !this._zoomController.isDefault(),
                    );
                }
            });

            // Wire reset button
            const resetBtn = this.shadowRoot!.querySelector(".zoom-reset");
            if (resetBtn) {
                resetBtn.addEventListener("click", () => {
                    if (this._zoomController) {
                        this._zoomController.reset();
                        if (zoomControls) {
                            zoomControls.classList.remove("visible");
                        }
                        if (this._chartImpl && this._glManager) {
                            this._chartImpl.redraw(this._glManager);
                        }
                    }
                });
            }
        }

        // Attach tooltip
        if (this._chartImpl.attachTooltip) {
            this._chartImpl.attachTooltip(this._glCanvas);
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
        if (this._zoomController) {
            this._zoomController.detach();
            this._zoomController = null;
        }
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
