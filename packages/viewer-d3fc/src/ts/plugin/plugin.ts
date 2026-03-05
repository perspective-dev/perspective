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

import "./polyfills/index";
import charts from "../charts/charts";
import { initialiseStyles } from "../series/colorStyles";
import style from "../../../dist/css/perspective-viewer-d3fc.css";
import { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";
import type * as psp_types from "@perspective-dev/viewer";

import * as d3 from "d3";

import { Chart, Settings, Type } from "../types";

import * as d3fc_style_1 from "@d3fc/d3fc-chart/src/css.js";
import * as d3fc_style_2 from "@d3fc/d3fc-element/src/css.js";

const DEFAULT_PLUGIN_SETTINGS = {
    initial: {
        type: "number",
        count: 1,
        names: [],
    },
    selectMode: "select",
};

const D3FC_GLOBAL_STYLES = [d3fc_style_1.css, d3fc_style_2.css, style].map(
    (x) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(x);
        return sheet;
    },
);

const EXCLUDED_SETTINGS = [
    "crossValues",
    "mainValues",
    "realValues",
    "splitValues",
    "filter",
    "data",
    "size",
    "colorStyles",
    "textStyles",
    "agg_paths",
    "treemaps",
    "axisMemo",
    "columns_config",
];

async function register_element(plugin_name: string) {
    const perspectiveViewerClass = customElements.get("perspective-viewer");
    await perspectiveViewerClass.registerPlugin(plugin_name);
}

export function register(...plugin_names: string[]) {
    const plugins = new Set(
        plugin_names.length > 0
            ? plugin_names
            : charts.map((chart) => chart.plugin.name),
    );

    charts.forEach((chart) => {
        if (plugins.has(chart.plugin.name)) {
            const name = chart.plugin.name
                .toLowerCase()
                .replace(/[ \t\r\n\/]*/g, "");

            const plugin_name = `perspective-viewer-d3fc-${name}`;
            customElements.define(
                plugin_name,
                class extends HTMLPerspectiveViewerD3fcPluginElement {
                    _chart = chart;
                    static _chart = chart;
                },
            );

            customElements
                .whenDefined("perspective-viewer")
                .then(() => register_element(plugin_name));
        }
    });
}

if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector;
}

class HTMLPerspectiveViewerD3fcPluginElement extends HTMLElement {
    _chart: Chart;
    static _chart: Chart;
    _settings: Settings | null;
    render_warning: boolean;
    _initialized: boolean;
    _container: HTMLElement;
    _staged_view;
    config;

    constructor() {
        super();
        this._settings = null;
        this.render_warning = true;
    }

    connectedCallback() {
        if (!this._initialized) {
            this.attachShadow({ mode: "open" });
            for (const sheet of D3FC_GLOBAL_STYLES) {
                this.shadowRoot.adoptedStyleSheets.push(sheet);
            }

            this.shadowRoot.innerHTML += `<div id="container" class="chart"></div>`;
            this._container = this.shadowRoot.querySelector(".chart");
            this._initialized = true;
        }
    }

    get name() {
        return this._chart.plugin.name;
    }

    get category() {
        return this._chart.plugin.category;
    }

    get select_mode() {
        return this._chart.plugin.selectMode || "select";
    }

    get group_rollups(): string[] {
        return ["flat"];
    }

    get min_config_columns() {
        return (
            this._chart.plugin.initial?.count ||
            DEFAULT_PLUGIN_SETTINGS.initial.count
        );
    }

    get config_column_names() {
        return (
            this._chart.plugin.initial?.names ||
            DEFAULT_PLUGIN_SETTINGS.initial.names
        );
    }

    // get initial() {
    //     return chart.plugin.initial
    //        || DEFAULT_PLUGIN_SETTINGS.initial;
    // }

    static get max_cells() {
        return this._chart.plugin.max_cells || 10_000;
    }

    static set max_cells(x) {
        this._chart.plugin.max_cells = x;
    }

    static get max_columns() {
        return this._chart.plugin.max_columns || 50;
    }

    static set max_columns(x) {
        this._chart.plugin.max_columns = x;
    }

    get max_cells() {
        return this._chart.plugin.max_cells || 10_000;
    }

    set max_cells(x) {
        this._chart.plugin.max_cells = x;
    }

    get max_columns() {
        return this._chart.plugin.max_columns || 50;
    }

    set max_columns(x) {
        this._chart.plugin.max_columns = x;
    }

    can_render_column_styles(type: Type, group: string) {
        return this._chart.can_render_column_styles?.call(this, type, group);
    }

    column_style_controls(type: Type, group: string) {
        return this._chart.column_style_controls?.call(this, type, group);
    }

