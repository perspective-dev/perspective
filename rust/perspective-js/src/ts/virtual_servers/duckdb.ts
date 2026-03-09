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

/**
 * An implementation of a Perspective Virtual Server for DuckDB.
 *
 * This import is optional, and so must be imported manually from either
 * `@perspective-dev/client/dist/esm/virtual_servers/duckdb.js` or
 * `@perspective-dev/client/src/ts/virtual_servers/duckdb.ts`, it is not
 * exported from the package root `@perspective-dev/client`
 *
 * @module
 */

import type * as perspective from "@perspective-dev/client";
import type { ColumnType } from "@perspective-dev/client/dist/esm/ts-rs/ColumnType.d.ts";
import type { ViewConfig } from "@perspective-dev/client/dist/esm/ts-rs/ViewConfig.d.ts";
import type { ViewWindow } from "@perspective-dev/client/dist/esm/ts-rs/ViewWindow.d.ts";
import type * as duckdb from "@duckdb/duckdb-wasm";

const NUMBER_AGGS = [
    "sum",
    "count",
    "any_value",
    "arbitrary",
    "array_agg",
    "avg",
    "bit_and",
    "bit_or",
    "bit_xor",
    "bitstring_agg",
    "bool_and",
    "bool_or",
    "countif",
    "favg",
    "fsum",
    "geomean",
    "kahan_sum",
    "last",
    "max",
    "min",
    "product",
    "string_agg",
    "sumkahan",
];

const STRING_AGGS = [
    "count",
    "any_value",
    "arbitrary",
    "first",
    "countif",
    "last",
    "string_agg",
];

const FILTER_OPS = [
    "==",
    "!=",
    "LIKE",
    "IS DISTINCT FROM",
    "IS NOT DISTINCT FROM",
    ">=",
    "<=",
    ">",
    "<",
];

function duckdbTypeToPsp(name: string): ColumnType {
    name = name.toLowerCase();
    if (name === "varchar" || name == "utf8") {
        return "string";
    }

    if (
        name === "double" ||
        name === "bigint" ||
        name === "hugeint" ||
        name === "float64" ||
        name.startsWith("decimal")
    ) {
        return "float";
    }

    if (name.startsWith("int")) {
        return "integer";
    }

    if (name.startsWith("date")) {
        return "date";
    }

    if (name.startsWith("bool")) {
        return "boolean";
    }

    if (name.startsWith("timestamp")) {
        return "datetime";
    }

    if (name.startsWith("json")) {
        return "string";
    }

    if (name.startsWith("struct")) {
        return "string";
    }

    console.warn(`Unknown type '${name}'`);
    return "string";
}

function convertDecimalToNumber(value: any, dtypeString: string) {
    if (!(value instanceof Uint32Array || value instanceof Int32Array)) {
        return value;
    }

    let bigIntValue = BigInt(0);
    for (let i = 0; i < value.length; i++) {
        bigIntValue |= BigInt(value[i]) << BigInt(i * 32);
    }

    const scaleMatch = dtypeString.match(/Decimal\[\d+e(\d+)\]/);
    if (scaleMatch) {
        const scale = parseInt(scaleMatch[1]);
        return Number(bigIntValue) / Math.pow(10, scale);
    } else {
        return Number(bigIntValue);
    }
}

async function runQuery(
    db: duckdb.AsyncDuckDBConnection,
    query: string,
    options: { columns: true },
): Promise<{
    rows: any[];
    columns: string[];
    dtypes: string[];
}>;

async function runQuery(
    db: duckdb.AsyncDuckDBConnection,
    query: string,
    options?: { columns: false },
): Promise<any[]>;

async function runQuery(
    db: duckdb.AsyncDuckDBConnection,
    query: string,
    options: { columns?: boolean } = {},
) {
    query = query.replace(/\s+/g, " ").trim();
    try {
        const result = await db.query(query);
        if (options.columns) {
            return {
                rows: result.toArray(),
                columns: result.schema.fields.map((f) => f.name),
                dtypes: result.schema.fields.map((f) => f.type.toString()),
            };
        }

        return result.toArray();
    } catch (error) {
        console.error("Query error:", error);
        console.error("Query:", query);
        throw error;
    }
}

/**
 * An implementation of Perspective's Virtual Server for `@duckdb/duckdb-wasm`.
 */
export class DuckDBHandler implements perspective.VirtualServerHandler {
    private db: duckdb.AsyncDuckDBConnection;
    private sqlBuilder: perspective.GenericSQLVirtualServerModel;
    constructor(db: duckdb.AsyncDuckDBConnection, mod?: typeof perspective) {
        if (!mod) {
            if (customElements) {
                const viewer_class: any =
                    customElements.get("perspective-viewer");
                if (viewer_class) {
                    mod = viewer_class.__wasm_module__;
                } else {
                    throw new Error("Missing perspective-client.wasm");
                }
            } else {
            }
        }

        this.db = db;
        this.sqlBuilder = new mod!.GenericSQLVirtualServerModel();
    }

