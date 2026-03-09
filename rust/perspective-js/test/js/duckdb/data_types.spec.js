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

describeDuckDB("data types", (getClient) => {
    test("integer columns", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Quantity"],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Quantity: 2 },
            { Quantity: 3 },
            { Quantity: 2 },
            { Quantity: 5 },
            { Quantity: 2 },
        ]);
        await view.delete();
    });

    test("float columns", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Profit"],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 261.96, Profit: 41.9136 },
            { Sales: 731.94, Profit: 219.582 },
            { Sales: 14.62, Profit: 6.8714 },
            { Sales: 957.5775, Profit: -383.031 },
            { Sales: 22.368, Profit: 2.5164 },
        ]);
        await view.delete();
    });

    test("string columns", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Region", "State", "City"],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            {
                Region: "South",
                State: "Kentucky",
                City: "Henderson",
            },
            {
                Region: "South",
                State: "Kentucky",
                City: "Henderson",
            },
            {
                Region: "West",
                State: "California",
                City: "Los Angeles",
            },
            {
                Region: "South",
                State: "Florida",
                City: "Fort Lauderdale",
            },
            {
                Region: "South",
                State: "Florida",
                City: "Fort Lauderdale",
            },
        ]);
        await view.delete();
    });

    test("date columns", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Order Date"],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { "Order Date": 1478563200000 },
            { "Order Date": 1478563200000 },
            { "Order Date": 1465689600000 },
            { "Order Date": 1444521600000 },
            { "Order Date": 1444521600000 },
        ]);
        await view.delete();
    });
});
