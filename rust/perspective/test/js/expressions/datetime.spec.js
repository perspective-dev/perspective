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

import * as common from "./common.js";

import { test, expect } from "@finos/perspective-test";
import perspective from "@finos/perspective";

/**
 * Tests the correctness of each datetime computation function in various
 * environments and parameters - different types, nulls, undefined, etc.
 */
((perspective) => {
    test.describe("Date comparisons", function () {
        test("equality", async function () {
            const table = await perspective.table({
                a: "date",
                b: "date",
            });

            const view = await table.view({
                expressions: {
                    '"a" == "b"': '"a" == "b"',
                    '"a" != "b"': '"a" != "b"',
                    '"a" == "b" ? 100 : 0': '"a" == "b" ? 100 : 0',
                },
            });

            table.update({
                a: [
                    new Date(2020, 0, 26),
                    new Date(2020, 0, 27),
                    new Date(2020, 0, 28),
                    new Date(2020, 0, 29),
                    new Date(2020, 0, 30),
                ],
                b: [
                    new Date(2020, 0, 26),
                    new Date(2020, 0, 27),
                    new Date(2020, 0, 28),
                    new Date(2020, 0, 29),
                    new Date(2020, 1, 30),
                ],
            });

            let result = await view.to_columns();
            expect(result['"a" == "b"']).toEqual([
                true,
                true,
                true,
                true,
                false,
            ]);
            expect(result['"a" != "b"']).toEqual([
                false,
                false,
                false,
                false,
                true,
            ]);
            expect(result['"a" == "b" ? 100 : 0']).toEqual([
                100, 100, 100, 100, 0,
            ]);
            view.delete();
            table.delete();
        });

        test("greater", async function () {
            const table = await perspective.table({
                a: "date",
                b: "date",
            });

            const view = await table.view({
                expressions: {
                    '"a" > "b"': '"a" > "b"',
                    '"a" >= "b"': '"a" >= "b"',
                    '"a" >= "b" ? 100 : 0': '"a" >= "b" ? 100 : 0',
                },
            });

            table.update({
                a: [
                    new Date(2020, 0, 26),
                    new Date(2020, 0, 27),
                    new Date(2020, 0, 29),
                    new Date(2020, 0, 30),
                    new Date(2020, 1, 30),
                ],
                b: [
                    new Date(2020, 1, 26),
                    new Date(2020, 0, 28),
                    new Date(2020, 0, 28),
                    new Date(2020, 0, 29),
                    new Date(2020, 1, 30),
                ],
            });

            let result = await view.to_columns();
            expect(result['"a" > "b"']).toEqual([
                false,
                false,
                true,
                true,
                false,
            ]);
            expect(result['"a" >= "b"']).toEqual([
                false,
                false,
                true,
                true,
                true,
            ]);
            expect(result['"a" >= "b" ? 100 : 0']).toEqual([
                0, 0, 100, 100, 100,
            ]);
            view.delete();
            table.delete();
        });

        test("less than", async function () {
            const table = await perspective.table({
                a: "date",
                b: "date",
            });

            const view = await table.view({
                expressions: {
                    '"a" < "b"': '"a" < "b"',
                    '"a" <= "b"': '"a" <= "b"',
                    '"a" <= "b" ? 100 : 0': '"a" <= "b" ? 100 : 0',
                },
            });

            table.update({
                a: [
                    new Date(2020, 0, 26),
                    new Date(2020, 0, 27),
                    new Date(2020, 0, 29),
                    new Date(2020, 0, 30),
                    new Date(2020, 1, 30),
                ],
                b: [
                    new Date(2020, 1, 26),
                    new Date(2020, 0, 28),
                    new Date(2020, 0, 28),
                    new Date(2020, 0, 29),
                    new Date(2020, 1, 30),
                ],
            });

            let result = await view.to_columns();
            expect(result['"a" < "b"']).toEqual([
                true,
                true,
                false,
                false,
                false,
            ]);
            expect(result['"a" <= "b"']).toEqual([
                true,
                true,
                false,
                false,
                true,
            ]);
            expect(result['"a" <= "b" ? 100 : 0']).toEqual([
                100, 100, 0, 0, 100,
            ]);
            view.delete();
            table.delete();
        });
    });

    test.describe("Date functions", function () {
        test("today()", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { 'today() == "a"': 'today() == "a"' },
            });

            table.update({
                a: [new Date(), new Date(), new Date()],
            });

            let result = await view.to_columns();
            expect(result['today() == "a"']).toEqual([true, true, true]);
            view.delete();
            table.delete();
        });

        test("Hour of day, date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { 'hour_of_day("a")': 'hour_of_day("a")' },
            });

            table.update({
                a: [new Date(), new Date(), new Date()],
            });

            let result = await view.to_columns();
            expect(result['hour_of_day("a")']).toEqual([0, 0, 0]);
            view.delete();
            table.delete();
        });

        test("Hour of day, date with null", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { 'hour_of_day("a")': 'hour_of_day("a")' },
            });

            table.update({
                a: [new Date(), null, undefined, new Date()],
            });

            let result = await view.to_columns();
            expect(result['hour_of_day("a")']).toEqual([0, null, null, 0]);
            view.delete();
            table.delete();
        });

        test("Day of week, date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { 'day_of_week("a")': 'day_of_week("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 26),
                    new Date(2020, 0, 27),
                    new Date(2020, 0, 28),
                    new Date(2020, 0, 29),
                    new Date(2020, 0, 30),
                ],
            });

            let result = await view.to_columns();
            expect(result['day_of_week("a")']).toEqual(
                result.a.map((x) => common.days_of_week[new Date(x).getDay()])
            );
            view.delete();
            table.delete();
        });

        test("Day of week, date with null", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { 'day_of_week("a")': 'day_of_week("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 26),
                    null,
                    undefined,
                    new Date(2020, 0, 29),
                    new Date(2020, 0, 30),
                ],
            });

            let result = await view.to_columns();
            expect(result['day_of_week("a")']).toEqual(
                result.a.map((x) =>
                    x ? common.days_of_week[new Date(x).getDay()] : null
                )
            );
            view.delete();
            table.delete();
        });

        test("Month of year, date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { 'month_of_year("a")': 'month_of_year("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 27),
                    new Date(2020, 2, 28),
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result['month_of_year("a")']).toEqual(
                result.a.map(
                    (x) => common.months_of_year[new Date(x).getMonth()]
                )
            );
            view.delete();
            table.delete();
        });

        test("Month of year, date with null", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { 'month_of_year("a")': 'month_of_year("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result['month_of_year("a")']).toEqual(
                result.a.map((x) =>
                    x ? common.months_of_year[new Date(x).getMonth()] : null
                )
            );
            view.delete();
            table.delete();
        });

        test("Bucket (s), date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 's')": "bucket(\"a\", 's')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 27),
                    new Date(2020, 2, 28),
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 's')"]).toEqual(result.a);
            view.delete();
            table.delete();
        });

        test("Certain bucket multiplicities do not validate.", async function () {
            const table = await perspective.table({
                x: [1],
            });

            const validated = await table.validate_expressions({
                [`bucket0`]: `bucket("x", '2W')`,
                [`bucket1`]: `bucket("x", '3W')`,
                [`bucket2`]: `bucket("x", '4W')`,
                [`bucket3`]: `bucket("x", '5W')`,
                [`bucket4`]: `bucket("x", '2D')`,
                [`bucket5`]: `bucket("x", '3D')`,
                [`bucket6`]: `bucket("x", '7D')`,
                [`bucket7`]: `bucket("x", '10D')`,
                [`bucket8`]: `bucket("x", '15D')`,
                [`bucket9`]: `bucket("x", '30D')`,
            });

            expect(validated.expression_schema).toEqual({});

            expect(validated.errors).toEqual({
                bucket0: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket1: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket2: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket3: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket4: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket5: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket6: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket7: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket8: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                bucket9: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
            });

            await table.delete();
        });

        test("Bucket (s), date with nulls", async function () {
            const table = await perspective.table({
                a: "date",
            });
            const view = await table.view({
                expressions: { "bucket(\"a\", 's')": "bucket(\"a\", 's')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 's')"]).toEqual(
                result.a.map((x) => (x ? x : null))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (m), date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'm')": "bucket(\"a\", 'm')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 27),
                    new Date(2020, 2, 28),
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 'm')"]).toEqual(result.a);
            view.delete();
            table.delete();
        });

        test("Bucket (m), date with nulls", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'm')": "bucket(\"a\", 'm')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 'm')"]).toEqual(
                result.a.map((x) => (x ? x : null))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (h), date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'h')": "bucket(\"a\", 'h')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 27),
                    new Date(2020, 2, 28),
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 'h')"]).toEqual(result.a);
            view.delete();
            table.delete();
        });

        test("Bucket (h), date with nulls", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'h')": "bucket(\"a\", 'h')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 'h')"]).toEqual(
                result.a.map((x) => (x ? x : null))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (D), date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'D')": "bucket(\"a\", 'D')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 27),
                    new Date(2020, 2, 28),
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 'D')"]).toEqual(result.a);
            view.delete();
            table.delete();
        });

        test("Bucket (D), date with null", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'D')": "bucket(\"a\", 'D')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result["bucket(\"a\", 'D')"]).toEqual(
                result.a.map((x) => (x ? x : null))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (W), date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'W')": "bucket(\"a\", 'W')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 0, 15),
                    new Date(2020, 0, 17),
                    new Date(2020, 0, 18),
                    new Date(2020, 0, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result["bucket(\"a\", 'W')"].map((x) =>
                    x ? new Date(x) : null
                )
            ).toEqual(result.a.map((x) => common.week_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (W), date with null", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'W')": "bucket(\"a\", 'W')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 0, 15),
                    new Date(2020, 0, 17),
                    new Date(2020, 0, 18),
                    new Date(2020, 0, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result["bucket(\"a\", 'W')"].map((x) =>
                    x ? new Date(x) : null
                )
            ).toEqual(result.a.map((x) => (x ? common.week_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (W), date shouldn't ever overflow at beginning of year", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'W')": "bucket(\"a\", 'W')" },
            });

            table.update({
                a: [new Date(2015, 0, 3, 15), new Date(2015, 0, 4)],
            });

            let result = await view.to_columns();

            expect(
                result["bucket(\"a\", 'W')"].map((x) => new Date(x))
            ).toEqual(result.a.map((x) => common.week_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (M), date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'M')": "bucket(\"a\", 'M')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 17),
                    new Date(2020, 2, 18),
                    new Date(2020, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result["bucket(\"a\", 'M')"].map((x) =>
                    x ? new Date(x) : null
                )
            ).toEqual(result.a.map((x) => common.month_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (M), date with null", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'M')": "bucket(\"a\", 'M')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    null,
                    undefined,
                    new Date(2020, 2, 18),
                    new Date(2020, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result["bucket(\"a\", 'M')"].map((x) =>
                    x ? new Date(x) : null
                )
            ).toEqual(result.a.map((x) => (x ? common.month_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (M), date with multiplicity", async () => {
            const table = await perspective.table({
                a: "date",
            });

            const col_name = "bucket(\"a\", '3M')";

            const view = await table.view({
                expressions: { [col_name]: col_name },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 1, 15),
                    new Date(2020, 2, 17),
                    new Date(2020, 3, 18),
                    new Date(2020, 4, 29),
                    new Date(2020, 5, 6),
                    new Date(2020, 6, 10),
                    new Date(2020, 7, 30),
                    new Date(2020, 8, 22),
                    new Date(2020, 9, 7),
                    new Date(2020, 10, 1),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[col_name].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.month_bucket(x, 3)));
            view.delete();
            table.delete();
        });

        test("Bucket (Y), date", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'Y')": "bucket(\"a\", 'Y')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 0, 15),
                    new Date(2021, 1, 17),
                    new Date(2019, 2, 18),
                    new Date(2019, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result["bucket(\"a\", 'Y')"].map((x) =>
                    x ? new Date(x) : null
                )
            ).toEqual(result.a.map((x) => common.year_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (Y), date with null", async function () {
            const table = await perspective.table({
                a: "date",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'Y')": "bucket(\"a\", 'Y')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    null,
                    undefined,
                    new Date(2019, 2, 18),
                    new Date(2019, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result["bucket(\"a\", 'Y')"].map((x) =>
                    x ? new Date(x) : null
                )
            ).toEqual(result.a.map((x) => (x ? common.year_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (Y), date with multiplicity", async () => {
            const table = await perspective.table({
                a: "date",
            });

            const col_name = "bucket(\"a\", '7Y')";

            const view = await table.view({
                expressions: { [col_name]: col_name },
            });

            table.update({
                a: [
                    new Date(2010, 0, 12),
                    new Date(2011, 1, 15),
                    new Date(2012, 2, 17),
                    new Date(2013, 3, 18),
                    new Date(2014, 4, 29),
                    new Date(2015, 5, 6),
                    new Date(2016, 6, 10),
                    new Date(2017, 7, 30),
                    new Date(2018, 8, 22),
                    new Date(2019, 9, 7),
                    new Date(2020, 10, 1),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[col_name].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.year_bucket(x, 7)));
            view.delete();
            table.delete();
        });
    });

    test.describe("Datetime, Arity 1 computed", function () {
        test("Hour of day, datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { 'hour_of_day("a")': 'hour_of_day("a")' },
            });

            table.update({
                a: [new Date(), new Date(), new Date()],
            });

            let result = await view.to_columns();
            expect(result[`hour_of_day("a")`]).toEqual(
                result.a.map((x) => new Date(x).getUTCHours())
            );
            view.delete();
            table.delete();
        });

        test("Hour of day, datetime with null", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { 'hour_of_day("a")': 'hour_of_day("a")' },
            });

            table.update({
                a: [new Date(), null, undefined, new Date()],
            });

            let result = await view.to_columns();
            expect(result[`hour_of_day("a")`]).toEqual(
                result.a.map((x) => (x ? new Date(x).getUTCHours() : null))
            );
            view.delete();
            table.delete();
        });

        test("Day of week, datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { 'day_of_week("a")': 'day_of_week("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 26, 1),
                    new Date(2020, 0, 27, 2),
                    new Date(2020, 0, 28, 3),
                    new Date(2020, 0, 29, 4),
                    new Date(2020, 0, 30, 5),
                ],
            });

            let result = await view.to_columns();
            expect(result[`day_of_week("a")`]).toEqual(
                result.a.map(
                    (x) => common.days_of_week[new Date(x).getUTCDay()]
                )
            );
            view.delete();
            table.delete();
        });

        test("Day of week, datetime with null", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { 'day_of_week("a")': 'day_of_week("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 26, 1),
                    null,
                    undefined,
                    new Date(2020, 0, 29, 4),
                    new Date(2020, 0, 30, 5),
                ],
            });

            let result = await view.to_columns();
            expect(result[`day_of_week("a")`]).toEqual(
                result.a.map((x) =>
                    x ? common.days_of_week[new Date(x).getUTCDay()] : null
                )
            );
            view.delete();
            table.delete();
        });

        test("Month of year, datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { 'month_of_year("a")': 'month_of_year("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 27),
                    new Date(2020, 2, 28),
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result[`month_of_year("a")`]).toEqual(
                result.a.map(
                    (x) => common.months_of_year[new Date(x).getUTCMonth()]
                )
            );
            view.delete();
            table.delete();
        });

        test("Month of year, datetime with missing values", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { 'month_of_year("a")': 'month_of_year("a")' },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29),
                    new Date(2020, 4, 30),
                    new Date(2020, 5, 31),
                    new Date(2020, 6, 1),
                ],
            });

            let result = await view.to_columns();
            expect(result[`month_of_year("a")`]).toEqual(
                result.a.map((x) =>
                    x ? common.months_of_year[new Date(x).getUTCMonth()] : null
                )
            );
            view.delete();
            table.delete();
        });

        test("Bucket (s), datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 's')": "bucket(\"a\", 's')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    new Date(2020, 1, 27, 1, 30, 30),
                    new Date(2020, 2, 28, 1, 30, 45),
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 's')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.second_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (s), datetime with null", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 's')": "bucket(\"a\", 's')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 's')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(
                result.a.map((x) => (x ? common.second_bucket(x) : null))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (s), datetime with multiplicity", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const col_name = `bucket("a", '20s')`;

            const view = await table.view({
                expressions: { [col_name]: col_name },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 5),
                    new Date(2020, 3, 29, 1, 30, 10),
                    new Date(2020, 4, 30, 1, 30, 19),
                    new Date(2020, 4, 30, 1, 30, 30),
                    new Date(2020, 4, 30, 1, 30, 50),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[col_name].map((x) => (x ? new Date(x) : null))
            ).toEqual(
                result.a.map((x) => (x ? common.second_bucket(x, 20) : null))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (m), datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'm')": "bucket(\"a\", 'm')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    new Date(2020, 1, 27, 1, 30, 30),
                    new Date(2020, 2, 28, 1, 30, 45),
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 'm')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.minute_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (m), datetime with null", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'm')": "bucket(\"a\", 'm')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 'm')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(
                result.a.map((x) => (x ? common.minute_bucket(x) : null))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (m), datetime with multiplicity", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const col_name = `bucket("a", '15m')`;

            const view = await table.view({
                expressions: { [col_name]: col_name },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 0, 0),
                    new Date(2020, 0, 15, 1, 6, 0),
                    new Date(2020, 0, 15, 1, 15, 0),
                    new Date(2020, 0, 15, 1, 29, 0),
                    new Date(2020, 0, 15, 1, 30, 0),
                    new Date(2020, 0, 15, 1, 59, 0),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[col_name].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.minute_bucket(x, 15)));
            view.delete();
            table.delete();
        });

        test("Bucket (h), datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'h')": "bucket(\"a\", 'h')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    new Date(2020, 1, 27, 1, 30, 30),
                    new Date(2020, 2, 28, 1, 30, 45),
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 'h')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.hour_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (h), datetime with null", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'h')": "bucket(\"a\", 'h')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 'h')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => (x ? common.hour_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (h), datetime with multiplicity", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const col_name = `bucket("a", '6h')`;

            const view = await table.view({
                expressions: { [col_name]: col_name },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 0, 30, 15),
                    new Date(2020, 0, 15, 5, 30, 15),
                    new Date(2020, 0, 15, 6, 30, 15),
                    new Date(2020, 0, 15, 9, 30, 15),
                    new Date(2020, 0, 15, 15, 30, 15),
                    new Date(2020, 0, 15, 20, 30, 15),
                    new Date(2020, 0, 15, 23, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[col_name].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.hour_bucket(x, 6)));
            view.delete();
            table.delete();
        });

        test("Bucket (D), datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'D')": "bucket(\"a\", 'D')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    new Date(2020, 1, 27, 1, 30, 30),
                    new Date(2020, 2, 28, 1, 30, 45),
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 'D')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.day_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (D), datetime with null", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'D')": "bucket(\"a\", 'D')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 1, 30, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29, 1, 30, 0),
                    new Date(2020, 4, 30, 1, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 'D')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => (x ? common.day_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (D), datetime at UTC edge", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'D')": "bucket(\"a\", 'D')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 15, 23, 30, 15),
                    null,
                    undefined,
                    new Date(2020, 3, 29, 23, 30, 0),
                    new Date(2020, 4, 30, 23, 30, 15),
                ],
            });

            let result = await view.to_columns();
            expect(
                result[`bucket("a", 'D')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => (x ? common.day_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (W), datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'W')": "bucket(\"a\", 'W')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 0, 15),
                    new Date(2020, 0, 17),
                    new Date(2020, 0, 18),
                    new Date(2020, 0, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[`bucket("a", 'W')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.week_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (W), datetime with null", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'W')": "bucket(\"a\", 'W')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    null,
                    undefined,
                    new Date(2020, 0, 18),
                    new Date(2020, 0, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[`bucket("a", 'W')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => (x ? common.week_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (W), datetime shouldn't ever overflow at beginning of year", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'W')": "bucket(\"a\", 'W')" },
            });

            table.update({
                a: [new Date(2015, 0, 3, 15), new Date(2015, 0, 4)],
            });

            let result = await view.to_columns();

            expect(result[`bucket("a", 'W')`].map((x) => new Date(x))).toEqual(
                result.a.map((x) => common.week_bucket(x))
            );
            view.delete();
            table.delete();
        });

        test("Bucket (M), datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'M')": "bucket(\"a\", 'M')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 0, 15),
                    new Date(2020, 1, 17),
                    new Date(2020, 2, 18),
                    new Date(2020, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[`bucket("a", 'M')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.month_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (M), datetime with nulls", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'M')": "bucket(\"a\", 'M')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    null,
                    undefined,
                    new Date(2020, 2, 18),
                    new Date(2020, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[`bucket("a", 'M')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => (x ? common.month_bucket(x) : null)));
            view.delete();
            table.delete();
        });

        test("Bucket (Y), datetime", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'Y')": "bucket(\"a\", 'Y')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    new Date(2020, 0, 15),
                    new Date(2021, 11, 17),
                    new Date(2019, 2, 18),
                    new Date(2019, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[`bucket("a", 'Y')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => common.year_bucket(x)));
            view.delete();
            table.delete();
        });

        test("Bucket (Y), datetime with nulls", async function () {
            const table = await perspective.table({
                a: "datetime",
            });

            const view = await table.view({
                expressions: { "bucket(\"a\", 'Y')": "bucket(\"a\", 'Y')" },
            });

            table.update({
                a: [
                    new Date(2020, 0, 12),
                    null,
                    undefined,
                    new Date(2019, 2, 18),
                    new Date(2019, 2, 29),
                ],
            });

            let result = await view.to_columns();

            expect(
                result[`bucket("a", 'Y')`].map((x) => (x ? new Date(x) : null))
            ).toEqual(result.a.map((x) => (x ? common.year_bucket(x) : null)));
            view.delete();
            table.delete();
        });
    });
})(perspective);
