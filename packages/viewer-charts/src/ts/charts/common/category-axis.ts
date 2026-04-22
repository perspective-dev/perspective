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

import type { ColumnDataMap } from "../../data/view-reader";
import type { CategoricalLevel } from "../../chrome/categorical-axis";

export interface CategoryAxisResult {
    /**
     * Zero-copy views over the `__ROW_PATH_N__` dictionaries, sliced to
     * skip leading empty rows (the "Total" aggregate header that the
     * view produces when `group_by` is non-empty). Empty when `groupBy`
     * is empty.
     */
    rowPaths: CategoricalLevel[];
    /** Rows that actually contribute a category (post-offset). */
    numCategories: number;
    /** Leading rows skipped; callers use this to rebase per-row indices. */
    rowOffset: number;
}

/**
 * Resolve the category axis for a categorical-X chart (bar, candlestick,
 * ohlc, …). Walks the `__ROW_PATH_N__` hierarchy columns, skips the
 * rollup rows at the top ("Total" parent aggregates), and returns zero-
 * copy dictionary views plus the trimmed category count.
 *
 * When `groupByLen === 0`, there are no row-path columns and the
 * category axis falls back to the raw row index — callers infer that
 * from `rowPaths.length === 0`.
 */
export function resolveCategoryAxis(
    columns: ColumnDataMap,
    numRows: number,
    groupByLen: number,
): CategoryAxisResult {
    const rawRowPaths: CategoricalLevel[] = [];
    for (let n = 0; ; n++) {
        const rp = columns.get(`__ROW_PATH_${n}__`);
        if (!rp || rp.type !== "string" || !rp.indices || !rp.dictionary) break;
        rawRowPaths.push({ indices: rp.indices, dictionary: rp.dictionary });
    }

    let rowOffset = 0;
    if (groupByLen > 0 && rawRowPaths.length > 0) {
        while (rowOffset < numRows) {
            let anyNonEmpty = false;
            for (const rp of rawRowPaths) {
                const s = rp.dictionary[rp.indices[rowOffset]];
                if (s != null && s !== "") {
                    anyNonEmpty = true;
                    break;
                }
            }
            if (anyNonEmpty) break;
            rowOffset++;
        }
    }
    const numCategories = Math.max(0, numRows - rowOffset);

    const rowPaths: CategoricalLevel[] =
        groupByLen > 0 && rawRowPaths.length > 0
            ? rawRowPaths.map((rp) => ({
                  indices:
                      rowOffset === 0
                          ? rp.indices
                          : rp.indices.subarray(rowOffset),
                  dictionary: rp.dictionary,
              }))
            : [];

    return { rowPaths, numCategories, rowOffset };
}
