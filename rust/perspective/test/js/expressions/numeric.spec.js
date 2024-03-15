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

const NUMERIC_TYPES = [
    "i8",
    "ui8",
    "i16",
    "ui16",
    "i32",
    "ui32",
    "i64",
    "ui64",
    "f32",
    "f64",
];

/**
 * Return all possible permutations of unary operators for all numeric types.
 */
function generate_unary_operations(operator) {
    const expressions = [];
    for (const expr of NUMERIC_TYPES) {
        expressions.push(`${operator}"${expr}"`);
    }
    return expressions;
}

/**
 * Return all possible permutations of binary operators for all numeric types.
 */
function generate_binary_operations(operator) {
    const expressions = [];
    for (const expr of NUMERIC_TYPES) {
        for (let i = 0; i < NUMERIC_TYPES.length; i++) {
            expressions.push(`"${expr}" ${operator} "${NUMERIC_TYPES[i]}"`);
        }
    }
    return expressions;
}

function calc_unary(operator, value) {
    switch (operator) {
        case "+":
            return +value;
        case "-":
            return -value;
        default:
            throw new Error("Unknown operator");
    }
}

function calc_binary(operator, left, right) {
    switch (operator) {
        case "+":
            return left + right;
        case "-":
            return left - right;
        case "*":
            return left * right;
        case "/":
            return left / right;
        case "%":
            return left % right;
        case "^":
            return Math.pow(left, right);
        case "==":
            return left == right ? 1 : 0;
        case "!=":
            return left != right ? 1 : 0;
        case ">":
            return left > right ? 1 : 0;
        case "<":
            return left < right ? 1 : 0;
        case ">=":
            return left >= right ? 1 : 0;
        case "<=":
            return left <= right ? 1 : 0;
        default:
            throw new Error("Unknown operator");
    }
}

/**
 * Validate the results of operations against all numeric types.
 *
 * @param {*} operator
 */
function validate_unary_operations(output, expressions, operator) {
    for (const expr of expressions) {
        const output_col = output[expr];
        const input = expr.substr(2, expr.length - 3);
        expect({
            expr,
            result: output_col,
        }).toEqual({
            expr,
            result: output[input].map((v) => calc_unary(operator, v)),
        });
    }
}

/**
 * Validate the results of operations against all numeric types.
 *
 * @param {*} operator
 */
function validate_binary_operations(output, expressions, operator) {
    for (const expr of expressions) {
        const output_col = output[expr];
        const inputs = expr.split(` ${operator} `);
        const left = inputs[0].substr(1, inputs[0].length - 2);
        const right = inputs[1].substr(1, inputs[1].length - 2);
        expect({
            expr,
            result: output_col,
        }).toEqual({
            expr,
            result: output[left].map((v, idx) =>
                calc_binary(operator, v, output[right][idx])
            ),
        });
    }
}

/**
 * Tests the correctness of expressions allowed by exprtk, using as many
 * of the expression structures as we can, such as conditionals, loops, etc.
 */
