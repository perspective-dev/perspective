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

describeDuckDB("expressions", (getClient) => {
    test("simple expression", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "doublesales"],
            expressions: { doublesales: '"Sales" * 2' },
        });

        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 261.96, doublesales: 523.92 },
            { Sales: 731.94, doublesales: 1463.88 },
            { Sales: 14.62, doublesales: 29.24 },
            { Sales: 957.5775, doublesales: 1915.155 },
            { Sales: 22.368, doublesales: 44.736 },
        ]);

        await view.delete();
    });

    test("expression with multiple columns", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Profit", "margin"],
            expressions: { margin: '"Profit" / "Sales"' },
        });

        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            {
                Sales: 261.96,
                Profit: 41.9136,
                margin: 0.16000000000000003,
            },
            { Sales: 731.94, Profit: 219.582, margin: 0.3 },
            {
                Sales: 14.62,
                Profit: 6.8714,
                margin: 0.47000000000000003,
            },
            { Sales: 957.5775, Profit: -383.031, margin: -0.4 },
            { Sales: 22.368, Profit: 2.5164, margin: 0.1125 },
        ]);

        await view.delete();
    });

    test("expression with group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["total"],
            group_by: ["Region"],
            expressions: { total: '"Sales" + "Profit"' },
            aggregates: { total: "sum" },
        });

        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], total: 2583597.882000014 },
            {
                __ROW_PATH__: ["Central"],
                total: 540946.2532999996,
            },
            { __ROW_PATH__: ["East"], total: 770304.0199999991 },
            {
                __ROW_PATH__: ["South"],
                total: 438471.33530000027,
            },
            { __ROW_PATH__: ["West"], total: 833876.2733999988 },
        ]);

        await view.delete();
    });
});
