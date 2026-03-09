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
            "Central_Sales",
            "East_Sales",
            "South_Sales",
            "West_Sales",
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
});
