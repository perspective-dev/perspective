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

/**
 * The paragraph every gallery page over a data source shares, keyed by
 * `ProjectSource.name`.
 */
export const SOURCE_DESCRIPTIONS: Record<string, string> = {
    superstore:
        "Programmatic variations on the Superstore retail sales dataset, " +
        "showing the flexibility of Perspective's configuration: the same " +
        "table re-queried as data grids, pivot tables and charts by " +
        "changing only the viewer's JSON config.",
    movies:
        "Box office, budget and ratings for a few thousand films, from the " +
        "Vega sample datasets, explored as scatter plots, heatmaps and " +
        "pivot tables.",
    olympics:
        "120 years of Olympic athletes and results, from Kaggle — roughly " +
        "270,000 rows loaded from Apache Arrow and pivoted entirely in the " +
        "browser.",
    nypd:
        "The NYCLU's database of civilian complaints against NYPD officers, " +
        "loaded from Apache Arrow and cross-filtered in the browser with no " +
        "server.",
    evictions:
        "San Francisco eviction notices from the DataSF open data portal, " +
        "plotted on tile-based scatter and density maps.",
    raw_data:
        "The Mandelbrot set computed per-row by Perspective's columnar " +
        "expression language over a generated coordinate grid, and rendered " +
        "as a heatmap.",
    raycasting:
        "A raytraced torus rendered entirely by Perspective's columnar " +
        "expression language over a generated pixel grid, as a heatmap.",
    benchmarks_js:
        "Perspective's own benchmark results for the JavaScript build — the " +
        "WebAssembly engine under Node.js — as published with each GitHub " +
        "release: every timed iteration of table construction, streaming " +
        "updates, pivots, expressions, joins and serialization over the " +
        "Superstore dataset, for the current and every prior release, " +
        "measured by CI on a GitHub Actions ubuntu-22.04 runner.",
    benchmarks_python:
        "Perspective's own benchmark results for perspective-python — the " +
        "native engine, driven from a Node.js client over WebSocket — as " +
        "published with each GitHub release: every timed iteration of table " +
        "construction, streaming updates, pivots, expressions, joins and " +
        "serialization over the Superstore dataset, for the current and " +
        "prior releases, measured by CI on a GitHub Actions ubuntu-22.04 " +
        "runner.",
    market:
        "A simulated order book streaming into a Perspective table in real " +
        "time: orders are created, filled, cancelled and expired " +
        "continuously, and every data grid, pivot and chart updates " +
        "incrementally as they arrive.",
    webcam:
        "Live webcam frames streamed into a Perspective table one pixel per " +
        "row, and rendered back as real-time heatmaps, scatter plots and " +
        "histograms.",
};
