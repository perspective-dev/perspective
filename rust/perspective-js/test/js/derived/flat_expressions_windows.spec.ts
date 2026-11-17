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
import { make_source, rows } from "./fixtures.ts";

test.describe("Derived table carries expression and window columns", function () {
    test("expression columns update", async function () {
        const source = await make_source();
        const view = await source.view({
            columns: ["id", "x", "double", "label"],
            expressions: {
                double: '"x" * 2',
                label: 'concat("g", \'-\', "h")',
            },
        });

        const derived = await perspective.table(view);
        await expect_flat_parity(view, derived);
        await source.update([
            { id: 0, x: 42, g: "zz" },
            { id: 99, x: 1, g: "a", h: "p" },
        ]);

        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a vlookup column keeps child expression views live", async function () {
        const source = await perspective.table(
            { k: "integer", v: "integer", on: "boolean" },
            { index: "k" },
        );

        await source.update({
            k: [0, 1, 2],
            v: [10, 20, 30],
            on: [false, false, false],
        });

        const view = await source.view({
            columns: ["k", "v", "on", "next"],
            expressions: { next: `vlookup('v', integer("k" + 1))` },
        });

        const derived = await perspective.table(view);
        const child = await derived.view({
            columns: ["k", "lit"],
            expressions: { lit: 'if ("on") { 1 } else { 0 }' },
        });

        await source.update([{ k: 1, on: true }]);
        expect(await child.to_columns()).toEqual({
            k: [0, 1, 2],
            lit: [0, 1, 0],
        });

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("window columns update, including rows outside the batch", async function () {
        const source = await make_source();
        const view = await source.view({
            columns: ["id", "g", "x", "running"],
            windows: {
                running: {
                    column: "x",
                    aggregate: "sum",
                    partition_by: ["g"],
                    order_by: ["id", "asc"],
                },
            },
        });

        const derived = await perspective.table(view);
        await expect_flat_parity(view, derived);
        await source.update([{ id: 0, x: 1000 }]);
        await expect_flat_parity(view, derived);
        await source.update(rows(6, 24));
        await source.remove([3]);
        await expect_flat_parity(view, derived);
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
