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

import type {
    VirtualDataSlice,
    VirtualServerHandler,
} from "@perspective-dev/client";
import type { ColumnType } from "@perspective-dev/client/dist/esm/ts-rs/ColumnType.d.ts";
import type { ViewConfig } from "@perspective-dev/client/dist/esm/ts-rs/ViewConfig.d.ts";
import type { ViewWindow } from "@perspective-dev/client/dist/esm/ts-rs/ViewWindow.d.ts";
import type * as duckdb from "@duckdb/duckdb-wasm";
import type * as perspective from "../../../dist/wasm/perspective-js.js";

function convertDecimalToNumber(value: any, dtypeString: string) {
    if (
        value === null ||
        value === undefined ||
        !(value instanceof Uint32Array || value instanceof Int32Array)
    ) {
        return value;
    }

    let bigIntValue = BigInt(0);
    for (let i = 0; i < value.length; i++) {
        bigIntValue |= BigInt(value[i]) << BigInt(i * 32);
    }

    const maxInt128 = BigInt(2) ** BigInt(127);
    if (bigIntValue >= maxInt128) {
        bigIntValue -= BigInt(2) ** BigInt(128);
    }

    const scaleMatch = dtypeString.match(/Decimal\[\d+e(\d+)\]/);
    const scale = scaleMatch ? parseInt(scaleMatch[1]) : 0;

    if (scale > 0) {
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
    options?: { columns: boolean },
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

export class DuckDBHandler implements VirtualServerHandler {
    private db: duckdb.AsyncDuckDBConnection;
    private sqlBuilder: perspective.JsDuckDBSqlBuilder;
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
        this.sqlBuilder = new mod!.JsDuckDBSqlBuilder();
    }

    getFeatures() {
        return this.sqlBuilder.getFeatures();
    }

    async getHostedTables() {
        const query = this.sqlBuilder.getHostedTables();
        const results = await runQuery(this.db, query);
        return results.map((row) => row.toJSON().name);
    }

    async tableSchema(tableId: string) {
        const query = this.sqlBuilder.tableSchema(tableId);
        const results = await runQuery(this.db, query);
        const schema = {} as Record<string, ColumnType>;
        for (const result of results) {
            const res = result.toJSON();
            const colName = res.column_name;
            if (!colName.startsWith("__") || !colName.endsWith("__")) {
                const cleanName = colName.split("_").slice(-1)[0] as string;
                schema[cleanName] = this.sqlBuilder.duckdbTypeToPsp(
                    res.column_type,
                ) as ColumnType;
            }
        }

        return schema;
    }

    async viewColumnSize(viewId: string, config: ViewConfig) {
        const query = this.sqlBuilder.viewColumnSize(viewId);
        const results = await runQuery(this.db, query);
        const gs = config.group_by?.length || 0;
        const count = Number(Object.values(results[0].toJSON())[0]);
        return (
            count -
            (gs === 0 ? 0 : gs + (config.split_by?.length === 0 ? 1 : 0))
        );
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
        return this.sqlBuilder.duckdbTypeToPsp(
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
        viewport: ViewWindow,
        dataSlice: VirtualDataSlice,
    ) {
        const group_by = config.group_by || [];
        const split_by = config.split_by || [];

        // First, get the schema to pass to the SQL builder
        const schemaQuery = this.sqlBuilder.viewSchema(viewId);
        const schemaResults = await runQuery(this.db, schemaQuery);
        const columnTypes = new Map<string, string>();
        const schema: Record<string, ColumnType> = {};
        for (const result of schemaResults) {
            const res = result.toJSON();
            columnTypes.set(res.column_name, res.column_type);
            schema[res.column_name] = this.sqlBuilder.duckdbTypeToPsp(
                res.column_type,
            ) as ColumnType;
        }

        // Generate the data query using the Rust SQL builder
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
            const col = columns[cidx];

            if (cidx === 0 && group_by.length > 0 && split_by.length === 0) {
                continue;
            }

            const dtype = this.sqlBuilder.duckdbTypeToPsp(
                dtypes[cidx],
            ) as ColumnType;
            
            const isDecimal = dtypes[cidx].startsWith("Decimal");
            for (let ridx = 0; ridx < rows.length; ridx++) {
                const row = rows[ridx];
                const rowArray = row.toArray();
                let value = rowArray[cidx];
                if (isDecimal) {
                    value = convertDecimalToNumber(value, dtypes[cidx]);
                }

                if (typeof value === "bigint") {
                    value = Number(value);
                }

                dataSlice.setCol(dtype, col, ridx, value, Number(rowArray[0]));
            }
        }
    }
}
