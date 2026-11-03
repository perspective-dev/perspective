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
 * An implementation of a Perspective Virtual Server for ClickHouse.
 *
 * This import is optional, and so must be imported manually from
 * `@perspective-dev/client/virtual_servers/clickhouse`, it is not exported from
 * the package root `@perspective-dev/client`
 *
 * @module
 */

import type * as perspective from "@perspective-dev/client";
import { client_runtime } from "../wasm/registry.ts";
import type { ColumnType } from "../../../dist/ts-rs/ColumnType.d.ts";
import type { ViewConfig } from "../../../dist/ts-rs/ViewConfig.d.ts";
import type {
    ExpressionError,
    TableDescription,
} from "@perspective-dev/client";
import type { ViewConfigUpdate } from "../../../dist/ts-rs/ViewConfigUpdate.d.ts";
import type { ViewWindow } from "../../../dist/ts-rs/ViewWindow.d.ts";
import type { WindowAggSpec } from "../../../dist/ts-rs/WindowAggSpec.d.ts";
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

// Window functions. Renamed from Perspective's `stddev`/`var` to the SQL
// standard spellings DuckDB and ClickHouse both accept, since the advertised
// name is now emitted verbatim.
//
// NOTE: this set is inherited from the DuckDB handler and has NOT been audited
// against a live ClickHouse - see the aggregate lists below, which have the
// same problem. ClickHouse's own navigation functions are `lagInFrame` /
// `leadInFrame`, and its ranking set differs; both need verifying before being
// advertised here.
const FRAMES = ["rows", "range", "cumulative"];

const WINDOW_AGGREGATES: WindowAggSpec[] = [
    { name: "sum", frames: FRAMES, result_type: "float" },
    { name: "avg", frames: FRAMES, result_type: "float" },
    { name: "count", frames: FRAMES, result_type: "float" },
    { name: "min", frames: FRAMES },
    { name: "max", frames: FRAMES },
    { name: "stddev_samp", frames: FRAMES, result_type: "float" },
    { name: "var_samp", frames: FRAMES, result_type: "float" },
    { name: "lag", offset: true },
    { name: "lead", offset: true },
    { name: "diff", offset: true, result_type: "float" },
    { name: "rate", frames: ["range"], result_type: "float" },
    { name: "row_number", result_type: "float" },
];

const WINDOW_AGGREGATES_ANY: WindowAggSpec[] = [
    { name: "count", frames: FRAMES, result_type: "float" },
    { name: "min", frames: FRAMES },
    { name: "max", frames: FRAMES },
    { name: "lag", offset: true },
    { name: "lead", offset: true },
    { name: "row_number", result_type: "float" },
];

const FILTER_OPS = [
    "==",
    "!=",
    "IS DISTINCT FROM",
    "IS NOT DISTINCT FROM",
    ">=",
    "<=",
    ">",
    "<",
    "is null",
    "is not null",
];

// Perspective's canonical string ops (translated to `ILIKE` / `match` by the
// SQL builder), plus ClickHouse's raw infix pattern ops spliced verbatim.
const STRING_FILTER_OPS = [
    ...FILTER_OPS,
    "begins with",
    "not begins with",
    "contains",
    "not contains",
    "ends with",
    "not ends with",
    "matches",
    "not matches",
    "in",
    "not in",
    "LIKE",
    "NOT LIKE",
    "ILIKE",
    "NOT ILIKE",
];

const INTEGER_TYPES = new Set(["Int8", "Int16", "Int32", "UInt8", "UInt16"]);
const FLOAT_TYPES = new Set([
    "UInt32",
    "UInt64",
    "UInt128",
    "UInt256",
    "Int64",
    "Int128",
    "Int256",
    "Float32",
    "Float64",
    "BFloat16",
]);
const DATE_TYPES = new Set(["Date", "Date32"]);

const TRANSPARENT_WRAPPERS = [
    "Nullable(",
    "LowCardinality(",
    "SimpleAggregateFunction(",
];

function unwrapType(name: string): string {
    name = name.trim();
    for (;;) {
        const wrapper = TRANSPARENT_WRAPPERS.find(
            (w) => name.startsWith(w) && name.endsWith(")"),
        );

        if (!wrapper) {
            return name;
        }

        let inner = name.slice(wrapper.length, -1);
        if (wrapper === "SimpleAggregateFunction(") {
            inner = inner.slice(inner.indexOf(",") + 1);
        }

        name = inner.trim();
    }
}

