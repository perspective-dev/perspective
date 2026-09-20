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

const VALID_CONFIGS = {
    flat: { columns: ["a", "b", "c", "d", "e", "f"] },
    group_by: { columns: ["a", "b", "c"], group_by: ["c"] },
    "group_by with typed aggregates": {
        columns: ["a", "b", "c", "e"],
        group_by: ["c"],
        aggregates: { a: "count", b: "avg", c: "distinct count", e: "last" },
    },
    "group_by with hidden sort": {
        columns: ["a"],
        group_by: ["c"],
        sort: [["b", "desc"]],
    },
    split_by: { columns: ["a", "b", "c"], split_by: ["d"] },
    "split_by keeps source types": {
        columns: ["a", "b"],
        split_by: ["d"],
        aggregates: { a: "avg", b: "count" },
    },
    "group_by and split_by": {
        columns: ["a", "b"],
        group_by: ["c"],
        split_by: ["d"],
        aggregates: { a: "avg" },
    },
    "split_rollup_mode rollup": {
        columns: ["a"],
        group_by: ["c"],
        split_by: ["d"],
        split_rollup_mode: "rollup",
    },
    "group_rollup_mode total": {
        columns: ["a", "b", "c"],
        group_rollup_mode: "total",
    },
    "group_rollup_mode total with split_by": {
        columns: ["a", "c"],
        split_by: ["d"],
        group_rollup_mode: "total",
        aggregates: { a: "avg" },
    },
    "group_rollup_mode flat": {
        columns: ["a", "b"],
        group_by: ["c"],
        group_rollup_mode: "flat",
    },
    expressions: {
        columns: ["a", "x", "y"],
        expressions: { x: '"a" * 2', y: "'abc'" },
    },
    "expressions aggregated": {
        columns: ["x", "y"],
        group_by: ["c"],
        expressions: { x: '"a" * 2', y: "'abc'" },
        aggregates: { x: "count" },
    },
    windows: {
        columns: ["a", "w"],
        windows: {
            w: { column: "a", aggregate: "sum", order_by: ["e", "asc"] },
        },
    },
    "windows aggregated": {
        columns: ["w"],
        group_by: ["c"],
        windows: {
            w: { column: "a", aggregate: "avg", order_by: ["e", "asc"] },
        },
    },
    "no columns": { columns: [], expressions: { x: '"a" + 1' } },
};

((perspective) => {
    test.describe("Table.describe()", function () {
        test.describe("parity with Table.view()", function () {
            for (const [name, config] of Object.entries(VALID_CONFIGS)) {
                test(name, async function () {
                    const table = await mixed_table(perspective);
                    const verdict = await table.describe(config);
                    const view = await table.view(config);
                    const validated = await table.validate_expressions(
                        config.expressions ?? {},
                    );

                    expect(verdict).toEqual({
                        expression_schema: validated.expression_schema,
                        view_schema: await view.schema(),
                    });

                    await view.delete();
                    await table.delete();
                });
            }
        });

        test("reports every invalid expression and the types of the valid ones", async function () {
            const table = await mixed_table(perspective);
            const config = {
                columns: ["a", "good"],
                expressions: {
                    good: '"a" + 1',
                    bad_column: '"nope" + 1',
                    bad_syntax: "for () {}",
                },
            };

            const verdict = await table.describe(config);
            expect(Object.keys(verdict).sort()).toEqual([
                "expression_errors",
                "expression_schema",
            ]);

            expect(verdict.expression_schema).toEqual({ good: "float" });
            expect(Object.keys(verdict.expression_errors).sort()).toEqual([
                "bad_column",
                "bad_syntax",
            ]);

            for (const err of Object.values(verdict.expression_errors)) {
                expect(typeof err.error_message).toBe("string");
                expect(err.error_message.length).toBeGreaterThan(0);
                expect(typeof err.line).toBe("number");
                expect(typeof err.column).toBe("number");
            }

            await expect(table.view(config)).rejects.toThrow();
            await table.delete();
        });

        test("reports an invalid column as a config error", async function () {
            const table = await mixed_table(perspective);
            const config = { columns: ["a", "nope"] };
            const verdict = await table.describe(config);
            expect(Object.keys(verdict)).toEqual(["config_error"]);
            expect(verdict.config_error).toContain("nope");
            await expect(table.view(config)).rejects.toThrow();
            await table.delete();
        });

        test("reports an invalid window as a config error", async function () {
            const table = await mixed_table(perspective);
            const config = {
                columns: ["a", "w"],
                windows: {
                    w: {
                        column: "c",
                        aggregate: "sum",
                        order_by: ["e", "asc"],
                    },
                },
            };

            const verdict = await table.describe(config);
            expect(Object.keys(verdict)).toEqual(["config_error"]);
            await expect(table.view(config)).rejects.toThrow();
            await table.delete();
        });

        test("an expression error is reported before a config error", async function () {
            const table = await mixed_table(perspective);
            const verdict = await table.describe({
                columns: ["nope"],
                expressions: { bad: '"nope" + 1' },
            });

            expect(Object.keys(verdict).sort()).toEqual([
                "expression_errors",
                "expression_schema",
            ]);

            await table.delete();
        });

        test("creates no View", async function () {
            const table = await mixed_table(perspective);
            for (const config of Object.values(VALID_CONFIGS)) {
                await table.describe(config);
            }

            await table.delete();
        });

        test("validate_expressions is a specialization of describe", async function () {
            const table = await mixed_table(perspective);
            const expressions = {
                good: '"a" + 1',
                also_good: "'str'",
                bad: '"nope" + 1',
            };

            const validated = await table.validate_expressions(expressions);
            const verdict = await table.describe({ columns: [], expressions });
            expect(validated.expression_schema).toEqual(
                verdict.expression_schema,
            );
            expect(validated.errors).toEqual(verdict.expression_errors);
            expect(validated.expression_alias).toEqual(expressions);
            await table.delete();
        });
    });
})(perspective);
