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

import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

import * as duckdb from "@duckdb/duckdb-wasm";

import { test, expect } from "@perspective-dev/test";
import {
    default as perspective,
    createMessageHandler,
    wasmModule,
} from "@perspective-dev/client";
import { DuckDBHandler } from "@perspective-dev/client/src/ts/virtual_servers/duckdb.ts";

const require = createRequire(import.meta.url);
const DUCKDB_DIST = path.dirname(require.resolve("@duckdb/duckdb-wasm"));
const Worker = require("web-worker");

async function initializeDuckDB() {
    const bundle = await duckdb.selectBundle({
        mvp: {
            mainModule: path.resolve(DUCKDB_DIST, "./duckdb-mvp.wasm"),
            mainWorker: path.resolve(
                DUCKDB_DIST,
                "./duckdb-node-mvp.worker.cjs",
            ),
        },
        eh: {
            mainModule: path.resolve(DUCKDB_DIST, "./duckdb-eh.wasm"),
            mainWorker: path.resolve(
                DUCKDB_DIST,
                "./duckdb-node-eh.worker.cjs",
            ),
        },
    });

    const logger = new duckdb.ConsoleLogger();
    const worker = new Worker(bundle.mainWorker);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const c = await db.connect();
    await c.query(`
        SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;
    `);

    return c;
}

async function loadSuperstoreData(db) {
    const arrowPath = path.resolve(
        import.meta.dirname,
        "../../node_modules/superstore-arrow/superstore.lz4.arrow",
    );

    const arrayBuffer = fs.readFileSync(arrowPath);
    await db.insertArrowFromIPCStream(new Uint8Array(arrayBuffer), {
        name: "superstore",
        create: true,
    });
}

