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
import type { CategoricalLevel } from "../../axis/categorical-axis";
import { buildGroupRuns } from "../../axis/categorical-axis-core";
import {
    resolveAxisMode,
    resolveCategoryAxis,
    resolveNumericCategoryDomain,
    type AxisMode,
    type NumericCategoryDomain,
} from "../common/category-axis-resolver";

export interface HeatmapCell {
    xIdx: number;
    yIdx: number;
    value: number;
}

export interface HeatmapPipelineInput {
    columns: ColumnDataMap;
    numRows: number;
    groupBy: string[];
    splitBy: string[];

    /**
     * Source-column types keyed by column name (table.schema() merged
     * with view.expression_schema()). Drives both the X-axis level-type
     * lookup (for non-string row-paths) and the Y-axis numeric-mode
     * decision when there's a single split_by.
     */
    groupByTypes: Record<string, string>;
}

export interface HeatmapPipelineResult {
    /**
     * Hierarchical row_path levels driving the X axis (outermost-first).
     */
    xLevels: CategoricalLevel[];

    /**
     * Arrow column names in iteration order; `yIdx === index in this list`.
     */
    yColumnNames: string[];

    /**
     * Hierarchical Y levels derived by splitting each name on `|`.
     */
    yLevels: CategoricalLevel[];
    numX: number;
    numY: number;
    rowOffset: number;
    cells: HeatmapCell[];

    /**
     * O(1) lookup by `yIdx * numX + xIdx`; `null` means no-data.
     */
    cells2D: (HeatmapCell | null)[];
    colorMin: number;
    colorMax: number;

    /**
     * X-axis mode. `numeric` fires when the single group_by is
     * date/datetime/integer/float; positions live in `xPositions`
     * and the domain in `xNumericDomain`.
     */
    xAxisMode: AxisMode;
    yAxisMode: AxisMode;
    xPositions: Float64Array | null;
    yPositions: Float64Array | null;
    xNumericDomain: NumericCategoryDomain | null;
    yNumericDomain: NumericCategoryDomain | null;
}

/**
 * Pure heatmap pipeline. Y indexing maps 1:1 to the arrow column iteration
 * order — `yIdx` is the position of a value column in the ordered
 * `ColumnDataMap` (after skipping `__ROW_PATH_N__` metadata). No
 * aggregate/split reconstruction; the column name *is* the Y label.
 *
 * Externally enforced: only one entry sits in the `Color` slot, so every
 * non-metadata column is a splitwise expansion of that single aggregate.
 *
 * Numeric-axis mode (matching bar/candlestick): when there's exactly one
 * non-string group_by, the X axis switches to a real numeric/date axis
 * with `xPositions[xIdx]` carrying the data-space center. Y mirrors this
 * for a single non-string split_by, parsed best-effort out of the column
 * name leaf segment; on parse failure it falls back to category mode.
 */
