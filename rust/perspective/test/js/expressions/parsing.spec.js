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
 * Tests the correctness of each datetime computation function in various
 * environments and parameters - different types, nulls, undefined, etc.
 */
((perspective) => {
    test.describe("bucket() function", function () {
        test.describe("parses arguments separated by arbitrary whitespace", function () {
            for (const [title, expression] of [
                ["space before", `bucket( "a",'Y')`],
                ["space after", `bucket("a",'Y' )`],
                ["space between", `bucket("a", 'Y')`],
                ["two spaces before", `bucket(  "a",'Y')`],
                ["two spaces after", `bucket("a",'Y'  )`],
                ["two spaces between", `bucket("a",  'Y')`],
                ["space before between and after", `bucket( "a", 'Y' )`],
                [
                    "two spaces before between and after",
                    `bucket(  "a",  'Y'  )`,
                ],
            ]) {
                test(title, async function () {
                    const table = await perspective.table({
                        a: "datetime",
                    });

                    const view = await table.view({
                        expressions: [expression].reduce(
                            (x, y) => Object.assign(x, { [y]: y }),
                            {}
                        ),
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
                        result[expression].map((x) => (x ? new Date(x) : null))
                    ).toEqual(result.a.map((x) => common.year_bucket(x)));

                    view.delete();
                    table.delete();
                });
            }
        });
    });
})(perspective);
