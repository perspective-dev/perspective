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

const CHARS = ` !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_\`abcdefghijklmnopqrstuvwxyz{|}~`;
const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMERIC = "0123456789";
const ALPHANUMERIC = ALPHA + NUMERIC;
const randint = (min, max) =>
    Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) +
    Math.ceil(min);
const randchoice = (collection) =>
    collection[randint(0, collection.length - 1)];
const random_string = (
    max_length = 100,
    is_null = false,
    input_values = CHARS
) => {
    if (is_null && Math.random() > 0.5) return null;
    const length = randint(1, max_length);
    const output = [];

    for (let i = 0; i < length; i++) {
        output.push(randchoice(input_values));
    }

    return output.join("");
};

/**
 * Tests the correctness of each string computation function in various
 * environments and parameters - different types, nulls, undefined, etc.
 *
 * TODO: add tests for shared vocab after clear()
 */
((perspective) => {
    test.describe("String functions", function () {
        test("Comparisons", async function () {
            const table = await perspective.table({
                x: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
                y: ["ABC", "DEF", "EfG", "HIjK", "lMNoP"],
            });
            const view = await table.view({
                expressions: {
                    [`a`]: `'abcdefghijklmnopqrstuvwxyz' == 'abcdefghijklmnopqrstuvwxyz'`,
                    [`b`]: `"x" == lower("y")`,
                    [`c`]: `if("x" == 'abc', 100, 0)`,
                    [`d`]: `if("x" != 'abc', 'new string 1', 'new string 2')`,
                    [`e`]: `'d' > 'a'`,
                    [`f`]: `'efz' > 'efy'`, // lexicographic
                },
            });

            let result = await view.to_columns();

            expect(result["a"]).toEqual(Array(5).fill(true));
            expect(result["b"]).toEqual([true, false, false, false, false]);
            expect(result["c"]).toEqual([100, 0, 0, 0, 0]);
            expect(result["d"]).toEqual([
                "new string 2",
                "new string 1",
                "new string 1",
                "new string 1",
                "new string 1",
            ]);
            expect(result["e"]).toEqual(Array(5).fill(true));
            expect(result["f"]).toEqual(Array(5).fill(true));

            view.delete();
            table.delete();
        });

        test("Pivoted", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
                b: ["ABC", "DEF", "EfG", "HIjK", "lMNoP"],
                c: [2, 2, 4, 4, 5],
            });
            const view = await table.view({
                aggregates: { column: "last" },
                group_by: ["column"],
                expressions: {
                    [`column`]: `concat("a", ', ', 'here is a long string, ', "b")`,
                },
            });
            let result = await view.to_columns();

            expect(result["column"]).toEqual([
                "hhs, here is a long string, HIjK",
                "abc, here is a long string, ABC",
                "abcdefghijk, here is a long string, lMNoP",
                "deeeeef, here is a long string, DEF",
                "fg, here is a long string, EfG",
                "hhs, here is a long string, HIjK",
            ]);

            view.delete();
            table.delete();
        });

        test("Filtered", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
                b: ["ABC", "DEF", "EfG", "HIjK", "lMNoP"],
                c: [2, 2, 4, 4, 5],
            });
            const view = await table.view({
                filter: [["column", "==", "hhs, here is a long string, HIjK"]],
                expressions: {
                    [`column`]: `concat("a", ', ', 'here is a long string, ', "b")`,
                },
            });
            let result = await view.to_columns();
            expect(result["column"]).toEqual([
                "hhs, here is a long string, HIjK",
            ]);
            view.delete();
            table.delete();
        });

        test("Length", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
            });
            const view = await table.view({
                expressions: { 'length("a")': 'length("a")' },
            });
            let result = await view.to_columns();
            expect(result['length("a")']).toEqual(
                result.a.map((x) => x.length)
            );
            view.delete();
            table.delete();
        });

        test("Length with null", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", null, undefined, "abcdefghijk"],
            });
            const view = await table.view({
                expressions: { 'length("a")': 'length("a")' },
            });
            let result = await view.to_columns();
            expect(result['length("a")']).toEqual(
                result.a.map((x) => (x ? x.length : null))
            );
            view.delete();
            table.delete();
        });

        test("Order", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
            });

            const validate = await table.validate_expressions({
                [`col`]: `order("a", 'deeeeef', 'fg', 'abcdefghijk', 'hhs', 'abc')`,
            });

            expect(validate.expression_schema).toEqual({
                col: "float",
            });

            const view = await table.view({
                expressions: [
                    `order("a", 'deeeeef', 'fg', 'abcdefghijk', 'hhs', 'abc')`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });

            let result = await view.to_columns();
            expect(
                result[
                    `order("a", 'deeeeef', 'fg', 'abcdefghijk', 'hhs', 'abc')`
                ]
            ).toEqual([4, 0, 1, 3, 2]);

            view.delete();
            table.delete();
        });

        test("Order type validates", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
                b: [1, 2, 3, 4, 5],
            });

            const validate = await table.validate_expressions({
                [`col`]: `order("a", 'deeeeef', 'fg', 'abcdefghijk', 'hhs', 'abc')`,
                [`col2`]: `order('a', 'b', today())`,
                [`col3`]: `order("b")`,
                [`col4`]: `order()`,
            });

            expect(validate.expression_schema).toEqual({
                col: "float",
            });

            expect(validate.errors).toEqual({
                col2: {
                    column: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    line: 0,
                },
                col3: {
                    column: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    line: 0,
                },
                col4: {
                    column: 7,
                    error_message:
                        "Zero parameter call to generic function: order not allowed",
                    line: 0,
                },
            });

            await table.delete();
        });

        test("Order with partial specification", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
            });
            const view = await table.view({
                expressions: {
                    "order(\"a\", 'deeeeef', 'fg')":
                        "order(\"a\", 'deeeeef', 'fg')",
                },
            });
            let result = await view.to_columns();
            expect(result[`order("a", 'deeeeef', 'fg')`]).toEqual([
                2, 0, 1, 2, 2,
            ]);
            view.delete();
            table.delete();
        });

        test("Order with null", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", null, undefined, "abcdefghijk"],
            });
            const view = await table.view({
                expressions: {
                    [`order("a", 'deeeeef', 'abcdefghijk', 'abc')`]: `order("a", 'deeeeef', 'abcdefghijk', 'abc')`,
                },
            });
            let result = await view.to_columns();
            expect(
                result[`order("a", 'deeeeef', 'abcdefghijk', 'abc')`]
            ).toEqual([2, 0, null, null, 1]);
            view.delete();
            table.delete();
        });

        test("Upper", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
            });
            const view = await table.view({
                expressions: { 'upper("a")': 'upper("a")' },
            });
            let result = await view.to_columns();
            expect(result['upper("a")']).toEqual(
                result.a.map((x) => x.toUpperCase())
            );
            view.delete();
            table.delete();
        });

        test("Uppercase with null", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", null, undefined, "abcdefghijk"],
            });
            const view = await table.view({
                expressions: { 'upper("a")': 'upper("a")' },
            });
            let result = await view.to_columns();
            expect(result['upper("a")']).toEqual(
                result.a.map((x) => (x ? x.toUpperCase() : null))
            );
            view.delete();
            table.delete();
        });

        test.skip("Uppercase, non-utf8", async function () {
            const table = await perspective.table({
                a: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝓊⋁ẅ⤫𝛾𝓏", null],
                b: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ", "EfG"],
            });
            const view = await table.view({
                expressions: {
                    'upper("a")': 'upper("a")',
                    'upper("b")': 'upper("b")',
                },
            });
            let result = await view.to_columns();
            expect(result['upper("a")']).toEqual(
                result.a.map((x) => (x ? x.toUpperCase() : null))
            );
            expect(result['upper("b")']).toEqual(
                result.b.map((x) => (x ? x.toUpperCase() : null))
            );
            view.delete();
            table.delete();
        });

        test("Lowercase", async function () {
            const table = await perspective.table({
                a: ["ABC", "DEF", "EfG", "HIjK", "lMNoP"],
            });
            const view = await table.view({
                expressions: { 'lower("a")': 'lower("a")' },
            });
            let result = await view.to_columns();
            expect(result['lower("a")']).toEqual(
                result.a.map((x) => x.toLowerCase())
            );
            view.delete();
            table.delete();
        });

        test("Lowercase with null", async function () {
            const table = await perspective.table({
                a: ["ABC", "DEF", null, undefined, "lMNoP"],
            });
            const view = await table.view({
                expressions: { 'lower("a")': 'lower("a")' },
            });
            let result = await view.to_columns();
            expect(result['lower("a")']).toEqual(
                result.a.map((x) => (x ? x.toLowerCase() : null))
            );
            view.delete();
            table.delete();
        });

        test("Lowercase, non-utf8", async function () {
            const table = await perspective.table({
                a: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝓊⋁ẅ⤫𝛾𝓏", null],
                b: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ", "EfG"],
            });

            const view = await table.view({
                expressions: {
                    'lower("a")': 'lower("a")',
                    'lower("b")': 'lower("b")',
                },
            });

            let result = await view.to_columns();
            expect(result['lower("a")']).toEqual(
                result.a.map((x) => (x ? x.toLowerCase() : null))
            );
            expect(result['lower("b")']).toEqual(
                result.b.map((x) => (x ? x.toLowerCase() : null))
            );
            view.delete();
            table.delete();
        });

        test("Concat", async function () {
            const table = await perspective.table({
                a: ["abc", "deeeeef", "fg", "hhs", "abcdefghijk"],
                b: ["ABC", "DEF", "EfG", "HIjK", "lMNoP"],
            });
            const view = await table.view({
                expressions: [
                    `concat("a", ', ', 'here is a long string, ', "b")`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            expect(
                result[`concat("a", ', ', 'here is a long string, ', "b")`]
            ).toEqual(
                result.a.map(
                    (x, idx) => x + ", here is a long string, " + result.b[idx]
                )
            );
            view.delete();
            table.delete();
        });

        test("Concats, nulls", async function () {
            const table = await perspective.table({
                a: ["ABC", "DEF", null, "HIjK", "lMNoP"],
                b: ["ABC", undefined, "EfG", "HIjK", "lMNoP"],
            });
            const view = await table.view({
                expressions: [
                    `concat("a", ', ', 'here is a long string, ', "b")`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result.a.map(
                (x, idx) => x + ", here is a long string, " + result.b[idx]
            );
            expected[1] = null;
            expected[2] = null;
            expect(
                result[`concat("a", ', ', 'here is a long string, ', "b")`]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Concats, extra long", async function () {
            const table = await perspective.table({
                a: [
                    "ABC".repeat(10),
                    "DEF".repeat(10),
                    null,
                    "HIjK".repeat(10),
                    "lMNoP".repeat(10),
                ],
                b: ["ABC", undefined, "EfG", "HIjK", "lMNoP"],
            });
            const view = await table.view({
                expressions: [
                    `concat("a", ', ', 'here is a long string, ', "b")`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result.a.map(
                (x, idx) => x + ", here is a long string, " + result.b[idx]
            );
            expected[1] = null;
            expected[2] = null;
            expect(
                result[`concat("a", ', ', 'here is a long string, ', "b")`]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Concats, non-utf8", async function () {
            const table = await perspective.table({
                a: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝓊⋁ẅ⤫𝛾𝓏", null],
                b: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ", "EfG"],
            });
            const view = await table.view({
                expressions: [
                    `concat("a", ', ', 'here is a long string, ', "b")`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result.a.map(
                (x, idx) => x + ", here is a long string, " + result.b[idx]
            );
            expected[2] = null;
            expect(
                result[`concat("a", ', ', 'here is a long string, ', "b")`]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Upper concats", async function () {
            const table = await perspective.table({
                a: [
                    "hello world",
                    "abakshdaskjhlgkjasdiukjqewlkjesaljhgdaskd",
                    null,
                ],
                b: ["asjdhlkhfdshafiywhjklsjfaksdgjadkjlv", "abc", "EfG"],
            });
            const view = await table.view({
                expressions: [
                    `upper(concat("a", ', ', 'here is a long string, ', "b"))`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result[
                `upper(concat("a", ', ', 'here is a long string, ', "b"))`
            ].map((x) => (x ? x.toUpperCase() : null));
            expected[2] = null;
            expect(
                result[
                    `upper(concat("a", ', ', 'here is a long string, ', "b"))`
                ]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Lower concats", async function () {
            const table = await perspective.table({
                a: [
                    "HELLO WORLD SADJKHFUOIWNS:AJKSKJDJBCL",
                    "KJBSJHDBGASHJDB ASCBAKISJHDKJSAHNDKASJ SJKHDJKAS",
                    null,
                ],
                b: [
                    "LDJSA:KJFGHJAKLSoijSJDM:ALKJDAS)oewqSAPDOD",
                    "ASdhnlsaadkjhASJKDSAHIUEHYWIUDSHDNBKJSAD",
                    "EfG",
                ],
            });
            const view = await table.view({
                expressions: [
                    `lower(concat("a", ', ', 'HERE is a long string, ', "b"))`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result[
                `lower(concat("a", ', ', 'HERE is a long string, ', "b"))`
            ].map((x) => (x ? x.toLowerCase() : null));
            expected[2] = null;
            expect(
                result[
                    `lower(concat("a", ', ', 'HERE is a long string, ', "b"))`
                ]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Order lower concats", async function () {
            const table = await perspective.table({
                a: ["HELLO WORLD", "VERY LONG STRING HERE", null],
                b: ["ALSO HELLO WORLD", "ANOTHER LONG STRING IS HERE", "EfG"],
            });
            const view = await table.view({
                expressions: [
                    `order(lower(concat("a", ', ', 'HERE is a long string, ', "b")), 'very long string here, here is a long string, another long string is here')`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            expect(
                result[
                    `order(lower(concat("a", ', ', 'HERE is a long string, ', "b")), 'very long string here, here is a long string, another long string is here')`
                ]
            ).toEqual([1, 0, null]);
            view.delete();
            table.delete();
        });

        test.skip("Upper concats, non-utf8", async function () {
            const table = await perspective.table({
                a: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝓊⋁ẅ⤫𝛾𝓏", null],
                b: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ", "EfG"],
            });
            const view = await table.view({
                expressions: [
                    `upper(concat("a", ', ', 'here is a long string, ', "b"))`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result[
                `upper(concat("a", ', ', 'here is a long string, ', "b"))`
            ].map((x) => (x ? x.toUpperCase() : null));
            expected[2] = null;
            expect(
                result[
                    `upper(concat("a", ', ', 'here is a long string, ', "b"))`
                ]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Lower concats, non-utf8", async function () {
            const table = await perspective.table({
                a: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝓊⋁ẅ⤫𝛾𝓏", null],
                b: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ", "EfG"],
            });
            const view = await table.view({
                expressions: [
                    `lower(concat("a", ', ', 'HERE is a long string, ', "b"))`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result[
                `lower(concat("a", ', ', 'HERE is a long string, ', "b"))`
            ].map((x) => (x ? x.toLowerCase() : null));
            expect(
                result[
                    `lower(concat("a", ', ', 'HERE is a long string, ', "b"))`
                ]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test.skip("Length concats, non-utf8", async function () {
            const table = await perspective.table({
                a: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝓊⋁ẅ⤫𝛾𝓏", null],
                b: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ", "EfG"],
            });
            const view = await table.view({
                expressions: [
                    `length(concat("a", ', ', 'here is a long string, ', "b"))`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            let expected = result.a.map(
                (x, idx) =>
                    (x + ", here is a long string, " + result.b[idx]).length
            );
            expected[2] = null;
            expect(
                result[
                    `length(concat("a", ', ', 'here is a long string, ', "b"))`
                ]
            ).toEqual(expected);
            view.delete();
            table.delete();
        });

        test.skip("Order concats, non-utf8", async function () {
            const table = await perspective.table({
                a: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝓊⋁ẅ⤫𝛾𝓏", null],
                b: ["𝕙ḗľᶅở щṏᵲɭⅾ", "𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ", "EfG"],
            });
            const view = await table.view({
                expressions: [
                    `var x := concat("a", ', ', 'here is a long string, ', "b"); order(x, '𝓊⋁ẅ⤫𝛾𝓏, here is a long string, 𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ', '𝕙ḗľᶅở щṏᵲɭⅾ, here is a long string, 𝕙ḗľᶅở щṏᵲɭⅾ')`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            let result = await view.to_columns();
            expect(
                result[
                    `var x := concat("a", ', ', 'here is a long string, ', "b"); order(x, '𝓊⋁ẅ⤫𝛾𝓏, here is a long string, 𝑢ⱴⱳẍ𝘺𝘇ӑṣᶑᵴ', '𝕙ḗľᶅở щṏᵲɭⅾ, here is a long string, 𝕙ḗľᶅở щṏᵲɭⅾ')`
                ]
            ).toEqual([1, 0, 2]);

            view.delete();
            table.delete();
        });
    });

    test.describe("String comparison", function () {
        test("==", async function () {
            const table = await perspective.table({
                a: ["ABC", "DEF", null, "HIjK", "lMNoP"],
                b: ["ABC", undefined, null, "HIjK", "lMNoP"],
            });

            let view = await table.view({
                expressions: { '"a" == "b"': '"a" == "b"' },
            });

            let result = await view.to_columns();

            // null == null is true here
            expect(result['"a" == "b"']).toEqual([
                true,
                false,
                true,
                true,
                true,
            ]);
            view.delete();
            table.delete();
        });

        test("== on expression output", async function () {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cba", "HIjK", "lMNoP"],
                b: ["ABC", "ad", "asudfh", "HIjK", "lMNoP"],
            });

            let view = await table.view({
                expressions: [
                    `concat("a", ', ', "b") == concat("a", ', ', "b")`,
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });

            let result = await view.to_columns();
            expect(
                result[`concat("a", ', ', "b") == concat("a", ', ', "b")`]
            ).toEqual([true, true, true, true, true]);
            view.delete();
            table.delete();
        });

        test("==, nulls", async function () {
            const table = await perspective.table({
                a: ["ABC", "DEF", undefined, null, null],
                b: ["ABC", "not", "EfG", "HIjK", null],
            });

            let view = await table.view({
                expressions: { '"a" == "b"': '"a" == "b"' },
            });

            let result = await view.to_columns();
            expect(result['"a" == "b"']).toEqual([
                true,
                false,
                false,
                false,
                true,
            ]);
            view.delete();
            table.delete();
        });

        test("==, extra long", async function () {
            const table = await perspective.table({
                a: [
                    "ABC".repeat(10),
                    "DEF".repeat(10),
                    null,
                    "HIjK".repeat(10),
                    "lMNoP",
                ],
                b: [
                    "ABC".repeat(10),
                    "DEF".repeat(10),
                    undefined,
                    "HIjK",
                    "lMNoP",
                ],
            });

            let view = await table.view({
                expressions: { '"a" == "b"': '"a" == "b"' },
            });

            let result = await view.to_columns();
            expect(result['"a" == "b"']).toEqual([
                true,
                true,
                true,
                false,
                true,
            ]);
            view.delete();
            table.delete();
        });

        test("==, short", async function () {
            const table = await perspective.table({
                a: ["A", "E", null, "h", "l"],
                b: ["a", "E", undefined, "h", "l"],
            });

            let view = await table.view({
                expressions: { '"a" == "b"': '"a" == "b"' },
            });

            let result = await view.to_columns();
            expect(result['"a" == "b"']).toEqual([
                false,
                true,
                false,
                true,
                true,
            ]);
            view.delete();
            table.delete();
        });

        test("==, mixed length", async function () {
            const table = await perspective.table({
                a: [
                    "ABC".repeat(100),
                    "DEF".repeat(10),
                    null,
                    "hijk".repeat(10),
                    "lm",
                ],
                b: [
                    "arc".repeat(50),
                    "DEf".repeat(10),
                    undefined,
                    "HIjK",
                    "lMNoP",
                ],
            });

            let view = await table.view({
                expressions: { '"a" == "b"': '"a" == "b"' },
            });

            let result = await view.to_columns();
            expect(result['"a" == "b"']).toEqual([
                false,
                false,
                false,
                false,
                false,
            ]);
            view.delete();
            table.delete();
        });

        test("==, UTF-8", async function () {
            const table = await perspective.table({
                a: [
                    ">ﺐ{׆Meڱ㒕宾ⷭ̽쉱L𞔚Ո拏۴ګPظǭPۋV|팺㺞㷾墁鴦򒲹|ۿ򧊊䭪񪩛𬦢񺣠񦋳򵾳蛲񖑐iM񊪝񆷯",
                    "灙𬡍瀳։󷿙񅈕ǐ-kʂiJ!P񙺍󵝳̃੝w𬾐򕕉耨󉋦o򰵏詂3򒤹J<ꑭ񃕱Ӏ𛤦4u򉠚UPf􂢳P##Q񪂈",
                    "ĈᔞZ񇌖Qఋ?x?#$12ボլ㕢ﺧ𷛘󽙮[񲸧I񟭝򋨰魏ճכ󽺴ۏ󫨫䆐'㓔ǃ[ְ੬䎕寽𤩚ߨ袧򲕊򓰷|%",
                    "ęԛ򓍯󍩁𨞟㰢󇂣õ􌁇΍Ԥ⥯۷˝㿙צּ񬆩򤿭顂ݦۍ式+=ԋ帋񃴕譋ⴏ0l􅏎߳cί򇈊iȞڈU򆐹񍖮򷡦̥𩮏Ǳ",
                    "0ой3֝󻙋򑨮꾪߫0󏜬󆑝w󊭟񑓫򾷄𶳿o󏉃纊ʫ􅋶聍𾋊ô򓨼쀨ˆ퍨׽ȿKOŕ􅽾󙸹Ѩ󶭆j񽪌򸢐p򊘏׷򿣂dｇD쩖",
                ],
                b: [
                    ">ﺐ{׆Meڱ㒕宾ⷭ̽쉱L𞔚Ո拏۴ګPظǭPۋV|팺㺞㷾墁鴦򒲹|ۿ򧊊䭪񪩛𬦢񺣠񦋳򵾳蛲񖑐iM񊪝񆷯",
                    "灙𬡍瀳։󷿙񅈕ǐ-kʂiJ!P񙺍󵝳̃੝w𬾐򕕉耨󉋦o򰵏詂3򒤹J<ꑭ񃕱Ӏ𛤦4u򉠚UPf􂢳P##Q񪂈",
                    "ĈᔞZ񇌖Qఋ?x?#$12ボլ㕢ﺧ𷛘󽙮[񲸧I񟭝򋨰魏ճכ󽺴ۏ󫨫䆐'㓔ǃ[ְ੬䎕寽𤩚ߨ袧򲕊򓰷|%",
                    "ęԛ򓍯󍩁𨞟㰢󇂣õ􌁇΍Ԥ⥯۷˝㿙צּ񬆩򤿭顂ݦۍ式+=ԋ帋񃴕譋ⴏ0l􅏎߳cί򇈊iȞڈU򆐹񍖮򷡦̥𩮏Ǳ",
                    "0ой3֝󻙋򑨮꾪߫0󏜬󆑝w󊭟񑓫򾷄𶳿o󏉃纊ʫ􅋶聍𾋊ô򓨼쀨ˆ퍨׽ȿKOŕ􅽾󙸹Ѩ󶭆j񽪌򸢐p򊘏׷򿣂dｇD쩖2",
                ],
            });
            let view = await table.view({
                expressions: { '"a" == "b"': '"a" == "b"' },
            });
            let result = await view.to_columns();
            expect(result['"a" == "b"']).toEqual([
                true,
                true,
                true,
                true,
                false,
            ]);
            view.delete();
            table.delete();
        });

        test("==, UTF-8 converted to Unicode", async function () {
            const table = await perspective.table({
                a: [
                    ">{MeLPPV||iM",
                    "-kiJ!Pwo3J<4uUPfP##Q",
                    "ZQ?x?#$12[I'[|%",
                    "ܦf+=0lciU",
                    "030wo􎼨KOjpdD",
                ],
                b: [
                    ">{MeLPPV||iM",
                    "-kiJ!Pwo3J<4uUPfP##Q",
                    "ZQ?x?#$12[I'[|%",
                    "ܦf+=0lciU",
                    "030wo􎼨KOjpdD2",
                ],
            });
            let view = await table.view({
                expressions: { '"a" == "b"': '"a" == "b"' },
            });
            let result = await view.to_columns();
            expect(result['"a" == "b"']).toEqual([
                true,
                true,
                true,
                true,
                false,
            ]);
            view.delete();
            table.delete();
        });
    });

    test.describe("Regular Expressions", () => {
        test("Match string with string", async () => {
            const table = await perspective.table({
                a: "string",
                b: "string",
                c: "string",
            });

            table.update({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["ABC", "ad", "asudfh", "HIjK", "lMNoP"],
                c: [
                    "1234567890",
                    "123x4567",
                    "abcdefg123",
                    "4567123",
                    "1?2?3?",
                ],
            });

            const expressions = [
                `match("a", 'ABC')`,
                "match('aBc', '[aAbBcC]{3}')",
                `match("a", 'A')`,
                `match("c", '[0-9]{3}')`,
                `match("c", '4567')`,
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();
            expect(results[expressions[0]]).toEqual([
                true,
                false,
                false,
                false,
                false,
            ]);
            expect(results[expressions[1]]).toEqual(Array(5).fill(true));
            expect(results[expressions[2]]).toEqual([
                true,
                false,
                true,
                false,
                false,
            ]);
            expect(results[expressions[3]]).toEqual([
                true,
                true,
                true,
                true,
                false,
            ]);
            expect(results[expressions[4]]).toEqual([
                true,
                true,
                false,
                true,
                false,
            ]);

            await view.delete();
            await table.delete();
        });

        test("match_all string with string", async () => {
            const table = await perspective.table({
                a: "string",
                b: "string",
                c: "string",
            });

            table.update({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["ABC", "ad", "asudfh", "HIjK", "lMNoP"],
                c: ["1234567890", "123x4567", "abcdefg123", "4567123", "123"],
            });

            const expressions = [
                `match_all("a", 'ABC')`,
                "match_all('aBc', '[aAbBcC]{3}')",
                `match_all("a", 'A')`,
                `match_all("c", '[0-9]{3}')`,
                `match_all("c", '4567')`,
                `match_all("c", '4567123')`,
                `match_all("c", '[0-9]+')`,
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();
            expect(results[expressions[0]]).toEqual([
                true,
                false,
                false,
                false,
                false,
            ]);
            expect(results[expressions[1]]).toEqual(Array(5).fill(true));
            expect(results[expressions[2]]).toEqual(Array(5).fill(false));
            expect(results[expressions[3]]).toEqual([
                false,
                false,
                false,
                false,
                true,
            ]);
            expect(results[expressions[4]]).toEqual(Array(5).fill(false));
            expect(results[expressions[5]]).toEqual([
                false,
                false,
                false,
                true,
                false,
            ]);
            expect(results[expressions[6]]).toEqual([
                true,
                false,
                false,
                true,
                true,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Match string with bad regex should fail type-checking", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["ABC", "ad", "asudfh", "HIjK", "lMNoP"],
            });

            const expressions = [
                `match("a", '*.')`,
                "match('abc', '(?=a)')",
                `match("a", '?')`,
            ];

            const validated = await table.validate_expressions(expressions);
            expect(validated.expression_schema).toEqual({});

            for (const expr of expressions) {
                expect(validated.expression_schema[expr]).toBeUndefined();
                expect(validated.errors[expr]).toEqual({
                    line: 0,
                    column: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });
            }

            // Because a bad regex does not raise a parse error, it is still
            // valid to create a view from them.
            await expect(
                table.view({
                    expressions,
                })
            ).rejects.toThrow();

            await table.delete();
        });

        // I don't know what makes a parse error unique in the internal comment,
        // but `validate()` and `expression` shoul dbe identical in behavior.
        test.skip("OG - Match string with bad regex should fail type-checking", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["ABC", "ad", "asudfh", "HIjK", "lMNoP"],
            });

            const expressions = [
                `match("a", '*.')`,
                "match('abc', '(?=a)')",
                `match("a", '?')`,
            ];

            const validated = await table.validate_expressions(expressions);
            expect(validated.expression_schema).toEqual({});

            for (const expr of expressions) {
                expect(validated.expression_schema[expr]).toBeUndefined();
                expect(validated.errors[expr]).toEqual({
                    line: 0,
                    column: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });
            }

            // Because a bad regex does not raise a parse error, it is still
            // valid to create a view from them.
            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();
            const results = await view.to_columns();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
                expect(results[expr]).toEqual(Array(5).fill(null));
            }

            await view.delete();
            await table.delete();
        });

        test("match_all string with bad regex should fail type-checking", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["ABC", "ad", "asudfh", "HIjK", "lMNoP"],
            });

            const expressions = [
                `match_all("a", '*.')`,
                "match_all('abc', '(?=a)')",
                `match_all("a", '?')`,
                `match_all("a", '+.')`,
            ];

            const validated = await table.validate_expressions(expressions);
            expect(validated.expression_schema).toEqual({});

            for (const expr of expressions) {
                expect(validated.expression_schema[expr]).toBeUndefined();
                expect(validated.errors[expr]).toEqual({
                    line: 0,
                    column: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                });
            }

            await expect(
                table.view({
                    expressions,
                })
            ).rejects.toThrow();

            await table.delete();
        });

        test("Match should only work on strings", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["abc123", "abc567", "abc56", "1234567", "aaa000"],
            });

            const expressions = [
                `match("a", "b")`,
                `match("a", 123)`,
                `match(today(), '[a-z]{3}[0-9]{3}')`,
                `match(False, '[0-9]{7}')`,
            ];

            const validated = await table.validate_expressions(expressions);

            for (const expr of expressions) {
                expect(validated.expression_schema[expr]).toBeUndefined();
            }

            expect(validated.errors[expressions[0]].error_message).toEqual(
                "Failed parameter type check for function 'match', Expected 'TS' call set: 'TT'"
            );

            expect(validated.errors[expressions[1]].error_message).toEqual(
                "Failed parameter type check for function 'match', Expected 'TS' call set: 'TT'"
            );

            expect(validated.errors[expressions[2]]).toEqual({
                line: 0,
                column: 0,
                error_message:
                    "Type Error - inputs do not resolve to a valid expression.",
            });

            expect(validated.errors[expressions[3]]).toEqual({
                line: 0,
                column: 0,
                error_message:
                    "Type Error - inputs do not resolve to a valid expression.",
            });

            await table.delete();
        });

        test("match_all should only work on strings", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["abc123", "abc567", "abc56", "1234567", "aaa000"],
            });

            const expressions = [
                `match_all("a", "b")`,
                `match_all("a", 123)`,
                `match_all(today(), '[a-z]{3}[0-9]{3}')`,
                `match_all(False, '[0-9]{7}')`,
            ];

            const validated = await table.validate_expressions(expressions);

            for (const expr of expressions) {
                expect(validated.expression_schema[expr]).toBeUndefined();
            }

            expect(validated.errors[expressions[0]].error_message).toEqual(
                "Failed parameter type check for function 'match_all', Expected 'TS' call set: 'TT'"
            );

            expect(validated.errors[expressions[1]].error_message).toEqual(
                "Failed parameter type check for function 'match_all', Expected 'TS' call set: 'TT'"
            );

            expect(validated.errors[expressions[2]]).toEqual({
                line: 0,
                column: 0,
                error_message:
                    "Type Error - inputs do not resolve to a valid expression.",
            });

            expect(validated.errors[expressions[3]]).toEqual({
                line: 0,
                column: 0,
                error_message:
                    "Type Error - inputs do not resolve to a valid expression.",
            });

            await table.delete();
        });

        test("Match string with regex", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["abc123", "abc567", "abc56", "1234567", "aaa000"],
            });

            const expressions = [
                `match("a", '.*')`,
                `match("b", '[a-z]{3}[0-9]{3}')`,
                `match("b", '[0-9]{7}')`,
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();
            expect(results[expressions[0]]).toEqual(Array(5).fill(true));
            expect(results[expressions[1]]).toEqual([
                true,
                true,
                false,
                false,
                true,
            ]);
            expect(results[expressions[2]]).toEqual([
                false,
                false,
                false,
                true,
                false,
            ]);

            await view.delete();
            await table.delete();
        });

        test("match_all string with regex", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["abc123", "abc567", "abc56", "1234567", "aaa0001234"],
            });

            const expressions = [
                `match_all("a", '.*')`,
                `match_all("b", '[a-z]{3}[0-9]{3}')`,
                `match_all("b", '[0-9]{7}')`,
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();
            expect(results[expressions[0]]).toEqual(Array(5).fill(true));
            expect(results[expressions[1]]).toEqual([
                true,
                true,
                false,
                false,
                false,
            ]);
            expect(results[expressions[2]]).toEqual([
                false,
                false,
                false,
                true,
                false,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Match string with regex, randomized", async () => {
            const data = { a: [] };
            for (let i = 0; i < 500; i++) {
                data.a.push(random_string(100, true));
            }

            const table = await perspective.table(data);
            const expressions = [
                `match("a", '.*')`, // should match everything
                `match("a", '.{100}')`, // should match strings the size of max
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();
            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();
            for (let i = 0; i < 500; i++) {
                const a = results[expressions[0]][i];
                const b = results[expressions[1]][i];
                const source = data.a[i];
                if (source === null) {
                    expect(a).toEqual(null);
                    expect(b).toEqual(null);
                } else {
                    expect(a).toEqual(true);
                    expect(b).toEqual(source.length === 100);
                }
            }

            await view.delete();
            await table.delete();
        });

        test("match_all string with regex, randomized", async () => {
            const data = { a: [] };

            for (let i = 0; i < 500; i++) {
                data.a.push(random_string(100, true));
            }

            const table = await perspective.table(data);

            const expressions = [
                `match_all("a", '.*')`, // should match everything
                `match_all("a", '.{100}')`, // should match strings the size of max
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();

            for (let i = 0; i < 500; i++) {
                const a = results[expressions[0]][i];
                const b = results[expressions[1]][i];
                const source = data.a[i];

                if (source === null) {
                    expect(a).toEqual(null);
                    expect(b).toEqual(null);
                } else {
                    expect(a).toEqual(true);
                    expect(b).toEqual(source.length === 100);
                }
            }

            await view.delete();
            await table.delete();
        });

        test("Match string and null with regex", async () => {
            const table = await perspective.table({
                a: ["ABC", "abc", null, "AbC", "12345"],
            });
            const expressions = [
                `match("a", '.*')`,
                `match("a", '[aAbBcC]{3}')`,
                `match("a", '[0-9]{5}')`,
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();
            expect(results[expressions[0]]).toEqual([
                true,
                true,
                null,
                true,
                true,
            ]);
            expect(results[expressions[1]]).toEqual([
                true,
                true,
                null,
                true,
                false,
            ]);
            expect(results[expressions[2]]).toEqual([
                false,
                false,
                null,
                false,
                true,
            ]);

            await view.delete();
            await table.delete();
        });

        test("match_all string and null with regex", async () => {
            const table = await perspective.table({
                a: ["ABC", "abc", null, "AbC", "12345", "123456"],
            });

            const expressions = [
                `match_all("a", '.*')`,
                `match_all("a", '[aAbBcC]{3}')`,
                `match_all("a", '[0-9]{5}')`,
            ];

            const view = await table.view({
                expressions,
            });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("boolean");
            }

            const results = await view.to_columns();
            expect(results[expressions[0]]).toEqual([
                true,
                true,
                null,
                true,
                true,
                true,
            ]);
            expect(results[expressions[1]]).toEqual([
                true,
                true,
                null,
                true,
                false,
                false,
            ]);
            expect(results[expressions[2]]).toEqual([
                false,
                false,
                null,
                false,
                true,
                false,
            ]);

            await view.delete();
            await table.delete();
        });

        test("Search with string", async () => {
            const table = await perspective.table({
                a: ["ABC", "DEF", "cbA", "HIjK", "lMNoP"],
                b: ["abc123", "abc567", "DEF56", "1234567", "AAA000"],
            });

            const expressions = [
                `search("a", '(ABC)')`,
                `search("b", '(.*)')`,
                `search("a", '([A-Za-z]{3})')`,
                `search("b", '([A-Z]{3})')`,
                `search("b", '([0-9]{7})')`,
                `search("b", '([A-Za-z]{3})')`,
            ];

            const view = await table.view({ expressions });

            const schema = await view.expression_schema();

            for (const expr of expressions) {
                expect(schema[expr]).toEqual("string");
            }

            const results = await view.to_columns();

            expect(results[expressions[0]]).toEqual([
                "ABC",
                null,
                null,
                null,
                null,
            ]);
            expect(results[expressions[1]]).toEqual([
                "abc123",
                "abc567",
                "DEF56",
                "1234567",
                "AAA000",
            ]);
            expect(results[expressions[2]]).toEqual([
                "ABC",
                "DEF",
                "cbA",
                "HIj",
                "lMN",
            ]);
            expect(results[expressions[3]]).toEqual([
                null,
                null,
                "DEF",
                null,
                "AAA",
            ]);
            expect(results[expressions[4]]).toEqual([
                null,
                null,
                null,
                "1234567",
                null,
            ]);
            expect(results[expressions[5]]).toEqual([
                "abc",
                "abc",
                "DEF",
                null,
                "AAA",
            ]);

            await view.delete();
            await table.delete();
        });

        test("Search - extract email", async () => {
            const endings = ["com", "net", "org", "co.uk", "ie", "me", "io"];
            const valid_address_chars = ALPHANUMERIC + "._-";
            const get_data = (num_rows) => {
                const data = [];

                for (let i = 0; i < num_rows; i++) {
                    const email = `${random_string(
                        30,
                        false,
                        valid_address_chars
                    )}@${random_string(10, false, ALPHA)}.${randchoice(
                        endings
                    )}`;
                    data.push(email);
                }

                return data;
            };

            const table = await perspective.table({ a: get_data(100) });
            const expressions = [
                `// address
            search("a", '^([a-zA-Z0-9._-]+)@');`,
                `// domain
            search("a", '@([a-zA-Z.]+)$')`,
            ];

            // Make the same regex 10x - make sure it's ok to cache the regex
            for (let i = 0; i < 10; i++) {
                const view = await table.view({ expressions });
                const schema = await view.expression_schema();
                expect(schema).toEqual({
                    address: "string",
                    domain: "string",
                });

                const result = await view.to_columns();

                for (let i = 0; i < 100; i++) {
                    const source = result["a"][i];
                    const expected_address =
                        source.match(/^([a-zA-Z0-9._-]+)@/)[1];
                    const expected_domain = source.match(/@([a-zA-Z.]+)$/)[1];
                    expect(result["address"][i]).toEqual(expected_address);
                    expect(result["domain"][i]).toEqual(expected_domain);
                }

                await view.delete();
            }

            await table.delete();
        });

        test("Search - extract card number", async () => {
            const digits = () => {
                const output = [];
                for (let i = 0; i < 4; i++) {
                    output.push(randchoice(NUMERIC));
                }
                return output.join("");
            };

            const get_data = (num_rows) => {
                const data = [];

                for (let i = 0; i < num_rows; i++) {
                    const separator = Math.random() > 0.5 ? " " : "-";
                    const num = `${digits()}${separator}${digits()}${separator}${digits()}${separator}${digits()}`;
                    data.push(num);
                }

                return data;
            };

            const table = await perspective.table({ a: get_data(1000) });
            const parsed = `var parts[4];
            parts[0] := search("a", '^([0-9]{4})[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4}');
            parts[1] := search("a", '^[0-9]{4}[ -]([0-9]{4})[ -][0-9]{4}[ -][0-9]{4}');
            parts[2] := search("a", '^[0-9]{4}[ -][0-9]{4}[ -]([0-9]{4})[ -][0-9]{4}');
            parts[3] := search("a", '^[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -]([0-9]{4})');
            concat(parts[0], parts[1], parts[2], parts[3])`;

            const view = await table.view({
                expressions: { parsed },
            });
            const schema = await view.expression_schema();
            expect(schema).toEqual({ parsed: "string" });
            const result = await view.to_columns();

            for (let i = 0; i < 100; i++) {
                const source = result["a"][i];
                const expected = source.replace(/[ -]/g, "");
                expect(result.parsed[i]).toEqual(expected);
            }

            await view.delete();
            await table.delete();
        });

        test("Search local var", async () => {
            const digits = () => {
                const output = [];
                for (let i = 0; i < 4; i++) {
                    output.push(randchoice(NUMERIC));
                }
                return output.join("");
            };

            const get_data = (num_rows) => {
                const data = [];

                for (let i = 0; i < num_rows; i++) {
                    const separator = Math.random() > 0.5 ? " " : "-";
                    const num = `${digits()}${separator}${digits()}${separator}${digits()}${separator}${digits()}`;
                    data.push(num);
                }

                return data;
            };

            const table = await perspective.table({ a: get_data(1000) });
            const expression = `var parts[4];
            parts[0] := search("a", '^([0-9]{4})[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4}');
            parts[1] := search("a", '^[0-9]{4}[ -]([0-9]{4})[ -][0-9]{4}[ -][0-9]{4}');
            parts[2] := search("a", '^[0-9]{4}[ -][0-9]{4}[ -]([0-9]{4})[ -][0-9]{4}');
            parts[3] := search("a", '^[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -]([0-9]{4})');
            var z := parts[2];
            z`;

            const view = await table.view({
                expressions: { parsed: expression },
            });
            const schema = await view.expression_schema();
            expect(schema).toEqual({ parsed: "string" });
            const result = await view.to_columns();

            for (let i = 0; i < 100; i++) {
                const source = result["a"][i];
                const expected = source.replace(/[ -]/g, "");
                expect(result.parsed[i]).toEqual(expected.substring(8, 12));
            }

            await view.delete();
            await table.delete();
        });

        test("non strings should not work", async () => {
            const table = await perspective.table({
                x: [1, 2, 3],
                y: [100.5, 200.5, 300.5],
                z: [new Date(), new Date(), null],
            });

            const expressions = [];
            const cols = ["x", "y", "z"];
            const pattern = "(.*)";
            const fns = [
                "match",
                "match_all",
                "search",
                "indexof",
                "substring",
            ];

            for (const fn of fns) {
                for (const col of cols) {
                    let expr;

                    switch (fn) {
                        case "indexof":
                            {
                                expr = `var x[2]; indexof("${col}", '${pattern}', x);`;
                            }
                            break;
                        case "substring":
                            {
                                expr = `substring("${col}", 0)`;
                            }
                            break;
                        default:
                            {
                                expr = `${fn}("${col}", '${pattern}')`;
                            }
                            break;
                    }

                    expressions.push(expr);
                }
            }

            const validate = await table.validate_expressions(expressions);
            expect(validate.expression_schema).toEqual({});

            for (const expr of expressions) {
                expect(validate.errors[expr]).toEqual({
                    column: 0,
                    error_message:
                        "Type Error - inputs do not resolve to a valid expression.",
                    line: 0,
                });
            }

            await table.delete();
        });

        test("string literals should work", async () => {
            const table = await perspective.table({
                x: [1, 2, 3],
            });

            const expressions = [];
            const str = "abcdefghijklmn";
            const pattern = "(.*)";
            const fns = [
                "match",
                "match_all",
                "search",
                "indexof",
                "substring",
            ];

            const expected_schema = {};

            for (const fn of fns) {
                let expr;

                switch (fn) {
                    case "indexof":
                        {
                            expr = `var x[2]; indexof('${str}', '${pattern}', x);`;
                            expected_schema[expr] = "boolean";
                        }
                        break;
                    case "substring":
                        {
                            expr = `substring('${str}', 0)`;
                            expected_schema[expr] = "string";
                        }
                        break;
                    default:
                        {
                            expr = `${fn}('${str}', '${pattern}')`;
                            fn === "search"
                                ? (expected_schema[expr] = "string")
                                : (expected_schema[expr] = "boolean");
                        }
                        break;
                }

                expressions.push(expr);
            }

            const validate = await table.validate_expressions(expressions);
            expect(validate.expression_schema).toEqual(expected_schema);

            await table.delete();
        });

        test("Search - newlines", async () => {
            const table = await perspective.table({
                a: [
                    "abc\ndef",
                    "\n\n\n\nabc\ndef",
                    "abc\n\n\n\n\n\nabc\ndef\n\n\n\n",
                    null,
                    "def",
                ],
                b: [
                    "hello\tworld",
                    "\n\n\n\n\nhello\n\n\n\n\n\tworld",
                    "\tworld",
                    "world",
                    null,
                ],
            });
            const view = await table.view({
                expressions: {
                    c1: "search(\"a\", '(\ndef)')",
                    c2: "search(\"b\", '(\tworld)')",
                },
            });

            const schema = await view.expression_schema();
            expect(schema).toEqual({
                c1: "string",
                c2: "string",
            });

            const result = await view.to_columns();
            expect(result["c1"]).toEqual([
                "\ndef",
                "\ndef",
                "\ndef",
                null,
                null,
            ]);
            expect(result["c2"]).toEqual([
                "\tworld",
                "\tworld",
                "\tworld",
                null,
                null,
            ]);

            await view.delete();
            await table.delete();
        });

        test("indexof", async () => {
            const table = await perspective.table({
                x: "string",
                y: "string",
            });

            table.update({
                x: ["15 02 1997", "31 11 2021", "01 01 2020", "31 12 2029"],
                y: ["$300", "$123.58", "$0.99", "$1.99"],
            });

            const expressions = {
                "parsed date": `var year_vec[2];
            indexof("x", '([0-9]{4})$', year_vec);
            year_vec[1] - year_vec[0];
            `,
                "parsed date2": `var year_vec[2];
            indexof("x", '([0-9]{4})$', year_vec);
            `,
                "parsed dollars":
                    "var dollar_vec[2];indexof(\"y\", '^[$]([0-9.]+)', dollar_vec); dollar_vec[0] + dollar_vec[1];",
            };

            const view = await table.view({ expressions });
            const schema = await view.expression_schema();
            expect(schema).toEqual({
                "parsed date": "float",
                "parsed date2": "boolean",
                "parsed dollars": "float",
            });

            const result = await view.to_columns();
            expect(result["parsed date"]).toEqual(Array(4).fill(3));
            expect(result["parsed date2"]).toEqual(Array(4).fill(true));
            expect(result["parsed dollars"]).toEqual([4, 7, 5, 5]);

            await view.delete();
            await table.delete();
        });

        test("indexof various vectors", async () => {
            const table = await perspective.table({
                x: "string",
                y: "string",
            });

            table.update({
                x: ["15 02 1997", "31 11 2021", "01 01 2020", "31 12 2029"],
                y: ["$300", "$123.58", "$0.99", "$1.99"],
            });

            const expressions = {
                "parsed date": `var year_vec[1]; // vector too small
            indexof("x", '([0-9]{4})$', year_vec);
            `,
                "parsed date2": `var year_vec[2];
            indexof("x", '([a-z])', year_vec); // should not match
            `,
                "parsed dollars":
                    "var dollar_vec[2] := {100, 200};indexof(\"y\", '^[$]([0-9.]+)', dollar_vec); dollar_vec[0] + dollar_vec[1];",
                "parsed dollars2": `var dollar_vec[2] := {100, 200};
            indexof("y", '^([a-z])', dollar_vec); // should not match
            dollar_vec[0] + dollar_vec[1]; // should not overwrite vector
            `,
            };

            const view = await table.view({ expressions });
            const schema = await view.expression_schema();
            expect(schema).toEqual({
                "parsed date": "boolean",
                "parsed date2": "boolean",
                "parsed dollars": "float",
                "parsed dollars2": "float",
            });

            const result = await view.to_columns();
            expect(result["parsed date"]).toEqual(Array(4).fill(null));
            expect(result["parsed date2"]).toEqual(Array(4).fill(false));
            expect(result["parsed dollars"]).toEqual([4, 7, 5, 5]);
            expect(result["parsed dollars2"]).toEqual(Array(4).fill(300));

            await view.delete();
            await table.delete();
        });

        test("indexof and substr", async () => {
            const table = await perspective.table({
                x: "string",
                y: "string",
            });

            table.update({
                x: ["15 02 1997", "31 11 2021", "01 01 2020", "31 12 2029"],
                y: ["$300", "$123.58", "$0.99", "$1.99"],
            });

            const expressions = [
                `// year
            var year_vec[2];
            indexof("x", '([0-9]{4})$', year_vec);
            var start := year_vec[0];
            var len := year_vec[1] - start + 1;
            substring("x", start, len);`,
                `// year int
            var year_vec[2];
            indexof("x", '([0-9]{4})$', year_vec);
            var start := year_vec[0];
            var len := year_vec[1] - start + 1;
            integer(substring("x", start, len));`,
                `// dollars
            var out[2];
            indexof("y", '^[$]([0-9.]+)', out);
            substring("y", out[0], out[1] - out[0] + 1)`,
                `// dollars float
            var out[2];
            indexof("y", '^[$]([0-9.]+)', out);
            float(substring("y", out[0], out[1] - out[0] + 1))`,
            ];

            const view = await table.view({ expressions });
            const schema = await view.expression_schema();
            expect(schema).toEqual({
                year: "string",
                "year int": "integer",
                dollars: "string",
                "dollars float": "float",
            });

            const result = await view.to_columns();

            expect(result.year).toEqual(["1997", "2021", "2020", "2029"]);
            expect(result["year int"]).toEqual([1997, 2021, 2020, 2029]);
            expect(result.dollars).toEqual(["300", "123.58", "0.99", "1.99"]);
            expect(result["dollars float"]).toEqual([300, 123.58, 0.99, 1.99]);

            await view.delete();
            await table.delete();
        });

        test("substr with invalid indices", async () => {
            const table = await perspective.table({
                x: ["abc, def, efg", "abcdef", null, "", "12345678"],
                y: ["abc", "abc", "abc", "abc", "abc"],
            });
            const view = await table.view({
                expressions: [
                    "substring('abcdef', 0)",
                    "substring('abcdef', 3)",
                    'substring("x", 3)',
                    'substring("x", -1)',
                    'substring("x", 1, 10000)',
                    'substring("x", 10000)',
                    'substring("x", 5, 4)',
                    'substring("y", 0, 3)',
                    'substring("y", 0)',
                    'substring("y", 1, 2)',
                    'substring("y", 2, 2)',
                    'substring("y", 1, 1)',
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });
            const results = await view.to_columns();
            expect(results["substring('abcdef', 0)"]).toEqual(
                Array(5).fill("abcdef")
            );
            expect(results["substring('abcdef', 3)"]).toEqual(
                Array(5).fill("def")
            );
            expect(results['substring("x", 3)']).toEqual([
                ", def, efg",
                "def",
                null,
                null,
                "45678",
            ]);
            expect(results['substring("y", 0, 3)']).toEqual(
                Array(5).fill("abc")
            );
            expect(results['substring("y", 1, 2)']).toEqual(
                Array(5).fill("bc")
            );
            expect(results['substring("y", 0)']).toEqual(results["y"]);
            expect(results['substring("y", 2, 2)']).toEqual(
                Array(5).fill(null)
            );
            expect(results['substring("y", 1, 1)']).toEqual(Array(5).fill("b"));
            expect(results['substring("x", -1)']).toEqual(Array(5).fill(null));
            expect(results['substring("x", 1, 10000)']).toEqual(
                Array(5).fill(null)
            );
            expect(results['substring("x", 10000)']).toEqual(
                Array(5).fill(null)
            );
            expect(results['substring("x", 5, 4)']).toEqual([
                "def,",
                null,
                null,
                null,
                null,
            ]);

            // substring() with invalid indices will pass type checking but
            // will return null.
            const validate = await table.validate_expressions([
                'substring("x", -1)',
                'substring("x", 1, 10000)',
                'substring("x", 10000)',
                'substring("x", 5, 4)',
            ]);

            expect(validate.expression_schema).toEqual({
                'substring("x", -1)': "string",
                'substring("x", 1, 10000)': "string",
                'substring("x", 10000)': "string",
                'substring("x", 5, 4)': "string",
            });

            expect(validate.errors).toEqual({});

            await view.delete();
            await table.delete();
        });

        test("substr with partial update", async () => {
            const table = await perspective.table(
                {
                    x: ["abc, def, efg", "abcdef", null, "", "12345678"],
                    y: [1, 2, 3, 4, 5],
                },
                { index: "y" }
            );

            const view = await table.view({
                expressions: {
                    'substring("x", 3)': 'substring("x", 3)',
                    'substring("x", 1, 2)': 'substring("x", 1, 2)',
                },
            });

            let results = await view.to_columns();
            expect(results['substring("x", 3)']).toEqual([
                ", def, efg",
                "def",
                null,
                null,
                "45678",
            ]);

            expect(results['substring("x", 1, 2)']).toEqual([
                "bc",
                "bc",
                null,
                null,
                "23",
            ]);

            table.update({
                x: ["new string", null, "abc"],
                y: [3, 1, 5],
            });

            results = await view.to_columns();

            expect(results['substring("x", 3)']).toEqual([
                null,
                "def",
                " string",
                null,
                null,
            ]);
            expect(results['substring("x", 1, 2)']).toEqual([
                null,
                "bc",
                "ew",
                null,
                "bc",
            ]);

            table.update({
                x: ["1234", "1234", "1234", "1234", "1234"],
                y: [5, 4, 3, 2, 1],
            });

            results = await view.to_columns();

            expect(results['substring("x", 3)']).toEqual([
                "4",
                "4",
                "4",
                "4",
                "4",
            ]);

            expect(results['substring("x", 1, 2)']).toEqual([
                "23",
                "23",
                "23",
                "23",
                "23",
            ]);

            await view.delete();
            await table.delete();
        });

        test("substr with clear", async () => {
            const table = await perspective.table({
                x: ["abc, def, efg", "abcdef", null, "", "12345678"],
            });

            const view = await table.view({
                expressions: {
                    'substring("x", 3)': 'substring("x", 3)',
                    'substring("x", 1, 2)': 'substring("x", 1, 2)',
                },
            });

            let results = await view.to_columns();
            expect(results['substring("x", 3)']).toEqual([
                ", def, efg",
                "def",
                null,
                null,
                "45678",
            ]);

            expect(results['substring("x", 1, 2)']).toEqual([
                "bc",
                "bc",
                null,
                null,
                "23",
            ]);

            await view.delete();
            await table.clear();

            expect(await table.size()).toEqual(0);

            table.update({
                x: ["new string", null, "abc"],
            });

            const view2 = await table.view({
                expressions: {
                    'substring("x", 3)': 'substring("x", 3)',
                    'substring("x", 1, 2)': 'substring("x", 1, 2)',
                },
            });
            results = await view2.to_columns();

            expect(results['substring("x", 3)']).toEqual([
                " string",
                null,
                null,
            ]);

            await view2.delete();
            await table.delete();
        });

        test("substr more invalid indices", async () => {
            const table = await perspective.table(
                {
                    x: ["abc, def, efg", "abcdef", null, "", "12345678"],
                    y: [1, 2, 3, 4, 5],
                },
                { index: "y" }
            );

            const view = await table.view({
                expressions: [
                    'substring("x", 100)',
                    'substring("x", 1, 300)',
                    'substring("x", -100)',
                ].reduce((x, y) => Object.assign(x, { [y]: y }), {}),
            });

            let results = await view.to_columns();

            expect(results['substring("x", 100)']).toEqual(Array(5).fill(null));
            expect(results['substring("x", 1, 300)']).toEqual(
                Array(5).fill(null)
            );
            expect(results['substring("x", -100)']).toEqual(
                Array(5).fill(null)
            );

            table.remove([1, 2, 3, 4, 5]);

            const str = Array(100).fill("abcde").join("");
            table.update({
                x: [str],
                y: [1],
            });

            results = await view.to_columns();
            expect(results['substring("x", 100)']).toEqual([
                str.substring(100),
            ]);
            expect(results['substring("x", 1, 300)']).toEqual([
                str.substr(1, 300),
            ]);
            expect(results['substring("x", -100)']).toEqual(
                Array(1).fill(null)
            );

            await view.delete();
            await table.delete();
        });

        test("substring - extract email", async () => {
            const endings = ["com", "net", "org", "co.uk", "ie", "me", "io"];
            const valid_address_chars = ALPHANUMERIC + "._-";
            const get_data = (num_rows) => {
                const data = [];

                for (let i = 0; i < num_rows; i++) {
                    const email = `${random_string(
                        30,
                        false,
                        valid_address_chars
                    )}@${random_string(10, false, ALPHA)}.${randchoice(
                        endings
                    )}`;
                    data.push(email);
                }

                return data;
            };

            const table = await perspective.table({ a: get_data(100) });
            const expressions = [
                `// ending
            var domain := search(\"a\", '@([a-zA-Z.]+)$');
            var len := length(domain);
            if (len > 0 and is_not_null(domain)) {
                search(domain, '[.](.*)$');
            } else {
                'not found';
            }`,
            ];

            // Make the same regex 10x - make sure it's ok to cache the regex
            for (let i = 0; i < 10; i++) {
                const view = await table.view({ expressions });
                const schema = await view.expression_schema();
                expect(schema).toEqual({
                    ending: "string",
                });

                const result = await view.to_columns();

                for (let i = 0; i < 100; i++) {
                    const source = result["a"][i];
                    const domain = source.match(/@([a-zA-Z.]+)$/)[1];
                    const ending = domain.match(/[.](.*)$/)[1];
                    expect(result["ending"][i]).toEqual(ending);
                }

                await view.delete();
            }

            await table.delete();
        });

        test("replace", async () => {
            const digits = () => {
                const output = [];
                for (let i = 0; i < 4; i++) {
                    output.push(randchoice(NUMERIC));
                }
                return output.join("");
            };

            const data = [];
            const index = [];

            for (let i = 0; i < 1000; i++) {
                const separator = Math.random() > 0.5 ? " " : "-";
                const num = `${digits()}${separator}${digits()}${separator}${digits()}${separator}${digits()}`;
                data.push(num);
                index.push(i);
            }

            const table = await perspective.table({ a: "string", b: "string" });
            table.update({ a: data, b: index });
            const expressions = {
                [`w`]: `replace('abc-def-hijk', '-', '')`,
                [`x`]: `replace("a", '[0-9]{4}$', "b")`,
                [`y`]: `replace("a", '[a-z]{4}$', "b")`,
                [`z`]: `var x := 'long string, very cool!'; replace("a", '^[0-9]{4}', x)`,
            };
            const validate = await table.validate_expressions(expressions);
            expect(validate.expression_schema).toEqual({
                w: "string",
                x: "string",
                y: "string",
                z: "string",
            });

            const view = await table.view({ expressions });
            const result = await view.to_columns();

            for (let i = 0; i < 100; i++) {
                const source = result["a"][i];
                const idx = result["b"][i];
                expect(result["w"][i]).toEqual("abcdef-hijk");
                expect(result["x"][i]).toEqual(
                    source.replace(/[0-9]{4}$/, idx)
                );
                expect(result["y"][i]).toEqual(source);
                expect(result["z"][i]).toEqual(
                    source.replace(/^[0-9]{4}/, "long string, very cool!")
                );
            }

            await view.delete();
            await table.delete();
        });

        test("replace invalid", async () => {
            const table = await perspective.table({ a: "string", b: "string" });

            const expressions = {
                [`v`]: `replace('abc-def-hijk', '-', 123)`,
                [`w`]: `replace('', '-', today())`,
                [`x`]: `replace("a", '[0-9]{4}$', today())`,
                [`y`]: `replace("a", '[a-z]{4}$', null)`,
                [`z`]: `var x := 123; replace("a", '^[0-9]{4}', x)`,
            };
            const validate = await table.validate_expressions(expressions);
            expect(validate.expression_schema).toEqual({});

            await table.delete();
        });

        test("replace all", async () => {
            const digits = () => {
                const output = [];
                for (let i = 0; i < 4; i++) {
                    output.push(randchoice(NUMERIC));
                }
                return output.join("");
            };

            const data = [];
            const index = [];

            for (let i = 0; i < 1000; i++) {
                const separator = Math.random() > 0.5 ? " " : "-";
                const num = `${digits()}${separator}${digits()}${separator}${digits()}${separator}${digits()}`;
                data.push(num);
                index.push(i);
            }

            const table = await perspective.table({ a: "string", b: "string" });
            table.update({ a: data, b: index });
            const expressions = {
                [`w`]: `replace_all('abc-def-hijk', '-', '')`,
                [`x`]: `replace_all("a", '[0-9]{4}', "b")`,
                [`y`]: `replace_all("a", '[a-z]{4}', "b")`,
                [`z`]: `var x := 'long string, very cool!'; replace_all("a", '[0-9]{4}', x)`,
            };
            const validate = await table.validate_expressions(expressions);
            expect(validate.expression_schema).toEqual({
                w: "string",
                x: "string",
                y: "string",
                z: "string",
            });

            const view = await table.view({ expressions });
            const result = await view.to_columns();

            for (let i = 0; i < 100; i++) {
                const source = result["a"][i];
                const idx = result["b"][i];
                expect(result["w"][i]).toEqual("abcdefhijk");
                expect(result["x"][i]).toEqual(
                    source.replace(/[0-9]{4}/g, () => idx)
                );
                expect(result["y"][i]).toEqual(source);
                expect(result["z"][i]).toEqual(
                    source.replace(/[0-9]{4}/g, () => "long string, very cool!")
                );
            }

            await view.delete();
            await table.delete();
        });

        test("replace all invalid", async () => {
            const table = await perspective.table({ a: "string", b: "string" });

            const expressions = {
                [`v`]: `replace_all('abc-def-hijk', '-', 123)`,
                [`w`]: `replace_all('', '-', today())`,
                [`x`]: `replace_all("a", '[0-9]{4}$', today())`,
                [`y`]: `replace_all("a", '[a-z]{4}$', null)`,
                [`z`]: `var x := 123; replace_all("a", '^[0-9]{4}', x)`,
            };
            const validate = await table.validate_expressions(expressions);
            expect(validate.expression_schema).toEqual({});

            await table.delete();
        });
    });
})(perspective);