export function buildHeatmapPipeline(
    input: HeatmapPipelineInput,
): HeatmapPipelineResult {
    const { columns, numRows, groupBy, splitBy, groupByTypes } = input;

    const xAxisMode = resolveAxisMode(groupBy, groupByTypes);

    const empty: HeatmapPipelineResult = {
        xLevels: [],
        yColumnNames: [],
        yLevels: [],
        numX: 0,
        numY: 0,
        rowOffset: 0,
        cells: [],
        cells2D: [],
        colorMin: 0,
        colorMax: 1,
        xAxisMode,
        yAxisMode: { mode: "category" },
        xPositions: null,
        yPositions: null,
        xNumericDomain: null,
        yNumericDomain: null,
    };

    const levelTypes = groupBy.map((name) => groupByTypes[name] ?? "string");
    const {
        rowPaths: xLevels,
        numCategories: numX,
        rowOffset,
    } = resolveCategoryAxis(columns, numRows, groupBy.length, levelTypes);

    // Numeric X domain: sourced from `__ROW_PATH_0__`'s raw values when
    // the single group_by is non-string.
    let xPositions: Float64Array | null = null;
    let xNumericDomain: NumericCategoryDomain | null = null;
    if (xAxisMode.mode === "numeric" && numX > 0) {
        const rp = columns.get("__ROW_PATH_0__");
        const resolved = resolveNumericCategoryDomain(
            rp?.values,
            numX,
            rowOffset,
            groupBy[0] ?? "",
            xAxisMode.numericType === "date" ||
                xAxisMode.numericType === "datetime",
        );
        if (resolved) {
            xPositions = resolved.categoryPositions;
            xNumericDomain = resolved.numericCategoryDomain;
        }
    }

    // Enumerate Y columns in arrow iteration order, skipping metadata.
    const yColumnNames: string[] = [];
    for (const name of columns.keys()) {
        if (name.startsWith("__")) {
            continue;
        }

        const col = columns.get(name);
        if (!col?.values) {
            continue;
        }

        yColumnNames.push(name);
    }

    const numY = yColumnNames.length;

    if (numX === 0 || numY === 0) {
        return { ...empty, xLevels, rowOffset };
    }

    // Build hierarchical Y levels by splitting each name on `|`, coalescing
    // consecutive equal tokens per level into a shared dictionary entry.
    // Shape mirrors `CategoricalLevel`: one `Int32Array` of dictionary
    // indices (length `numY`) + a string dictionary per level.
    const yLevels = buildYLevelsFromNames(yColumnNames);

    // Y-numeric mode: only when split_by has exactly one non-string level
    // AND every column name parses into a finite number. The leaf segment
    // is the (split_value, aggregate) `splitVal` token — leading segment
    // when there's a trailing `|aggregate`, or the whole name when there
    // is none.
    const yAxisModeRaw = resolveYAxisMode(splitBy, groupByTypes);
    let yAxisMode: AxisMode = { mode: "category" };
    let yPositions: Float64Array | null = null;
    let yNumericDomain: NumericCategoryDomain | null = null;
    if (yAxisModeRaw.mode === "numeric") {
        const parsed = parseYPositions(yColumnNames, yAxisModeRaw.numericType);
        if (parsed) {
            const resolved = resolveNumericCategoryDomain(
                parsed,
                numY,
                0,
                splitBy[0] ?? "",
                yAxisModeRaw.numericType === "date" ||
                    yAxisModeRaw.numericType === "datetime",
            );
            if (resolved) {
                yAxisMode = yAxisModeRaw;
                yPositions = resolved.categoryPositions;
                yNumericDomain = resolved.numericCategoryDomain;
            }
        }
    }

    // Walk cells. Per-column loop (outer) lets us exploit arrow-contiguous
    // value arrays; validity checks are bit-mask reads.
    const cells: HeatmapCell[] = [];
    const cells2D: (HeatmapCell | null)[] = new Array(numX * numY).fill(null);
    let colorMin = Infinity;
    let colorMax = -Infinity;

    for (let yIdx = 0; yIdx < numY; yIdx++) {
        const col = columns.get(yColumnNames[yIdx])!;
        const values = col.values!;
        const valid = col.valid;
        for (let xIdx = 0; xIdx < numX; xIdx++) {
            const row = xIdx + rowOffset;
            if (valid) {
                const bit = (valid[row >> 3] >> (row & 7)) & 1;
                if (!bit) {
                    continue;
                }
            }

            const v = values[row] as number;
            if (!isFinite(v)) {
                continue;
            }

            const cell: HeatmapCell = { xIdx, yIdx, value: v };
            cells.push(cell);
            cells2D[yIdx * numX + xIdx] = cell;
            if (v < colorMin) {
                colorMin = v;
            }

            if (v > colorMax) {
                colorMax = v;
            }
        }
    }

    if (!isFinite(colorMin) || !isFinite(colorMax)) {
        colorMin = 0;
        colorMax = 1;
    } else if (colorMin === colorMax) {
        // Degenerate: all equal — nudge so the normalized t is 0 throughout.
        colorMax = colorMin + 1;
    }

    return {
        xLevels,
        yColumnNames,
        yLevels,
        numX,
        numY,
        rowOffset,
        cells,
        cells2D,
        colorMin,
        colorMax,
        xAxisMode,
        yAxisMode,
        xPositions,
        yPositions,
        xNumericDomain,
        yNumericDomain,
    };
}

/**
 * Y-axis mode for heatmap. Only fires when `splitBy.length === 1` and the
 * split column is non-string non-boolean. Multi-split chains stringify
 * each segment so the numeric round-trip is ambiguous; keep them on the
 * categorical path.
 */
