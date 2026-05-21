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

import type { ColumnDataMap, ColumnData } from "../../data/view-reader";
import type { CategoricalLevel } from "../../axis/categorical-axis";
import { buildGroupRuns } from "../../axis/categorical-axis-core";
import { formatTickValue, formatDateTickValue } from "../../layout/ticks";

export interface CategoryAxisResult {
    /**
     * Fully materialized hierarchical levels — labels and group runs are
     * pre-resolved from the view's `__ROW_PATH_N__` dictionaries (or
     * synthesized for non-string levels) so the chart can retain them
     * past the `with_typed_arrays` callback scope. Empty when `groupBy`
     * is empty.
     */
    rowPaths: CategoricalLevel[];

    /**
     * Rows that actually contribute a category (post-offset).
     */
    numCategories: number;

    /**
     * Leading rows skipped; callers use this to rebase per-row indices.
     */
    rowOffset: number;
}

export type AxisMode =
    | { mode: "category" }
    | {
          mode: "numeric";
          numericType: "date" | "datetime" | "integer" | "float";
      };

/**
 * Numeric category-axis state. Shared across bar / candlestick / heatmap
 * pipelines: when an axis is driven by exactly one non-string group_by /
 * split_by level, glyphs anchor at real data values via `categoryPositions`
 * and the chrome renders a numeric (date-aware) tick row.
 */
export interface NumericCategoryDomain {
    min: number;
    max: number;
    isDate: boolean;
    label: string;

    /**
     * Data-unit width of one category band, from min adjacent delta.
     */
    bandWidth: number;
}

/**
 * Compute `categoryPositions` (per-row real data values) plus a
 * `NumericCategoryDomain` summarizing min/max/bandWidth for a numeric
 * row-path column. `bandWidth` falls back to the full domain when there
 * are <2 distinct positions. Pivot rows for a single group_by come ASC
 * by default, so a forward sweep for `minDelta` is sufficient.
 *
 * Returns `null` when the row-path column is missing or carries no
 * `values` array (e.g. dictionary-encoded string column).
 */
export function resolveNumericCategoryDomain(
    rpValues: ArrayLike<number> | null | undefined,
    numCategories: number,
    rowOffset: number,
    label: string,
    isDate: boolean,
): {
    categoryPositions: Float64Array;
    numericCategoryDomain: NumericCategoryDomain;
} | null {
    if (!rpValues || numCategories <= 0) {
        return null;
    }

    const categoryPositions = new Float64Array(numCategories);
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let catI = 0; catI < numCategories; catI++) {
        const v = rpValues[catI + rowOffset] as number;
        categoryPositions[catI] = v;
        if (v < minVal) {
            minVal = v;
        }

        if (v > maxVal) {
            maxVal = v;
        }
    }

    let minDelta = Infinity;
    for (let i = 1; i < numCategories; i++) {
        const d = Math.abs(categoryPositions[i] - categoryPositions[i - 1]);
        if (d > 0 && d < minDelta) {
            minDelta = d;
        }
    }

    if (!isFinite(minDelta) || minDelta === 0) {
        minDelta = Math.max(1, maxVal - minVal);
    }

    return {
        categoryPositions,
        numericCategoryDomain: {
            min: minVal - minDelta / 2,
            max: maxVal + minDelta / 2,
            isDate,
            label,
            bandWidth: minDelta,
        },
    };
}

/**
 * Decide whether the categorical axis should render as a stringified
 * category axis or a true numeric axis. Numeric mode is only used when
 * there is exactly one `group_by` level AND that level is a non-string,
 * non-boolean numeric type. Boolean and any multi-level case → category.
 */
export function resolveAxisMode(
    groupBy: string[],
    groupByTypes: Record<string, string>,
): AxisMode {
    if (groupBy.length !== 1) {
        return { mode: "category" };
    }

    const t = groupByTypes[groupBy[0]];
    if (t === "date" || t === "datetime" || t === "integer" || t === "float") {
        return { mode: "numeric", numericType: t };
    }

    return { mode: "category" };
}

/**
 * Stringify a single value from a non-string row-path column.
 */
function formatLevelValue(
    value: number,
    valid: boolean,
    levelType: string,
): string {
    if (!valid) {
        return "";
    }

    if (levelType === "boolean") {
        return value ? "true" : "false";
    }

    if (levelType === "date" || levelType === "datetime") {
        return formatDateTickValue(value);
    }

    if (levelType === "integer") {
        return String(value | 0);
    }

    if (levelType === "float") {
        return formatTickValue(value);
    }

    return String(value);
}

/**
 * Synthesize a `(indices, dictionary)` pair from a non-string row-path
 * column so the rest of the categorical axis machinery (label
 * pre-resolution, run-length encoding) can run unchanged. The dictionary
 * uses `""` at index 0 as the rollup-row sentinel — this preserves the
 * existing skip-rollup loop's `s !== ""` check.
 */
export function synthesizeStringLevel(
    rp: ColumnData,
    numRows: number,
    levelType: string,
): { indices: Int32Array; dictionary: string[] } {
    const values = rp.values!;
    const valid = rp.valid;
    const indices = new Int32Array(numRows);
    const dictionary: string[] = [""];
    const seen = new Map<string, number>();
    seen.set("", 0);

    for (let r = 0; r < numRows; r++) {
        const isValid = valid ? !!((valid[r >> 3] >> (r & 7)) & 1) : true;
        const v = values[r] as number;
        const label = formatLevelValue(v, isValid, levelType);
        let dictIdx = seen.get(label);
        if (dictIdx === undefined) {
            dictIdx = dictionary.length;
            dictionary.push(label);
            seen.set(label, dictIdx);
        }

        indices[r] = dictIdx;
    }

    return { indices, dictionary };
}

/**
 * Resolve the category axis for a categorical-X chart (bar, candlestick,
 * ohlc, …). Walks the `__ROW_PATH_N__` hierarchy columns, skips the
 * rollup rows at the top ("Total" parent aggregates), and returns fully
 * JS-owned level structures (precomputed labels + runs) plus the
 * trimmed category count.
 *
 * Non-string row-path columns (date / datetime / integer / float /
 * boolean group_by levels) are stringified into a synthetic dictionary
 * so the downstream label / run-length machinery is type-agnostic.
 *
 * When `groupByLen === 0`, there are no row-path columns and the
 * category axis falls back to the raw row index — callers infer that
 * from `rowPaths.length === 0`.
 */
export function resolveCategoryAxis(
    columns: ColumnDataMap,
    numRows: number,
    groupByLen: number,
    levelTypes: string[] = [],
): CategoryAxisResult {
    type RawLevel = { indices: Int32Array; dictionary: string[] };
    const rawRowPaths: RawLevel[] = [];
    for (let n = 0; ; n++) {
        const rp = columns.get(`__ROW_PATH_${n}__`);
        if (!rp) {
            break;
        }

        if (rp.type === "string" && rp.indices && rp.dictionary) {
            rawRowPaths.push({
                indices: rp.indices,
                dictionary: rp.dictionary,
            });
        } else if (rp.values) {
            const levelType = levelTypes[n] ?? "string";
            rawRowPaths.push(synthesizeStringLevel(rp, numRows, levelType));
        } else {
            break;
        }
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

            if (anyNonEmpty) {
                break;
            }

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
                      if (s.length > maxLabelChars) {
                          maxLabelChars = s.length;
                      }
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
