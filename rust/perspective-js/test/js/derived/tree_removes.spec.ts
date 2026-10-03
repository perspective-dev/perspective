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
import { expect_tree_parity } from "./oracle.ts";
import { make_source } from "./fixtures.ts";

const CONFIG = {
    group_by: ["g"],
    columns: ["x", "y"],
    aggregates: { x: "sum", y: "last" },
};

test.describe("Derived table removes from a group_by view", function () {
    test("emptying a group removes its row", async function () {
        const source = await make_source(6);
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        expect(await derived.size()).toEqual(4);
        await source.remove([0, 3]);
        expect(await derived.size()).toEqual(3);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a freed slot is reused by a different group", async function () {
        const source = await make_source(6);
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.remove([0, 3]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await source.update([{ id: 50, g: "zz", x: 7, y: 8 }]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("dropping and re-adding the same key", async function () {
        const source = await make_source(6);
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.remove([0, 3]);
        await source.update([{ id: 60, g: "a", x: 1, y: 1 }]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("removing and adding a group in one update", async function () {
        const source = await make_source(6);
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.update([
            { id: 0, g: "n" },
            { id: 3, g: "n" },
        ]);

        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("removing every row", async function () {
        const source = await make_source(6);
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.remove([0, 1, 2, 3, 4, 5]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await source.update([{ id: 1, g: "a", x: 1, y: 1 }]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
