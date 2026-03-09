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

describeDuckDB("group_by", (getClient) => {
    test("single group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(5);
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Sales: 2297200.860299955 },
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

    test("multi-level group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            aggregates: { Sales: "sum" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Sales: 2297200.860299955 },
            {
                __ROW_PATH__: ["Central"],
                Sales: 501239.8908000005,
            },
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
            { __ROW_PATH__: ["East"], Sales: 678781.2399999979 },
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
                __ROW_PATH__: ["South"],
                Sales: 391721.9050000003,
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
            { __ROW_PATH__: ["West"], Sales: 725457.8245000006 },
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

    test("group_by with count aggregate", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "count" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Sales: 9994 },
            { __ROW_PATH__: ["Central"], Sales: 2323 },
            { __ROW_PATH__: ["East"], Sales: 2848 },
            { __ROW_PATH__: ["South"], Sales: 1620 },
            { __ROW_PATH__: ["West"], Sales: 3203 },
        ]);
        await view.delete();
    });

    test("group_by with avg aggregate", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            aggregates: { Sales: "avg" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Sales: 229.8580008304938 },
            {
                __ROW_PATH__: ["Furniture"],
                Sales: 349.83488698727007,
            },
            {
                __ROW_PATH__: ["Office Supplies"],
                Sales: 119.32410089611732,
            },
            {
                __ROW_PATH__: ["Technology"],
                Sales: 452.70927612344155,
            },
        ]);
        await view.delete();
    });

    test("group_by with min aggregate", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Quantity"],
            group_by: ["Region"],
            aggregates: { Quantity: "min" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Quantity: 1 },
            { __ROW_PATH__: ["Central"], Quantity: 1 },
            { __ROW_PATH__: ["East"], Quantity: 1 },
            { __ROW_PATH__: ["South"], Quantity: 1 },
            { __ROW_PATH__: ["West"], Quantity: 1 },
        ]);
        await view.delete();
    });

    test("group_by with max aggregate", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Quantity"],
            group_by: ["Region"],
            aggregates: { Quantity: "max" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Quantity: 14 },
            { __ROW_PATH__: ["Central"], Quantity: 14 },
            { __ROW_PATH__: ["East"], Quantity: 14 },
            { __ROW_PATH__: ["South"], Quantity: 14 },
            { __ROW_PATH__: ["West"], Quantity: 14 },
        ]);
        await view.delete();
    });
});
