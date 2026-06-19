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

import * as arrow from "apache-arrow";
import { test, expect } from "@perspective-dev/test";
import perspective from "../perspective_client";
import * as fs from "node:fs";

import * as url from "node:url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

test.describe("Arrow", function () {
    test.describe("Date columns", function () {
        // https://github.com/perspective-dev/perspective/issues/2894
        // https://github.com/jdangerx/repro-perspective-float-filter/tree/dates
        test("Date columns are preserved through Arrow in and out", async function () {
            const tableData = arrow.tableFromArrays({
                date: arrow.vectorFromArray([20089], new arrow.Date_()),
            });

            const table = await perspective.table(arrow.tableToIPC(tableData));
            const view = await table.view();
            const json = await view.to_json();

            const d = new Date(json[0].date);
            expect(json[0].date).toEqual(1735689600000);

            // This doesn't test anything except my math
            expect(d.getUTCFullYear()).toEqual(2025);
            expect(d.getUTCDate()).toEqual(1);
            expect(d.getUTCMonth()).toEqual(0);
            expect(d.getUTCHours()).toEqual(0);
            expect(d.getUTCMinutes()).toEqual(0);
            expect(d.getUTCSeconds()).toEqual(0);
            expect(d.getTimezoneOffset()).toEqual(0);
            await view.delete();
            await table.delete();
        });

        test("Date columns are preserved through Arrow in and out, in a negative timezone", async function () {
            process.env.TZ = `America/New_York`;
            const tableData = arrow.tableFromArrays({
                date: arrow.vectorFromArray([20089], new arrow.Date_()),
            });

            const table = await perspective.table(arrow.tableToIPC(tableData));
            const view = await table.view();
            const json = await view.to_json();

            const d = new Date(json[0].date);
            expect(json[0].date).toEqual(1735689600000);
            expect(d.getUTCFullYear()).toEqual(2025);
            expect(d.getUTCDate()).toEqual(1);
            expect(d.getUTCMonth()).toEqual(0);
            expect(d.getUTCHours()).toEqual(0);
            expect(d.getUTCMinutes()).toEqual(0);
            expect(d.getUTCSeconds()).toEqual(0);

            // NY now ...
            expect(d.getTimezoneOffset()).toEqual(300);
            await view.delete();
            await table.delete();
            process.env.TZ = `UTC`;
        });
    });

    test.describe("regressions", () => {
        // https://github.com/perspective-dev/perspective/issues/3169
        test("null values are preserved across multi-batch Arrow IPC streams", async function () {
            function row(
                identifier: string,
                value: number | null,
                date: Date | null,
            ) {
                return arrow.tableFromArrays({
                    Identifier: arrow.vectorFromArray(
                        [identifier],
                        new arrow.Utf8(),
                    ),
                    Value: arrow.vectorFromArray([value], new arrow.Float64()),
                    Date: arrow.vectorFromArray([date], new arrow.DateDay()),
                });
            }

            const t1 = row("A", null, null);
            const t2 = row("B", 5, null);
            const t3 = row("C", null, new Date(Date.UTC(2025, 5, 15)));

            const multiBatchTable = new arrow.Table([
                ...t1.batches,
                ...t2.batches,
                ...t3.batches,
            ]);
            expect(multiBatchTable.batches.length).toEqual(3);

            const ipc = arrow.tableToIPC(multiBatchTable, "stream");
            const table = await perspective.table(ipc.buffer as ArrayBuffer);
            const view = await table.view();
            const json = await view.to_json();
            await view.delete();
            await table.delete();

            expect(json).toStrictEqual([
                { Identifier: "A", Value: null, Date: null },
                { Identifier: "B", Value: 5, Date: null },
                { Identifier: "C", Value: null, Date: 1749945600000 },
            ]);
        });

        test("null equality works correctly in updates", async function () {
            async function write_to_json(
                buffer: ArrayBuffer,
                filename: string,
            ) {
                const table = await perspective.table(buffer);
                const view = await table.view({
                    columns: ["ENTITY_TYPE"],
                });

                const json = await view.to_columns_string();
                fs.writeFileSync(filename, json);
                await view.delete();
                await table.delete();
            }

            const file = JSON.parse(
                fs.readFileSync(
                    `${__dirname}/../../arrow/untitled.json`,
                    "utf8",
                ),
            );

            const table = await perspective.table(file, {
                name: "arrow_null_test",
            });

            const view = await table.view({ group_by: ["ENTITY_TYPE"] });
            for (let i = 2; i < 6; i++) {
                const file = JSON.parse(
                    fs.readFileSync(
                        `${__dirname}/../../arrow/untitled${i}.json`,
                        "utf8",
                    ),
                );

                await table.update(file);
            }

            const cols = await view.to_columns({ end_row: 4 });
            expect(cols).toStrictEqual({
                ENTITY_TYPE: [2158, 985, 168, 311],
                __ROW_PATH__: [[], [null], [""], ["AAAA"]],
            });
        });

        test("Loads a time32 (millisecond) column without overflow", async function () {
            const expected = Array.from({ length: 64 }, (_, i) => i);
            const tableData = arrow.tableFromArrays({
                t: arrow.vectorFromArray(expected, new arrow.TimeMillisecond()),
            });

            const table = await perspective.table(arrow.tableToIPC(tableData));
            const view = await table.view();
            expect(await table.size()).toEqual(64);
            expect(await view.to_columns()).toEqual({ t: expected });
            await view.delete();
            await table.delete();
        });
    });

    test.describe("Malformed input", function () {
        test("Rejects an Arrow with a row count that exceeds 32 bits", async function () {
            const bytes = new Uint8Array(
                fs.readFileSync(`${__dirname}/../../arrow/bad_row_count.arrow`),
            );
            await expect(perspective.table(bytes)).rejects.toThrow(
                /row count exceeds maximum supported size/,
            );
        });
    });
});
