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

import { SUPERSTORE } from "./blocks.js";
import { featureByName } from "./features.js";
import {
    MARKET_LAYOUTS,
    MARKET_SOURCE,
    WEBCAM_LAYOUTS,
    WEBCAM_SOURCE,
    layoutByTitle,
} from "./streams.js";
import { type Project, multiPanel, split, tab } from "./types.js";

const market = (title: string, theme?: string) => ({
    theme,
    ...layoutByTitle(MARKET_LAYOUTS, title),
});

const webcam = (title: string) => layoutByTitle(WEBCAM_LAYOUTS, title);

const TRADING_DESK = split(
    "horizontal",
    [0.6, 0.4],
    [
        tab("candle"),
        split("vertical", [0.5, 0.5], [tab("book"), tab("blotter")]),
    ],
);

const ORDER_FLOW = split(
    "vertical",
    [0.5, 0.5],
    [
        tab("depth"),
        split("horizontal", [0.5, 0.5], [tab("heat"), tab("closed")]),
    ],
);

const VIDEO_WALL = split(
    "horizontal",
    [0.55, 0.45],
    [
        tab("heat"),
        split("vertical", [0.5, 0.5], [tab("histo"), tab("scatter")]),
    ],
);

const TRADING_DESK_DESCRIPTION =
    "Candlestick, live order book and blotter over one simulated feed.";

const ORDER_FLOW_DESCRIPTION =
    "Depth over time, price-level heatmap and closed orders from the same " +
    "feed.";

const VIDEO_WALL_DESCRIPTION =
    "One camera, three readings: heatmap, luminosity histogram and scatter.";

/**
 * Combinations of existing Projects over ONE source. Each looks its member
 * layouts up BY NAME and throws at module load if a name drifts — a loud
 * drift alarm beats a silently empty panel.
 */