((perspective) => {
    test.describe("Numeric operations", function () {
        test.describe("All numeric types", function () {
            test.describe("aggregates", function () {
                test(
                    "integer",
                    async function () {
                        const table = await perspective.table({
                            a: "integer",
                        });

                        const view = await table.view({
                            expressions: { '"a"': '"a"' },
                        });

                        table.update({
                            a: [10, 15, 20, 30],
                        });

                        const result = await view.to_columns();
                        expect(result['"a"']).toEqual([10, 15, 20, 30]);
                        expect(result["a"]).toEqual([10, 15, 20, 30]);
                        await view.delete();
                        await table.delete();
                    },

                    test("expression integer column sum", async function () {
                        const table = await perspective.table({
                            a: [10, 15, 20, 30],
                            b: [1, 2, 3, 4],
                        });

                        const view = await table.view({
                            group_by: ["b"],
                            aggregates: {
                                a: "sum",
                                b: "sum",
                            },
                            expressions: { '"a"': '"a"' },
                        });

                        table.update({
                            a: [40, 50, 60, 70],
                        });

                        expect(await view.to_columns()).toEqual({
                            __ROW_PATH__: [[], [null], [1], [2], [3], [4]],
                            a: [295, 220, 10, 15, 20, 30],
                            b: [10, 0, 1, 2, 3, 4],
                            '"a"': [295, 220, 10, 15, 20, 30],
                        });
                        await view.delete();
                        await table.delete();
                    })
                );
            });

            test.describe("unary", function () {
                test("negative", async function () {
                    const table = await perspective.table(
                        common.all_types_arrow.slice()
                    );
                    const expressions = generate_unary_operations("+");
                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();
                    validate_unary_operations(result, expressions, "+");
                    await view.delete();
                    await table.delete();
                });
            });

            test.describe("binary", function () {
                test("add", async function () {
                    const table = await perspective.table(
                        common.all_types_arrow.slice()
                    );
                    const expressions = generate_binary_operations("+");
                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();
                    validate_binary_operations(result, expressions, "+");
                    await view.delete();
                    await table.delete();
                });

                test("subtract", async function () {
                    const table = await perspective.table(
                        common.all_types_arrow.slice()
                    );
                    const expressions = generate_binary_operations("-");
                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();
                    validate_binary_operations(result, expressions, "-");
                    await view.delete();
                    await table.delete();
                });

                test("multiply", async function () {
                    const table = await perspective.table(
                        common.all_types_arrow.slice()
                    );
                    const expressions = generate_binary_operations("*");
                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();
                    validate_binary_operations(result, expressions, "*");
                    await view.delete();
                    await table.delete();
                });

                test("divide", async function () {
                    const table = await perspective.table(
                        common.all_types_arrow.slice()
                    );
                    const expressions = generate_binary_operations("/");

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();
                    validate_binary_operations(result, expressions, "/");
                    await view.delete();
                    await table.delete();
                });

                test("modulus", async function () {
                    const table = await perspective.table(
                        common.all_types_arrow.slice()
                    );
                    const expressions = generate_binary_operations("%");

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();
                    validate_binary_operations(result, expressions, "%");
                    await view.delete();
                    await table.delete();
                });

                test("power", async function () {
                    const table = await perspective.table(common.arrow.slice());
                    const expressions = generate_binary_operations("^");
                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();
                    validate_binary_operations(result, expressions, "^");
                });

                test("==", async function () {
                    const table = await perspective.table(
                        common.all_types_multi_arrow.slice()
                    );
                    const expressions = [];

                    // comparisons only work when the two types are the same
                    for (const expr of NUMERIC_TYPES) {
                        expressions.push(`"${expr}" == "${expr} 2"`);
                    }

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();

                    for (const expr of expressions) {
                        const output_col = result[expr];
                        const inputs = expr.split(` == `);
                        const left = inputs[0].substr(1, inputs[0].length - 2);
                        const right = inputs[1].substr(1, inputs[1].length - 2);
                        expect(output_col).toEqual(
                            result[left].map(
                                (v, idx) => v == result[right][idx]
                            )
                        );
                    }
                });

                test("!=", async function () {
                    const table = await perspective.table(
                        common.all_types_multi_arrow.slice()
                    );
                    const expressions = [];

                    // comparisons only work when the two types are the same
                    for (const expr of NUMERIC_TYPES) {
                        expressions.push(`"${expr}" != "${expr} 2"`);
                    }

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();

                    for (const expr of expressions) {
                        const output_col = result[expr];
                        const inputs = expr.split(` != `);
                        const left = inputs[0].substr(1, inputs[0].length - 2);
                        const right = inputs[1].substr(1, inputs[1].length - 2);
                        expect(output_col).toEqual(
                            result[left].map(
                                (v, idx) => v != result[right][idx]
                            )
                        );
                    }
                });

                test(">", async function () {
                    const table = await perspective.table(
                        common.all_types_multi_arrow.slice()
                    );
                    const expressions = [];

                    // comparisons only work when the two types are the same
                    for (const expr of NUMERIC_TYPES) {
                        expressions.push(`"${expr}" > "${expr} 2"`);
                    }

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();

                    for (const expr of expressions) {
                        const output_col = result[expr];
                        const inputs = expr.split(` > `);
                        const left = inputs[0].substr(1, inputs[0].length - 2);
                        const right = inputs[1].substr(1, inputs[1].length - 2);
                        expect(output_col).toEqual(
                            result[left].map((v, idx) => v > result[right][idx])
                        );
                    }
                });

                test("<", async function () {
                    const table = await perspective.table(
                        common.all_types_multi_arrow.slice()
                    );
                    const expressions = [];

                    // comparisons only work when the two types are the same
                    for (const expr of NUMERIC_TYPES) {
                        expressions.push(`"${expr}" < "${expr} 2"`);
                    }

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();

                    for (const expr of expressions) {
                        const output_col = result[expr];
                        const inputs = expr.split(` < `);
                        const left = inputs[0].substr(1, inputs[0].length - 2);
                        const right = inputs[1].substr(1, inputs[1].length - 2);
                        expect(output_col).toEqual(
                            result[left].map((v, idx) => v < result[right][idx])
                        );
                    }
                });

                test(">=", async function () {
                    const table = await perspective.table(
                        common.all_types_multi_arrow.slice()
                    );
                    const expressions = [];

                    // comparisons only work when the two types are the same
                    for (const expr of NUMERIC_TYPES) {
                        expressions.push(`"${expr}" >= "${expr} 2"`);
                    }

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();

                    for (const expr of expressions) {
                        const output_col = result[expr];
                        const inputs = expr.split(` >= `);
                        const left = inputs[0].substr(1, inputs[0].length - 2);
                        const right = inputs[1].substr(1, inputs[1].length - 2);
                        expect(output_col).toEqual(
                            result[left].map(
                                (v, idx) => v >= result[right][idx]
                            )
                        );
                    }
                });

                test("<=", async function () {
                    const table = await perspective.table(
                        common.all_types_multi_arrow.slice()
                    );
                    const expressions = [];

                    // comparisons only work when the two types are the same
                    for (const expr of NUMERIC_TYPES) {
                        expressions.push(`"${expr}" <= "${expr} 2"`);
                    }

                    const view = await table.view({
                        expressions,
                    });

                    const col_names = await view.column_paths();

                    for (const expr of expressions) {
                        expect(col_names.includes(expr)).toBe(true);
                    }

                    const result = await view.to_columns();

                    for (const expr of expressions) {
                        const output_col = result[expr];
                        const inputs = expr.split(` <= `);
                        const left = inputs[0].substr(1, inputs[0].length - 2);
                        const right = inputs[1].substr(1, inputs[1].length - 2);
                        expect(output_col).toEqual(
                            result[left].map(
                                (v, idx) => v <= result[right][idx]
                            )
                        );
                    }
                });

                test("Numeric comparisons should be false for different types", async function () {
                    const table = await perspective.table({
                        a: "integer",
                        b: "float",
                        c: "integer",
                        d: "float",
                    });
                    const view = await table.view({
                        expressions: {
                            '"a" == "b"': '"a" == "b"',
                            '"a" != "b"': '"a" != "b"',
                        },
                    });
                    table.update({
                        a: [1, 2, 3, 4],
                        b: [1.0, 2.0, 3.0, 4.0],
                        c: [1, 0, 1, 0],
                        d: [1.0, 0, 3.0, 0.0],
                    });
                    const result = await view.to_columns();
                    expect(result['"a" == "b"']).toEqual([
                        false,
                        false,
                        false,
                        false,
                    ]);
                    expect(result['"a" != "b"']).toEqual([
                        true,
                        true,
                        true,
                        true,
                    ]);
                    await view.delete();
                    await table.delete();
                });

                test("Numeric comparisons should be true for same types", async function () {
                    const table = await perspective.table({
                        a: "integer",
                        b: "float",
                        c: "integer",
                        d: "float",
                    });
                    const view = await table.view({
                        expressions: [
                            '"a" == "c"',
                            '"a" != "c"',
                            '"b" == "d"',
                            '"b" != "d"',
                        ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                    });
                    table.update({
                        a: [1, 2, 3, 4],
                        b: [1.0, 2.0, 3.0, 4.0],
                        c: [1, 0, 1, 0],
                        d: [1.0, 0, 3.0, 0.0],
                    });
                    const result = await view.to_columns();
                    expect(result['"a" == "c"']).toEqual([
                        true,
                        false,
                        false,
                        false,
                    ]);
                    expect(result['"a" != "c"']).toEqual([
                        false,
                        true,
                        true,
                        true,
                    ]);
                    expect(result['"b" == "d"']).toEqual([
                        true,
                        false,
                        true,
                        false,
                    ]);
                    expect(result['"b" != "d"']).toEqual([
                        false,
                        true,
                        false,
                        true,
                    ]);
                    await view.delete();
                    await table.delete();
                });

                test("Should not divide by 0", async function () {
                    const table = await perspective.table({
                        a: [1, 2, 3, 4],
                        b: [0, 0, 0, 0],
                        c: [1.5, 2.123, 3.125, 4.123809],
                    });

                    const view = await table.view({
                        expressions: {
                            '"a" / "b"': '"a" / "b"',
                            '"c" / "b"': '"c" / "b"',
                        },
                    });

                    const result = await view.to_columns();
                    expect(result['"a" / "b"']).toEqual([
                        null,
                        null,
                        null,
                        null,
                    ]);
                    expect(result['"c" / "b"']).toEqual([
                        null,
                        null,
                        null,
                        null,
                    ]);
                    await view.delete();
                    await table.delete();
                });

                test("Should not modulo by 0", async function () {
                    const table = await perspective.table({
                        a: [1, 2, 3, 4],
                        b: [0, 0, 0, 0],
                        c: [1.5, 2.123, 3.125, 4.123809],
                    });

                    const view = await table.view({
                        expressions: {
                            '"a" % "b"': '"a" % "b"',
                            '"c" % "b"': '"c" % "b"',
                        },
                    });

                    const result = await view.to_columns();
                    expect(result['"a" % "b"']).toEqual([
                        null,
                        null,
                        null,
                        null,
                    ]);
                    expect(result['"c" % "b"']).toEqual([
                        null,
                        null,
                        null,
                        null,
                    ]);
                    await view.delete();
                    await table.delete();
                });
            });
        });

        test.describe("Functions", function () {
            test("min", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const expressions = [
                    "min(1)",
                    'min("a")',
                    'min("a", -10, -10.001)',
                    'min("b")',
                    'min("b", 0.00000000001, -10, -100, -100.1)',
                    'min("a", "b")',
                ];

                const view = await table.view({
                    expressions,
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [1.5, 2.5, 3.5, 4.5],
                });

                const schema = await view.expression_schema();
                for (const expr of expressions) {
                    expect(schema[expr]).toEqual("float");
                }

                const result = await view.to_columns();
                expect(result["min(1)"]).toEqual([1, 1, 1, 1]);
                expect(result['min("a")']).toEqual([1, 2, 3, 4]);
                expect(result['min("a", -10, -10.001)']).toEqual([
                    -10.001, -10.001, -10.001, -10.001,
                ]);
                expect(result['min("b")']).toEqual([1.5, 2.5, 3.5, 4.5]);
                expect(
                    result['min("b", 0.00000000001, -10, -100, -100.1)']
                ).toEqual([-100.1, -100.1, -100.1, -100.1]);
                expect(result['min("a", "b")']).toEqual([1, 2, 3, 4]);
                await view.delete();
                await table.delete();
            });

            test("max", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const expressions = [
                    "max(1)",
                    "max(2000000000000.11, 2000000000000.1)",
                    'max("a")',
                    'max("a", -1.00001)',
                    'max("a", "b")',
                    'max("b")',
                    'max("a", 10, 20, 0.1, 0.00000001)',
                    'max("b", -1, -100, 100)',
                ];

                const view = await table.view({
                    expressions,
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [1.5, 2.5, 3.5, 4.5],
                });

                const schema = await view.expression_schema();
                for (const expr of expressions) {
                    expect(schema[expr]).toEqual("float");
                }

                const result = await view.to_columns();
                expect(result["max(1)"]).toEqual([1, 1, 1, 1]);
                expect(
                    result["max(2000000000000.11, 2000000000000.1)"]
                ).toEqual([
                    2000000000000.11, 2000000000000.11, 2000000000000.11,
                    2000000000000.11,
                ]);
                expect(result['max("a")']).toEqual([1, 2, 3, 4]);
                expect(result['max("a", "b")']).toEqual([1.5, 2.5, 3.5, 4.5]);
                expect(result['max("b")']).toEqual([1.5, 2.5, 3.5, 4.5]);
                expect(result['max("a", 10, 20, 0.1, 0.00000001)']).toEqual([
                    20, 20, 20, 20,
                ]);
                expect(result['max("b", -1, -100, 100)']).toEqual([
                    100, 100, 100, 100,
                ]);

                await view.delete();
                await table.delete();
            });

            test("inrange", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                // works for floats only
                const view = await table.view({
                    expressions: {
                        'inrange(9, "b", 20)': 'inrange(9, "b", 20)',
                    },
                });

                table.update({
                    a: [10, 15, 20, 30],
                    b: [10.5, 15.5, 20.5, 30.5],
                });

                const result = await view.to_columns();
                expect(result['inrange(9, "b", 20)']).toEqual([
                    true,
                    true,
                    false,
                    false,
                ]);
                await view.delete();
                await table.delete();
            });

            test("iclamp", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'iclamp(10, "a", 20)': 'iclamp(10, "a", 20)',
                        'iclamp(10, "b", 20)': 'iclamp(10, "b", 20)',
                    },
                });

                table.update({
                    a: [10, 15, 20, 30],
                    b: [10.5, 15.5, 20.5, 30.5],
                });

                const result = await view.to_columns();
                expect(result['iclamp(10, "a", 20)']).toEqual([10, 15, 20, 30]);
                expect(result['iclamp(10, "b", 20)']).toEqual([
                    10, 20, 20.5, 30.5,
                ]);
                await view.delete();
                await table.delete();
            });

            test("pow", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'pow("a", 1)': 'pow("a", 1)',
                        'pow("b", 3)': 'pow("b", 3)',
                    },
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [1.5, 2.5, 3.5, 4.5],
                });

                const result = await view.to_columns();
                expect(result['pow("a", 1)']).toEqual([1, 2, 3, 4]);
                expect(result['pow("b", 3)']).toEqual(
                    [1.5, 2.5, 3.5, 4.5].map((x) => Math.pow(x, 3))
                );
                await view.delete();
                await table.delete();
            });

            test.skip("logn", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'logn("a", 5)': 'logn("a", 5)',
                        'logn("b", 3)': 'logn("b", 3)',
                    },
                });

                table.update({
                    a: [100, 200, 300, 400],
                    b: [100.5, 200.5, 300.5, 400.5],
                });

                const result = await view.to_columns();
                expect(result['logn("a", 5)']).toEqual(
                    [100, 200, 300, 400].map((x) => Math.log(x) / Math.log(5))
                );
                expect(result['logn("b", 3)']).toEqual(
                    [100.5, 200.5, 300.5, 400.5].map(
                        (x) => Math.log(x) / Math.log(3)
                    )
                );

                await view.delete();
                await table.delete();
            });

            test("root", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'root("a", 5)': 'root("a", 5)',
                        'root("b", 3)': 'root("b", 3)',
                    },
                });

                table.update({
                    a: [100, 200, 300, 400],
                    b: [100.5, 200.5, 300.5, 400.5],
                });

                const result = await view.to_columns();
                expect(
                    result['root("a", 5)'].map((x) => Number(x.toFixed(5)))
                ).toEqual(
                    [100, 200, 300, 400].map((x) =>
                        Number(Math.pow(x, 1 / 5).toFixed(5))
                    )
                );
                expect(
                    result['root("b", 3)'].map((x) => Number(x.toFixed(5)))
                ).toEqual(
                    [100.5, 200.5, 300.5, 400.5].map((x) =>
                        Number(Math.pow(x, 1 / 3).toFixed(5))
                    )
                );
                await view.delete();
                await table.delete();
            });

            test("avg", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: [
                        'avg("a", 10, 20, 30, 40, "a")',
                        'avg("b", 3, 4, 5, "b")',
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [1.5, 2.5, 3.5, 4.5],
                });

                const result = await view.to_columns();
                expect(result['avg("a", 10, 20, 30, 40, "a")']).toEqual(
                    [1, 2, 3, 4].map((x) => (x + x + 10 + 20 + 30 + 40) / 6)
                );
                expect(result['avg("b", 3, 4, 5, "b")']).toEqual(
                    [1.5, 2.5, 3.5, 4.5].map((x) => (x + x + 3 + 4 + 5) / 5)
                );
                await view.delete();
                await table.delete();
            });

            test("sum", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: [
                        'sum("a", 10, 20, 30, 40, "a")',
                        'sum("b", 3, 4, 5, "b")',
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [1.5, 2.5, 3.5, 4.5],
                });

                const result = await view.to_columns();
                expect(result['sum("a", 10, 20, 30, 40, "a")']).toEqual(
                    [1, 2, 3, 4].map((x) => x + x + 10 + 20 + 30 + 40)
                );
                expect(result['sum("b", 3, 4, 5, "b")']).toEqual(
                    [1.5, 2.5, 3.5, 4.5].map((x) => x + x + 3 + 4 + 5)
                );
                await view.delete();
                await table.delete();
            });

            test("trunc", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'trunc("a")': 'trunc("a")',
                        'trunc("b")': 'trunc("b")',
                    },
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [1.5, 2.5, 3.5, 4.5],
                });

                const result = await view.to_columns();
                expect(result['trunc("a")']).toEqual([1, 2, 3, 4]);
                expect(result['trunc("b")']).toEqual([1, 2, 3, 4]);
                await view.delete();
                await table.delete();
            });

            test("d2r", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'deg2rad("a")': 'deg2rad("a")',
                        'deg2rad("b")': 'deg2rad("b")',
                    },
                });

                table.update({
                    a: [30, 60, 90, 120],
                    b: [25.5, 45.5, 88.721282, 91.12983],
                });

                const result = await view.to_columns();
                expect(result['deg2rad("a")']).toEqual(
                    [30, 60, 90, 120].map((x) => x * (Math.PI / 180))
                );
                expect(result['deg2rad("b")']).toEqual(
                    [25.5, 45.5, 88.721282, 91.12983].map(
                        (x) => x * (Math.PI / 180)
                    )
                );
                await view.delete();
                await table.delete();
            });

            test.skip("OG - r2d", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'rad2deg("a")': 'rad2deg("a")',
                        'rad2deg("b")': 'rad2deg("b")',
                    },
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [25.5, 45.5, 88.721282, 91.12983].map(
                        (x) => x * (Math.PI / 180)
                    ),
                });

                const result = await view.to_columns();
                expect(result['rad2deg("a")']).toEqual(
                    [1, 2, 3, 4].map((x) => x * (180 / Math.PI))
                );
                expect(result['rad2deg("b")']).toEqual([
                    25.5, 45.5, 88.721282, 91.12983,
                ]);
                await view.delete();
                await table.delete();
            });

            test("r2d", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: {
                        'rad2deg("a")': 'rad2deg("a")',
                        'rad2deg("b")': 'rad2deg("b")',
                    },
                });

                table.update({
                    a: [1, 2, 3, 4],
                    b: [25.5, 45.5, 88.721282, 91.12983].map(
                        (x) => x * (Math.PI / 180)
                    ),
                });

                const result = await view.to_columns();
                expect(result['rad2deg("a")']).toEqual(
                    [1, 2, 3, 4].map((x) => x * (180 / Math.PI))
                );
                const expected = [25.5, 45.5, 88.721282, 91.12983];
                expect(result['rad2deg("b")'].length).toEqual(expected.length);
                result['rad2deg("b")'].forEach((x, idx) =>
                    expect(x).toBeCloseTo(expected[idx], 5)
                );
                await view.delete();
                await table.delete();
            });

            test("is_null", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: [
                        'is_null("a")',
                        'is_null("b")',
                        'if(is_null("a")) 100; else 0;',
                        'if(is_null("b")) 100; else 0;',
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });

                table.update({
                    a: [1, null, null, 4],
                    b: [null, 2.5, null, 4.5],
                });

                const result = await view.to_columns();
                expect(result['is_null("a")']).toEqual([
                    false,
                    true,
                    true,
                    false,
                ]);
                expect(result['is_null("b")']).toEqual([
                    true,
                    false,
                    true,
                    false,
                ]);
                expect(result['if(is_null("a")) 100; else 0;']).toEqual([
                    0, 100, 100, 0,
                ]);
                expect(result['if(is_null("b")) 100; else 0;']).toEqual([
                    100, 0, 100, 0,
                ]);
                await view.delete();
                await table.delete();
            });

            test("is_not_null", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: [
                        'is_not_null("a")',
                        'is_not_null("b")',
                        'if(is_not_null("a")) 100; else 0;',
                        'if(is_not_null("b")) 100; else 0;',
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });

                table.update({
                    a: [1, null, null, 4],
                    b: [null, 2.5, null, 4.5],
                });

                const result = await view.to_columns();
                expect(result['is_not_null("a")']).toEqual([
                    true,
                    false,
                    false,
                    true,
                ]);
                expect(result['is_not_null("b")']).toEqual([
                    false,
                    true,
                    false,
                    true,
                ]);
                expect(result['if(is_not_null("a")) 100; else 0;']).toEqual([
                    100, 0, 0, 100,
                ]);
                expect(result['if(is_not_null("b")) 100; else 0;']).toEqual([
                    0, 100, 0, 100,
                ]);
                await view.delete();
                await table.delete();
            });

            test("percent_of", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: [
                        'percent_of("a", 500)',
                        'percent_of("a", "b")',
                        "percent_of(1, 3)",
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });

                table.update({
                    a: [100, 200, 300, 400],
                    b: [100.5, 200.5, 300.5, 400.5],
                });

                const result = await view.to_columns();
                expect(result['percent_of("a", 500)']).toEqual(
                    [100, 200, 300, 400].map((x) => (x / 500) * 100)
                );
                expect(result['percent_of("a", "b")']).toEqual(
                    [100, 200, 300, 400].map(
                        (x, idx) => (x / result["b"][idx]) * 100
                    )
                );
                expect(result["percent_of(1, 3)"]).toEqual([
                    33.33333333333333, 33.33333333333333, 33.33333333333333,
                    33.33333333333333,
                ]);

                await view.delete();
                await table.delete();
            });

            test("bucket", async function () {
                const table = await perspective.table({
                    a: "integer",
                    b: "float",
                });

                const view = await table.view({
                    expressions: [
                        'bucket("a", 5)',
                        'bucket("b", 2.5)',
                        `bucket("b", 10)`,
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });

                table.update({
                    a: [15, 15, 35, 40, 1250, 1255],
                    b: [2.25, 2, 3.5, 16.5, 28, 8],
                });

                const result = await view.to_columns();
                expect(result['bucket("a", 5)']).toEqual([
                    15, 15, 35, 40, 1250, 1255,
                ]);
                expect(result['bucket("b", 2.5)']).toEqual([
                    0, 0, 2.5, 15, 27.5, 7.5,
                ]);
                expect(result['bucket("b", 10)']).toEqual([0, 0, 0, 10, 20, 0]);
                await view.delete();
                await table.delete();
            });

            test("random", async function () {
                const table = await perspective.table({
                    x: "float",
                });

                const data = [];
                for (let i = 0; i < 1000; i++) {
                    data.push(i);
                }
                table.update({ x: data });
                const view = await table.view({
                    expressions: { "random()": "random()" },
                });
                const schema = await view.expression_schema();
                expect(schema).toEqual({ "random()": "float" });
                const result = await view.to_columns();

                for (let i = 0; i < 1000; i++) {
                    const res = result["random()"][i];
                    expect(res >= 0 && res <= 1).toBe(true);
                }

                await view.delete();
                await table.delete();
            });
        });

        test.describe("Booleans", function () {
            test("AND", async function () {
                const table = await perspective.table(common.comparison_data);
                const view = await table.view({
                    expressions: [
                        '"u" and "u"',
                        '"u" and "z"',
                        '"z" and "z"',
                        "0 and 0",
                        "1 and 1",
                        "1 and 100",
                        "true and false",
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });
                const result = await view.to_columns();
                expect(result['"u" and "u"']).toEqual([
                    false,
                    true,
                    false,
                    true,
                ]);
                expect(result['"u" and "z"']).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result['"u" and "z"']).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result["0 and 0"]).toEqual([false, false, false, false]);
                expect(result["1 and 1"]).toEqual([true, true, true, true]);
                expect(result["1 and 100"]).toEqual([true, true, true, true]);
                expect(result["true and false"]).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                await view.delete();
                await table.delete();
            });

            test("mand", async function () {
                const table = await perspective.table(common.comparison_data);
                const view = await table.view({
                    expressions: [
                        'mand("u" and "u", "u" and "z", "z" and "z")',
                        "mand(true, true, true, true)",
                        "mand(is_null(null), is_not_null(null))",
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });
                const result = await view.to_columns();

                expect(
                    result['mand("u" and "u", "u" and "z", "z" and "z")']
                ).toEqual(Array(4).fill(false));

                expect(
                    result["mand(is_null(null), is_not_null(null))"]
                ).toEqual(Array(4).fill(false));

                expect(result["mand(true, true, true, true)"]).toEqual(
                    Array(4).fill(true)
                );

                await view.delete();
                await table.delete();
            });

            test("mand should fail validation for non boolean inputs", async function () {
                const table = await perspective.table(common.comparison_data);
                const validated = await table.validate_expressions([
                    'mand("w", "x", "y")',
                    "mand(100, 200, 300)",
                    "mand('a', 'b', 'cdef')",
                ]);

                expect(validated.expression_schema).toEqual({});
                expect(validated.errors['mand("w", "x", "y")']).toEqual({
                    column: 0,
                    line: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });
                expect(validated.errors["mand(100, 200, 300)"]).toEqual({
                    column: 0,
                    line: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });
                expect(validated.errors["mand('a', 'b', 'cdef')"]).toEqual({
                    column: 0,
                    line: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });

                await table.delete();
            });

            test("OR", async function () {
                const table = await perspective.table({
                    a: [0, 1, 0, 1],
                    b: [0, 1, 0, 1],
                    c: [0, 0, 0, 0],
                    d: [1, 1, 1, 1],
                    e: [false, false, false, false],
                    f: [true, true, true, true],
                });
                const view = await table.view({
                    expressions: {
                        '"a" or "b"': '"a" or "b"',
                        '"c" or "d"': '"c" or "d"',
                        '"e" or "f"': '"e" or "f"',
                        "0 or 1": "0 or 1",
                        "true or false": "true or false",
                        "false or false": "false or false",
                        filtered: '"a" > 0.5 or "d" < 0.5',
                    },
                });
                const result = await view.to_columns();
                expect(result['"a" or "b"']).toEqual([
                    false,
                    true,
                    false,
                    true,
                ]);
                expect(result['"c" or "d"']).toEqual([true, true, true, true]);
                expect(result['"e" or "f"']).toEqual([true, true, true, true]);
                expect(result["0 or 1"]).toEqual([true, true, true, true]);
                expect(result["true or false"]).toEqual([
                    true,
                    true,
                    true,
                    true,
                ]);
                expect(result["false or false"]).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result["filtered"]).toEqual([true, true, true, true]);
                await view.delete();
                await table.delete();
            });

            test("mor", async function () {
                const table = await perspective.table(common.comparison_data);
                const view = await table.view({
                    expressions: [
                        'mor("u" and "u", "u" and "z", "z" and "z")',
                        "mor(false, false, false)",
                        "mor(false, true, false)",
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });
                const result = await view.to_columns();
                expect(
                    result['mor("u" and "u", "u" and "z", "z" and "z")']
                ).toEqual([true, true, true, true]);

                // The boolean false is a false
                expect(result["mor(false, false, false)"]).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);

                expect(result["mor(false, true, false)"]).toEqual([
                    true,
                    true,
                    true,
                    true,
                ]);

                await view.delete();
                await table.delete();
            });

            test("mor should fail validation for non boolean inputs", async function () {
                const table = await perspective.table(common.comparison_data);
                const validated = await table.validate_expressions([
                    'mor("w", "x", "y")',
                    "mor(100, 200, 300)",
                    "mor('a', 'b', 'cdef')",
                ]);

                expect(validated.expression_schema).toEqual({});
                expect(validated.errors['mor("w", "x", "y")']).toEqual({
                    column: 0,
                    line: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });
                expect(validated.errors["mor(100, 200, 300)"]).toEqual({
                    column: 0,
                    line: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });
                expect(validated.errors["mor('a', 'b', 'cdef')"]).toEqual({
                    column: 0,
                    line: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });

                await table.delete();
            });

            test("NAND", async function () {
                const table = await perspective.table(common.comparison_data);
                const view = await table.view({
                    expressions: [
                        '"u" nand "u"',
                        '"u" nand "z"',
                        '"z" nand "z"',
                        "0 nand 0",
                        "1 nand 1",
                        "1 nand 100",
                        "true nand true",
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });
                const result = await view.to_columns();
                expect(result['"u" nand "u"']).toEqual([
                    true,
                    false,
                    true,
                    false,
                ]);
                expect(result['"u" nand "z"']).toEqual([
                    true,
                    true,
                    true,
                    true,
                ]);
                expect(result['"u" nand "z"']).toEqual([
                    true,
                    true,
                    true,
                    true,
                ]);
                expect(result["0 nand 0"]).toEqual([true, true, true, true]);
                expect(result["1 nand 1"]).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result["1 nand 100"]).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result["true nand true"]).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                await view.delete();
                await table.delete();
            });

            test("NOR", async function () {
                const table = await perspective.table({
                    a: [0, 1, 0, 1],
                    b: [0, 1, 0, 1],
                    c: [0, 0, 0, 0],
                    d: [1, 1, 1, 1],
                    e: [false, false, false, false],
                    f: [true, true, true, true],
                });
                const view = await table.view({
                    expressions: [
                        '"a" nor "b"',
                        '"c" nor "d"',
                        '"e" nor "f"',
                        "0 nor 1",
                        "false nor false",
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });
                const result = await view.to_columns();
                expect(result['"a" nor "b"']).toEqual([
                    true,
                    false,
                    true,
                    false,
                ]);
                expect(result['"c" nor "d"']).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result['"e" nor "f"']).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result["0 nor 1"]).toEqual([false, false, false, false]);
                expect(result["false nor false"]).toEqual([
                    true,
                    true,
                    true,
                    true,
                ]);
                await view.delete();
                await table.delete();
            });

            test("XOR", async function () {
                const table = await perspective.table({
                    a: [0, 1, 0, 1],
                    b: [0, 1, 0, 1],
                    c: [0, 0, 0, 0],
                    d: [1, 1, 1, 1],
                    e: [false, false, false, false],
                    f: [true, true, true, true],
                });
                const view = await table.view({
                    expressions: [
                        '"a" xor "b"',
                        '"c" xor "d"',
                        '"e" xor "f"',
                        "0 xor 1",
                        "false xor false",
                    ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
                });
                const result = await view.to_columns();
                expect(result['"a" xor "b"']).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                expect(result['"c" xor "d"']).toEqual([true, true, true, true]);
                expect(result['"e" xor "f"']).toEqual([true, true, true, true]);
                expect(result["0 xor 1"]).toEqual([true, true, true, true]);
                expect(result["false xor false"]).toEqual([
                    false,
                    false,
                    false,
                    false,
                ]);
                await view.delete();
                await table.delete();
            });
        });
    });
})(perspective);
