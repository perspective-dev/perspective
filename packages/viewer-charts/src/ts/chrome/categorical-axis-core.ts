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
 * Orientation-neutral helpers shared by the horizontal and vertical
 * hierarchical categorical axes. Both axis painters specialize on top of
 * this core; the only thing they disagree on is where bracket lines and
 * leaf labels land on the plot chrome.
 */

/**
 * One run of consecutive equal dictionary indices in a level's `indices`
 * array, with the label pre-resolved. Used by the outer-level bracket
 * renderer to coalesce a span of contiguous cells into a single labelled
 * group.
 */
export interface GroupRun {
    startIdx: number;
    /** Inclusive. */
    endIdx: number;
    label: string;
}

/**
 * Single-pass run-length encoding of `indices[startRow..endRow)` keyed
 * by `dictionary`. Relies on perspective's guarantee that rows sharing
 * an outer-level dictionary entry are emitted contiguously in traversal
 * order — equal neighbours always belong to the same span. The emitted
 * `label` is a direct reference into `dictionary` (no per-row copy).
 */
export function buildGroupRuns(
    indices: Int32Array | ArrayLike<number>,
    dictionary: string[],
    startRow: number,
    endRow: number,
): GroupRun[] {
    const runs: GroupRun[] = [];
    if (endRow <= startRow) return runs;
    let runStart = startRow;
    let runDict = indices[startRow];
    for (let r = startRow + 1; r < endRow; r++) {
        const d = indices[r];
        if (d !== runDict) {
            runs.push({
                startIdx: runStart,
                endIdx: r - 1,
                label: dictionary[runDict] ?? "",
            });
            runStart = r;
            runDict = d;
        }
    }
    runs.push({
        startIdx: runStart,
        endIdx: endRow - 1,
        label: dictionary[runDict] ?? "",
    });
    return runs;
}

/**
 * Longest string length in a dictionary. O(dictSize), not O(numRows).
 * Drives the rotation decision on the leaf level of the X axis and the
 * column-width decision on the Y axis.
 */
export function maxDictLength(dictionary: string[]): number {
    let m = 0;
    for (const s of dictionary) {
        if (s != null && s.length > m) m = s.length;
    }
    return m;
}

/**
 * Filter a precomputed `runs` array to those whose index range
 * intersects `[visMin, visMax]` (inclusive on both sides). Runs that
 * straddle an endpoint are clipped so the caller sees `startIdx`/
 * `endIdx` pinned to the visible slice — this matches the legacy
 * `buildGroupRuns(indices, visMin, visMax + 1)` return shape.
 */
export function runsInRange(
    runs: GroupRun[],
    visMin: number,
    visMax: number,
): GroupRun[] {
    if (visMax < visMin) return [];
    const out: GroupRun[] = [];
    for (const run of runs) {
        if (run.endIdx < visMin || run.startIdx > visMax) continue;
        const startIdx = run.startIdx < visMin ? visMin : run.startIdx;
        const endIdx = run.endIdx > visMax ? visMax : run.endIdx;
        if (startIdx === run.startIdx && endIdx === run.endIdx) {
            out.push(run);
        } else {
            out.push({ startIdx, endIdx, label: run.label });
        }
    }
    return out;
}