export const DASHBOARD_PROJECTS: Project[] = [
    {
        id: "market-trading-desk",
        title: "Market",
        description: TRADING_DESK_DESCRIPTION,
        source: MARKET_SOURCE,
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_0",
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_2"],
                        selected: 0,
                    },
                    {
                        type: "split-layout",
                        children: [
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_1"],
                                selected: 0,
                            },
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_0"],
                                selected: 0,
                            },
                        ],
                        sizes: [0.5, 0.5],
                        orientation: "vertical",
                    },
                ],
                sizes: [0.5, 0.5],
                orientation: "horizontal",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_0: {
                    columns_config: {
                        price: {
                            number_fg_mode: "label-bar",
                            fg_gradient: 20,
                        },
                    },
                    plugin: "Datagrid",
                    table: "market",
                    title: "Blotter",
                    sort: [["timestamp", "desc"]],
                    columns: [
                        "id",
                        "side",
                        "security",
                        "price",
                        "timestamp",
                        "status",
                    ],
                },
                PERSPECTIVE_GENERATED_ID_1: {
                    plugin: "X Bar",
                    table: "market",
                    title: "Order Book (Chart)",
                    group_by: ['bucket("price", 0.5)'],
                    split_by: ["side"],
                    sort: [['bucket("price", 0.5)', "desc"]],
                    filter: [["status", "==", "open"]],
                    expressions: {
                        "if(\"side\"=='buy'){-1}else{1}":
                            "if(\"side\"=='buy'){-1}else{1}",
                        'bucket("price", 0.5)': 'bucket("price", 0.5)',
                    },
                    columns: ["if(\"side\"=='buy'){-1}else{1}"],
                },
                PERSPECTIVE_GENERATED_ID_2: {
                    plugin: "Candlestick",
                    table: "market",
                    title: "Candlestick",
                    group_by: ["bucket(\"timestamp\", 'm')"],
                    filter: [["status", "==", "closed"]],
                    expressions: {
                        "price 3": '"price"',
                        "bucket(\"timestamp\", 'm')":
                            "bucket(\"timestamp\", 'm')",
                        "price 2": '"price"',
                    },
                    columns: ["price", null, "price 2", "price 3"],
                    aggregates: {
                        price: "avg",
                        "price 3": "low",
                        "price 2": "high",
                    },
                },
            },
        },
    },
    {
        id: "market-trading-desk-2",
        title: "Market — Themed",
        description: TRADING_DESK_DESCRIPTION,
        source: MARKET_SOURCE,
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_2",
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_2"],
                        selected: 0,
                    },
                    {
                        type: "split-layout",
                        children: [
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_1"],
                                selected: 0,
                            },
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_0"],
                                selected: 0,
                            },
                        ],
                        sizes: [0.5, 0.5],
                        orientation: "vertical",
                    },
                ],
                sizes: [0.5, 0.5],
                orientation: "horizontal",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_0: {
                    columns_config: {
                        price: {
                            number_fg_mode: "label-bar",
                            fg_gradient: 20,
                        },
                    },
                    plugin: "Datagrid",
                    theme: "Solarized Dark",
                    table: "market",
                    title: "Blotter",
                    sort: [["timestamp", "desc"]],
                    columns: [
                        "id",
                        "side",
                        "security",
                        "price",
                        "timestamp",
                        "status",
                    ],
                },
                PERSPECTIVE_GENERATED_ID_1: {
                    plugin: "X Bar",
                    theme: "Phosphor",
                    table: "market",
                    title: "Order Book (Chart)",
                    group_by: ['bucket("price", 0.5)'],
                    split_by: ["side"],
                    sort: [['bucket("price", 0.5)', "desc"]],
                    filter: [["status", "==", "open"]],
                    expressions: {
                        "if(\"side\"=='buy'){-1}else{1}":
                            "if(\"side\"=='buy'){-1}else{1}",
                        'bucket("price", 0.5)': 'bucket("price", 0.5)',
                    },
                    columns: ["if(\"side\"=='buy'){-1}else{1}"],
                },
                PERSPECTIVE_GENERATED_ID_2: {
                    plugin: "Candlestick",
                    theme: "Dracula",
                    table: "market",
                    title: "Candlestick",
                    group_by: ["bucket(\"timestamp\", 'm')"],
                    filter: [["status", "==", "closed"]],
                    expressions: {
                        "price 3": '"price"',
                        "bucket(\"timestamp\", 'm')":
                            "bucket(\"timestamp\", 'm')",
                        "price 2": '"price"',
                    },
                    columns: ["price", null, "price 2", "price 3"],
                    aggregates: {
                        price: "avg",
                        "price 3": "low",
                        "price 2": "high",
                    },
                },
            },
        },
    },
    {
        id: "market-order-flow",
        title: "Market — Orders",
        description: ORDER_FLOW_DESCRIPTION,
        source: MARKET_SOURCE,
        workspace: multiPanel(ORDER_FLOW, {
            depth: market("Depth Timeseries"),
            heat: market("Heatmap"),
            closed: market("Closed Orders"),
        }),
    },
    {
        id: "market-order-flow-themed",
        title: "Market — Orders Themed",
        description: ORDER_FLOW_DESCRIPTION,
        source: MARKET_SOURCE,
        workspace: multiPanel(ORDER_FLOW, {
            depth: market("Depth Timeseries", "Vaporwave"),
            heat: market("Heatmap", "Solarized Dark"),
            closed: market("Closed Orders", "Solarized Light"),
        }),
    },
    {
        id: "webcam-video-wall",
        title: "Webcam — Video Wall",
        description: VIDEO_WALL_DESCRIPTION,
        source: WEBCAM_SOURCE,
        workspace: multiPanel(VIDEO_WALL, {
            heat: webcam("Heatmap Cam"),
            histo: webcam("Luminosity Histogram"),
            scatter: webcam("Scatter Cam"),
        }),
    },
    {
        id: "webcam-video-wall-2",
        title: "Webcam — Video Wall Themed",
        description: VIDEO_WALL_DESCRIPTION,
        source: WEBCAM_SOURCE,
        workspace: {
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_0"],
                        selected: 0,
                    },
                    {
                        type: "split-layout",
                        children: [
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_1"],
                                selected: 0,
                            },
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_2"],
                                selected: 0,
                            },
                        ],
                        sizes: [0.5, 0.5],
                        orientation: "vertical",
                    },
                ],
                sizes: [0.55, 0.45],
                orientation: "horizontal",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_0: {
                    columns_config: {},
                    plugin: "Heatmap",
                    plugin_config: {},
                    table: "webcam",
                    theme: "Phosphor",
                    title: "Heatmap Cam",
                    group_by: ["x"],
                    split_by: ["y"],
                    sort: [],
                    filter: [],
                    group_rollup_mode: "flat",
                    split_rollup_mode: "flat",
                    expressions: {
                        y: '-floor("index" / 80)',
                        x: '-"index" % 80',
                    },
                    columns: ["color"],
                    aggregates: {},
                },
                PERSPECTIVE_GENERATED_ID_1: {
                    columns_config: {},
                    plugin: "Y Bar",
                    plugin_config: {},
                    table: "webcam",
                    theme: "Dracula",
                    title: "Luminosity Histogram",
                    group_by: ['bucket("color", 5)'],
                    split_by: [],
                    sort: [],
                    filter: [],
                    group_rollup_mode: "flat",
                    split_rollup_mode: "flat",
                    expressions: {
                        'bucket("color", 5)': 'bucket("color", 5)',
                        y: '-floor("index" / 80)',
                        x: '-"index" % 80',
                    },
                    columns: ["color"],
                    aggregates: {},
                },
                PERSPECTIVE_GENERATED_ID_2: {
                    columns_config: {},
                    plugin: "X/Y Scatter",
                    plugin_config: {},
                    table: "webcam",
                    theme: "Vaporwave",
                    title: "Scatter Cam",
                    group_by: ["x", "y"],
                    split_by: [],
                    sort: [],
                    filter: [["x", "<", 0]],
                    group_rollup_mode: "flat",
                    split_rollup_mode: "flat",
                    expressions: {
                        y: 'floor("index" / 80)',
                        "New Column 2": '-floor("index" / 80) * 50 - "color"',
                        x: '-"index" % 80',
                    },
                    columns: [
                        "x",
                        "New Column 2",
                        "color",
                        null,
                        null,
                        null,
                        null,
                    ],
                    aggregates: {
                        "New Column 2": "avg",
                        x: "avg",
                    },
                },
            },
            active: "PERSPECTIVE_GENERATED_ID_0",
        },
    },
];
