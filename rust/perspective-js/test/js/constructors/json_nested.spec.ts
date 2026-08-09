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
import perspective from "../perspective_client";

/**
 * The same logical records in all three JSON shapes. Object flattening must not
 * depend on which one the caller used.
 */
const FORMATS: Record<string, (r: any[]) => { data: any; options: any }> = {
    rows: (records) => ({ data: records, options: {} }),
    columns: (records) => ({
        data: Object.fromEntries(
            [...new Set(records.flatMap((r) => Object.keys(r)))].map((k) => [
                k,
                records.map((r) => (k in r ? r[k] : null)),
            ]),
        ),
        options: {},
    }),
    ndjson: (records) => ({
        data: records.map((r) => JSON.stringify(r)).join("\n"),
        options: { format: "ndjson" },
    }),
};

test.describe("JSON nested columns", function () {
    for (const [name, shape] of Object.entries(FORMATS)) {
        test.describe(name, function () {
            test("flattens an object into dotted columns", async function () {
                const { data, options } = shape([
                    { id: 1, s: { a: 10, b: "x" } },
                    { id: 2, s: { a: 20, b: "y" } },
                ]);

                const table = await perspective.table(data, options);
                expect(await table.schema()).toEqual({
                    id: "integer",
                    "s.a": "integer",
                    "s.b": "string",
                });

                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    id: [1, 2],
                    "s.a": [10, 20],
                    "s.b": ["x", "y"],
                });

                await view.delete();
                await table.delete();
            });

            test("recurses through nested objects", async function () {
                const { data, options } = shape([
                    { s: { b: { c: 1 } } },
                    { s: { b: { c: 2 } } },
                ]);

                const table = await perspective.table(data, options);
                expect(await table.schema()).toEqual({ "s.b.c": "integer" });
                const view = await table.view();
                expect(await view.to_columns()).toEqual({ "s.b.c": [1, 2] });
                await view.delete();
                await table.delete();
            });

            test("ragged objects across records", async function () {
                const { data, options } = shape([
                    { s: { a: 1 } },
                    { s: { b: 2 } },
                ]);

                const table = await perspective.table(data, options);
                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    "s.a": [1, null],
                    "s.b": [null, 2],
                });

                await view.delete();
                await table.delete();
            });

            test("a path seen as both scalar and object", async function () {
                const { data, options } = shape([{ s: 1 }, { s: { a: 2 } }]);
                const table = await perspective.table(data, options);
                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    s: [1, null],
                    "s.a": [null, 2],
                });

                await view.delete();
                await table.delete();
            });

            test("a flat key before a nested one", async function () {
                // The flat fast path fills optimistically and abandons on the
                // first value needing descent, so `a` is written twice --
                // once flat, once at slot 0 of the expansion.
                const { data, options } = shape([
                    { a: 1, s: { b: 2 }, y: [10, 20] },
                    { a: 3, s: { b: 4 }, y: [30] },
                ]);

                const table = await perspective.table(data, options);
                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    a: [1, 1, 3],
                    "s.b": [2, 2, 4],
                    y: [10, 20, 30],
                });

                await view.delete();
                await table.delete();
            });

            test("an empty object contributes no column", async function () {
                const { data, options } = shape([{ id: 1, s: {} }]);
                const table = await perspective.table(data, options);
                expect(await table.schema()).toEqual({ id: "integer" });
                await table.delete();
            });
        });
    }

    for (const [name, shape] of Object.entries(FORMATS)) {
        test.describe(`${name} arrays`, function () {
            test("expands one row per element by default", async function () {
                const { data, options } = shape([
                    { x: 1, y: [10, 20, 30] },
                    { x: 2, y: [40] },
                ]);

                const table = await perspective.table(data, options);
                expect(await table.schema()).toEqual({
                    x: "integer",
                    y: "integer",
                });

                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    x: [1, 1, 1, 2],
                    y: [10, 20, 30, 40],
                });

                await view.delete();
                await table.delete();
            });

            test("an empty array yields one null row", async function () {
                const { data, options } = shape([
                    { x: 1, y: [] },
                    { x: 2, y: [40] },
                ]);

                const table = await perspective.table(data, options);
                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    x: [1, 2],
                    y: [null, 40],
                });

                await view.delete();
                await table.delete();
            });

            test("expands and flattens an array of objects", async function () {
                const { data, options } = shape([
                    { id: 1, orders: [{ price: 1.5 }, { price: 2.5 }] },
                ]);

                const table = await perspective.table(data, options);
                expect(await table.schema()).toEqual({
                    id: "integer",
                    "orders.price": "float",
                });

                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    id: [1, 1],
                    "orders.price": [1.5, 2.5],
                });

                await view.delete();
                await table.delete();
            });

            test("expands an array nested inside an object", async function () {
                const { data, options } = shape([
                    { id: 1, s: { a: [10, 20] } },
                    { id: 2, s: { a: [30] } },
                ]);

                const table = await perspective.table(data, options);
                expect(await table.schema()).toEqual({
                    id: "integer",
                    "s.a": "integer",
                });

                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    id: [1, 1, 2],
                    "s.a": [10, 20, 30],
                });

                await view.delete();
                await table.delete();
            });

            test("zips arrays of equal length", async function () {
                const { data, options } = shape([{ a: [1, 2], b: [3, 4] }]);
                const table = await perspective.table(data, options);
                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    a: [1, 2],
                    b: [3, 4],
                });

                await view.delete();
                await table.delete();
            });

            test("rejects a ragged zip", async function () {
                const { data, options } = shape([{ a: [1, 2], b: [3, 4, 5] }]);
                await expect(perspective.table(data, options)).rejects.toThrow(
                    /Cannot zip/,
                );
            });

            test("recurses through nested arrays", async function () {
                const { data, options } = shape([{ y: [[1, 2], [3]] }]);
                const table = await perspective.table(data, options);
                const view = await table.view();
                expect(await view.to_columns()).toEqual({ y: [1, 2, 3] });
                await view.delete();
                await table.delete();
            });

            test("expands by cartesian product when configured", async function () {
                const { data, options } = shape([{ a: [1, 2], b: [3, 4, 5] }]);
                const table = await perspective.table(data, {
                    ...options,
                    list_flatten: "cartesian",
                });

                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    a: [1, 1, 1, 2, 2, 2],
                    b: [3, 4, 5, 3, 4, 5],
                });

                await view.delete();
                await table.delete();
            });

            test("encodes arrays as JSON when configured", async function () {
                const { data, options } = shape([
                    { x: 1, y: [10, 20] },
                    { x: 2, y: [30] },
                ]);

                const table = await perspective.table(data, {
                    ...options,
                    list_flatten: "stringify",
                });

                expect(await table.schema()).toEqual({
                    x: "integer",
                    y: "string",
                });

                const view = await table.view();
                expect(await view.to_columns()).toEqual({
                    x: [1, 2],
                    y: ["[10,20]", "[30]"],
                });

                await view.delete();
                await table.delete();
            });
        });
    }

    test.describe("expanded index", function () {
        const orders = (ids: number[], prices: number[]) => [
            {
                batch: 1,
                orders: ids.map((id, i) => ({ id, price: prices[i] })),
            },
        ];

        test("indexes on a column drawn from the array", async function () {
            const table = await perspective.table(
                orders([1, 2, 3], [1.5, 2.5, 3.5]) as any,
                { index: "orders.id" },
            );

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                batch: [1, 1, 1],
                "orders.id": [1, 2, 3],
                "orders.price": [1.5, 2.5, 3.5],
            });

            await view.delete();
            await table.delete();
        });

        test("updates a array-derived index by element", async function () {
            const table = await perspective.table(
                orders([1, 2], [1.5, 2.5]) as any,
                { index: "orders.id" },
            );

            await table.update(orders([2, 3], [9.5, 3.5]) as any);
            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                batch: [1, 1, 1],
                "orders.id": [1, 2, 3],
                "orders.price": [1.5, 9.5, 3.5],
            });

            await view.delete();
            await table.delete();
        });

        test("rejects an index on a repeated sibling", async function () {
            await expect(
                perspective.table(orders([1, 2], [1.5, 2.5]) as any, {
                    index: "batch",
                }),
            ).rejects.toThrow(/`batch`/);
        });

        test("rejects any index under a multi-array cartesian", async function () {
            await expect(
                perspective.table([{ id: [1, 2], b: [3, 4, 5] }] as any, {
                    index: "id",
                    list_flatten: "cartesian",
                }),
            ).rejects.toThrow(/`id`/);
        });

        test("stringify keeps a sibling index usable", async function () {
            const table = await perspective.table(
                [
                    { id: 1, y: [10, 20] },
                    { id: 2, y: [30] },
                ] as any,
                { index: "id", list_flatten: "stringify" },
            );

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                id: [1, 2],
                y: ["[10,20]", "[30]"],
            });

            await view.delete();
            await table.delete();
        });
    });

    test("updates against a declared dotted schema", async function () {
        const table = await perspective.table({
            id: "integer",
            "s.a": "integer",
        });

        await table.update([{ id: 1, s: { a: 7 } }] as any);
        const view = await table.view();
        expect(await view.to_columns()).toEqual({ id: [1], "s.a": [7] });
        await view.delete();
        await table.delete();
    });

    test("update ignores a leaf the schema lacks", async function () {
        const table = await perspective.table({
            id: "integer",
            "s.a": "integer",
        });

        await table.update([{ id: 1, s: { a: 7, zzz: 9 } }] as any);
        const view = await table.view();
        expect(await view.to_columns()).toEqual({ id: [1], "s.a": [7] });
        await view.delete();
        await table.delete();
    });

    test("indexes on a flattened column", async function () {
        const table = await perspective.table(
            [
                { s: { id: 1 }, v: "a" },
                { s: { id: 2 }, v: "b" },
            ] as any,
            { index: "s.id" },
        );

        await table.update([{ s: { id: 2 }, v: "z" }] as any);
        const view = await table.view();
        expect(await view.to_columns()).toEqual({
            "s.id": [1, 2],
            v: ["a", "z"],
        });

        await view.delete();
        await table.delete();
    });

    test("rejects a key colliding with a flattened path", async function () {
        await expect(
            perspective.table([{ s: { a: 1 }, "s.a": 2 }] as any),
        ).rejects.toThrow(/both a key and the flattened path/);
    });

    test("ndjson grows into an object column from a later record", async function () {
        const table = await perspective.table(`{"a":1}\n{"a":2,"s":{"b":3}}`, {
            format: "ndjson",
        });

        const view = await table.view();
        expect(await view.to_columns()).toEqual({
            a: [1, 2],
            "s.b": [null, 3],
        });

        await view.delete();
        await table.delete();
    });
});
