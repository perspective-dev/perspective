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

import * as common from "./common.js";

const data = [
    { x: 1, y: 2 },
    { x: 2, y: 4 },
    { x: 3, y: 6 },
    { x: 4, y: 8 },
];

const pivot_data = [
    { int: 1, float: 2.25 },
    { int: 2, float: 3.5 },
    { int: 3, float: 4.75 },
    { int: 4, float: 5.25 },
];

/**
 * Tests the correctness of updates on Tables with expression columns created
 * through `View`, including partial updates, appends, and removes.
 */
((perspective) => {
    test.describe("Expression updates", function () {
        test("Scalar-only expressions should respond to appends", async function () {
            const table = await perspective.table({
                x: [1.5, 2.5, 3.5, 4.5],
                y: ["A", "B", "C", "D"],
            });
            const view = await table.view({
                expressions: [
                    "10 + 20",
                    "lower('ABC')",
                    "concat('hello', ' ', 'world', ', ', 'here is a long, long, long string with lots of characters')",
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            const before = await view.to_columns();
            expect(before["10 + 20"]).toEqual([30, 30, 30, 30]);
            expect(before["lower('ABC')"]).toEqual([
                "abc",
                "abc",
                "abc",
                "abc",
            ]);
            expect(
                before[
                    "concat('hello', ' ', 'world', ', ', 'here is a long, long, long string with lots of characters')"
                ]
            ).toEqual([
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
            ]);
            table.update({ x: [5, 6, 7] });

            const after = await view.to_columns();
            expect(after["10 + 20"]).toEqual([30, 30, 30, 30, 30, 30, 30]);
            expect(after["lower('ABC')"]).toEqual([
                "abc",
                "abc",
                "abc",
                "abc",
                "abc",
                "abc",
                "abc",
            ]);
            expect(
                after[
                    "concat('hello', ' ', 'world', ', ', 'here is a long, long, long string with lots of characters')"
                ]
            ).toEqual([
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
            ]);
            view.delete();
            table.delete();
        });

        test("Conditional expressions should respond to appends", async function () {
            const table = await perspective.table({
                x: [1.5, 2.5, 3.5, 4.5],
                y: ["A", "B", "C", "D"],
            });
            const view = await table.view({
                // conditional here must be float, as int-float comparisons
                // don't work as of yet.
                expressions: [
                    'if ("x" > 4) 10; else 100',
                    `"y" == 'A' ? true : false`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            const before = await view.to_columns();
            expect(before['if ("x" > 4) 10; else 100']).toEqual([
                100, 100, 100, 10,
            ]);
            expect(before[`"y" == 'A' ? true : false`]).toEqual([
                true,
                false,
                false,
                false,
            ]);

            table.update({ x: [5, 6, 7], y: ["A", "A", "B"] });

            const after = await view.to_columns();
            expect(after['if ("x" > 4) 10; else 100']).toEqual([
                100, 100, 100, 10, 10, 10, 10,
            ]);
            expect(after[`"y" == 'A' ? true : false`]).toEqual([
                true,
                false,
                false,
                false,
                true,
                true,
                false,
            ]);

            view.delete();
            table.delete();
        });

        test("Scalar-only expressions should respond to partial updates", async function () {
            const table = await perspective.table(
                {
                    x: [1.5, 2.5, 3.5, 4.5],
                    y: ["A", "B", "C", "D"],
                },
                { index: "y" }
            );
            const view = await table.view({
                expressions: [
                    "10 + 20",
                    "lower('ABC')",
                    "concat('hello', ' ', 'world', ', ', 'here is a long, long, long string with lots of characters')",
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });

            const before = await view.to_columns();
            expect(before["10 + 20"]).toEqual([30, 30, 30, 30]);
            expect(before["lower('ABC')"]).toEqual([
                "abc",
                "abc",
                "abc",
                "abc",
            ]);
            expect(
                before[
                    "concat('hello', ' ', 'world', ', ', 'here is a long, long, long string with lots of characters')"
                ]
            ).toEqual([
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
            ]);

            table.update({ x: [5, 6, 7], y: ["A", "B", "D"] });

            const after = await view.to_columns();
            expect(after["10 + 20"]).toEqual([30, 30, 30, 30]);
            expect(after["lower('ABC')"]).toEqual(["abc", "abc", "abc", "abc"]);
            expect(
                after[
                    "concat('hello', ' ', 'world', ', ', 'here is a long, long, long string with lots of characters')"
                ]
            ).toEqual([
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
                "hello world, here is a long, long, long string with lots of characters",
            ]);

            view.delete();
            table.delete();
        });

        test("Expressions should respond to multiple streaming updates", async function () {
            const table = await perspective.table({
                x: [1.5, 2.5, 3.5, 4.5],
                y: ["A", "B", "C", "D"],
            });
            const view = await table.view({
                expressions: {
                    123: "123",
                    c0: '10 + "x"',
                    c1: 'lower("y")',
                    c2: `concat("y", ' ', 'abcd')`,
                },
            });

            const before = await view.to_columns();
            expect(before["123"]).toEqual(Array(4).fill(123));
            expect(before["c0"]).toEqual([11.5, 12.5, 13.5, 14.5]);
            expect(before["c1"]).toEqual(["a", "b", "c", "d"]);
            expect(before["c2"]).toEqual([
                "A abcd",
                "B abcd",
                "C abcd",
                "D abcd",
            ]);

            for (let i = 0; i < 5; i++) {
                table.update({
                    x: [1.5, 2.5, 3.5, 4.5],
                    y: ["A", "B", "C", "D"],
                });
            }

            const after = await view.to_columns();
            expect(await view.num_rows()).toEqual(24);
            console.log(after);
            expect(after["123"]).toEqual(Array(24).fill(123));
            expect(after["c0"]).toEqual([
                11.5, 12.5, 13.5, 14.5, 11.5, 12.5, 13.5, 14.5, 11.5, 12.5,
                13.5, 14.5, 11.5, 12.5, 13.5, 14.5, 11.5, 12.5, 13.5, 14.5,
                11.5, 12.5, 13.5, 14.5,
            ]);
            expect(after["c1"]).toEqual([
                "a",
                "b",
                "c",
                "d",
                "a",
                "b",
                "c",
                "d",
                "a",
                "b",
                "c",
                "d",
                "a",
                "b",
                "c",
                "d",
                "a",
                "b",
                "c",
                "d",
                "a",
                "b",
                "c",
                "d",
            ]);
            expect(after["c2"]).toEqual([
                "A abcd",
                "B abcd",
                "C abcd",
                "D abcd",
                "A abcd",
                "B abcd",
                "C abcd",
                "D abcd",
                "A abcd",
                "B abcd",
                "C abcd",
                "D abcd",
                "A abcd",
                "B abcd",
                "C abcd",
                "D abcd",
                "A abcd",
                "B abcd",
                "C abcd",
                "D abcd",
                "A abcd",
                "B abcd",
                "C abcd",
                "D abcd",
            ]);

            view.delete();
            table.delete();
        });

        test("Conditional expressions should respond to partial updates", async function () {
            const table = await perspective.table(
                {
                    x: [1.5, 2.5, 3.5, 4.5],
                    y: ["A", "B", "C", "D"],
                    z: ["a", "b", "c", "d"],
                },
                { index: "y" }
            );
            const view = await table.view({
                expressions: [
                    'if ("x" > 4) 10; else 100',
                    `"z" == 'a' ? true : false`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            const before = await view.to_columns();
            expect(before['if ("x" > 4) 10; else 100']).toEqual([
                100, 100, 100, 10,
            ]);
            expect(before[`"z" == 'a' ? true : false`]).toEqual([
                true,
                false,
                false,
                false,
            ]);
            table.update({
                x: [5, 6, 7],
                y: ["A", "C", "D"],
                z: ["a", "a", "a"],
            });

            const after = await view.to_columns();
            expect(after['if ("x" > 4) 10; else 100']).toEqual([
                10, 100, 10, 10,
            ]);
            expect(after[`"z" == 'a' ? true : false`]).toEqual([
                true,
                false,
                true,
                true,
            ]);
            view.delete();
            table.delete();
        });

        test("Appends should notify expression column", async function () {
            const table = await perspective.table({
                x: [1, 2, 3, 4],
                y: ["A", "B", "C", "D"],
            });
            const view = await table.view({
                expressions: { 'lower("y")': 'lower("y")' },
            });

            const before = await view.to_columns();
            expect(before['lower("y")']).toEqual(["a", "b", "c", "d"]);
            table.update({ y: ["HELLO", "WORLD"] });

            const after = await view.to_columns();
            expect(after['lower("y")']).toEqual([
                "a",
                "b",
                "c",
                "d",
                "hello",
                "world",
            ]);
            view.delete();
            table.delete();
        });

        test("Multiple appends should notify expression column", async function () {
            const table = await perspective.table({
                x: [1, 2, 3, 4],
                y: ["A", "B", "C", "D"],
            });
            const view = await table.view({
                expressions: { 'lower("y")': 'lower("y")' },
            });

            const before = await view.to_columns();
            expect(before['lower("y")']).toEqual(["a", "b", "c", "d"]);
            table.update({ y: ["HELLO", "WORLD"] });

            const result = await view.to_columns();
            expect(result['lower("y")']).toEqual([
                "a",
                "b",
                "c",
                "d",
                "hello",
                "world",
            ]);

            table.update({ x: [12, 34], y: ["XYZ", "ABCdEFg"] });

            const result2 = await view.to_columns();
            expect(result2["x"]).toEqual([1, 2, 3, 4, null, null, 12, 34]);
            expect(result2['lower("y")']).toEqual([
                "a",
                "b",
                "c",
                "d",
                "hello",
                "world",
                "xyz",
                "abcdefg",
            ]);

            view.delete();
            table.delete();
        });

        test("Appends should notify expression column with multiple columns", async function () {
            const table = await perspective.table({
                x: [1, 2, 3, 4],
                y: [1.5, 2.5, 3.5, 4.5],
                z: [2, 4, 6, 8],
            });
            const view = await table.view({
                expressions: {
                    '"x" + ("y" + 5.5) / "z"': '"x" + ("y" + 5.5) / "z"',
                },
            });

            const before = await view.to_columns();
            expect(before['"x" + ("y" + 5.5) / "z"']).toEqual([
                4.5, 4, 4.5, 5.25,
            ]);

            table.update({
                x: [5, 6, 7, 8],
                y: [5.5, 6.5, 7.5, 8.5],
                z: [10, 10, 10, 10],
            });

            const after = await view.to_columns();
            expect(after['"x" + ("y" + 5.5) / "z"']).toEqual([
                4.5, 4, 4.5, 5.25, 6.1, 7.2, 8.3, 9.4,
            ]);
            view.delete();
            table.delete();
        });

        test("Partial updates should notify expression column", async function () {
            const table = await perspective.table(
                {
                    x: [1, 2, 3, 4],
                    y: ["A", "B", "C", "D"],
                },
                { index: "x" }
            );
            const view = await table.view({
                expressions: { 'lower("y")': 'lower("y")' },
            });

            const before = await view.to_columns();
            expect(before['lower("y")']).toEqual(["a", "b", "c", "d"]);
            table.update({ x: [1, 3], y: ["HELLO", "WORLD"] });

            const after = await view.to_columns();
            expect(after['lower("y")']).toEqual(["hello", "b", "world", "d"]);
            view.delete();
            table.delete();
        });

        test("Dependent column appends with missing columns should notify expression columns", async function () {
            const table = await perspective.table({
                x: [1, 2, 3, 4],
                y: [1.5, 2.5, 3.5, 4.5],
                z: ["a", "b", "c", "d"],
            });
            const view = await table.view({
                expressions: { 'upper("z")': 'upper("z")' },
            });
            const before = await view.to_columns();
            expect(before['upper("z")']).toEqual(["A", "B", "C", "D"]);

            // `z` is missing in the update, so it should render as null
            table.update({ x: [2, 4], y: [10.5, 12.5] });

            const after = await view.to_columns();
            expect(after).toEqual({
                x: [1, 2, 3, 4, 2, 4],
                y: [1.5, 2.5, 3.5, 4.5, 10.5, 12.5],
                z: ["a", "b", "c", "d", null, null],
                'upper("z")': ["A", "B", "C", "D", null, null],
            });
            view.delete();
            table.delete();
        });

        test("Dependent column update appends should notify expression columns, pivoted arity 1", async function () {
            const table = await perspective.table({
                x: [1, 2, 3, 4],
                y: ["A", "B", "C", "C"],
            });
            const view = await table.view({
                group_by: ['lower("y")'],
                expressions: { 'lower("y")': 'lower("y")' },
            });

            const before = await view.to_columns();
            expect(before).toEqual({
                __ROW_PATH__: [[], ["a"], ["b"], ["c"]],
                'lower("y")': [4, 1, 1, 2],
                x: [10, 1, 2, 7],
                y: [4, 1, 1, 2],
            });

            table.update({ y: ["HELLO", "WORLD"] });

            const after = await view.to_columns();
            expect(after).toEqual({
                __ROW_PATH__: [[], ["a"], ["b"], ["c"], ["hello"], ["world"]],
                'lower("y")': [6, 1, 1, 2, 1, 1],
                x: [10, 1, 2, 7, 0, 0],
                y: [6, 1, 1, 2, 1, 1],
            });
            view.delete();
            table.delete();
        });

        test("Dependent column appends should notify expression columns, arity 2", async function () {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: { '"w" + "x"': '"w" + "x"' },
            });
            const before = await view.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);

            table.update({ x: [2, 4], w: [10.5, 12.5] });

            const after = await view.to_columns();
            expect(after['"w" + "x"']).toEqual([
                2.5, 4.5, 6.5, 8.5, 12.5, 16.5,
            ]);
            view.delete();
            table.delete();
        });

        test("Dependent column updates on all column updates should notify expression columns, arity 2", async function () {
            const table = await perspective.table(common.int_float_data, {
                index: "x",
            });
            const view = await table.view({
                expressions: {
                    '"w" + "x"': '"w" + "x"',
                    'upper("y")': 'upper("y")',
                },
            });
            let before = await view.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before['upper("y")']).toEqual(["A", "B", "C", "D"]);

            table.update({ x: [2, 4], w: [10.5, 12.5] });

            const after = await view.to_columns();
            expect(after['"w" + "x"']).toEqual([2.5, 12.5, 6.5, 16.5]);

            table.update({ x: [1, 3], y: ["hello", "world"] });

            const after2 = await view.to_columns();
            expect(after2['upper("y")']).toEqual(["HELLO", "B", "WORLD", "D"]);
            view.delete();
            table.delete();
        });

        test("Dependent column appends should notify expression columns on different views, arity 2", async function () {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: { '"w" + "x"': '"w" + "x"' },
            });

            const view2 = await table.view({
                expressions: { '"w" - "x"': '"w" - "x"' },
            });

            const before = await view.to_columns();
            const before2 = await view2.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5]);

            table.update({ x: [2, 4], w: [10.5, 12.5] });

            const after = await view.to_columns();
            const after2 = await view2.to_columns();
            expect(after['"w" + "x"']).toEqual([
                2.5, 4.5, 6.5, 8.5, 12.5, 16.5,
            ]);
            expect(after2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5, 8.5, 8.5]);
            view2.delete();
            view.delete();
            table.delete();
        });

        test("Dependent column appends should notify equivalent expression columns on different views, arity 2", async function () {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: { '"w" + "x"': '"w" + "x"' },
            });

            const view2 = await table.view({
                expressions: {
                    '"w" + "x"': '"w" + "x"',
                    '"w" - "x"': '"w" - "x"',
                },
            });

            const before = await view.to_columns();
            const before2 = await view2.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5]);

            table.update({ x: [2, 4], w: [10.5, 12.5] });

            const after = await view.to_columns();
            const after2 = await view2.to_columns();
            expect(after['"w" + "x"']).toEqual([
                2.5, 4.5, 6.5, 8.5, 12.5, 16.5,
            ]);
            expect(after2['"w" + "x"']).toEqual([
                2.5, 4.5, 6.5, 8.5, 12.5, 16.5,
            ]);
            expect(after2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5, 8.5, 8.5]);
            view2.delete();
            view.delete();
            table.delete();
        });

        test("Dependent column updates should notify expression columns on different views, arity 2.", async function () {
            const table = await perspective.table(common.int_float_data, {
                index: "x",
            });
            const view = await table.view({
                expressions: { '"w" + "x"': '"w" + "x"' },
            });

            const view2 = await table.view({
                expressions: { '"w" - "x"': '"w" - "x"' },
            });

            const before = await view.to_columns();
            const before2 = await view2.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5]);

            table.update({ x: [2, 4], w: [10.5, 12.5] });

            const after = await view.to_columns();
            const after2 = await view2.to_columns();
            expect(after['"w" + "x"']).toEqual([2.5, 12.5, 6.5, 16.5]);
            expect(after2['"w" - "x"']).toEqual([0.5, 8.5, 0.5, 8.5]);
            view2.delete();
            view.delete();
            table.delete();
        });

        test("Dependent column updates should notify equivalent expression columns on different views, arity 2.", async function () {
            const table = await perspective.table(common.int_float_data, {
                index: "x",
            });
            const view = await table.view({
                expressions: { '"w" + "x"': '"w" + "x"' },
            });

            const view2 = await table.view({
                expressions: {
                    '"w" + "x"': '"w" + "x"',
                    '"w" - "x"': '"w" - "x"',
                },
            });

            const before = await view.to_columns();
            const before2 = await view2.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5]);

            table.update({ x: [2, 4], w: [10.5, 12.5] });

            const after = await view.to_columns();
            const after2 = await view2.to_columns();
            expect(after['"w" + "x"']).toEqual([2.5, 12.5, 6.5, 16.5]);
            expect(after2['"w" + "x"']).toEqual([2.5, 12.5, 6.5, 16.5]);
            expect(after2['"w" - "x"']).toEqual([0.5, 8.5, 0.5, 8.5]);
            view2.delete();
            view.delete();
            table.delete();
        });

        test("Dependent column update with `null` should notify expression columns on different views, arity 2.", async function () {
            const table = await perspective.table(common.int_float_data, {
                index: "x",
            });
            const view = await table.view({
                expressions: { '"w" + "x"': '"w" + "x"' },
            });

            const view2 = await table.view({
                expressions: { '"w" - "x"': '"w" - "x"' },
            });

            const before = await view.to_columns();
            const before2 = await view2.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5]);

            table.update({ x: [2, 4], w: [null, 12.5] });

            const after = await view.to_columns();
            const after2 = await view2.to_columns();
            expect(after['"w" + "x"']).toEqual([2.5, null, 6.5, 16.5]);
            expect(after2['"w" - "x"']).toEqual([0.5, null, 0.5, 8.5]);
            view2.delete();
            view.delete();
            table.delete();
        });

        test("Dependent column update with `null` should notify equivalent expression columns on different views, arity 2.", async function () {
            const table = await perspective.table(common.int_float_data, {
                index: "x",
            });
            const view = await table.view({
                expressions: { '"w" + "x"': '"w" + "x"' },
            });

            const view2 = await table.view({
                expressions: {
                    '"w" + "x"': '"w" + "x"',
                    '"w" - "x"': '"w" - "x"',
                },
            });

            const before = await view.to_columns();
            const before2 = await view2.to_columns();
            expect(before['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" + "x"']).toEqual([2.5, 4.5, 6.5, 8.5]);
            expect(before2['"w" - "x"']).toEqual([0.5, 0.5, 0.5, 0.5]);

            table.update({ x: [2, 4], w: [null, 12.5] });

            const after = await view.to_columns();
            const after2 = await view2.to_columns();
            expect(after['"w" + "x"']).toEqual([2.5, null, 6.5, 16.5]);
            expect(after2['"w" + "x"']).toEqual([2.5, null, 6.5, 16.5]);
            expect(after2['"w" - "x"']).toEqual([0.5, null, 0.5, 8.5]);
            view2.delete();
            view.delete();
            table.delete();
        });

        test("Updating with `null` should clear the output expression column.", async function () {
            const table = await perspective.table(
                {
                    w: [1.5, 2.5, 3.5, 4.5],
                    x: [1, 2, 3, 4],
                    y: [5, 6, 7, 8],
                },
                { index: "x" }
            );

            const view = await table.view({
                expressions: { '"w" + "y"': '"w" + "y"' },
            });

            let before = await view.to_columns();
            expect(before['"w" + "y"']).toEqual([6.5, 8.5, 10.5, 12.5]);
            table.update({ x: [2, 4], w: [null, 12.5] });
            const after = await view.to_columns();
            expect(after['"w" + "y"']).toEqual([6.5, null, 10.5, 20.5]);
            table.update({ x: [2, 3], w: [20.5, null] });
            const after2 = await view.to_columns();
            expect(after2['"w" + "y"']).toEqual([6.5, 26.5, null, 20.5]);
            view.delete();
            table.delete();
        });

        test.skip("OG - Updating with `undefined` should not clear the output expression column.", async function () {
            const table = await perspective.table(
                {
                    w: [1.5, 2.5, 3.5, 4.5],
                    x: [1, 2, 3, 4],
                    y: [5, 6, 7, 8],
                },
                { index: "x" }
            );
            const view = await table.view({
                expressions: { '"w" + "y"': '"w" + "y"' },
            });
            let before = await view.to_columns();
            expect(before['"w" + "y"']).toEqual([6.5, 8.5, 10.5, 12.5]);

            table.update({ x: [2, 4], w: [undefined, 12.5] });

            const after = await view.to_columns();
            expect(after['"w" + "y"']).toEqual([6.5, 8.5, 10.5, 20.5]);

            table.update({ x: [2, 3], w: [20.5, undefined] });

            const after2 = await view.to_columns();
            expect(after2['"w" + "y"']).toEqual([6.5, 26.5, 10.5, 20.5]);
            view.delete();
            table.delete();
        });

        test("Updating with `undefined` should not clear the output expression column.", async function () {
            const table = await perspective.table(
                {
                    w: [1.5, 2.5, 3.5, 4.5],
                    x: [1, 2, 3, 4],
                    y: [5, 6, 7, 8],
                },
                { index: "x" }
            );
            const view = await table.view({
                expressions: { '"w" + "y"': '"w" + "y"' },
            });
            let before = await view.to_columns();
            expect(before['"w" + "y"']).toEqual([6.5, 8.5, 10.5, 12.5]);

            table.update({ x: [2] });
            table.update({ x: [4], w: [12.5] });

            const after = await view.to_columns();
            expect(after['"w" + "y"']).toEqual([6.5, 8.5, 10.5, 20.5]);

            table.update({ x: [2], w: [20.5] });
            table.update({ x: [3] });

            const after2 = await view.to_columns();
            expect(after2['"w" + "y"']).toEqual([6.5, 26.5, 10.5, 20.5]);
            view.delete();
            table.delete();
        });

        test("Updates on non-dependent columns should not change expression columns.", async function () {
            var meta = {
                w: "float",
                x: "float",
                y: "string",
                z: "boolean",
            };
            const table = await perspective.table(meta, { index: "y" });
            const view = await table.view({
                columns: ["y", '"w" / "x"'],
                expressions: { '"w" / "x"': '"w" / "x"' },
            });

            table.update(common.int_float_data);

            let delta_upd = [
                { y: "a", z: false },
                { y: "b", z: true },
                { y: "c", z: false },
                { y: "d", z: true },
            ];
            table.update(delta_upd);
            let result = await view.to_json();
            let expected = [
                { y: "a", '"w" / "x"': 1.5 },
                { y: "b", '"w" / "x"': 1.25 },
                { y: "c", '"w" / "x"': 1.1666666666666667 },
                { y: "d", '"w" / "x"': 1.125 },
            ];
            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Should recompute after partial update using `__INDEX__`", async function () {
            const table = await perspective.table({
                x: "integer",
                y: "integer",
            });
            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });

            table.update(data);
            table.update([
                { __INDEX__: 0, x: 10 },
                { __INDEX__: 2, x: 10 },
            ]);

            const json = await view.to_json();
            expect(json).toEqual([
                { x: 10, y: 2, '"x" * "y"': 20 },
                { x: 2, y: 4, '"x" * "y"': 8 },
                { x: 10, y: 6, '"x" * "y"': 60 },
                { x: 4, y: 8, '"x" * "y"': 32 },
            ]);
            view.delete();
            table.delete();
        });

        test("Partial update without a new value shouldn't change computed output", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });

            const json = await view.to_json();
            expect(json).toEqual([
                { x: 1, y: 2, '"x" * "y"': 2 },
                { x: 2, y: 4, '"x" * "y"': 8 },
                { x: 3, y: 6, '"x" * "y"': 18 },
                { x: 4, y: 8, '"x" * "y"': 32 },
            ]);

            table.update([{ __INDEX__: 0, x: 1 }]);
            const json2 = await view.to_json();
            expect(json2).toEqual(json);
            view.delete();
            table.delete();
        });

        test("partial update on single computed source column", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });

            table.update([{ __INDEX__: 0, x: 10 }]);
            const json = await view.to_json();
            expect(json).toEqual([
                { x: 10, y: 2, '"x" * "y"': 20 },
                { x: 2, y: 4, '"x" * "y"': 8 },
                { x: 3, y: 6, '"x" * "y"': 18 },
                { x: 4, y: 8, '"x" * "y"': 32 },
            ]);
            view.delete();
            table.delete();
        });

        test("partial update on non-contiguous computed source columns", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });
            await table.update([
                { __INDEX__: 0, x: 1, y: 10 },
                { __INDEX__: 2, x: 3, y: 20 },
            ]);
            let json = await view.to_json();
            expect(json).toEqual([
                { x: 1, y: 10, '"x" * "y"': 10 },
                { x: 2, y: 4, '"x" * "y"': 8 },
                { x: 3, y: 20, '"x" * "y"': 60 },
                { x: 4, y: 8, '"x" * "y"': 32 },
            ]);
            view.delete();
            table.delete();
        });

        test("partial update on non-contiguous computed source columns, indexed table", async function () {
            const table = await perspective.table(data, { index: "x" });
            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });
            table.update([
                { x: 1, y: 10 },
                { x: 3, y: 20 },
            ]);
            let json = await view.to_json();
            expect(json).toEqual([
                { x: 1, y: 10, '"x" * "y"': 10 },
                { x: 2, y: 4, '"x" * "y"': 8 },
                { x: 3, y: 20, '"x" * "y"': 60 },
                { x: 4, y: 8, '"x" * "y"': 32 },
            ]);
            view.delete();
            table.delete();
        });

        test("multiple updates change validity", async function () {
            const table = await perspective.table(
                {
                    a: "float",
                    b: "float",
                    c: "string",
                    index: "integer",
                },
                { index: "index" }
            );

            table.update({
                a: [null, null, 1.5, null],
                b: [null, 2.5, null, null],
                c: ["a", "b", "b", "a"],
                index: [1, 2, 3, 4],
            });

            const view = await table.view({
                expressions: { computed: '"a" + "b"' },
            });

            let result = await view.to_columns();
            expect(result["computed"]).toEqual([null, null, null, null]);

            table.update({
                index: [4],
                a: [100],
            });

            result = await view.to_columns();
            expect(result["computed"]).toEqual([null, null, null, null]);

            table.update({
                index: [4],
                b: [100],
            });

            result = await view.to_columns();
            expect(result["computed"]).toEqual([null, null, null, 200]);

            table.update({
                index: [3],
                b: [100],
            });

            result = await view.to_columns();
            expect(result["computed"]).toEqual([null, null, 101.5, 200]);

            await view.delete();
            await table.delete();
        });

        test("multiple partial update on single computed source column", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });

            table.update([
                { __INDEX__: 0, x: 10 },
                { __INDEX__: 2, x: 10 },
            ]);
            table.update([
                { __INDEX__: 0, x: 20 },
                { __INDEX__: 2, x: 20 },
            ]);
            table.update([
                { __INDEX__: 0, x: 30 },
                { __INDEX__: 2, x: 30 },
            ]);

            let json = await view.to_json();
            expect(json).toEqual([
                { x: 30, y: 2, '"x" * "y"': 60 },
                { x: 2, y: 4, '"x" * "y"': 8 },
                { x: 30, y: 6, '"x" * "y"': 180 },
                { x: 4, y: 8, '"x" * "y"': 32 },
            ]);
            view.delete();
            table.delete();
        });

        test("multiple expression columns with updates on source columns", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });
            const view2 = await table.view({
                expressions: { '"x" + "y"': '"x" + "y"' },
            });

            table.update([
                { __INDEX__: 0, x: 5 },
                { __INDEX__: 2, x: 10 },
            ]);

            let result = await view.to_columns();
            let result2 = await view2.to_columns();

            expect(result).toEqual({
                x: [5, 2, 10, 4],
                y: [2, 4, 6, 8],
                '"x" * "y"': [10, 8, 60, 32],
            });

            expect(result2).toEqual({
                x: [5, 2, 10, 4],
                y: [2, 4, 6, 8],
                '"x" + "y"': [7, 6, 16, 12],
            });

            view2.delete();
            view.delete();
            table.delete();
        });

        test("propagate updates to all expression columns", async function () {
            const table = await perspective.table(data, { index: "x" });

            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });

            const view2 = await table.view({
                expressions: { '"x" + "y"': '"x" + "y"' },
            });

            const view3 = await table.view({
                expressions: { '"x" - "y"': '"x" - "y"' },
            });

            table.update({ x: [1, 2, 3, 4], y: [1, 2, 3, 4] });

            let result = await view.to_columns();
            let result2 = await view2.to_columns();
            let result3 = await view3.to_columns();

            expect(result).toEqual({
                x: [1, 2, 3, 4],
                y: [1, 2, 3, 4],
                '"x" * "y"': [1, 4, 9, 16],
            });

            expect(result2).toEqual({
                x: [1, 2, 3, 4],
                y: [1, 2, 3, 4],
                '"x" + "y"': [2, 4, 6, 8],
            });

            expect(result3).toEqual({
                x: [1, 2, 3, 4],
                y: [1, 2, 3, 4],
                '"x" - "y"': [0, 0, 0, 0],
            });

            view3.delete();
            view2.delete();
            view.delete();
            table.delete();
        });

        test("propagate appends to all expression columns", async function () {
            const table = await perspective.table(data);

            const view = await table.view({
                expressions: { '"x" * "y"': '"x" * "y"' },
            });

            const view2 = await table.view({
                expressions: { '"x" + "y"': '"x" + "y"' },
            });

            const view3 = await table.view({
                expressions: { '"x" - "y"': '"x" - "y"' },
            });

            table.update({ x: [1, 2, 3, 4], y: [1, 2, 3, 4] });

            let result = await view.to_columns();
            let result2 = await view2.to_columns();
            let result3 = await view3.to_columns();

            expect(result).toEqual({
                x: [1, 2, 3, 4, 1, 2, 3, 4],
                y: [2, 4, 6, 8, 1, 2, 3, 4],
                '"x" * "y"': [2, 8, 18, 32, 1, 4, 9, 16],
            });

            expect(result2).toEqual({
                x: [1, 2, 3, 4, 1, 2, 3, 4],
                y: [2, 4, 6, 8, 1, 2, 3, 4],
                '"x" + "y"': [3, 6, 9, 12, 2, 4, 6, 8],
            });

            expect(result3).toEqual({
                x: [1, 2, 3, 4, 1, 2, 3, 4],
                y: [2, 4, 6, 8, 1, 2, 3, 4],
                '"x" - "y"': [-1, -2, -3, -4, 0, 0, 0, 0],
            });

            view3.delete();
            view2.delete();
            view.delete();
            table.delete();
        });
    });

    test.describe("Computed updates with group by", function () {
        test("should update on dependent columns, add", async function () {
            const table = await perspective.table(pivot_data);
            const view = await table.view({
                columns: ['"int" + "float"', "int"],
                aggregates: {
                    '"int" + "float"': "sum",
                },
                group_by: ['"int" + "float"'],
                expressions: { '"int" + "float"': '"int" + "float"' },
            });

            table.update({ int: [4], __INDEX__: [0] });

            let results = await view.to_columns({
                index: true,
            });

            expect(results).toEqual({
                __ROW_PATH__: [[], [5.5], [6.25], [7.75], [9.25]],
                int: [13, 2, 4, 3, 4],
                '"int" + "float"': [28.75, 5.5, 6.25, 7.75, 9.25],
                __INDEX__: [[0, 3, 2, 1], [1], [0], [2], [3]],
            });

            view.delete();
            table.delete();
        });

        test("should update on dependent columns, subtract", async function () {
            const table = await perspective.table(pivot_data);
            const view = await table.view({
                columns: ['"int" - "float"', "int"],
                group_by: ['"int" - "float"'],
                expressions: { '"int" - "float"': '"int" - "float"' },
            });

            table.update([{ int: 4, __INDEX__: 0 }]);

            let json = await view.to_json({
                index: true,
            });

            expect(json).toEqual([
                {
                    __ROW_PATH__: [],
                    int: 13,
                    '"int" - "float"': -2.75,
                    __INDEX__: [0, 3, 1, 2],
                },
                {
                    __ROW_PATH__: [-1.75],
                    int: 3,
                    '"int" - "float"': -1.75,
                    __INDEX__: [2],
                },
                {
                    __ROW_PATH__: [-1.5],
                    int: 2,
                    '"int" - "float"': -1.5,
                    __INDEX__: [1],
                },
                {
                    __ROW_PATH__: [-1.25],
                    int: 4,
                    '"int" - "float"': -1.25,
                    __INDEX__: [3],
                },
                {
                    __ROW_PATH__: [1.75],
                    int: 4,
                    '"int" - "float"': 1.75,
                    __INDEX__: [0],
                },
            ]);

            view.delete();
            table.delete();
        });

        test("should update on dependent columns, multiply", async function () {
            const table = await perspective.table(pivot_data);

            const view = await table.view({
                columns: ['"int" * "float"', "int"],
                group_by: ['"int" * "float"'],
                expressions: { '"int" * "float"': '"int" * "float"' },
            });

            table.update([{ int: 4, __INDEX__: 0 }]);

            let json = await view.to_json({
                index: true,
            });

            expect(json).toEqual([
                {
                    __ROW_PATH__: [],
                    int: 13,
                    '"int" * "float"': 51.25,
                    __INDEX__: [0, 3, 2, 1],
                },
                {
                    __ROW_PATH__: [7],
                    int: 2,
                    '"int" * "float"': 7,
                    __INDEX__: [1],
                },
                {
                    __ROW_PATH__: [9],
                    int: 4,
                    '"int" * "float"': 9,
                    __INDEX__: [0],
                },
                {
                    __ROW_PATH__: [14.25],
                    int: 3,
                    '"int" * "float"': 14.25,
                    __INDEX__: [2],
                },
                {
                    __ROW_PATH__: [21],
                    int: 4,
                    '"int" * "float"': 21,
                    __INDEX__: [3],
                },
            ]);

            view.delete();
            table.delete();
        });

        test("should update on dependent columns, divide", async function () {
            const table = await perspective.table(pivot_data);

            const view = await table.view({
                columns: ['"int" / "float"', "int"],
                group_by: ['"int" / "float"'],
                expressions: { '"int" / "float"': '"int" / "float"' },
            });

            table.update([{ int: 4, __INDEX__: 0 }]);

            let json = await view.to_json({
                index: true,
            });

            expect(json).toEqual([
                {
                    __ROW_PATH__: [],
                    int: 13,
                    '"int" / "float"': 3.742690058479532,
                    __INDEX__: [0, 3, 2, 1],
                },
                {
                    __ROW_PATH__: [0.5714285714285714],
                    int: 2,
                    '"int" / "float"': 0.5714285714285714,
                    __INDEX__: [1],
                },
                {
                    __ROW_PATH__: [0.631578947368421],
                    int: 3,
                    '"int" / "float"': 0.631578947368421,
                    __INDEX__: [2],
                },
                {
                    __ROW_PATH__: [0.7619047619047619],
                    int: 4,
                    '"int" / "float"': 0.7619047619047619,
                    __INDEX__: [3],
                },
                {
                    __ROW_PATH__: [1.7777777777777777],
                    int: 4,
                    '"int" / "float"': 1.7777777777777777,
                    __INDEX__: [0],
                },
            ]);

            view.delete();
            table.delete();
        });
    });

    test.describe("Partial update with null", function () {
        test("Update over null should recalculate", async function () {
            const table = await perspective.table(pivot_data, { index: "int" });
            const view = await table.view({
                columns: ['"int" + "float"', "int", "float"],
                expressions: { '"int" + "float"': '"int" + "float"' },
            });

            table.update([{ int: 2, float: 3.5 }]);

            let result = await view.to_columns();

            expect(result).toEqual({
                '"int" + "float"': [3.25, 5.5, 7.75, 9.25],
                int: [1, 2, 3, 4],
                float: [2.25, 3.5, 4.75, 5.25],
            });

            view.delete();
            table.delete();
        });

        test("Update with null should unset", async function () {
            const table = await perspective.table(pivot_data, { index: "int" });

            const view = await table.view({
                columns: ['"int" + "float"', "int", "float"],
                expressions: { '"int" + "float"': '"int" + "float"' },
            });

            table.update([{ int: 2, float: null }]);

            let result = await view.to_columns();

            expect(result).toEqual({
                '"int" + "float"': [3.25, null, 7.75, 9.25],
                int: [1, 2, 3, 4],
                float: [2.25, null, 4.75, 5.25],
            });

            view.delete();
            table.delete();
        });

        test("Undefined should be a no-op on expression columns", async function () {
            const table = await perspective.table(
                [
                    { int: 1, float: 2.25, string: "a", datetime: new Date() },
                    { int: 2, float: 3.5, string: "b", datetime: new Date() },
                    { int: 3, float: 4.75, string: "c", datetime: new Date() },
                    { int: 4, float: 5.25, string: "d", datetime: new Date() },
                ],
                { index: "int" }
            );
            const view = await table.view({
                columns: ['"int" + "float"', "int", "float"],
                expressions: { '"int" + "float"': '"int" + "float"' },
            });

            table.update([{ int: 2, float: undefined }]);

            let result = await view.to_columns();

            expect(result).toEqual({
                '"int" + "float"': [3.25, 5.5, 7.75, 9.25],
                int: [1, 2, 3, 4],
                float: [2.25, 3.5, 4.75, 5.25],
            });

            view.delete();
            table.delete();
        });
    });

    test.describe("Removing expression columns", () => {
        test("Removes should remove rows in expression columns", async () => {
            const table = await perspective.table(
                {
                    x: [1, 2, 3, 4],
                    y: ["A", "B", "C", "D"],
                },
                { index: "x" }
            );

            const view = await table.view({
                expressions: { 'lower("y")': 'lower("y")' },
            });

            const before = await view.to_columns();
            expect(before['lower("y")']).toEqual(["a", "b", "c", "d"]);
            table.update({ y: ["HELLO", "WORLD"] });

            const result = await view.to_columns();
            expect(result["x"]).toEqual([null, 1, 2, 3, 4]);
            expect(result['lower("y")']).toEqual(["world", "a", "b", "c", "d"]);

            table.remove([4, null, 1]);

            const result2 = await view.to_columns();
            expect(result2["x"]).toEqual([2, 3]);
            expect(result2['lower("y")']).toEqual(["b", "c"]);

            view.delete();
            table.delete();
        });
    });
})(perspective);
