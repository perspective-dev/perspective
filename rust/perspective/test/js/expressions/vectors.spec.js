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

/**
 * Tests the correctness of user-defined vectors inside expressions.
 *
 * @param {*} perspective
 */
((perspective) => {
    test.describe("Vectors", () => {
        test("Create vector and return value", async () => {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: { a: `var vec[3] := {1, "w", 2}; vec[1]` },
            });
            expect(await view.expression_schema()).toEqual({
                a: "float",
            });
            const result = await view.to_columns();
            expect(result["a"]).toEqual(result["w"]);
            await view.delete();
            await table.delete();
        });

        test("Return from empty vector should be 0", async () => {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: { a: `var vec[3]; vec[1]` },
            });
            expect(await view.expression_schema()).toEqual({
                a: "float",
            });
            const result = await view.to_columns();
            expect(result["a"]).toEqual(Array(4).fill(0));
            await view.delete();
            await table.delete();
        });

        test("Dynamic return types from vector", async () => {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: {
                    [`a`]: `var vec[3] := {'abc', 123, today()}; vec[0]`,
                    [`b`]: `var vec[3] := {'abc', 123, today()}; vec[1]`,
                    [`c`]: `var vec[3] := {'abc', 123, date(2020, 5, 23)}; vec[2]`,
                    [`d`]: `var vec[3] := {'abc', 123, is_null(null)}; vec[2]`,
                },
            });

            expect(await view.expression_schema()).toEqual({
                a: "string",
                b: "float",
                c: "date",
                d: "boolean",
            });

            const result = await view.to_columns();

            expect(result["a"]).toEqual(Array(4).fill("abc"));
            expect(result["b"]).toEqual(Array(4).fill(123));
            expect(result["c"]).toEqual(
                Array(4).fill(new Date(2020, 4, 23).getTime())
            );
            expect(result["d"]).toEqual(Array(4).fill(true));
            await view.delete();
            await table.delete();
        });

        test("Use vector items as inputs", async () => {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: {
                    [`a`]: `var vec[2] := {"w", "x"}; vec[0] * vec[1]`,
                },
            });
            expect(await view.expression_schema()).toEqual({
                a: "float",
            });
            const result = await view.to_columns();
            expect(result["a"]).toEqual(
                result["w"].map((item, idx) => item * result["x"][idx])
            );
            await view.delete();
            await table.delete();
        });

        test("Custom function takes vector item input", async () => {
            const table = await perspective.table(common.int_float_data);
            const view = await table.view({
                expressions: {
                    [`a`]: `var vec[2] := {"w", "x"}; max(vec[0], vec[1])`,
                },
            });
            expect(await view.expression_schema()).toEqual({
                a: "float",
            });
            const result = await view.to_columns();
            expect(result["a"]).toEqual(
                result["w"].map((item, idx) => Math.max(item, result["x"][idx]))
            );
            await view.delete();
            await table.delete();
        });
    });
})(perspective);
