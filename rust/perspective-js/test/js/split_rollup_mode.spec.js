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
    test.describe("split_rollup_mode", function () {
        test.describe("rollup", function () {
            test("emits grand-total column group in totals-before order", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                const paths = await view.column_paths();
                expect(paths).toStrictEqual(["w", "false|w", "true|w"]);
                expect(await view.num_columns()).toEqual(3);
                view.delete();
                table.delete();
            });

            test("grand-total column values aggregate across all splits", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [[], ["a"], ["b"], ["c"], ["d"]],
                    w: [40, 7, 9, 11, 13],
                    "false|w": [22, null, 9, null, 13],
                    "true|w": [18, 7, null, 11, null],
                });
                view.delete();
                table.delete();
            });

            test("2-level split emits interleaved subtotal column groups", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["x"],
                    split_by: ["z", "y"],
                    split_rollup_mode: "rollup",
                });
                const paths = await view.column_paths();
                expect(paths).toStrictEqual([
                    "w",
                    "false|w",
                    "false|b|w",
                    "false|d|w",
                    "true|w",
                    "true|a|w",
                    "true|c|w",
                ]);

                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [[], [1], [2], [3], [4]],
                    w: [40, 10, 10, 10, 10],
                    "false|w": [22, 8.5, 2.5, 6.5, 4.5],
                    "false|b|w": [9, null, 2.5, 6.5, null],
                    "false|d|w": [13, 8.5, null, null, 4.5],
                    "true|w": [18, 1.5, 7.5, 3.5, 5.5],
                    "true|a|w": [7, 1.5, null, null, 5.5],
                    "true|c|w": [11, null, 7.5, 3.5, null],
                });
                view.delete();
                table.delete();
            });

            test("row sort works and total row remains first", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                    sort: [["w", "desc"]],
                });
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [[], ["d"], ["c"], ["b"], ["a"]],
                    w: [40, 13, 11, 9, 7],
                    "false|w": [22, 13, null, 9, null],
                    "true|w": [18, null, 11, null, 7],
                });
                view.delete();
                table.delete();
            });

            test("hidden sort columns stay hidden", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                    sort: [["x", "asc"]],
                });
                const paths = await view.column_paths();
                expect(paths).toStrictEqual(["w", "false|w", "true|w"]);
                expect(await view.num_columns()).toEqual(3);
                view.delete();
                table.delete();
            });

            test("group_rollup_mode flat interop", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    group_rollup_mode: "flat",
                    split_rollup_mode: "rollup",
                });
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [["a"], ["b"], ["c"], ["d"]],
                    w: [7, 9, 11, 13],
                    "false|w": [null, 9, null, 13],
                    "true|w": [7, null, 11, null],
                });
                view.delete();
                table.delete();
            });

            test("column_only emits a grand-total coalesce column", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                const paths = await view.column_paths();
                expect(paths).toStrictEqual(["w", "false|w", "true|w"]);

                // Each column-only row is a single-row group, so the
                // grand-total column coalesces the row's value across all
                // split groups.
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    w: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5],
                    "false|w": [null, 2.5, null, 4.5, null, 6.5, null, 8.5],
                    "true|w": [1.5, null, 3.5, null, 5.5, null, 7.5, null],
                });
                view.delete();
                table.delete();
            });

            test("group_rollup_mode total interop", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_rollup_mode: "total",
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                const paths = await view.column_paths();
                expect(paths).toStrictEqual(["w", "false|w", "true|w"]);

                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    w: [40],
                    "false|w": [22],
                    "true|w": [18],
                });
                view.delete();
                table.delete();
            });

            test("multiple aggregate columns group per traversal node", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w", "x"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                const paths = await view.column_paths();
                expect(paths).toStrictEqual([
                    "w",
                    "x",
                    "false|w",
                    "false|x",
                    "true|w",
                    "true|x",
                ]);
                view.delete();
                table.delete();
            });

            test("column viewport windows index the widened space", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                const first = await view.to_columns({
                    start_col: 0,
                    end_col: 1,
                });
                expect(Object.keys(first)).toStrictEqual(["__ROW_PATH__", "w"]);
                expect(first["w"]).toStrictEqual([40, 7, 9, 11, 13]);

                const second = await view.to_columns({
                    start_col: 1,
                    end_col: 2,
                });
                expect(Object.keys(second)).toStrictEqual([
                    "__ROW_PATH__",
                    "false|w",
                ]);
                view.delete();
                table.delete();
            });

            test("empty column viewport window with sort", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                    sort: [["w", "desc"]],
                });
                const cols = await view.to_columns({
                    start_col: 1,
                    end_col: 1,
                });
                expect(cols["false|w"]).toBeUndefined();
                expect(cols["true|w"]).toBeUndefined();
                expect(cols["w"]).toBeUndefined();
                view.delete();
                table.delete();
            });

            test("empty result with sort does not crash", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                    sort: [["w", "desc"]],
                    filter: [["x", "<", 0]],
                });
                expect(await view.num_rows()).toEqual(1);
                await view.to_columns();
                view.delete();
                table.delete();
            });

            test("updates after table.update()", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                table.update([{ w: 10, y: "a", z: false }]);
                const cols = await view.to_columns();
                expect(cols).toStrictEqual({
                    __ROW_PATH__: [[], ["a"], ["b"], ["c"], ["d"]],
                    w: [50, 17, 9, 11, 13],
                    "false|w": [32, 10, 9, null, 13],
                    "true|w": [18, 7, null, 11, null],
                });
                view.delete();
                table.delete();
            });

            test("on_update row delta stride matches the widened column set", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });

                const result = new Promise((resolve) => {
                    view.on_update(
                        async (updated) => {
                            const t2 = await perspective.table(updated.delta);
                            const v2 = await t2.view();
                            const out = await v2.to_columns();
                            v2.delete();
                            t2.delete();
                            resolve(out);
                        },
                        { mode: "row" },
                    );
                });

                table.update([{ w: 10, y: "a", z: false }]);
                const delta = await result;

                // The delta batch carries one column per emitted column
                // path, total and subtotal groups included.
                expect(Object.keys(delta).sort()).toStrictEqual(
                    ["w", "false|w", "true|w"].sort(),
                );
                view.delete();
                table.delete();
            });

            test("view.get_config() round-trips the mode", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "rollup",
                });
                const config = await view.get_config();
                expect(config.split_rollup_mode).toEqual("rollup");
                view.delete();
                table.delete();
            });
        });

        test.describe("flat (default)", function () {
            test("default emits leaves only, unchanged", async function () {
                const table = await perspective.table(data);
                const view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                });
                const paths = await view.column_paths();
                expect(paths).toStrictEqual(["false|w", "true|w"]);
                const config = await view.get_config();
                expect(config.split_rollup_mode).toEqual("flat");
                view.delete();
                table.delete();
            });

            test("explicit flat equals default", async function () {
                const table = await perspective.table(data);
                const default_view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                });
                const flat_view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_by: ["z"],
                    split_rollup_mode: "flat",
                });
                expect(await flat_view.to_columns()).toStrictEqual(
                    await default_view.to_columns(),
                );
                flat_view.delete();
                default_view.delete();
                table.delete();
            });

            test("no split_by ignores the mode", async function () {
                const table = await perspective.table(data);
                const rollup_view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                    split_rollup_mode: "rollup",
                });
                const default_view = await table.view({
                    columns: ["w"],
                    group_by: ["y"],
                });
                expect(await rollup_view.to_columns()).toStrictEqual(
                    await default_view.to_columns(),
                );
                rollup_view.delete();
                default_view.delete();
                table.delete();
            });
        });
    });
})(perspective);
