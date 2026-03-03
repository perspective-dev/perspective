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

const data = {
    w: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5],
    x: [1, 2, 3, 4, 4, 3, 2, 1],
    y: ["a", "b", "c", "d", "a", "b", "c", "d"],
    z: [true, false, true, false, true, false, true, false],
};

((perspective) => {
    test.describe("group_rollup_mode", function () {
        test.describe("flat", function () {
            test("only emits leaves", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                });
                const json = await view.to_json();
                expect(json).toStrictEqual([
                    { __ROW_PATH__: ["a"], w: 7, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["b"], w: 9, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["c"], w: 11, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["d"], w: 13, x: 5, y: 2, z: 2 },
                ]);
                view.delete();
                table.delete();
            });

            test("num_rows returns leaf count", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                });
                const num_rows = await view.num_rows();
                expect(num_rows).toEqual(4);
                view.delete();
                table.delete();
            });

            test("to_columns works", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                });
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [["a"], ["b"], ["c"], ["d"]],
                    w: [7, 9, 11, 13],
                    x: [5, 5, 5, 5],
                    y: [2, 2, 2, 2],
                    z: [2, 2, 2, 2],
                });
                view.delete();
                table.delete();
            });

            test("sort asc", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                    sort: [["w", "asc"]],
                });
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [["a"], ["b"], ["c"], ["d"]],
                    w: [7, 9, 11, 13],
                    x: [5, 5, 5, 5],
                    y: [2, 2, 2, 2],
                    z: [2, 2, 2, 2],
                });
                view.delete();
                table.delete();
            });

            test("sort desc", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                    sort: [["w", "desc"]],
                });
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [["d"], ["c"], ["b"], ["a"]],
                    w: [13, 11, 9, 7],
                    x: [5, 5, 5, 5],
                    y: [2, 2, 2, 2],
                    z: [2, 2, 2, 2],
                });
                view.delete();
                table.delete();
            });

            test("sort with hidden column", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["y"],
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                    sort: [["x", "desc"]],
                });
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [["a"], ["b"], ["c"], ["d"]],
                    y: [2, 2, 2, 2],
                });
                view.delete();
                table.delete();
            });

            test("multi-level group_by", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y", "z"],
                    group_rollup_mode: "flat",
                });
                const json = await view.to_json();
                expect(json).toStrictEqual([
                    {
                        __ROW_PATH__: ["a", true],
                        w: 7,
                        x: 5,
                        y: 2,
                        z: 2,
                    },
                    {
                        __ROW_PATH__: ["b", false],
                        w: 9,
                        x: 5,
                        y: 2,
                        z: 2,
                    },
                    {
                        __ROW_PATH__: ["c", true],
                        w: 11,
                        x: 5,
                        y: 2,
                        z: 2,
                    },
                    {
                        __ROW_PATH__: ["d", false],
                        w: 13,
                        x: 5,
                        y: 2,
                        z: 2,
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("multi-level group_by with sort matches expanded tree order", async function () {
                const table = await perspective.table(data);
                const flat_view = await table.view({
                    group_by: ["y", "z"],
                    group_rollup_mode: "flat",
                    sort: [["w", "desc"]],
                });
                const flat_cols = await flat_view.to_columns();
                expect(flat_cols).toStrictEqual({
                    __ROW_PATH__: [
                        ["d", false],
                        ["c", true],
                        ["b", false],
                        ["a", true],
                    ],
                    w: [13, 11, 9, 7],
                    x: [5, 5, 5, 5],
                    y: [2, 2, 2, 2],
                    z: [2, 2, 2, 2],
                });
                flat_view.delete();
                table.delete();
            });

            test("with split_by", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    split_by: ["z"],
                    group_rollup_mode: "flat",
                });
                const json = await view.to_json();
                expect(json).toStrictEqual([
                    {
                        __ROW_PATH__: ["a"],
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 7,
                        "true|x": 5,
                        "true|y": 2,
                        "true|z": 2,
                    },
                    {
                        __ROW_PATH__: ["b"],
                        "false|w": 9,
                        "false|x": 5,
                        "false|y": 2,
                        "false|z": 2,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                    {
                        __ROW_PATH__: ["c"],
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 11,
                        "true|x": 5,
                        "true|y": 2,
                        "true|z": 2,
                    },
                    {
                        __ROW_PATH__: ["d"],
                        "false|w": 13,
                        "false|x": 5,
                        "false|y": 2,
                        "false|z": 2,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("split_by only", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    split_by: ["z"],
                    group_rollup_mode: "flat",
                });
                const json = await view.to_json();
                expect(json).toStrictEqual([
                    {
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 1.5,
                        "true|x": 1,
                        "true|y": "a",
                        "true|z": true,
                    },
                    {
                        "false|w": 2.5,
                        "false|x": 2,
                        "false|y": "b",
                        "false|z": false,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                    {
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 3.5,
                        "true|x": 3,
                        "true|y": "c",
                        "true|z": true,
                    },
                    {
                        "false|w": 4.5,
                        "false|x": 4,
                        "false|y": "d",
                        "false|z": false,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                    {
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 5.5,
                        "true|x": 4,
                        "true|y": "a",
                        "true|z": true,
                    },
                    {
                        "false|w": 6.5,
                        "false|x": 3,
                        "false|y": "b",
                        "false|z": false,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                    {
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 7.5,
                        "true|x": 2,
                        "true|y": "c",
                        "true|z": true,
                    },
                    {
                        "false|w": 8.5,
                        "false|x": 1,
                        "false|y": "d",
                        "false|z": false,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("with split_by and sort", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    split_by: ["z"],
                    group_rollup_mode: "flat",
                    sort: [["w", "desc"]],
                });
                const json = await view.to_json();
                expect(json).toStrictEqual([
                    {
                        __ROW_PATH__: ["d"],
                        "false|w": 13,
                        "false|x": 5,
                        "false|y": 2,
                        "false|z": 2,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                    {
                        __ROW_PATH__: ["c"],
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 11,
                        "true|x": 5,
                        "true|y": 2,
                        "true|z": 2,
                    },
                    {
                        __ROW_PATH__: ["b"],
                        "false|w": 9,
                        "false|x": 5,
                        "false|y": 2,
                        "false|z": 2,
                        "true|w": null,
                        "true|x": null,
                        "true|y": null,
                        "true|z": null,
                    },
                    {
                        __ROW_PATH__: ["a"],
                        "false|w": null,
                        "false|x": null,
                        "false|y": null,
                        "false|z": null,
                        "true|w": 7,
                        "true|x": 5,
                        "true|y": 2,
                        "true|z": 2,
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("updates after table.update()", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                });
                const before = await view.to_json();
                expect(before).toStrictEqual([
                    { __ROW_PATH__: ["a"], w: 7, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["b"], w: 9, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["c"], w: 11, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["d"], w: 13, x: 5, y: 2, z: 2 },
                ]);
                table.update([{ w: 9.5, x: 5, y: "e", z: true }]);
                const after = await view.to_json();
                expect(after).toStrictEqual([
                    { __ROW_PATH__: ["a"], w: 7, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["b"], w: 9, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["c"], w: 11, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["d"], w: 13, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["e"], w: 9.5, x: 5, y: 1, z: 1 },
                ]);
                view.delete();
                table.delete();
            });

            test("updates preserve sort order", async function () {
                const table = await perspective.table(data);
                const flat_view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                    sort: [["w", "desc"]],
                });
                table.update([{ w: 100, x: 5, y: "e", z: true }]);
                const flat_cols = await flat_view.to_columns();
                expect(flat_cols).toStrictEqual({
                    __ROW_PATH__: [["e"], ["d"], ["c"], ["b"], ["a"]],
                    w: [100, 13, 11, 9, 7],
                    x: [5, 5, 5, 5, 5],
                    y: [1, 2, 2, 2, 2],
                    z: [1, 2, 2, 2, 2],
                });
                flat_view.delete();
                table.delete();
            });

            test("viewport pagination", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                });
                const json = await view.to_json({
                    start_row: 0,
                    end_row: 2,
                });
                expect(json).toStrictEqual([
                    { __ROW_PATH__: ["a"], w: 7, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["b"], w: 9, x: 5, y: 2, z: 2 },
                ]);
                view.delete();
                table.delete();
            });

            test("viewport pagination with sort", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    group_by: ["y"],
                    group_rollup_mode: "flat",
                    sort: [["w", "desc"]],
                });
                const json = await view.to_json({
                    start_row: 0,
                    end_row: 2,
                });
                expect(json).toStrictEqual([
                    { __ROW_PATH__: ["d"], w: 13, x: 5, y: 2, z: 2 },
                    { __ROW_PATH__: ["c"], w: 11, x: 5, y: 2, z: 2 },
                ]);
                view.delete();
                table.delete();
            });
        });
    });
})(perspective);