function resolveYAxisMode(
    splitBy: string[],
    splitByTypes: Record<string, string>,
): AxisMode {
    if (splitBy.length !== 1) {
        return { mode: "category" };
    }

    const t = splitByTypes[splitBy[0]];
    if (t === "date" || t === "datetime" || t === "integer" || t === "float") {
        return { mode: "numeric", numericType: t };
    }

    return { mode: "category" };
}

/**
 * Best-effort parse of the leading `|`-segment of every column name back
 * into a numeric value. Returns `null` if any name fails to parse —
 * caller falls back to category mode.
 *
 * Date/datetime split values are written by the engine as ISO-ish text;
 * `Date.parse` accepts both `YYYY-MM-DD` and `YYYY-MM-DD HH:MM:SS.fff`.
 * Integer/float go through `Number()`.
 */
function parseYPositions(
    names: string[],
    numericType: "date" | "datetime" | "integer" | "float",
): Float64Array | null {
    const positions = new Float64Array(names.length);
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const pipeIdx = name.indexOf("|");
        const seg = pipeIdx === -1 ? name : name.slice(0, pipeIdx);
        let v: number;
        if (numericType === "date" || numericType === "datetime") {
            v = Date.parse(seg);
            if (!isFinite(v)) {
                // Engine sometimes emits `YYYY-MM-DD HH:MM:SS.fff` with a
                // space separator that older browsers reject; retry with
                // `T` substitution.
                v = Date.parse(seg.replace(" ", "T"));
            }
        } else {
            v = Number(seg);
        }

        if (!isFinite(v)) {
            return null;
        }

        positions[i] = v;
    }

    return positions;
}

/**
 * Partition a `ColumnDataMap` into one sub-map per user column. Every
 * arrow value column is assigned to the partition whose user column name
 * matches its terminal segment (everything after the last `|`, which
 * equals the whole name when there's no `split_by`). `__ROW_PATH_N__`
 * and `__GROUPING_ID__` metadata columns are copied into every partition
 * since they describe the shared X axis.
 *
 * Used to render one heatmap per user column in a facet grid.
 */
export function partitionColumnsPerFacet(
    columns: ColumnDataMap,
    userColumns: string[],
): Array<{ label: string; columns: ColumnDataMap }> {
    return userColumns.map((userCol) => {
        const partition: ColumnDataMap = new Map();
        for (const [name, col] of columns) {
            if (name.startsWith("__ROW_PATH_") || name === "__GROUPING_ID__") {
                partition.set(name, col);
                continue;
            }

            const pipeIdx = name.lastIndexOf("|");
            const leaf = pipeIdx === -1 ? name : name.slice(pipeIdx + 1);
            if (leaf === userCol) {
                partition.set(name, col);
            }
        }

        return { label: userCol, columns: partition };
    });
}

/**
 * Split each column name on `|` → hierarchical levels. Outermost segment
 * is index 0; leaf (terminal) segment is `levels.length - 1`. Runs of
 * identical consecutive outer tokens naturally coalesce later during
 * render because the Y axis compares `indices[yIdx]` against neighbours.
 */
function buildYLevelsFromNames(names: string[]): CategoricalLevel[] {
    if (names.length === 0) {
        return [];
    }

    // Find max depth across all names so every Y entry has a value at
    // every level.
    let maxDepth = 0;
    const segments: string[][] = names.map((n) => n.split("|"));
    for (const s of segments) {
        if (s.length > maxDepth) {
            maxDepth = s.length;
        }
    }

    if (maxDepth === 0) {
        return [];
    }

    const levels: CategoricalLevel[] = [];
    for (let d = 0; d < maxDepth; d++) {
        const dictionary: string[] = [];
        const dictIndex = new Map<string, number>();
        const indices = new Int32Array(names.length);
        const labels = new Array<string>(names.length);
        let maxLabelChars = 0;
        for (let i = 0; i < names.length; i++) {
            const seg = segments[i][d] ?? "";
            let idx = dictIndex.get(seg);
            if (idx === undefined) {
                idx = dictionary.length;
                dictionary.push(seg);
                dictIndex.set(seg, idx);
            }

            indices[i] = idx;
            labels[i] = seg;
            if (seg.length > maxLabelChars) {
                maxLabelChars = seg.length;
            }
        }

        const isLeaf = d === maxDepth - 1;
        const runs = isLeaf
            ? []
            : buildGroupRuns(indices, dictionary, 0, names.length);
        levels.push({ labels, runs, maxLabelChars });
    }

    return levels;
}
