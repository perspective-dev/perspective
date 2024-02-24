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

const match_delta = async function (perspective, delta, expected) {
    let table = await perspective.table(delta);
    let view = await table.view();
    let json = await view.to_json();
    expect(json).toEqual(expected);
    await view.delete();
    await table.delete();
};

function it_old_behavior(name, capture) {
    test(name, async function () {
        let done;
        let result = new Promise((x) => {
            done = x;
        });

        await capture(done);
        await result;
    });
}

/**
 * Tests the correctness of updates on Tables with expression columns created
 * through `View` and deltas created through `on_update`.
 */
((perspective) => {
    test.describe("Expression column update deltas", function () {
        test.describe("0-sided expression column deltas", function () {
            it_old_behavior(
                "Returns appended rows for normal and expression columns",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });

                    const view = await table.view({
                        expressions: {
                            'lower("y")': 'lower("y")',
                            '-"x"': '-"x"',
                        },
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                {
                                    x: 1,
                                    y: "HELLO",
                                    'lower("y")': "hello",
                                    '-"x"': -1,
                                },
                                {
                                    x: 3,
                                    y: "WORLD",
                                    'lower("y")': "world",
                                    '-"x"': -3,
                                },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["HELLO", "WORLD"] });
                }
            );

            it_old_behavior(
                "Returns appended rows for normal and expression columns from schema",
                async function (done) {
                    const table = await perspective.table({
                        x: "integer",
                        y: "string",
                    });
                    const view = await table.view({
                        expressions: { 'upper("y")': 'upper("y")' },
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: "a", 'upper("y")': "A" },
                                { x: 2, y: "b", 'upper("y")': "B" },
                                { x: 3, y: "c", 'upper("y")': "C" },
                                { x: 4, y: "d", 'upper("y")': "D" },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({
                        x: [1, 2, 3, 4],
                        y: ["a", "b", "c", "d"],
                    });
                }
            );

            it_old_behavior(
                "Returns partially updated rows for normal and expression columns",
                async function (done) {
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

                    view.on_update(
                        async function (updated) {
                            const full = await view.to_columns();
                            const expected = [
                                { x: 1, y: "HELLO", 'lower("y")': "hello" },
                                { x: 3, y: "WORLD", 'lower("y")': "world" },
                            ];
                            expect(full).toEqual({
                                x: [1, 2, 3, 4],
                                y: ["HELLO", "B", "WORLD", "D"],
                                'lower("y")': ["hello", "b", "world", "d"],
                            });
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["HELLO", "WORLD"] });
                }
            );

            it_old_behavior(
                "Returns appended rows with missing columns for normal and expression columns",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });
                    const view = await table.view({
                        expressions: { 'lower("y")': 'lower("y")' },
                    });

                    view.on_update(
                        async function (updated) {
                            const full = await view.to_columns();
                            const expected = [
                                { x: 1, y: null, 'lower("y")': null },
                                { x: 3, y: null, 'lower("y")': null },
                            ];
                            expect(full).toEqual({
                                x: [1, 2, 3, 4, 1, 3],
                                y: ["A", "B", "C", "D", null, null],
                                'lower("y")': ["a", "b", "c", "d", null, null],
                            });
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3] });
                }
            );
        });

        test.describe("1-sided expression column deltas", function () {
            it_old_behavior(
                "Returns appended rows for normal and expression columns, 1-sided",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });
                    const view = await table.view({
                        group_by: ['lower("y")'],
                        expressions: { 'lower("y")': 'lower("y")' },
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 14, y: 6, 'lower("y")': 6 },
                                { x: 1, y: 1, 'lower("y")': 1 },
                                { x: 3, y: 1, 'lower("y")': 1 },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["HELLO", "WORLD"] });
                }
            );

            it_old_behavior(
                "Returns appended rows for normal and expression columns, 1-sided hidden sorted",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });
                    const view = await table.view({
                        group_by: ['lower("y")'],
                        expressions: { 'lower("y")': 'lower("y")' },
                        sort: [['lower("y")', "desc"]],
                        columns: ["x"],
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [{ x: 14 }, { x: 3 }, { x: 1 }];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["HELLO", "WORLD"] });
                }
            );
        });

        test.describe("2-sided expression column deltas", function () {
            it_old_behavior(
                "Returns appended rows for normal and expression columns, 2-sided",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });
                    const view = await table.view({
                        aggregates: {
                            'lower("y")': "last",
                        },
                        group_by: ['lower("y")'],
                        split_by: ["y"],
                        expressions: { 'lower("y")': 'lower("y")' },
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                {
                                    'A|lower("y")': "a",
                                    "A|x": 1,
                                    "A|y": 1,
                                    'B|lower("y")': "b",
                                    "B|x": 2,
                                    "B|y": 1,
                                    'C|lower("y")': "c",
                                    "C|x": 3,
                                    "C|y": 1,
                                    'D|lower("y")': "d",
                                    "D|x": 4,
                                    "D|y": 1,
                                    'HELLO|lower("y")': "hello",
                                    "HELLO|x": 1,
                                    "HELLO|y": 1,
                                    'WORLD|lower("y")': "world",
                                    "WORLD|x": 3,
                                    "WORLD|y": 1,
                                },
                                {
                                    'A|lower("y")': null,
                                    "A|x": null,
                                    "A|y": null,
                                    'B|lower("y")': null,
                                    "B|x": null,
                                    "B|y": null,
                                    'C|lower("y")': null,
                                    "C|x": null,
                                    "C|y": null,
                                    'D|lower("y")': null,
                                    "D|x": null,
                                    "D|y": null,
                                    'HELLO|lower("y")': "hello",
                                    "HELLO|x": 1,
                                    "HELLO|y": 1,
                                    'WORLD|lower("y")': null,
                                    "WORLD|x": null,
                                    "WORLD|y": null,
                                },
                                {
                                    'A|lower("y")': null,
                                    "A|x": null,
                                    "A|y": null,
                                    'B|lower("y")': null,
                                    "B|x": null,
                                    "B|y": null,
                                    'C|lower("y")': null,
                                    "C|x": null,
                                    "C|y": null,
                                    'D|lower("y")': null,
                                    "D|x": null,
                                    "D|y": null,
                                    'HELLO|lower("y")': null,
                                    "HELLO|x": null,
                                    "HELLO|y": null,
                                    'WORLD|lower("y")': "world",
                                    "WORLD|x": 3,
                                    "WORLD|y": 1,
                                },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["HELLO", "WORLD"] });
                }
            );
        });

        test.describe("0-sided expression column deltas with multiple views", function () {
            it_old_behavior(
                "`on_update` on a view with expression column should contain expression delta when columns are appended",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });
                    const view = await table.view({
                        expressions: { 'lower("y")': 'lower("y")' },
                    });

                    const pre_update = await view.to_columns();
                    expect(pre_update).toEqual({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                        'lower("y")': ["a", "b", "c", "d"],
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: null, 'lower("y")': null },
                                { x: 3, y: null, 'lower("y")': null },
                            ];
                            const full = await view.to_columns();
                            expect(full).toEqual({
                                x: [1, 2, 3, 4, 1, 3],
                                y: ["A", "B", "C", "D", null, null],
                                'lower("y")': ["a", "b", "c", "d", null, null],
                            });
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3] });
                }
            );

            it_old_behavior(
                "`on_update` on a view with expression column should contain expression delta when columns are updated",
                async function (done) {
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

                    const pre_update = await view.to_columns();

                    expect(pre_update).toEqual({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                        'lower("y")': ["a", "b", "c", "d"],
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: "ABCD", 'lower("y")': "abcd" },
                                { x: 3, y: null, 'lower("y")': null },
                            ];
                            const full = await view.to_columns();
                            expect(full).toEqual({
                                x: [1, 2, 3, 4],
                                y: ["ABCD", "B", null, "D"],
                                'lower("y")': ["abcd", "b", null, "d"],
                            });
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["ABCD", null] });
                }
            );

            it_old_behavior(
                "`on_update` on different views with different expression columns should only be notified of their columns",
                async function (done) {
                    const table = await perspective.table(
                        {
                            x: [1, 2, 3, 4],
                            y: ["A", "B", "C", "D"],
                        },
                        {
                            index: "x",
                        }
                    );

                    const view = await table.view({
                        expressions: { 'lower("y")': 'lower("y")' },
                    });

                    const view2 = await table.view({
                        expressions: { '-"x"': '-"x"' },
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: "HELLO", 'lower("y")': "hello" },
                                { x: 3, y: "WORLD", 'lower("y")': "world" },
                            ];
                            const full = await view.to_columns();
                            expect(full).toEqual({
                                x: [1, 2, 3, 4],
                                y: ["HELLO", "B", "WORLD", "D"],
                                'lower("y")': ["hello", "b", "world", "d"],
                            });
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                        },
                        { mode: "row" }
                    );

                    view2.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: "HELLO", '-"x"': -1 },
                                { x: 3, y: "WORLD", '-"x"': -3 },
                            ];
                            const full = await view2.to_columns();
                            expect(full).toEqual({
                                x: [1, 2, 3, 4],
                                y: ["HELLO", "B", "WORLD", "D"],
                                '-"x"': [-1, -2, -3, -4],
                            });
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view2.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["HELLO", "WORLD"] });
                }
            );

            it_old_behavior(
                "`on_update` on view without expression column should not be notified of expression column",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });
                    const view = await table.view();

                    const view2 = await table.view({
                        expressions: { 'lower("y")': 'lower("y")' },
                    });

                    expect(await view2.to_columns()).toEqual({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                        'lower("y")': ["a", "b", "c", "d"],
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: "abc" },
                                { x: 3, y: "def" },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view2.delete();
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update({ x: [1, 3], y: ["abc", "def"] });
                }
            );
        });
    });
})(perspective);