test.describe("DuckDB Virtual Server", function () {
    let db;
    let client;

    test.beforeAll(async () => {
        db = await initializeDuckDB();
        const server = createMessageHandler(new DuckDBHandler(db, wasmModule));
        client = await perspective.worker(server);
        await loadSuperstoreData(db);
    });

    test.describe("client", () => {
        test("get_hosted_table_names()", async function () {
            const tables = await client.get_hosted_table_names();
            expect(tables).toContain("superstore");
        });
    });

    test.describe("table", () => {
        test("schema()", async function () {
            const table = await client.open_table("superstore");
            const schema = await table.schema();
            expect(schema).toHaveProperty("Sales");
            expect(schema).toHaveProperty("Profit");
            expect(schema).toHaveProperty("State");
            expect(schema).toHaveProperty("Quantity");
            expect(schema).toHaveProperty("Discount");
        });

        test("schema() returns correct types", async function () {
            const table = await client.open_table("superstore");
            const schema = await table.schema();
            expect(schema["Sales"]).toBe("float");
            expect(schema["Profit"]).toBe("float");
            expect(schema["Quantity"]).toBe("integer");
            expect(schema["State"]).toBe("string");
            expect(schema["Order Date"]).toBe("date");
        });

        test("columns()", async function () {
            const table = await client.open_table("superstore");
            const columns = await table.columns();
            expect(columns).toContain("Sales");
            expect(columns).toContain("Profit");
            expect(columns).toContain("State");
            expect(columns).toContain("Region");
            expect(columns).toContain("Category");
        });

        test("size()", async function () {
            const table = await client.open_table("superstore");
            const size = await table.size();
            expect(size).toBe(9994);
        });
    });

    test.describe("view", () => {
        test("num_rows()", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({ columns: ["Sales", "Profit"] });
            const numRows = await view.num_rows();
            expect(numRows).toBe(9994);
            await view.delete();
        });

        test("num_columns()", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Profit", "State"],
            });

            const numColumns = await view.num_columns();
            expect(numColumns).toBe(3);
            await view.delete();
        });

        test("schema()", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Profit", "State"],
            });
            const schema = await view.schema();
            expect(schema).toEqual({
                Sales: "float",
                Profit: "float",
                State: "string",
            });
            await view.delete();
        });

        test("to_json()", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
            });
            const json = await view.to_json({ start_row: 0, end_row: 3 });
            expect(json.length).toBe(3);
            expect(json[0]).toHaveProperty("Sales");
            expect(json[0]).toHaveProperty("Quantity");
            await view.delete();
        });

        test("to_columns()", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
            });
            const columns = await view.to_columns({
                start_row: 0,
                end_row: 3,
            });
            expect(columns).toHaveProperty("Sales");
            expect(columns).toHaveProperty("Quantity");
            expect(columns["Sales"].length).toBe(3);
            expect(columns["Quantity"].length).toBe(3);
            await view.delete();
        });

        test("column_paths()", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Profit", "State"],
            });
            const paths = await view.column_paths();
            expect(paths).toEqual(["Sales", "Profit", "State"]);
            await view.delete();
        });
    });

    test.describe("group_by", () => {
        test("single group_by", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Region"],
                aggregates: { Sales: "sum" },
            });
            const numRows = await view.num_rows();
            expect(numRows).toBe(5); // 4 regions + 1 total row
            const json = await view.to_json();
            expect(json[0]).toHaveProperty("__ROW_PATH__");
            expect(json[0]["__ROW_PATH__"]).toEqual([]);
            await view.delete();
        });

        test("multi-level group_by", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Region", "Category"],
                aggregates: { Sales: "sum" },
            });
            const json = await view.to_json();
            // First row should be total
            expect(json[0]["__ROW_PATH__"]).toEqual([]);
            // Should have region-level rows and region+category rows
            const regionRows = json.filter(
                (row) => row["__ROW_PATH__"].length === 1,
            );
            expect(regionRows.length).toBe(4); // 4 regions
            await view.delete();
        });

        test("group_by with count aggregate", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Region"],
                aggregates: { Sales: "count" },
            });
            const json = await view.to_json();
            // Total count should be 9994
            expect(json[0]["Sales"]).toBe(9994);
            await view.delete();
        });

        test("group_by with avg aggregate", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Category"],
                aggregates: { Sales: "avg" },
            });
            const json = await view.to_json();
            expect(json.length).toBe(4); // 3 categories + total
            // Each row should have an average value
            for (const row of json) {
                expect(typeof row["Sales"]).toBe("number");
            }
            await view.delete();
        });

        test("group_by with min aggregate", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Quantity"],
                group_by: ["Region"],
                aggregates: { Quantity: "min" },
            });
            const json = await view.to_json();
            for (const row of json) {
                expect(typeof row["Quantity"]).toBe("number");
            }
            await view.delete();
        });

        test("group_by with max aggregate", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Quantity"],
                group_by: ["Region"],
                aggregates: { Quantity: "max" },
            });
            const json = await view.to_json();
            for (const row of json) {
                expect(typeof row["Quantity"]).toBe("number");
            }
            await view.delete();
        });
    });

    test.describe.skip("split_by", () => {
        test("single split_by", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                split_by: ["Region"],
                group_by: ["Category"],
                aggregates: { Sales: "sum" },
            });

            const columns = await view.column_paths();
            // Should have columns for each region
            expect(columns.some((c) => c.includes("Central"))).toBe(true);
            expect(columns.some((c) => c.includes("East"))).toBe(true);
            expect(columns.some((c) => c.includes("South"))).toBe(true);
            expect(columns.some((c) => c.includes("West"))).toBe(true);
            await view.delete();
        });

        test("split_by without group_by", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                split_by: ["Category"],
            });
            const paths = await view.column_paths();
            expect(paths.some((c) => c.includes("Furniture"))).toBe(true);
            expect(paths.some((c) => c.includes("Office Supplies"))).toBe(true);
            expect(paths.some((c) => c.includes("Technology"))).toBe(true);
            await view.delete();
        });
    });

    test.describe("filter", () => {
        test("filter with equals", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Region"],
                filter: [["Region", "==", "West"]],
            });
            const json = await view.to_json();
            for (const row of json) {
                expect(row["Region"]).toBe("West");
            }
            await view.delete();
        });

        test("filter with not equals", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Region"],
                filter: [["Region", "!=", "West"]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            for (const row of json) {
                expect(row["Region"]).not.toBe("West");
            }
            await view.delete();
        });

        test("filter with greater than", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
                filter: [["Quantity", ">", 5]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            for (const row of json) {
                expect(row["Quantity"]).toBeGreaterThan(5);
            }
            await view.delete();
        });

        test("filter with less than", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
                filter: [["Quantity", "<", 3]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            for (const row of json) {
                expect(row["Quantity"]).toBeLessThan(3);
            }
            await view.delete();
        });

        test("filter with greater than or equal", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
                filter: [["Quantity", ">=", 10]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            for (const row of json) {
                expect(row["Quantity"]).toBeGreaterThanOrEqual(10);
            }
            await view.delete();
        });

        test("filter with less than or equal", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
                filter: [["Quantity", "<=", 2]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            for (const row of json) {
                expect(row["Quantity"]).toBeLessThanOrEqual(2);
            }
            await view.delete();
        });

        test("filter with LIKE", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "State"],
                filter: [["State", "LIKE", "Cal%"]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            for (const row of json) {
                expect(row["State"].startsWith("Cal")).toBe(true);
            }
            await view.delete();
        });

        test("multiple filters", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Region", "Quantity"],
                filter: [
                    ["Region", "==", "West"],
                    ["Quantity", ">", 3],
                ],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            for (const row of json) {
                expect(row["Region"]).toBe("West");
                expect(row["Quantity"]).toBeGreaterThan(3);
            }
            await view.delete();
        });

        test("filter with group_by", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Category"],
                filter: [["Region", "==", "West"]],
                aggregates: { Sales: "sum" },
            });
            const numRows = await view.num_rows();
            expect(numRows).toBe(4); // 3 categories + total
            await view.delete();
        });
    });

    test.describe("sort", () => {
        test("sort ascending", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
                sort: [["Sales", "asc"]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (let i = 1; i < json.length; i++) {
                expect(json[i]["Sales"]).toBeGreaterThanOrEqual(
                    json[i - 1]["Sales"],
                );
            }
            await view.delete();
        });

        test("sort descending", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Quantity"],
                sort: [["Sales", "desc"]],
            });
            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (let i = 1; i < json.length; i++) {
                expect(json[i]["Sales"]).toBeLessThanOrEqual(
                    json[i - 1]["Sales"],
                );
            }
            await view.delete();
        });

        test("sort with group_by", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Region"],
                sort: [["Sales", "desc"]],
                aggregates: { Sales: "sum" },
            });
            const json = await view.to_json();
            // Skip the first row (total) and verify sorting
            const regionRows = json.slice(1);
            for (let i = 1; i < regionRows.length; i++) {
                expect(regionRows[i]["Sales"]).toBeLessThanOrEqual(
                    regionRows[i - 1]["Sales"],
                );
            }
            await view.delete();
        });

        test("multi-column sort", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Region", "Sales", "Quantity"],
                sort: [
                    ["Region", "asc"],
                    ["Sales", "desc"],
                ],
            });
            const json = await view.to_json({ start_row: 0, end_row: 100 });
            // Check that Region is sorted first
            let lastRegion = "";
            let lastSales = Infinity;
            for (const row of json) {
                if (row["Region"] !== lastRegion) {
                    lastRegion = row["Region"];
                    lastSales = Infinity;
                }
                expect(row["Sales"]).toBeLessThanOrEqual(lastSales);
                lastSales = row["Sales"];
            }
            await view.delete();
        });
    });

    test.describe("expressions", () => {
        test("simple expression", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "doublesales"],
                expressions: { doublesales: '"Sales" * 2' },
            });

            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (const row of json) {
                console.log(row);
                expect(row["doublesales"]).toBeCloseTo(row["Sales"] * 2, 5);
            }

            await view.delete();
        });

        test("expression with multiple columns", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Profit", "margin"],
                expressions: { margin: '"Profit" / "Sales"' },
            });

            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (const row of json) {
                if (row["Sales"] !== 0) {
                    expect(row["margin"]).toBeCloseTo(
                        row["Profit"] / row["Sales"],
                        5,
                    );
                }
            }

            await view.delete();
        });

        test("expression with group_by", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["total"],
                group_by: ["Region"],
                expressions: { total: '"Sales" + "Profit"' },
                aggregates: { total: "sum" },
            });

            const json = await view.to_json();
            expect(json.length).toBe(5); // 4 regions + total
            for (const row of json) {
                expect(typeof row["total"]).toBe("number");
            }

            await view.delete();
        });
    });

    test.describe("viewport", () => {
        test("start_row and end_row", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Profit"],
            });
            const json = await view.to_json({ start_row: 10, end_row: 20 });
            expect(json.length).toBe(10);
            await view.delete();
        });

        test("start_col and end_col", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Profit", "Quantity", "Discount"],
            });
            const json = await view.to_json({
                start_row: 0,
                end_row: 5,
                start_col: 1,
                end_col: 3,
            });
            expect(json.length).toBe(5);
            // Should only have Profit and Quantity (columns 1 and 2)
            expect(Object.keys(json[0]).sort()).toEqual(
                ["Profit", "Quantity"].sort(),
            );
            await view.delete();
        });

        test("large viewport", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
            });
            const json = await view.to_json({ start_row: 0, end_row: 1000 });
            expect(json.length).toBe(1000);
            await view.delete();
        });
    });

    test.describe("data types", () => {
        test("integer columns", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Quantity"],
            });
            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (const row of json) {
                expect(Number.isInteger(row["Quantity"])).toBe(true);
            }
            await view.delete();
        });

        test("float columns", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales", "Profit"],
            });
            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (const row of json) {
                expect(typeof row["Sales"]).toBe("number");
                expect(typeof row["Profit"]).toBe("number");
            }
            await view.delete();
        });

        test("string columns", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Region", "State", "City"],
            });
            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (const row of json) {
                expect(typeof row["Region"]).toBe("string");
                expect(typeof row["State"]).toBe("string");
                expect(typeof row["City"]).toBe("string");
            }
            await view.delete();
        });

        test("date columns", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Order Date"],
            });
            const json = await view.to_json({ start_row: 0, end_row: 10 });
            for (const row of json) {
                // Dates come as timestamps
                expect(typeof row["Order Date"]).toBe("number");
            }
            await view.delete();
        });
    });

    test.describe("combined operations", () => {
        test("group_by + filter + sort", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Category"],
                filter: [["Region", "==", "West"]],
                sort: [["Sales", "desc"]],
                aggregates: { Sales: "sum" },
            });
            const json = await view.to_json();
            expect(json.length).toBe(4); // 3 categories + total
            // Skip total row and verify sorting
            const categoryRows = json.slice(1);
            for (let i = 1; i < categoryRows.length; i++) {
                expect(categoryRows[i]["Sales"]).toBeLessThanOrEqual(
                    categoryRows[i - 1]["Sales"],
                );
            }
            await view.delete();
        });

        test.skip("split_by + group_by + filter", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["Sales"],
                group_by: ["Category"],
                split_by: ["Region"],
                filter: [["Quantity", ">", 3]],
                aggregates: { Sales: "sum" },
            });
            const paths = await view.column_paths();
            expect(paths.length).toBeGreaterThan(0);
            const numRows = await view.num_rows();
            expect(numRows).toBe(4); // 3 categories + total
            await view.delete();
        });

        test("expressions + group_by + sort", async function () {
            const table = await client.open_table("superstore");
            const view = await table.view({
                columns: ["profitmargin"],
                group_by: ["Region"],
                expressions: { profitmargin: '"Profit" / "Sales" * 100' },
                sort: [["profitmargin", "desc"]],
                aggregates: { profitmargin: "avg" },
            });
            const json = await view.to_json();
            expect(json.length).toBe(5); // 4 regions + total
            // Verify sorting on region rows
            const regionRows = json.slice(1);
            for (let i = 1; i < regionRows.length; i++) {
                expect(regionRows[i]["profitmargin"]).toBeLessThanOrEqual(
                    regionRows[i - 1]["profitmargin"],
                );
            }
            await view.delete();
        });
    });
});
