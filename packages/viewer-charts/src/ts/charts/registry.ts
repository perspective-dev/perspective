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

import { ScatterChart, LineChart } from "./cartesian/cartesian";
import { TreemapChart } from "./treemap/treemap";
import { SunburstChart } from "./sunburst/sunburst";
import { SeriesChart, XBarChart } from "./series/series";
import { HeatmapChart } from "./heatmap/heatmap";
import { CandlestickChart } from "./candlestick/candlestick";
import type { ChartImplementation } from "./chart";

/**
 * Map from `ChartTypeConfig.tag` to its chart-impl class. Used by
 * `index.ts` (main thread, registers custom elements) and by
 * `renderer.worker.ts` (worker thread, constructs the chart impl from
 * a tag forwarded over the control channel) — both must agree on the
 * tag → class binding.
 */
export const CHART_IMPLS: Record<string, new () => ChartImplementation> = {
    scatter: ScatterChart,
    line: LineChart,
    treemap: TreemapChart,
    sunburst: SunburstChart,
    heatmap: HeatmapChart,

    // All four Y-series plugins share BarChart; they differ only in the
    // per-plugin default `chart_type` forwarded via `setDefaultChartType`
    // during plugin setup.
    "y-bar": SeriesChart,
    "y-line": SeriesChart,
    "y-scatter": SeriesChart,
    "y-area": SeriesChart,

    // X Bar is the horizontal orientation of the same chart class.
    "x-bar": XBarChart,

    // Both candlestick-family plugins share one impl; the render path
    // branches on `_defaultChartType` (set from `default_chart_type` in
    // the plugin config) to pick the glyph.
    candlestick: CandlestickChart,
    ohlc: CandlestickChart,
};
