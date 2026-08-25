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
                    { __ROW_PATH__: ["AAPL"], pnl: 0 },
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
                    { __ROW_PATH__: ["AAPL"], pnl: 0 },
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
