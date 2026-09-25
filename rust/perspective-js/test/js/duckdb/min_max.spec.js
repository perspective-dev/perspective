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

describeDuckDB("min_max", (getClient) => {
    test("get_min_max() on integer column", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({ columns: ["Quantity"] });
        const result = await view.get_min_max("Quantity");
        expect(result[0]).toBe(1);
        expect(result[1]).toBe(14);
        await view.delete();
    });

    test("get_min_max() on float column", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({ columns: ["Sales"] });
        const result = await view.get_min_max("Sales");
        expect(result[0]).toBe(0.444);
        expect(result[1]).toBe(22638.48);
        await view.delete();
    });

    test("get_min_max() on string column", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({ columns: ["Category"] });
        const result = await view.get_min_max("Category");
        expect(result[0]).toBe("Furniture");
        expect(result[1]).toBe("Technology");
        await view.delete();
    });

    test("get_min_max() with group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
        });
        const result = await view.get_min_max("Sales");
        expect(result[0]).toBeGreaterThan(0);
        expect(result[1]).toBeGreaterThan(0);
        expect(result[1]).toBeGreaterThanOrEqual(result[0]);
        await view.delete();
    });

    test("get_min_max() with filter", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Quantity"],
            filter: [["Quantity", ">", 10]],
        });
        const result = await view.get_min_max("Quantity");
        expect(result[0]).toBeGreaterThanOrEqual(11);
        expect(result[1]).toBe(14);
        await view.delete();
    });

    // https://github.com/perspective-dev/perspective/issues/3237
    test("get_min_max() on a column path containing double quotes", async function () {
        const table = await getClient().open_table("memory.quoted_test");
        const view = await table.view({
            columns: ["amount"],
            split_by: ["item_title"],
            group_by: ['we"ird'],
            aggregates: { amount: "sum" },
        });

        const result = await view.get_min_max('say "hi"|amount');
        expect(result[0]).toBe(1);
        expect(result[1]).toBe(8);
        await view.delete();
    });
});
