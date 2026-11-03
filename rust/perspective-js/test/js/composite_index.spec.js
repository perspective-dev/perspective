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
import perspective from "./perspective_client";

const data = [
    { name: "AAPL", sector: "Tech", price: 1 },
    { name: "MSFT", sector: "Tech", price: 2 },
    { name: "AAPL", sector: "Hardware", price: 3 },
];

const ordered = [
    { name: "AAPL", sector: "Hardware", price: 3 },
    { name: "AAPL", sector: "Tech", price: 1 },
    { name: "MSFT", sector: "Tech", price: 2 },
];

const index = ["name", "sector"];

async function fixture(perspective, input = data, options = {}) {
    const table = await perspective.table(input, { index, ...options });
    const view = await table.view();
    const cleanup = async () => {
        await view.delete();
        await table.delete();
    };

    return { table, view, cleanup };
}

async function failure(promise) {
    let message = "";
    try {
        await promise;
    } catch (error) {
        message = error.message;
    }

    return message;
}

async function read_keys(perspective, indices) {
    const table = await perspective.table(indices);
    const view = await table.view();
    const result = await view.to_json();
    await view.delete();
    await table.delete();
    return result;
}

async function subscribe(view) {
    const calls = [];
    let resolve;
    const id = await view.on_remove((removed) => {
        calls.push(removed);
        if (resolve) {
            resolve(removed);
        }
    });

    const next = () =>
        new Promise((x) => {
            resolve = x;
        });

    return { calls, next, id };
}

