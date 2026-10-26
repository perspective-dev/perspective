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

    test("a name that is not an identifier", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
        });

        const derived = await client.table(view, {
            name: "memory.superstore GROUP BY Region",
        });

        expect(await derived.schema()).toEqual({
            Region: "string",
            Sales: "float",
        });

        expect(await derived.size()).toEqual(await view.num_rows());
        const child = await derived.view({ columns: ["Region", "Sales"] });
        expect(await child.num_rows()).toEqual(await view.num_rows());
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

    test("an expression column", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Region", "Sales", "doublesales"],
            expressions: { doublesales: '"Sales" * 2' },
            filter: [["Sales", ">", 5000]],
        });

        const derived = await client.table(view, {
            name: "derived_expression",
        });

        expect(await derived.schema()).toEqual({
            Region: "string",
            Sales: "float",
            doublesales: "float",
        });

        const child = await derived.view({
            columns: ["Region", "Sales", "doublesales"],
        });

        expect(await child.to_json()).toEqual(await view.to_json());
        await child.delete();
        await derived.delete();
        await view.delete();
    });

    test("a derived table of a derived table", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region", "State"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await client.table(view, {
            name: "memory.superstore GROUP BY Region, State",
        });

        const sub_view = await derived.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });

        const sub_derived = await client.table(sub_view, {
            name: "memory.superstore GROUP BY Region, State GROUP BY Region",
        });

        expect(await sub_derived.schema()).toEqual({
            Region: "string",
            Sales: "float",
        });

        const child = await sub_derived.view({ columns: ["Region", "Sales"] });
        const expected_view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });

        const by_region = (a, b) => a.Region.localeCompare(b.Region);
        const expected = (await expected_view.to_json())
            .map((row) => ({ Region: row.__ROW_PATH__[0], Sales: row.Sales }))
            .sort(by_region);

        const actual = (await child.to_json()).sort(by_region);
        expect(actual.map((row) => row.Region)).toEqual(
            expected.map((row) => row.Region),
        );

        actual.forEach((row, i) =>
            expect(row.Sales).toBeCloseTo(expected[i].Sales, 6),
        );

        await expected_view.delete();
        await child.delete();
        await sub_derived.delete();
        await sub_view.delete();
        await derived.delete();
        await view.delete();
    });

    test("a view of a derived table", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region", "State"],
            aggregates: { Sales: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await client.table(view, {
            name: "memory.superstore GROUP BY Region, State 1",
        });

        const child = await derived.view({
            columns: ["State", "Sales", "double"],
            expressions: { double: '"Sales" * 2' },
            filter: [["Region", "==", "West"]],
            sort: [["Sales", "desc"]],
        });

        const expected = (await view.to_json())
            .filter((row) => row.__ROW_PATH__[0] === "West")
            .map((row) => ({ State: row.__ROW_PATH__[1], Sales: row.Sales }))
            .sort((a, b) => b.Sales - a.Sales);

        const rows = await child.to_json();
        expect(rows.map((row) => row.State)).toEqual(
            expected.map((row) => row.State),
        );

        rows.forEach((row, i) =>
            expect(row.double).toBeCloseTo(2 * expected[i].Sales, 6),
        );

        await child.delete();
        await derived.delete();
        await view.delete();
    });

    test("deleting a derived table frees its name", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
        });

        const name = "memory.superstore GROUP BY Region 2";
        await (await client.table(view, { name })).delete();
        const derived = await client.table(view, { name });
        expect(await derived.size()).toEqual(await view.num_rows());
        await derived.delete();
        await view.delete();
    });
});
