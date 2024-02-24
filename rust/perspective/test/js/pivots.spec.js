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

var data = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
];

var meta = {
    x: "integer",
    y: "string",
    z: "boolean",
};

var data2 = [
    { x: 1, y: 1, z: true },
    { x: 2, y: 1, z: false },
    { x: 3, y: 2, z: true },
    { x: 4, y: 2, z: false },
];

var data_7 = {
    w: [1.5, 2.5, 3.5, 4.5],
    x: [1, 2, 3, 4],
    y: ["a", "b", "c", "d"],
    z: [true, false, true, false],
};

var data_8 = {
    w: [1.5, 2.5, 3.5, 4.5],
    x: [1, 2, 3, 4],
    y: ["a", "b", "c", "d"],
    z: [
        new Date(1555126035065),
        new Date(1555126035065),
        new Date(1555026035065),
        new Date(1555026035065),
    ],
};

const float_data = {
    x: [
        0.99098243, 0.36677191, 0.58926465, 0.95701263, 0.96904283, 0.50398721,
        0.67424934, 0.32015379, 0.14877031, 0.16285932, 0.00597484, 0.90579728,
        0.01338397, 0.66893083, 0.79209796, 0.41033256, 0.92328448, 0.20791236,
        0.14874502, 0.1727802,
    ],
    y: [
        "a",
        "b",
        "c",
        "d",
        "e",
        "a",
        "b",
        "c",
        "d",
        "e",
        "a",
        "b",
        "c",
        "d",
        "e",
        "a",
        "b",
        "c",
        "d",
        "e",
    ],
};

const variance = (nums) => {
    let k = 0,
        m = 0,
        s = 0;

    for (const num of nums) {
        k++;
        const next_m = m + (num - m) / k;
        s += (num - m) * (num - next_m);
        m = next_m;
    }

    return s / nums.length;
};

const std = (nums) => {
    return Math.sqrt(variance(nums));
};

