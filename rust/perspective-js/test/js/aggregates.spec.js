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

var data = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
];

var data3 = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
    { x: 5, y: "a", z: true },
    { x: 6, y: "b", z: false },
    { x: 7, y: "c", z: true },
    { x: 8, y: "d", z: false },
    { x: 9, y: "a", z: true },
    { x: 10, y: "b", z: false },
    { x: 11, y: "c", z: true },
    { x: 12, y: "d", z: false },
    { x: 13, y: "a", z: true },
    { x: 14, y: "b", z: false },
    { x: 15, y: "c", z: true },
    { x: 16, y: "d", z: false },
];

var data4 = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
    { x: 5, y: "a", z: true },
    { x: 6, y: "b", z: false },
    { x: 7, y: "c", z: true },
    { x: 8, y: "d", z: false },
    { x: 9, y: "a", z: true },
    { x: 10, y: "b", z: false },
    { x: 11, y: "c", z: true },
    { x: 12, y: "d", z: false },
    { x: 13, y: "a", z: true },
    { x: 14, y: "b", z: false },
    { x: 15, y: "c", z: true },
    { x: 16, y: "d", z: false },
    { x: 17, y: "e", z: true },
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
        test.skip("old `aggregate` syntax is backwards compatible", async function () {
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
            expect(paths).toEqual(["y", "z"]);
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

        test("`first` aggregate with a hidden sort column does not crash", async function () {
            const table = await perspective.table([
                { g: "x", v: 1 },
                { g: "x", v: 2 },
                { g: "y", v: 3 },
            ]);
            const view = await table.view({
                group_by: ["g"],
                columns: ["g"],
                aggregates: { v: "first" },
                sort: [["v", "desc"]],
            });

            const result = await view.to_json();
            const paths = result.map((r) => r.__ROW_PATH__);
            expect(paths.length).toEqual(3);
            expect(paths).toContainEqual([]);
            expect(paths).toContainEqual(["x"]);
            expect(paths).toContainEqual(["y"]);
            await view.delete();
            await table.delete();
        });

        test("`max by` with a non-visible by-column", async function () {
            const table = await perspective.table([
                { g: "x", v: 1, w: 10 },
                { g: "x", v: 2, w: 20 },
                { g: "y", v: 3, w: 5 },
            ]);
            const view = await table.view({
                group_by: ["g"],
                columns: ["v"],
                aggregates: { v: ["max by", ["w"]] },
            });

            const result = await view.to_json();
            // `max by` picks the `v` at the row with the maximum `w`.
            expect(result).toEqual([
                { __ROW_PATH__: [], v: 2 },
                { __ROW_PATH__: ["x"], v: 2 },
                { __ROW_PATH__: ["y"], v: 3 },
            ]);
            await view.delete();
            await table.delete();
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
            expect(paths).toEqual(["y", "z"]);
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
                aggregates: { x: ["weighted mean", ["y"]] },
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

        test("['z'], weighted mean by expression", async function () {
            var table = await perspective.table(data2);
            var view = await table.view({
                group_by: ["z"],
                aggregates: { x: ["weighted mean", ["q"]] },
                expressions: { q: `"y"` },
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
                aggregates: { x: ["weighted mean", ["y"]] },
            });

            const answer = [
                { __ROW_PATH__: [], x: 2.8333333333333335 },
                { __ROW_PATH__: [false], x: 3.3333333333333335 },
                { __ROW_PATH__: [true], x: 2.3333333333333335 },
            ];

            await table.update(data2);

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

            await table.update(data);

            let result = await view.to_json();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test.describe("median and quartiles", function () {
            test.describe("integer", function () {
                test("['z'] with 16 integer elements", async function () {
                    var table = await perspective.table(data3);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "median" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 9 },
                        { __ROW_PATH__: [false], x: 10 },
                        { __ROW_PATH__: [true], x: 9 },
                    ];

                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });

                test("['z'] with 16 elements, q1", async function () {
                    var table = await perspective.table(data3);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "q1" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 5 },
                        { __ROW_PATH__: [false], x: 6 },
                        { __ROW_PATH__: [true], x: 5 },
                    ];

                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });

                test("['z'] with 16 elements, q3", async function () {
                    var table = await perspective.table(data3);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "q3" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 13 },
                        { __ROW_PATH__: [false], x: 14 },
                        { __ROW_PATH__: [true], x: 13 },
                    ];

                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });
            });

            test.describe("float", function () {
                test("['z'] with 16 elements, median", async function () {
                    var table = await perspective.table({
                        x: "float",
                        y: "string",
                        z: "boolean",
                    });

                    await table.update(data3);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "median" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 8.5 },
                        { __ROW_PATH__: [false], x: 9 },
                        { __ROW_PATH__: [true], x: 8 },
                    ];
                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });

                test("['z'] with 16 elements, q1", async function () {
                    var table = await perspective.table({
                        x: "float",
                        y: "string",
                        z: "boolean",
                    });

                    await table.update(data3);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "q1" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 4.5 },
                        { __ROW_PATH__: [false], x: 5 },
                        { __ROW_PATH__: [true], x: 4 },
                    ];
                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });

                test("['z'] with 16 elements, q3", async function () {
                    var table = await perspective.table({
                        x: "float",
                        y: "string",
                        z: "boolean",
                    });

                    await table.update(data3);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "q3" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 12.5 },
                        { __ROW_PATH__: [false], x: 13 },
                        { __ROW_PATH__: [true], x: 12 },
                    ];
                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });

                test("['z'] with 17 elements, median", async function () {
                    var table = await perspective.table({
                        x: "float",
                        y: "string",
                        z: "boolean",
                    });

                    await table.update(data4);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "median" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 9 },
                        { __ROW_PATH__: [false], x: 9 },
                        { __ROW_PATH__: [true], x: 9 },
                    ];
                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });

                test("['z'] with 17 elements, q1", async function () {
                    var table = await perspective.table({
                        x: "float",
                        y: "string",
                        z: "boolean",
                    });

                    await table.update(data4);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "q1" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 5 },
                        { __ROW_PATH__: [false], x: 5 },
                        { __ROW_PATH__: [true], x: 5 },
                    ];
                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });

                test("['z'] with 17 elements, q3", async function () {
                    var table = await perspective.table({
                        x: "float",
                        y: "string",
                        z: "boolean",
                    });

                    await table.update(data4);
                    var view = await table.view({
                        group_by: ["z"],
                        columns: ["x"],
                        aggregates: { x: "q3" },
                    });

                    var answer = [
                        { __ROW_PATH__: [], x: 13 },
                        { __ROW_PATH__: [false], x: 13 },
                        { __ROW_PATH__: [true], x: 13 },
                    ];
                    let result = await view.to_json();
                    expect(result).toEqual(answer);
                    view.delete();
                    table.delete();
                });
            });
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
            await table.update({
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
                { index: "y" },
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
            await table.update({
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
                { index: "y" },
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
            await table.update({
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
            await table.update({
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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1]);

            await table.update({
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

        test("min", async () => {
            const data = {
                w: [1.5, 2.5, 3.5, 4.5],
                x: [1, 2, 3, 4],
                y: ["a", "b", "a", "b"],
                z: [
                    new Date(1555126035065),
                    new Date(1555126035065),
                    new Date(1555026035065),
                    new Date(1555026035065),
                ],
            };

            const table = await perspective.table(data);
            const view = await table.view({
                aggregates: {
                    w: "min",
                    x: "min",
                    y: "min",
                    z: "min",
                },
                group_by: ["y"],
            });

            const cols = await view.to_columns();
            expect(cols).toEqual({
                __ROW_PATH__: [[], ["a"], ["b"]],
                w: [1.5, 1.5, 2.5],
                x: [1, 1, 2],
                y: ["a", "a", "b"],
                z: [1555026035065, 1555026035065, 1555026035065],
            });

            await view.delete();
            await table.delete();
        });

        test("max", async () => {
            const data = {
                w: [1.5, 2.5, 3.5, 4.5],
                x: [1, 2, 3, 4],
                y: ["a", "b", "a", "b"],
                z: [
                    new Date(1555126035065),
                    new Date(1555126035065),
                    new Date(1555026035065),
                    new Date(1555026035065),
                ],
            };

            const table = await perspective.table(data);
            const view = await table.view({
                aggregates: {
                    w: "max",
                    x: "max",
                    y: "max",
                    z: "max",
                },
                group_by: ["y"],
            });

            const cols = await view.to_columns();
            expect(cols).toEqual({
                __ROW_PATH__: [[], ["a"], ["b"]],
                w: [4.5, 3.5, 4.5],
                x: [4, 3, 4],
                y: ["b", "a", "b"],
                z: [1555126035065, 1555126035065, 1555126035065],
            });

            await view.delete();
            await table.delete();
        });

        test("max_by", async () => {
            const data = {
                a: [1, 2, 3, 4, 5, 6, 7, 8],
                b: [0, 1, 0, 1, 0, 1, 0, 1],
                c: ["h", "g", "f", "e", "d", "c", "b", "a"],
            };

            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["c"],
                aggregates: {
                    c: ["max by", ["a"]],
                },
                group_by: ["b"],
            });

            const cols = await view.to_columns();
            expect(cols).toEqual({
                __ROW_PATH__: [[], [0], [1]],
                c: ["a", "b", "a"],
            });

            await view.delete();
            await table.delete();
        });

        test("min_by", async () => {
            const data = {
                a: [1, 2, 3, 4, 5, 6, 7, 8],
                b: [0, 1, 0, 1, 0, 1, 0, 1],
                c: ["h", "g", "f", "e", "d", "c", "b", "a"],
            };

            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["c"],
                aggregates: {
                    c: ["min by", ["a"]],
                },
                group_by: ["b"],
            });

            const cols = await view.to_columns();
            expect(cols).toEqual({
                __ROW_PATH__: [[], [0], [1]],
                c: ["h", "h", "g"],
            });

            await view.delete();
            await table.delete();
        });

        test("max_by with empty filter", async () => {
            const data = {
                a: [1, 2, 3, 4, 5, 6, 7, 8],
                b: [0, 1, 0, 1, 0, 1, 0, 1],
                c: ["h", "g", "f", "e", "d", "c", "b", "a"],
            };

            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["c"],
                aggregates: {
                    c: ["max by", ["a"]],
                },
                group_by: ["b"],
                filter: [["b", ">", 2]],
            });

            const cols = await view.to_columns();
            expect(cols).toEqual({
                __ROW_PATH__: [[]],
                c: [""],
            });

            await view.delete();
            await table.delete();
        });

        test("max with empty filter", async () => {
            const data = {
                a: [1, 2, 3, 4, 5, 6, 7, 8],
                b: [0, 1, 0, 1, 0, 1, 0, 1],
                c: ["h", "g", "f", "e", "d", "c", "b", "a"],
            };

            const table = await perspective.table(data);
            const view = await table.view({
                columns: ["c"],
                aggregates: {
                    c: "max",
                },
                group_by: ["b"],
                filter: [["b", ">", 2]],
            });

            const cols = await view.to_columns();
            expect(cols).toEqual({
                __ROW_PATH__: [[]],
                c: [""],
            });

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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    y: [100],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([100, 100]);

            await table.update({
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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    y: [100],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([100, 100]);

            await table.update({
                x: ["b"],
                y: [101],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual([1, 1]);
            expect(result["y"]).toEqual([100, 101]);

            await table.update({
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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    y: [99],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([99, 99]);

            await table.update({
                y: [101],
                index: [1],
            });

            result = await view.to_columns();
            expect(result["x"]).toEqual([1, 1]);

            // FIXME: my assumption of the `low` aggregate is that it should
            // be the low of the group according to current data, but this seems
            // like it's storing a "global" low?
            expect(result["y"]).toEqual([99, 99]);

            await table.update({
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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1]);

            for (let i = 0; i < 100; i++) {
                await table.update({
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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1, 1]);

            for (let i = 0; i < 100; i++) {
                await table.update({
                    x: ["b"],
                    index: [1],
                });
            }

            result = await view.to_columns();
            expect(result["x"]).toEqual(["b", "b", "b"]);
            expect(result["y"]).toEqual([1, 1, 1]);

            for (let i = 2; i < 6; i++) {
                await table.update({
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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["y"]).toEqual([1, 1]);

            // y[0] becomes valid
            await table.update({
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
            await table.update({
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
                { index: "index" },
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
                await table.update({
                    x: ["a"],
                    index: [1],
                });
            }

            let result = await view.to_columns();
            expect(result["a|y"]).toEqual([1, 1]);

            await table.update({
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
                { index: "index" },
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

            await table.update({
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

            await table.update({
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

            await table.update({
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
                { index: "index" },
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

            await table.update({
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

            await table.update({
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

            await table.update({
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

            await table.update({
                x: ["b"],
                index: [1],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [null], ["A"]],
                x: ["b", "b", "a"],
                y: [2, 1, 1],
                index: [2, 1, 1],
            });

            await table.update({
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

            await table.update({
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
            await table.update({
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
            await table.update({
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

            await table.update([
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
                { index: "y" },
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

            await table.update({
                y: [4],
                z: ["a"],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], [100], [200]],
                x: [null, 100, 200],
                y: [null, null, null],
                z: ["a", "a", "a"],
            });

            await table.update({
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

            await table.update([{ x: 0.64294039, y: "a" }]);
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
                { index: "z" },
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

            await table.update([{ x: 0.284169685, z: 3 }]);
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
                (x) => Math.pow(x, 2),
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

            await table.update([{ x: 0.64294039, y: "a" }]);
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
                { index: "z" },
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

            await table.update([{ x: 0.284169685, z: 3 }]);
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
            await table.update([
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
            await table.update([
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
            await table.update([
                { x: 1, y: 1, z: "b" },
                { x: 1, y: 1, z: "b" },
                { x: null, y: 1, z: "b" },
                { x: 4, y: 2, z: "b" },
                { x: null, y: 2, z: "b" },
            ]);
            await table.update([
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
                aggregates: { y: ["weighted mean", ["x"]] },
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
})(perspective);
