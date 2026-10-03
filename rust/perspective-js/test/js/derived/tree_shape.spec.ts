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
import { expect_rejects, expect_tree_parity } from "./oracle.ts";
import { make_source, ROLLUPS } from "./fixtures.ts";

test.describe("Derived table shape from a group_by view", function () {
    test("schema is keys plus aggregates", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g", "h"],
            columns: ["x", "y"],
            aggregates: { x: "sum", y: "mean" },
        });

        const derived = await perspective.table(view);
        expect(await derived.schema()).toEqual({
            g: "string",
            h: "string",
            x: "float",
            y: "float",
        });

        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("an aggregate of a key is qualified by its aggregate", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g"],
            columns: ["g", "x"],
            aggregates: { g: "count", x: "sum" },
        });

        const derived = await perspective.table(view);
        expect(await derived.schema()).toEqual({
            g: "string",
            "g (count)": "integer",
            x: "float",
        });

        const child = await derived.view({ columns: ["g", "g (count)"] });
        expect(await child.schema()).toEqual({
            g: "string",
            "g (count)": "integer",
        });

        expect(await child.num_rows()).toEqual(await view.num_rows());
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("has no index", async function () {
        const source = await make_source();
        const view = await source.view({ group_by: ["g"], columns: ["x"] });
        const derived = await perspective.table(view);
        expect(await derived.get_index()).toBeUndefined();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("rejects index and limit options", async function () {
        const source = await make_source();
        const view = await source.view({ group_by: ["g"], columns: ["x"] });
        await expect_rejects(perspective.table(view, { index: "x" }));
        await expect_rejects(perspective.table(view, { limit: 10 }));
        await view.delete();
        await source.delete();
    });

    for (const group_rollup_mode of ROLLUPS) {
        test(`mirrors group_rollup_mode ${group_rollup_mode}`, async function () {
            const source = await make_source();
            const config = {
                group_by: ["g", "h"],
                columns: ["x", "y"],
                aggregates: { x: "sum", y: "mean" },
                group_rollup_mode,
            };

            const view = await source.view(config);
            const derived = await perspective.table(view);
            const expected = { rollup: 10, flat: 6, total: 1 }[
                group_rollup_mode
            ];

            expect(await derived.size()).toEqual(expected);
            await expect_tree_parity(source, config, derived);
            await derived.delete();
            await view.delete();
            await source.delete();
        });
    }

    test("rollup rows have null keys beyond their depth", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g", "h"],
            columns: ["x"],
        });

        const derived = await perspective.table(view);
        const child = await derived.view();
        const json = await child.to_json();
        const totals = json.filter((r) => r.g === null);
        const mids = json.filter((r) => r.g !== null && r.h === null);

        expect(totals).toHaveLength(1);
        expect(mids).toHaveLength(3);
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
