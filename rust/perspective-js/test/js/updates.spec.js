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

import * as _ from "lodash";
import * as arrows from "./test_arrows.js";

import { test, expect } from "@perspective-dev/test";
import perspective from "./perspective_client";

function it_old_behavior(name, capture, opts = { skip: false }) {
    let test_fn = test;
    if (opts.skip) {
        test_fn = test.skip;
    }
    test_fn(name, async function () {
        let done;
        let result = new Promise((x) => {
            done = x;
        });

        await capture(done);
        await result;
    });
}

var data = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
];

var col_data = {
    x: [1, 2, 3, 4],
    y: ["a", "b", "c", "d"],
    z: [true, false, true, false],
};

var meta = {
    x: "integer",
    y: "string",
    z: "boolean",
};

var data_2 = [
    { x: 3, y: "c", z: false },
    { x: 4, y: "d", z: true },
    { x: 5, y: "g", z: false },
    { x: 6, y: "h", z: true },
];

const arrow_result = [
    {
        f32: 1.5,
        f64: 1.5,
        i64: 1,
        i32: 1,
        i16: 1,
        i8: 1,
        bool: true,
        char: "a",
        dict: "a",
        datetime: +new Date("2018-01-25"),
    },
    {
        f32: 2.5,
        f64: 2.5,
        i64: 2,
        i32: 2,
        i16: 2,
        i8: 2,
        bool: false,
        char: "b",
        dict: "b",
        datetime: +new Date("2018-01-26"),
    },
    {
        f32: 3.5,
        f64: 3.5,
        i64: 3,
        i32: 3,
        i16: 3,
        i8: 3,
        bool: true,
        char: "c",
        dict: "c",
        datetime: +new Date("2018-01-27"),
    },
    {
        f32: 4.5,
        f64: 4.5,
        i64: 4,
        i32: 4,
        i16: 4,
        i8: 4,
        bool: false,
        char: "d",
        dict: "d",
        datetime: +new Date("2018-01-28"),
    },
    {
        f32: 5.5,
        f64: 5.5,
        i64: 5,
        i32: 5,
        i16: 5,
        i8: 5,
        bool: true,
        char: "d",
        dict: "d",
        datetime: +new Date("2018-01-29"),
    },
];

const arrow_partial_result = [
    {
        f32: 1.5,
        f64: 1.5,
        i64: 1,
        i32: 1,
        i16: 1,
        i8: 1,
        bool: false,
        char: "a",
        dict: "a",
        datetime: +new Date("2018-01-25"),
    },
    {
        f32: 2.5,
        f64: 2.5,
        i64: 2,
        i32: 2,
        i16: 2,
        i8: 2,
        bool: true,
        char: "b",
        dict: "b",
        datetime: +new Date("2018-01-26"),
    },
    {
        f32: 3.5,
        f64: 3.5,
        i64: 3,
        i32: 3,
        i16: 3,
        i8: 3,
        bool: false,
        char: "c",
        dict: "c",
        datetime: +new Date("2018-01-27"),
    },
    {
        f32: 4.5,
        f64: 4.5,
        i64: 4,
        i32: 4,
        i16: 4,
        i8: 4,
        bool: true,
        char: "d",
        dict: "d",
        datetime: +new Date("2018-01-28"),
    },
    {
        f32: 5.5,
        f64: 5.5,
        i64: 5,
        i32: 5,
        i16: 5,
        i8: 5,
        bool: false,
        char: "d",
        dict: "d",
        datetime: +new Date("2018-01-29"),
    },
];

const arrow_partial_missing_result = [
    {
        f32: 1.5,
        f64: 1.5,
        i64: 1,
        i32: 1,
        i16: 1,
        i8: 1,
        bool: false,
        char: "a",
        dict: "a",
        datetime: +new Date("2018-01-25"),
    },
    {
        f32: 2.5,
        f64: 2.5,
        i64: 2,
        i32: 2,
        i16: 2,
        i8: 2,
        bool: false,
        char: "b",
        dict: "b",
        datetime: +new Date("2018-01-26"),
    },
    {
        f32: 3.5,
        f64: 3.5,
        i64: 3,
        i32: 3,
        i16: 3,
        i8: 3,
        bool: false,
        char: "c",
        dict: "c",
        datetime: +new Date("2018-01-27"),
    },
    {
        f32: 4.5,
        f64: 4.5,
        i64: 4,
        i32: 4,
        i16: 4,
        i8: 4,
        bool: false,
        char: "d",
        dict: "d",
        datetime: +new Date("2018-01-28"),
    },
    {
        f32: 5.5,
        f64: 5.5,
        i64: 5,
        i32: 5,
        i16: 5,
        i8: 5,
        bool: false,
        char: "d",
        dict: "d",
        datetime: +new Date("2018-01-29"),
    },
];

const arrow_indexed_result = [
    {
        f32: 1.5,
        f64: 1.5,
        i64: 1,
        i32: 1,
        i16: 1,
        i8: 1,
        bool: true,
        char: "a",
        dict: "a",
        datetime: +new Date("2018-01-25"),
    },
    {
        f32: 2.5,
        f64: 2.5,
        i64: 2,
        i32: 2,
        i16: 2,
        i8: 2,
        bool: false,
        char: "b",
        dict: "b",
        datetime: +new Date("2018-01-26"),
    },
    {
        f32: 3.5,
        f64: 3.5,
        i64: 3,
        i32: 3,
        i16: 3,
        i8: 3,
        bool: true,
        char: "c",
        dict: "c",
        datetime: +new Date("2018-01-27"),
    },
    {
        f32: 5.5,
        f64: 5.5,
        i64: 5,
        i32: 5,
        i16: 5,
        i8: 5,
        bool: true,
        char: "d",
        dict: "d",
        datetime: +new Date("2018-01-29"),
    },
];

async function match_delta(perspective, delta, expected) {
    let table = await perspective.table(delta);
    let view = await table.view();
    let json = await view.to_json();
    expect(json).toEqual(expected);
    view.delete();
    table.delete();
}

