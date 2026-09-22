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
import { expect_flat_parity, expect_tree_parity } from "./oracle.ts";
import { make_source, rows } from "./fixtures.ts";

const TREE = {
    group_by: ["g", "h"],
    columns: ["x", "y"],
    aggregates: { x: "sum", y: "sum" },
    group_rollup_mode: "flat",
};

test.describe("Chained derived tables", function () {
    test("tree then tree", async function () {
        const source = await make_source();
        const v1 = await source.view(TREE);
        const d1 = await perspective.table(v1);
        const config2 = {
            group_by: ["g (Group by 1)"],
            columns: ["x"],
            aggregates: { x: "sum" },
        };

        const v2 = await d1.view(config2);
        const d2 = await perspective.table(v2);
        await source.update(rows(9, 20));
        await source.remove([0, 1]);
        await expect_tree_parity(d1, config2, d2);
        const direct = await source.view({
            group_by: ["g"],
            columns: ["x"],
            aggregates: { x: "sum" },
            group_rollup_mode: "flat",
        });

        const c2 = await d2.view({
            filter: [["g (Group by 1) (Group by 1)", "is not null"]],
            columns: ["x"],
        });

        expect((await c2.to_columns()).x.sort()).toEqual(
            (await direct.to_columns()).x.sort(),
        );

        await c2.delete();
        await direct.delete();
        await d2.delete();
        await v2.delete();
        await d1.delete();
        await v1.delete();
        await source.delete();
    });

    test("tree then flat", async function () {
        const source = await make_source();
        const v1 = await source.view(TREE);
        const d1 = await perspective.table(v1);
        const v2 = await d1.view({ filter: [["x", ">", 50]] });
        const d2 = await perspective.table(v2);
        await source.update(rows(9, 20));
        await source.update([{ id: 0, x: -500 }]);
        await expect_flat_parity(v2, d2);
        await d2.delete();
        await v2.delete();
        await d1.delete();
        await v1.delete();
        await source.delete();
    });

    test("flat then tree", async function () {
        const source = await make_source();
        const v1 = await source.view({ filter: [["y", ">", 3]] });
        const d1 = await perspective.table(v1);
        const v2 = await d1.view(TREE);
        const d2 = await perspective.table(v2);
        await source.update(rows(9, 20));
        await source.update([{ id: 0, y: 10 }]);
        await expect_tree_parity(d1, TREE, d2);
        await expect_tree_parity(
            source,
            { ...TREE, filter: [["y", ">", 3]] },
            d2,
        );
        await d2.delete();
        await v2.delete();
        await d1.delete();
        await v1.delete();
        await source.delete();
    });

    test("flat then flat", async function () {
        const source = await make_source();
        const v1 = await source.view({ filter: [["y", ">", 3]] });
        const d1 = await perspective.table(v1);
        const v2 = await d1.view({ filter: [["x", ">", 10]] });
        const d2 = await perspective.table(v2);
        await source.update(rows(9, 20));
        await source.update([{ id: 0, y: 10, x: 100 }]);
        await expect_flat_parity(v2, d2);
        const direct = await source.view({
            filter: [
                ["y", ">", 3],
                ["x", ">", 10],
            ],
        });

        await expect_flat_parity(direct, d2);
        await direct.delete();
        await d2.delete();
        await v2.delete();
        await d1.delete();
        await v1.delete();
        await source.delete();
    });

    test("a join over a derived table updates with its source", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g"],
            columns: ["x"],
            aggregates: { x: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await perspective.table(view);
        const names = await perspective.table(
            [
                { "g (Group by 1)": "a", label: "Alpha" },
                { "g (Group by 1)": "b", label: "Beta" },
                { "g (Group by 1)": "c", label: "Gamma" },
            ],
            { index: "g (Group by 1)" },
        );

        const joined = await perspective.join(derived, names, "g (Group by 1)");

        const jv = await joined.view();
        const dv = await derived.view();
        await source.update([{ id: 0, x: 12345 }]);
        const want = (await dv.to_json()).map((r: any) => r.x).sort();
        await expect
            .poll(async () => (await jv.to_json()).map((r: any) => r.x).sort())
            .toEqual(want);

        await dv.delete();
        await jv.delete();
        await joined.delete();
        await names.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
