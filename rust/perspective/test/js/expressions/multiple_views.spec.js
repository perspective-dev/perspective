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

import * as expressions_common from "./common.js";

/**
 * Tests the functionality of `View`-based expressions, specifically that
 * existing column/view semantics (pivots, aggregates, columns, sorts, filters)
 * continue to be functional on expressions.
 */
((perspective) => {
    const validate_delta = async (colname, delta, expected) => {
        const t = await perspective.table(delta.slice());
        const v = await t.view();
        const data = await v.to_columns();
        expect(data[colname]).toEqual(expected);
        await v.delete();
        await t.delete();
    };

    test.describe("Expressions with multiple views", () => {
        test.describe("Schema then update", () => {
            test("Appends", async () => {
                const table = await perspective.table({
                    x: "integer",
                    y: "string",
                    z: "boolean",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" + 10` },
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                table.update(expressions_common.data);

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([11, 12, 13, 14]);
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Append in sequence", async () => {
                const table = await perspective.table({
                    x: "integer",
                    y: "string",
                    z: "boolean",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                });

                const v2 = await table.view({
                    expressions: { column: `upper(concat("y", 'bcd'))` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                const expected = [];
                const expected2 = [];

                for (let i = 1; i < 10; i++) {
                    table.update({
                        x: [i],
                        y: [`${i}`],
                    });

                    result = await v1.to_columns();
                    result2 = await v2.to_columns();

                    expected.push(i * 2);
                    expected2.push(`${i}BCD`);

                    expect(result["column"]).toEqual(expected);
                    expect(result2["column"]).toEqual(expected2);
                }

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Append in sequence, filtered", async () => {
                const table = await perspective.table({
                    x: "integer",
                    y: "string",
                    z: "boolean",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    filter: [["column", ">", 5]],
                });

                const v2 = await table.view({
                    expressions: { column: `upper(concat("y", 'bcd'))` },
                    filter: [["column", "contains", "A"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                const expected = [];
                const expected2 = [];

                for (let i = 1; i < 10; i++) {
                    table.update({
                        x: [i],
                        y: [`A${i}`],
                    });

                    result = await v1.to_columns();
                    result2 = await v2.to_columns();

                    if (i * 2 > 5) {
                        expected.push(i * 2);
                        expect(result["column"]).toEqual(expected);
                    } else {
                        expect(result).toEqual({
                            column: [],
                            x: [],
                            y: [],
                            z: [],
                        });
                    }

                    expected2.push(`A${i}BCD`);
                    expect(result2["column"]).toEqual(expected2);
                }

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Append in sequence, sorted", async () => {
                const table = await perspective.table({
                    x: "integer",
                    y: "string",
                    z: "boolean",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    sort: [["column", "desc"]],
                });

                const v2 = await table.view({
                    expressions: { column: `upper(concat("y", 'bcd'))` },
                    sort: [["column", "asc"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                const expected = [];
                const expected2 = [];

                let idx = 0;
                for (let i = 5; i < 9; i++) {
                    table.update({
                        x: [i],
                        y: [`${i}`],
                    });

                    result = await v1.to_columns();
                    result2 = await v2.to_columns();

                    expected.unshift(i * 2);
                    expected2.splice(idx, 0, `${i}BCD`);

                    expect(result["column"]).toEqual(expected);
                    expect(result2["column"]).toEqual(expected2);
                    idx++;
                }

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Partial update", async () => {
                const table = await perspective.table(
                    {
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    },
                    { index: "x" }
                );

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([null, 4, 6, 8, 20]);
                expect(result2["column"]).toEqual([
                    "DEF",
                    "X",
                    "Z",
                    "Y",
                    "ABC",
                ]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Partial update, filtered", async () => {
                const table = await perspective.table(
                    {
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    },
                    { index: "x" }
                );

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    filter: [["column", "==", 8]],
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                    filter: [["column", "==", "Z"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([8]);
                expect(result2["column"]).toEqual(["Z"]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Partial update, sorted", async () => {
                const table = await perspective.table(
                    {
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    },
                    { index: "x" }
                );

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    sort: [["column", "desc"]],
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                    sort: [["column", "desc"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([20, 8, 6, 4, null]);
                expect(result2["column"]).toEqual([
                    "Z",
                    "Y",
                    "X",
                    "DEF",
                    "ABC",
                ]);

                table.update({
                    x: [2, 10],
                    y: ["XYZ", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([20, 8, 6, 4, null]);
                expect(result2["x"]).toEqual([3, 4, 2, null, 10]);
                expect(result2["column"]).toEqual([
                    "Z",
                    "Y",
                    "XYZ",
                    "DEF",
                    "DEF",
                ]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Limit", async () => {
                const table = await perspective.table(
                    {
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    },
                    { limit: 2 }
                );

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], x: [], y: [], z: [] });
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([null, 20]);
                expect(result2["column"]).toEqual(["DEF", "ABC"]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });
        });

        test.describe("Data then update", () => {
            test("Appends", async () => {
                const table = await perspective.table(expressions_common.data);

                const v1 = await table.view({
                    expressions: { column: `"x" + 10` },
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([11, 12, 13, 14]);
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);

                table.update(expressions_common.data);

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([
                    11, 12, 13, 14, 11, 12, 13, 14,
                ]);
                expect(result2["column"]).toEqual([
                    "A",
                    "B",
                    "C",
                    "D",
                    "A",
                    "B",
                    "C",
                    "D",
                ]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Append in sequence", async () => {
                const table = await perspective.table(expressions_common.data);

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                });

                const v2 = await table.view({
                    expressions: { column: `upper(concat("y", 'bcd'))` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([2, 4, 6, 8]);
                expect(result2["column"]).toEqual([
                    "ABCD",
                    "BBCD",
                    "CBCD",
                    "DBCD",
                ]);

                const expected = [2, 4, 6, 8];
                const expected2 = ["ABCD", "BBCD", "CBCD", "DBCD"];

                for (let i = 0; i < 10; i++) {
                    table.update({
                        x: [i + 4],
                        y: [`${i + 4}`],
                    });

                    result = await v1.to_columns();
                    result2 = await v2.to_columns();

                    expected.push((i + 4) * 2);
                    expected2.push(`${i + 4}BCD`);

                    expect(result["column"]).toEqual(expected);
                    expect(result2["column"]).toEqual(expected2);
                }

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Append in sequence, filtered", async () => {
                const table = await perspective.table(expressions_common.data);

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    filter: [["column", ">", 5]],
                });

                const v2 = await table.view({
                    expressions: { column: `upper(concat("y", 'bcd'))` },
                    filter: [["column", "contains", "A"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([6, 8]);
                expect(result2["column"]).toEqual(["ABCD"]);

                const expected = [6, 8];

                for (let i = 0; i < 10; i++) {
                    table.update({
                        x: [i + 4],
                        y: [`${i + 4}`],
                    });

                    result = await v1.to_columns();
                    result2 = await v2.to_columns();

                    expected.push((i + 4) * 2);

                    expect(result["column"]).toEqual(expected);
                    expect(result2["column"]).toEqual(["ABCD"]);
                }

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Append in sequence, sorted", async () => {
                const table = await perspective.table(expressions_common.data);

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    sort: [["column", "desc"]],
                });

                const v2 = await table.view({
                    expressions: { column: `upper(concat("y", 'bcd'))` },
                    sort: [["column", "asc"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                const expected = [8, 6, 4, 2];
                const expected2 = ["ABCD", "BBCD", "CBCD", "DBCD"];

                expect(result["column"]).toEqual(expected);
                expect(result2["column"]).toEqual(expected2);

                let idx = 0;
                for (let i = 5; i < 9; i++) {
                    table.update({
                        x: [i],
                        y: [`${i}`],
                    });

                    result = await v1.to_columns();
                    result2 = await v2.to_columns();

                    expected.unshift(i * 2);
                    expected2.splice(idx, 0, `${i}BCD`);

                    expect(result["column"]).toEqual(expected);
                    expect(result2["column"]).toEqual(expected2);
                    idx++;
                }

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Partial update", async () => {
                const table = await perspective.table(expressions_common.data, {
                    index: "x",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([2, 4, 6, 8]);
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([null, 2, 4, 6, 8, 20]);
                expect(result2["column"]).toEqual([
                    "DEF",
                    "A",
                    "X",
                    "Z",
                    "Y",
                    "ABC",
                ]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Partial update, filtered", async () => {
                const table = await perspective.table(expressions_common.data, {
                    index: "x",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    filter: [["column", "==", 8]],
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                    filter: [["column", "==", "B"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([8]);
                expect(result2["column"]).toEqual(["B"]);

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                console.log(result, result2);

                expect(result["column"]).toEqual([8]);
                expect(result2).toEqual({ column: [], x: [], y: [], z: [] });

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Partial update, sorted", async () => {
                const table = await perspective.table(expressions_common.data, {
                    index: "x",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    sort: [["column", "desc"]],
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                    sort: [["column", "desc"]],
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([8, 6, 4, 2]);
                expect(result2["column"]).toEqual(["D", "C", "B", "A"]);

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([20, 8, 6, 4, 2, null]);
                expect(result2["column"]).toEqual([
                    "Z",
                    "Y",
                    "X",
                    "DEF",
                    "ABC",
                    "A",
                ]);

                table.update({
                    x: [2, 10],
                    y: ["XYZ", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([20, 8, 6, 4, 2, null]);
                expect(result2["x"]).toEqual([3, 4, 2, null, 10, 1]);
                expect(result2["column"]).toEqual([
                    "Z",
                    "Y",
                    "XYZ",
                    "DEF",
                    "DEF",
                    "A",
                ]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Limit", async () => {
                const table = await perspective.table(expressions_common.data, {
                    limit: 2,
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([6, 8]);
                expect(result2["column"]).toEqual(["C", "D"]);

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([null, 20]);
                expect(result2["column"]).toEqual(["DEF", "ABC"]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });
        });

        test.describe("Deltas", () => {
            test("Appends delta", async () => {
                expect.assertions(6);

                const table = await perspective.table(expressions_common.data);

                const v1 = await table.view({
                    expressions: { column: `"x" + 10` },
                });

                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                const result = await v1.to_columns();
                const result2 = await v2.to_columns();

                expect(result["column"]).toEqual([11, 12, 13, 14]);
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);

                v1.on_update(
                    async (updated) => {
                        await validate_delta(
                            "column",
                            updated.delta,
                            [11, 12, 13, 14]
                        );
                        const result = await v1.to_columns();
                        expect(result["column"]).toEqual([
                            11, 12, 13, 14, 11, 12, 13, 14,
                        ]);
                    },
                    { mode: "row" }
                );

                let done;
                let result3 = new Promise((x) => {
                    done = x;
                });
                v2.on_update(
                    async (updated) => {
                        await validate_delta("column", updated.delta, [
                            "A",
                            "B",
                            "C",
                            "D",
                        ]);
                        const result2 = await v2.to_columns();
                        expect(result2["column"]).toEqual([
                            "A",
                            "B",
                            "C",
                            "D",
                            "A",
                            "B",
                            "C",
                            "D",
                        ]);
                        await v2.delete();
                        await v1.delete();
                        await table.delete();
                        done();
                    },
                    { mode: "row" }
                );

                table.update(expressions_common.data);
                await result3;
            });

            test("Partial update delta", async () => {
                expect.assertions(6);

                const table = await perspective.table(expressions_common.data, {
                    index: "x",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                });

                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                });

                const result = await v1.to_columns();
                const result2 = await v2.to_columns();

                expect(result["column"]).toEqual([2, 4, 6, 8]);
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);

                v1.on_update(
                    async (updated) => {
                        await validate_delta("column", updated.delta, [
                            null,
                            4,
                            6,
                            8,
                            20,
                        ]);
                        const result = await v1.to_columns();
                        expect(result["column"]).toEqual([
                            null,
                            2,
                            4,
                            6,
                            8,
                            20,
                        ]);
                    },
                    { mode: "row" }
                );

                let done;
                let result3 = new Promise((x) => {
                    done = x;
                });
                v2.on_update(
                    async (updated) => {
                        await validate_delta("column", updated.delta, [
                            "DEF",
                            "X",
                            "Z",
                            "Y",
                            "ABC",
                        ]);
                        const result = await v2.to_columns();
                        expect(result["column"]).toEqual([
                            "DEF",
                            "A",
                            "X",
                            "Z",
                            "Y",
                            "ABC",
                        ]);
                        await v2.delete();
                        await v1.delete();
                        await table.delete();
                        done();
                    },
                    { mode: "row" }
                );

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });
                await result3;
            });

            test("Partial update, sorted delta", async () => {
                expect.assertions(6);
                const table = await perspective.table(expressions_common.data, {
                    index: "x",
                });

                const v1 = await table.view({
                    expressions: { column: `"x" * 2` },
                    sort: [["column", "desc"]],
                });
                const v2 = await table.view({
                    expressions: { column: `upper("y")` },
                    sort: [["column", "desc"]],
                });

                const result = await v1.to_columns();
                const result2 = await v2.to_columns();

                expect(result["column"]).toEqual([8, 6, 4, 2]);
                expect(result2["column"]).toEqual(["D", "C", "B", "A"]);

                v1.on_update(
                    async (updated) => {
                        await validate_delta("column", updated.delta, [
                            20,
                            8,
                            6,
                            4,
                            null,
                        ]);
                        const result = await v1.to_columns();
                        expect(result["column"]).toEqual([
                            20,
                            8,
                            6,
                            4,
                            2,
                            null,
                        ]);
                    },
                    { mode: "row" }
                );

                let done;
                let result3 = new Promise((x) => {
                    done = x;
                });
                v2.on_update(
                    async (updated) => {
                        await validate_delta("column", updated.delta, [
                            "Z",
                            "Y",
                            "X",
                            "DEF",
                            "ABC",
                        ]);
                        const result2 = await v2.to_columns();
                        expect(result2["column"]).toEqual([
                            "Z",
                            "Y",
                            "X",
                            "DEF",
                            "ABC",
                            "A",
                        ]);
                        await v2.delete();
                        await v1.delete();
                        await table.delete();
                        done();
                    },
                    { mode: "row" }
                );

                table.update({
                    x: [2, 4, 3, 10, null],
                    y: ["X", "Y", "Z", "ABC", "DEF"],
                });
                await result3;
            });
        });

        test.describe("Clear/Replace", () => {
            test("Rows should clear() when called", async () => {
                const now = new Date();
                const bucketed = new Date(now.getUTCFullYear(), 0, 1).getTime();
                const table = await perspective.table({
                    x: [1, 2, 3, 4],
                    y: ["a", "b", "c", "d"],
                    z: [now, now, now, now],
                });

                const v1 = await table.view({
                    columns: ["column", "column2"],
                    expressions: {
                        [`column`]: `"x" + 10`,
                        [`column2`]: `concat('a', 'b', 'c')`,
                    },
                });
                const v2 = await table.view({
                    columns: ["column2", "column"],
                    expressions: {
                        [`column`]: `upper("y")`,
                        [`column2`]: `bucket("z", 'Y')`,
                    },
                });

                expect(await v1.expression_schema()).toEqual({
                    column: "float",
                    column2: "string",
                });

                expect(await v2.expression_schema()).toEqual({
                    column: "string",
                    column2: "date",
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([11, 12, 13, 14]);
                expect(result["column2"]).toEqual(Array(4).fill("abc"));
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);
                expect(result2["column2"]).toEqual(Array(4).fill(bucketed));

                await table.clear();

                expect(await v1.num_rows()).toEqual(0);
                expect(await v2.num_rows()).toEqual(0);

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result).toEqual({ column: [], column2: [] });
                expect(result2).toEqual({ column: [], column2: [] });

                await v2.delete();
                await v1.delete();
                await table.delete();
            });

            test("Rows should replace() when called", async () => {
                const now = new Date();
                const bucketed = new Date(now.getUTCFullYear(), 0, 1).getTime();
                const table = await perspective.table({
                    x: [1, 2, 3, 4],
                    y: ["a", "b", "c", "d"],
                    z: [now, now, now, now],
                });

                const v1 = await table.view({
                    columns: ["column", "column2"],
                    expressions: {
                        [`column`]: `"x" + 10`,
                        [`column2`]: `concat('a', 'b', 'c')`,
                    },
                });
                const v2 = await table.view({
                    columns: ["column2", "column"],
                    expressions: {
                        [`column`]: `upper("y")`,
                        [`column2`]: `bucket("z", 'Y')`,
                    },
                });

                expect(await v1.expression_schema()).toEqual({
                    column: "float",
                    column2: "string",
                });

                expect(await v2.expression_schema()).toEqual({
                    column: "string",
                    column2: "date",
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([11, 12, 13, 14]);
                expect(result["column2"]).toEqual(Array(4).fill("abc"));
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);
                expect(result2["column2"]).toEqual(Array(4).fill(bucketed));

                await table.replace({
                    x: [100, 300],
                    y: ["x", "y"],
                    z: [now, now],
                });

                expect(await v1.num_rows()).toEqual(2);
                expect(await v2.num_rows()).toEqual(2);

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([110, 310]);
                expect(result["column2"]).toEqual(["abc", "abc"]);
                expect(result2["column"]).toEqual(["X", "Y"]);
                expect(result2["column2"]).toEqual([bucketed, bucketed]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });
        });

        test.describe("Remove", () => {
            test("Rows should remove() when called", async () => {
                const now = new Date();
                const bucketed = new Date(now.getUTCFullYear(), 0, 1).getTime();
                const table = await perspective.table(
                    {
                        x: [1, 2, 3, 4],
                        y: ["a", "b", "c", "d"],
                        z: [now, now, now, now],
                    },
                    { index: "x" }
                );

                const v1 = await table.view({
                    columns: ["column", "column2"],
                    expressions: {
                        [`column`]: `"x" + 10`,
                        [`column2`]: `concat('a', 'b', 'c')`,
                    },
                });
                const v2 = await table.view({
                    columns: ["column2", "column"],
                    expressions: {
                        [`column`]: `upper("y")`,
                        [`column2`]: `bucket("z", 'Y')`,
                    },
                });

                expect(await v1.expression_schema()).toEqual({
                    column: "float",
                    column2: "string",
                });

                expect(await v2.expression_schema()).toEqual({
                    column: "string",
                    column2: "date",
                });

                let result = await v1.to_columns();
                let result2 = await v2.to_columns();

                expect(result["column"]).toEqual([11, 12, 13, 14]);
                expect(result["column2"]).toEqual(Array(4).fill("abc"));
                expect(result2["column"]).toEqual(["A", "B", "C", "D"]);
                expect(result2["column2"]).toEqual(Array(4).fill(bucketed));

                await table.remove([2, 3]);

                // FIXME: size() and num_rows() do not respond correctly to
                // remove() calls.
                // expect(await v1.num_rows()).toEqual(2);
                // expect(await v2.num_rows()).toEqual(2);

                result = await v1.to_columns();
                result2 = await v2.to_columns();

                expect(result["column"]).toEqual([11, 14]);
                expect(result["column2"]).toEqual(["abc", "abc"]);
                expect(result2["column"]).toEqual(["A", "D"]);
                expect(result2["column2"]).toEqual([bucketed, bucketed]);

                await v2.delete();
                await v1.delete();
                await table.delete();
            });
        });

        test("Multiple views with the same expression alias should not conflict", async () => {
            const now = new Date();
            const bucketed = new Date(now.getUTCFullYear(), 0, 1).getTime();
            const table = await perspective.table({
                x: [1, 2, 3, 4],
                y: ["a", "b", "c", "d"],
                z: [now, now, now, now],
            });

            const v1 = await table.view({
                columns: ["column", "column2"],
                expressions: {
                    [`column`]: `"x" + 10`,
                    [`column2`]: `concat('a', 'b', 'c')`,
                },
            });
            const v2 = await table.view({
                columns: ["column2", "column"],
                expressions: {
                    [`column`]: `upper("y")`,
                    [`column2`]: `bucket("z", 'Y')`,
                },
            });

            expect(await v1.expression_schema()).toEqual({
                column: "float",
                column2: "string",
            });

            expect(await v2.expression_schema()).toEqual({
                column: "string",
                column2: "date",
            });

            const result = await v1.to_columns();
            const result2 = await v2.to_columns();

            expect(result["column"]).toEqual([11, 12, 13, 14]);
            expect(result["column2"]).toEqual(Array(4).fill("abc"));
            expect(result2["column"]).toEqual(["A", "B", "C", "D"]);
            expect(result2["column2"]).toEqual(Array(4).fill(bucketed));

            await v2.delete();
            await v1.delete();
            await table.delete();
        });

        test("Multiple views with the same expression alias should not conflict, to_arrow", async () => {
            const table = await perspective.table(expressions_common.data);

            const v1 = await table.view({
                expressions: { column: `"x" + 10` },
            });
            const v2 = await table.view({
                expressions: { column: `upper("y")` },
            });

            let result = await v1.to_columns();
            let result2 = await v2.to_columns();

            expect(result["column"]).toEqual([11, 12, 13, 14]);
            expect(result2["column"]).toEqual(["A", "B", "C", "D"]);

            const t1 = await perspective.table(await v1.to_arrow());
            const t2 = await perspective.table(await v2.to_arrow());

            const new_v1 = await t1.view();
            const new_v2 = await t2.view();

            result = await new_v1.to_columns();
            result2 = await new_v2.to_columns();

            expect(result["column"]).toEqual([11, 12, 13, 14]);
            expect(result2["column"]).toEqual(["A", "B", "C", "D"]);

            await new_v2.delete();
            await new_v1.delete();
            await t2.delete();
            await t1.delete();
            await v2.delete();
            await v1.delete();
            await table.delete();
        });

        test("Multiple views with the same expression alias should not conflict, filtered", async () => {
            const table = await perspective.table(expressions_common.data);

            const v1 = await table.view({
                expressions: { column: `"x" + 10` },
                filter: [["column", "==", 12]],
            });
            const v2 = await table.view({
                expressions: { column: `upper("y")` },
                filter: [["column", "==", "D"]],
            });

            const result = await v1.to_columns();
            const result2 = await v2.to_columns();

            expect(result["column"]).toEqual([12]);
            expect(result2["column"]).toEqual(["D"]);

            await v2.delete();
            await v1.delete();
            await table.delete();
        });

        test("Multiple pivoted views with the same expression alias should not conflict", async () => {
            const table = await perspective.table(expressions_common.data);

            const v1 = await table.view({
                group_by: ["y"],
                split_by: ["x"],
                expressions: { column: `"x" + 10` },
            });
            const v2 = await table.view({
                group_by: ["x"],
                split_by: ["y"],
                expressions: { column: `upper("y")` },
                aggregates: {
                    column: "last",
                },
            });

            const result = await v1.to_columns();
            const result2 = await v2.to_columns();

            expect(result["1|column"]).toEqual([11, 11, null, null, null]);
            expect(result["2|column"]).toEqual([12, null, 12, null, null]);
            expect(result["3|column"]).toEqual([13, null, null, 13, null]);
            expect(result["4|column"]).toEqual([14, null, null, null, 14]);

            expect(result2["a|column"]).toEqual(["A", "A", null, null, null]);
            expect(result2["b|column"]).toEqual(["B", null, "B", null, null]);
            expect(result2["c|column"]).toEqual(["C", null, null, "C", null]);
            expect(result2["d|column"]).toEqual(["D", null, null, null, "D"]);

            await v2.delete();
            await v1.delete();
            await table.delete();
        });

        test("Multiple pivoted views with the same expression alias and different aggregates should not conflict", async () => {
            const table = await perspective.table({
                x: [10, 10, 20, 20],
                y: ["A", "B", "C", "D"],
                z: [1.5, 2.5, 3.5, 4.5],
            });

            const v1 = await table.view({
                group_by: ["x"],
                expressions: { column: `"z" + 10` },
                aggregates: {
                    column: "avg",
                },
            });

            const v2 = await table.view({
                group_by: ["x"],
                expressions: { column: `upper("y")` },
                aggregates: {
                    column: "last",
                },
            });

            const v3 = await table.view({
                group_by: ["x"],
                expressions: { column: `2 * "z"` },
                aggregates: {
                    column: ["weighted mean", "z"],
                },
            });

            const result = await v1.to_columns();
            const result2 = await v2.to_columns();
            const result3 = await v3.to_columns();

            expect(result["column"]).toEqual([13, 12, 14]);
            expect(result2["column"]).toEqual(["D", "B", "D"]);
            expect(result3["column"]).toEqual([6.833333333333333, 4.25, 8.125]);

            await v3.delete();
            await v2.delete();
            await v1.delete();
            await table.delete();
        });

        test("Multiple 2-sided pivoted views with the same expression alias and different aggregates should not conflict", async () => {
            const table = await perspective.table({
                x: [10, 10, 20, 20],
                y: ["A", "B", "C", "D"],
                z: [1.5, 2.5, 3.5, 4.5],
            });

            const v1 = await table.view({
                group_by: ["x"],
                split_by: ["y"],
                expressions: { column: `"z" + 10` },
                aggregates: {
                    column: "avg",
                },
            });

            const v2 = await table.view({
                group_by: ["x"],
                split_by: ["y"],
                expressions: { column: `upper("y")` },
                aggregates: {
                    column: "last",
                },
            });

            const v3 = await table.view({
                group_by: ["x"],
                split_by: ["y"],
                expressions: { column: `2 * "z"` },
                aggregates: {
                    column: ["weighted mean", "z"],
                },
            });

            const result = await v1.to_columns();
            const result2 = await v2.to_columns();
            const result3 = await v3.to_columns();

            expect(result).toEqual({
                __ROW_PATH__: [[], [10], [20]],
                "A|x": [10, 10, null],
                "A|y": [1, 1, null],
                "A|z": [1.5, 1.5, null],
                "A|column": [11.5, 11.5, null],
                "B|x": [10, 10, null],
                "B|y": [1, 1, null],
                "B|z": [2.5, 2.5, null],
                "B|column": [12.5, 12.5, null],
                "C|x": [20, null, 20],
                "C|y": [1, null, 1],
                "C|z": [3.5, null, 3.5],
                "C|column": [13.5, null, 13.5],
                "D|x": [20, null, 20],
                "D|y": [1, null, 1],
                "D|z": [4.5, null, 4.5],
                "D|column": [14.5, null, 14.5],
            });
            expect(result2).toEqual({
                __ROW_PATH__: [[], [10], [20]],
                "A|x": [10, 10, null],
                "A|y": [1, 1, null],
                "A|z": [1.5, 1.5, null],
                "A|column": ["A", "A", null],
                "B|x": [10, 10, null],
                "B|y": [1, 1, null],
                "B|z": [2.5, 2.5, null],
                "B|column": ["B", "B", null],
                "C|x": [20, null, 20],
                "C|y": [1, null, 1],
                "C|z": [3.5, null, 3.5],
                "C|column": ["C", null, "C"],
                "D|x": [20, null, 20],
                "D|y": [1, null, 1],
                "D|z": [4.5, null, 4.5],
                "D|column": ["D", null, "D"],
            });
            expect(result3).toEqual({
                __ROW_PATH__: [[], [10], [20]],
                "A|x": [10, 10, null],
                "A|y": [1, 1, null],
                "A|z": [1.5, 1.5, null],
                "A|column": [3, 3, null],
                "B|x": [10, 10, null],
                "B|y": [1, 1, null],
                "B|z": [2.5, 2.5, null],
                "B|column": [5, 5, null],
                "C|x": [20, null, 20],
                "C|y": [1, null, 1],
                "C|z": [3.5, null, 3.5],
                "C|column": [7, null, 7],
                "D|x": [20, null, 20],
                "D|y": [1, null, 1],
                "D|z": [4.5, null, 4.5],
                "D|column": [9, null, 9],
            });

            await v3.delete();
            await v2.delete();
            await v1.delete();
            await table.delete();
        });
    });
})(perspective);
