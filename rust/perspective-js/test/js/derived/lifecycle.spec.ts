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
import {
    expect_rejects,
    expect_flat_parity,
    expect_tree_parity,
} from "./oracle.ts";
import { make_source, SCHEMA, rows } from "./fixtures.ts";

const PARENTS: Record<string, any> = {
    flat: { filter: [["y", ">", 2]] },
    group_by: { group_by: ["g", "h"], columns: ["x", "y"] },
    split_by: { group_by: ["g"], split_by: ["s"], columns: ["x"] },
};

async function expect_parity(
    source: any,
    view: any,
    config: any,
    derived: any,
) {
    if (config.group_by || config.split_by) {
        await expect_tree_parity(source, config, derived, view);
    } else {
        await expect_flat_parity(view, derived);
    }
}

test.describe("Derived table lifecycle", function () {
    for (const [name, config] of Object.entries(PARENTS)) {
        test(`${name}: parent clear then update`, async function () {
            const source = await make_source();
            const view = await source.view(config);
            const derived = await perspective.table(view);
            await source.clear();
            await expect_parity(source, view, config, derived);
            await source.update(rows(8, 3));
            await expect_parity(source, view, config, derived);
            await source.update([{ id: 4, x: 99, y: 9 }]);
            await expect_parity(source, view, config, derived);
            await derived.delete();
            await view.delete();
            await source.delete();
        });

        test(`${name}: parent clear with no further data`, async function () {
            const source = await make_source();
            const view = await source.view(config);
            const derived = await perspective.table(view);
            const child = await derived.view();
            await source.clear();
            await expect_parity(source, view, config, derived);
            await child.delete();
            await derived.delete();
            await view.delete();
            await source.delete();
        });

        test(`${name}: parent replace`, async function () {
            const source = await make_source();
            const view = await source.view(config);
            const derived = await perspective.table(view);
            await source.replace(rows(5, 50));
            await expect_parity(source, view, config, derived);
            await source.update([{ id: 51, x: 3, y: 10 }]);
            await expect_parity(source, view, config, derived);
            await derived.delete();
            await view.delete();
            await source.delete();
        });

        test(`${name}: first update into an empty table`, async function () {
            const source = await perspective.table(SCHEMA, { index: "id" });
            const view = await source.view(config);
            const derived = await perspective.table(view);
            expect(await derived.size()).toBeLessThanOrEqual(1);
            await source.update(rows(12));
            await expect_parity(source, view, config, derived);
            await source.update(rows(12, 6));
            await expect_parity(source, view, config, derived);
            await derived.delete();
            await view.delete();
            await source.delete();
        });

        test(`${name}: deleting a view with a dependent table is rejected`, async function () {
            const source = await make_source();
            const view = await source.view(config);
            const derived = await perspective.table(view);
            await expect_rejects(view.delete());
            await derived.delete();
        });

        test(`${name}: two derived tables on one view`, async function () {
            const source = await make_source();
            const view = await source.view(config);
            const a = await perspective.table(view);
            const b = await perspective.table(view);
            await source.update(rows(6, 20));
            await expect_parity(source, view, config, a);
            await expect_parity(source, view, config, b);
            await a.delete();
            await source.update([{ id: 1, x: 5 }]);
            await expect_parity(source, view, config, b);
            await b.delete();
            await view.delete();
            await source.delete();
        });
    }
});
