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

// The DuckDB virtual-server mirror of the engine's `split_rollup_mode`
// suite. The `underscore_test` table (4 rows, known values) pins exact
// values AND regression-covers PIVOT's `_`-separator quirk (#3187) against
// the CASE-truncated subtotal names.

import { test, expect } from "@perspective-dev/test";
import { describeDuckDB } from "./setup.js";

describeDuckDB("split_rollup_mode", (getClient) => {
    test("rollup emits grand-total column group in totals-before order", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            group_by: ["region_name"],
            split_by: ["sub_region"],
            aggregates: { total_sales: "sum" },
            split_rollup_mode: "rollup",
        });
        const paths = await view.column_paths();
        expect(paths).toEqual([
            "total_sales",
            "bay_area|total_sales",
            "la_metro|total_sales",
            "new_jersey|total_sales",
            "new_york|total_sales",
        ]);

        const cols = await view.to_columns();
        expect(cols).toEqual({
            __ROW_PATH__: [[], ["east_coast"], ["west_coast"]],
            total_sales: [1001.5, 300.75, 700.75],
            "bay_area|total_sales": [300.75, null, 300.75],
            "la_metro|total_sales": [400, null, 400],
            "new_jersey|total_sales": [200.25, 200.25, null],
            "new_york|total_sales": [100.5, 100.5, null],
        });
        await view.delete();
    });

    test("2-level split emits interleaved subtotal column groups", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            group_by: ["account_number"],
            split_by: ["region_name", "sub_region"],
            aggregates: { total_sales: "sum" },
            split_rollup_mode: "rollup",
        });
        const paths = await view.column_paths();
        expect(paths).toEqual([
            "total_sales",
            "east_coast|total_sales",
            "east_coast|new_jersey|total_sales",
            "east_coast|new_york|total_sales",
            "west_coast|total_sales",
            "west_coast|bay_area|total_sales",
            "west_coast|la_metro|total_sales",
        ]);

        const cols = await view.to_columns();
        expect(cols).toEqual({
            __ROW_PATH__: [[], [1], [2], [3], [4]],
            total_sales: [1001.5, 100.5, 200.25, 300.75, 400],
            "east_coast|total_sales": [300.75, 100.5, 200.25, null, null],
            "east_coast|new_jersey|total_sales": [
                200.25,
                null,
                200.25,
                null,
                null,
            ],
            "east_coast|new_york|total_sales": [100.5, 100.5, null, null, null],
            "west_coast|total_sales": [700.75, null, null, 300.75, 400],
            "west_coast|bay_area|total_sales": [
                300.75,
                null,
                null,
                300.75,
                null,
            ],
            "west_coast|la_metro|total_sales": [400, null, null, null, 400],
        });
        await view.delete();
    });

    test("row sort orders by the un-inflated group total", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            group_by: ["region_name"],
            split_by: ["sub_region"],
            aggregates: { total_sales: "sum" },
            split_rollup_mode: "rollup",
            sort: [["total_sales", "desc"]],
        });

        // west_coast (700.75) before east_coast (300.75) - the sort key
        // must sum split-LEAF source rows only, or the rollup duplicates
        // inflate it non-uniformly.
        const cols = await view.to_columns();
        expect(cols["__ROW_PATH__"]).toEqual([
            [],
            ["west_coast"],
            ["east_coast"],
        ]);
        expect(cols["total_sales"]).toEqual([1001.5, 700.75, 300.75]);
        await view.delete();
    });

    test("group_rollup_mode total interop", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            split_by: ["sub_region"],
            aggregates: { total_sales: "sum" },
            group_rollup_mode: "total",
            split_rollup_mode: "rollup",
        });
        const json = await view.to_json();
        expect(json).toEqual([
            {
                total_sales: 1001.5,
                "bay_area|total_sales": 300.75,
                "la_metro|total_sales": 400,
                "new_jersey|total_sales": 200.25,
                "new_york|total_sales": 100.5,
            },
        ]);
        await view.delete();
    });

    test("column_only emits a grand-total coalesce column", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const view = await table.view({
            columns: ["total_sales"],
            split_by: ["region_name"],
            split_rollup_mode: "rollup",
        });
        const cols = await view.to_columns();
        expect(cols).toEqual({
            total_sales: [100.5, 200.25, 300.75, 400],
            "east_coast|total_sales": [100.5, 200.25, null, null],
            "west_coast|total_sales": [null, null, 300.75, 400],
        });
        await view.delete();
    });

    test("flat mode is unchanged", async function () {
        const table = await getClient().open_table("memory.underscore_test");
        const rollup_view = await table.view({
            columns: ["total_sales"],
            group_by: ["region_name"],
            split_by: ["sub_region"],
            aggregates: { total_sales: "sum" },
            split_rollup_mode: "flat",
        });
        const default_view = await table.view({
            columns: ["total_sales"],
            group_by: ["region_name"],
            split_by: ["sub_region"],
            aggregates: { total_sales: "sum" },
        });
        expect(await rollup_view.to_columns()).toEqual(
            await default_view.to_columns(),
        );
        await rollup_view.delete();
        await default_view.delete();
    });

    test("superstore parity: grand totals equal the unsplit view", async function () {
        const table = await getClient().open_table("memory.superstore");
        const rollup_view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category"],
            aggregates: { Sales: "sum" },
            split_rollup_mode: "rollup",
        });
        const unsplit_view = await table.view({
            columns: ["Sales"],
            group_by: ["Region"],
            aggregates: { Sales: "sum" },
        });

        const rollup_cols = await rollup_view.to_columns();
        const unsplit_cols = await unsplit_view.to_columns();
        expect(rollup_cols["__ROW_PATH__"]).toEqual(
            unsplit_cols["__ROW_PATH__"],
        );
        expect(rollup_cols["Sales"]).toEqual(unsplit_cols["Sales"]);
        await rollup_view.delete();
        await unsplit_view.delete();
    });
});
