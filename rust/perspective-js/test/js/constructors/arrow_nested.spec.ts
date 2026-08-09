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

import * as arrow from "apache-arrow";
import { test, expect } from "@perspective-dev/test";
import perspective from "../perspective_client";

const field = (name: string, type: arrow.DataType) =>
    arrow.Field.new({ name, type });

const int32 = () => new arrow.Int32();
const float64 = () => new arrow.Float64();
const utf8 = () => new arrow.Utf8();

const list = (type: arrow.DataType) => new arrow.List(field("item", type));

const struct = (fields: [string, arrow.DataType][]) =>
    new arrow.Struct(fields.map(([n, t]) => field(n, t)));

const ipc = (columns: Record<string, arrow.Vector>) =>
    arrow.tableToIPC(arrow.tableFromArrays(columns as any));

test.describe("Arrow nested columns", function () {
    test.describe("Struct", function () {
        test("Flattens a struct into dotted columns", async function () {
            const table = await perspective.table(
                ipc({
                    id: arrow.vectorFromArray([1, 2], int32()),
                    s: arrow.vectorFromArray(
                        [
                            { a: 10, b: 1.5 },
                            { a: 20, b: 2.5 },
                        ],
                        struct([
                            ["a", int32()],
                            ["b", float64()],
                        ]),
                    ),
                }),
            );

            expect(await table.schema()).toEqual({
                id: "integer",
                "s.a": "integer",
                "s.b": "float",
            });

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                id: [1, 2],
                "s.a": [10, 20],
                "s.b": [1.5, 2.5],
            });

            await view.delete();
            await table.delete();
        });

        test("Recurses through a struct of struct", async function () {
            const table = await perspective.table(
                ipc({
                    s: arrow.vectorFromArray(
                        [{ b: { c: 1 } }, { b: { c: 2 } }],
                        struct([["b", struct([["c", int32()]])]]),
                    ),
                }),
            );

            expect(await table.schema()).toEqual({ "s.b.c": "integer" });
            const view = await table.view();
            expect(await view.to_columns()).toEqual({ "s.b.c": [1, 2] });
            await view.delete();
            await table.delete();
        });

        test("A null parent nulls every descendant leaf", async function () {
            const table = await perspective.table(
                ipc({
                    s: arrow.vectorFromArray(
                        [{ a: 1, b: 2 }, null, { a: 3, b: 4 }],
                        struct([
                            ["a", int32()],
                            ["b", int32()],
                        ]),
                    ),
                }),
            );

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                "s.a": [1, null, 3],
                "s.b": [2, null, 4],
            });

            await view.delete();
            await table.delete();
        });

        test("Updates match a declared dotted schema", async function () {
            const table = await perspective.table({
                id: "integer",
                "s.a": "integer",
            });

            await table.update(
                ipc({
                    id: arrow.vectorFromArray([1], int32()),
                    s: arrow.vectorFromArray(
                        [{ a: 7 }],
                        struct([["a", int32()]]),
                    ),
                }),
            );

            const view = await table.view();
            expect(await view.to_columns()).toEqual({ id: [1], "s.a": [7] });
            await view.delete();
            await table.delete();
        });
    });

    test.describe("List", function () {
        test("Expands one row per element by default", async function () {
            const table = await perspective.table(
                ipc({
                    x: arrow.vectorFromArray([1, 2], int32()),
                    y: arrow.vectorFromArray(
                        [[10, 20, 30], [40]],
                        list(int32()),
                    ),
                }),
            );

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

        test("An empty list yields one null row", async function () {
            const table = await perspective.table(
                ipc({
                    x: arrow.vectorFromArray([1, 2], int32()),
                    y: arrow.vectorFromArray([[], [40]], list(int32())),
                }),
            );

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                x: [1, 2],
                y: [null, 40],
            });

            await view.delete();
            await table.delete();
        });

        test("Expands and flattens a list of struct", async function () {
            const table = await perspective.table(
                ipc({
                    id: arrow.vectorFromArray([1], int32()),
                    orders: arrow.vectorFromArray(
                        [[{ price: 1.5 }, { price: 2.5 }]],
                        list(struct([["price", float64()]])),
                    ),
                }),
            );

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

        test("Expands a list nested inside a struct", async function () {
            const table = await perspective.table(
                ipc({
                    id: arrow.vectorFromArray([1, 2], int32()),
                    s: arrow.vectorFromArray(
                        [{ a: [10, 20] }, { a: [30] }],
                        struct([["a", list(int32())]]),
                    ),
                }),
            );

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

        test("Gathers string siblings across an expansion", async function () {
            const table = await perspective.table(
                ipc({
                    s: arrow.vectorFromArray(["a", "b"], utf8()),
                    y: arrow.vectorFromArray([[1, 2, 3], [4]], list(int32())),
                }),
            );

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                s: ["a", "a", "a", "b"],
                y: [1, 2, 3, 4],
            });

            await view.delete();
            await table.delete();
        });

        test("Expands by cartesian product when configured", async function () {
            const table = await perspective.table(
                ipc({
                    a: arrow.vectorFromArray([[1, 2]], list(int32())),
                    b: arrow.vectorFromArray([[3, 4, 5]], list(int32())),
                }),
                { list_flatten: "cartesian" },
            );

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                a: [1, 1, 1, 2, 2, 2],
                b: [3, 4, 5, 3, 4, 5],
            });

            await view.delete();
            await table.delete();
        });

        test("Encodes lists as JSON when configured", async function () {
            const table = await perspective.table(
                ipc({
                    x: arrow.vectorFromArray([1, 2], int32()),
                    y: arrow.vectorFromArray([[10, 20], [30]], list(int32())),
                }),
                { list_flatten: "stringify" },
            );

            expect(await table.schema()).toEqual({ x: "integer", y: "string" });
            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                x: [1, 2],
                y: ["[10,20]", "[30]"],
            });

            await view.delete();
            await table.delete();
        });
    });

    test.describe("Expanded index", function () {
        const orders = (ids: number[], prices: number[]) =>
            ipc({
                batch: arrow.vectorFromArray([1], int32()),
                orders: arrow.vectorFromArray(
                    [ids.map((id, i) => ({ id, price: prices[i] }))],
                    list(
                        struct([
                            ["id", int32()],
                            ["price", float64()],
                        ]),
                    ),
                ),
            });

        test("Indexes on a column drawn from the list", async function () {
            const table = await perspective.table(
                orders([1, 2, 3], [1.5, 2.5, 3.5]),
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

        test("Updates a list-derived index by element", async function () {
            const table = await perspective.table(orders([1, 2], [1.5, 2.5]), {
                index: "orders.id",
            });

            await table.update(orders([2, 3], [9.5, 3.5]));

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                batch: [1, 1, 1],
                "orders.id": [1, 2, 3],
                "orders.price": [1.5, 9.5, 3.5],
            });

            await view.delete();
            await table.delete();
        });

        test("Rejects an index on a repeated sibling", async function () {
            await expect(
                perspective.table(orders([1, 2], [1.5, 2.5]), {
                    index: "batch",
                }),
            ).rejects.toThrow(/`batch`/);
        });

        test("Rejects any index under a multi-list cartesian", async function () {
            await expect(
                perspective.table(
                    ipc({
                        id: arrow.vectorFromArray([[1, 2]], list(int32())),
                        b: arrow.vectorFromArray([[3, 4, 5]], list(int32())),
                    }),
                    { index: "id", list_flatten: "cartesian" },
                ),
            ).rejects.toThrow(/`id`/);
        });
    });
});
