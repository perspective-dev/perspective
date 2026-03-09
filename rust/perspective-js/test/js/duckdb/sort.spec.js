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

describeDuckDB("sort", (getClient) => {
    test("sort ascending", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
            sort: [["Sales", "asc"]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 0.444, Quantity: 1 },
            { Sales: 0.556, Quantity: 1 },
            { Sales: 0.836, Quantity: 1 },
            { Sales: 0.852, Quantity: 1 },
            { Sales: 0.876, Quantity: 1 },
        ]);
        await view.delete();
    });

    test("sort descending", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales", "Quantity"],
            sort: [["Sales", "desc"]],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Sales: 22638.48, Quantity: 6 },
            { Sales: 17499.95, Quantity: 5 },
            { Sales: 13999.96, Quantity: 4 },
            { Sales: 11199.968, Quantity: 4 },
            { Sales: 10499.97, Quantity: 3 },
        ]);
        await view.delete();
    });

    test("sort with group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            sort: [["Sales", "desc"]],
            aggregates: { Sales: "sum" },
        });
        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], Sales: 2297200.860299955 },
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

    test("multi-column sort", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Region", "Sales", "Quantity"],
            sort: [
                ["Region", "asc"],
                ["Sales", "desc"],
            ],
        });
        const json = await view.to_json({ start_row: 0, end_row: 5 });
        expect(json).toEqual([
            { Region: "Central", Sales: 17499.95, Quantity: 5 },
            { Region: "Central", Sales: 9892.74, Quantity: 13 },
            { Region: "Central", Sales: 9449.95, Quantity: 5 },
            { Region: "Central", Sales: 8159.952, Quantity: 8 },
            { Region: "Central", Sales: 5443.96, Quantity: 4 },
        ]);
        await view.delete();
    });
});
