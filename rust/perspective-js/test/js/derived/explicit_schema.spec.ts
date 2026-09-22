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
import { expect_rejects } from "./oracle.ts";
import { make_source } from "./fixtures.ts";

const CONFIG = {
    group_by: ["g"],
    split_by: ["s"],
    columns: ["x"],
    group_rollup_mode: "flat",
};

const SCHEMA = {
    "g (Group by 1)": "string",
    "Mon|x": "integer",
    "Tue|x": "integer",
    "Wed|x": "integer",
};

async function make() {
    return await perspective.table(
        [
            { id: 1, g: "a", s: "Mon", x: 1 },
            { id: 2, g: "a", s: "Tue", x: 2 },
        ],
        { index: "id" },
    );
}

test.describe("Derived table with an explicit schema", function () {
    test("a declared column fills in when its split value arrives", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view, { schema: SCHEMA });
        expect(await derived.schema()).toEqual(SCHEMA);
        const child = await derived.view();
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "a", "Mon|x": 1, "Tue|x": 2, "Wed|x": null },
        ]);

        await source.update([{ id: 3, g: "a", s: "Wed", x: 3 }]);
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "a", "Mon|x": 1, "Tue|x": 2, "Wed|x": 3 },
        ]);

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("an undeclared view column is dropped", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view, {
            schema: { "g (Group by 1)": "string", "Tue|x": "integer" },
        });

        const child = await derived.view();
        expect(await child.to_json()).toEqual([
            { "g (Group by 1)": "a", "Tue|x": 2 },
        ]);

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("key columns may be omitted", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        const derived = await perspective.table(view, {
            schema: { "Mon|x": "integer" },
        });

        const child = await derived.view();
        expect(await child.to_json()).toEqual([{ "Mon|x": 1 }]);
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a dtype mismatch is rejected", async function () {
        const source = await make();
        const view = await source.view(CONFIG);
        await expect_rejects(
            perspective.table(view, { schema: { "Mon|x": "string" } }),
        );

        await view.delete();
        await source.delete();
    });

    test("schema without a view source is rejected", async function () {
        await expect_rejects(
            perspective.table([{ x: 1 }], { schema: { x: "integer" } }),
        );
    });

    test("inferred and explicit schemas are equivalent", async function () {
        const source = await make_source();
        const config = { group_by: ["g"], columns: ["x", "y"] };
        const view = await source.view(config);
        const inferred = await perspective.table(view);
        const explicit = await perspective.table(view, {
            schema: await inferred.schema(),
        });

        const a = await inferred.view();
        const b = await explicit.view();
        expect(await b.to_json()).toEqual(await a.to_json());
        await source.update([{ id: 0, x: 500 }]);
        expect(await b.to_json()).toEqual(await a.to_json());
        await a.delete();
        await b.delete();
        await explicit.delete();
        await inferred.delete();
        await view.delete();
        await source.delete();
    });

    test("a flat parent", async function () {
        const source = await make_source();
        const view = await source.view({ columns: ["id", "x", "g"] });
        const derived = await perspective.table(view, {
            schema: { id: "integer", x: "float", missing: "string" },
        });

        const child = await derived.view({ columns: ["id", "x"] });
        const parent = await source.view({ columns: ["id", "x"] });
        expect(await child.to_json()).toEqual(await parent.to_json());
        await source.update([{ id: 2, x: 77 }]);
        expect(await child.to_json()).toEqual(await parent.to_json());
        await parent.delete();
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
