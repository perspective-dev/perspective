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

const CONFIG = {
    columns: ["Sales"],
    group_by: ["Region", "State"],
    aggregates: { Sales: "sum" },
};

async function row_paths(view) {
    return (await view.to_columns()).__ROW_PATH__;
}

describeDuckDB("expand_collapse", (getClient) => {
    test("get_features() declares expand_collapse", async function () {
        const table = await getClient().open_table("memory.superstore");
        const features = await table.get_features();
        expect(features.expand_collapse).toBe(true);
        expect(features.update).toBe(false);
    });

    test("collapse() hides a row's descendants", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view(CONFIG);
        const before = await row_paths(view);
        const central = before.filter((x) => x[0] === "Central").length - 1;
        expect(await view.collapse(1)).toBe(central);
        expect(await view.num_rows()).toBe(before.length - central);
        expect((await row_paths(view)).slice(0, 3)).toEqual([
            [],
            ["Central"],
            ["East"],
        ]);

        expect(await view.collapse(1)).toBe(0);
        await view.delete();
    });

    test("expand() restores a collapsed row's children", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view(CONFIG);
        const before = await row_paths(view);
        const central = await view.collapse(1);
        expect(await view.expand(1)).toBe(central);
        expect(await row_paths(view)).toEqual(before);
        expect(await view.expand(1)).toBe(0);
        await view.delete();
    });

    test("collapse(0) hides everything but the total row", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view(CONFIG);
        const num_rows = await view.num_rows();
        expect(await view.collapse(0)).toBe(num_rows - 1);
        expect(await row_paths(view)).toEqual([[]]);
        expect(await view.expand(0)).toBe(4);
        expect(await row_paths(view)).toEqual([
            [],
            ["Central"],
            ["East"],
            ["South"],
            ["West"],
        ]);

        await view.delete();
    });

    test("set_depth() expands rows no deeper than depth", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view(CONFIG);
        const num_rows = await view.num_rows();
        await view.set_depth(0);
        expect(await view.num_rows()).toBe(5);
        await view.set_depth(2);
        expect(await view.num_rows()).toBe(num_rows);
        await view.delete();
    });

    test("collapsing a leaf changes nothing", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view(CONFIG);
        const num_rows = await view.num_rows();
        expect(await view.collapse(2)).toBe(0);
        expect(await view.num_rows()).toBe(num_rows);
        await view.delete();
    });

    test("flat views are not expandable", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            ...CONFIG,
            group_rollup_mode: "flat",
        });

        const num_rows = await view.num_rows();
        expect(await view.collapse(0)).toBe(0);
        expect(await view.num_rows()).toBe(num_rows);
        await view.delete();
    });

    test("the expansion column does not leak", async function () {
        const client = getClient();
        const table = await client.open_table("memory.superstore");
        const view = await table.view(CONFIG);
        await view.collapse(1);
        expect(await view.schema()).toEqual({ Sales: "float" });
        expect(await view.num_columns()).toBe(1);
        expect(Object.keys(await view.to_columns()).sort()).toEqual([
            "Sales",
            "__ROW_PATH__",
        ]);

        const derived = await client.table(view, { name: "derived_expand" });
        expect(await derived.schema()).toEqual({
            Region: "string",
            State: "string",
            Sales: "float",
        });

        await derived.delete();
        await view.delete();
    });

    test("ungrouped views do not leak the expansion column", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({ columns: ["Region", "Sales"] });
        expect(await view.schema()).toEqual({
            Region: "string",
            Sales: "float",
        });

        expect(await view.num_columns()).toBe(2);
        expect(Object.keys(await view.to_columns()).sort()).toEqual([
            "Region",
            "Sales",
        ]);

        await view.delete();
    });
});
