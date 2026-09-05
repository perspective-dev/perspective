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
import perspective from "../perspective_client";

async function mixed_table(perspective) {
    const table = await perspective.table({
        a: "integer",
        b: "float",
        c: "string",
        d: "boolean",
        e: "date",
        f: "datetime",
    });
    await table.update({
        a: [1, 2, 3, 4],
        b: [1.0, 2.5, 3.0, 4.5],
        c: ["x", "y", "z", "w"],
        d: [true, false, true, false],
        e: [
            new Date(2020, 0, 1),
            new Date(2020, 0, 2),
            new Date(2020, 0, 3),
            new Date(2020, 0, 4),
        ],
        f: [
            new Date(2020, 0, 1, 1),
            new Date(2020, 0, 2, 1),
            new Date(2020, 0, 3, 1),
            new Date(2020, 0, 4, 1),
        ],
    });
    return table;
}

((perspective) => {
    test.describe("Expression type checking", function () {
        test.describe("Numeric promotion", function () {
            test("Integer columns compare against numeric literals", async function () {
                const table = await mixed_table(perspective);
                const expressions = {
                    lt: '"a" < 3',
                    lte: '"a" <= 3',
                    gt: '"a" > 3',
                    gte: '"a" >= 3',
                    eq: '"a" == 3',
                    ne: '"a" != 3',
                };
                const validated = await table.validate_expressions(expressions);
                expect(validated.errors).toEqual({});
                expect(validated.expression_schema).toEqual({
                    lt: "boolean",
                    lte: "boolean",
                    gt: "boolean",
                    gte: "boolean",
                    eq: "boolean",
                    ne: "boolean",
                });

                const view = await table.view({ expressions });
                const result = await view.to_columns();
                expect(result.lt).toEqual([true, true, false, false]);
                expect(result.lte).toEqual([true, true, true, false]);
                expect(result.gt).toEqual([false, false, false, true]);
                expect(result.gte).toEqual([false, false, true, true]);
                expect(result.eq).toEqual([false, false, true, false]);
                expect(result.ne).toEqual([true, true, false, true]);
                await view.delete();
                await table.delete();
            });

            test("Integer and float columns compare by value", async function () {
                const table = await mixed_table(perspective);
                const view = await table.view({
                    expressions: {
                        eq: '"a" == "b"',
                        ne: '"a" != "b"',
                        lt: '"a" < "b"',
                        gte: '"b" >= "a"',
                    },
                });
                const result = await view.to_columns();
                expect(result.eq).toEqual([true, false, true, false]);
                expect(result.ne).toEqual([false, true, false, true]);
                expect(result.lt).toEqual([false, true, false, true]);
                expect(result.gte).toEqual([true, true, true, true]);
                await view.delete();
                await table.delete();
            });

            test("Conditionals branch on integer comparisons", async function () {
                const table = await mixed_table(perspective);
                const view = await table.view({
                    expressions: {
                        cond: 'if ("a" < 3) 10; else 100',
                        tern: '"a" == 2 ? 1 : 0',
                    },
                });
                const result = await view.to_columns();
                expect(result.cond).toEqual([10, 10, 100, 100]);
                expect(result.tern).toEqual([0, 1, 0, 0]);
                await view.delete();
                await table.delete();
            });

            test("integer() casts compare against integer columns", async function () {
                const table = await mixed_table(perspective);
                const view = await table.view({
                    expressions: {
                        eq: '"a" == integer(3)',
                        lt: 'integer("b") < "a"',
                    },
                });
                const result = await view.to_columns();
                expect(result.eq).toEqual([false, false, true, false]);
                expect(result.lt).toEqual([false, false, false, false]);
                await view.delete();
                await table.delete();
            });

            test("inrange promotes numeric bounds", async function () {
                const table = await mixed_table(perspective);
                const view = await table.view({
                    expressions: {
                        r: 'inrange(2, "a", 3)',
                        s: 'inrange("a", "b", 3)',
                    },
                });
                const result = await view.to_columns();
                expect(result.r).toEqual([false, true, true, false]);
                expect(result.s).toEqual([true, true, true, false]);
                await view.delete();
                await table.delete();
            });

            test("Null integers compare like nulls", async function () {
                const table = await perspective.table({ a: "integer" });
                await table.update({ a: [1, null, 3, null] });
                const view = await table.view({
                    expressions: {
                        eq: '"a" == 1',
                        ne: '"a" != 1',
                        lt: '"a" < 2',
                        isnull: '"a" == null',
                        notnull: '"a" != null',
                    },
                });
                const result = await view.to_columns();
                expect(result.eq).toEqual([true, false, false, false]);
                expect(result.ne).toEqual([false, true, true, true]);
                expect(result.lt).toEqual([true, false, false, false]);
                expect(result.isnull).toEqual([false, true, false, true]);
                expect(result.notnull).toEqual([true, false, true, false]);
                await view.delete();
                await table.delete();
            });
        });

        test.describe("Type errors", function () {
            test("Comparing incompatible types is a validation error", async function () {
                const table = await mixed_table(perspective);
                const validated = await table.validate_expressions({
                    str_num: '"c" == 1',
                    bool_num: '"d" < 1',
                    date_datetime: '"e" == "f"',
                    num_str: "\"a\" == 'x'",
                    bool_str: '"d" == "c"',
                    str_gte: '"c" >= "a"',
                });
                expect(validated.expression_schema).toEqual({});
                expect(validated.errors).toEqual({
                    str_num: {
                        error_message:
                            "Type Error - cannot compare string and float with '=='",
                        line: 0,
                        column: 8,
                    },
                    bool_num: {
                        error_message:
                            "Type Error - cannot compare boolean and float with '<'",
                        line: 0,
                        column: 8,
                    },
                    date_datetime: {
                        error_message:
                            "Type Error - cannot compare date and datetime with '=='",
                        line: 0,
                        column: 8,
                    },
                    num_str: {
                        error_message:
                            "Type Error - cannot compare integer and string with '=='",
                        line: 0,
                        column: 8,
                    },
                    bool_str: {
                        error_message:
                            "Type Error - cannot compare boolean and string with '=='",
                        line: 0,
                        column: 8,
                    },
                    str_gte: {
                        error_message:
                            "Type Error - cannot compare string and integer with '>='",
                        line: 0,
                        column: 8,
                    },
                });
                await table.delete();
            });

            test("Type errors report the offending operator position", async function () {
                const table = await mixed_table(perspective);
                const validated = await table.validate_expressions({
                    same_line: '"a" == 1 and "c" == 2',
                    next_line: '"a" == 1 and\n"c" == 2',
                });
                expect(validated.expression_schema).toEqual({});
                expect(validated.errors).toEqual({
                    same_line: {
                        error_message:
                            "Type Error - cannot compare string and float with '=='",
                        line: 0,
                        column: 25,
                    },
                    next_line: {
                        error_message:
                            "Type Error - cannot compare string and float with '=='",
                        line: 1,
                        column: 8,
                    },
                });
                await table.delete();
            });

            test("Incompatible inrange bounds are a validation error", async function () {
                const table = await mixed_table(perspective);
                const validated = await table.validate_expressions({
                    r: 'inrange(1, "c", 3)',
                });
                expect(validated.expression_schema).toEqual({});
                expect(validated.errors).toEqual({
                    r: {
                        error_message:
                            "Type Error - cannot compare float and string with '<='",
                        line: 0,
                        column: 0,
                    },
                });
                await table.delete();
            });

            test("Legacy type errors keep the generic message", async function () {
                const table = await mixed_table(perspective);
                const validated = await table.validate_expressions({
                    x: '"c" + 1',
                    y: 'if ("a" > 1) 5',
                });
                expect(validated.expression_schema).toEqual({});
                expect(validated.errors).toEqual({
                    x: {
                        error_message:
                            "Type Error - inputs do not resolve to a valid expression.",
                        line: 0,
                        column: 0,
                    },
                    y: {
                        error_message:
                            "Type Error - inputs do not resolve to a valid expression.",
                        line: 0,
                        column: 0,
                    },
                });
                await table.delete();
            });
        });

        test.describe("Boolean contexts", function () {
            test("Conditions cast non-boolean values", async function () {
                const table = await perspective.table({
                    a: "integer",
                    c: "string",
                    d: "boolean",
                });
                await table.update({
                    a: [1, null, 0, 4],
                    c: ["x", null, "", "w"],
                    d: [true, null, false, true],
                });
                const expressions = {
                    cond: 'if ("a") 10; else 100',
                    tern: '"c" ? 1 : 0',
                    bool: 'if ("d") 1; else 0',
                };
                const validated = await table.validate_expressions(expressions);
                expect(validated.errors).toEqual({});
                expect(validated.expression_schema).toEqual({
                    cond: "float",
                    tern: "float",
                    bool: "float",
                });
                const view = await table.view({ expressions });
                const result = await view.to_columns();
                expect(result.cond).toEqual([10, 100, 100, 10]);
                expect(result.tern).toEqual([1, 0, 1, 1]);
                expect(result.bool).toEqual([1, 0, 0, 1]);
                await view.delete();
                await table.delete();
            });

            test("Logical operators cast operands", async function () {
                const table = await perspective.table({
                    a: "integer",
                    c: "string",
                    d: "boolean",
                });
                await table.update({
                    a: [1, null, 0, 4],
                    c: ["x", null, "", "w"],
                    d: [true, null, false, true],
                });
                const expressions = {
                    and: '"a" and "d"',
                    or: '"c" or "d"',
                    not_int: 'not("a")',
                    not_bool: 'not("d")',
                    xor: '"a" xor "c"',
                };
                const validated = await table.validate_expressions(expressions);
                expect(validated.errors).toEqual({});
                expect(validated.expression_schema).toEqual({
                    and: "boolean",
                    or: "boolean",
                    not_int: "boolean",
                    not_bool: "boolean",
                    xor: "boolean",
                });
                const view = await table.view({ expressions });
                const result = await view.to_columns();
                expect(result.and).toEqual([true, false, false, true]);
                expect(result.or).toEqual([true, false, true, true]);
                expect(result.not_int).toEqual([false, true, true, false]);
                expect(result.not_bool).toEqual([false, true, true, false]);
                expect(result.xor).toEqual([false, false, true, false]);
                await view.delete();
                await table.delete();
            });

            test("Logical operators on boolean columns", async function () {
                const table = await mixed_table(perspective);
                const view = await table.view({
                    expressions: {
                        and: '"d" and not("d")',
                        or: '"d" or not("d")',
                        not: 'not("d")',
                        xor: '"d" xor ("a" > 2)',
                        cond: 'if ("d") 1; else 0',
                    },
                });
                const result = await view.to_columns();
                expect(result.and).toEqual([false, false, false, false]);
                expect(result.or).toEqual([true, true, true, true]);
                expect(result.not).toEqual([false, true, false, true]);
                expect(result.xor).toEqual([true, false, false, true]);
                expect(result.cond).toEqual([1, 0, 1, 0]);
                await view.delete();
                await table.delete();
            });

            test("Null equality is boolean", async function () {
                const table = await perspective.table({
                    c: "string",
                    d: "boolean",
                });
                await table.update({
                    c: ["x", null, "null", null],
                    d: [true, null, false, null],
                });
                const expressions = {
                    isnull: '"c" == null',
                    notnull: '"c" != null',
                    reversed: 'null == "c"',
                    bool_null: '"d" == null',
                    literal: "'a' == null",
                    both: "null == null",
                    text: "\"c\" == 'null'",
                    branch: 'if ("c" == null) 1; else 0',
                };
                const validated = await table.validate_expressions(expressions);
                expect(validated.errors).toEqual({});
                expect(validated.expression_schema).toEqual({
                    isnull: "boolean",
                    notnull: "boolean",
                    reversed: "boolean",
                    bool_null: "boolean",
                    literal: "boolean",
                    both: "boolean",
                    text: "boolean",
                    branch: "float",
                });
                const view = await table.view({ expressions });
                const result = await view.to_columns();
                expect(result.isnull).toEqual([false, true, false, true]);
                expect(result.notnull).toEqual([true, false, true, false]);
                expect(result.reversed).toEqual([false, true, false, true]);
                expect(result.bool_null).toEqual([false, true, false, true]);
                expect(result.literal).toEqual([false, false, false, false]);
                expect(result.both).toEqual([true, true, true, true]);
                expect(result.text).toEqual([false, false, true, false]);
                expect(result.branch).toEqual([0, 1, 0, 1]);
                await view.delete();
                await table.delete();
            });

            test("Null as a value, in arithmetic and in ordering", async function () {
                const table = await perspective.table({ a: "integer" });
                await table.update({ a: [1, null, 3, null] });
                const expressions = {
                    value: '"a" > 2 ? null : "a"',
                    lt: '"a" < null',
                    add: '"a" + null',
                    mul: "null * 2",
                    abs: "abs(null)",
                    pow: 'pow("a", null)',
                };
                const validated = await table.validate_expressions(expressions);
                expect(validated.errors).toEqual({});
                expect(validated.expression_schema).toEqual({
                    value: "integer",
                    lt: "boolean",
                    add: "float",
                    mul: "float",
                    abs: "float",
                    pow: "float",
                });
                const view = await table.view({ expressions });
                const result = await view.to_columns();
                expect(result.value).toEqual([1, null, null, null]);
                expect(result.lt).toEqual([null, null, null, null]);
                expect(result.add).toEqual([null, null, null, null]);
                expect(result.mul).toEqual([null, null, null, null]);
                expect(result.abs).toEqual([null, null, null, null]);
                expect(result.pow).toEqual([null, null, null, null]);
                await view.delete();
                await table.delete();
            });
        });
    });
})(perspective);
