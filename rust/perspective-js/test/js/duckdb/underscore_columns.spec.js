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

// Column names and values containing "_" must pass through the SQL model
// unmangled, including through `PIVOT`, which internally joins output names
// with "_". https://github.com/perspective-dev/perspective/issues/3187

import { test, expect } from "@perspective-dev/test";
import { describeDuckDB } from "./setup.js";

describeDuckDB("underscore columns", (getClient) => {
    test("table schema() preserves underscore names", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const schema = await table.schema();
        expect(schema).toEqual({
            region_name: "string",
            sub_region: "string",
            account_number: "integer",
            total_sales: "float",
        });
    });

    test("flat view passes underscore names through", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["account_number", "total_sales"],
        });

        const paths = await view.column_paths();
        expect(paths).toEqual(["account_number", "total_sales"]);

        const schema = await view.schema();
        expect(schema).toEqual({
            account_number: "integer",
            total_sales: "float",
        });

        const columns = await view.to_columns();
        expect(columns).toEqual({
            account_number: [1, 2, 3, 4],
            total_sales: [100.5, 200.25, 300.75, 400.0],
        });

        await view.delete();
    });

    test("sort on underscore column", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["account_number"],
            sort: [["account_number", "desc"]],
        });

        const columns = await view.to_columns();
        expect(columns).toEqual({
            account_number: [4, 3, 2, 1],
        });

        await view.delete();
    });

    test("filter on underscore column", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["account_number"],
            filter: [["account_number", ">", 2]],
        });

        const columns = await view.to_columns();
        expect(columns).toEqual({
            account_number: [3, 4],
        });

        await view.delete();
    });

    test("group_by underscore column with underscore values", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            group_by: ["region_name"],
            aggregates: { total_sales: "sum" },
        });

        const json = await view.to_json();
        expect(json).toEqual([
            { __ROW_PATH__: [], total_sales: 1001.5 },
            { __ROW_PATH__: ["east_coast"], total_sales: 300.75 },
            { __ROW_PATH__: ["west_coast"], total_sales: 700.75 },
        ]);

        await view.delete();
    });

    test("split_by underscore column with underscore values", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            split_by: ["region_name"],
        });

        const paths = await view.column_paths();
        expect(paths).toEqual([
            "east_coast|total_sales",
            "west_coast|total_sales",
        ]);

        const json = await view.to_json();
        expect(json).toEqual([
            { "east_coast|total_sales": 100.5, "west_coast|total_sales": null },
            {
                "east_coast|total_sales": 200.25,
                "west_coast|total_sales": null,
            },
            {
                "east_coast|total_sales": null,
                "west_coast|total_sales": 300.75,
            },
            { "east_coast|total_sales": null, "west_coast|total_sales": 400.0 },
        ]);

        await view.delete();
    });

    test("split_by + group_by, multiple underscore columns", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["account_number", "total_sales"],
            group_by: ["sub_region"],
            split_by: ["region_name"],
            aggregates: { account_number: "sum", total_sales: "sum" },
        });

        const paths = await view.column_paths();
        expect(paths).toEqual([
            "east_coast|account_number",
            "east_coast|total_sales",
            "west_coast|account_number",
            "west_coast|total_sales",
        ]);

        // Like the native engine, `view.schema()` is keyed by source column
        // name, not by column path — the datagrid resolves types with it.
        const schema = await view.schema();
        expect(schema).toEqual({
            account_number: "float",
            total_sales: "float",
        });

        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: [],
                "east_coast|account_number": 3,
                "east_coast|total_sales": 300.75,
                "west_coast|account_number": 7,
                "west_coast|total_sales": 700.75,
            },
            {
                __ROW_PATH__: ["bay_area"],
                "east_coast|account_number": null,
                "east_coast|total_sales": null,
                "west_coast|account_number": 3,
                "west_coast|total_sales": 300.75,
            },
            {
                __ROW_PATH__: ["la_metro"],
                "east_coast|account_number": null,
                "east_coast|total_sales": null,
                "west_coast|account_number": 4,
                "west_coast|total_sales": 400.0,
            },
            {
                __ROW_PATH__: ["new_jersey"],
                "east_coast|account_number": 2,
                "east_coast|total_sales": 200.25,
                "west_coast|account_number": null,
                "west_coast|total_sales": null,
            },
            {
                __ROW_PATH__: ["new_york"],
                "east_coast|account_number": 1,
                "east_coast|total_sales": 100.5,
                "west_coast|account_number": null,
                "west_coast|total_sales": null,
            },
        ]);

        await view.delete();
    });

    test("sort with split_by on underscore columns", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            group_by: ["sub_region"],
            split_by: ["region_name"],
            aggregates: { total_sales: "sum" },
            sort: [["total_sales", "desc"]],
        });

        const json = await view.to_json();
        expect(json).toEqual([
            {
                __ROW_PATH__: [],
                "east_coast|total_sales": 300.75,
                "west_coast|total_sales": 700.75,
            },
            {
                __ROW_PATH__: ["la_metro"],
                "east_coast|total_sales": null,
                "west_coast|total_sales": 400.0,
            },
            {
                __ROW_PATH__: ["bay_area"],
                "east_coast|total_sales": null,
                "west_coast|total_sales": 300.75,
            },
            {
                __ROW_PATH__: ["new_jersey"],
                "east_coast|total_sales": 200.25,
                "west_coast|total_sales": null,
            },
            {
                __ROW_PATH__: ["new_york"],
                "east_coast|total_sales": 100.5,
                "west_coast|total_sales": null,
            },
        ]);

        await view.delete();
    });

    test("multi-level split_by on underscore columns", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            split_by: ["region_name", "sub_region"],
        });

        const paths = await view.column_paths();
        expect(paths).toEqual([
            "east_coast|new_jersey|total_sales",
            "east_coast|new_york|total_sales",
            "west_coast|bay_area|total_sales",
            "west_coast|la_metro|total_sales",
        ]);

        const json = await view.to_json({ start_row: 0, end_row: 1 });
        expect(json).toEqual([
            {
                "east_coast|new_jersey|total_sales": null,
                "east_coast|new_york|total_sales": 100.5,
                "west_coast|bay_area|total_sales": null,
                "west_coast|la_metro|total_sales": null,
            },
        ]);

        await view.delete();
    });

    test("expression with underscore alias and underscore inputs", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales", "double_sales"],
            expressions: { double_sales: '"total_sales" * 2' },
        });

        const columns = await view.to_columns();
        expect(columns).toEqual({
            total_sales: [100.5, 200.25, 300.75, 400.0],
            double_sales: [201.0, 400.5, 601.5, 800.0],
        });

        await view.delete();
    });

    test("expression with underscore alias under split_by", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["double_sales"],
            split_by: ["region_name"],
            expressions: { double_sales: '"total_sales" * 2' },
        });

        const paths = await view.column_paths();
        expect(paths).toEqual([
            "east_coast|double_sales",
            "west_coast|double_sales",
        ]);

        const json = await view.to_json({ start_row: 0, end_row: 2 });
        expect(json).toEqual([
            {
                "east_coast|double_sales": 201.0,
                "west_coast|double_sales": null,
            },
            {
                "east_coast|double_sales": 400.5,
                "west_coast|double_sales": null,
            },
        ]);

        await view.delete();
    });
});