function clickhouseTypeToPsp(name: string): ColumnType {
    const base = unwrapType(name);
    if (INTEGER_TYPES.has(base)) {
        return "integer";
    }

    if (FLOAT_TYPES.has(base) || base.startsWith("Decimal")) {
        return "float";
    }

    if (base === "Bool") {
        return "boolean";
    }

    if (DATE_TYPES.has(base)) {
        return "date";
    }

    if (base.startsWith("DateTime") || base.startsWith("Time")) {
        return "datetime";
    }

    return "string";
}

function clickhouseToJs(value: any, dtype: ColumnType): any {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "bigint") {
        value = Number(value);
    }

    switch (dtype) {
        case "integer":
        case "float":
            return typeof value === "number" ? value : Number(value);
        case "datetime":
            if (typeof value === "string") {
                const iso = /^-?\d+:\d{2}:\d{2}/.test(value)
                    ? `1970-01-01T${value}`
                    : value.replace(" ", "T");
                return Date.parse(`${iso}Z`);
            }

            return value;
        case "date":
            return typeof value === "string"
                ? Date.parse(`${value}T00:00:00Z`)
                : value;
        case "string":
            if (typeof value === "string") {
                return value.replace(/\0+$/, "");
            }

            return typeof value === "object"
                ? JSON.stringify(value)
                : `${value}`;
        default:
            return value;
    }
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
const SYSTEM_DATABASES = ["system", "INFORMATION_SCHEMA", "information_schema"];

/**
 * Hosts every table and view of every database the connection can read,
 * except ClickHouse's own catalog - by bare name in the connection's current
 * database, otherwise as `database.table`. The views this handler creates
 * (named by the client's random view ids) are tracked and never hosted.
 */
export class ClickhouseHandler implements perspective.VirtualServerHandler {
    private db: clickhouse.ClickHouseClient;
    private sqlBuilder: perspective.GenericSQLVirtualServerModel;
    private ownEntities = new Set<string>();
    constructor(db: clickhouse.ClickHouseClient, mod?: typeof perspective) {
        mod ??= client_runtime()?.glue as unknown as
            | typeof perspective
            | undefined;
        if (mod === undefined) {
            throw new Error(
                "perspective-js is not initialized yet: construct a ClickhouseHandler once <perspective-viewer> is ready or a Client exists, or pass the wasm module",
            );
        }

        this.db = db;
        this.sqlBuilder = new mod.GenericSQLVirtualServerModel({
            create_entity: "VIEW",
            grouping_fn: "GROUPING",
            column_separator: "|",
            backslash_escaped_literals: true,
            regex_fn: "match",
            unordered: true,
        });
    }

