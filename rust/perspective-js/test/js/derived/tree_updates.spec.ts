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
import { make_source, rows } from "./fixtures.ts";

const CONFIG = {
    group_by: ["g", "h"],
    columns: ["x", "y"],
    aggregates: { x: "sum", y: "mean" },
};

test.describe("Derived table updates from a group_by view", function () {
    test("repeated updates to the same groups do not append", async function () {
        const source = await make_source();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        const size = await derived.size();
        for (let i = 0; i < 20; i++) {
            await source.update([{ id: i % 6, x: i * 3.5 }]);
            expect(await derived.size()).toEqual(size);
        }

        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a new group adds rows", async function () {
        const source = await make_source();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        const size = await derived.size();
        await source.update([{ id: 100, g: "z", h: "p", x: 1, y: 2 }]);
        expect(await derived.size()).toEqual(size + 2);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("partial updates", async function () {
        const source = await make_source();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.update([{ id: 3, y: 99 }]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await source.update([{ id: 3, x: null }]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("null group keys", async function () {
        const source = await make_source();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.update([
            { id: 200, g: null, h: "p", x: 5, y: 1 },
            { id: 201, g: "a", h: null, x: 6, y: 2 },
        ]);

        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a row moving between groups", async function () {
        const source = await make_source();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.update([{ id: 0, g: "c", h: "q" }]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("updates through a port", async function () {
        const source = await make_source();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        const port = await source.make_port();
        await source.update(rows(4, 40), { port_id: port });
        await source.update([{ id: 1, x: 1000 }]);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a filtered parent", async function () {
        const source = await make_source();
        const config = { ...CONFIG, filter: [["y", ">", 4]] };
        const view = await source.view(config);
        const derived = await perspective.table(view);
        await expect_tree_parity(source, config, derived, view);
        await source.update([
            { id: 0, y: 10 },
            { id: 1, y: 0 },
        ]);

        await expect_tree_parity(source, config, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a parent grouped by an expression", async function () {
        const source = await make_source();
        const config = {
            group_by: ["bucket"],
            columns: ["x"],
            expressions: { bucket: 'bucket("y", 5)' },
        };

        const view = await source.view(config);
        const derived = await perspective.table(view);
        await expect_tree_parity(source, config, derived, view);
        await source.update(rows(10, 30));
        await expect_tree_parity(source, config, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
