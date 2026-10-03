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

const GROUPS = 200_000;

async function make_wide() {
    const table = await perspective.table({
        id: "integer",
        a: "float",
        b: "float",
        c: "float",
        d: "float",
        e: "float",
        f: "float",
    });

    const size = GROUPS;
    const column = () => Array.from({ length: size }, (_, i) => i * 1.5);
    await table.update({
        id: Array.from({ length: size }, (_, i) => i),
        a: column(),
        b: column(),
        c: column(),
        d: column(),
        e: column(),
        f: column(),
    });

    return table;
}

async function used() {
    return Number((await perspective.system_info()).used_size);
}

const EXTRA = ["b", "c", "d", "e", "f"];
const EXTRA_BYTES = GROUPS * EXTRA.length * 8;

async function growth(view: any, schema: Record<string, string>) {
    const before = await used();
    const derived = await perspective.table(view, { schema });
    const after = await used();
    expect(await derived.size()).toEqual(GROUPS);
    await derived.delete();
    return after - before;
}

function floats(names: string[]) {
    return Object.fromEntries(names.map((n) => [n, "float"]));
}

test.describe("Derived table memory", function () {
    test("a group_by promotion does not copy its aggregates", async function () {
        const source = await make_wide();
        const view = await source.view({
            group_by: ["id"],
            columns: ["a", ...EXTRA],
            group_rollup_mode: "flat",
        });

        await growth(view, floats(["a"]));
        const narrow = await growth(view, floats(["a"]));
        const wide = await growth(view, floats(["a", ...EXTRA]));
        expect(wide - narrow).toBeLessThan(EXTRA_BYTES * 0.25);
        await view.delete();
        await source.delete();
    });

    test("a flat promotion does not copy its columns", async function () {
        const source = await make_wide();
        const view = await source.view({
            columns: ["a", ...EXTRA],
            filter: [["id", ">=", 0]],
        });

        await growth(view, floats(["a"]));
        const narrow = await growth(view, floats(["a"]));
        const wide = await growth(view, floats(["a", ...EXTRA]));
        expect(wide - narrow).toBeLessThan(EXTRA_BYTES * 0.25);
        await view.delete();
        await source.delete();
    });

    test("creating and deleting derived tables does not leak", async function () {
        const source = await perspective.table(
            Array.from({ length: 500 }, (_, i) => ({ id: i, g: i % 7, x: i })),
        );

        const view = await source.view({ group_by: ["g"], columns: ["x"] });
        const cycle = async () => {
            const derived = await perspective.table(view);
            const child = await derived.view();
            await child.to_columns();
            await child.delete();
            await derived.delete();
        };

        await cycle();
        await cycle();
        const before = await used();
        for (let i = 0; i < 200; i++) {
            await cycle();
        }

        const after = await used();
        expect(after / before).toBeLessThan(1.2);
        await view.delete();
        await source.delete();
    });
});
