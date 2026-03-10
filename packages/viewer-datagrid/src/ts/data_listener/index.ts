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

import { PRIVATE_PLUGIN_SYMBOL } from "../types.js";
import { format_cell } from "./format_cell.js";
import {
    format_flat_header_row_path,
    format_tree_header,
    format_tree_header_row_path,
} from "./format_tree_header.js";
import type {
    DatagridModel,
    PerspectiveViewerElement,
    RegularTable,
    Schema,
} from "../types.js";
import type { CellScalar, DataResponse } from "regular-table/dist/esm/types.js";
import { ViewConfig, ViewWindow } from "@perspective-dev/client";

interface ColumnData {
    __ROW_PATH__?: unknown[][];
    __ID__?: unknown[][];
    [key: string]: unknown[] | undefined;
}

/**
 * Creates a new DataListener, suitable for passing to `regular-table`'s
 * `.setDataListener()` method. This should be called as a method on the
 * plugin.
 *
 * @returns A data listener for the plugin.
 */
export function createDataListener(
    viewer: PerspectiveViewerElement,
): (
    regularTable: RegularTable,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
) => Promise<DataResponse> {
    let last_meta: unknown[][] | undefined;
    let last_column_paths: string[] | undefined;
    let last_ids: unknown[][] | undefined;
    let last_reverse_ids: Map<string, number> | undefined;
    let last_reverse_columns: Map<string, number> | undefined;

    return async function dataListener(
        this: DatagridModel,
        regularTable: RegularTable,
        x0: number,
        y0: number,
        x1: number,
        y1: number,
    ): Promise<DataResponse> {
        let columns: ColumnData = {};
        const new_window: ViewWindow = {
            start_row: y0,
            start_col: x0,
            end_row: y1,
            end_col: x1,
            id: true,
        };

        let num_columns: number | null = null;

        if (x1 - x0 > 0 && y1 - y0 > 0) {
            this._is_old_viewport =
                this._last_window?.start_row === y0 &&
                this._last_window?.end_row === y1 &&
                this._last_window?.start_col === x0 &&
                this._last_window?.end_col === x1;

            const [x, z] = await Promise.all([
                this._view.to_columns_string(new_window as any),
                this._view.num_columns(),
            ]);

            num_columns = z;
            columns = JSON.parse(x as string) as ColumnData;
            const y = Object.keys(columns);
            const new_col_paths = y.filter(
                (x) => x !== "__ROW_PATH__" && x !== "__ID__",
            );

            let changed_cols = false;
            for (let i = 0; i < new_col_paths.length; i++) {
                if (
                    this._column_paths[new_window.start_col! + i] !==
                    new_col_paths[i]
                ) {
                    changed_cols = true;
                    this._column_paths[new_window.start_col! + i] =
                        new_col_paths[i];
                }
            }

            if (changed_cols) {
                const [a, b] = await Promise.all([
                    this._view.schema(),
                    this._view.expression_schema(),
                ]);

                this._schema = { ...(a as Schema), ...(b as Schema) };
                for (let i = 0; i < new_col_paths.length; i++) {
                    const column_path_parts = new_col_paths[i].split("|");
                    const column =
                        column_path_parts[this._config.split_by.length];

                    this._is_editable[i + new_window.start_col!] =
                        !!this._table_schema[column];

                    this._column_types[i + new_window.start_col!] =
                        this._schema[column];
                }
            }

            this._last_window = new_window;
            this._ids =
                columns.__ID__ ||
                Array(y1 - y0)
                    .fill(null)
                    .map((_, index) => [index + y0]);

            this._reverse_columns = this._column_paths
                .slice(x0, x1)
                .reduce((acc, x, i) => {
                    acc.set(x, i);
                    return acc;
                }, new Map<string, number>());

            this._reverse_ids = this._ids?.reduce((acc, x, i) => {
                acc.set(x?.join("|"), i);
                return acc;
            }, new Map<string, number>());
        } else {
            this._div_factory.clear();
            num_columns = await this._view.num_columns();
        }

        const data: (string | HTMLElement)[][] = [];
        const metadata: unknown[][] = [];
        const column_headers: string[][] = [];
        const column_paths: string[] = [];

        const is_settings_open = viewer.hasAttribute("settings");
        for (
            let ipath = x0;
            ipath < Math.min(x1, this._column_paths.length);
            ++ipath
        ) {
            const path = this._column_paths[ipath];
            const path_parts = path.split("|");
            const column = columns[path] || new Array(y1 - y0).fill(null);
            const agg_depth = Math.min(
                (regularTable as any)[PRIVATE_PLUGIN_SYMBOL]?.[
                    path_parts[this._config.split_by.length]
                ]?.aggregate_depth || 0,
                this._config.group_by.length,
            );

            data.push(
                column.map((x, i) => {
                    if ((columns?.__ROW_PATH__?.[i]?.length ?? 0) < agg_depth) {
                        return "";
                    } else {
                        return format_cell.call(
                            this,
                            path_parts[this._config.split_by.length],
                            x,
                            (regularTable as any)[PRIVATE_PLUGIN_SYMBOL] || {},
                        ) as string | HTMLElement;
                    }
                }),
            );

            metadata.push(column as unknown[]);
            if (is_settings_open) {
                path_parts.push("");
            }

            column_headers.push(path_parts);
            column_paths.push(path);
        }

        const is_dim_call = x1 - x0 > 0 && y1 - y0 > 0;

        // Only update the last state if this is not a "phantom" call.
        if (is_dim_call) {
            this.last_column_paths = last_column_paths;
            this.last_meta = last_meta;
            this.last_ids = last_ids;
            this.last_reverse_ids = last_reverse_ids;
            this.last_reverse_columns = last_reverse_columns;

            last_column_paths = column_paths;
            last_meta = metadata;
            last_ids = this._ids;
            last_reverse_ids = this._reverse_ids;
            last_reverse_columns = this._reverse_columns;
        }

        const is_row_path = columns.__ROW_PATH__ !== undefined;
        const is_flat = this._config.group_rollup_mode === "flat";
        const row_headers = Array.from(
            (is_row_path
                ? is_flat
                    ? format_flat_header_row_path
                    : format_tree_header_row_path
                : format_tree_header
            ).call(
                this,
                columns.__ROW_PATH__,
                this._config.group_by,
                regularTable,
            ),
        ) as (string | HTMLElement)[][];

        const num_row_headers = !is_dim_call
            ? row_header_depth(this._config)
            : row_headers[0]?.length;

        const result: DataResponse = {
            num_column_headers:
                this._config.split_by.length + (is_settings_open ? 2 : 1),
            num_row_headers,
            num_rows: this._num_rows,
            num_columns,
            row_headers: row_headers as CellScalar[][], // Add `HTMLElement`
            column_headers,
            data: data as CellScalar[][],
            metadata,
            column_header_merge_depth: Math.max(
                0,
                this._config.split_by.length,
            ),
        };

        return result;
    };
}

function row_header_depth(config: ViewConfig) {
    if (config.group_rollup_mode === "flat") {
        return config.group_by.length;
    } else if (config.group_rollup_mode === "total") {
        return 0;
    } else if (config.group_by.length === 0) {
        return 0;
    } else {
        return config.group_by.length + 1;
    }
}
