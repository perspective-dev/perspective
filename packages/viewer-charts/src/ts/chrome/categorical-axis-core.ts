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
 * array. Used by the outer-level bracket renderer to coalesce a span of
 * contiguous cells into a single labelled group.
 */
export interface GroupRun {
    startIdx: number;
    /** Inclusive. */
    endIdx: number;
    dictIdx: number;
}

/**
 * Single-pass run-length encoding of `indices[startRow..endRow)`. Relies
 * on perspective's guarantee that rows sharing an outer-level dictionary
 * entry are emitted contiguously in traversal order — equal neighbours
 * always belong to the same span.
 */
export function buildGroupRuns(
    indices: Int32Array,
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
                dictIdx: runDict,
            });
            runStart = r;
            runDict = d;
        }
    }
    runs.push({ startIdx: runStart, endIdx: endRow - 1, dictIdx: runDict });
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
