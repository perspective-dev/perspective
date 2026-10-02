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

async function expect_rejects(promise) {
    let error;
    try {
        await promise;
    } catch (e) {
        error = e;
    }

    expect(error).toBeDefined();
}

describeDuckDB("table from view", (getClient) => {
    test("a flat view", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Region", "Sales"],
            filter: [["Sales", ">", 5000]],
        });

        const derived = await client.table(view, { name: "derived_flat" });
        expect(await derived.schema()).toEqual({
            Region: "string",
            Sales: "float",
        });

        const child = await derived.view({ columns: ["Region", "Sales"] });
        expect(await child.to_json()).toEqual(await view.to_json());
        await child.delete();
        await derived.delete();
        await view.delete();
    });

    test("a group_by view unrolls its row path", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
        });

        const derived = await client.table(view, { name: "derived_group" });
        expect(await derived.schema()).toEqual({
            Region: "string",
            Sales: "float",
        });

        const child = await derived.view({
            columns: ["Region", "Sales"],
        });

        const expected = (await view.to_json()).map((row) => ({
            Region: row.__ROW_PATH__[0] ?? null,
            Sales: row.Sales,
        }));

        const key = (row) => String(row["Region"]);
        const by_key = (a, b) => key(a).localeCompare(key(b));
        expect((await child.to_json()).sort(by_key)).toEqual(
            expected.sort(by_key),
        );

        await child.delete();
        await derived.delete();
        await view.delete();
    });

    test("a flat-rollup split_by view", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            split_by: ["Region"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await client.table(view, { name: "derived_split" });
        expect(await derived.columns()).toEqual([
            "Category",
            "Central|Sales",
            "East|Sales",
            "South|Sales",
            "West|Sales",
        ]);

        const child = await derived.view({
            columns: ["Category", "West|Sales"],
            filter: [["West|Sales", ">", 250000]],
        });

        const expected = (await view.to_json())
            .filter((row) => row["West|Sales"] > 250000)
            .map((row) => row.__ROW_PATH__[0])
            .sort();

        const actual = (await child.to_json())
            .map((row) => row["Category"])
            .sort();

        expect(actual).toEqual(expected);
        await child.delete();
        await derived.delete();
        await view.delete();
    });

    test("an explicit schema", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Category"],
            split_by: ["Region"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await client.table(view, {
            name: "derived_schema",
            schema: {
                Category: "string",
                "West|Sales": "float",
                "North|Sales": "float",
            },
        });

        expect(await derived.schema()).toEqual({
            Category: "string",
            "West|Sales": "float",
            "North|Sales": "float",
        });

        const child = await derived.view({
            columns: ["Category", "West|Sales", "North|Sales"],
        });

        const json = await child.to_json();
        expect(json).toHaveLength(3);
        expect(json.every((row) => row["North|Sales"] === null)).toBe(true);
        expect(json.every((row) => row["West|Sales"] > 0)).toBe(true);
        await child.delete();
        await derived.delete();
        await view.delete();
    });

    test("an aggregate of a group_by column is qualified", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Region", "Sales"],
            group_by: ["Region"],
            aggregates: { Region: "count", Sales: "sum" },
        });

        const derived = await client.table(view, { name: "derived_qualified" });
        expect(await derived.columns()).toEqual([
            "Region",
            "Region (count)",
            "Sales",
        ]);

        const child = await derived.view({
            columns: ["Region", "Region (count)"],
        });

        expect(await child.num_rows()).toEqual(await view.num_rows());
        await child.delete();
        await derived.delete();
        await view.delete();
    });

    test("rejects a mismatched type, index and limit", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
        });

        await expect_rejects(
            client.table(view, { schema: { Sales: "string" } }),
        );

        await expect_rejects(client.table(view, { index: "Sales" }));
        await expect_rejects(client.table(view, { limit: 10 }));
        await view.delete();
    });
});