    async render() {
        var canvas = document.createElement("canvas");
        var container: HTMLElement =
            this.shadowRoot.querySelector("#container");
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;

        const context = canvas.getContext("2d");
        context.fillStyle =
            window
                .getComputedStyle(this)
                .getPropertyValue("--plugin--background") || "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const text_color = window
            .getComputedStyle(this)
            .getPropertyValue("color");

        const svgs = Array.from(
            this.shadowRoot.querySelectorAll<SVGElement>(
                "svg:not(#dragHandles)",
            ),
        );

        for (const svg of svgs.reverse()) {
            var img = document.createElement("img");

            const defaultOffset = 0;
            img.width = svg.parentElement
                ? svg.parentElement.offsetWidth
                : defaultOffset;

            img.height = svg.parentElement
                ? svg.parentElement.offsetHeight
                : defaultOffset;

            // Pretty sure this is a chrome bug - `drawImage()` call
            // without this scales incorrectly.
            const new_svg = svg.cloneNode(true) as SVGElement;
            if (!new_svg.hasAttribute("viewBox")) {
                new_svg.setAttribute(
                    "viewBox",
                    `0 0 ${img.width} ${img.height}`,
                );
            }

            new_svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

            for (const text of new_svg.querySelectorAll("text")) {
                text.setAttribute("fill", text_color);
            }

            var xml = new XMLSerializer().serializeToString(new_svg);

            xml = xml.replace(/[^\x00-\x7F]/g, "");

            const done = new Promise((x, y) => {
                img.onload = x;
                img.onerror = y;
            });

            try {
                img.src = `data:image/svg+xml;base64,${btoa(xml)}`;
                await done;
            } catch (e) {
                const done = new Promise((x, y) => {
                    img.onload = x;
                    img.onerror = y;
                });
                img.src = `data:image/svg+xml;utf8,${xml}`;
                await done;
            }

            context.drawImage(
                img,
                (svg.parentNode as HTMLElement).offsetLeft,
                (svg.parentNode as HTMLElement).offsetTop,
                img.width,
                img.height,
            );
        }

        const canvases = Array.from(this.shadowRoot.querySelectorAll("canvas"));

        for (const canvas of canvases.reverse()) {
            context.drawImage(
                canvas,
                (canvas.parentNode as HTMLElement).offsetLeft,
                (canvas.parentNode as HTMLElement).offsetTop,
                canvas.width / window.devicePixelRatio,
                canvas.height / window.devicePixelRatio,
            );
        }

        return await new Promise(
            (x) => canvas.toBlob((blob) => x(blob)),
            // @ts-ignore
            "image/png", // uhhhh, what is going on here?
        );
    }

    async draw(view, end_col, end_row) {
        if (this.offsetParent === null) {
            this._staged_view = [view, end_col, end_row];
            return;
        }

        this._staged_view = undefined;
        if (this._settings) {
            this._settings.axisMemo = [
                [Infinity, -Infinity],
                [Infinity, -Infinity],
            ];
        }

        await this.update(view, end_col, end_row, true);
    }

