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
import { expect_flat_parity } from "./oracle.ts";
import { make_source, SCHEMA, rows } from "./fixtures.ts";

test.describe("Derived table updates from a flat view", function () {
    test("a view omitting the index column updates in place", async function () {
        const source = await make_source();
        const view = await source.view({ columns: ["x", "g"] });
        const derived = await perspective.table(view);
        for (let i = 0; i < 10; i++) {
            await source.update([{ id: 3, x: i }]);
        }

        expect(await derived.size()).toEqual(24);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("an unindexed source appends", async function () {
        const source = await perspective.table(SCHEMA);
        const view = await source.view();
        const derived = await perspective.table(view);
        await source.update(rows(5));
        await source.update(rows(5));
        expect(await derived.size()).toEqual(10);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("partial updates and nulls", async function () {
        const source = await make_source();
        const view = await source.view();
        const derived = await perspective.table(view);
        await source.update([{ id: 1, x: null }]);
        await source.update([{ id: 2, g: "new" }]);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("removes mirror", async function () {
        const source = await make_source();
        const view = await source.view();
        const derived = await perspective.table(view);
        await source.remove([1, 2, 3]);
        expect(await derived.size()).toEqual(21);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
