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

const CONFIG = {
    group_by: ["g"],
    split_by: ["s"],
    columns: ["x"],
    group_rollup_mode: "flat",
};

async function make() {
    return await perspective.table(
        [
            { id: 1, g: "a", s: "Mon", x: 1 },
            { id: 2, g: "a", s: "Tue", x: 2 },
            { id: 3, g: "b", s: "Mon", x: 3 },
        ],
        { index: "id" },
    );
}

test.describe("Derived table schema is frozen", function () {
    test("a new split value is dropped", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        const schema = await derived.schema();
        await source.update([
            { id: 4, g: "a", s: "Wed", x: 10 },
            { id: 5, g: "b", s: "Tue", x: 20 },
        ]);

        expect(await derived.schema()).toEqual(schema);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a row that exists only under a new split value still appears", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        await source.update([{ id: 6, g: "c", s: "Wed", x: 10 }]);
        const child = await derived.view();
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "a", "Mon|x": 1, "Tue|x": 2 },
            { "g (Group by 1)": "b", "Mon|x": 3, "Tue|x": null },
            { "g (Group by 1)": "c", "Mon|x": null, "Tue|x": null },
        ]);

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a vanished split value leaves a null column", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        const schema = await derived.schema();
        await source.remove([2]);
        expect(await derived.schema()).toEqual(schema);
        const child = await derived.view();
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "a", "Mon|x": 1, "Tue|x": null },
            { "g (Group by 1)": "b", "Mon|x": 3, "Tue|x": null },
        ]);

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("the schema survives a parent clear", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view);
        const schema = await derived.schema();
        await source.clear();
        await source.update([
            { id: 1, g: "a", s: "Tue", x: 5 },
            { id: 2, g: "a", s: "Wed", x: 6 },
        ]);

        expect(await derived.schema()).toEqual(schema);
        await expect_tree_parity(source, CONFIG, derived, view);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
