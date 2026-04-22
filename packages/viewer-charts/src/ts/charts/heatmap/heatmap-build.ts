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

export interface HeatmapCell {
    xIdx: number;
    yIdx: number;
    value: number;
}

export interface HeatmapPipelineInput {
    columns: ColumnDataMap;
    numRows: number;
    groupBy: string[];
}

export interface HeatmapPipelineResult {
    /** Hierarchical row_path levels driving the X axis (outermost-first). */
    xLevels: CategoricalLevel[];
    /** Arrow column names in iteration order; `yIdx === index in this list`. */
    yColumnNames: string[];
    /** Hierarchical Y levels derived by splitting each name on `|`. */
    yLevels: CategoricalLevel[];
    numX: number;
    numY: number;
    rowOffset: number;
    cells: HeatmapCell[];
    /** O(1) lookup by `yIdx * numX + xIdx`; `null` means no-data. */
    cells2D: (HeatmapCell | null)[];
    colorMin: number;
    colorMax: number;
}

/**
 * Pure heatmap pipeline. Y indexing maps 1:1 to the arrow column iteration
 * order — `yIdx` is the position of a value column in the ordered
 * `ColumnDataMap` (after skipping `__ROW_PATH_N__` metadata). No
 * aggregate/split reconstruction; the column name *is* the Y label.
 *
 * Externally enforced: only one entry sits in the `Color` slot, so every
 * non-metadata column is a splitwise expansion of that single aggregate.
 */
export function buildHeatmapPipeline(
    input: HeatmapPipelineInput,
): HeatmapPipelineResult {
    const { columns, numRows, groupBy } = input;

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
    };

    // Resolve group_by row-paths + grand-total offset (same as bar pipeline).
    const rawRowPaths: CategoricalLevel[] = [];
    for (let n = 0; ; n++) {
        const rp = columns.get(`__ROW_PATH_${n}__`);
        if (!rp || rp.type !== "string" || !rp.indices || !rp.dictionary) break;
        rawRowPaths.push({ indices: rp.indices, dictionary: rp.dictionary });
    }

    let rowOffset = 0;
    if (groupBy.length > 0 && rawRowPaths.length > 0) {
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
    const numX = Math.max(0, numRows - rowOffset);

    const xLevels: CategoricalLevel[] =
        groupBy.length > 0 && rawRowPaths.length > 0
            ? rawRowPaths.map((rp) => ({
                  indices:
                      rowOffset === 0
                          ? rp.indices
                          : rp.indices.subarray(rowOffset),
                  dictionary: rp.dictionary,
              }))
            : [];

    // Enumerate Y columns in arrow iteration order, skipping metadata.
    const yColumnNames: string[] = [];
    for (const name of columns.keys()) {
        if (name.startsWith("__")) continue;
        const col = columns.get(name);
        if (!col?.values) continue;
        yColumnNames.push(name);
    }
    const numY = yColumnNames.length;

    if (numX === 0 || numY === 0) return empty;

    // Build hierarchical Y levels by splitting each name on `|`, coalescing
    // consecutive equal tokens per level into a shared dictionary entry.
    // Shape mirrors `CategoricalLevel`: one `Int32Array` of dictionary
    // indices (length `numY`) + a string dictionary per level.
    const yLevels = buildYLevelsFromNames(yColumnNames);

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
                if (!bit) continue;
            }
            const v = values[row] as number;
            if (!isFinite(v)) continue;

            const cell: HeatmapCell = { xIdx, yIdx, value: v };
            cells.push(cell);
            cells2D[yIdx * numX + xIdx] = cell;
            if (v < colorMin) colorMin = v;
            if (v > colorMax) colorMax = v;
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
    };
}

/**
 * Split each column name on `|` → hierarchical levels. Outermost segment
 * is index 0; leaf (terminal) segment is `levels.length - 1`. Runs of
 * identical consecutive outer tokens naturally coalesce later during
 * render because the Y axis compares `indices[yIdx]` against neighbours.
 */
function buildYLevelsFromNames(names: string[]): CategoricalLevel[] {
    if (names.length === 0) return [];
    // Find max depth across all names so every Y entry has a value at
    // every level.
    let maxDepth = 0;
    const segments: string[][] = names.map((n) => n.split("|"));
    for (const s of segments) {
        if (s.length > maxDepth) maxDepth = s.length;
    }
    if (maxDepth === 0) return [];

    const levels: CategoricalLevel[] = [];
    for (let d = 0; d < maxDepth; d++) {
        const dictionary: string[] = [];
        const dictIndex = new Map<string, number>();
        const indices = new Int32Array(names.length);
        for (let i = 0; i < names.length; i++) {
            const seg = segments[i][d] ?? "";
            let idx = dictIndex.get(seg);
            if (idx === undefined) {
                idx = dictionary.length;
                dictionary.push(seg);
                dictIndex.set(seg, idx);
            }
            indices[i] = idx;
        }
        levels.push({ indices, dictionary });
    }
    return levels;
}
