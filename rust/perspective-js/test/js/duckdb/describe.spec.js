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
import { describeDuckDB } from "./setup.js";

const VALID_CONFIGS = {
    flat: { columns: ["Sales", "Quantity", "Region"] },
    group_by: {
        columns: ["Sales", "Quantity"],
        group_by: ["Region"],
        aggregates: { Sales: "sum", Quantity: "avg" },
    },
    "group_by flat": {
        columns: ["Sales", "Quantity"],
        group_by: ["Region"],
        group_rollup_mode: "flat",
    },
    "group_by with hidden sort": {
        columns: ["Sales"],
        group_by: ["Region"],
        sort: [["Quantity", "desc"]],
    },
    split_by: { columns: ["Sales", "Quantity"], split_by: ["Region"] },
    "split_by keeps source types": {
        columns: ["Sales", "Quantity"],
        split_by: ["Region"],
        aggregates: { Quantity: "avg" },
    },
    "group_by and split_by": {
        columns: ["Sales", "Quantity"],
        group_by: ["Category"],
        split_by: ["Region"],
        aggregates: { Sales: "sum", Quantity: "avg" },
    },
    "group_by and split_by flat": {
        columns: ["Sales"],
        group_by: ["Category"],
        split_by: ["Region"],
        group_rollup_mode: "flat",
    },
    "split_rollup_mode rollup": {
        columns: ["Sales"],
        group_by: ["Category"],
        split_by: ["Region"],
        split_rollup_mode: "rollup",
    },
    "group_rollup_mode total": {
        columns: ["Sales", "Quantity"],
        group_rollup_mode: "total",
        aggregates: { Quantity: "avg" },
    },
    "group_rollup_mode total with split_by": {
        columns: ["Sales", "Quantity"],
        split_by: ["Region"],
        group_rollup_mode: "total",
        aggregates: { Quantity: "avg" },
    },
    expressions: {
        columns: ["Sales", "double"],
        expressions: { double: '"Sales" * 2' },
    },
    "expressions aggregated": {
        columns: ["total"],
        group_by: ["Region"],
        expressions: { total: '"Sales" + "Profit"' },
        aggregates: { total: "sum" },
    },
};

describeDuckDB("describe", (getClient) => {
    for (const [name, config] of Object.entries(VALID_CONFIGS)) {
        test(`parity with view: ${name}`, async function () {
            const table = await getClient().open_table("memory.superstore");
            const verdict = await table.describe(config);
            const view = await table.view(config);
            expect(Object.keys(verdict).sort()).toEqual([
                "expression_schema",
                "view_schema",
            ]);

            expect(verdict.view_schema).toEqual(await view.schema());
            expect(Object.keys(verdict.expression_schema).sort()).toEqual(
                Object.keys(config.expressions ?? {}).sort(),
            );

            await view.delete();
        });
    }

    test("attributes a bad expression to its name", async function () {
        const table = await getClient().open_table("memory.superstore");
        const config = {
            columns: ["Sales", "good", "bad"],
            expressions: {
                good: '"Sales" * 2',
                bad: '"nope" * 2',
            },
        };

        const verdict = await table.describe(config);
        expect(Object.keys(verdict).sort()).toEqual([
            "expression_errors",
            "expression_schema",
        ]);

        expect(verdict.expression_schema).toEqual({ good: "float" });
        expect(Object.keys(verdict.expression_errors)).toEqual(["bad"]);
        expect(verdict.expression_errors.bad.error_message).toContain("nope");
        await expect(table.view(config)).rejects.toThrow();
    });

    test("reports a bad column as a config error", async function () {
        const table = await getClient().open_table("memory.superstore");
        const config = { columns: ["Sales", "nope"] };
        const verdict = await table.describe(config);
        expect(Object.keys(verdict)).toEqual(["config_error"]);
        await expect(table.view(config)).rejects.toThrow();
    });

    test("an unused invalid expression is still rejected", async function () {
        const table = await getClient().open_table("memory.superstore");
        const verdict = await table.describe({
            columns: ["Sales"],
            expressions: { bad: '"nope" * 2' },
        });

        expect(Object.keys(verdict.expression_errors)).toEqual(["bad"]);
    });

    test("validate_expressions reports the same verdict", async function () {
        const table = await getClient().open_table("memory.superstore");
        const expressions = { good: '"Sales" * 2', bad: '"nope" * 2' };
        const validated = await table.validate_expressions(expressions);
        expect(validated.expression_schema).toEqual({ good: "float" });
        expect(Object.keys(validated.errors)).toEqual(["bad"]);
        expect(validated.expression_alias).toEqual(expressions);
    });

    test("view.expression_schema() answers from describe", async function () {
        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["double"],
            expressions: { double: '"Sales" * 2' },
        });

        expect(await view.expression_schema()).toEqual({ double: "float" });
        await view.delete();
    });
});
