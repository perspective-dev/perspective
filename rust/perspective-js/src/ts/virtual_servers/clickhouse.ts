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
import type * as clickhouse from "@clickhouse/client-web";

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
    if (name.startsWith("Nullable")) {
        name = name.match(/Nullable\((.+?)\)/)![1];
    }

    if (name.startsWith("Array")) {
        return "string";
    }

    if (name === "Int64" || name === "UInt64" || name === "Float64") {
        return "float";
    }

    if (name === "String") {
        return "string";
    }

    if (name === "DateTime") {
        return "datetime";
    }

    if (name === "Date") {
        return "date";
    }

    throw new Error(`Unknown type '${name}'`);
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

class Lock {
    lockPromise: Promise<void>;
    constructor() {
        this.lockPromise = Promise.resolve();
    }

    acquire() {
        let releaseLock: (value: void) => void;
        const newLockPromise: Promise<void> = new Promise((resolve) => {
            releaseLock = resolve;
        });

        const acquirePromise = this.lockPromise.then(() => releaseLock);
        this.lockPromise = newLockPromise;
        return acquirePromise;
    }
}

const LOCK = new Lock();

async function runQuery(
    db: clickhouse.ClickHouseClient,
    query: string,
    options: { columns?: true; execute?: boolean },
): Promise<{
    rows: any[];
    columns: string[];
    dtypes: string[];
}>;

async function runQuery(
    db: clickhouse.ClickHouseClient,
    query: string,
    options?: { columns?: false; execute?: boolean },
): Promise<any[]>;

async function runQuery(
    db: clickhouse.ClickHouseClient,
    query: string,
    options: { columns?: boolean; execute?: boolean } = {},
) {
    query = query.replace(/\s+/g, " ").trim();
    const release = await LOCK.acquire();
    try {
        const result = await db.query({ query });
        if (!options.execute) {
            const { data, meta } =
                (await result.json()) as clickhouse.ResponseJSON<unknown>;

            if (options.columns) {
                return {
                    rows: data,
                    columns: meta!.map((f) => f.name),
                    dtypes: meta!.map((f) => f.type),
                };
            }

            return data;
        }
    } catch (error) {
        console.error("Query error:", error);
        console.error("Query:", query);
        throw error;
    } finally {
        release();
    }
}

/**
 * An implementation of Perspective's Virtual Server for `@duckdb/duckdb-wasm`.
 */
export class ClickhouseHandler implements perspective.VirtualServerHandler {
    private db: clickhouse.ClickHouseClient;
    private sqlBuilder: perspective.GenericSQLVirtualServerModel;
    constructor(db: clickhouse.ClickHouseClient, mod?: typeof perspective) {
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
        this.sqlBuilder = new mod!.GenericSQLVirtualServerModel({
            create_entity: "VIEW",
            grouping_fn: "GROUPING",
        });
    }

    getFeatures() {
        return {
            group_by: true,
            split_by: false,
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
        const query = "SHOW TABLES";
        const results = await runQuery(this.db, query);
        return results.map((row) => {
            return `${row.name}`;
        });
    }

    async tableSchema(tableId: string, config?: ViewConfig) {
        const query = this.sqlBuilder.tableSchema(tableId);
        const results = await runQuery(this.db, query);
        const schema = {} as Record<string, ColumnType>;
        for (const result of results) {
            const colName = result.name;
            if (!colName.startsWith("__")) {
                schema[colName] = duckdbTypeToPsp(result.type) as ColumnType;
            }
        }

        return schema;
    }

    async viewColumnSize(viewId: string, config: ViewConfig) {
        const query = `SELECT COUNT() FROM system.columns WHERE table = '${viewId}'`;
        const results = await runQuery(this.db, query);
        const gs = config.group_by?.length || 0;
        const count = Number(results[0]["COUNT()"]);
        console.log(count);
        return (
            count -
            (gs === 0 ? 0 : gs + (config.split_by?.length === 0 ? 1 : 0))
        );
    }

    async tableSize(tableId: string) {
        const query = this.sqlBuilder.tableSize(tableId);
        const results = await runQuery(this.db, query);
        return Number(results[0]["COUNT()"]);
    }

    async tableMakeView(tableId: string, viewId: string, config: ViewConfig) {
        const query = this.sqlBuilder.tableMakeView(tableId, viewId, config);
        await runQuery(this.db, query, { execute: true });
    }

    async tableValidateExpression(tableId: string, expression: string) {
        const query = this.sqlBuilder.tableValidateExpression(
            tableId,
            expression,
        );
        const results = await runQuery(this.db, query);
        return duckdbTypeToPsp(results[0]["type"]) as ColumnType;
    }

    async viewDelete(viewId: string) {
        const query = this.sqlBuilder.viewDelete(viewId);
        await runQuery(this.db, query, { execute: true });
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
            if (cidx === 0 && is_group_by && !is_split_by) {
                // This is the grouping_id column, skip it
                continue;
            }

            let col = columns[cidx];
            if (is_split_by && !col.startsWith("__ROW_PATH_")) {
                col = col.replaceAll("_", "|");
            }

            const dtype = duckdbTypeToPsp(dtypes[cidx]) as ColumnType;

            const isDecimal = dtypes[cidx].startsWith("Decimal");
            for (let ridx = 0; ridx < rows.length; ridx++) {
                const row = rows[ridx];
                const grouping_id = row["__GROUPING_ID__"];
                let value = row[columns[cidx]];
                if (isDecimal) {
                    value = convertDecimalToNumber(value, dtypes[cidx]);
                }

                if (typeof value === "bigint") {
                    value = Number(value);
                }

                if (dtype === "datetime" && typeof value === "string") {
                    value = +new Date(value);
                }

                if (dtype === "string" && typeof value !== "string") {
                    value = `${value}`;
                }

                dataSlice.setCol(dtype, col, ridx, value, grouping_id);
            }
        }
    }
}
