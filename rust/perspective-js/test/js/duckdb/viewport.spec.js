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

describeDuckDB("viewport", (getClient) => {
    test("start_row and end_row", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Profit"],
        });
        const json = await view.to_json({ start_row: 10, end_row: 15 });
        expect(json).toEqual([
            { Sales: 1706.184, Profit: 85.3092 },
            { Sales: 911.424, Profit: 68.3568 },
            { Sales: 15.552, Profit: 5.4432 },
            { Sales: 407.976, Profit: 132.5922 },
            { Sales: 68.81, Profit: -123.858 },
        ]);
        await view.delete();
    });

    test("start_col and end_col", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Profit", "Quantity", "Discount"],
        });
        const json = await view.to_json({
            start_row: 0,
            end_row: 5,
            start_col: 1,
            end_col: 3,
        });
        expect(json).toEqual([
            { Profit: 41.9136, Quantity: 2 },
            { Profit: 219.582, Quantity: 3 },
            { Profit: 6.8714, Quantity: 2 },
            { Profit: -383.031, Quantity: 5 },
            { Profit: 2.5164, Quantity: 2 },
        ]);
        await view.delete();
    });
});