((perspective) => {
    test.describe("Aggregate", function () {
        test("old `aggregate` syntax is backwards compatible", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                aggregate: [{ column: "x", op: "sum" }],
                group_by: ["z"],
            });
            var answer = [
                { __ROW_PATH__: [], x: 10 },
                { __ROW_PATH__: [false], x: 6 },
                { __ROW_PATH__: [true], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("Aggregates are processed in the order of the columns array", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["z"],
                columns: ["y", "z"],
                aggregates: {
                    z: "last",
                    y: "last",
                },
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["__ROW_PATH__", "y", "z"]);
            const answer = [
                { __ROW_PATH__: [], y: "c", z: true },
                { __ROW_PATH__: [false], y: "d", z: false },
                { __ROW_PATH__: [true], y: "c", z: true },
            ];
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("Aggregates are not in columns are ignored", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["z"],
                columns: ["y", "z"],
                aggregates: {
                    x: "count",
                },
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["__ROW_PATH__", "y", "z"]);
            const answer = [
                { __ROW_PATH__: [], y: 4, z: 4 },
                { __ROW_PATH__: [false], y: 2, z: 2 },
                { __ROW_PATH__: [true], y: 2, z: 2 },
            ];
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], sum", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
            });
            var answer = [
                { __ROW_PATH__: [], x: 10 },
                { __ROW_PATH__: [false], x: 6 },
                { __ROW_PATH__: [true], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], weighted mean", async function () {
            var table = await perspective.table(data2);
            var view = await table.view({
                group_by: ["z"],
                aggregates: { x: ["weighted mean", "y"] },
                columns: ["x"],
            });
            var answer = [
                { __ROW_PATH__: [], x: 2.8333333333333335 },
                { __ROW_PATH__: [false], x: 3.3333333333333335 },
                { __ROW_PATH__: [true], x: 2.3333333333333335 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], weighted mean on a table created from schema should return valid values after update", async function () {
            const table = await perspective.table({
                x: "integer",
                y: "integer",
                z: "boolean",
            });

            const view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: ["weighted mean", "y"] },
            });

            const answer = [
                { __ROW_PATH__: [], x: 2.8333333333333335 },
                { __ROW_PATH__: [false], x: 3.3333333333333335 },
                { __ROW_PATH__: [true], x: 2.3333333333333335 },
            ];

            table.update(data2);

            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], mean", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "mean" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 2.5 },
                { __ROW_PATH__: [false], x: 3 },
                { __ROW_PATH__: [true], x: 2 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], mean on a table created from schema should return valid values after update", async function () {
            const table = await perspective.table({
                x: "integer",
                y: "string",
                z: "boolean",
            });
            const view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "mean" },
            });
            const answer = [
                { __ROW_PATH__: [], x: 2.5 },
                { __ROW_PATH__: [false], x: 3 },
                { __ROW_PATH__: [true], x: 2 },
            ];

            table.update(data);

            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], first by index", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "first by index" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 1 },
                { __ROW_PATH__: [false], x: 2 },
                { __ROW_PATH__: [true], x: 1 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], join", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "join" },
            });
            var answer = [
                { __ROW_PATH__: [], x: "1, 2, 3, 4" },
                { __ROW_PATH__: [false], x: "2, 4" },
                { __ROW_PATH__: [true], x: "1, 3" },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], join exceeds max join size", async function () {
            let data2 = JSON.parse(JSON.stringify(data));
            data2.push({
                x: 5,
                y: "abcdefghijklmnopqrstuvwxyz".repeat(12),
                z: false,
            });
            var table = await perspective.table(data2);
            var view = await table.view({
                group_by: ["z"],
                columns: ["y"],
                aggregates: { y: "join" },
            });
            var answer = [
                { __ROW_PATH__: [], y: "a" },
                { __ROW_PATH__: [false], y: "" },
                { __ROW_PATH__: [true], y: "a, c" },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("join with nulls", async function () {
            const data = [
                { country: "US", state: "New York", city: null },
                {
                    country: "US",
                    state: "Arizona",
                    city: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                },
            ];

            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["country", "state"],
                columns: ["city"],
                aggregates: { city: "join" },
            });
            var answer = {
                __ROW_PATH__: [
                    [],
                    ["US"],
                    ["US", "Arizona"],
                    ["US", "New York"],
                ],
                city: [
                    "null, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "null, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "null",
                ],
            };
            let result = await view.to_columns();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], first by index with appends", async function () {
            var table = await perspective.table(data, { index: "y" });
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "first by index" },
            });
            const answer = [
                { __ROW_PATH__: [], x: 1 },
                { __ROW_PATH__: [false], x: 2 },
                { __ROW_PATH__: [true], x: 1 },
            ];
            table.update({
                x: [5],
                y: ["e"],
                z: [true],
            });
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], last_minus_first", async function () {
            var table = await perspective.table(
                [
                    { x: 1, y: "a", z: true },
                    { x: 2, y: "b", z: false },
                    { x: 3, y: "c", z: true },
                    { x: 4, y: "d", z: false },
                ],
                { index: "y" }
            );
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "last minus first" },
            });
            const answer = [
                { __ROW_PATH__: [], x: -1 },
                { __ROW_PATH__: [false], x: 2 },
                { __ROW_PATH__: [true], x: -2 },
            ];
            table.update({
                x: [5],
                y: ["a"],
                z: [true],
            });
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], high_minus_low", async function () {
            var table = await perspective.table(
                [
                    { x: 1, y: "a", z: true },
                    { x: 2, y: "b", z: false },
                    { x: 3, y: "c", z: true },
                    { x: 4, y: "d", z: false },
                ],
                { index: "y" }
            );
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "high minus low" },
            });
            const answer = [
                { __ROW_PATH__: [], x: 3 },
                { __ROW_PATH__: [false], x: 2 },
                { __ROW_PATH__: [true], x: 2 },
            ];
            table.update({
                x: [5],
                y: ["a"],
                z: [true],
            });
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], first by index with partial updates", async function () {
            var table = await perspective.table(data, { index: "y" });
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "first by index" },
            });
            const answer = [
                { __ROW_PATH__: [], x: 5 },
                { __ROW_PATH__: [false], x: 2 },
                { __ROW_PATH__: [true], x: 5 },
            ];
            table.update({
                x: [5],
                y: ["a"],
                z: [true],
            });
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("last with count and partial update", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: ["A"],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["y"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["a", "a"],
                y: [1, 1],
                index: [1, 1],
            });

            for (let i = 0; i < 5; i++) {
                table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1]);

            table.update({
                x: ["b"],
                y: ["A"],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual(["b", "b"]);
            expect(result["y"]).toEqual([1, 1]);

            await view.delete();
            await table.delete();
        });

        test("high with count and partial update", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: [100],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "count",
                    y: "high",
                },
                group_by: ["x"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["a"]],
                x: [1, 1],
                y: [100, 100],
                index: [1, 1],
            });

            for (let i = 0; i < 5; i++) {
                table.update({
                    x: ["a"],
                    y: [100],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([100, 100]);

            table.update({
                x: ["b"],
                y: [101],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual([1, 1]);
            expect(result["y"]).toEqual([101, 101]);

            await view.delete();
            await table.delete();
        });

        test("low with count and partial update", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: [100],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "count",
                    y: "low",
                },
                group_by: ["x"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["a"]],
                x: [1, 1],
                y: [100, 100],
                index: [1, 1],
            });

            for (let i = 0; i < 5; i++) {
                table.update({
                    x: ["a"],
                    y: [100],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([100, 100]);

            table.update({
                x: ["b"],
                y: [101],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual([1, 1]);
            expect(result["y"]).toEqual([100, 101]);

            table.update({
                x: ["b"],
                y: [99],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual([1, 1]);
            expect(result["y"]).toEqual([99, 99]);

            await view.delete();
            await table.delete();
        });

        test("low with count and multiple partial updates", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: [100],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "count",
                    y: "low",
                },
                group_by: ["x"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["a"]],
                x: [1, 1],
                y: [100, 100],
                index: [1, 1],
            });

            for (let i = 0; i < 100; i++) {
                table.update({
                    x: ["a"],
                    y: [99],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([99, 99]);

            table.update({
                y: [101],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual([1, 1]);

            // FIXME: my assumption of the `low` aggregate is that it should
            // be the low of the group according to current data, but this seems
            // like it's storing a "global" low?
            expect(result["y"]).toEqual([99, 99]);

            table.update({
                x: ["b"],
                y: [100],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual([1, 1]);
            expect(result["y"]).toEqual([99, 100]);

            await view.delete();
            await table.delete();
        });

        test("last with count and multiple partial updates", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: ["A"],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["y"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["a", "a"],
                y: [1, 1],
                index: [1, 1],
            });

            for (let i = 0; i < 100; i++) {
                table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1]);

            for (let i = 0; i < 100; i++) {
                table.update({
                    x: ["b"],
                    index: [1],
                });
            }

            result = await view.to_columns();
            expect(result["x"]).toEqual(["b", "b"]);
            expect(result["y"]).toEqual([1, 1]);

            await view.delete();
            await table.delete();
        });

        test("last with multiple aggs, count, and multiple partial updates", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: ["A"],
                    z: [1],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["y", "z"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"], ["A", 1]],
                x: ["a", "a", "a"],
                y: [1, 1, 1],
                z: [1, 1, 1],
                index: [1, 1, 1],
            });

            for (let i = 0; i < 100; i++) {
                table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1, 1]);

            for (let i = 0; i < 100; i++) {
                table.update({
                    x: ["b"],
                    index: [1],
                });
            }

            result = await view.to_columns();
            expect(result["x"]).toEqual(["b", "b", "b"]);
            expect(result["y"]).toEqual([1, 1, 1]);

            for (let i = 2; i < 6; i++) {
                table.update({
                    x: [i.toString()],
                    y: [i.toString()],
                    z: [i],
                    index: [i],
                });
            }

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [
                    [],
                    ["2"],
                    ["2", 2],
                    ["3"],
                    ["3", 3],
                    ["4"],
                    ["4", 4],
                    ["5"],
                    ["5", 5],
                    ["A"],
                    ["A", 1],
                ],
                x: ["5", "2", "2", "3", "3", "4", "4", "5", "5", "b", "b"],
                y: [5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                z: [15, 2, 2, 3, 3, 4, 4, 5, 5, 1, 1],
                index: [15, 2, 2, 3, 3, 4, 4, 5, 5, 1, 1],
            });

            await view.delete();
            await table.delete();
        });

        test("last with count and invalid to valid", async () => {
            // y[0] is invalid
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: [null],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["x"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["a"]],
                x: ["a", "a"],
                y: [1, 1], // null is still a value for count
                index: [1, 1],
            });

            const view2 = await table.view({
                aggregates: {
                    x: "last",
                    y: "last",
                },
                group_by: ["x"],
            });

            expect(await view2.to_columns()).toEqual({
                __ROW_PATH__: [[], ["a"]],
                x: ["a", "a"],
                y: [null, null],
                index: [1, 1],
            });

            for (let i = 0; i < 100; i++) {
                table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1]);

            // y[0] becomes valid
            table.update({
                x: ["b"],
                y: ["B"],
                index: [1],
            });

            result = await view.to_columns();
            let result2 = await view2.to_columns();
            expect(result["x"]).toEqual(["b", "b"]);
            expect(result["y"]).toEqual([1, 1]);
            expect(result2["y"]).toEqual(["B", "B"]);

            // and invalid
            table.update({
                y: [null],
                index: [1],
            });

            result = await view.to_columns();
            result2 = await view2.to_columns();
            expect(result["y"]).toEqual([1, 1]);
            expect(result2["y"]).toEqual([null, null]);

            await view2.delete();
            await view.delete();
            await table.delete();
        });

        test("last with count and partial update 2-sided", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: ["A"],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["y"],
                split_by: ["x"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                "a|x": ["a", "a"],
                "a|y": [1, 1],
                "a|index": [1, 1],
            });

            for (let i = 0; i < 5; i++) {
                table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["a|y"]).toEqual([1, 1]);

            table.update({
                x: ["b"],
                y: ["A"],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["b|x"]).toEqual(["b", "b"]);
            expect(result["b|y"]).toEqual([1, 1]);

            await view.delete();
            await table.delete();
        });

        test("last with count and partial update flip", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: ["A"],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["y"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["a", "a"],
                y: [1, 1],
                index: [1, 1],
            });

            table.update({
                x: ["b"],
                index: [1],
            });

            // x should flip, y should remain the same
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["b", "b"],
                y: [1, 1],
                index: [1, 1],
            });

            table.update({
                x: ["c"],
                index: [1],
            });

            // and again
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["c", "c"],
                y: [1, 1],
                index: [1, 1],
            });

            table.update({
                x: ["d"],
                y: ["B"],
                index: [2],
            });

            // another row
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"], ["B"]],
                x: ["d", "c", "d"],
                y: [2, 1, 1],
                index: [3, 1, 2],
            });

            await view.delete();
            await table.delete();
        });

        test("last with count and partial update flip, filtered", async () => {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: ["A"],
                    index: [1],
                },
                { index: "index" }
            );

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["y"],
                filter: [["x", "==", "a"]],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["a", "a"],
                y: [1, 1],
                index: [1, 1],
            });

            table.update({
                x: ["b"],
                index: [1],
            });

            // x should flip, y should remain the same
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[]],
                x: [""],
                y: [0],
                index: [0],
            });

            table.update({
                x: ["a"],
                index: [1],
            });

            // and again
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["a", "a"],
                y: [1, 1],
                index: [1, 1],
            });

            table.update({
                x: ["a"],
                y: ["B"],
                index: [2],
            });

            // another row
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"], ["B"]],
                x: ["a", "a", "a"],
                y: [2, 1, 1],
                index: [3, 1, 2],
            });

            await view.delete();
            await table.delete();
        });

        test("last with count and append flip", async () => {
            const table = await perspective.table({
                x: ["a"],
                y: ["A"],
                index: [1],
            });

            const view = await table.view({
                aggregates: {
                    x: "last",
                    y: "count",
                },
                group_by: ["y"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"]],
                x: ["a", "a"],
                y: [1, 1],
                index: [1, 1],
            });

            table.update({
                x: ["b"],
                index: [1],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [null], ["A"]],
                x: ["b", "b", "a"],
                y: [2, 1, 1],
                index: [2, 1, 1],
            });

            table.update({
                x: ["c"],
                index: [1],
            });

            // and again
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [null], ["A"]],
                x: ["c", "c", "a"],
                y: [3, 2, 1],
                index: [3, 2, 1],
            });

            table.update({
                x: ["d"],
                y: ["B"],
                index: [2],
            });

            // another row
            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [null], ["A"], ["B"]],
                x: ["d", "c", "a", "d"],
                y: [4, 2, 1, 1],
                index: [5, 2, 1, 2],
            });

            await view.delete();
            await table.delete();
        });

        test("['z'], last by index", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "last by index" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 4 },
                { __ROW_PATH__: [false], x: 4 },
                { __ROW_PATH__: [true], x: 3 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], last by index with appends", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "last by index" },
            });
            const answer = [
                { __ROW_PATH__: [], x: 5 },
                { __ROW_PATH__: [false], x: 4 },
                { __ROW_PATH__: [true], x: 5 },
            ];
            table.update({
                x: [5],
                y: ["e"],
                z: [true],
            });
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], last by index with partial updates", async function () {
            const table = await perspective.table(data, { index: "y" });
            const view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "last by index" },
            });
            const answer = [
                { __ROW_PATH__: [], x: 4 },
                { __ROW_PATH__: [false], x: 4 },
                { __ROW_PATH__: [true], x: 5 },
            ];
            table.update({
                x: [5],
                y: ["c"],
                z: [true],
            });
            const result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'], last", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
                aggregates: { x: "last" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 3 },
                { __ROW_PATH__: [false], x: 4 },
                { __ROW_PATH__: [true], x: 3 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);

            table.update([
                { x: 1, y: "c", z: true },
                { x: 2, y: "d", z: false },
            ]);
            var answerAfterUpdate = [
                { __ROW_PATH__: [], x: 1 },
                { __ROW_PATH__: [false], x: 2 },
                { __ROW_PATH__: [true], x: 1 },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answerAfterUpdate);
            view.delete();
            table.delete();
        });

        test("unique", async function () {
            const table = await perspective.table(
                {
                    x: [100, 200, 100, 200],
                    y: [1, 2, 3, 4],
                    z: ["a", "a", "a", "b"],
                },
                { index: "y" }
            );

            const view = await table.view({
                group_by: ["x"],
                aggregates: {
                    x: "unique",
                    y: "unique",
                    z: "unique",
                },
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [100], [200]],
                x: [null, 100, 200],
                y: [null, null, null],
                z: [null, "a", null],
            });

            table.update({
                y: [4],
                z: ["a"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [100], [200]],
                x: [null, 100, 200],
                y: [null, null, null],
                z: ["a", "a", "a"],
            });

            table.update({
                y: [5],
                z: ["x"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [null], [100], [200]],
                x: [null, null, 100, 200],
                y: [null, 5, null, null],
                z: [null, "x", "a", "a"],
            });

            await view.delete();
            await table.delete();
        });

        test("variance", async function () {
            const table = await perspective.table(float_data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "var" },
            });

            const result = await view.to_columns();

            const expected = [
                0.33597085443953206, 0.35043269693156814, 0.22510197203101087,
                0.20827220910070432, 0.3473746254711007, 0.3618418050868363,
            ].map((x) => Math.pow(x, 2));

            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("variance multi-pivot", async function () {
            const table = await perspective.table({
                x: [
                    0.62817744, 0.16903811, 0.77902867, 0.92330087, 0.10583306,
                    0.59794354,
                ],
                y: ["a", "a", "b", "b", "c", "c"],
                z: [1, 1, 1, 1, 1, 1],
            });
            const view = await table.view({
                group_by: ["y", "z"],
                columns: ["x"],
                aggregates: { x: "var" },
            });

            const result = await view.to_columns();
            const expected = [
                0.3002988555851961, 0.22956966499999998, 0.22956966499999998,
                0.07213610000000004, 0.07213610000000004, 0.24605524,
                0.24605524,
            ].map((x) => Math.pow(x, 2));

            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("variance append", async function () {
            const table = await perspective.table(float_data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "var" },
            });

            let result = await view.to_columns();

            const expected = [
                0.33597085443953206, 0.35043269693156814, 0.22510197203101087,
                0.20827220910070432, 0.3473746254711007, 0.3618418050868363,
            ].map((x) => Math.pow(x, 2));

            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            table.update([{ x: 0.64294039, y: "a" }]);
            result = await view.to_columns();

            const expected2 = [
                0.32935140956170517, 0.32031993493462224, 0.22510197203101087,
                0.20827220910070432, 0.3473746254711007, 0.3618418050868363,
            ].map((x) => Math.pow(x, 2));
            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected2[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("variance partial update", async function () {
            const table = await perspective.table(
                {
                    x: [
                        0.99098243, 0.36677191, 0.58926465, 0.95701263,
                        0.96904283, 0.50398721,
                    ],
                    y: ["a", "a", "b", "b", "c", "c"],
                    z: [1, 2, 3, 4, 5, 6],
                },
                { index: "z" }
            );

            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "var" },
            });

            let result = await view.to_columns();

            const expected = [
                0.25153179517283897, 0.31210526, 0.18387399000000004,
                0.23252781,
            ].map((x) => Math.pow(x, 2));

            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            table.update([{ x: 0.284169685, z: 3 }]);
            result = await view.to_columns();

            const expected2 = [
                0.3007643174035643, 0.31210526, 0.33642147250000004, 0.23252781,
            ].map((x) => Math.pow(x, 2));

            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected2[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("variance of range", async function () {
            const float_data_copy = JSON.parse(JSON.stringify(float_data));
            float_data_copy["y"] = Array(float_data_copy["x"].length).fill("a");

            const table = await perspective.table(float_data_copy);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "var" },
            });

            const result = await view.to_columns();

            const expected = [0.33597085443953206, 0.33597085443953206].map(
                (x) => Math.pow(x, 2)
            );

            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("variance of size 1", async function () {
            const table = await perspective.table({
                x: [0.61801758],
                y: ["a"],
            });
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "var" },
            });

            const result = await view.to_columns();
            expect(result.x).toEqual([null, null]);

            await view.delete();
            await table.delete();
        });

        test("variance of size 2", async function () {
            const table = await perspective.table({
                x: [0.61801758, 0.11283123],
                y: ["a", "a"],
            });
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "var" },
            });

            const result = await view.to_columns();
            expect(result.x).toEqual([
                0.06380331205658062, 0.06380331205658062,
            ]);

            await view.delete();
            await table.delete();
        });

        test("standard deviation", async function () {
            const table = await perspective.table(float_data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "stddev" },
            });

            const result = await view.to_columns();

            // using np.std()
            const expected = [
                0.33597085443953206, 0.35043269693156814, 0.22510197203101087,
                0.20827220910070432, 0.3473746254711007, 0.3618418050868363,
            ];

            // Check we are within 6 digits of the result from np.std()
            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("standard deviation multi-pivot", async function () {
            const table = await perspective.table({
                x: [
                    0.62817744, 0.16903811, 0.77902867, 0.92330087, 0.10583306,
                    0.59794354,
                ],
                y: ["a", "a", "b", "b", "c", "c"],
                z: [1, 1, 1, 1, 1, 1],
            });
            const view = await table.view({
                group_by: ["y", "z"],
                columns: ["x"],
                aggregates: { x: "stddev" },
            });

            const result = await view.to_columns();

            // using np.std()
            const expected = [
                0.3002988555851961, 0.22956966499999998, 0.22956966499999998,
                0.07213610000000004, 0.07213610000000004, 0.24605524,
                0.24605524,
            ];

            // Check we are within 6 digits of the result from np.std()
            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("standard deviation append", async function () {
            const table = await perspective.table(float_data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "stddev" },
            });

            let result = await view.to_columns();

            // using np.std()
            const expected = [
                0.33597085443953206, 0.35043269693156814, 0.22510197203101087,
                0.20827220910070432, 0.3473746254711007, 0.3618418050868363,
            ];

            // Check we are within 6 digits of the result from np.std()
            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            table.update([{ x: 0.64294039, y: "a" }]);
            result = await view.to_columns();

            const expected2 = [
                0.32935140956170517, 0.32031993493462224, 0.22510197203101087,
                0.20827220910070432, 0.3473746254711007, 0.3618418050868363,
            ];
            // Check we are within 6 digits of the result from np.std()
            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected2[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("standard deviation partial update", async function () {
            const table = await perspective.table(
                {
                    x: [
                        0.99098243, 0.36677191, 0.58926465, 0.95701263,
                        0.96904283, 0.50398721,
                    ],
                    y: ["a", "a", "b", "b", "c", "c"],
                    z: [1, 2, 3, 4, 5, 6],
                },
                { index: "z" }
            );

            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "stddev" },
            });

            let result = await view.to_columns();

            // using np.std()
            const expected = [
                0.25153179517283897, 0.31210526, 0.18387399000000004,
                0.23252781,
            ];

            // Check we are within 6 digits of the result from np.std()
            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected[i], 6);
            }

            table.update([{ x: 0.284169685, z: 3 }]);
            result = await view.to_columns();

            const expected2 = [
                0.3007643174035643, 0.31210526, 0.33642147250000004, 0.23252781,
            ];

            // Check we are within 6 digits of the result from np.std()
            for (let i = 0; i < result.x.length; i++) {
                expect(result.x[i]).toBeCloseTo(expected2[i], 6);
            }

            await view.delete();
            await table.delete();
        });

        test("standard deviation of range", async function () {
            const float_data_copy = JSON.parse(JSON.stringify(float_data));
            float_data_copy["y"] = Array(float_data_copy["x"].length).fill("a");

            const table = await perspective.table(float_data_copy);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "stddev" },
            });

            const result = await view.to_columns();

            // using np.std()
            const expected = [0.33597085443953206, 0.33597085443953206];
            expect(result.x).toEqual(expected);

            // using `std` function
            const expected2 = std(float_data["x"]);
            expect(expected[0]).toEqual(expected2);

            await view.delete();
            await table.delete();
        });

        test("standard deviation of size 1", async function () {
            const table = await perspective.table({
                x: [0.61801758],
                y: ["a"],
            });
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "stddev" },
            });

            const result = await view.to_columns();
            expect(result.x).toEqual([null, null]);

            await view.delete();
            await table.delete();
        });

        test("standard deviation of size 2", async function () {
            const table = await perspective.table({
                x: [0.61801758, 0.11283123],
                y: ["a", "a"],
            });
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "stddev" },
            });

            const result = await view.to_columns();
            expect(result.x).toEqual([0.252593175, 0.252593175]);

            await view.delete();
            await table.delete();
        });
    });

    test.describe("Aggregates with nulls", function () {
        test("mean", async function () {
            var table = await perspective.table([
                { x: 3, y: 1 },
                { x: 2, y: 1 },
                { x: null, y: 1 },
                { x: null, y: 1 },
                { x: 4, y: 2 },
                { x: null, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "mean" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 3 },
                { __ROW_PATH__: [1], x: 2.5 },
                { __ROW_PATH__: [2], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("mean with 0", async function () {
            var table = await perspective.table([
                { x: 3, y: 1 },
                { x: 3, y: 1 },
                { x: 0, y: 1 },
                { x: null, y: 1 },
                { x: null, y: 1 },
                { x: 4, y: 2 },
                { x: null, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "mean" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 2.5 },
                { __ROW_PATH__: [1], x: 2 },
                { __ROW_PATH__: [2], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("mean with 0.0 (floats)", async function () {
            var table = await perspective.table({ x: "float", y: "integer" });
            table.update([
                { x: 3, y: 1 },
                { x: 3, y: 1 },
                { x: 0, y: 1 },
                { x: null, y: 1 },
                { x: null, y: 1 },
                { x: 4, y: 2 },
                { x: null, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "mean" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 2.5 },
                { __ROW_PATH__: [1], x: 2 },
                { __ROW_PATH__: [2], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("sum", async function () {
            var table = await perspective.table([
                { x: 3, y: 1 },
                { x: 2, y: 1 },
                { x: null, y: 1 },
                { x: null, y: 1 },
                { x: 4, y: 2 },
                { x: null, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
            });
            var answer = [
                { __ROW_PATH__: [], x: 9 },
                { __ROW_PATH__: [1], x: 5 },
                { __ROW_PATH__: [2], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("abs sum", async function () {
            var table = await perspective.table([
                { x: 3, y: 1 },
                { x: 2, y: 1 },
                { x: null, y: 1 },
                { x: null, y: 1 },
                { x: -4, y: 2 },
                { x: null, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "abs sum" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 1 },
                { __ROW_PATH__: [1], x: 5 },
                { __ROW_PATH__: [2], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("mean after update", async function () {
            var table = await perspective.table([
                { x: 3, y: 1 },
                { x: null, y: 1 },
                { x: null, y: 2 },
            ]);
            table.update([
                { x: 2, y: 1 },
                { x: null, y: 1 },
                { x: 4, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "mean" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 3 },
                { __ROW_PATH__: [1], x: 2.5 },
                { __ROW_PATH__: [2], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("mean at aggregate level", async function () {
            var table = await perspective.table([
                { x: 4, y: 1, z: "a" },
                { x: null, y: 1, z: "a" },
                { x: null, y: 2, z: "a" },
            ]);
            table.update([
                { x: 1, y: 1, z: "b" },
                { x: 1, y: 1, z: "b" },
                { x: null, y: 1, z: "b" },
                { x: 4, y: 2, z: "b" },
                { x: null, y: 2, z: "b" },
            ]);
            table.update([
                { x: 2, y: 2, z: "c" },
                { x: 3, y: 2, z: "c" },
                { x: null, y: 2, z: "c" },
                { x: 7, y: 2, z: "c" },
            ]);
            var view = await table.view({
                group_by: ["y", "z"],
                columns: ["x"],
                aggregates: { x: "mean" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 3.142857142857143 },
                { __ROW_PATH__: [1], x: 2 },
                { __ROW_PATH__: [1, "a"], x: 4 },
                { __ROW_PATH__: [1, "b"], x: 1 },
                { __ROW_PATH__: [2], x: 4 },
                { __ROW_PATH__: [2, "a"], x: null },
                { __ROW_PATH__: [2, "b"], x: 4 },
                { __ROW_PATH__: [2, "c"], x: 4 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("null in pivot column", async function () {
            var table = await perspective.table([
                { x: null },
                { x: "x" },
                { x: "y" },
            ]);
            var view = await table.view({
                group_by: ["x"],
                columns: ["x"],
                aggregates: { x: "distinct count" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 3 },
                { __ROW_PATH__: [null], x: 1 },
                { __ROW_PATH__: ["x"], x: 1 },
                { __ROW_PATH__: ["y"], x: 1 },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("weighted mean", async function () {
            var table = await perspective.table([
                { a: "a", x: 1, y: 200 },
                { a: "a", x: 2, y: 100 },
                { a: "a", x: 3, y: null },
            ]);
            var view = await table.view({
                group_by: ["a"],
                aggregates: { y: ["weighted mean", "x"] },
                columns: ["y"],
            });
            var answer = [
                { __ROW_PATH__: [], y: (1 * 200 + 2 * 100) / (1 + 2) },
                { __ROW_PATH__: ["a"], y: (1 * 200 + 2 * 100) / (1 + 2) },
            ];
            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });
    });

    test.describe("Aggregates with negatives", function () {
        test("sum abs", async function () {
            var table = await perspective.table([
                { x: 3, y: 1 },
                { x: 2, y: 1 },
                { x: 1, y: 1 },
                { x: -1, y: 1 },
                { x: -2, y: 2 },
                { x: -3, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "sum abs" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 12 },
                { __ROW_PATH__: [1], x: 7 },
                { __ROW_PATH__: [2], x: 5 },
            ];
            let result = await view.to_json();
            expect(answer).toEqual(result);
            view.delete();
            table.delete();
        });

        test("abs sum", async function () {
            var table = await perspective.table([
                { x: 3, y: 1 },
                { x: 2, y: 1 },
                { x: -1, y: 1 },
                { x: -1, y: 1 },
                { x: -2, y: 2 },
                { x: -3, y: 2 },
            ]);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "abs sum" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 2 },
                { __ROW_PATH__: [1], x: 3 },
                { __ROW_PATH__: [2], x: 5 },
            ];
            let result = await view.to_json();
            expect(answer).toEqual(result);
            view.delete();
            table.delete();
        });
    });

    test.describe("Group by", function () {
        test("['x']", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x"],
                aggregates: { y: "distinct count", z: "distinct count" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 10, y: 4, z: 2 },
                { __ROW_PATH__: [1], x: 1, y: 1, z: 1 },
                { __ROW_PATH__: [2], x: 2, y: 1, z: 1 },
                { __ROW_PATH__: [3], x: 3, y: 1, z: 1 },
                { __ROW_PATH__: [4], x: 4, y: 1, z: 1 },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['x'] test update pkey column", async function () {
            const schema = {
                id: "integer",
                name: "string",
                chg: "float",
                pos: "integer",
            };
            const rec1 = [
                { id: 1, name: "John", pos: 100, chg: 1 },
                { id: 2, name: "Mary", pos: 200, chg: 2 },
                { id: 3, name: "Tom", pos: 300, chg: 3 },
            ];
            const table = await perspective.table(schema, { index: "id" });
            table.update(rec1);
            let view = await table.view({
                group_by: ["id"],
                columns: ["pos"],
            });
            let rec2 = [{ id: 1, chg: 3 }];
            table.update(rec2);
            let result2 = await view.to_json();
            var answer = [
                { __ROW_PATH__: [], pos: 600 },
                { __ROW_PATH__: [1], pos: 100 },
                { __ROW_PATH__: [2], pos: 200 },
                { __ROW_PATH__: [3], pos: 300 },
            ];
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test.describe("pivoting on column containing null values", function () {
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
        });

        test("['x'] has a schema", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x"],
            });
            let result2 = await view.schema();
            expect(result2).toEqual({
                x: "integer",
                y: "integer",
                z: "integer",
            });
            view.delete();
            table.delete();
        });

        test("['x'] translates type `string` to `integer` when pivoted by row", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x"],
                columns: ["y"],
                aggregates: { y: "distinct count" },
            });
            let result2 = await view.schema();
            expect(result2).toEqual({ y: "integer" });
            view.delete();
            table.delete();
        });

        test("['x'] translates type `integer` to `float` when pivoted by row", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: "avg" },
            });
            let result2 = await view.schema();
            expect(result2).toEqual({ x: "float" });
            view.delete();
            table.delete();
        });

        test("['x'] does not translate type when only pivoted by column", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["y"],
                columns: ["x"],
                aggregates: { x: "avg" },
            });
            let result2 = await view.schema();
            expect(result2).toEqual({ x: "integer" });
            view.delete();
            table.delete();
        });

        test("['x'] has the correct # of rows", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x"],
            });
            let result2 = await view.num_rows();
            expect(result2).toEqual(5);
            view.delete();
            table.delete();
        });

        test("['x'] has the correct # of columns", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x"],
            });
            let result2 = await view.num_columns();
            expect(result2).toEqual(3);
            view.delete();
            table.delete();
        });

        test("Group By by date column results in correct headers", async function () {
            var table = await perspective.table({
                a: [
                    new Date("2020/01/15"),
                    new Date("2020/02/15"),
                    new Date("2020/03/15"),
                    new Date("2020/04/15"),
                    new Date("2020/05/15"),
                    new Date("2020/06/15"),
                    new Date("2020/07/15"),
                    new Date("2020/08/15"),
                    new Date("2020/09/15"),
                    new Date("2020/10/15"),
                    new Date("2020/11/15"),
                    new Date("2020/12/15"),
                ],
                b: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            });
            var view = await table.view({
                group_by: ["a"],
            });
            const results = await view.to_columns();
            expect(results).toEqual({
                __ROW_PATH__: [
                    [],
                    [1579046400000],
                    [1581724800000],
                    [1584230400000],
                    [1586908800000],
                    [1589500800000],
                    [1592179200000],
                    [1594771200000],
                    [1597449600000],
                    [1600128000000],
                    [1602720000000],
                    [1605398400000],
                    [1607990400000],
                ],
                a: [12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                b: [78, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            });

            const dates = results["__ROW_PATH__"];
            let date_results = [];
            const expected = [
                new Date("2020/01/15"),
                new Date("2020/02/15"),
                new Date("2020/03/15"),
                new Date("2020/04/15"),
                new Date("2020/05/15"),
                new Date("2020/06/15"),
                new Date("2020/07/15"),
                new Date("2020/08/15"),
                new Date("2020/09/15"),
                new Date("2020/10/15"),
                new Date("2020/11/15"),
                new Date("2020/12/15"),
            ];

            for (const d of dates) {
                if (d[0]) {
                    date_results.push(new Date(d[0]));
                }
            }

            expect(date_results).toEqual(expected);

            view.delete();
            table.delete();
        });

        test("['z']", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                aggregates: { y: "distinct count", z: "distinct count" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 10, y: 4, z: 2 },
                { __ROW_PATH__: [false], x: 6, y: 2, z: 1 },
                { __ROW_PATH__: [true], x: 4, y: 2, z: 1 },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['x', 'z']", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x", "z"],
                aggregates: { y: "distinct count", z: "distinct count" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 10, y: 4, z: 2 },
                { __ROW_PATH__: [1], x: 1, y: 1, z: 1 },
                { __ROW_PATH__: [1, true], x: 1, y: 1, z: 1 },
                { __ROW_PATH__: [2], x: 2, y: 1, z: 1 },
                { __ROW_PATH__: [2, false], x: 2, y: 1, z: 1 },
                { __ROW_PATH__: [3], x: 3, y: 1, z: 1 },
                { __ROW_PATH__: [3, true], x: 3, y: 1, z: 1 },
                { __ROW_PATH__: [4], x: 4, y: 1, z: 1 },
                { __ROW_PATH__: [4, false], x: 4, y: 1, z: 1 },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['x', 'z'] windowed", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x", "z"],
            });
            var answer = [
                { __ROW_PATH__: [1, true], x: 1, y: 1, z: 1 },
                { __ROW_PATH__: [2], x: 2, y: 1, z: 1 },
                { __ROW_PATH__: [2, false], x: 2, y: 1, z: 1 },
                { __ROW_PATH__: [3], x: 3, y: 1, z: 1 },
                { __ROW_PATH__: [3, true], x: 3, y: 1, z: 1 },
                { __ROW_PATH__: [4], x: 4, y: 1, z: 1 },
                { __ROW_PATH__: [4, false], x: 4, y: 1, z: 1 },
            ];
            let result2 = await view.to_json({ start_row: 2 });
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['x', 'z'], pivot_depth = 1", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x", "z"],
                group_by_depth: 1,
                aggregates: { y: "distinct count", z: "distinct count" },
            });
            var answer = [
                { __ROW_PATH__: [], x: 10, y: 4, z: 2 },
                { __ROW_PATH__: [1], x: 1, y: 1, z: 1 },
                { __ROW_PATH__: [2], x: 2, y: 1, z: 1 },
                { __ROW_PATH__: [3], x: 3, y: 1, z: 1 },
                { __ROW_PATH__: [4], x: 4, y: 1, z: 1 },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });
    });

    test.describe("Split by", function () {
        test("['y'] only, schema", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["y"],
            });
            let result2 = await view.schema();
            expect(result2).toEqual(meta);
            view.delete();
            table.delete();
        });

        test("['z'] only, datetime column", async function () {
            var table = await perspective.table(data_8);
            var view = await table.view({
                split_by: ["z"],
                columns: ["x", "y"],
            });
            let result2 = await view.to_columns();

            expect(result2).toEqual({
                "2019-04-11 23:40:35.065|x": [null, null, 3, 4],
                "2019-04-11 23:40:35.065|y": [null, null, "c", "d"],
                "2019-04-13 03:27:15.065|x": [1, 2, null, null],
                "2019-04-13 03:27:15.065|y": ["a", "b", null, null],
            });

            view.delete();
            table.delete();
        });

        test("['x'] only, column-oriented input", async function () {
            var table = await perspective.table(data_7);
            var view = await table.view({
                split_by: ["z"],
            });
            let result2 = await view.to_json();
            expect(result2).toEqual([
                {
                    "true|w": 1.5,
                    "true|x": 1,
                    "true|y": "a",
                    "true|z": true,
                    "false|w": null,
                    "false|x": null,
                    "false|y": null,
                    "false|z": null,
                },
                {
                    "true|w": null,
                    "true|x": null,
                    "true|y": null,
                    "true|z": null,
                    "false|w": 2.5,
                    "false|x": 2,
                    "false|y": "b",
                    "false|z": false,
                },
                {
                    "true|w": 3.5,
                    "true|x": 3,
                    "true|y": "c",
                    "true|z": true,
                    "false|w": null,
                    "false|x": null,
                    "false|y": null,
                    "false|z": null,
                },
                {
                    "true|w": null,
                    "true|x": null,
                    "true|y": null,
                    "true|z": null,
                    "false|w": 4.5,
                    "false|x": 4,
                    "false|y": "d",
                    "false|z": false,
                },
            ]);
            view.delete();
            table.delete();
        });

        test("['z'] only, column-oriented output", async function () {
            var table = await perspective.table(data_7);
            var view = await table.view({
                split_by: ["z"],
            });
            let result2 = await view.to_columns();
            expect(result2).toEqual({
                "true|w": [1.5, null, 3.5, null],
                "true|x": [1, null, 3, null],
                "true|y": ["a", null, "c", null],
                "true|z": [true, null, true, null],
                "false|w": [null, 2.5, null, 4.5],
                "false|x": [null, 2, null, 4],
                "false|y": [null, "b", null, "d"],
                "false|z": [null, false, null, false],
            });
            view.delete();
            table.delete();
        });

        test("['y'] only sorted by ['x'] desc", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["y"],
                sort: [["x", "desc"]],
            });
            var answer = [
                {
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": 4,
                    "d|y": "d",
                    "d|z": false,
                },
                {
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": 3,
                    "c|y": "c",
                    "c|z": true,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": 2,
                    "b|y": "b",
                    "b|z": false,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    "a|x": 1,
                    "a|y": "a",
                    "a|z": true,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['y'] only", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["y"],
            });
            var answer = [
                {
                    "a|x": 1,
                    "a|y": "a",
                    "a|z": true,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": 2,
                    "b|y": "b",
                    "b|z": false,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": 3,
                    "c|y": "c",
                    "c|z": true,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": 4,
                    "d|y": "d",
                    "d|z": false,
                },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['x'] by ['y']", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["y"],
                group_by: ["x"],
            });
            var answer = [
                {
                    __ROW_PATH__: [],
                    "a|x": 1,
                    "a|y": 1,
                    "a|z": 1,
                    "b|x": 2,
                    "b|y": 1,
                    "b|z": 1,
                    "c|x": 3,
                    "c|y": 1,
                    "c|z": 1,
                    "d|x": 4,
                    "d|y": 1,
                    "d|z": 1,
                },
                {
                    __ROW_PATH__: [1],
                    "a|x": 1,
                    "a|y": 1,
                    "a|z": 1,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    __ROW_PATH__: [2],
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": 2,
                    "b|y": 1,
                    "b|z": 1,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    __ROW_PATH__: [3],
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": 3,
                    "c|y": 1,
                    "c|z": 1,
                    "d|x": null,
                    "d|y": null,
                    "d|z": null,
                },
                {
                    __ROW_PATH__: [4],
                    "a|x": null,
                    "a|y": null,
                    "a|z": null,
                    "b|x": null,
                    "b|y": null,
                    "b|z": null,
                    "c|x": null,
                    "c|y": null,
                    "c|z": null,
                    "d|x": 4,
                    "d|y": 1,
                    "d|z": 1,
                },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['x', 'z']", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["x", "z"],
                columns: ["y"],
            });
            let result2 = await view.to_json();
            expect(result2).toEqual([
                {
                    "1|true|y": "a",
                    "2|false|y": null,
                    "3|true|y": null,
                    "4|false|y": null,
                },
                {
                    "1|true|y": null,
                    "2|false|y": "b",
                    "3|true|y": null,
                    "4|false|y": null,
                },
                {
                    "1|true|y": null,
                    "2|false|y": null,
                    "3|true|y": "c",
                    "4|false|y": null,
                },
                {
                    "1|true|y": null,
                    "2|false|y": null,
                    "3|true|y": null,
                    "4|false|y": "d",
                },
            ]);
            view.delete();
            table.delete();
        });
    });

    test.describe("Expand/Collapse", function () {
        test("Collapse a row in a 2x2 pivot", async function () {
            var table = await perspective.table([
                { x: 7, y: "A", z: true, a: "AA", b: "BB", c: "CC" },
                { x: 2, y: "A", z: false, a: "AA", b: "CC", c: "CC" },
                { x: 5, y: "A", z: true, a: "AA", b: "BB", c: "DD" },
                { x: 4, y: "A", z: false, a: "AA", b: "CC", c: "DD" },
                { x: 1, y: "B", z: true, a: "AA", b: "BB", c: "CC" },
                { x: 8, y: "B", z: false, a: "AA", b: "CC", c: "CC" },
                { x: 3, y: "B", z: true, a: "BB", b: "BB", c: "DD" },
                { x: 6, y: "B", z: false, a: "BB", b: "CC", c: "DD" },
                { x: 9, y: "C", z: true, a: "BB", b: "BB", c: "CC" },
                { x: 10, y: "C", z: false, a: "BB", b: "CC", c: "CC" },
                { x: 11, y: "C", z: true, a: "BB", b: "BB", c: "DD" },
                { x: 12, y: "C", z: false, a: "BB", b: "CC", c: "DD" },
            ]);
            var view = await table.view({
                split_by: ["z", "b"],
                group_by: ["y", "a"],
                columns: ["x"],
                aggregates: { x: "last" },
            });

            let answer = [
                { __ROW_PATH__: [], "false|CC|x": 12, "true|BB|x": 11 },
                { __ROW_PATH__: ["A"], "false|CC|x": 4, "true|BB|x": 5 },
                { __ROW_PATH__: ["A", "AA"], "false|CC|x": 4, "true|BB|x": 5 },
                { __ROW_PATH__: ["B"], "false|CC|x": 6, "true|BB|x": 3 },
                { __ROW_PATH__: ["C"], "false|CC|x": 12, "true|BB|x": 11 },
                {
                    __ROW_PATH__: ["C", "BB"],
                    "false|CC|x": 12,
                    "true|BB|x": 11,
                },
            ];
            view.collapse(3);
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });
    });

    test.describe("Split by w/sort", function () {
        test("['y'] by ['z'], sorted by 'x'", async function () {
            var table = await perspective.table([
                { x: 7, y: "A", z: true },
                { x: 2, y: "A", z: false },
                { x: 5, y: "A", z: true },
                { x: 4, y: "A", z: false },
                { x: 1, y: "B", z: true },
                { x: 8, y: "B", z: false },
                { x: 3, y: "B", z: true },
                { x: 6, y: "B", z: false },
                { x: 9, y: "C", z: true },
                { x: 10, y: "C", z: false },
                { x: 11, y: "C", z: true },
                { x: 12, y: "C", z: false },
            ]);
            var view = await table.view({
                split_by: ["z"],
                group_by: ["y"],
                sort: [["x", "desc"]],
                aggregates: { y: "distinct count", z: "distinct count" },
            });

            let answer = [
                {
                    __ROW_PATH__: [],
                    "false|x": 42,
                    "false|y": 3,
                    "false|z": 1,
                    "true|x": 36,
                    "true|y": 3,
                    "true|z": 1,
                },
                {
                    __ROW_PATH__: ["C"],
                    "false|x": 22,
                    "false|y": 1,
                    "false|z": 1,
                    "true|x": 20,
                    "true|y": 1,
                    "true|z": 1,
                },
                {
                    __ROW_PATH__: ["A"],
                    "false|x": 6,
                    "false|y": 1,
                    "false|z": 1,
                    "true|x": 12,
                    "true|y": 1,
                    "true|z": 1,
                },
                {
                    __ROW_PATH__: ["B"],
                    "false|x": 14,
                    "false|y": 1,
                    "false|z": 1,
                    "true|x": 4,
                    "true|y": 1,
                    "true|z": 1,
                },
            ];
            let result2 = await view.to_json();
            expect(result2).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("['z'] by ['y'], sorted by 'y'", async function () {
            var table = await perspective.table([
                { x: 7, y: "A", z: true },
                { x: 2, y: "A", z: false },
                { x: 5, y: "A", z: true },
                { x: 4, y: "A", z: false },
                { x: 1, y: "B", z: true },
                { x: 8, y: "B", z: false },
                { x: 3, y: "B", z: true },
                { x: 6, y: "B", z: false },
                { x: 9, y: "C", z: true },
                { x: 10, y: "C", z: false },
                { x: 11, y: "C", z: true },
                { x: 12, y: "C", z: false },
            ]);
            var view = await table.view({
                split_by: ["y"],
                group_by: ["z"],
                sort: [["y", "col desc"]],
                columns: ["x", "y"],
                aggregates: { x: "sum", y: "any" },
            });

            let result2 = await view.to_columns();
            expect(Object.keys(result2)).toEqual([
                "__ROW_PATH__",
                "C|x",
                "C|y",
                "B|x",
                "B|y",
                "A|x",
                "A|y",
            ]);
            view.delete();
            table.delete();
        });

        test("['y'] by ['x'] sorted by ['x'] desc has the correct # of columns", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["y"],
                group_by: ["x"],
                sort: [["x", "desc"]],
            });
            let num_cols = await view.num_columns();
            expect(num_cols).toEqual(12);
            view.delete();
            table.delete();
        });
    });

    test.describe("Pivot table operations", function () {
        test("Should not expand past number of group by", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["x"],
                split_by: ["y"],
            });
            var expanded_idx = await view.expand(2);
            // invalid expands return the index
            expect(expanded_idx).toEqual(2);
        });
    });

    test.describe("Column paths", function () {
        test("Should return all columns, 0-sided view from schema", async function () {
            const table = await perspective.table(meta);
            const view = await table.view();
            const paths = await view.column_paths();
            expect(paths).toEqual(["x", "y", "z"]);
            view.delete();
            table.delete();
        });

        test("Should return all columns in specified order, 0-sided view from schema", async function () {
            const table = await perspective.table(meta);
            const view = await table.view({
                columns: ["z", "y", "x"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["z", "y", "x"]);
            view.delete();
            table.delete();
        });

        test("Should return specified visible columns, 0-sided view from schema", async function () {
            const table = await perspective.table(meta);
            const view = await table.view({
                columns: ["x"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["x"]);
            view.delete();
            table.delete();
        });

        test("Should return all columns, 0-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view();
            const paths = await view.column_paths();
            expect(paths).toEqual(["x", "y", "z"]);
            view.delete();
            table.delete();
        });

        test("Should return all columns in specified order, 0-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["z", "y", "x"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["z", "y", "x"]);
            view.delete();
            table.delete();
        });

        test("Should return specified visible columns, 0-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["x"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["x"]);
            view.delete();
            table.delete();
        });

        test("Should return all columns with __ROW_PATH__, 1-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["x"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["__ROW_PATH__", "x", "y", "z"]);
            view.delete();
            table.delete();
        });

        test("Should return numerical column names in the correct order, 1-sided view", async function () {
            const table = await perspective.table({
                2345: [0, 1, 2, 3],
                1.23456789: [0, 1, 2, 3],
                1234: [1, 2, 3, 4],
                x: [5, 6, 7, 8],
            });

            // Previously, we iterated through the aggregates map using the
            // order given in Object.keys() which meant that column names that
            // were parsable as numbers automatically ended up at the front of
            // the map. This test makes sure that column orders are respected
            // by the engine for all column names.
            const view = await table.view({
                group_by: ["x"],
                columns: ["2345", "1234", "x", "1.23456789"],
                aggregates: {
                    x: "sum",
                    1234: "sum",
                },
            });
            const paths = await view.column_paths();
            expect(paths).toEqual([
                "__ROW_PATH__",
                "2345",
                "1234",
                "x",
                "1.23456789",
            ]);
            view.delete();
            table.delete();
        });

        test("Should return all columns in specified order, 1-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["x"],
                columns: ["z", "y", "x"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["__ROW_PATH__", "z", "y", "x"]);
            view.delete();
            table.delete();
        });

        test("Should return specified visible columns with __ROW_PATH__, 1-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["x"],
                group_by: ["x"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["__ROW_PATH__", "x"]);
            view.delete();
            table.delete();
        });

        test("Should return all columns with __ROW_PATH__, 2-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["x"],
                split_by: ["y"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual([
                "__ROW_PATH__",
                "a|x",
                "a|y",
                "a|z",
                "b|x",
                "b|y",
                "b|z",
                "c|x",
                "c|y",
                "c|z",
                "d|x",
                "d|y",
                "d|z",
            ]);
            view.delete();
            table.delete();
        });

        test("Should return specified visible columns with __ROW_PATH__, 2-sided view", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["z", "y", "x"],
                group_by: ["x"],
                split_by: ["y"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual([
                "__ROW_PATH__",
                "a|z",
                "a|y",
                "a|x",
                "b|z",
                "b|y",
                "b|x",
                "c|z",
                "c|y",
                "c|x",
                "d|z",
                "d|y",
                "d|x",
            ]);
            view.delete();
            table.delete();
        });

        test("Should return specified visible columns with __ROW_PATH__, 2-sided view variant", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["x"],
                group_by: ["x"],
                split_by: ["y"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["__ROW_PATH__", "a|x", "b|x", "c|x", "d|x"]);
            view.delete();
            table.delete();
        });

        test("Should format date columns in split_by", async function () {
            const table = await perspective.table({
                w: "float",
                x: "integer",
                y: "string",
                z: "date",
            });

            await table.update(data_8);
            const view = await table.view({ group_by: ["y"], split_by: ["z"] });
            const paths = await view.column_paths();
            expect(paths).toEqual([
                "__ROW_PATH__",
                "2019-04-11|w",
                "2019-04-11|x",
                "2019-04-11|y",
                "2019-04-11|z",
                "2019-04-13|w",
                "2019-04-13|x",
                "2019-04-13|y",
                "2019-04-13|z",
            ]);

            view.delete();
            table.delete();
        });
    });
})(perspective);
