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
    default_chart_type?: PluginChartType;
}

const SERIES = "Series Charts";
const CART = "Cartesian Charts";
const HIER = "Hierarchical Charts";
const FIN = "Financial Charts";
const X_AXIS = ["X Axis"];
const Y_AXIS = ["Y Axis"];
const SELECT = "select";
const TOGGLE = "toggle";

const DEFAULT_MAX_CELLS = 10_000_000;
const DEFAULT_MAX_COLUMNS = 50;

function make(
    name: string,
    tag: string,
    category: string,
    selectMode: "select" | "toggle",
    count: number,
    names: readonly string[],
    overrides?: Partial<
        Pick<
            ChartTypeConfig,
            "max_cells" | "max_columns" | "default_chart_type"
        >
    >,
): ChartTypeConfig {
    return {
        name,
        tag,
        category,
        selectMode,
        initial: { count, names: names as string[] },
        max_cells: overrides?.max_cells ?? DEFAULT_MAX_CELLS,
        max_columns: overrides?.max_columns ?? DEFAULT_MAX_COLUMNS,
        ...(overrides?.default_chart_type
            ? { default_chart_type: overrides.default_chart_type }
            : {}),
    };
}

const FIN_NAMES = ["Open", "Close", "High", "Low", "Tooltip"];
const HIER_NAMES = ["Size", "Color", "Tooltip"];

const CHARTS: ChartTypeConfig[] = [
    make("X Bar", "x-bar", SERIES, SELECT, 1, X_AXIS, {
        default_chart_type: "bar",
    }),
    make("Y Bar", "y-bar", SERIES, SELECT, 1, Y_AXIS, {
        default_chart_type: "bar",
    }),
    make("Y Line", "y-line", SERIES, SELECT, 1, Y_AXIS, {
        default_chart_type: "line",
    }),
    make("Y Scatter", "y-scatter", SERIES, SELECT, 1, Y_AXIS, {
        default_chart_type: "scatter",
    }),
    make("Y Area", "y-area", SERIES, SELECT, 1, Y_AXIS, {
        default_chart_type: "area",
    }),
    make("X/Y Scatter", "scatter", CART, TOGGLE, 2, [
        "X Axis",
        "Y Axis",
        "Color",
        "Size",
        "Label",
        "Tooltip",
    ]),
    make("X/Y Line", "line", CART, SELECT, 2, ["X Axis", "Y Axis"]),
    make("Treemap", "treemap", HIER, TOGGLE, 1, HIER_NAMES, {
        max_columns: 10,
    }),
    make("Sunburst", "sunburst", HIER, TOGGLE, 1, HIER_NAMES, {
        max_columns: 10,
    }),
    make("Heatmap", "heatmap", HIER, SELECT, 1, ["Color"], {
        max_columns: 500,
    }),
    make("Candlestick", "candlestick", FIN, TOGGLE, 1, FIN_NAMES, {
        default_chart_type: "candlestick",
    }),
    make("OHLC", "ohlc", FIN, TOGGLE, 1, FIN_NAMES, {
        max_cells: 100_000,
        default_chart_type: "ohlc",
    }),
];

export default CHARTS;
