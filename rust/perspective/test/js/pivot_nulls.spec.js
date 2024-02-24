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

import { test, expect } from "@finos/perspective-test";
import perspective from "@finos/perspective";

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
            table.update(dataWithNull2);

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
    });
})(perspective);
