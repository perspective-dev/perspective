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

((perspective) => {
    test.describe("Pivotting with nulls", function () {
        test.describe("last aggregate", function () {
            test("preserves null when it is the last element in a leaf", async function () {
                const DATA = {
                    a: ["a", "a", "a", "b", "b", "b", "c", "c", "c"],
                    b: [1, 2, null, 3, 4, 5, null, null, null],
                };
                var table = await perspective.table(DATA);
                var view = await table.view({
                    group_by: ["a"],
                    columns: ["b"],
                    aggregates: { b: "last" },
                });
                var answer = [
                    { __ROW_PATH__: [], b: null },
                    { __ROW_PATH__: ["a"], b: null },
                    { __ROW_PATH__: ["b"], b: 5 },
                    { __ROW_PATH__: ["c"], b: null },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("preserves null when it is the last element in a leaf under 2 levels", async function () {
                const DATA = {
                    a: [
                        "a",
                        "a",
                        "a",
                        "b",
                        "b",
                        "b",
                        "c",
                        "c",
                        "c",
                        "a",
                        "a",
                        "a",
                        "b",
                        "b",
                        "b",
                        "c",
                        "c",
                        "c",
                    ],
                    b: [
                        1,
                        2,
                        null,
                        3,
                        4,
                        5,
                        null,
                        null,
                        null,
                        1,
                        2,
                        null,
                        null,
                        null,
                        null,
                        3,
                        4,
                        5,
                    ],
                    c: [
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                    ],
                };
                var table = await perspective.table(DATA);
                var view = await table.view({
                    group_by: ["c", "a"],
                    columns: ["b"],
                    aggregates: { b: "last" },
                });
                var answer = [
                    { __ROW_PATH__: [], b: 5 },
                    { __ROW_PATH__: ["x"], b: null },
                    { __ROW_PATH__: ["x", "a"], b: null },
                    { __ROW_PATH__: ["x", "b"], b: 5 },
                    { __ROW_PATH__: ["x", "c"], b: null },
                    { __ROW_PATH__: ["y"], b: 5 },
                    { __ROW_PATH__: ["y", "a"], b: null },
                    { __ROW_PATH__: ["y", "b"], b: null },
                    { __ROW_PATH__: ["y", "c"], b: 5 },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("preserves null when it is the last element in a leaf under 2 levels when grand total is null", async function () {
                const DATA = {
                    a: [
                        "a",
                        "a",
                        "a",
                        "b",
                        "b",
                        "b",
                        "c",
                        "c",
                        "c",
                        "a",
                        "a",
                        "a",
                        "b",
                        "b",
                        "b",
                        "c",
                        "c",
                        "c",
                    ],
                    b: [
                        1,
                        2,
                        null,
                        null,
                        null,
                        null,
                        3,
                        4,
                        5,
                        1,
                        2,
                        null,
                        3,
                        4,
                        5,
                        null,
                        null,
                        null,
                    ],
                    c: [
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "x",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                        "y",
                    ],
                };
                var table = await perspective.table(DATA);
                var view = await table.view({
                    group_by: ["c", "a"],
                    columns: ["b"],
                    aggregates: { b: "last" },
                });
                var answer = [
                    { __ROW_PATH__: [], b: null },
                    { __ROW_PATH__: ["x"], b: 5 },
                    { __ROW_PATH__: ["x", "a"], b: null },
                    { __ROW_PATH__: ["x", "b"], b: null },
                    { __ROW_PATH__: ["x", "c"], b: 5 },
                    { __ROW_PATH__: ["y"], b: null },
                    { __ROW_PATH__: ["y", "a"], b: null },
                    { __ROW_PATH__: ["y", "b"], b: 5 },
                    { __ROW_PATH__: ["y", "c"], b: null },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });
        });

        test("shows one pivot for the nulls on initial load", async function () {
            const dataWithNulls = [
                { name: "Homer", value: 1 },
                { name: null, value: 1 },
                { name: null, value: 1 },
                { name: "Krusty", value: 1 },
            ];

            var table = await perspective.table(dataWithNulls);

            var view = await table.view({
                group_by: ["name"],
                aggregates: { name: "distinct count" },
            });

            const answer = [
                { __ROW_PATH__: [], name: 3, value: 4 },
                { __ROW_PATH__: [null], name: 1, value: 2 },
                { __ROW_PATH__: ["Homer"], name: 1, value: 1 },
                { __ROW_PATH__: ["Krusty"], name: 1, value: 1 },
            ];

            let results = await view.to_json();
            expect(results).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("shows one pivot for the nulls after updating with a null", async function () {
            const dataWithNull1 = [
                { name: "Homer", value: 1 },
                { name: null, value: 1 },
            ];
            const dataWithNull2 = [
                { name: null, value: 1 },
                { name: "Krusty", value: 1 },
            ];

            var table = await perspective.table(dataWithNull1);
            await table.update(dataWithNull2);

            var view = await table.view({
                group_by: ["name"],
                aggregates: { name: "distinct count" },
            });

            const answer = [
                { __ROW_PATH__: [], name: 3, value: 4 },
                { __ROW_PATH__: [null], name: 1, value: 2 },
                { __ROW_PATH__: ["Homer"], name: 1, value: 1 },
                { __ROW_PATH__: ["Krusty"], name: 1, value: 1 },
            ];

            let results = await view.to_json();
            expect(results).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("aggregates that return NaN render correctly", async function () {
            const dataWithNull1 = [
                { name: "Homer", value: 3 },
                { name: "Homer", value: 1 },
                { name: "Marge", value: null },
                { name: "Marge", value: null },
            ];

            var table = await perspective.table(dataWithNull1);

            var view = await table.view({
                group_by: ["name"],
                aggregates: { value: "avg" },
            });

            const answer = [
                { __ROW_PATH__: [], name: 4, value: 2 },
                { __ROW_PATH__: ["Homer"], name: 2, value: 2 },
                { __ROW_PATH__: ["Marge"], name: 2, value: null },
            ];

            let results = await view.to_json();
            expect(results).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("aggregates nulls correctly", async function () {
            const data = [
                { x: "AAAAAAAAAAAAAA" },
                { x: "AAAAAAAAAAAAAA" },
                { x: "AAAAAAAAAAAAAA" },
                { x: null },
                { x: null },
                { x: "BBBBBBBBBBBBBB" },
                { x: "BBBBBBBBBBBBBB" },
                { x: "BBBBBBBBBBBBBB" },
            ];
            const tbl = await perspective.table(data);
            const view = await tbl.view({ group_by: ["x"] });

            const result = await view.to_json();
            expect(result).toEqual([
                {
                    __ROW_PATH__: [],
                    x: 8,
                },
                {
                    __ROW_PATH__: [null],
                    x: 2,
                },
                {
                    __ROW_PATH__: ["AAAAAAAAAAAAAA"],
                    x: 3,
                },
                {
                    __ROW_PATH__: ["BBBBBBBBBBBBBB"],
                    x: 3,
                },
            ]);
        });
        test.describe("an all-null group", function () {
            const SOURCE = { g: "string", a: "float" };
            const ROWS = { g: ["x", "x", "y", "y"], a: [null, null, 1, 3] };

            async function grouped(aggregates, expressions, column) {
                const table = await perspective.table(SOURCE);
                await table.update(ROWS);
                const view = await table.view({
                    group_by: ["g"],
                    columns: [column],
                    aggregates,
                    expressions,
                });

                const result = await view.to_columns();
                await view.delete();
                await table.delete();
                return result[column];
            }

            test("sum reports null for an all-null group", async function () {
                expect(await grouped({}, {}, "a")).toEqual([4, null, 4]);
            });

            test("sum or zero reports zero, keeping its incremental fast path", async function () {
                expect(await grouped({ a: "sum or zero" }, {}, "a")).toEqual([
                    4, 0, 4,
                ]);
            });

            test("sum reports null for an expression column too", async function () {
                const column = await grouped({}, { e: '"a"' }, "e");
                expect(column).toEqual([4, null, 4]);
            });

            test("sum not null is a legacy alias for sum", async function () {
                const column = await grouped({ a: "sum not null" }, {}, "a");
                expect(column).toEqual([4, null, 4]);
            });

            test("sum or zero still matches sum when a value is present", async function () {
                const plain = await grouped({}, {}, "a");
                const or_zero = await grouped({ a: "sum or zero" }, {}, "a");
                expect([plain[0], plain[2]]).toEqual([or_zero[0], or_zero[2]]);
            });

            test("sum abs reports null for an all-null group", async function () {
                const column = await grouped({ a: "sum abs" }, {}, "a");
                expect(column).toEqual([4, null, 4]);
            });

            test("abs sum reports null for an all-null group", async function () {
                const column = await grouped({ a: "abs sum" }, {}, "a");
                expect(column).toEqual([4, null, 4]);
            });

            test("pct sum parent reports null for an all-null group", async function () {
                const column = await grouped({ a: "pct sum parent" }, {}, "a");
                expect(column).toEqual([100, null, 100]);
            });

            test("pct sum grand total reports null for an all-null group", async function () {
                const column = await grouped(
                    { a: "pct sum grand total" },
                    {},
                    "a",
                );
                expect(column).toEqual([100, null, 100]);
            });

            test("a group with one non-null value still sums to it", async function () {
                const table = await perspective.table(SOURCE);
                await table.update({ g: ["x", "x"], a: [null, 5] });
                const view = await table.view({
                    group_by: ["g"],
                    columns: ["a"],
                });

                expect((await view.to_columns()).a).toEqual([5, 5]);
                await view.delete();
                await table.delete();
            });

            test("min, max and mean already report null for an all-null group", async function () {
                for (const agg of ["min", "max", "mean"]) {
                    const column = await grouped({ a: agg }, {}, "a");
                    expect([agg, column[1]]).toEqual([agg, null]);
                }
            });
        });
        test.describe("sum across accumulator dtypes", function () {
            for (const dtype of ["integer", "float"]) {
                async function grouped(rows, aggregates) {
                    const table = await perspective.table({
                        g: "string",
                        a: dtype,
                    });

                    await table.update(rows);
                    const view = await table.view({
                        group_by: ["g"],
                        columns: ["a"],
                        aggregates: aggregates ?? { a: "sum" },
                    });

                    const out = (await view.to_columns()).a;
                    await view.delete();
                    await table.delete();
                    return out;
                }

                test(`${dtype} > an all-null group is null`, async function () {
                    const out = await grouped({
                        g: ["x", "x", "y", "y"],
                        a: [null, null, 1, 3],
                    });

                    expect(out).toEqual([4, null, 4]);
                });

                test(`${dtype} > a populated group sums normally`, async function () {
                    const out = await grouped({
                        g: ["x", "x", "y"],
                        a: [2, 3, 7],
                    });

                    expect(out).toEqual([12, 5, 7]);
                });

                test(`${dtype} > a group netting to zero is zero, not null`, async function () {
                    const out = await grouped({
                        g: ["x", "x", "y"],
                        a: [5, -5, 1],
                    });

                    expect(out).toEqual([1, 0, 1]);
                });

                test(`${dtype} > sum or zero still reports zero for an all-null group`, async function () {
                    const out = await grouped(
                        { g: ["x", "x", "y", "y"], a: [null, null, 1, 3] },
                        { a: "sum or zero" },
                    );

                    expect(out).toEqual([4, 0, 4]);
                });

                test(`${dtype} > nulling a group's only value reports null`, async function () {
                    const table = await perspective.table(
                        { ticker: "string", pnl: dtype },
                        { index: "ticker" },
                    );

                    await table.update([
                        { ticker: "IBM", pnl: 100 },
                        { ticker: "AAPL", pnl: 100 },
                    ]);

                    const view = await table.view({
                        group_by: ["ticker"],
                        columns: ["pnl"],
                        aggregates: { pnl: "sum" },
                    });

                    await table.update([{ ticker: "AAPL", pnl: null }]);
                    expect(await view.to_json()).toEqual([
                        { __ROW_PATH__: [], pnl: 100 },
                        { __ROW_PATH__: ["AAPL"], pnl: null },
                        { __ROW_PATH__: ["IBM"], pnl: 100 },
                    ]);

                    await view.delete();
                    await table.delete();
                });
            }

            test("float > draining a group across batches reports null, not residue", async function () {
                const table = await perspective.table(
                    { id: "integer", g: "string", pnl: "float" },
                    { index: "id" },
                );

                await table.update([
                    { id: 0, g: "x", pnl: 0.1 },
                    { id: 1, g: "x", pnl: 0.2 },
                    { id: 2, g: "y", pnl: 1 },
                ]);

                const view = await table.view({
                    group_by: ["g"],
                    columns: ["pnl"],
                });

                await view.to_columns();
                await table.update([{ id: 0, pnl: null }]);
                await table.update([{ id: 1, pnl: null }]);
                expect((await view.to_columns()).pnl).toEqual([1, null, 1]);
                await view.delete();
                await table.delete();
            });

            test("float > a NaN is skipped rather than poisoning the total", async function () {
                const table = await perspective.table({
                    g: "string",
                    a: "float",
                });

                await table.update({
                    g: ["x", "x", "x"],
                    a: [1, Number.NaN, 4],
                });

                const view = await table.view({
                    group_by: ["g"],
                    columns: ["a"],
                    aggregates: { a: "sum" },
                });

                expect((await view.to_columns()).a).toEqual([5, 5]);
                await view.delete();
                await table.delete();
            });
        });
        test.describe("sum aggregate with null updates (#1256)", function () {
            test("sum does not accumulate when an indexed row flips between null and a value", async function () {
                const table = await perspective.table(
                    { ticker: "string", pnl: "integer" },
                    { index: "ticker" },
                );

                await table.update([
                    { ticker: "IBM", pnl: 100 },
                    { ticker: "AAPL", pnl: 100 },
                ]);

                const view = await table.view({
                    group_by: ["ticker"],
                    columns: ["pnl"],
                    aggregates: { pnl: "sum" },
                });

                const nulled = [
                    { __ROW_PATH__: [], pnl: 100 },
                    { __ROW_PATH__: ["AAPL"], pnl: null },
                    { __ROW_PATH__: ["IBM"], pnl: 100 },
                ];

                const restored = [
                    { __ROW_PATH__: [], pnl: 200 },
                    { __ROW_PATH__: ["AAPL"], pnl: 100 },
                    { __ROW_PATH__: ["IBM"], pnl: 100 },
                ];

                expect(await view.to_json()).toEqual(restored);
                for (let i = 0; i < 3; i++) {
                    await table.update([{ ticker: "AAPL", pnl: null }]);
                    expect(await view.to_json()).toEqual(nulled);
                    await table.update([{ ticker: "AAPL", pnl: 100 }]);
                    expect(await view.to_json()).toEqual(restored);
                }

                view.delete();
                table.delete();
            });

            test("float sum does not accumulate when an indexed row flips between null and a value", async function () {
                const table = await perspective.table(
                    { ticker: "string", pnl: "float" },
                    { index: "ticker" },
                );

                await table.update([
                    { ticker: "IBM", pnl: 100.5 },
                    { ticker: "AAPL", pnl: 100.5 },
                ]);

                const view = await table.view({
                    group_by: ["ticker"],
                    columns: ["pnl"],
                    aggregates: { pnl: "sum" },
                });

                const nulled = [
                    { __ROW_PATH__: [], pnl: 100.5 },
                    { __ROW_PATH__: ["AAPL"], pnl: null },
                    { __ROW_PATH__: ["IBM"], pnl: 100.5 },
                ];

                const restored = [
                    { __ROW_PATH__: [], pnl: 201 },
                    { __ROW_PATH__: ["AAPL"], pnl: 100.5 },
                    { __ROW_PATH__: ["IBM"], pnl: 100.5 },
                ];

                expect(await view.to_json()).toEqual(restored);
                for (let i = 0; i < 3; i++) {
                    await table.update([{ ticker: "AAPL", pnl: null }]);
                    expect(await view.to_json()).toEqual(nulled);
                    await table.update([{ ticker: "AAPL", pnl: 100.5 }]);
                    expect(await view.to_json()).toEqual(restored);
                }

                view.delete();
                table.delete();
            });

            test("sum is unchanged by a partial update which omits the column", async function () {
                const table = await perspective.table(
                    { ticker: "string", pnl: "integer", qty: "integer" },
                    { index: "ticker" },
                );

                await table.update([
                    { ticker: "IBM", pnl: 100, qty: 1 },
                    { ticker: "AAPL", pnl: 100, qty: 1 },
                ]);

                const view = await table.view({
                    group_by: ["ticker"],
                    columns: ["pnl"],
                    aggregates: { pnl: "sum" },
                });

                await table.update([{ ticker: "AAPL", qty: 2 }]);
                expect(await view.to_json()).toEqual([
                    { __ROW_PATH__: [], pnl: 200 },
                    { __ROW_PATH__: ["AAPL"], pnl: 100 },
                    { __ROW_PATH__: ["IBM"], pnl: 100 },
                ]);

                view.delete();
                table.delete();
            });

            test("sum is unchanged by removing a row whose value is null", async function () {
                const table = await perspective.table(
                    { ticker: "string", pnl: "integer" },
                    { index: "ticker" },
                );

                await table.update([
                    { ticker: "IBM", pnl: 100 },
                    { ticker: "AAPL", pnl: null },
                ]);

                const view = await table.view({
                    group_by: ["ticker"],
                    columns: ["pnl"],
                    aggregates: { pnl: "sum" },
                });

                await table.remove(["AAPL"]);
                expect(await view.to_json()).toEqual([
                    { __ROW_PATH__: [], pnl: 100 },
                    { __ROW_PATH__: ["IBM"], pnl: 100 },
                ]);

                view.delete();
                table.delete();
            });
        });
    });
})(perspective);
