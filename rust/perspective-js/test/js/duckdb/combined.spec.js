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

import { test, expect } from "@perspective-dev/test";
import { describeDuckDB } from "./setup.js";

describeDuckDB("combined operations", (getClient) => {
    test("group_by + filter + sort", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            filter: [["Region", "==", "West"]],
            sort: [["Sales", "desc"]],
            aggregates: { Sales: "sum" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Sales: 725457.8245000006 },
            {
                __ROW_PATH__: ["Furniture"],
                Sales: 252612.7435000003,
            },
            {
                __ROW_PATH__: ["Technology"],
                Sales: 251991.83199999997,
            },
            {
                __ROW_PATH__: ["Office Supplies"],
                Sales: 220853.24900000007,
            },
        ]);
        await view.delete();
    });

    test("split_by + group_by + filter", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            split_by: ["Region"],
            filter: [["Quantity", ">", 3]],
            aggregates: { Sales: "sum" },
        });

        const paths = await view.column_paths();
        expect(paths).toEqual([
            "Central_Sales",
            "East_Sales",
            "South_Sales",
            "West_Sales",
        ]);

        const numRows = await view.num_rows();
        expect(numRows).toBe(4);

        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: [],
                "Central|Sales": 332883.0567999998,
                "East|Sales": 455143.735,
                "South|Sales": 274208.7699999999,
                "West|Sales": 470561.28350000136,
            },
            {
                __ROW_PATH__: ["Furniture"],
                "Central|Sales": 111457.73279999988,
                "East|Sales": 140376.95899999997,
                "South|Sales": 80859.618,
                "West|Sales": 165219.5734999998,
            },
            {
                __ROW_PATH__: ["Office Supplies"],
                "Central|Sales": 103937.78599999992,
                "East|Sales": 135823.893,
                "South|Sales": 84393.3579999999,
                "West|Sales": 140206.93099999975,
            },
            {
                __ROW_PATH__: ["Technology"],
                "Central|Sales": 117487.53800000002,
                "East|Sales": 178942.883,
                "South|Sales": 108955.79400000005,
                "West|Sales": 165134.77900000007,
            },
        ]);
        await view.delete();
    });

    test("split_by only", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            split_by: ["Region"],
            filter: [["Quantity", ">", 3]],
        });

        const paths = await view.column_paths();
        expect(paths).toEqual([
            "Central_Sales",
            "East_Sales",
            "South_Sales",
            "West_Sales",
        ]);

        const numRows = await view.num_rows();
        expect(numRows).toBe(4284);
        const json = await view.to_json({ start_row: 0, end_row: 1 });
        expect(json).toEqual([
            {
                "Central|Sales": null,
                "East|Sales": null,
                "South|Sales": 957.5775,
                "West|Sales": null,
            },
        ]);
        await view.delete();
    });

    test("split_by only + sort", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            split_by: ["Region"],
            sort: [["Sales", "desc"]],
            filter: [["Quantity", ">", 3]],
        });

        const paths = await view.column_paths();
        expect(paths).toEqual([
            "Central_Sales",
            "East_Sales",
            "South_Sales",
            "West_Sales",
        ]);

        const numRows = await view.num_rows();
        expect(numRows).toBe(4284);
        const json = await view.to_json({ start_row: 0, end_row: 1 });
        expect(json).toEqual([
            {
                "Central|Sales": null,
                "East|Sales": null,
                "South|Sales": 22638.48,
                "West|Sales": null,
            },
        ]);
        await view.delete();
    });

    test("expressions + group_by + sort", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["profitmargin"],
            group_by: ["Region"],
            expressions: { profitmargin: '"Profit" / "Sales" * 100' },
            sort: [["profitmargin", "desc"]],
            aggregates: { profitmargin: "avg" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: [],
                profitmargin: 12.031392972104467,
            },
            {
                __ROW_PATH__: ["West"],
                profitmargin: 21.948661793784012,
            },
            {
                __ROW_PATH__: ["East"],
                profitmargin: 16.722695960406636,
            },
            {
                __ROW_PATH__: ["South"],
                profitmargin: 16.35190329218107,
            },
            {
                __ROW_PATH__: ["Central"],
                profitmargin: -10.407293926323575,
            },
        ]);
        await view.delete();
    });
});
