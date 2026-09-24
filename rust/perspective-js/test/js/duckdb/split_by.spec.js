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

describeDuckDB("split_by", (getClient) => {
    test("single split_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            split_by: ["Region"],
            group_by: ["Category"],
            aggregates: { Sales: "sum" },
        });

        const columns = await view.column_paths();
        expect(columns).toEqual([
            "Central|Sales",
            "East|Sales",
            "South|Sales",
            "West|Sales",
        ]);

        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: [],
                "Central|Sales": 501239.8908000005,
                "East|Sales": 678781.2399999979,
                "South|Sales": 391721.9050000003,
                "West|Sales": 725457.8245000006,
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

    // https://github.com/perspective-dev/perspective/issues/3148
    test("split_by with group_by and count aggregate", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Row ID"],
            split_by: ["Region"],
            group_by: ["Category"],
            aggregates: { "Row ID": "count" },
        });

        const json = await view.to_json({ start_row: 0, end_row: 4 });
        expect(json).toEqual([
            {
                __ROW_PATH__: [],
                "Central|Row ID": 2323,
                "East|Row ID": 2848,
                "South|Row ID": 1620,
                "West|Row ID": 3203,
            },
            {
                __ROW_PATH__: ["Furniture"],
                "Central|Row ID": 481,
                "East|Row ID": 601,
                "South|Row ID": 332,
                "West|Row ID": 707,
            },
            {
                __ROW_PATH__: ["Office Supplies"],
                "Central|Row ID": 1422,
                "East|Row ID": 1712,
                "South|Row ID": 995,
                "West|Row ID": 1897,
            },
            {
                __ROW_PATH__: ["Technology"],
                "Central|Row ID": 420,
                "East|Row ID": 535,
                "South|Row ID": 293,
                "West|Row ID": 599,
            },
        ]);
        await view.delete();
    });

    test.skip("split_by without group_by", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            split_by: ["Category"],
        });
        const paths = await view.column_paths();
        expect(paths.some((c) => c.includes("Furniture"))).toBe(true);
        expect(paths.some((c) => c.includes("Office Supplies"))).toBe(true);
        expect(paths.some((c) => c.includes("Technology"))).toBe(true);
        await view.delete();
    });

    // https://github.com/perspective-dev/perspective/issues/3237
    test("split_by on values containing double quotes", async function () {
        const table = await getClient().open_table("memory.quoted_test");
        const view = await table.view({
            columns: ["amount"],
            split_by: ["item_title"],
            group_by: ['we"ird'],
            aggregates: { amount: "sum" },
        });

        expect(await view.column_paths()).toEqual([
            "a_b|amount",
            "plain|amount",
            'say "hi"|amount',
        ]);

        expect(await view.to_json()).toEqual([
            {
                __ROW_PATH__: [],
                "a_b|amount": 36,
                "plain|amount": 18,
                'say "hi"|amount': 9,
            },
            {
                __ROW_PATH__: ["g1"],
                "a_b|amount": 4,
                "plain|amount": 2,
                'say "hi"|amount': 1,
            },
            {
                __ROW_PATH__: ["g2"],
                "a_b|amount": 32,
                "plain|amount": 16,
                'say "hi"|amount': 8,
            },
        ]);
        await view.delete();
    });

    // https://github.com/perspective-dev/perspective/issues/3237
    test("split_by on a column name containing double quotes", async function () {
        const table = await getClient().open_table("memory.quoted_test");
        const view = await table.view({
            columns: ["amount"],
            split_by: ['we"ird'],
            group_by: ["item_title"],
            aggregates: { amount: "sum" },
        });

        expect(await view.column_paths()).toEqual(["g1|amount", "g2|amount"]);
        await view.delete();
    });
});
