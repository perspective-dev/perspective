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

export const CASES = [
    {
        name: "Y Line (split)",
        config: {
            plugin: "Y Line",
            columns: ["Sales"],
            // group_by: ["Category"],
            split_by: ["Region"],
        },
    },
    {
        name: "Y Line",
        config: {
            plugin: "Y Line",
            columns: ["Sales"],
            // group_by: ["Category"],
        },
    },
    {
        name: "Y Bar",
        config: {
            plugin: "Y Bar",
            columns: ["Sales"],
            // group_by: ["Category"],
        },
    },
    {
        name: "X Bar",
        config: {
            plugin: "X Bar",
            columns: ["Sales"],
            // group_by: ["Category"],
        },
    },
    {
        name: "Y Area",
        config: {
            plugin: "Y Area",
            columns: ["Sales"],
            // group_by: ["Category"],
        },
    },
    {
        name: "Y Scatter",
        config: {
            plugin: "Y Scatter",
            columns: ["Sales"],
            // group_by: ["Category"],
        },
    },
    {
        name: "X/Y Scatter",
        config: {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
        },
    },
    {
        name: "Heatmap",
        config: {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Category"],
            // split_by: ["Region"],
        },
    },
    {
        name: "Treemap",
        config: {
            plugin: "Treemap",
            columns: ["Sales"],
            // group_by: ["Category", "Sub-Category"],
        },
    },
    // {
    //     name: "Sunburst",
    //     config: {
    //         plugin: "Sunburst",
    //         columns: ["Sales"],
    //         // group_by: ["State", "City"],
    //     },
    // },
    {
        name: "Candlestick",
        config: {
            plugin: "Candlestick",
            columns: ["Open", "Close", "High", "Low"],
            // group_by: ["Category"],
        },
    },
    {
        name: "Y OHLC",
        config: {
            plugin: "OHLC",
            columns: ["Open", "Close", "High", "Low"],
            // group_by: ["Category"],
        },
    },
];
