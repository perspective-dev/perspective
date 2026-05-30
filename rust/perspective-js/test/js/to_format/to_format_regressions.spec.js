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

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import * as fs from "node:fs";

const superstore_uncompressed = fs.readFileSync(
    require.resolve("superstore-arrow/superstore.arrow"),
).buffer;

const superstore_lz4 = fs.readFileSync(
    require.resolve("superstore-arrow/superstore.lz4.arrow"),
).buffer;

test.describe("to_format regressions", function () {
    test("start_col is respected", async () => {
        let table = await perspective.table(superstore_uncompressed.slice());
        let view = await table.view({
            group_by: ["State"],
            split_by: ["Sub-Category"],
            // sort: [["Customer Name", "desc"]],
            group_rollup_mode: "rollup",
            columns: ["Sales", "Quantity", "Discount", "Profit"],
        });

        const result1 = await view.to_columns({ start_col: 4, end_row: 1 });
        const result2 = await view.to_columns({ start_col: 5, end_row: 1 });

        expect(result1).not.toEqual(result2);
    });

    test("start_col is respected with sort", async () => {
        let table = await perspective.table(superstore_uncompressed.slice());
        let view = await table.view({
            group_by: ["State"],
            split_by: ["Sub-Category"],
            sort: [["Customer Name", "desc"]],
            group_rollup_mode: "rollup",
            columns: ["Sales", "Quantity", "Discount", "Profit"],
        });

        const result1 = await view.to_columns({ start_col: 4, end_row: 1 });
        const result2 = await view.to_columns({ start_col: 5, end_row: 1 });

        expect(result1).not.toEqual(result2);
    });
});
