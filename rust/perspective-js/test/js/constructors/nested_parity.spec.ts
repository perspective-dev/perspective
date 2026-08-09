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
const list = (type: arrow.DataType) => new arrow.List(field("item", type));
const struct = (fields: [string, arrow.DataType][]) =>
    new arrow.Struct(fields.map(([n, t]) => field(n, t)));

const ipc = (columns: Record<string, arrow.Vector>) =>
    arrow.tableToIPC(arrow.tableFromArrays(columns as any));

async function parity(
    name: string,
    records: any[],
    arrowColumns: Record<string, arrow.Vector>,
    options: any = {},
) {
    const from_json = await perspective.table(records as any, options);
    const from_arrow = await perspective.table(ipc(arrowColumns), options);

    const json_view = await from_json.view();
    const arrow_view = await from_arrow.view();

    expect(await from_json.schema()).toEqual(await from_arrow.schema());
    expect(await json_view.to_columns()).toEqual(await arrow_view.to_columns());

    await json_view.delete();
    await arrow_view.delete();
    await from_json.delete();
    await from_arrow.delete();
}

test.describe("Nested ingest parity", function () {
    test("struct flattening", async function () {
        await parity(
            "struct",
            [
                { id: 1, s: { a: 10, b: 1.5 } },
                { id: 2, s: { a: 20, b: 2.5 } },
            ],
            {
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
            },
        );
    });

    test("nested struct", async function () {
        await parity(
            "nested",
            [{ s: { b: { c: 1 } } }, { s: { b: { c: 2 } } }],
            {
                s: arrow.vectorFromArray(
                    [{ b: { c: 1 } }, { b: { c: 2 } }],
                    struct([["b", struct([["c", int32()]])]]),
                ),
            },
        );
    });

    test("list expansion", async function () {
        await parity(
            "zip",
            [
                { x: 1, y: [10, 20, 30] },
                { x: 2, y: [40] },
            ],
            {
                x: arrow.vectorFromArray([1, 2], int32()),
                y: arrow.vectorFromArray([[10, 20, 30], [40]], list(int32())),
            },
        );
    });

    test("empty list yields one null row", async function () {
        await parity(
            "empty",
            [
                { x: 1, y: [] },
                { x: 2, y: [40] },
            ],
            {
                x: arrow.vectorFromArray([1, 2], int32()),
                y: arrow.vectorFromArray([[], [40]], list(int32())),
            },
        );
    });

    test("list of struct", async function () {
        await parity(
            "list_of_struct",
            [{ id: 1, orders: [{ price: 1.5 }, { price: 2.5 }] }],
            {
                id: arrow.vectorFromArray([1], int32()),
                orders: arrow.vectorFromArray(
                    [[{ price: 1.5 }, { price: 2.5 }]],
                    list(struct([["price", float64()]])),
                ),
            },
        );
    });

    test("struct containing a list", async function () {
        // The mirror of `list of struct`: Arrow reaches it by hoisting then
        // exploding, JSON by an object combining a child array's width. The
        // two arrive at the same flat shape by different routes.
        await parity(
            "struct_of_list",
            [
                { id: 1, s: { a: [10, 20] } },
                { id: 2, s: { a: [30] } },
            ],
            {
                id: arrow.vectorFromArray([1, 2], int32()),
                s: arrow.vectorFromArray(
                    [{ a: [10, 20] }, { a: [30] }],
                    struct([["a", list(int32())]]),
                ),
            },
        );
    });

    test("nested lists", async function () {
        await parity("nested_list", [{ y: [[1, 2], [3]] }], {
            y: arrow.vectorFromArray([[[1, 2], [3]]], list(list(int32()))),
        });
    });

    test("cartesian product", async function () {
        await parity(
            "cartesian",
            [{ a: [1, 2], b: [3, 4, 5] }],
            {
                a: arrow.vectorFromArray([[1, 2]], list(int32())),
                b: arrow.vectorFromArray([[3, 4, 5]], list(int32())),
            },
            { list_flatten: "cartesian" },
        );
    });

    test("index drawn from the expanded array", async function () {
        await parity(
            "indexed",
            [{ batch: 1, orders: [{ id: 1 }, { id: 2 }] }],
            {
                batch: arrow.vectorFromArray([1], int32()),
                orders: arrow.vectorFromArray(
                    [[{ id: 1 }, { id: 2 }]],
                    list(struct([["id", int32()]])),
                ),
            },
            { index: "orders.id" },
        );
    });

    test("both reject a repeated index", async function () {
        const records = [{ batch: 1, orders: [{ id: 1 }, { id: 2 }] }];
        const columns = {
            batch: arrow.vectorFromArray([1], int32()),
            orders: arrow.vectorFromArray(
                [[{ id: 1 }, { id: 2 }]],
                list(struct([["id", int32()]])),
            ),
        };

        await expect(
            perspective.table(records as any, { index: "batch" }),
        ).rejects.toThrow(/`batch`/);

        await expect(
            perspective.table(ipc(columns), { index: "batch" }),
        ).rejects.toThrow(/`batch`/);
    });

    test("both reject a ragged zip", async function () {
        const columns = {
            a: arrow.vectorFromArray([[1, 2]], list(int32())),
            b: arrow.vectorFromArray([[3, 4, 5]], list(int32())),
        };

        await expect(
            perspective.table([{ a: [1, 2], b: [3, 4, 5] }] as any),
        ).rejects.toThrow(/[Cc]annot zip/);

        await expect(perspective.table(ipc(columns))).rejects.toThrow(
            /[Cc]annot zip/,
        );
    });
});