    getFeatures(): perspective.Features {
        return {
            group_by: true,
            split_by: false,
            sort: true,
            expressions: true,
            // ClickHouse has no stable `rowid`, so natural-order windows
            // are unsupported.
            unordered: true,
            window_aggregates: {
                // `ema` is recursive and has no SQL window translation.
                integer: WINDOW_AGGREGATES,
                float: WINDOW_AGGREGATES,
                string: WINDOW_AGGREGATES_ANY,
                date: WINDOW_AGGREGATES_ANY,
                datetime: WINDOW_AGGREGATES_ANY,
                boolean: WINDOW_AGGREGATES_ANY,
            },
            group_rollup_mode: ["rollup", "flat", "total"],
            filter_ops: {
                integer: FILTER_OPS,
                float: FILTER_OPS,
                string: STRING_FILTER_OPS,
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
        const excluded = SYSTEM_DATABASES.map((db) => `'${db}'`).join(", ");
        const query = `
            SELECT database, name, database = currentDatabase() AS current
            FROM system.tables
            WHERE database NOT IN (${excluded}) AND NOT is_temporary
            ORDER BY database, name
        `;

        const results = await runQuery(this.db, query);
        return results
            .filter((row) => !(row.current && this.ownEntities.has(row.name)))
            .map((row) =>
                this.sqlBuilder.tablePath(
                    row.current ? [row.name] : [row.database, row.name],
                ),
            );
    }

    async tableSchema(tableId: string, config?: ViewConfig) {
        const query = this.sqlBuilder.tableSchema(tableId);
        const results = await runQuery(this.db, query);
        const schema = {} as Record<string, ColumnType>;
        for (const result of results) {
            const colName = result.name;
            if (!colName.startsWith("__")) {
                schema[colName] = clickhouseTypeToPsp(
                    result.type,
                ) as ColumnType;
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

    async tableMakeView(
        tableId: string,
        viewId: string,
        config: ViewConfigUpdate,
    ) {
        // Window order keys need column types for `range` frame emission.
        const schema = Object.keys(config.windows ?? {}).length
            ? await this.tableSchema(tableId)
            : undefined;

        const query = this.sqlBuilder.tableMakeView(
            tableId,
            viewId,
            config,
            schema,
        );

        await runQuery(this.db, query, { execute: true });
        this.ownEntities.add(viewId);
    }

    async tableDescribe(
        tableId: string,
        config: ViewConfig,
    ): Promise<TableDescription> {
        let expression_schema = {} as Record<string, ColumnType>;
        const expressions_query = this.sqlBuilder.expressionsDescribe(
            tableId,
            config,
        );

        if (expressions_query !== undefined) {
            try {
                expression_schema = await this.describeQuery(expressions_query);
            } catch (error) {
                return await this.attributeExpressionErrors(
                    tableId,
                    config,
                    error,
                );
            }
        }

        const schema = Object.keys(config.windows ?? {}).length
            ? await this.tableSchema(tableId)
            : undefined;

        const view_query = this.sqlBuilder.tableDescribe(
            tableId,
            config,
            schema,
        );

        let view_schema = {} as Record<string, ColumnType>;
        if (view_query !== undefined) {
            try {
                view_schema = await this.describeQuery(view_query);
            } catch (error) {
                return { config_error: errorMessage(error) };
            }
        }

        return { expression_schema, view_schema };
    }

    /** The planned result columns of one `DESCRIBE` query. */
    private async describeQuery(query: string) {
        const results = await runQuery(this.db, query);
        const schema = {} as Record<string, ColumnType>;
        for (const result of results) {
            if (!result.name.startsWith("__")) {
                schema[result.name] = clickhouseTypeToPsp(
                    result.type,
                ) as ColumnType;
            }
        }

        return schema;
    }

    /** Plans each expression on its own to name the ones at fault. */
    private async attributeExpressionErrors(
        tableId: string,
        config: ViewConfig,
        error: unknown,
    ): Promise<TableDescription> {
        const expression_schema = {} as Record<string, ColumnType>;
        const expression_errors = {} as Record<string, ExpressionError>;
        for (const [name, expression] of Object.entries(config.expressions)) {
            const query = this.sqlBuilder.expressionDescribe(
                tableId,
                expression!,
            );

            try {
                const results = await runQuery(this.db, query);
                expression_schema[name] = clickhouseTypeToPsp(
                    results[0]["type"],
                ) as ColumnType;
            } catch (error) {
                expression_errors[name] = {
                    error_message: errorMessage(error),
                    line: 0,
                    column: 0,
                };
            }
        }

        if (Object.keys(expression_errors).length === 0) {
            return { config_error: errorMessage(error) };
        }

        return { expression_schema, expression_errors };
    }

    async viewDelete(viewId: string) {
        const query = this.sqlBuilder.viewDelete(viewId);
        await runQuery(this.db, query, { execute: true });
        this.ownEntities.delete(viewId);
    }

    async viewGetData(
        viewId: string,
        config: ViewConfig,
        schema: Record<string, ColumnType>,
        viewport: ViewWindow,
        dataSlice: perspective.VirtualDataSlice,
    ) {
        const query = this.sqlBuilder.viewGetData(
            viewId,
            config,
            viewport,
            schema,
        );

        const { rows, columns, dtypes } = await runQuery(this.db, query, {
            columns: true,
        });

        const hasGroupBy = (config.group_by?.length ?? 0) > 0;
        const hasGroupingId = columns.includes("__GROUPING_ID__");
        for (let cidx = 0; cidx < columns.length; cidx++) {
            const col = columns[cidx];
            const dtype = clickhouseTypeToPsp(dtypes[cidx]) as ColumnType;
            const isDecimal = dtypes[cidx].includes("Decimal");
            for (let ridx = 0; ridx < rows.length; ridx++) {
                const row = rows[ridx];
                const grouping_id = !hasGroupBy
                    ? undefined
                    : hasGroupingId
                      ? Number(row["__GROUPING_ID__"])
                      : 0;
                let value = row[col];
                if (isDecimal) {
                    value = convertDecimalToNumber(value, dtypes[cidx]);
                }

                value = clickhouseToJs(value, dtype);
                dataSlice.setCol(dtype, col, ridx, value, grouping_id);
            }
        }
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