    async update(view, end_col, end_row, clear = false) {
        if (this.offsetParent === null) {
            return;
        }

        const viewer = this.parentElement as HTMLPerspectiveViewerElement;
        let jsonp, metadata;
        const leaves_only = this._chart.plugin.name !== "Sunburst";
        if (end_col && end_row) {
            jsonp = view.to_columns_string({
                end_row,
                end_col,
                leaves_only,
            });
        } else if (end_col) {
            jsonp = view.to_columns_string({
                end_col,
                leaves_only,
            });
        } else if (end_row) {
            jsonp = view.to_columns_string({
                end_row,
                leaves_only,
            });
        } else {
            jsonp = view.to_columns_string({ leaves_only });
        }

        metadata = await Promise.all([
            viewer.getViewConfig(),
            viewer.getTable().then((table) => table.schema()),
            view.expression_schema(false),
            view.schema(false),
            jsonp,
            view.get_config(),
        ]);
        let [
            real_config,
            table_schema,
            expression_schema,
            view_schema,
            json_string,
            config,
        ] = metadata;

        let json2 = JSON.parse(json_string);
        const keys = Object.keys(json2);
        let json = {
            row(ridx) {
                const obj: { __ROW_PATH__?: any[] } = {};
                for (const name of keys) {
                    obj[name] = json2[name][ridx];
                }

                return obj;
            },
        };

        this.config = real_config;
        const realValues = this.config.columns;

        /**
         * Retrieve a tree axis column from the table and
         * expression schemas, returning a String type or
         * `undefined`.
         * @param {String} column a column name
         */
        const get_pivot_column_type = function (column) {
            let type = table_schema[column];
            if (!type) {
                type = expression_schema[column];
            }
            return type;
        };

        const { columns, group_by, split_by, filter } = config;
        const first_col = json2[Object.keys(json2)[0]] || [];
        const filtered =
            group_by.length > 0
                ? first_col.reduce(
                      (acc, _, idx) => {
                          const col = json.row(idx);
                          if (
                              col.__ROW_PATH__ &&
                              col.__ROW_PATH__.length == group_by.length
                          ) {
                              acc.agg_paths.push(acc.aggs.slice());
                              acc.rows.push(col);
                          } else {
                              const len = col.__ROW_PATH__.filter(
                                  (x) => x !== undefined,
                              ).length;
                              acc.aggs[len] = col;
                              acc.aggs = acc.aggs.slice(0, len + 1);
                          }
                          return acc;
                      },
                      { rows: [], aggs: [], agg_paths: [] },
                  )
                : {
                      rows: first_col.map((_, idx) => json.row(idx)),
                  };

        const dataMap = (col, i) =>
            !group_by.length ? { ...col, __ROW_PATH__: [i] } : col;
        const mapped = filtered.rows.map(dataMap);

        let settings = {
            realValues,
            crossValues: group_by.map((r) => ({
                name: r,
                type: get_pivot_column_type(r),
            })),
            mainValues: columns.map((a) => ({
                name: a,
                type: view_schema[a],
            })),
            splitValues: split_by.map((r) => ({
                name: r,
                type: get_pivot_column_type(r),
            })),
            filter,
            data: mapped,
            agg_paths: filtered.agg_paths,
            ...this.config.plugin_config,
        };

        const handler = {
            set: (obj, prop, value) => {
                if (!EXCLUDED_SETTINGS.includes(prop)) {
                    this._container &&
                        this._container.dispatchEvent(
                            new Event("perspective-plugin-update", {
                                bubbles: true,
                                composed: true,
                            }),
                        );
                }
                obj[prop] = value;
                return true;
            },
        };

        const axisMemo = [
            [Infinity, -Infinity],
            [Infinity, -Infinity],
        ];

        this._settings = new Proxy(
            {
                axisMemo,
                ...this._settings,
                ...settings,
            },
            handler,
        );

        // If only a right-axis Y axis remains, reset the alt
        // axis list to default.
        if (
            this._settings.splitMainValues &&
            this._settings.splitMainValues.length >= columns.length
        ) {
            this._settings.splitMainValues = [];
        }

        initialiseStyles(this._container, this._settings);

        if (clear) {
            this._container.innerHTML = "";
        }

        this._draw();

        await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    async clear() {
        if (this._container) {
            this._container.innerHTML = "";
        }
    }

    _draw() {
        if (this.offsetParent !== null) {
            const containerDiv = d3.select(this._container);
            const name = this._chart.plugin.name
                .toLowerCase()
                .replace(/[ \t\r\n\/]*/g, "");

            const chartClass = `chart ${name}`;
            this._settings.size = this._container.getBoundingClientRect();
            if (this._settings.data.length > 0) {
                this._chart(
                    containerDiv.attr("class", chartClass),
                    this._settings,
                );
            } else {
                containerDiv.attr("class", `${chartClass} disabled`);
            }
        }
    }

    /**
     * TODO we need to `clear()` here unnecessarily due to a bug in the tremap module which
     * causes non-cleared redraws duplicate column labels when calculating column name
     * resize/repositions - see `treemapLabel.js`.
     */
    async resize(view) {
        if (this.offsetParent !== null) {
            if (this._settings?.data !== undefined) {
                this._draw();
            } else {
                const [view, end_col, end_row] = this._staged_view;
                this._staged_view = undefined;
                this.draw(view, end_col, end_row);
            }
        }
    }

    async restyle(view, _end_col, _end_row) {
        let settings = this._settings;
        if (settings) {
            delete settings["colorStyles"];
            delete settings["textStyles"];
            if (this.isConnected) {
                initialiseStyles(this._container, this._settings);
                this.resize(view);
            }
        }
    }

    async delete() {
        this._container.innerHTML = "";
    }

    getContainer() {
        return this._container;
    }

    save() {
        const settings = { ...this._settings };
        EXCLUDED_SETTINGS.forEach((s) => {
            delete settings[s];
        });
        return settings;
    }

    restore(settings: Settings, columns_config: psp_types.ColumnConfigValues) {
        const new_settings: Partial<Settings> = {};
        for (const name of EXCLUDED_SETTINGS) {
            if (this._settings?.[name] !== undefined) {
                new_settings[name] = this._settings?.[name];
            }
        }
        this._settings = {
            ...new_settings,
            ...settings,
            columns_config,
        };
    }
}