((perspective) => {
    test.describe("Composite index", function () {
        test.describe("construction", function () {
            test("from rows", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                expect(await table.get_index()).toEqual(index);
                expect(await table.size()).toEqual(3);
                expect(await view.to_json()).toEqual(ordered);
                await cleanup();
            });

            test("from columns", async function () {
                const columns = {
                    name: ["AAPL", "MSFT", "AAPL"],
                    sector: ["Tech", "Tech", "Hardware"],
                    price: [1, 2, 3],
                };

                const { table, view, cleanup } = await fixture(
                    perspective,
                    columns,
                );

                expect(await table.get_index()).toEqual(index);
                expect(await view.to_json()).toEqual(ordered);
                await cleanup();
            });

            test("from csv", async function () {
                const csv =
                    "name,sector,price\nAAPL,Tech,1\nMSFT,Tech,2\nAAPL,Hardware,3";
                const { table, view, cleanup } = await fixture(
                    perspective,
                    csv,
                );
                expect(await table.get_index()).toEqual(index);
                expect(await view.to_json()).toEqual(ordered);
                await cleanup();
            });

            test("from arrow", async function () {
                const source = await perspective.table(data);
                const source_view = await source.view();
                const arrow = await source_view.to_arrow();
                await source_view.delete();
                await source.delete();
                const { table, view, cleanup } = await fixture(
                    perspective,
                    arrow,
                );

                expect(await table.get_index()).toEqual(index);
                expect(await view.to_json()).toEqual(ordered);
                await cleanup();
            });

            test("from schema", async function () {
                const schema = {
                    name: "string",
                    sector: "string",
                    price: "integer",
                };

                const { table, view, cleanup } = await fixture(
                    perspective,
                    schema,
                );

                expect(await table.get_index()).toEqual(index);
                await table.update(data);
                expect(await view.to_json()).toEqual(ordered);
                await cleanup();
            });

            test("dedupes a repeated key on load, last wins", async function () {
                const repeated = [
                    { name: "AAPL", sector: "Tech", price: 1 },
                    { name: "AAPL", sector: "Tech", price: 9 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                ];

                const { table, view, cleanup } = await fixture(
                    perspective,
                    repeated,
                );

                expect(await table.size()).toEqual(2);
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Tech", price: 9 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                ]);

                await cleanup();
            });

            test("a single-column list reports the column name", async function () {
                const table = await perspective.table(data, {
                    index: ["price"],
                });

                expect(await table.get_index()).toEqual("price");
                await table.delete();
            });

            test("rejects an empty list", async function () {
                const message = await failure(
                    perspective.table(data, { index: [] }),
                );

                expect(message).not.toEqual("");
            });

            test("rejects `index` with `limit`", async function () {
                const message = await failure(
                    perspective.table(data, { index, limit: 2 }),
                );

                expect(message).not.toEqual("");
            });

            test("rejects an unknown column", async function () {
                const message = await failure(
                    perspective.table(data, { index: ["name", "nope"] }),
                );

                expect(message).toContain("nope");
            });

            test("rejects a repeated column", async function () {
                const message = await failure(
                    perspective.table(data, { index: ["name", "name"] }),
                );

                expect(message).toContain("repeated");
            });
        });

        test.describe("updates", function () {
            test("updates in place by matching tuple", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                await table.update([
                    { name: "AAPL", sector: "Tech", price: 10 },
                ]);

                expect(await table.size()).toEqual(3);
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Hardware", price: 3 },
                    { name: "AAPL", sector: "Tech", price: 10 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                ]);

                await cleanup();
            });

            test("appends a new tuple", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                await table.update([
                    { name: "MSFT", sector: "Hardware", price: 4 },
                ]);

                expect(await table.size()).toEqual(4);
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Hardware", price: 3 },
                    { name: "AAPL", sector: "Tech", price: 1 },
                    { name: "MSFT", sector: "Hardware", price: 4 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                ]);

                await cleanup();
            });

            test("applies a partial update with all key columns", async function () {
                const wide = data.map((row) => ({ ...row, qty: 7 }));
                const { table, view, cleanup } = await fixture(
                    perspective,
                    wide,
                );

                await table.update([{ name: "MSFT", sector: "Tech", qty: 8 }]);
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Hardware", price: 3, qty: 7 },
                    { name: "AAPL", sector: "Tech", price: 1, qty: 7 },
                    { name: "MSFT", sector: "Tech", price: 2, qty: 8 },
                ]);

                await cleanup();
            });

            test("rejects an update which omits a key column", async function () {
                const { table, cleanup } = await fixture(perspective);
                const message = await failure(
                    table.update([{ name: "MSFT", price: 5 }]),
                );

                expect(message).toContain("missing index column `sector`");
                await cleanup();
            });

            test("rejects a column update which omits a key column", async function () {
                const { table, cleanup } = await fixture(perspective);
                const message = await failure(
                    table.update({ sector: ["Tech"], price: [5] }),
                );

                expect(message).toContain("missing index column `name`");
                await cleanup();
            });

            test("updates by `__INDEX__` array", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                await table.update([
                    { __INDEX__: ["AAPL", "Tech"], price: 100 },
                ]);

                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Hardware", price: 3 },
                    { name: "AAPL", sector: "Tech", price: 100 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                ]);

                await cleanup();
            });

            test("rejects a scalar `__INDEX__`", async function () {
                const { table, cleanup } = await fixture(perspective);
                const message = await failure(
                    table.update([{ __INDEX__: "AAPL", price: 100 }]),
                );

                expect(message).toContain("__INDEX__");
                await cleanup();
            });

            test("rejects `__INDEX__` in an Arrow update", async function () {
                const { table, cleanup } = await fixture(perspective);
                const keys = await perspective.table({
                    __INDEX__: ["x"],
                    price: [1],
                });

                const keys_view = await keys.view();
                const arrow = await keys_view.to_arrow();
                const message = await failure(table.update(arrow));
                expect(message).toContain("__INDEX__");
                await keys_view.delete();
                await keys.delete();
                await cleanup();
            });
        });

        test.describe("removes", function () {
            test("removes by a list of tuples", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                await table.remove([["AAPL", "Tech"]]);
                expect(await table.size()).toEqual(2);
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Hardware", price: 3 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                ]);

                await cleanup();
            });

            test("removes by key columns", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                await table.remove({ name: ["AAPL"], sector: ["Hardware"] });
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Tech", price: 1 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                ]);

                await cleanup();
            });

            test("removes by Arrow", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                const keys = await perspective.table({
                    name: ["MSFT"],
                    sector: ["Tech"],
                });

                const keys_view = await keys.view();
                await table.remove(await keys_view.to_arrow());
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Hardware", price: 3 },
                    { name: "AAPL", sector: "Tech", price: 1 },
                ]);

                await keys_view.delete();
                await keys.delete();
                await cleanup();
            });

            test("rejects a tuple of the wrong arity", async function () {
                const { table, cleanup } = await fixture(perspective);
                const message = await failure(table.remove([["AAPL"]]));
                expect(message).toContain("2 values");
                await cleanup();
            });

            test("`on_remove` delivers one Arrow column per key column", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                const sub = await subscribe(view);
                const promise = sub.next();
                await table.remove([
                    ["AAPL", "Tech"],
                    ["MSFT", "Tech"],
                ]);

                const removed = await promise;
                expect(await read_keys(perspective, removed.indices)).toEqual([
                    { name: "AAPL", sector: "Tech" },
                    { name: "MSFT", sector: "Tech" },
                ]);

                await cleanup();
            });

            test("`replace` and `clear` report dropped keys", async function () {
                const { table, view, cleanup } = await fixture(perspective);
                const sub = await subscribe(view);
                let promise = sub.next();
                await table.replace([
                    { name: "AAPL", sector: "Tech", price: 5 },
                ]);

                let removed = await promise;
                expect(await read_keys(perspective, removed.indices)).toEqual([
                    { name: "MSFT", sector: "Tech" },
                    { name: "AAPL", sector: "Hardware" },
                ]);

                promise = sub.next();
                await table.clear();
                removed = await promise;
                expect(await read_keys(perspective, removed.indices)).toEqual([
                    { name: "AAPL", sector: "Tech" },
                ]);

                await cleanup();
            });
        });

        test.describe("keys", function () {
            test("`__ID__` on a flat view is the tuple", async function () {
                const { view, cleanup } = await fixture(perspective);
                expect(await view.to_json({ id: true })).toEqual([
                    {
                        __ID__: [["AAPL", "Hardware"]],
                        name: "AAPL",
                        sector: "Hardware",
                        price: 3,
                    },
                    {
                        __ID__: [["AAPL", "Tech"]],
                        name: "AAPL",
                        sector: "Tech",
                        price: 1,
                    },
                    {
                        __ID__: [["MSFT", "Tech"]],
                        name: "MSFT",
                        sector: "Tech",
                        price: 2,
                    },
                ]);

                await cleanup();
            });

            test("`__INDEX__` on a flat view is the tuple", async function () {
                const { view, cleanup } = await fixture(perspective);
                expect(await view.to_columns({ index: true })).toEqual({
                    __INDEX__: [
                        [["AAPL", "Hardware"]],
                        [["AAPL", "Tech"]],
                        [["MSFT", "Tech"]],
                    ],
                    name: ["AAPL", "AAPL", "MSFT"],
                    sector: ["Hardware", "Tech", "Tech"],
                    price: [3, 1, 2],
                });

                await cleanup();
            });

            test("`__INDEX__` on a grouped view lists each tuple", async function () {
                const { table, cleanup } = await fixture(perspective);
                const view = await table.view({
                    group_by: ["sector"],
                    columns: ["price"],
                });

                const result = await view.to_json({ index: true });
                expect(result[2].__ROW_PATH__).toEqual(["Tech"]);
                expect(result[2].__INDEX__).toEqual([
                    ["MSFT", "Tech"],
                    ["AAPL", "Tech"],
                ]);

                await view.delete();
                await cleanup();
            });
        });

        test.describe("ordering", function () {
            test("orders by the key columns with numbers compared numerically", async function () {
                const rows = [
                    { a: "x", n: 10 },
                    { a: "x", n: 9 },
                    { a: "w", n: 1 },
                ];

                const table = await perspective.table(rows, {
                    index: ["a", "n"],
                });

                const view = await table.view();
                expect(await view.to_json()).toEqual([
                    { a: "w", n: 1 },
                    { a: "x", n: 9 },
                    { a: "x", n: 10 },
                ]);

                await view.delete();
                await table.delete();
            });

            test("orders a null key first", async function () {
                const rows = [
                    { a: "x", n: 2 },
                    { a: "x", n: null },
                    { a: "x", n: 1 },
                ];

                const table = await perspective.table(rows, {
                    index: ["a", "n"],
                });

                const view = await table.view();
                expect(await view.to_json()).toEqual([
                    { a: "x", n: null },
                    { a: "x", n: 1 },
                    { a: "x", n: 2 },
                ]);

                await view.delete();
                await table.delete();
            });

            test("`sort` wins over key order", async function () {
                const { table, cleanup } = await fixture(perspective);
                const view = await table.view({ sort: [["price", "desc"]] });
                expect(await view.to_json()).toEqual([
                    { name: "AAPL", sector: "Hardware", price: 3 },
                    { name: "MSFT", sector: "Tech", price: 2 },
                    { name: "AAPL", sector: "Tech", price: 1 },
                ]);

                await view.delete();
                await cleanup();
            });
        });

        test.describe("derived tables", function () {
            test("inherits the index when every key column is present", async function () {
                const { table, cleanup } = await fixture(perspective);
                const view = await table.view({
                    columns: ["name", "sector", "price"],
                });

                const derived = await perspective.table(view);
                expect(await derived.get_index()).toEqual(index);
                await table.remove([["MSFT", "Tech"]]);
                expect(await derived.size()).toEqual(2);
                await derived.delete();
                await view.delete();
                await cleanup();
            });

            test("has no index when a key column is missing", async function () {
                const { table, cleanup } = await fixture(perspective);
                const view = await table.view({ columns: ["name", "price"] });
                const derived = await perspective.table(view);
                expect(await derived.get_index()).toBeUndefined();
                const derived_view = await derived.view();
                expect(await derived_view.to_json({ id: true })).toEqual([
                    { __ID__: [["AAPL", "Hardware"]], name: "AAPL", price: 3 },
                    { __ID__: [["AAPL", "Tech"]], name: "AAPL", price: 1 },
                    { __ID__: [["MSFT", "Tech"]], name: "MSFT", price: 2 },
                ]);

                await derived_view.delete();
                await derived.delete();
                await view.delete();
                await cleanup();
            });
        });

        test("`vlookup` takes one key per index column", async function () {
            const { table, cleanup } = await fixture(perspective);
            const view = await table.view({
                columns: ["name", "sector", "looked_up"],
                expressions: {
                    looked_up: "vlookup('price', 'MSFT', 'Tech')",
                },
            });

            expect(await view.to_columns()).toEqual({
                name: ["AAPL", "AAPL", "MSFT"],
                sector: ["Hardware", "Tech", "Tech"],
                looked_up: [2, 2, 2],
            });

            await view.delete();
            await cleanup();
        });

        test("`list_flatten` names a repeated key column", async function () {
            const rows = [
                { name: "AAPL", sector: ["Tech", "Hardware"], price: 1 },
            ];

            const message = await failure(
                perspective.table(rows, { index, list_flatten: "zip" }),
            );

            expect(message).toContain("indexed on `name`");
        });
    });
})(perspective);