    getFeatures() {
        return {
            group_by: true,
            split_by: true,
            sort: true,
            expressions: true,
            group_rollup_mode: ["rollup", "flat", "total"],
            filter_ops: {
                integer: FILTER_OPS,
                float: FILTER_OPS,
                string: FILTER_OPS,
                boolean: FILTER_OPS,
                date: FILTER_OPS,
                datetime: FILTER_OPS,
            },
            aggregates: {
                integer: NUMBER_AGGS,
                float: NUMBER_AGGS,
                string: STRING_AGGS,
                boolean: STRING_AGGS,
                date: STRING_AGGS,
                datetime: STRING_AGGS,
            },
        };
    }

    async getHostedTables() {
        const query = this.sqlBuilder.getHostedTables();
        const results = await runQuery(this.db, query);
        return results.map((row) => {
            const json = row.toJSON();
            return `${json.database || "memory"}.${json.name}`;
        });
    }

    async tableSchema(tableId: string, config?: ViewConfig) {
        const query = this.sqlBuilder.tableSchema(tableId);
        const results = await runQuery(this.db, query);
        const schema = {} as Record<string, ColumnType>;
        for (const result of results) {
            const res = result.toJSON();
            const colName = res.column_name;
            if (!colName.startsWith("__")) {
                schema[colName] = duckdbTypeToPsp(
                    res.column_type,
                ) as ColumnType;
            }
        }

        return schema;
    }

    async viewColumnSize(viewId: string, config: ViewConfig) {
        const query = this.sqlBuilder.viewColumnSize(viewId);
        const results = await runQuery(this.db, query);
        const count = Number(Object.values(results[0].toJSON())[0]);
        const gs = config.group_by?.length || 0;
        const is_flat = config.group_rollup_mode === "flat";
        return count - (gs === 0 ? 0 : is_flat ? gs : gs + 1);
    }

    async tableSize(tableId: string) {
        const query = this.sqlBuilder.tableSize(tableId);
        const results = await runQuery(this.db, query);
        return Number(results[0].toJSON()["count_star()"]);
    }

    async tableMakeView(tableId: string, viewId: string, config: ViewConfig) {
        const query = this.sqlBuilder.tableMakeView(tableId, viewId, config);
        await runQuery(this.db, query);
    }

    async tableValidateExpression(tableId: string, expression: string) {
        const query = this.sqlBuilder.tableValidateExpression(
            tableId,
            expression,
        );
        const results = await runQuery(this.db, query);
        return duckdbTypeToPsp(
            results[0].toJSON()["column_type"],
        ) as ColumnType;
    }

    async viewDelete(viewId: string) {
        const query = this.sqlBuilder.viewDelete(viewId);
        await runQuery(this.db, query);
    }

    async viewGetData(
        viewId: string,
        config: ViewConfig,
        schema: Record<string, ColumnType>,
        viewport: ViewWindow,
        dataSlice: perspective.VirtualDataSlice,
    ) {
        const is_group_by = config.group_by?.length > 0;
        const is_split_by = config.split_by?.length > 0;
        const is_flat = config.group_rollup_mode === "flat";
        const has_grouping_id = is_group_by && !is_flat;
        const query = this.sqlBuilder.viewGetData(
            viewId,
            config,
            viewport,
            schema,
        );

        const { rows, columns, dtypes } = await runQuery(this.db, query, {
            columns: true,
        });

        for (let cidx = 0; cidx < columns.length; cidx++) {
            if (cidx === 0 && has_grouping_id) {
                // This is the grouping_id column, skip it
                continue;
            }

            let col = columns[cidx];
            if (is_split_by && !col.startsWith("__")) {
                col = col.replaceAll("_", "|");
            }

            const dtype = duckdbTypeToPsp(dtypes[cidx]) as ColumnType;
            const isDecimal = dtypes[cidx].startsWith("Decimal");
            for (let ridx = 0; ridx < rows.length; ridx++) {
                const rowArray = rows[ridx].toArray();
                const grouping_id = has_grouping_id
                    ? Number(rowArray[0])
                    : undefined;
                let value = rowArray[cidx];
                if (isDecimal) {
                    value = convertDecimalToNumber(value, dtypes[cidx]);
                }

                if (typeof value === "bigint") {
                    value = Number(value);
                }

                if (typeof value !== "string" && dtype === "string") {
                    try {
                        value = JSON.stringify(value);
                    } catch (e) {
                        value = `${value}`;
                    }
                }

                dataSlice.setCol(dtype, col, ridx, value, grouping_id);
            }
        }
    }
}
