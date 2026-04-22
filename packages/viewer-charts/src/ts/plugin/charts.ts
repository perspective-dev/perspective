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

export type ChartType = "bar" | "line" | "scatter" | "area";

/**
 * Chart-type identifiers plugins may pin via `default_chart_type`.
 * Extends `ChartType` with the candlestick/ohlc plugins' identifiers,
 * which own their own chart class — bar's `resolveChartType` never
 * sees these because they never flow through the bar pipeline.
 */
export type PluginChartType = ChartType | "candlestick" | "ohlc";

export interface ChartTypeConfig {
    name: string;
    tag: string;
    category: string;
    selectMode: "select" | "toggle";
    initial: {
        count: number;
        names: string[];
    };
    max_cells: number;
    max_columns: number;

    /**
     * Default render glyph. For bar-family plugins (Y Bar / Y Line / Y
     * Scatter / Y Area) this is the fallback glyph when a column has no
     * explicit `chart_type` in `columns_config`. For candlestick-family
     * plugins (Y Candlestick / Y OHLC) it selects between the two
     * candlestick glyph modes. Presence of the field surfaces the
     * Chart Type picker in the column-settings sidebar for bar-family
     * plugins.
     */
    default_chart_type?: PluginChartType;
}

const CHARTS = [
    {
        name: "X/Y Scatter",
        tag: "scatter",
        category: "Charts",
        selectMode: "toggle",
        initial: {
            count: 2,
            names: ["X Axis", "Y Axis", "Color", "Size", "Tooltip"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
    },
    {
        name: "X/Y Line",
        tag: "line",
        category: "Charts",
        selectMode: "select",
        initial: {
            count: 2,
            names: ["X Axis", "Y Axis"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
    },
    {
        name: "Treemap",
        tag: "treemap",
        category: "Charts",
        selectMode: "toggle",
        initial: {
            count: 1,
            names: ["Size", "Color", "Tooltip"],
        },
        max_cells: 10_000_000,
        max_columns: 10,
    },
    {
        name: "Sunburst",
        tag: "sunburst",
        category: "Charts",
        selectMode: "toggle",
        initial: {
            count: 1,
            names: ["Size", "Color", "Tooltip"],
        },
        max_cells: 10_000_000,
        max_columns: 10,
    },
    {
        name: "Y Bar",
        tag: "y-bar",
        category: "Charts",
        selectMode: "select",
        initial: {
            count: 1,
            names: ["Y Axis"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
        default_chart_type: "bar",
    },
    {
        name: "X Bar",
        tag: "x-bar",
        category: "Charts",
        selectMode: "select",
        initial: {
            count: 1,
            names: ["X Axis"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
        default_chart_type: "bar",
    },
    {
        name: "Y Line",
        tag: "y-line",
        category: "Charts",
        selectMode: "select",
        initial: {
            count: 1,
            names: ["Y Axis"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
        default_chart_type: "line",
    },
    {
        name: "Y Scatter",
        tag: "y-scatter",
        category: "Charts",
        selectMode: "select",
        initial: {
            count: 1,
            names: ["Y Axis"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
        default_chart_type: "scatter",
    },
    {
        name: "Y Area",
        tag: "y-area",
        category: "Charts",
        selectMode: "select",
        initial: {
            count: 1,
            names: ["Y Axis"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
        default_chart_type: "area",
    },
    {
        name: "Candlestick",
        tag: "candlestick",
        category: "Charts",
        selectMode: "toggle",
        initial: {
            count: 1,
            names: ["Open", "Close", "High", "Low", "Tooltip"],
        },
        max_cells: 10_000_000,
        max_columns: 50,
        default_chart_type: "candlestick",
    },
    {
        name: "OHLC",
        tag: "ohlc",
        category: "Charts",
        selectMode: "toggle",
        initial: {
            count: 1,
            names: ["Open", "Close", "High", "Low", "Tooltip"],
        },
        max_cells: 100_000,
        max_columns: 50,
        default_chart_type: "ohlc",
    },
    {
        name: "Heatmap",
        tag: "heatmap",
        category: "Charts",
        selectMode: "select",
        initial: {
            count: 1,
            names: ["Color"],
        },
        max_cells: 10_000_000,
        max_columns: 500,
    },
] as const satisfies readonly ChartTypeConfig[];

export default CHARTS;
