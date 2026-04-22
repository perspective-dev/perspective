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

import CHARTS from "./plugin/charts";
import { HTMLPerspectiveViewerWebGLPluginElement } from "./plugin/plugin";
import { ScatterChart, LineChart } from "./charts/continuous/continuous-chart";
import { TreemapChart } from "./charts/treemap/treemap";
import { SunburstChart } from "./charts/sunburst/sunburst";
import { BarChart, XBarChart } from "./charts/bar/bar";
import { HeatmapChart } from "./charts/heatmap/heatmap";
import { CandlestickChart } from "./charts/candlestick/candlestick";

const CHART_IMPLS: Record<(typeof CHARTS)[number]["tag"], new () => any> = {
    scatter: ScatterChart,
    line: LineChart,
    treemap: TreemapChart,
    sunburst: SunburstChart,
    heatmap: HeatmapChart,

    // All four Y-series plugins share BarChart; they differ only in the
    // per-plugin default `chart_type` forwarded via `setDefaultChartType`
    // during plugin setup.
    "y-bar": BarChart,
    "y-line": BarChart,
    "y-scatter": BarChart,
    "y-area": BarChart,

    // X Bar is the horizontal orientation of the same chart class.
    "x-bar": XBarChart,

    // Both candlestick-family plugins share one impl; the render path
    // branches on `_defaultChartType` (set from `default_chart_type` in
    // the plugin config) to pick the glyph.
    candlestick: CandlestickChart,
    ohlc: CandlestickChart,
};

export function register(...plugin_names: string[]) {
    const plugins = new Set(
        plugin_names.length > 0
            ? plugin_names
            : CHARTS.map((chart) => chart.name),
    );

    CHARTS.forEach((chart) => {
        if (plugins.has(chart.name)) {
            const tagName = `perspective-viewer-charts-${chart.tag}`;
            const ImplClass = CHART_IMPLS[chart.tag];
            customElements.define(
                tagName,
                class extends HTMLPerspectiveViewerWebGLPluginElement {
                    _chartType = chart;
                    static _chartType = chart;

                    constructor() {
                        super();
                        (this as any)._chartImpl = new ImplClass();
                    }
                },
            );

            customElements.whenDefined("perspective-viewer").then(async () => {
                const Viewer = customElements.get("perspective-viewer") as any;
                await Viewer.registerPlugin(tagName);
            });
        }
    });
}

register();
