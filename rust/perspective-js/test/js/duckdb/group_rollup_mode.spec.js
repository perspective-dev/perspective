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

describeDuckDB("group_rollup_mode", (getClient) => {
    test("flat mode with group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(4);
        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: ["Central"],
                Sales: 501239.8908000005,
            },
            { __ROW_PATH__: ["East"], Sales: 678781.2399999979 },
            {
                __ROW_PATH__: ["South"],
                Sales: 391721.9050000003,
            },
            { __ROW_PATH__: ["West"], Sales: 725457.8245000006 },
        ]);
        await view.delete();
    });

    test("flat mode with multi-level group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(12);
        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: ["Central", "Furniture"],
                Sales: 163797.16380000004,
            },
            {
                __ROW_PATH__: ["Central", "Office Supplies"],
                Sales: 167026.41500000027,
            },
            {
                __ROW_PATH__: ["Central", "Technology"],
                Sales: 170416.3119999999,
            },
            {
                __ROW_PATH__: ["East", "Furniture"],
                Sales: 208291.20400000009,
            },
            {
                __ROW_PATH__: ["East", "Office Supplies"],
                Sales: 205516.0549999999,
            },
            {
                __ROW_PATH__: ["East", "Technology"],
                Sales: 264973.9810000003,
            },
            {
                __ROW_PATH__: ["South", "Furniture"],
                Sales: 117298.6840000001,
            },
            {
                __ROW_PATH__: ["South", "Office Supplies"],
                Sales: 125651.31299999992,
            },
            {
                __ROW_PATH__: ["South", "Technology"],
                Sales: 148771.9079999999,
            },
            {
                __ROW_PATH__: ["West", "Furniture"],
                Sales: 252612.7435000003,
            },
            {
                __ROW_PATH__: ["West", "Office Supplies"],
                Sales: 220853.24900000007,
            },
            {
                __ROW_PATH__: ["West", "Technology"],
                Sales: 251991.83199999997,
            },
        ]);
        await view.delete();
    });

    test("flat mode with group_by and split_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            split_by: ["Region"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(3);
        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: ["Furniture"],
                "Central|Sales": 163797.16380000004,
                "East|Sales": 208291.20400000009,
                "South|Sales": 117298.6840000001,
                "West|Sales": 252612.7435000003,
            },
            {
                __ROW_PATH__: ["Office Supplies"],
                "Central|Sales": 167026.41500000027,
                "East|Sales": 205516.0549999999,
                "South|Sales": 125651.31299999992,
                "West|Sales": 220853.24900000007,
            },
            {
                __ROW_PATH__: ["Technology"],
                "Central|Sales": 170416.3119999999,
                "East|Sales": 264973.9810000003,
                "South|Sales": 148771.9079999999,
                "West|Sales": 251991.83199999997,
            },
        ]);
        await view.delete();
    });

    test("flat mode with group_by and split_by and sort", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            split_by: ["Region"],
            sort: [["Sales", "desc"]],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(3);
        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: ["Technology"],
                "Central|Sales": 170416.3119999999,
                "East|Sales": 264973.9810000003,
                "South|Sales": 148771.9079999999,
                "West|Sales": 251991.83199999997,
            },
            {
                __ROW_PATH__: ["Furniture"],
                "Central|Sales": 163797.16380000004,
                "East|Sales": 208291.20400000009,
                "South|Sales": 117298.6840000001,
                "West|Sales": 252612.7435000003,
            },
            {
                __ROW_PATH__: ["Office Supplies"],
                "Central|Sales": 167026.41500000027,
                "East|Sales": 205516.0549999999,
                "South|Sales": 125651.31299999992,
                "West|Sales": 220853.24900000007,
            },
        ]);
        await view.delete();
    });

    test("flat mode with group_by and sort", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            sort: [["Sales", "desc"]],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: ["West"], Sales: 725457.8245000006 },
            { __ROW_PATH__: ["East"], Sales: 678781.2399999979 },
            {
                __ROW_PATH__: ["Central"],
                Sales: 501239.8908000005,
            },
            {
                __ROW_PATH__: ["South"],
                Sales: 391721.9050000003,
            },
        ]);
        await view.delete();
    });

    test("total mode", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "total",
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(1);
        const json = await view.to_json();
        expect(json).toEqual([{ Sales: 2297200.860299955 }]);
        await view.delete();
    });

    test("total mode with multiple columns", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
            aggregates: { Sales: "sum", Quantity: "sum" },
            group_rollup_mode: "total",
        });
        const json = await view.to_json();
        expect(json).toEqual([{ Sales: 2297200.860299955, Quantity: 37873 }]);
        await view.delete();
    });

    test("total mode with split_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            split_by: ["Region"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "total",
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(1);
        const json = await view.to_json();
        expect(json).toEqual([
            {
                "Central|Sales": 501239.8908000005,
                "East|Sales": 678781.2399999979,
                "South|Sales": 391721.9050000003,
                "West|Sales": 725457.8245000006,
            },
        ]);
        await view.delete();
    });
});
