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
import { buildGroupRuns } from "../../chrome/categorical-axis-core";

export interface CategoryAxisResult {
    /**
     * Fully materialized hierarchical levels — labels and group runs are
     * pre-resolved from the view's `__ROW_PATH_N__` dictionaries so the
     * chart can retain them past the `with_typed_arrays` callback scope.
     * Empty when `groupBy` is empty.
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
 * rollup rows at the top ("Total" parent aggregates), and returns fully
 * JS-owned level structures (precomputed labels + runs) plus the
 * trimmed category count.
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
    type RawLevel = { indices: Int32Array; dictionary: string[] };
    const rawRowPaths: RawLevel[] = [];
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

    const L = rawRowPaths.length;
    const rowPaths: CategoricalLevel[] =
        groupByLen > 0 && L > 0
            ? rawRowPaths.map((rp, levelIdx) => {
                  const labels = new Array<string>(numCategories);
                  let maxLabelChars = 0;
                  for (let r = 0; r < numCategories; r++) {
                      const s = rp.dictionary[rp.indices[r + rowOffset]] ?? "";
                      labels[r] = s;
                      if (s.length > maxLabelChars) maxLabelChars = s.length;
                  }
                  // Only outer levels need the run-length encoding for
                  // bracket rendering; leaves render per-row.
                  const runs =
                      levelIdx === L - 1
                          ? []
                          : buildGroupRuns(
                                rp.indices,
                                rp.dictionary,
                                rowOffset,
                                rowOffset + numCategories,
                            ).map((run) => ({
                                startIdx: run.startIdx - rowOffset,
                                endIdx: run.endIdx - rowOffset,
                                label: run.label,
                            }));
                  return { labels, runs, maxLabelChars };
              })
            : [];

    return { rowPaths, numCategories, rowOffset };
}
