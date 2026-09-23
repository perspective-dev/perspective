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

import type { CellScalar } from "regular-table/dist/esm/types.js";
import type { DatagridModel } from "../types.js";

/**
 * A column header area, `[level][absolute column]`, sparse in the column axis.
 */
export type ColumnPathArea = (CellScalar | null)[][];

/**
 * Write one window of `View.column_paths` into `area` at `start_col`, growing
 * the level count if the view's `split_by` has since changed.
 */
export function write_area(
    area: ColumnPathArea,
    window_area: (CellScalar | null)[][],
    start_col: number,
): void {
    while (area.length < window_area.length) {
        area.push([]);
    }

    area.length = window_area.length;
    for (let level = 0; level < window_area.length; level++) {
        const row = window_area[level];
        for (let i = 0; i < row.length; i++) {
            area[level][start_col + i] = row[i];
        }
    }
}

/**
 * Synthesize the single-level area of an unpivoted view from the data keys it
 * was already given, which saves the engine call entirely.
 */
export function write_flat_area(
    area: ColumnPathArea,
    paths: string[],
    start_col: number,
): void {
    area.length = 1;
    area[0] ??= [];
    for (let i = 0; i < paths.length; i++) {
        area[0][start_col + i] = paths[i];
    }
}

/**
 * The name of column `x`, which always occupies the area's last level.
 */
export function column_name(model: DatagridModel, x: number): string {
    const area = model._column_path_area;
    const value = area[area.length - 1]?.[x];
    return value === undefined || value === null ? "" : String(value);
}

/**
 * How many levels column `x` pivots on, which is fewer than `split_by.length`
 * for a subtotal or grand total under `split_rollup_mode: "rollup"`.
 */
export function split_depth(model: DatagridModel, x: number): number {
    const area = model._column_path_area;
    let depth = 0;
    for (let level = 0; level + 1 < area.length; level++) {
        if (area[level][x] !== null && area[level][x] !== undefined) {
            depth++;
        }
    }

    return depth;
}

/**
 * The split values of column `x`, excluding its name and the levels it does
 * not pivot on.
 */
export function split_levels(
    model: DatagridModel,
    x: number,
): (CellScalar | null)[] {
    const area = model._column_path_area;
    const levels: (CellScalar | null)[] = [];
    for (let level = 0; level + 1 < area.length; level++) {
        const value = area[level][x];
        if (value === null || value === undefined) {
            break;
        }

        levels.push(value);
    }

    return levels;
}

/**
 * Whether column `x` has been loaded into the area at all.
 */
export function is_loaded(model: DatagridModel, x: number): boolean {
    const area = model._column_path_area;
    return area[area.length - 1]?.[x] !== undefined;
}
