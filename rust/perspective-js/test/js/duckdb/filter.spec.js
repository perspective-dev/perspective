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

describeDuckDB("filter", (getClient) => {
    test("filter with equals", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Region"],
            filter: [["Region", "==", "West"]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 14.62, Region: "West" },
            { Sales: 48.86, Region: "West" },
            { Sales: 7.28, Region: "West" },
            { Sales: 907.152, Region: "West" },
            { Sales: 18.504, Region: "West" },
        ]);
        await view.delete();
    });

    test("filter with not equals", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Region"],
            filter: [["Region", "!=", "West"]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 261.96, Region: "South" },
            { Sales: 731.94, Region: "South" },
            { Sales: 957.5775, Region: "South" },
            { Sales: 22.368, Region: "South" },
            { Sales: 15.552, Region: "South" },
        ]);
        await view.delete();
    });

    test("filter with greater than", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
            filter: [["Quantity", ">", 5]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 48.86, Quantity: 7 },
            { Sales: 907.152, Quantity: 6 },
            { Sales: 1706.184, Quantity: 9 },
            { Sales: 665.88, Quantity: 6 },
            { Sales: 19.46, Quantity: 7 },
        ]);
        await view.delete();
    });

    test("filter with less than", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
            filter: [["Quantity", "<", 3]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 261.96, Quantity: 2 },
            { Sales: 14.62, Quantity: 2 },
            { Sales: 22.368, Quantity: 2 },
            { Sales: 55.5, Quantity: 2 },
            { Sales: 8.56, Quantity: 2 },
        ]);
        await view.delete();
    });

    test("filter with greater than or equal", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
            filter: [["Quantity", ">=", 10]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 40.096, Quantity: 14 },
            { Sales: 43.12, Quantity: 14 },
            { Sales: 384.45, Quantity: 11 },
            { Sales: 3347.37, Quantity: 13 },
            { Sales: 100.24, Quantity: 10 },
        ]);
        await view.delete();
    });

    test("filter with less than or equal", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
            filter: [["Quantity", "<=", 2]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 261.96, Quantity: 2 },
            { Sales: 14.62, Quantity: 2 },
            { Sales: 22.368, Quantity: 2 },
            { Sales: 55.5, Quantity: 2 },
            { Sales: 8.56, Quantity: 2 },
        ]);
        await view.delete();
    });

    test("filter with LIKE", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "State"],
            filter: [["State", "LIKE", "Cal%"]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 14.62, State: "California" },
            { Sales: 48.86, State: "California" },
            { Sales: 7.28, State: "California" },
            { Sales: 907.152, State: "California" },
            { Sales: 18.504, State: "California" },
        ]);
        await view.delete();
    });

    test("multiple filters", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Region", "Quantity"],
            filter: [
                ["Region", "==", "West"],
                ["Quantity", ">", 3],
            ],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 48.86, Region: "West", Quantity: 7 },
            { Sales: 7.28, Region: "West", Quantity: 4 },
            { Sales: 907.152, Region: "West", Quantity: 6 },
            { Sales: 114.9, Region: "West", Quantity: 5 },
            { Sales: 1706.184, Region: "West", Quantity: 9 },
        ]);
        await view.delete();
    });

    test("filter with group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            filter: [["Region", "==", "West"]],
            aggregates: { Sales: "sum" },
        });
        const numRows = await view.num_rows();
        expect(numRows).toBe(4);
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Sales: 725457.8245000006 },
            {
                __ROW_PATH__: ["Furniture"],
                Sales: 252612.7435000003,
            },
            {
                __ROW_PATH__: ["Office Supplies"],
                Sales: 220853.24900000007,
            },
            {
                __ROW_PATH__: ["Technology"],
                Sales: 251991.83199999997,
            },
        ]);
        await view.delete();
    });
});
