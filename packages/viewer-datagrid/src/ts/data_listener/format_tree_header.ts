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
import type {
    DatagridModel,
    RegularTable,
    ResolvedColumnsConfig,
} from "../types.js";

type RowHeaderCell = string | HTMLElement | null | { toString(): string };

/**
 * The row-header cell for a group key: a `null` key and an `HTMLElement` pass
 * through as-is, anything else renders through `toString()` as text.
 */
function row_header_cell(
    formatted: string | HTMLElement | null,
): RowHeaderCell {
    return formatted instanceof HTMLElement || formatted === null
        ? formatted
        : { toString: () => String(formatted) };
}

/**
 * Format a single cell of the `group_by` tree header for __ROW_PATH__ data.
 */
export function* format_tree_header_row_path(
    this: DatagridModel,
    paths: unknown[][] = [],
    row_headers: string[],
    regularTable: RegularTable,
): Generator<RowHeaderCell[]> {
    const plugins: ResolvedColumnsConfig =
        (regularTable as any)[PRIVATE_PLUGIN_SYMBOL] || {};
    for (const path of paths) {
        const fullPath: unknown[] = ["TOTAL", ...path];
        const last = fullPath[fullPath.length - 1];
        let newPath: RowHeaderCell[] = fullPath
            .slice(0, fullPath.length - 1)
            .fill("") as string[];
        const formatted = format_cell.call(
            this,
            row_headers[newPath.length - 1],
            last,
            plugins,
            true,
        );

        newPath = newPath.concat(row_header_cell(formatted));

        newPath.length = row_headers.length + 1;
        yield newPath;
    }
}

export function* format_flat_header_row_path(
    this: DatagridModel,
    paths: unknown[][] = [],
    row_headers: string[],
    regularTable: RegularTable,
): Generator<RowHeaderCell[]> {
    const plugins: ResolvedColumnsConfig =
        (regularTable as any)[PRIVATE_PLUGIN_SYMBOL] || {};

    for (const path of paths) {
        yield path.map((part, i) =>
            format_cell.call(this, row_headers[i], part, plugins, true),
        ) as RowHeaderCell[];
    }
}

/**
 * Format a single cell of the `group_by` tree header.
 */
export function* format_tree_header(
    this: DatagridModel,
    paths: unknown[][] = [],
    row_headers: string[],
    regularTable: RegularTable,
): Generator<unknown[]> {
    const plugins: ResolvedColumnsConfig =
        (regularTable as any)[PRIVATE_PLUGIN_SYMBOL] || {};
    for (const path of paths) {
        const new_path: unknown[] = [""];
        for (const idx in path) {
            new_path.push(
                format_cell.call(
                    this,
                    row_headers[idx],
                    path[idx],
                    plugins,
                    true,
                ),
            );
        }

        yield path;
    }
}
