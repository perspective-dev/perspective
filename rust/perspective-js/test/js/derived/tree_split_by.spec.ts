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
import perspective from "../perspective_client.ts";
import { expect_tree_parity, key_name } from "./oracle.ts";
import { make_source, rows, ROLLUPS, SPLIT_ROLLUPS } from "./fixtures.ts";

const CONFIG = {
    group_by: ["g"],
    split_by: ["s"],
    columns: ["x", "y"],
    aggregates: { x: "sum", y: "mean" },
};

test.describe("Derived table from a split_by view", function () {
    test("columns are the view's column paths", async function () {
        const source = await make_source();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        const paths = await view.column_paths();
        expect(await derived.columns()).toEqual([
            key_name("g", 0),
            ...paths.filter((p: string) => p !== "__ROW_PATH__"),
        ]);

        await derived.delete();
        await view.delete();
        await source.delete();
    });

    for (const group_rollup_mode of ROLLUPS) {
        for (const split_rollup_mode of SPLIT_ROLLUPS) {
            test(`parity with ${group_rollup_mode} rows and ${split_rollup_mode} columns`, async function () {
                const source = await make_source();
                const config = {
                    ...CONFIG,
                    group_by: ["g", "h"],
                    group_rollup_mode,
                    split_rollup_mode,
                };

                const view = await source.view(config);
                const derived = await perspective.table(view);
                await expect_tree_parity(source, config, derived, view);
                await source.update(rows(9, 20));
                await expect_tree_parity(source, config, derived, view);
                await source.remove([0, 1, 2, 3, 4, 5]);
                await expect_tree_parity(source, config, derived, view);
                await derived.delete();
                await view.delete();
                await source.delete();
            });
        }
    }

    test("a sparse cell is null", async function () {
        const source = await perspective.table(
            [
                { id: 1, g: "a", s: "Mon", x: 1 },
                { id: 2, g: "a", s: "Tue", x: 2 },
                { id: 3, g: "b", s: "Mon", x: 3 },
            ],
            { index: "id" },
        );

        const config = {
            group_by: ["g"],
            split_by: ["s"],
            columns: ["x"],
            group_rollup_mode: "flat",
        };

        const view = await source.view(config);
        const derived = await perspective.table(view);
        const child = await derived.view();
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "a", "Mon|x": 1, "Tue|x": 2 },
            { "g (Group by 1)": "b", "Mon|x": 3, "Tue|x": null },
        ]);

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a dropped cell becomes null while its row survives", async function () {
        const source = await perspective.table(
            [
                { id: 1, g: "a", s: "Mon", x: 1 },
                { id: 2, g: "a", s: "Tue", x: 2 },
                { id: 3, g: "b", s: "Tue", x: 3 },
            ],
            { index: "id" },
        );

        const config = {
            group_by: ["g"],
            split_by: ["s"],
            columns: ["x"],
            group_rollup_mode: "flat",
        };

        const view = await source.view(config);
        const derived = await perspective.table(view);
        await source.remove([2]);
        const child = await derived.view();
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "a", "Mon|x": 1, "Tue|x": null },
            { "g (Group by 1)": "b", "Mon|x": null, "Tue|x": 3 },
        ]);

        await source.remove([1]);
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "b", "Mon|x": null, "Tue|x": 3 },
        ]);

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a column-only parent has one row per source row", async function () {
        const source = await make_source();
        const config = { split_by: ["s"], columns: ["x"] };
        const view = await source.view(config);
        const derived = await perspective.table(view);
        expect(await derived.size()).toEqual(24);
        await expect_tree_parity(source, config, derived, view);
        await source.update(rows(5, 30));
        await expect_tree_parity(source, config, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("multi-level split_by", async function () {
        const source = await make_source();
        const config = {
            group_by: ["g"],
            split_by: ["s", "h"],
            columns: ["x"],
            split_rollup_mode: "rollup",
        };

        const view = await source.view(config);
        const derived = await perspective.table(view);
        await expect_tree_parity(source, config, derived, view);
        await source.update(rows(9, 20));
        await expect_tree_parity(source, config, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a hidden sort aggregate is not exposed", async function () {
        const source = await make_source();
        const config = { ...CONFIG, columns: ["x"], sort: [["y", "desc"]] };
        const view = await source.view(config);
        const derived = await perspective.table(view);
        const names = await derived.columns();
        expect(names.some((n: string) => n.endsWith("|y"))).toBe(false);
        await expect_tree_parity(source, config, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
