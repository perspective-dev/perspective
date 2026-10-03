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
import { expect_rejects, expect_flat_parity } from "./oracle.ts";
import { make_source, SCHEMA } from "./fixtures.ts";

test.describe("Derived table shape from a flat view", function () {
    test("schema is the view's columns in order", async function () {
        const source = await make_source();
        const view = await source.view({
            columns: ["x", "double", "g"],
            expressions: { double: '"x" * 2' },
        });

        const derived = await perspective.table(view);
        expect(await derived.columns()).toEqual(["x", "double", "g"]);
        expect(await derived.schema()).toEqual({
            x: "float",
            double: "float",
            g: "string",
        });

        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("inherits the index when its column is in the view", async function () {
        const source = await make_source();
        const view = await source.view();
        const derived = await perspective.table(view);
        expect(await derived.get_index()).toEqual("id");
        expect(await derived.size()).toEqual(24);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("has no index when its column is not in the view", async function () {
        const source = await make_source();
        const view = await source.view({ columns: ["x", "g"] });
        const derived = await perspective.table(view);
        expect(await derived.get_index()).toBeUndefined();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("inherits the limit", async function () {
        const source = await perspective.table(SCHEMA, { limit: 5 });
        const view = await source.view();
        const derived = await perspective.table(view);
        expect(await derived.get_limit()).toEqual(5);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("rejects index and limit options", async function () {
        const source = await make_source();
        const view = await source.view();
        await expect_rejects(perspective.table(view, { index: "x" }));
        await expect_rejects(perspective.table(view, { limit: 10 }));
        await view.delete();
        await source.delete();
    });
});
