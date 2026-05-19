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

import { ScatterChart, LineChart, DensityChart } from "./cartesian/cartesian";
import { TreemapChart } from "./treemap/treemap";
import { SunburstChart } from "./sunburst/sunburst";
import { SeriesChart, XBarChart } from "./series/series";
import { HeatmapChart } from "./heatmap/heatmap";
import { CandlestickChart } from "./candlestick/candlestick";
import type { ChartImplementation } from "./chart";

type ChartImplCtor = new () => ChartImplementation;

/**
 * Map from `ChartTypeConfig.tag` to a factory returning the chart-impl
 * class. Consumed by `renderer.worker.ts` which `await`s the factory
 * before constructing the impl.
 *
 * Eager chart types resolve immediately — `Promise.resolve(Class)` is
 * a microtask, no I/O. Map plugins resolve via dynamic `import()` so
 * the bundler emits the tile-rendering subsystem and the map-mode
 * subclasses as a separate chunk; non-map users never fetch it.
 */
export const CHART_IMPLS: Record<string, () => Promise<ChartImplCtor>> = {
    scatter: async () => ScatterChart,
    line: async () => LineChart,
    density: async () => DensityChart,
    treemap: async () => TreemapChart,
    sunburst: async () => SunburstChart,
    heatmap: async () => HeatmapChart,

    // All four Y-series plugins share BarChart; they differ only in the
    // per-plugin default `chart_type` forwarded via `setDefaultChartType`
    // during plugin setup.
    "y-bar": async () => SeriesChart,
    "y-line": async () => SeriesChart,
    "y-scatter": async () => SeriesChart,
    "y-area": async () => SeriesChart,

    // X Bar is the horizontal orientation of the same chart class.
    "x-bar": async () => XBarChart,

    // Both candlestick-family plugins share one impl; the render path
    // branches on `_defaultChartType` (set from `default_chart_type` in
    // the plugin config) to pick the glyph.
    candlestick: async () => CandlestickChart,
    ohlc: async () => CandlestickChart,

    // Map plugins. Dynamic-imported so the bundler splits the
    // `map/*` (tile fetch, cache, layer, shaders) and `charts/map/*`
    // (MapChart + subclasses) modules into a chunk that loads only
    // when the user activates one of these tags.
    "map-scatter": async () => (await import("./map/map")).MapScatterChart,
    "map-line": async () => (await import("./map/map")).MapLineChart,
    "map-density": async () => (await import("./map/map")).MapDensityChart,
};
