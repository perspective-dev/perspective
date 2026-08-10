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
import type { ViewConfigUpdate } from "@perspective-dev/client/dist/esm/ts-rs/ViewConfigUpdate.d.ts";
import type { ViewWindow } from "@perspective-dev/client/dist/esm/ts-rs/ViewWindow.d.ts";
import type { WindowAggSpec } from "@perspective-dev/client/dist/esm/ts-rs/WindowAggSpec.d.ts";
import type { Scalar } from "@perspective-dev/client/dist/esm/ts-rs/Scalar.d.ts";
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

const FRAMES = ["rows", "range", "cumulative"];

const WINDOW_AGGREGATES: WindowAggSpec[] = [
    { name: "sum", frames: FRAMES, result_type: "float" },
    { name: "avg", frames: FRAMES, result_type: "float" },
    { name: "count", frames: FRAMES, result_type: "float" },
    { name: "min", frames: FRAMES },
    { name: "max", frames: FRAMES },
    { name: "product", frames: FRAMES, result_type: "float" },
    { name: "median", frames: FRAMES, result_type: "float" },
    // DuckDB spells sample and population variants separately, so both are
    // offered rather than one being picked on the user's behalf.
    { name: "stddev_samp", frames: FRAMES, result_type: "float" },
    { name: "stddev_pop", frames: FRAMES, result_type: "float" },
    { name: "var_samp", frames: FRAMES, result_type: "float" },
    { name: "var_pop", frames: FRAMES, result_type: "float" },
    // Navigation.
    { name: "first_value", frames: FRAMES },
    { name: "last_value", frames: FRAMES },
    { name: "nth_value", frames: FRAMES, offset: true },
    { name: "lag", offset: true },
    { name: "lead", offset: true },
    // Ranking. These take no source column - the window's `order_by` is their
    // input - but Perspective requires one, so the choice of source is
    // immaterial for them.
    { name: "row_number", result_type: "float" },
    { name: "rank", result_type: "float" },
    { name: "dense_rank", result_type: "float" },
    { name: "percent_rank", result_type: "float" },
    { name: "cume_dist", result_type: "float" },
    // `ntile`'s argument is a bucket count rather than a row offset.
    { name: "ntile", offset: true, result_type: "float" },
    // Perspective's own, with no DuckDB equivalent - the SQL translation
    // synthesizes them from `lag` and `first_value`.
    { name: "diff", offset: true, result_type: "float" },
    { name: "rate", frames: ["range"], result_type: "float" },
];

// Arithmetic is undefined for the non-numeric types; ordering and navigation
// are not.
const WINDOW_AGGREGATES_ANY: WindowAggSpec[] = [
    { name: "count", frames: FRAMES, result_type: "float" },
    { name: "min", frames: FRAMES },
    { name: "max", frames: FRAMES },
    { name: "first_value", frames: FRAMES },
    { name: "last_value", frames: FRAMES },
    { name: "nth_value", frames: FRAMES, offset: true },
    { name: "lag", offset: true },
    { name: "lead", offset: true },
    { name: "row_number", result_type: "float" },
    { name: "rank", result_type: "float" },
    { name: "dense_rank", result_type: "float" },
    { name: "percent_rank", result_type: "float" },
    { name: "cume_dist", result_type: "float" },
    { name: "ntile", offset: true, result_type: "float" },
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

// Perspective's canonical string ops (translated to `ILIKE` / `regexp_matches`
// by the SQL builder), plus DuckDB's raw infix pattern ops spliced verbatim.
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

/**
 * Convert a DuckDB `dtype` to a Perspective `ColumnType`.
 */
function duckdbTypeToPsp(name: string): ColumnType {
    name = name.toLowerCase();

    if (name.startsWith("bool")) {
        return "boolean";
    }

    // 32-bit and narrower - `coerce_column` widens these to `Int32`.
    if (
        ["tinyint", "smallint", "integer", "utinyint", "usmallint"].includes(
            name,
        ) ||
        ["int8", "int16", "int32", "uint8", "uint16"].includes(name)
    ) {
        return "integer";
    }

    // Wider than `Int32`, or fractional - all coerce to `Float64`.
    if (
        ["bigint", "hugeint", "uhugeint", "uinteger", "ubigint"].includes(
            name,
        ) ||
        ["float", "real", "double", "varint"].includes(name) ||
        ["int64", "uint32", "uint64", "float32", "float64"].includes(name) ||
        name.startsWith("decimal") ||
        name.startsWith("numeric")
    ) {
        return "float";
    }

    if (name.startsWith("date")) {
        return "date";
    }

    // `timestamp`, `timestamptz`, `timestamp_ns`, and `time`/`timetz`,
    // which coerce to `Timestamp(Millisecond)` rather than to a number.
    if (name.startsWith("time")) {
        return "datetime";
    }

    // Everything else renders as text: `varchar`, `enum(...)` (which
    // arrives dictionary-encoded), `json`, `uuid`, `blob`, `interval`,
    // and the nested types.
    if (
        !(
            name.startsWith("varchar") ||
            name === "utf8" ||
            name.startsWith("enum") ||
            ["json", "uuid", "blob", "bit", "interval"].includes(name) ||
            name.startsWith("struct") ||
            name.startsWith("map") ||
            name.startsWith("union") ||
            name.endsWith("[]")
        )
    ) {
        // Unknown, not fatal - the column still renders, as text.
        console.warn(`Unknown type '${name}'`);
    }

    return "string";
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
        this.sqlBuilder = new mod!.GenericSQLVirtualServerModel({
            column_separator: "|",
            like_escape_clause: "\\",
            regex_fn: "regexp_matches",
        });
    }

    getFeatures(): perspective.Features {
        return {
            group_by: true,
            split_by: true,
            sort: true,
            expressions: true,
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
            split_rollup_mode: ["flat", "rollup"],
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

    async tableMakeView(
        tableId: string,
        viewId: string,
        config: ViewConfigUpdate,
    ) {
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

    async viewGetMinMax(
        viewId: string,
        columnName: string,
        config: ViewConfig,
    ) {
        const query = this.sqlBuilder.viewGetMinMax(viewId, columnName, config);
        const results = await runQuery(this.db, query);
        const row = results[0].toJSON();
        let [min, max] = Object.values(row);
        if (typeof min === "bigint") min = Number(min);
        if (typeof max === "bigint") max = Number(max);
        return { min: (min ?? null) as Scalar, max: (max ?? null) as Scalar };
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

        const ipc = await this.db.useUnsafe((bindings, conn) =>
            bindings.runQuery(conn, query),
        );

        dataSlice.fromArrowIpc(ipc);
    }
}
