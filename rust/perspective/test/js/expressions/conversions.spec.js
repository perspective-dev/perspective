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

/**
 * Tests the correctness of each datetime computation function in various
 * environments and parameters - different types, nulls, undefined, etc.
 */
((perspective) => {
    test.describe("string()", () => {
        test("Should create string from all column types", async () => {
            const table = await perspective.table({
                a: "date",
                b: "datetime",
                c: "integer",
                d: "float",
                e: "string",
                f: "boolean",
            });

            const view = await table.view({
                expressions: {
                    computed: ' string("a")',
                    computed2: ' string("b")',
                    computed3: ' string("c")',
                    computed4: ' string("d")',
                    computed5: ' string("e")',
                    computed6: ' string("f")',
                    computed7: " string(1234.5678)",
                },
            });

            table.update({
                a: [new Date(2020, 4, 30), new Date(2021, 6, 13)],
                b: [
                    new Date(2015, 10, 29, 23, 59, 59),
                    new Date(2016, 10, 29, 23, 59, 59),
                ],
                c: [12345678, 1293879852],
                d: [1.2792013981, 19.218975981],
                e: ["abcdefghijklmnop", "def"],
                f: [false, true],
            });

            expect(await view.expression_schema()).toEqual({
                computed: "string",
                computed2: "string",
                computed3: "string",
                computed4: "string",
                computed5: "string",
                computed6: "string",
                computed7: "string",
            });

            const result = await view.to_columns();

            expect(result["computed"]).toEqual(["2020-05-30", "2021-07-13"]);
            expect(result["computed2"]).toEqual([
                "2015-11-29 23:59:59.000",
                "2016-11-29 23:59:59.000",
            ]);
            expect(result["computed3"]).toEqual(["12345678", "1293879852"]);
            expect(result["computed4"]).toEqual(["1.2792", "19.219"]);
            expect(result["computed5"]).toEqual(["abcdefghijklmnop", "def"]);
            expect(result["computed6"]).toEqual(["false", "true"]);
            expect(result["computed7"]).toEqual(["1234.57", "1234.57"]);

            await view.delete();
            await table.delete();
        });

        test("Should create string from scalars", async () => {
            const table = await perspective.table({
                x: [1],
            });

            const view = await table.view({
                group_by: ["computed"],
                aggregates: {
                    computed: "last",
                    computed2: "last",
                    computed3: "last",
                },
                expressions: {
                    computed: " string('abcdefg')",
                    computed2: " string(1234)",
                    computed3: " string(1234.5678)",
                },
            });

            expect(await view.expression_schema()).toEqual({
                computed: "string",
                computed2: "string",
                computed3: "string",
            });

            const result = await view.to_columns();

            expect(result["__ROW_PATH__"]).toEqual([[], ["abcdefg"]]);
            expect(result["computed2"]).toEqual(["1234", "1234"]);
            expect(result["computed3"]).toEqual(["1234.57", "1234.57"]);

            await view.delete();
            await table.delete();
        });
    });

    test.describe("integer()", () => {
        test("Should create integers from scalars", async () => {
            const table = await perspective.table({ x: [1] });
            const view = await table.view({
                expressions: {
                    [`computed`]: `integer(999999.999)`,
                    [`computed2`]: `integer(2147483648)`,
                    [`computed3`]: `integer(-2147483649)`,
                    [`computed4`]: `integer(123456789)`,
                    [`computed5`]: `integer(0.00001)`,
                    [`computed6`]: `integer(1.9999999999)`,
                    [`computed7`]: `integer(2147483647)`,
                    [`computed8`]: `integer(-2147483647)`,
                    [`computed9`]: `integer('957187281')`,
                    [`computed10`]: `integer('1928.2817')`,
                    [`computed11`]: `integer('1234abcd')`,
                    [`computed12`]: `integer('abcdefg1234')`,
                    [`computed13`]: `integer('2147483648')`,
                    [`computed14`]: `integer('-2147483649')`,
                },
            });

            const result = await view.to_columns();

            expect(result["computed"]).toEqual([999999]);
            expect(result["computed2"]).toEqual([null]);
            expect(result["computed3"]).toEqual([null]);
            expect(result["computed4"]).toEqual([123456789]);
            expect(result["computed5"]).toEqual([0]);
            expect(result["computed6"]).toEqual([1]);
            expect(result["computed7"]).toEqual([2147483647]);
            expect(result["computed8"]).toEqual([-2147483647]);
            expect(result["computed9"]).toEqual([957187281]);
            expect(result["computed10"]).toEqual([1928]);

            // unparsable strings
            expect(result["computed11"]).toEqual([null]);
            expect(result["computed12"]).toEqual([null]);
            // check for overflow
            expect(result["computed13"]).toEqual([null]);
            expect(result["computed14"]).toEqual([null]);

            await view.delete();
            await table.delete();
        });

        // TODO Is this behavior correct? The purpose of this test is to check
        // that integer->integer casting works, but it is also implicitly
        // testing that `float`s are coerced to `integer`s when the column
        // already has `integer` type. I think the new API is correct to reject
        // this behavior.
        test.skip("Should create integers from integer columns", async () => {
            const table = await perspective.table({ x: "integer" });
            const view = await table.view({
                expressions: { computed: `integer("x")` },
            });

            table.update({
                x: [100, -17238.8123, 0.890798, -1.1295, null, 12836215.128937],
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                100,
                -17238,
                0,
                -1,
                null,
                12836215,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Should create integers from float columns", async () => {
            const table = await perspective.table({ x: "float" });

            const view = await table.view({
                expressions: { computed: `integer("x")` },
            });

            table.update({
                x: [
                    100.9999999,
                    -17238.8123,
                    0.890798,
                    -1.1295,
                    null,
                    12836215.128937,
                ],
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                100,
                -17238,
                0,
                -1,
                null,
                12836215,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Should create integers from date columns", async () => {
            const table = await perspective.table({ x: "date" });

            const view = await table.view({
                expressions: { computed: `integer("x")` },
            });

            const value = new Date(2020, 5, 30);

            table.update({
                x: [value],
            });

            const result = await view.to_columns();

            // The custom format that Perspective uses to store dates - we
            // can validate correctness by applying bitmask/shifting.
            const expected = 132384030;

            expect(result["computed"]).toEqual([expected]);

            const year = (expected & 0xffff0000) >> 16;
            const month = (expected & 0x0000ff00) >> 8;
            const day = (expected & 0x000000ff) >> 0;

            expect(year).toEqual(2020);
            expect(month).toEqual(5);
            expect(day).toEqual(30);

            await view.delete();
            await table.delete();
        });

        test("Should create integers from datetime columns", async () => {
            const table = await perspective.table({ x: "datetime" });

            const view = await table.view({
                expressions: { computed: `integer("x")` },
            });

            // first will not overflow, second will
            table.update({
                x: [new Date(1970, 0, 1, 1), new Date(2020, 0, 1, 1)],
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                new Date(1970, 0, 1, 1).getTime(),
                null,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Should create integers from string columns", async () => {
            const table = await perspective.table({
                x: [
                    "1",
                    "2",
                    "3",
                    "abc",
                    "4.5",
                    "0.101928317581729083",
                    "-123456",
                ],
            });

            const view = await table.view({
                expressions: { computed: `integer("x")` },
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([1, 2, 3, null, 4, 0, -123456]);

            await view.delete();
            await table.delete();
        });
    });

    test.describe("float()", () => {
        test("Should create float from scalars", async () => {
            const table = await perspective.table({ x: [1] });
            const view = await table.view({
                expressions: {
                    [`computed`]: `float(999999.999)`,
                    [`computed2`]: `float(2147483648)`,
                    [`computed3`]: `float(-2147483649)`,
                    [`computed4`]: `float(123456789)`,
                    [`computed5`]: `float(0.00001)`,
                    [`computed6`]: `float(1.9999999992)`,
                    [`computed7`]: `float(2147483647.1234567)`,
                    [`computed8`]: `float(-2147483647)`,
                    [`computed9`]: `float('957187281.00000001')`,
                    [`computed10`]: `float('1928.2817')`,
                    [`computed11`]: `float('abcdefg')`,
                    [`computed12`]: `float('abcdefg1234.123125')`,
                    [`computed13`]: `float('2147483648.1234566')`,
                    [`computed14`]: `float('-2147483649')`,
                    [`computed15`]: `float('inf')`,
                    [`computed16`]: `float('-inf')`,
                    [`computed17`]: `float(inf)`,
                    [`computed18`]: `float(-inf)`,
                },
            });

            expect(await view.expression_schema()).toEqual({
                computed: "float",
                computed2: "float",
                computed3: "float",
                computed4: "float",
                computed5: "float",
                computed6: "float",
                computed7: "float",
                computed8: "float",
                computed9: "float",
                computed10: "float",
                computed11: "float",
                computed12: "float",
                computed13: "float",
                computed14: "float",
                computed15: "float",
                computed16: "float",
                computed17: "float",
                computed18: "float",
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([999999.999]);
            expect(result["computed2"]).toEqual([2147483648]);
            expect(result["computed3"]).toEqual([-2147483649]);
            expect(result["computed4"]).toEqual([123456789]);
            expect(result["computed5"]).toEqual([0.00001]);
            expect(result["computed6"]).toEqual([1.9999999992]);
            expect(result["computed7"]).toEqual([2147483647.1234567]);
            expect(result["computed8"]).toEqual([-2147483647]);
            expect(result["computed9"]).toEqual([957187281.00000001]);
            expect(result["computed10"]).toEqual([1928.2817]);
            expect(result["computed11"]).toEqual([null]);
            expect(result["computed12"]).toEqual([null]);
            expect(result["computed13"]).toEqual([2147483648.1234566]);
            expect(result["computed14"]).toEqual([-2147483649]);
            expect(result["computed15"]).toEqual([null]);
            expect(result["computed16"]).toEqual([null]);
            expect(result["computed17"]).toEqual([null]);
            expect(result["computed18"]).toEqual([null]);

            await view.delete();
            await table.delete();
        });

        // TODO same deal as above - not sure this behavior is correct.
        // `table.update()` should be invalid here.
        test.skip("Should create float from integer columns", async () => {
            const table = await perspective.table({ x: "integer" });

            const view = await table.view({
                expressions: { computed: `float("x")` },
            });

            table.update({
                x: [100, -17238.8123, 0.890798, -1.1295, null, 12836215.128937],
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                100,
                -17238,
                0,
                -1,
                null,
                12836215,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Should create float from float columns", async () => {
            const table = await perspective.table({ x: "float" });

            const view = await table.view({
                expressions: { computed: ` float("x")` },
            });

            table.update({
                x: [
                    100.9999999,
                    -17238.8123,
                    0.890798,
                    -1.1295,
                    null,
                    12836215.128937,
                ],
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                100.9999999,
                -17238.8123,
                0.890798,
                -1.1295,
                null,
                12836215.128937,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Should create float from date columns", async () => {
            const table = await perspective.table({ x: "date" });

            const view = await table.view({
                expressions: { computed: `float("x")` },
            });

            const value = new Date(2020, 5, 30);

            table.update({
                x: [value],
            });

            const result = await view.to_columns();

            // The custom format that Perspective uses to store dates - we
            // can validate correctness by applying bitmask/shifting.
            const expected = 132384030;

            expect(result["computed"]).toEqual([expected]);

            const year = (expected & 0xffff0000) >> 16;
            const month = (expected & 0x0000ff00) >> 8;
            const day = (expected & 0x000000ff) >> 0;

            expect(year).toEqual(2020);
            expect(month + 1).toEqual(6);
            expect(day).toEqual(30);

            await view.delete();
            await table.delete();
        });

        test("Should create float from datetime columns", async () => {
            const table = await perspective.table({ x: "datetime" });

            const view = await table.view({
                expressions: { computed: `float("x")` },
            });

            table.update({
                x: [new Date(2020, 0, 1, 1), new Date(2020, 0, 1, 1, 50)],
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                new Date(2020, 0, 1, 1).getTime(),
                new Date(2020, 0, 1, 1, 50).getTime(),
            ]);

            await view.delete();
            await table.delete();
        });

        // TODO This behavior is questionable at best, and given Perspective's
        // more advanced expression aupport, its probably better to error
        // here.
        test.skip("Should create floats from string columns", async () => {
            const table = await perspective.table({
                x: [
                    "1.1238757869112321",
                    "2.0000001",
                    "abcdefg1234.12878591",
                    "12354.1827389abc",
                    "4.555555555",
                    "0.101928317581729083",
                    "-123456.21831729054781",
                ],
            });

            const view = await table.view({
                expressions: { computed: ` float("x")` },
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                1.1238757869112321,
                2.0000001,
                null,
                null,
                4.555555555,
                0.101928317581729083,
                -123456.21831729054781,
            ]);

            await view.delete();
            await table.delete();
        });
    });

    test.describe("boolean()", () => {
        test("Should create a boolean value", async () => {
            const table = await perspective.table({
                x: [1, 2, null, 4],
            });

            const view = await table.view({
                expressions: { 'boolean("x")': 'boolean("x")' },
            });

            expect(await view.expression_schema()).toEqual({
                'boolean("x")': "boolean",
            });

            expect(await view.to_columns()).toEqual({
                x: [1, 2, null, 4],
                'boolean("x")': [true, true, false, true],
            });

            await view.delete();
            await table.delete();
        });

        test("Empty strings and nulls", async () => {
            const table = await perspective.table({
                x: ["abcd", "", null, "abc"],
            });

            const view = await table.view({
                expressions: { 'boolean("x")': 'boolean("x")' },
            });

            expect(await view.expression_schema()).toEqual({
                'boolean("x")': "boolean",
            });

            expect(await view.to_columns()).toEqual({
                x: ["abcd", "", null, "abc"],
                'boolean("x")': [true, false, false, true],
            });

            await view.delete();
            await table.delete();
        });

        test("Should respond to updates", async () => {
            const table = await perspective.table(
                {
                    idx: [1, 2, 3, 4],
                    x: [1, 2, null, 4],
                },
                { index: "idx" }
            );

            const view = await table.view({
                expressions: { 'boolean("x")': 'boolean("x")' },
            });

            expect(await view.expression_schema()).toEqual({
                'boolean("x")': "boolean",
            });

            expect(await view.to_columns()).toEqual({
                idx: [1, 2, 3, 4],
                x: [1, 2, null, 4],
                'boolean("x")': [true, true, false, true],
            });

            table.update({
                idx: [3, 2],
                x: [100, null],
            });

            expect(await view.to_columns()).toEqual({
                idx: [1, 2, 3, 4],
                x: [1, null, 100, 4],
                'boolean("x")': [true, false, true, true],
            });

            await view.delete();
            await table.delete();
        });

        test("Should respond to removes", async () => {
            const table = await perspective.table(
                {
                    idx: [1, 2, 3, 4],
                    x: [1, 2, null, 4],
                },
                { index: "idx" }
            );

            const view = await table.view({
                expressions: { 'boolean("x")': 'boolean("x")' },
            });

            expect(await view.expression_schema()).toEqual({
                'boolean("x")': "boolean",
            });

            expect(await view.to_columns()).toEqual({
                idx: [1, 2, 3, 4],
                x: [1, 2, null, 4],
                'boolean("x")': [true, true, false, true],
            });

            table.remove([1, 4]);

            expect(await view.to_columns()).toEqual({
                idx: [2, 3],
                x: [2, null],
                'boolean("x")': [true, false],
            });

            await view.delete();
            await table.delete();
        });
    });

    test.describe("date()", () => {
        test("Should create a date from scalars", async () => {
            const table = await perspective.table({
                x: [1, 2, 3, 4],
            });

            const view = await table.view({
                expressions: {
                    [`computed`]: `date(2020, 7, 15)`,
                    [`computed2`]: `date(1970, 10, 29)`,
                    [`computed3`]: `date(2020, 1, "x")`,
                },
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual(
                Array(4).fill(new Date(2020, 6, 15).getTime())
            );
            expect(result["computed2"]).toEqual(
                Array(4).fill(new Date(1970, 9, 29).getTime())
            );
            expect(result["computed3"]).toEqual(
                Array(4)
                    .fill(true)
                    .map((_, idx) => new Date(2020, 0, idx + 1).getTime())
            );
            await view.delete();
            await table.delete();
        });

        test("Should create a date from int columns", async () => {
            // NOTE: This test originally used dates that would cause an underflow issue
            //       in the epoch time conversion that occurs within the c++ engine.
            //       Revert these changes once the c++ engine is updated to use std::chrono.
            const table = await perspective.table({
                y: "integer",
                m: "integer",
                d: "integer",
            });

            const view = await table.view({
                expressions: { computed: ` date("y", "m", "d")` },
            });

            table.update({
                // y: [0, 2020, 1776, 2018, 2020, 2020], // old values, see note above.
                y: [1970, 2020, 2000, 2018, 2020, 2020],
                m: [1, 2, 5, 2, 12, null],
                d: [1, 29, 31, 29, 31, 1],
            });

            const result = await view.to_columns();
            const expected = [
                // new Date(1900, 0, 1), // old values, see note above.
                new Date(1970, 0, 1),
                new Date(2020, 1, 29),
                // new Date(1776, 4, 31), // old values, see note above.
                new Date(2000, 4, 31),
                new Date(2018, 1, 29),
                new Date(2020, 11, 31),
            ].map((x) => x.getTime());
            expected.push(null);
            expect(result["computed"]).toEqual(expected);
            await view.delete();
            await table.delete();
        });

        test("Should create a date from float columns", async () => {
            // NOTE: This test originally used dates that would cause an underflow issue
            //       in the epoch time conversion that occurs within the c++ engine.
            //       Revert these changes once the c++ engine is updated to use std::chrono.
            const table = await perspective.table({
                y: "float",
                m: "float",
                d: "float",
            });

            const view = await table.view({
                expressions: { computed: ` date("y", "m", "d")` },
            });

            table.update({
                // y: [0, 2020, 1776, 2018, 2020, 2020], // old values, see note above.
                y: [1970, 2020, 2000, 2018, 2020, 2020],
                m: [1, 2, 5, 2, 12, null],
                d: [1, 29, 31, 29, 31, 1],
            });

            const result = await view.to_columns();
            const expected = [
                // new Date(1900, 0, 1), // old values, see note above.
                new Date(1970, 0, 1),
                new Date(2020, 1, 29),
                // new Date(1776, 4, 31), // old values, see note above.
                new Date(2000, 4, 31),
                new Date(2018, 1, 29),
                new Date(2020, 11, 31),
            ].map((x) => x.getTime());
            expected.push(null);
            expect(result["computed"]).toEqual(expected);
            await view.delete();
            await table.delete();
        });

        test("Should create a date from numeric columns and skip invalid values", async () => {
            // NOTE: The original test used `y: [-100, 0, 2000, 3000]`, but the `3000` value
            //       has been replaced with `2030` due to an underflow issue with the computed
            //       epoch time. This test should be returned to its original state once
            //       the c++ engine is updated to use std::chrono.
            const table = await perspective.table({
                y: [-100, 0, 2000, 2030],
                m: [12, 0, 12, 11],
                d: [1, 10, 32, 10],
            });

            const view = await table.view({
                expressions: { computed: ` date("y", "m", "d")` },
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                null,
                null,
                null,
                new Date(2030, 10, 10).getTime(),
            ]);
            await view.delete();
            await table.delete();
        });

        test("Should create a date from variables inside expression", async () => {
            const table = await perspective.table({
                x: [20200101, 20090531, 19801220, 20200229],
            });

            const view = await table.view({
                expressions: {
                    [`computed`]: `var year := floor("x" / 10000); var month := floor("x" % 10000 / 100); var day := floor("x" % 100); date(year, month, day)`,
                },
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual(
                [
                    new Date(2020, 0, 1),
                    new Date(2009, 4, 31),
                    new Date(1980, 11, 20),
                    new Date(2020, 1, 29),
                ].map((x) => x.getTime())
            );
            await view.delete();
            await table.delete();
        });

        test("Should validate inputs", async () => {
            const table = await perspective.table({
                y: [-100, 0, 2000, 3000],
                m: [12, 0, 12, 11],
                d: [1, 10, 32, 10],
            });

            const validated = await table.validate_expressions({
                [`computed`]: `date()`,
                [`computed2`]: `date('abc', 'def', '123')`,
                [`computed3`]: `date("y", "m", "d")`,
            });

            expect(validated.expression_schema).toEqual({
                computed3: "date",
            });

            expect(validated.errors).toEqual({
                computed: {
                    column: 6,
                    error_message:
                        "Zero parameter call to generic function: date not allowed",
                    line: 0,
                },
                computed2: {
                    column: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    line: 0,
                },
            });

            await table.delete();
        });
    });

    test.describe("datetime()", () => {
        test("Should create a datetime from scalars", async () => {
            const table = await perspective.table({
                x: [1, 2, 3, 4],
            });

            const a = new Date(2005, 6, 31, 11, 59, 32).getTime();
            const b = new Date(2005, 6, 31, 11, 59, 32).getTime();

            const view = await table.view({
                expressions: {
                    [`computed`]: `datetime(${a})`,
                    [`computed2`]: `datetime(${b})`,
                },
            });

            expect(await view.expression_schema()).toEqual({
                computed: "datetime",
                computed2: "datetime",
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual(Array(4).fill(a));
            expect(result["computed2"]).toEqual(Array(4).fill(b));
            await view.delete();
            await table.delete();
        });

        test("Should create a datetime from a float()", async () => {
            const table = await perspective.table({
                x: [new Date(2005, 6, 31, 11, 59, 32)],
            });

            const view = await table.view({
                expressions: { computed: ` datetime(float("x"))` },
            });

            expect(await view.expression_schema()).toEqual({
                computed: "datetime",
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual([
                new Date(2005, 6, 31, 11, 59, 32).getTime(),
            ]);
            await view.delete();
            await table.delete();
        });

        // TODO Previous behavior was to fill this column with null - new
        // behavior is to error, which IMO is more correct.
        test.skip("Should not create a datetime from int columns as int32 is too small", async () => {
            const table = await perspective.table({
                x: "integer",
            });

            const view = await table.view({
                expressions: { computed: ` datetime("x")` },
            });

            const data = [
                new Date(2020, 1, 29, 5, 1, 2),
                new Date(1776, 4, 31, 13, 23, 18),
                new Date(2018, 1, 29, 19, 39, 43),
                new Date(2020, 11, 31, 23, 59, 59),
            ].map((x) => x.getTime());
            data.push(null);

            table.update({
                x: data,
            });

            let result = await view.to_columns();

            expect(result["computed"]).toEqual(Array(5).fill(null));
            await view.delete();
            await table.delete();
        });

        test("Should create a datetime from float columns", async () => {
            // NOTE: This test originally used dates that would cause an underflow issue
            //       in the epoch time conversion that occurs within the c++ engine.
            //       Revert these changes once the c++ engine is updated to use std::chrono.
            const table = await perspective.table({
                x: "float",
            });

            const view = await table.view({
                expressions: { computed: ` datetime("x")` },
            });

            const data = [
                new Date(2020, 1, 29, 5, 1, 2),
                new Date(2000, 4, 31, 13, 23, 18),
                // new Date(1776, 4, 31, 13, 23, 18), // old values, see note above.
                new Date(2018, 1, 29, 19, 39, 43),
                new Date(2020, 11, 31, 23, 59, 59),
            ].map((x) => x.getTime());
            data.push(null);

            table.update({
                x: data,
            });

            const result = await view.to_columns();
            expect(result["computed"]).toEqual(data);
            await view.delete();
            await table.delete();
        });

        test("Should create a datetime from numeric scalars < 0", async () => {
            const table = await perspective.table({
                x: [1],
            });

            const view = await table.view({
                expressions: {
                    [`computed1`]: `datetime(-1)`,
                    [`computed2`]: `datetime(0)`,
                    computed3: `datetime(${new Date(
                        2002,
                        11,
                        12,
                        13,
                        14,
                        15
                    ).getTime()})`,
                },
            });

            expect(await view.expression_schema()).toEqual({
                computed1: "datetime",
                computed2: "datetime",
                computed3: "datetime",
            });

            const result = await view.to_columns();

            expect(result["computed1"]).toEqual([-1]);
            expect(result["computed2"]).toEqual([0]);
            expect(result["computed3"]).toEqual([
                new Date(2002, 11, 12, 13, 14, 15).getTime(),
            ]);
            await view.delete();
            await table.delete();
        });

        test("Should validate inputs", async () => {
            const table = await perspective.table({
                x: [1],
            });

            const validated = await table.validate_expressions({
                [`computed1`]: `datetime()`,
                [`computed2`]: `datetime('abcd')`,
                [`computed3`]: `datetime(today())`,
                [`computed4`]: `datetime(now())`,
                [`computed5`]: `datetime(123456, 7)`,
            });

            expect(validated.expression_schema).toEqual({});

            expect(validated.errors).toEqual({
                computed1: {
                    column: 10,
                    error_message:
                        "Zero parameter call to generic function: datetime not allowed",
                    line: 0,
                },
                computed2: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                computed3: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                computed4: {
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    column: 0,
                    line: 0,
                },
                computed5: {
                    error_message:
                        "Failed parameter type check for function 'datetime', Expected 'T' call set: 'TT'",
                    column: 19,
                    line: 0,
                },
            });

            await table.delete();
        });
    });
})(perspective);