((perspective) => {
    test.describe("Removes", function () {
        test("should not remove without explicit index", async function () {
            const table = await perspective.table(meta);
            await table.update(data);
            const view = await table.view();
            let threw = false;
            try {
                // In 3.0, this throws an exception
                await table.remove([0, 1]);
            } catch (e) {
                threw = true;
            }

            expect(threw).toBeTruthy();
            const result = await view.to_json();
            expect(await view.num_rows()).toEqual(4);
            expect(result.length).toEqual(4);
            expect(result).toEqual(data);
            expect(await table.size()).toEqual(4);
            view.delete();
            table.delete();
        });

        test("after an `update()`", async function () {
            const table = await perspective.table(meta, { index: "x" });
            await table.update(data);
            const view = await table.view();
            await table.remove([1, 2]);
            const result = await view.to_json();
            expect(await view.num_rows()).toEqual(2);
            expect(result.length).toEqual(2);
            expect(result).toEqual(data.slice(2, 4));
            expect(await table.size()).toEqual(2);
            view.delete();
            table.delete();
        });

        test("after a regular data load", async function () {
            const table = await perspective.table(data, { index: "x" });
            const view = await table.view();
            await table.remove([1, 2]);
            const result = await view.to_json();
            expect(await view.num_rows()).toEqual(2);
            expect(result.length).toEqual(2);
            expect(result).toEqual(data.slice(2, 4));
            expect(await table.size()).toEqual(2);
            view.delete();
            table.delete();
        });

        test("after an `update()`, string pkey", async function () {
            const table = await perspective.table(meta, { index: "y" });
            await table.update(data);
            const view = await table.view();
            await table.remove(["a", "b"]);
            const result = await view.to_json();
            expect(await view.num_rows()).toEqual(2);
            expect(result.length).toEqual(2);
            expect(result).toEqual(data.slice(2, 4));
            expect(await table.size()).toEqual(2);
            view.delete();
            table.delete();
        });

        test("after a regular data load, string pkey", async function () {
            const table = await perspective.table(data, { index: "y" });
            const view = await table.view();
            await table.remove(["a", "b"]);
            const result = await view.to_json();
            expect(await view.num_rows()).toEqual(2);
            expect(result.length).toEqual(2);
            expect(result).toEqual(data.slice(2, 4));
            expect(await table.size()).toEqual(2);
            view.delete();
            table.delete();
        });

        test("after an update, date pkey", async function () {
            const datetimes = [
                new Date(2020, 0, 15),
                new Date(2020, 1, 15),
                new Date(2020, 2, 15),
                new Date(2020, 3, 15),
            ];
            const table = await perspective.table(
                {
                    x: "integer",
                    y: "date",
                    z: "float",
                },
                { index: "y" },
            );
            await table.update({
                x: [1, 2, 3, 4],
                y: datetimes,
                z: [1.5, 2.5, 3.5, 4.5],
            });
            const view = await table.view();
            await table.remove(datetimes.slice(0, 2));
            const result = await view.to_columns();
            expect(await view.num_rows()).toEqual(2);
            expect(result).toEqual({
                x: [3, 4],
                y: [1584230400000, 1586908800000],
                z: [3.5, 4.5],
            });
            // expect(await table.size()).toEqual(2);
            view.delete();
            table.delete();
        });

        test("after an update, datetime pkey", async function () {
            const datetimes = [
                new Date(2020, 0, 15),
                new Date(2020, 1, 15),
                new Date(2020, 2, 15),
                new Date(2020, 3, 15),
            ];
            const table = await perspective.table(
                {
                    x: "integer",
                    y: "datetime",
                    z: "float",
                },
                { index: "y" },
            );
            await table.update({
                x: [1, 2, 3, 4],
                y: datetimes,
                z: [1.5, 2.5, 3.5, 4.5],
            });
            const view = await table.view();
            await table.remove(datetimes.slice(0, 2));
            const result = await view.to_columns();
            expect(await view.num_rows()).toEqual(2);
            expect(result).toEqual({
                x: [3, 4],
                y: [1584230400000, 1586908800000],
                z: [3.5, 4.5],
            });
            expect(await table.size()).toEqual(2);
            view.delete();
            table.delete();
        });

        test("after a regular data load, datetime pkey", async function () {
            const datetimes = [
                new Date(2020, 0, 15),
                new Date(2020, 1, 15),
                new Date(2020, 2, 15),
                new Date(2020, 3, 15),
            ];
            const table = await perspective.table(
                {
                    x: [1, 2, 3, 4],
                    y: datetimes,
                    z: [1.5, 2.5, 3.5, 4.5],
                },
                { index: "y" },
            );
            const view = await table.view();
            await table.remove(datetimes.slice(0, 2));
            const result = await view.to_columns();
            expect(await view.num_rows()).toEqual(2);
            expect(result).toEqual({
                x: [3, 4],
                y: [1584230400000, 1586908800000],
                z: [3.5, 4.5],
            });
            expect(await table.size()).toEqual(2);
            view.delete();
            table.delete();
        });

        test("multiple single element removes", async function () {
            const table = await perspective.table(meta, { index: "x" });
            for (let i = 0; i < 100; i++) {
                await table.update([{ x: i, y: "test", z: false }]);
            }
            for (let i = 1; i < 100; i++) {
                await table.remove([i]);
            }
            const view = await table.view();
            const result = await view.to_json();
            expect(result).toEqual([{ x: 0, y: "test", z: false }]);
            expect(result.length).toEqual(1);
            expect(await table.size()).toEqual(1);
            view.delete();
            table.delete();
        });

        test("remove while pivoted, last and count", async function () {
            const table = await perspective.table(
                {
                    x: ["a"],
                    y: ["A"],
                    idx: [1],
                },
                { index: "idx" },
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
                idx: [1, 1],
            });

            await table.update({
                x: ["b"],
                y: ["B"],
                idx: [2],
            });

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["A"], ["B"]],
                x: ["b", "a", "b"],
                y: [2, 1, 1],
                idx: [3, 1, 2],
            });

            await table.remove([1]);

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[], ["B"]],
                x: ["b", "b"],
                y: [1, 1],
                idx: [2, 2],
            });

            await table.remove([2]);

            expect(await view.to_columns()).toEqual({
                __ROW_PATH__: [[]],
                x: [""],
                y: [0],
                idx: [0],
            });

            await view.delete();
            await table.delete();
        });

        test("Removes out of order", async function () {
            const table = await perspective.table(
                {
                    x: "string",
                    y: "integer",
                },
                { index: "x" },
            );

            await table.update({
                x: ["b", "1", "a", "c"],
                y: [3, 1, 2, 4],
            });

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                x: ["1", "a", "b", "c"],
                y: [1, 2, 3, 4],
            });

            await table.remove(["a", "c", "1", "b"]);

            // num_rows should always reflect latest - we did not call_process
            // in num_rows and I think the viewer covered that up because
            // it would immediately serialize and thus flush the queue.
            expect(await view.num_rows()).toEqual(0);
            expect(await view.to_json()).toEqual([]);

            await view.delete();
            await table.delete();
        });

        test("No-op on pkeys not in the set", async function () {
            const table = await perspective.table(
                {
                    x: "string",
                    y: "integer",
                },
                { index: "x" },
            );

            await table.update({
                x: ["b", "1", "a", "c"],
                y: [3, 1, 2, 4],
            });

            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                x: ["1", "a", "b", "c"],
                y: [1, 2, 3, 4],
            });

            await table.remove(["z", "ff", "2312", "b"]);

            expect(await view.to_columns()).toEqual({
                x: ["1", "a", "c"],
                y: [1, 2, 4],
            });

            await view.delete();
            await table.delete();
        });

        test("conflation order is consistent", async function () {
            const table = await perspective.table(
                {
                    x: "string",
                    y: "integer",
                },
                { index: "x" },
            );

            await table.update({
                x: ["b", "1", "a", "c"],
                y: [3, 1, 2, 4],
            });
            await table.remove(["1", "c"]);

            // removes applied after update
            const view = await table.view();
            expect(await view.to_columns()).toEqual({
                x: ["a", "b"],
                y: [2, 3],
            });

            await table.update({
                x: ["b"],
                y: [103],
            });
            await table.remove(["b"]);

            expect(await view.to_columns()).toEqual({
                x: ["a"],
                y: [2],
            });

            await table.update({
                x: ["b"],
                y: [100],
            });

            await table.remove(["a"]);

            expect(await view.to_columns()).toEqual({
                x: ["b"],
                y: [100],
            });

            // remove applied after update
            for (let i = 0; i < 100; i++) {
                await table.update({
                    x: ["c", "a"],
                    y: [i + 1, i + 2],
                });
                await table.remove(["c", "a"]);
            }

            expect(await view.to_columns()).toEqual({
                x: ["b"],
                y: [100],
            });

            await view.delete();
            await table.delete();
        });

        test("correct size", async function () {
            const table = await perspective.table(
                {
                    x: "integer",
                    y: "integer",
                },
                { index: "x" },
            );

            for (let i = 0; i < 100; i++) {
                await table.update([{ x: i, y: i }]);
            }

            expect(await table.size()).toEqual(100);

            for (let i = 0; i < 100; i++) {
                await table.remove([i]);
                await table.update([{ x: i, y: i }]);
            }

            expect(await table.size()).toEqual(100);

            for (let i = 0; i < 100; i++) {
                await table.update([{ x: i, y: i }]);
            }

            expect(await table.size()).toEqual(100);

            for (let i = 0; i < 100; i++) {
                await table.remove([i]);
            }

            expect(await table.size()).toEqual(0);

            await table.delete();
        });
    });

    test.describe("Schema", function () {
        test("updates with columns not in schema", async function () {
            var table = await perspective.table({ x: "integer", y: "string" });
            await table.update(data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([
                { x: 1, y: "a" },
                { x: 2, y: "b" },
                { x: 3, y: "c" },
                { x: 4, y: "d" },
            ]);
            view.delete();
            table.delete();
        });

        test("coerces to string", async function () {
            var table = await perspective.table({
                x: "string",
                y: "string",
                z: "string",
            });
            await table.update(data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([
                { x: "1", y: "a", z: "true" },
                { x: "2", y: "b", z: "false" },
                { x: "3", y: "c", z: "true" },
                { x: "4", y: "d", z: "false" },
            ]);
            view.delete();
            table.delete();
        });
    });

    test.describe("Updates", function () {
        test("Meta constructor then `update()`", async function () {
            var table = await perspective.table(meta);
            await table.update(data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("Meta constructor then column oriented `update()`", async function () {
            var table = await perspective.table(meta);
            await table.update(col_data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("Column oriented `update()` with columns in different order to schema", async function () {
            var table = await perspective.table(meta);

            var reordered_col_data = {
                y: ["a", "b", "c", "d"],
                z: [true, false, true, false],
                x: [1, 2, 3, 4],
            };

            await table.update(reordered_col_data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("Column data constructor then column oriented `update()`", async function () {
            var colUpdate = {
                x: [3, 4, 5],
                y: ["h", "i", "j"],
                z: [false, true, false],
            };

            var expected = [
                { x: 1, y: "a", z: true },
                { x: 2, y: "b", z: false },
                { x: 3, y: "h", z: false },
                { x: 4, y: "i", z: true },
                { x: 5, y: "j", z: false },
            ];

            var table = await perspective.table(col_data, { index: "x" });
            await table.update(colUpdate);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("`update()` should increment `table.size()` without a view created", async function () {
            const table = await perspective.table(data);
            expect(await table.size()).toEqual(4);
            await table.update(data);
            expect(await table.size()).toEqual(8);
            await table.update(data);
            expect(await table.size()).toEqual(12);
            table.delete();
        });

        test.skip("`update()` unbound to table", async function () {
            var table = await perspective.table(meta);
            var updater = await table.update;
            console.log(updater);
            updater(data);
            let view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("`update([])` does not error", async function () {
            let table = await perspective.table(meta);
            let view = await table.view();
            await table.update([]);
            let result = await view.to_json();
            expect(result).toEqual([]);
            view.delete();
            table.delete();
        });

        test("Multiple `update()`s", async function () {
            var table = await perspective.table(meta);
            await table.update(data);
            await table.update(data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data.concat(data));
            view.delete();
            table.delete();
        });

        test("`update()` called after `view()`", async function () {
            var table = await perspective.table(meta);
            var view = await table.view();
            await table.update(data);
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });
    });

    test.describe("Arrow Updates", function () {
        test("arrow contructor then arrow `update()`", async function () {
            const arrow = arrows.test_arrow;
            var table = await perspective.table(arrow.slice());
            await table.update(arrow.slice());
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(arrow_result.concat(arrow_result));
            view.delete();
            table.delete();
        });

        test("non-arrow constructor then arrow `update()`", async function () {
            let table = await perspective.table(arrow_result);
            let view = await table.view();
            let generated_arrow = await view.to_arrow();
            await table.update(generated_arrow);
            let result = await view.to_json();
            expect(result).toEqual(arrow_result.concat(arrow_result));
            view.delete();
            table.delete();
        });

        test("arrow dict contructor then arrow dict `update()`", async function () {
            var table = await perspective.table(arrows.dict_arrow.slice());
            await table.update(arrows.dict_update_arrow.slice());
            var view = await table.view();
            let result = await view.to_columns();
            expect(result).toEqual({
                a: [
                    "abc",
                    "def",
                    "def",
                    null,
                    "abc",
                    null,
                    "update1",
                    "update2",
                ],
                b: [
                    "klm",
                    "hij",
                    null,
                    "hij",
                    "klm",
                    "update3",
                    null,
                    "update4",
                ],
            });
            view.delete();
            table.delete();
        });

        test("non-arrow constructor then arrow dict `update()`", async function () {
            let table = await perspective.table({
                a: ["a", "b", "c"],
                b: ["d", "e", "f"],
            });
            let view = await table.view();
            await table.update(arrows.dict_update_arrow.slice());
            let result = await view.to_columns();
            expect(result).toEqual({
                a: ["a", "b", "c", null, "update1", "update2"],
                b: ["d", "e", "f", "update3", null, "update4"],
            });
            view.delete();
            table.delete();
        });

        test("arrow dict contructor then arrow dict `update()` subset of columns", async function () {
            var table = await perspective.table(arrows.dict_arrow.slice());
            await table.update(arrows.dict_update_arrow.slice());
            var view = await table.view({
                columns: ["a"],
            });
            let result = await view.to_columns();
            expect(result).toEqual({
                a: [
                    "abc",
                    "def",
                    "def",
                    null,
                    "abc",
                    null,
                    "update1",
                    "update2",
                ],
            });
            view.delete();
            table.delete();
        });

        test("non-arrow constructor then arrow dict `update()`, subset of columns", async function () {
            let table = await perspective.table({
                a: ["a", "b", "c"],
                b: ["d", "e", "f"],
            });
            let view = await table.view({
                columns: ["a"],
            });
            await table.update(arrows.dict_update_arrow.slice());
            let result = await view.to_columns();
            expect(result).toEqual({
                a: ["a", "b", "c", null, "update1", "update2"],
            });
            view.delete();
            table.delete();
        });

        test("arrow partial `update()` a single column", async function () {
            let table = await perspective.table(arrows.test_arrow.slice(), {
                index: "i64",
            });
            await table.update(arrows.partial_arrow.slice());
            const view = await table.view();
            const result = await view.to_json();
            expect(result).toEqual(arrow_partial_result);
            view.delete();
            table.delete();
        });

        test("arrow partial `update()` a single column with missing rows", async function () {
            let table = await perspective.table(arrows.test_arrow.slice(), {
                index: "i64",
            });
            await table.update(arrows.partial_missing_rows_arrow.slice());
            const view = await table.view();
            const result = await view.to_json();
            expect(result).toEqual(arrow_partial_missing_result);
            view.delete();
            table.delete();
        });

        test("schema constructor, then arrow `update()`", async function () {
            const table = await perspective.table({
                a: "integer",
                b: "float",
                c: "string",
            });
            await table.update(arrows.int_float_str_arrow.slice());
            const view = await table.view();
            const size = await table.size();
            expect(size).toEqual(4);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [1, 2, 3, 4],
                b: [1.5, 2.5, 3.5, 4.5],
                c: ["a", "b", "c", "d"],
            });
            view.delete();
            table.delete();
        });

        test("schema constructor, then arrow dictionary `update()`", async function () {
            const table = await perspective.table({
                a: "string",
                b: "string",
            });
            await table.update(arrows.dict_arrow.slice());
            const view = await table.view();
            const size = await table.size();
            expect(size).toEqual(5);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: ["abc", "def", "def", null, "abc"],
                b: ["klm", "hij", null, "hij", "klm"],
            });
            view.delete();
            table.delete();
        });

        test.skip("schema constructor, then indexed arrow dictionary `update()`", async function () {
            const table = await perspective.table(
                {
                    a: "string",
                    b: "string",
                },
                { index: "a" },
            );
            await table.update(arrows.dict_arrow.slice());
            const view = await table.view();
            const size = await table.size();
            expect(size).toEqual(3);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [null, "abc", "def"],
                b: ["hij", "klm", "hij"],
            });
            view.delete();
            table.delete();
        });

        test.skip("schema constructor, then indexed arrow dictionary `update()` with more columns than in schema", async function () {
            const table = await perspective.table(
                {
                    a: "string",
                },
                { index: "a" },
            );
            await table.update(arrows.dict_arrow.slice());
            const view = await table.view();
            const size = await table.size();
            console.log(await view.to_columns());
            expect(size).toEqual(3);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [null, "abc", "def"],
            });
            view.delete();
            table.delete();
        });

        test.skip("schema constructor, then indexed arrow dictionary `update()` with less columns than in schema", async function () {
            const table = await perspective.table(
                {
                    a: "string",
                    b: "string",
                    x: "integer",
                },
                { index: "a" },
            );
            await table.update(arrows.dict_arrow.slice());
            const view = await table.view();
            const size = await table.size();
            console.log(await view.to_columns());
            expect(size).toEqual(3);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [null, "abc", "def"],
                b: ["hij", "klm", "hij"],
                x: [null, null, null],
            });
            view.delete();
            table.delete();
        });

        test("schema constructor, then indexed arrow `update()`", async function () {
            const table = await perspective.table(
                {
                    a: "integer",
                    b: "float",
                    c: "string",
                },
                { index: "a" },
            );

            const view = await table.view();
            await table.update(arrows.int_float_str_arrow.slice());
            await table.update(arrows.int_float_str_update_arrow.slice());
            expect(await table.size()).toBe(4);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [1, 2, 3, 4],
                b: [100.5, 2.5, 3.5, 400.5],
                c: ["x", "b", "c", "y"],
            });
            view.delete();
            table.delete();
        });

        test("schema constructor, then arrow update() with more columns than in the Table", async function () {
            const table = await perspective.table({
                a: "integer",
            });
            const view = await table.view();
            await table.update(arrows.int_float_str_arrow.slice());
            expect(await table.size()).toBe(4);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [1, 2, 3, 4],
            });
            view.delete();
            table.delete();
        });

        test.skip("Table.get_num_views", async function () {
            const table = await perspective.table({
                a: "integer",
            });
            const view1 = await table.view();
            expect(await table.get_num_views()).toBe(1);
            const view2 = await table.view();
            const view3 = await table.view();
            const view4 = await table.view();
            const view5 = await table.view();
            expect(await table.get_num_views()).toBe(5);
            await view1.delete();
            await view2.delete();
            await view3.delete();
            await view4.delete();
            await view5.delete();
            expect(await table.get_num_views()).toBe(0);
            table.delete();
        });

        test("schema constructor indexed, then arrow update() with more columns than in the Table", async function () {
            const table = await perspective.table(
                {
                    a: "integer",
                    b: "float",
                },
                {
                    index: "a",
                },
            );
            const view = await table.view();
            await table.update(arrows.int_float_str_arrow.slice());
            await table.update(arrows.int_float_str_update_arrow.slice());
            expect(await table.size()).toBe(4);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [1, 2, 3, 4],
                b: [100.5, 2.5, 3.5, 400.5],
            });
            view.delete();
            table.delete();
        });

        test("schema constructor, then arrow update() with less columns than in the Table", async function () {
            const table = await perspective.table({
                a: "integer",
                x: "float",
                y: "string",
            });
            const view = await table.view();
            await table.update(arrows.int_float_str_arrow.slice());
            expect(await table.size()).toBe(4);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [1, 2, 3, 4],
                x: [null, null, null, null],
                y: [null, null, null, null],
            });
            view.delete();
            table.delete();
        });

        test("schema constructor indexed, then arrow update() with less columns than in the Table", async function () {
            const table = await perspective.table(
                {
                    a: "integer",
                    x: "float",
                    y: "string",
                },
                {
                    index: "a",
                },
            );
            const view = await table.view();
            await table.update(arrows.int_float_str_arrow.slice());
            await table.update(arrows.int_float_str_update_arrow.slice());
            expect(await table.size()).toBe(4);
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [1, 2, 3, 4],
                x: [null, null, null, null],
                y: [null, null, null, null],
            });
            view.delete();
            table.delete();
        });

        test("schema constructor, then arrow stream and arrow file `update()`", async function () {
            const table = await perspective.table({
                a: "integer",
                b: "float",
                c: "string",
            });

            await table.update(arrows.int_float_str_arrow.slice());
            await table.update(arrows.int_float_str_file_arrow.slice());
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                a: [1, 2, 3, 4, 1, 2, 3, 4],
                b: [1.5, 2.5, 3.5, 4.5, 1.5, 2.5, 3.5, 4.5],
                c: ["a", "b", "c", "d", "a", "b", "c", "d"],
            });
            view.delete();
            table.delete();
        });
    });

    test.describe("Notifications", function () {
        it_old_behavior("`on_update()`", async function (done) {
            var table = await perspective.table(meta);
            var view = await table.view();
            view.on_update(
                async function (updated) {
                    await match_delta(perspective, updated.delta, data);
                    view.delete();
                    table.delete();
                    done();
                },
                { mode: "row" },
            );
            await table.update(data);
        });

        it_old_behavior(
            "`on_update` before and after `update()`",
            async function (done) {
                var table = await perspective.table(meta);
                var view = await table.view();
                await table.update(data);
                var ran = false;
                view.on_update(
                    async function (updated) {
                        if (!ran) {
                            await match_delta(perspective, updated.delta, data);
                            ran = true;
                            view.delete();
                            table.delete();
                            done();
                        }
                    },
                    { mode: "row" },
                );
                await table.update(data);
            },
        );

        it_old_behavior(
            "`on_update(await table.update) !`",
            async function (done) {
                var table1 = await perspective.table(meta);
                var table2 = await perspective.table(meta);
                var view1 = await table1.view();
                var view2 = await table2.view();
                view1.on_update(
                    async function (updated) {
                        await table2.update(updated.delta);
                        let result = await view2.to_json();
                        expect(result).toEqual(data);
                        view1.delete();
                        view2.delete();
                        table1.delete();
                        table2.delete();
                        done();
                    },
                    { mode: "row" },
                );
                await table1.update(data);
            },
        );

        it_old_behavior(
            "`on_update( table.update)` before and after `update()`",
            async function (done) {
                var table1 = await perspective.table(meta);
                var table2 = await perspective.table(meta);
                var view1 = await table1.view();
                var view2 = await table2.view();

                await table1.update(data);
                await table2.update(data);
                view1.on_update(
                    async function (updated) {
                        await table2.update(updated.delta);
                        let result = await view2.to_json();
                        expect(result).toEqual(data.concat(data));
                        view1.delete();
                        view2.delete();
                        table1.delete();
                        table2.delete();
                        done();
                    },
                    { mode: "row" },
                );
                await table1.update(data);
            },
        );

        it_old_behavior(
            "OG - properly removes a failed update callback on a table",
            async function (done) {
                const table = await perspective.table({ x: "integer" });
                const view = await table.view();
                let size = await table.size();
                let counter = 0;

                // when a callback throws, it should delete that callback
                view.on_update(() => {
                    counter++;
                    throw new Error("something went wrong!");
                });

                view.on_update(async () => {
                    // failed callback gets removed; non-failing callback gets called
                    let sz = await table.size();
                    expect(counter).toEqual(1);
                    expect(sz).toEqual(size++);
                });

                await table.update([{ x: 1 }]);
                await table.update([{ x: 2 }]);
                await table.update([{ x: 3 }]);

                const view2 = await table.view(); // create a new view to make sure we process every update transacation.
                const final_size = await table.size();
                expect(final_size).toEqual(3);

                view2.delete();
                view.delete();
                table.delete();
                done();
            },
            { skip: true },
        );

        it_old_behavior(
            "properly removes a failed update callback on a table",
            async function (done) {
                const table = await perspective.table({ x: "integer" });
                const view = await table.view();
                let size = await table.size();

                view.on_update(async () => {
                    // failed callback gets removed; non-failing callback gets called
                    let sz = await table.size();
                    expect(sz).toEqual(++size);
                });

                await table.update([{ x: 1 }]);
                await table.size();
                await table.update([{ x: 2 }]);
                await table.size();
                await table.update([{ x: 3 }]);
                await table.size();

                const final_size = await table.size();
                expect(final_size).toEqual(3);

                // view2.delete();
                view.delete();
                table.delete();
                done();
            },
        );

        it_old_behavior(
            "`on_update()` that calls operations on the table should not recurse",
            async function (done) {
                var table = await perspective.table(meta);
                var view = await table.view();
                view.on_update(async function (updated) {
                    expect(updated.port_id).toEqual(0);
                    const json = await view.to_json();
                    // Not checking for correctness, literally just to assert
                    // that the `process()` call triggered by `to_json` will not
                    // infinitely recurse.
                    expect(json).toEqual(await view.to_json());
                    view.delete();
                    table.delete();
                    done();
                });
                await table.update(data);
            },
        );

        it_old_behavior(
            "`on_update()` should be triggered in sequence",
            async function (done) {
                var table = await perspective.table(meta);
                var view = await table.view();

                let order = [];

                const finish = function () {
                    if (order.length === 3) {
                        expect(order).toEqual([0, 1, 2]);
                        view.delete();
                        table.delete();
                        done();
                    }
                };

                for (let i = 0; i < 3; i++) {
                    view.on_update(() => {
                        order.push(i);
                        finish();
                    });
                }

                await table.update(data);
            },
        );

        it_old_behavior(
            "`on_update()` should be triggered in sequence across multiple views",
            async function (done) {
                var table = await perspective.table(meta);
                const views = [
                    await table.view(),
                    await table.view(),
                    await table.view(),
                ];

                let order = [];

                const finish = function () {
                    if (order.length === 3) {
                        expect(order).toEqual([0, 1, 2]);
                        for (const view of views) {
                            view.delete();
                        }
                        table.delete();
                        done();
                    }
                };

                for (let i = 0; i < views.length; i++) {
                    views[i].on_update(() => {
                        order.push(i);
                        finish();
                    });
                }

                await table.update(data);
            },
        );
    });

    test.describe("Limit", function () {
        test("{limit: 2} with table of size 4", async function () {
            var table = await perspective.table(data, { limit: 2 });
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data.slice(2));
            view.delete();
            table.delete();
        });

        test("{limit: 5} with 2 updates of size 4", async function () {
            var table = await perspective.table(data, { limit: 5 });
            await table.update(data);
            var view = await table.view();
            let result = await view.to_json();
            let expected = data.concat(data).slice(-5);
            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("{limit: 1} with arrow update", async function () {
            const arrow = arrows.test_arrow.slice();
            var table = await perspective.table(arrow, { limit: 1 });
            await table.update(arrow.slice());
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([arrow_result[arrow_result.length - 1]]);
            view.delete();
            table.delete();
        });
    });

    test.describe("Indexed", function () {
        test("{index: 'x'} (int)", async function () {
            var table = await perspective.table(data, { index: "x" });
            var view = await table.view();
            await table.update(data);
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("{index: 'y'} (string)", async function () {
            var table = await perspective.table(data, { index: "y" });
            var view = await table.view();
            await table.update(data);
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("{index: 'x'} (int) with null and 0", async function () {
            const data = {
                x: [0, 1, null, 2, 3],
                y: ["a", "b", "c", "d", "e"],
            };
            const table = await perspective.table(data, { index: "x" });
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [null, 0, 1, 2, 3], // null before 0
                y: ["c", "a", "b", "d", "e"],
            });
            view.delete();
            table.delete();
        });

        test("{index: 'y'} (str) with null and empty string", async function () {
            const data = {
                x: [0, 1, 2, 3, 4],
                y: ["", "a", "b", "c", null],
            };
            const table = await perspective.table(data, { index: "y" });
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [4, 0, 1, 2, 3],
                y: [null, "", "a", "b", "c"], // null before empties
            });
            view.delete();
            table.delete();
        });

        test("{index: 'x'} (int) with null and 0, update", async function () {
            const data = {
                x: [0, 1, null, 2, 3],
                y: ["a", "b", "c", "d", "e"],
            };
            const table = await perspective.table(data, { index: "x" });
            await table.update({
                x: [null, 0],
                y: ["x", "y"],
            });
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [null, 0, 1, 2, 3], // null before 0
                y: ["x", "y", "b", "d", "e"],
            });
            view.delete();
            table.delete();
        });

        test("{index: 'y'} (str) with null and empty string, update", async function () {
            const data = {
                x: [0, 1, 2, 3, 4],
                y: ["", "a", "b", "c", null],
            };
            const table = await perspective.table(data, { index: "y" });
            await table.update({
                x: [5, 6],
                y: ["", null],
            });
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [6, 5, 1, 2, 3],
                y: [null, "", "a", "b", "c"], // null before empties
            });
            view.delete();
            table.delete();
        });

        test("{index: 'x'} (date) with null", async function () {
            const data = {
                x: ["10/30/2016", "11/1/2016", null, "1/1/2000"],
                y: [1, 2, 3, 4],
            };
            const table = await perspective.table(
                {
                    x: "date",
                    y: "integer",
                },
                { index: "x" },
            );
            await table.update(data);
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [
                    null,
                    new Date("2000-1-1").getTime(),
                    new Date("2016-10-30").getTime(),
                    new Date("2016-11-1").getTime(),
                ],
                y: [3, 4, 1, 2],
            });
            view.delete();
            table.delete();
        });

        test("{index: 'y'} (datetime) with datetime and null", async function () {
            const data = {
                x: [
                    "2016-11-01 11:00:00",
                    "2016-11-01 11:10:00",
                    null,
                    "2016-11-01 11:20:00",
                ],
                y: [1, 2, 3, 4],
            };
            const table = await perspective.table(
                {
                    x: "datetime",
                    y: "integer",
                },
                { index: "x" },
            );
            await table.update(data);
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [
                    null,
                    new Date("2016-11-1 11:00:00").getTime(),
                    new Date("2016-11-1 11:10:00").getTime(),
                    new Date("2016-11-1 11:20:00").getTime(),
                ],
                y: [3, 1, 2, 4],
            });
            view.delete();
            table.delete();
        });

        test("Arrow with {index: 'i64'} (int)", async function () {
            var table = await perspective.table(arrows.test_arrow.slice(), {
                index: "i64",
            });
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(arrow_result);
            view.delete();
            table.delete();
        });

        test("Arrow with {index: 'char'} (char)", async function () {
            var table = await perspective.table(arrows.test_arrow.slice(), {
                index: "char",
            });
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(arrow_indexed_result);
            view.delete();
            table.delete();
        });

        test("Arrow with {index: 'dict'} (dict)", async function () {
            var table = await perspective.table(arrows.test_arrow.slice(), {
                index: "dict",
            });
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(arrow_indexed_result);
            view.delete();
            table.delete();
        });

        test("multiple updates on int {index: 'x'}", async function () {
            var table = await perspective.table(data, { index: "x" });
            var view = await table.view();
            await table.update(data);
            await table.update(data);
            await table.update(data);
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("multiple updates on str {index: 'y'}", async function () {
            var table = await perspective.table(data, { index: "y" });
            var view = await table.view();
            await table.update(data);
            await table.update(data);
            await table.update(data);
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("multiple updates on str {index: 'y'} with new, old, null pkey", async function () {
            var table = await perspective.table(data, { index: "y" });
            var view = await table.view();
            await table.update([{ x: 1, y: "a", z: true }]);
            await table.update([{ x: 100, y: null, z: true }]);
            await table.update([{ x: 123, y: "abc", z: true }]);
            let result = await view.to_json();
            expect(result).toEqual([
                { x: 100, y: null, z: true },
                { x: 1, y: "a", z: true },
                { x: 123, y: "abc", z: true },
                { x: 2, y: "b", z: false },
                { x: 3, y: "c", z: true },
                { x: 4, y: "d", z: false },
            ]);
            view.delete();
            table.delete();
        });

        test.skip("multiple updates on str {index: 'y'} with new, old, null in dataset", async function () {
            // FIXME: this is an engine bug
            const table = await perspective.table(
                {
                    x: [1, 2, 3],
                    y: ["a", null, "c"],
                },
                { index: "y" },
            );

            const view = await table.view();

            await table.update([{ x: 12345, y: "a" }]);
            await table.update([{ x: 100, y: null }]);
            await table.update([{ x: 123, y: "abc" }]);

            const result = await view.to_json();
            expect(result).toEqual([
                { x: 100, y: null },
                { x: 12345, y: "a" },
                { x: 123, y: "abc" },
                { x: 3, y: "c" },
            ]);

            await view.delete();
            await table.delete();
        });

        test("{index: 'x'} with overlap", async function () {
            var table = await perspective.table(data, { index: "x" });
            var view = await table.view();
            await table.update(data);
            await table.update(data_2);
            let result = await view.to_json();
            expect(result).toEqual(data.slice(0, 2).concat(data_2));
            view.delete();
            table.delete();
        });

        it_old_behavior("update and index (int)", async function (done) {
            var table = await perspective.table(meta, { index: "x" });
            var view = await table.view();
            await table.update(data);
            view.on_update(
                async function (updated) {
                    await match_delta(perspective, updated.delta, data_2);
                    let json = await view.to_json();
                    expect(json).toEqual(data.slice(0, 2).concat(data_2));
                    view.delete();
                    table.delete();
                    done();
                },
                { mode: "row" },
            );
            await table.update(data_2);
        });

        it_old_behavior("update and index (string)", async function (done) {
            var table = await perspective.table(meta, { index: "y" });
            var view = await table.view();
            await table.update(data);
            view.on_update(
                async function (updated) {
                    await match_delta(perspective, updated.delta, data_2);
                    let json = await view.to_json();
                    expect(json).toEqual(data.slice(0, 2).concat(data_2));
                    view.delete();
                    table.delete();
                    done();
                },
                { mode: "row" },
            );
            await table.update(data_2);
        });

        test("update with depth expansion", async function () {
            var table = await perspective.table(meta, { index: "y" });
            var view = await table.view({
                group_by: ["z", "y"],
                columns: [],
            });
            await table.update(data);

            let result = await view.to_json();

            let expected = [
                { __ROW_PATH__: [] },
                { __ROW_PATH__: [false] },
                { __ROW_PATH__: [false, "b"] },
                { __ROW_PATH__: [false, "d"] },
                { __ROW_PATH__: [true] },
                { __ROW_PATH__: [true, "a"] },
                { __ROW_PATH__: [true, "c"] },
            ];
            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        it_old_behavior("partial update", async function (done) {
            var partial = [
                { x: 5, y: "a" },
                { y: "b", z: true },
            ];
            var expected = [
                { x: 5, y: "a", z: true },
                { x: 2, y: "b", z: true },
                { x: 3, y: "c", z: true },
                { x: 4, y: "d", z: false },
            ];
            var table = await perspective.table(meta, { index: "y" });
            var view = await table.view();
            await table.update(data);
            view.on_update(
                async function (updated) {
                    await match_delta(
                        perspective,
                        updated.delta,
                        expected.slice(0, 2),
                    );
                    let json = await view.to_json();
                    expect(json).toEqual(expected);
                    view.delete();
                    table.delete();
                    done();
                },
                { mode: "row" },
            );
            await table.update(partial);
        });

        it_old_behavior(
            "OG - partial column oriented update",
            async function (done) {
                var partial = {
                    x: [5, undefined],
                    y: ["a", "b"],
                    z: [undefined, true],
                };

                var expected = [
                    { x: 5, y: "a", z: true },
                    { x: 2, y: "b", z: true },
                    { x: 3, y: "c", z: true },
                    { x: 4, y: "d", z: false },
                ];
                var table = await perspective.table(meta, { index: "y" });
                var view = await table.view();
                await table.update(col_data);
                view.on_update(
                    async function (updated) {
                        await match_delta(
                            perspective,
                            updated.delta,
                            expected.slice(0, 2),
                        );
                        let json = await view.to_json();
                        expect(json).toEqual(expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" },
                );
                await table.update(partial);
            },
            { skip: true },
        );

        it_old_behavior(
            "partial column oriented update",
            async function (done) {
                var batches = [
                    {
                        x: [5],
                        y: ["a"],
                    },
                    {
                        y: ["b"],
                        z: [true],
                    },
                ];

                var expected = [
                    { x: 5, y: "a", z: true },
                    { x: 2, y: "b", z: true },
                    { x: 3, y: "c", z: true },
                    { x: 4, y: "d", z: false },
                ];
                var table = await perspective.table(meta, { index: "y" });
                var view = await table.view();
                await table.update(col_data);
                view.on_update(
                    async function (updated) {
                        await match_delta(
                            perspective,
                            updated.delta,
                            expected.slice(0, 2),
                        );
                        let json = await view.to_json();
                        expect(json).toEqual(expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" },
                );
                for (const batch of batches) {
                    table.update(batch);
                }
            },
        );

        it_old_behavior(
            "Partial column oriented update with new pkey",
            async function (done) {
                const data = {
                    x: [0, 1, null, 2, 3],
                    y: ["a", "b", "c", "d", "e"],
                };
                const table = await perspective.table(data, { index: "x" });
                const view = await table.view();
                const result = await view.to_columns();

                expect(result).toEqual({
                    x: [null, 0, 1, 2, 3], // null before 0
                    y: ["c", "a", "b", "d", "e"],
                });

                const expected = {
                    x: [null, 0, 1, 2, 3, 4],
                    y: ["c", "a", "b", "d", "e", "f"],
                };

                view.on_update(
                    async function (updated) {
                        await match_delta(perspective, updated.delta, [
                            {
                                x: 4,
                                y: "f",
                            },
                        ]);
                        const result2 = await view.to_columns();
                        expect(result2).toEqual(expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" },
                );

                await table.update({
                    x: [4],
                    y: ["f"],
                });
            },
        );

        it_old_behavior(
            "Partial column oriented update with new pkey, missing columns",
            async function (done) {
                const data = {
                    x: [0, 1, null, 2, 3],
                    y: ["a", "b", "c", "d", "e"],
                    z: [true, false, true, false, true],
                };
                const table = await perspective.table(data, { index: "x" });
                const view = await table.view();
                const result = await view.to_columns();

                expect(result).toEqual({
                    x: [null, 0, 1, 2, 3], // null before 0
                    y: ["c", "a", "b", "d", "e"],
                    z: [true, true, false, false, true],
                });

                const expected = {
                    x: [null, 0, 1, 2, 3, 4],
                    y: ["c", "a", "b", "d", "e", "f"],
                    z: [true, true, false, false, true, null],
                };

                view.on_update(
                    async function (updated) {
                        await match_delta(perspective, updated.delta, [
                            {
                                x: 4,
                                y: "f",
                                z: null,
                            },
                        ]);
                        const result2 = await view.to_columns();
                        expect(result2).toEqual(expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" },
                );

                await table.update({
                    x: [4],
                    y: ["f"],
                });
            },
        );

        it_old_behavior(
            "partial column oriented update with entire columns missing",
            async function (done) {
                var partial = {
                    y: ["a", "b"],
                    z: [false, true],
                };

                var expected = [
                    { x: 1, y: "a", z: false },
                    { x: 2, y: "b", z: true },
                    { x: 3, y: "c", z: true },
                    { x: 4, y: "d", z: false },
                ];
                var table = await perspective.table(meta, { index: "y" });
                var view = await table.view();
                await table.update(col_data);
                view.on_update(
                    async function (updated) {
                        await match_delta(
                            perspective,
                            updated.delta,
                            expected.slice(0, 2),
                        );
                        let json = await view.to_json();
                        expect(json).toEqual(expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" },
                );
                await table.update(partial);
            },
        );
    });

    test.describe("null handling", function () {
        test("recalculates sum aggregates when a null unsets a value", async function () {
            var table = await perspective.table(
                [
                    { x: 1, y: 1 },
                    { x: 2, y: 1 },
                ],
                { index: "x" },
            );
            await table.update([{ x: 2, y: null }]);
            var view = await table.view({
                group_by: ["x"],
                columns: ["y"],
            });
            let json = await view.to_json();
            expect(json).toEqual([
                { __ROW_PATH__: [], y: 1 },
                { __ROW_PATH__: [1], y: 1 },
                { __ROW_PATH__: [2], y: 0 },
            ]);
            view.delete();
            table.delete();
        });

        test("can be removed entirely", async function () {
            var table = await perspective.table([{ x: 1, y: 1 }], {
                index: "x",
            });
            await table.update([{ x: 1, y: null }]);
            await table.update([{ x: 1, y: 1 }]);
            var view = await table.view();
            let json = await view.to_json();
            expect(json).toEqual([{ x: 1, y: 1 }]);
            view.delete();
            table.delete();
        });

        test("partial update with null unsets value", async function () {
            var partial = [{ x: null, y: "a", z: false }];
            var expected = [
                { x: null, y: "a", z: false },
                { x: 2, y: "b", z: false },
                { x: 3, y: "c", z: true },
                { x: 4, y: "d", z: false },
            ];
            var table = await perspective.table(meta, { index: "y" });
            var view = await table.view();
            await table.update(data);
            await table.update(partial);
            const json = await view.to_json();
            expect(json).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("update by adding rows (new pkeys) with partials/nulls", async function () {
            var update = [{ x: null, y: "e", z: null }];
            var expected = [
                { x: 1, y: "a", z: true },
                { x: 2, y: "b", z: false },
                { x: 3, y: "c", z: true },
                { x: 4, y: "d", z: false },
                { x: null, y: "e", z: null },
            ];
            var table = await perspective.table(meta, { index: "y" });
            var view = await table.view();
            await table.update(data);
            await table.update(update);
            const json = await view.to_json();
            expect(json).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("partial column oriented update with null unsets value", async function () {
            var partial = {
                x: [null],
                y: ["a"],
            };

            var expected = [
                { x: null, y: "a", z: true },
                { x: 2, y: "b", z: false },
                { x: 3, y: "c", z: true },
                { x: 4, y: "d", z: false },
            ];
            var table = await perspective.table(meta, { index: "y" });
            var view = await table.view();
            await table.update(col_data);
            await table.update(partial);
            const json = await view.to_json();
            expect(json).toEqual(expected);
            view.delete();
            table.delete();
        });
    });

    test.describe("Viewport", function () {
        test.skip("`height`", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                viewport: {
                    height: 2,
                },
            });
            let result = await view.to_json();
            expect(result).toEqual(data.slice(0, 2));
            view.delete();
            table.delete();
        });

        test.skip("`top`", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                viewport: {
                    top: 2,
                },
            });
            let result = await view.to_json();
            expect(result).toEqual(data.slice(2));
            view.delete();
            table.delete();
        });

        test.skip("`width`", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                viewport: {
                    width: 2,
                },
            });
            var result2 = _.map(data, (x) => _.pick(x, "x", "y"));
            let result = await view.to_json();
            expect(result).toEqual(result2);
            view.delete();
            table.delete();
        });

        test.skip("`left`", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                viewport: {
                    left: 1,
                },
            });
            var result = _.map(data, function (x) {
                return _.pick(x, "y", "z");
            });
            let result2 = await view.to_json();
            expect(result).toEqual(result2);
            view.delete();
            table.delete();
        });

        test.skip("All", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                viewport: {
                    top: 1,
                    left: 1,
                    width: 1,
                    height: 2,
                },
            });
            var result = _.map(data, function (x) {
                return _.pick(x, "y");
            });
            let result2 = await view.to_json();
            expect(result2).toEqual(result.slice(1, 3));
            view.delete();
            table.delete();
        });
    });

    test.describe("implicit index", function () {
        test("should apply single partial update on unindexed table using row id from '__INDEX__'", async function () {
            let table = await perspective.table(data);
            await table.update([
                {
                    __INDEX__: 2,
                    y: "new_string",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[2]["y"] = "new_string";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should partial update on unindexed table, column dataset", async function () {
            let table = await perspective.table(data);
            await table.update({
                __INDEX__: [2],
                y: ["new_string"],
            });

            let view = await table.view();
            let result = await view.to_json();

            // does not unset any values
            expect(result).toEqual([
                { x: 1, y: "a", z: true },
                { x: 2, y: "b", z: false },
                { x: 3, y: "new_string", z: true },
                { x: 4, y: "d", z: false },
            ]);
            view.delete();
            table.delete();
        });

        test("should partial update and unset on unindexed table", async function () {
            let table = await perspective.table(data);
            await table.update([
                {
                    __INDEX__: 2,
                    y: "new_string",
                    z: null,
                },
            ]);

            let view = await table.view();
            let result = await view.to_json();

            // does not unset any values
            expect(result).toEqual([
                { x: 1, y: "a", z: true },
                { x: 2, y: "b", z: false },
                { x: 3, y: "new_string", z: null },
                { x: 4, y: "d", z: false },
            ]);
            view.delete();
            table.delete();
        });

        // ORIGINAL VERSION OF TEST BELOW
        test.skip("OG - should partial update and unset on unindexed table, column dataset", async function () {
            let table = await perspective.table(data);
            await table.update({
                __INDEX__: [0, 2],
                y: [undefined, "new_string"],
                z: [null, undefined],
            });

            let view = await table.view();
            let result = await view.to_json();

            // does not unset any values
            expect(result).toEqual([
                { x: 1, y: "a", z: null },
                { x: 2, y: "b", z: false },
                { x: 3, y: "new_string", z: true },
                { x: 4, y: "d", z: false },
            ]);
            view.delete();
            table.delete();
        });

        // Split the updates to avoid handling `undefined` values.
        test("should partial update and unset on unindexed table, column dataset", async function () {
            let table = await perspective.table(data);
            await table.update({
                __INDEX__: [0],
                z: [null],
            });
            await table.update({
                __INDEX__: [2],
                y: ["new_string"],
            });

            let view = await table.view();
            let result = await view.to_json();

            // does not unset any values
            expect(result).toEqual([
                { x: 1, y: "a", z: null },
                { x: 2, y: "b", z: false },
                { x: 3, y: "new_string", z: true },
                { x: 4, y: "d", z: false },
            ]);
            view.delete();
            table.delete();
        });

        test("should apply single multi-column partial update on unindexed table using row id from '__INDEX__'", async function () {
            let table = await perspective.table(data);
            await table.update([
                {
                    __INDEX__: 2,
                    y: "new_string",
                    x: 100,
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[2]["x"] = 100;
            expected[2]["y"] = "new_string";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should apply updates using '__INDEX__' on a table with explicit index set", async function () {
            let table = await perspective.table(data, { index: "x" });
            await table.update([
                {
                    __INDEX__: 2,
                    y: "new_string",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[1]["y"] = "new_string";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should apply multiple sequential updates using '__INDEX__' on a table with explicit index set", async function () {
            let table = await perspective.table(data, { index: "x" });
            await table.update([
                {
                    __INDEX__: 2,
                    y: "new_string",
                },
                {
                    __INDEX__: 3,
                    y: "new_string",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[1]["y"] = "new_string";
            expected[2]["y"] = "new_string";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should apply mulitple nonsequential updates using '__INDEX__' on a table with explicit index set", async function () {
            let table = await perspective.table(data, { index: "x" });
            await table.update([
                {
                    __INDEX__: 2,
                    y: "new_string",
                },
                {
                    __INDEX__: 4,
                    y: "new_string",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[1]["y"] = "new_string";
            expected[3]["y"] = "new_string";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should apply multiple sequential partial updates on unindexed table using '__INDEX__'", async function () {
            let table = await perspective.table(data);
            await table.update([
                {
                    __INDEX__: 0,
                    y: "new_string1",
                },
                {
                    __INDEX__: 1,
                    y: "new_string2",
                },
                {
                    __INDEX__: 2,
                    y: "new_string3",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[0]["y"] = "new_string1";
            expected[1]["y"] = "new_string2";
            expected[2]["y"] = "new_string3";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should correctly apply multiple out-of-sequence partial updates on unindexed table using '__INDEX__'", async function () {
            let table = await perspective.table(data);
            await table.update([
                {
                    __INDEX__: 0,
                    y: "new_string1",
                },
                {
                    __INDEX__: 2,
                    y: "new_string3",
                },
                {
                    __INDEX__: 3,
                    y: "new_string4",
                },
                {
                    __INDEX__: 1,
                    y: "new_string2",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[0]["y"] = "new_string1";
            expected[1]["y"] = "new_string2";
            expected[2]["y"] = "new_string3";
            expected[3]["y"] = "new_string4";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should stack multiple partial updates on unindexed table using the same '__INDEX__'", async function () {
            let table = await perspective.table(data);
            await table.update([
                {
                    __INDEX__: 0,
                    y: "new_string1",
                },
                {
                    __INDEX__: 0,
                    y: "new_string2",
                },
                {
                    __INDEX__: 0,
                    y: "new_string3",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[0]["y"] = "new_string3";

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("updates without '__INDEX' should append", async function () {
            let table = await perspective.table(data);
            await table.update([
                {
                    __INDEX__: 0,
                    y: "new_string",
                },
            ]);
            await table.update([
                {
                    y: "new_string",
                },
            ]);
            let view = await table.view();
            let result = await view.to_json();

            let expected = JSON.parse(JSON.stringify(data));
            expected[0]["y"] = "new_string";
            expected.push({ x: null, y: "new_string", z: null });

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("should partial update on 1-sided views using implicit '__INDEX__'", async function () {
            let table = await perspective.table(data);
            let view = await table.view({
                group_by: ["x"],
            });

            await table.update([
                {
                    __INDEX__: 0,
                    x: 100,
                },
            ]);

            let result = await view.to_json();
            // update should be applied properly
            expect(result).toEqual([
                { __ROW_PATH__: [], x: 109, y: 4, z: 4 },
                { __ROW_PATH__: [2], x: 2, y: 1, z: 1 },
                { __ROW_PATH__: [3], x: 3, y: 1, z: 1 },
                { __ROW_PATH__: [4], x: 4, y: 1, z: 1 },
                { __ROW_PATH__: [100], x: 100, y: 1, z: 1 },
            ]);

            // check that un-pivoted view reflects data correctly
            let view2 = await table.view();
            let result2 = await view2.to_json();
            let expected = JSON.parse(JSON.stringify(data));
            expected[0]["x"] = 100;

            expect(result2).toEqual(expected);

            view.delete();
            view2.delete();
            table.delete();
        });

        test("should partial update on 2-sided views using implicit '__INDEX__'", async function () {
            let table = await perspective.table(data);
            let view = await table.view({
                group_by: ["x"],
                split_by: ["y"],
            });

            await table.update([
                {
                    __INDEX__: 0,
                    x: 100,
                },
            ]);

            let result = await view.to_json();
            // update should be applied properly
            expect(result).toEqual([
                {
                    __ROW_PATH__: [],
                    "a|x": 100,
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
                {
                    __ROW_PATH__: [100],
                    "a|x": 100,
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
            ]);

            // check that un-pivoted view reflects data correctly
            let view2 = await table.view();
            let result2 = await view2.to_json();
            let expected = JSON.parse(JSON.stringify(data));
            expected[0]["x"] = 100;

            expect(result2).toEqual(expected);

            view.delete();
            view2.delete();
            table.delete();
        });
    });

    test.describe("Remove update", function () {
        it_old_behavior("Should remove a single update", async function (done) {
            let count = 0;
            const cb1 = () => {
                count += 1;
            };

            const cb2 = () => {
                expect(count).toEqual(0);
                setTimeout(() => {
                    view.delete();
                    table.delete();
                    done();
                }, 0);
            };

            const table = await perspective.table(meta);
            const view = await table.view();
            const sub1 = view.on_update(cb1);
            view.on_update(cb2);
            view.remove_update(await sub1);
            await table.update(data);
        });

        it_old_behavior(
            "Should remove multiple updates",
            async function (done) {
                let count1 = 0;
                const cb1 = () => {
                    count1 += 1;
                };

                let count2 = 0;
                const cb2 = () => {
                    count2 += 1;
                };

                const cb3 = function () {
                    // cb2 should have been called
                    expect(count1).toEqual(0);
                    expect(count2).toEqual(0);
                    setTimeout(() => {
                        view.delete();
                        table.delete();
                        done();
                    }, 0);
                };

                const table = await perspective.table(meta);
                const view = await table.view();
                const sub1 = view.on_update(cb1);
                const sub2 = view.on_update(cb2);
                view.on_update(cb3);
                view.remove_update(await sub1);
                view.remove_update(await sub2);
                await table.update(data);
            },
        );
    });

    test.describe("Filtered update and remove", () => {
        let table, flat_view, filtered_view;

        test.beforeEach(async () => {
            table = await perspective.table(
                {
                    x: "integer",
                    y: "string",
                },
                { index: "x" },
            );

            flat_view = await table.view();
            filtered_view = await table.view({ filter: [["y", "==", "a"]] });
        });

        test.afterEach(async () => {
            await filtered_view.delete();
            await flat_view.delete();

            filtered_view = null;
            flat_view = null;
        });

        test.afterAll(async () => {
            if (filtered_view) await filtered_view.delete();
            if (flat_view) await flat_view.delete();
            await table.delete();
        });

        test("View output should always be consistent with filter", async () => {
            let i = 0,
                op = 0,
                update_idx = 1,
                remove_idx = 0;

            for (i; i < 90; i++) {
                if (op > 2) op = 0;

                switch (op) {
                    case 0:
                        {
                            // insert
                            await table.update({
                                x: [i],
                                y: [i % 2 ? "a" : "b"],
                            });
                        }
                        break;
                    case 1:
                        {
                            // partial update
                            await table.update({
                                x: [update_idx],
                                y: [update_idx % 2 ? "b" : "a"],
                            });

                            update_idx++;
                        }
                        break;
                    case 2:
                        {
                            // remove
                            await table.remove([remove_idx]);
                            remove_idx++;
                        }
                        break;
                    default:
                        break;
                }

                const flat = await flat_view.to_json();
                expect(await filtered_view.to_json()).toEqual(
                    flat.filter((row) => row.y === "a"),
                );
                op++;
            }
        });

        test("View output should always be consistent with filter, recreating views", async () => {
            let i = 0,
                op = 0,
                update_idx = 1,
                remove_idx = 0;

            for (i; i < 90; i++) {
                if (op > 3) op = 0;

                switch (op) {
                    case 0:
                        {
                            // insert
                            await table.update({
                                x: [i],
                                y: [i % 2 ? "a" : "b"],
                            });
                        }
                        break;
                    case 1:
                        {
                            // partial update
                            await table.update({
                                x: [update_idx],
                                y: [update_idx % 2 ? "b" : "a"],
                            });

                            update_idx++;
                        }
                        break;
                    case 2:
                        {
                            // remove
                            await table.remove([remove_idx]);
                            remove_idx++;
                        }
                        break;
                    case 3: {
                        // recreate views
                        await flat_view.delete();
                        flat_view = await table.view();

                        await filtered_view.delete();
                        filtered_view = await table.view({
                            filter: [["y", "==", "a"]],
                        });
                    }
                    default:
                        break;
                }

                const flat = await flat_view.to_json();
                expect(await filtered_view.to_json()).toEqual(
                    flat.filter((row) => row.y === "a"),
                );
                op++;
            }
        });

        test("View output should always be consistent with filter, deterministic", async () => {
            filtered_view = await table.view({ filter: [["y", "==", "b"]] });

            for (let i = 0; i < 10; i++) {
                // append new rows
                await table.update([{ x: i, y: "a" }]);
                expect(await table.size()).toEqual(i + 1);

                // make sure appended
                const result = await flat_view.to_json();
                expect(result[result.length - 1]).toEqual({ x: i, y: "a" });

                // filtering
                expect(await filtered_view.to_json()).toEqual(
                    result.filter((row) => row.y === "b"),
                );
            }

            await filtered_view.delete();

            // new view with filter
            filtered_view = await table.view({ filter: [["y", "==", "a"]] });
            let flat = await flat_view.to_json();
            let filtered = await filtered_view.to_json();

            expect(flat.length).toEqual(filtered.length);
            expect(filtered).toEqual(flat);

            for (let i = 0; i < 10; i++) {
                // partial update rows
                if (i % 2 == 0) {
                    await table.update([{ x: i, y: "b" }]);

                    flat = await flat_view.to_json();
                    filtered = await filtered_view.to_json();
                    expect(flat.length).toBeGreaterThan(filtered.length);
                    expect(flat.filter((row) => row.x === i)[0]).toEqual({
                        x: i,
                        y: "b",
                    });
                    expect(filtered).toEqual(
                        flat.filter((row) => row.y === "a"),
                    );

                    // partial updates not appends
                    expect(await table.size()).toEqual(10);
                }
            }

            // Remove "b" rows
            flat = await flat_view.to_json();
            await table.remove(
                flat.filter((row) => row.y === "b").map((row) => row.x),
            );
            expect(await flat_view.to_json()).toEqual([
                { x: 1, y: "a" },
                { x: 3, y: "a" },
                { x: 5, y: "a" },
                { x: 7, y: "a" },
                { x: 9, y: "a" },
            ]);
        });

        test("Output consistent with filter, out of order", async () => {
            const tbl = await perspective.table(
                {
                    index: "string",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: ["a", "d", "b"],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove(["b"]);

            const view2 = await tbl.view({ filter: [["x", "==", "abc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([{ index: "a", x: "abc" }]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, string small", async () => {
            const tbl = await perspective.table(
                {
                    index: "string",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({ index: ["a", "c"], x: ["abc", "def"] });
            await tbl.remove(["c"]);

            const view2 = await tbl.view({ filter: [["x", "==", "abc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([{ index: "a", x: "abc" }]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, ordered", async () => {
            const tbl = await perspective.table(
                {
                    index: "string",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: ["a", "b", "c"],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove(["b"]);

            const view2 = await tbl.view({ filter: [["x", "==", "abc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([{ index: "a", x: "abc" }]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, numeric index out of order", async () => {
            const tbl = await perspective.table(
                {
                    index: "float",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({ index: [50, 1, 2], x: ["abc", "def", "acc"] });
            await tbl.remove([1]);

            const view2 = await tbl.view({ filter: [["x", "==", "acc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([{ index: 2, x: "acc" }]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, numeric index ordered", async () => {
            const tbl = await perspective.table(
                {
                    index: "float",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({ index: [1, 2, 3], x: ["abc", "def", "acc"] });
            await tbl.remove([3]);

            const view2 = await tbl.view({ filter: [["x", "==", "def"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([{ index: 2, x: "def" }]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, date index out of order", async () => {
            const tbl = await perspective.table(
                {
                    index: "date",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: [
                    new Date(2021, 3, 15),
                    new Date(2009, 1, 13),
                    new Date(2015, 5, 10),
                ],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove([1]);

            const view2 = await tbl.view({ filter: [["x", "==", "acc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([
                { index: new Date(2015, 5, 10).getTime(), x: "acc" },
            ]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, date index ordered", async () => {
            const tbl = await perspective.table(
                {
                    index: "date",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: [
                    new Date(2009, 1, 13),
                    new Date(2015, 5, 10),
                    new Date(2021, 3, 15),
                ],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove([3]);

            const view2 = await tbl.view({ filter: [["x", "==", "def"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([
                { index: new Date(2015, 5, 10).getTime(), x: "def" },
            ]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, datetime index out of order", async () => {
            const tbl = await perspective.table(
                {
                    index: "datetime",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: [
                    new Date(2021, 3, 15, 5, 10, 3),
                    new Date(2009, 1, 13, 0, 0, 1),
                    new Date(2015, 5, 10, 15, 10, 2),
                ],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove([1]);

            const view2 = await tbl.view({ filter: [["x", "==", "acc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([
                { index: new Date(2015, 5, 10, 15, 10, 2).getTime(), x: "acc" },
            ]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, datetime index ordered", async () => {
            const tbl = await perspective.table(
                {
                    index: "datetime",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: [
                    new Date(2009, 1, 13, 0, 0, 1),
                    new Date(2015, 5, 10, 15, 10, 2),
                    new Date(2021, 3, 15, 5, 10, 3),
                ],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove([3]);

            const view2 = await tbl.view({ filter: [["x", "==", "def"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([
                { index: new Date(2015, 5, 10, 15, 10, 2).getTime(), x: "def" },
            ]);
            console.log(await view2.to_json());

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, out of order updates", async () => {
            const tbl = await perspective.table(
                {
                    index: "string",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: ["a", "d", "b"],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove(["b"]);

            const view2 = await tbl.view({ filter: [["x", "==", "abc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([{ index: "a", x: "abc" }]);

            await tbl.update([{ index: "b", x: "abc" }]);

            expect(await view2.to_json()).toEqual([
                { index: "a", x: "abc" },
                { index: "b", x: "abc" },
            ]);

            await tbl.remove(["a"]);

            expect(await view2.to_json()).toEqual([{ index: "b", x: "abc" }]);

            await tbl.update([
                { index: "a", x: "abc" },
                { index: null, x: "abc" },
            ]);

            expect(await view2.to_json()).toEqual([
                { index: null, x: "abc" },
                { index: "a", x: "abc" },
                { index: "b", x: "abc" },
            ]);

            const indices = "abcdefghijklmnopqrstuvwxyz".split("");

            for (const idx of indices) {
                await tbl.update([{ index: idx, x: "abc" }]);
            }

            let result = await view2.to_json();
            expect(result[0]).toEqual({ index: null, x: "abc" });

            result = result.slice(1);

            for (let i = 0; i < result.length; i++) {
                expect(result[i]).toEqual({ index: indices[i], x: "abc" });
            }

            await view2.delete();
            await tbl.delete();
        });

        test("Output consistent with filter, out of order updates random", async () => {
            const tbl = await perspective.table(
                {
                    index: "string",
                    x: "string",
                },
                { index: "index" },
            );
            const view = await tbl.view();

            await tbl.update({
                index: ["a", "d", "b"],
                x: ["abc", "def", "acc"],
            });
            await tbl.remove(["b"]);

            const view2 = await tbl.view({ filter: [["x", "==", "abc"]] });
            await view.delete();

            expect(await view2.to_json()).toEqual([{ index: "a", x: "abc" }]);

            await tbl.update([{ index: "b", x: "abc" }]);

            expect(await view2.to_json()).toEqual([
                { index: "a", x: "abc" },
                { index: "b", x: "abc" },
            ]);

            await tbl.remove(["a"]);

            expect(await view2.to_json()).toEqual([{ index: "b", x: "abc" }]);

            await tbl.update([
                { index: "a", x: "abc" },
                { index: null, x: "abc" },
            ]);

            expect(await view2.to_json()).toEqual([
                { index: null, x: "abc" },
                { index: "a", x: "abc" },
                { index: "b", x: "abc" },
            ]);

            // randomize
            let indices = "abcdefghijklmnopqrstuvwxyz"
                .split("")
                .map((v) => {
                    return { value: v, key: Math.random() };
                })
                .sort((a, b) => a.key - b.key)
                .map((v) => v.value);

            // console.log(indices);

            for (const idx of indices) {
                await tbl.update([{ index: idx, x: "abc" }]);
            }

            let result = await view2.to_json();
            expect(result[0]).toEqual({ index: null, x: "abc" });

            result = result.slice(1);

            indices = indices.sort();

            for (let i = 0; i < result.length; i++) {
                expect(result[i]).toEqual({ index: indices[i], x: "abc" });
            }

            await view2.delete();
            await tbl.delete();
        });

        test("Delete a table with pending updates", async () => {
            const tbl = await perspective.table(
                {
                    index: "string",
                    x: "string",
                },
                { index: "index" },
            );

            for (let i = 0; i < 3; i++) {
                tbl.update({
                    index: ["a", "d", "b"],
                    x: ["abc", "def", "acc"],
                });
            }
            await tbl.delete();
        });
    });

    // Regression coverage for the `t_ftrav::step_end` fast-path leak: a
    // pass containing only `update_row` calls (every pkey already exists)
    // used to take the fast path because `m_step_inserts` and
    // `m_step_deletes` are both zero — leaving `m_updated` flags stamped
    // on `m_index` and dropping the staged replacements from
    // `m_new_elems`. The next pass that *did* trigger a rebuild (any
    // `add_row` or `delete_row`) skipped the flagged entries with no
    // counterpart to reinstate them, and the rows silently disappeared
    // from the sorted view.
    test.describe("Update under sorted view", function () {
        const d1 = +new Date("2024-01-01T00:00:00Z");
        const d2 = +new Date("2024-01-02T00:00:00Z");
        const d3 = +new Date("2024-01-03T00:00:00Z");
        const d4 = +new Date("2024-01-04T00:00:00Z");
        const d5 = +new Date("2024-01-05T00:00:00Z");

        async function seed(perspective) {
            const table = await perspective.table(
                { id: "integer", ts: "datetime", payload: "string" },
                { index: "id" },
            );
            await table.update({
                id: [1, 2, 3, 4],
                ts: [d1, d2, d3, d4],
                payload: ["a", "b", "c", "d"],
            });
            return table;
        }

        test("baseline: update existing rows then append a new row", async function () {
            const table = await seed(perspective);
            const view = await table.view({ sort: [["ts", "asc"]] });
            await table.update({ id: [2, 3], payload: ["bb", "cc"] });
            await table.update({ id: [5], ts: [d5], payload: ["e"] });

            const cols = await view.to_columns();
            expect(await view.num_rows()).toEqual(5);
            expect(cols.id).toEqual([1, 2, 3, 4, 5]);
            expect(cols.payload).toEqual(["a", "bb", "cc", "d", "e"]);
            expect(cols.ts).toEqual([d1, d2, d3, d4, d5]);

            await view.delete();
            await table.delete();
        });

        test("update-only pass is correct on its own", async function () {
            const table = await seed(perspective);
            const view = await table.view({ sort: [["ts", "asc"]] });
            await table.update({ id: [2, 3], payload: ["bb", "cc"] });

            const cols = await view.to_columns();
            expect(await view.num_rows()).toEqual(4);
            expect(cols.id).toEqual([1, 2, 3, 4]);
            expect(cols.payload).toEqual(["a", "bb", "cc", "d"]);

            await view.delete();
            await table.delete();
        });

        test("multiple update-only passes before an insert", async function () {
            const table = await seed(perspective);
            const view = await table.view({ sort: [["ts", "asc"]] });
            await table.update({ id: [2], payload: ["b1"] });
            await table.update({ id: [3], payload: ["c1"] });
            await table.update({ id: [2], payload: ["b2"] });

            await table.update({ id: [5], ts: [d5], payload: ["e"] });

            const cols = await view.to_columns();
            expect(await view.num_rows()).toEqual(5);
            expect(cols.id).toEqual([1, 2, 3, 4, 5]);
            expect(cols.payload).toEqual(["a", "b2", "c1", "d", "e"]);

            await view.delete();
            await table.delete();
        });

        test("update that changes the sort key, then append", async function () {
            const table = await seed(perspective);
            const view = await table.view({ sort: [["ts", "asc"]] });
            const d_late = +new Date("2024-01-10T00:00:00Z");
            await table.update({ id: [2], ts: [d_late] });

            await table.update({ id: [5], ts: [d5], payload: ["e"] });

            const cols = await view.to_columns();
            expect(await view.num_rows()).toEqual(5);
            expect(cols.id).toEqual([1, 3, 4, 5, 2]);
            expect(cols.ts).toEqual([d1, d3, d4, d5, d_late]);

            await view.delete();
            await table.delete();
        });

        test("update-only pass followed by a delete", async function () {
            const table = await seed(perspective);
            const view = await table.view({ sort: [["ts", "asc"]] });

            await table.update({ id: [2, 3], payload: ["bb", "cc"] });
            await table.remove([4]);

            const cols = await view.to_columns();
            expect(await view.num_rows()).toEqual(3);
            expect(cols.id).toEqual([1, 2, 3]);
            expect(cols.payload).toEqual(["a", "bb", "cc"]);

            await view.delete();
            await table.delete();
        });

        test("no sort: update-only pass + append is unaffected", async function () {
            const table = await seed(perspective);
            const view = await table.view();

            await table.update({ id: [2, 3], payload: ["bb", "cc"] });
            await table.update({ id: [5], ts: [d5], payload: ["e"] });

            expect(await view.num_rows()).toEqual(5);

            await view.delete();
            await table.delete();
        });
    });
})(perspective);
