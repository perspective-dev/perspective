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

describeDuckDB("view", (getClient) => {
    test("num_rows()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({ columns: ["Sales", "Profit"] });
        const numRows = await view.num_rows();
        expect(numRows).toBe(9994);
        await view.delete();
    });

    test("num_columns()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Profit", "State"],
        });

        const numColumns = await view.num_columns();
        expect(numColumns).toBe(3);
        await view.delete();
    });

    test("schema()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Profit", "State"],
        });
        const schema = await view.schema();
        expect(schema).toEqual({
            Sales: "float",
            Profit: "float",
            State: "string",
        });
        await view.delete();
    });

    test("to_json()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 261.96, Quantity: 2 },
            { Sales: 731.94, Quantity: 3 },
            { Sales: 14.62, Quantity: 2 },
            { Sales: 957.5775, Quantity: 5 },
            { Sales: 22.368, Quantity: 2 },
        ]);
        await view.delete();
    });

    test("to_columns()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
        });
        const columns = await view.to_columns({
            start_row: 0,
            end_row: 5,
        });
        expect(columns).toEqual({
            Sales: [261.96, 731.94, 14.62, 957.5775, 22.368],
            Quantity: [2, 3, 2, 5, 2],
        });
        await view.delete();
    });

    test("column_paths()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Profit", "State"],
        });
        const paths = await view.column_paths();
        expect(paths).toEqual(["Sales", "Profit", "State"]);
        await view.delete();
    });
});
