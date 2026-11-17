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

import {
    cell_display,
    grid_expressions,
    neighbour_count,
} from "./expressions.js";
import { HEIGHT, TABLE_NAME, WIDTH } from "./game.js";

const COUNTS_TABLE = "minesweeper_counts";

const LAYOUT = {
    type: "split-layout",
    children: [
        {
            type: "tab-layout",
            tabs: ["board"],
            selected: 0,
        },
        {
            type: "split-layout",
            children: [
                {
                    type: "tab-layout",
                    tabs: ["radar"],
                    selected: 0,
                },
                {
                    type: "tab-layout",
                    tabs: ["flags"],
                    selected: 0,
                },
            ],
            sizes: [0.5, 0.5],
            orientation: "vertical",
        },
    ],
    sizes: [0.5999999999999999, 0.4],
    orientation: "horizontal",
};

/** The `restoreWorkspace()` config: the `board` panel, and a `flags` panel listing every flagged square. */
export function workspace() {
    const { row, col } = grid_expressions(WIDTH);
    return {
        layout: LAYOUT,
        derived_tables: {
            [COUNTS_TABLE]: {
                table: TABLE_NAME,
                columns: ["index", "mine", "revealed", "flagged", "count"],
                expressions: { count: neighbour_count(WIDTH, HEIGHT) },
            },
        },
        panels: {
            board: {
                table: COUNTS_TABLE,
                title: "Board",
                plugin: "Datagrid",
                group_by: ["row"],
                split_by: ["col"],
                columns: ["cell"],
                group_rollup_mode: "flat",
                aggregates: { cell: "last" },
                expressions: { row, col, cell: cell_display() },
                plugin_config: { align: "center", command_column: "none" },
                columns_config: {
                    cell: {
                        fg_mode: "disabled",
                        bg_mode: "gradient",
                        bg_gradient: 8,
                    },
                },
            },
            flags: {
                table: TABLE_NAME,
                title: "Flag log (cheat)",
                plugin: "Datagrid",
                columns: ["row", "col", "mine"],
                filter: [["flagged", "==", true]],
                sort: [
                    ["row", "asc"],
                    ["col", "asc"],
                ],
                expressions: { row, col },
            },
            radar: {
                plugin: "Heatmap",
                table: COUNTS_TABLE,
                theme: "Pro",
                title: "Radar view (cheat)",
                group_by: ["col"],
                split_by: ["row"],
                expressions: {
                    cell: 'if ("revealed") {\n    if ("mine" != True) {\n        integer("count")\n    } else {\n        null\n    }\n} else {\n    null\n}',
                    col: 'integer("index" % 16)',
                    row: '-integer(floor("index" / 16))',
                    "New Column 1":
                        'if ("mine") {\n    1.0\n} else if ("revealed") {\n    0.5\n} else {\n    0.0\n}',
                },
                columns: ["New Column 1"],
                aggregates: {
                    "New Column 1": "dominant",
                },
            },
        },
    };
}
