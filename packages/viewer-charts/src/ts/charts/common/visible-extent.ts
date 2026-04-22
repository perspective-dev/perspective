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
 * Generic "find the value-axis extent among records whose category
 * position falls inside a visible window" helper. Used by Y Bar,
 * X Bar, Candlestick, and any future categorical-axis chart that
 * wants an auto-fit value axis on zoom.
 *
 * Takes a pre-extracted numeric tuple per record via the `extract`
 * callback instead of reading fields directly, so the same code path
 * handles both Bar's `{ catIdx, y0, y1, axis, seriesId }` shape and
 * Candlestick's `{ xCenter, low, high }` shape.
 *
 * TODO(perf): linear scan. Callers that order records by category
 * index could pre-sort once and binary-search the slice to reduce
 * this to O(log N + K_visible). Deferred until profiling shows the
 * scan in the hot path.
 */
export interface VisibleExtent {
    min: number;
    max: number;
    hasFit: boolean;
}

export interface VisibleExtentRecord {
    /** Position on the categorical axis — compared to the visible window. */
    cat: number;
    /** Low bound of the value-axis extent for this record. */
    lo: number;
    /** High bound of the value-axis extent for this record. */
    hi: number;
    /** True to skip this record (hidden series / wrong axis / etc.). */
    skip: boolean;
}

/**
 * Walk `items`, filter by `visCatMin <= cat <= visCatMax` (and the
 * caller-supplied `skip` flag), and return min/max over `lo`/`hi`.
 *
 * Returns `hasFit: false` when the window matches no records, so
 * callers can fall back to the base domain.
 *
 * Zero-range guard: if every visible record shares a single value
 * (flat run), pad by `±|value|` so the axis doesn't collapse to a
 * single pixel.
 */
export function computeVisibleExtent<T>(
    items: readonly T[],
    visCatMin: number,
    visCatMax: number,
    extract: (item: T, out: VisibleExtentRecord) => void,
    out: VisibleExtent,
): VisibleExtent {
    let min = Infinity;
    let max = -Infinity;
    // Reuse a single scratch record across the walk. `extract` mutates
    // it in place — zero allocations per iteration.
    const scratch: VisibleExtentRecord = { cat: 0, lo: 0, hi: 0, skip: false };
    for (let i = 0; i < items.length; i++) {
        scratch.skip = false;
        extract(items[i], scratch);
        if (scratch.skip) continue;
        if (scratch.cat < visCatMin || scratch.cat > visCatMax) continue;
        if (scratch.lo < min) min = scratch.lo;
        if (scratch.hi > max) max = scratch.hi;
    }
    const hasFit = isFinite(min) && isFinite(max);
    if (hasFit && min === max) {
        const pad = Math.abs(min) || 1;
        min -= pad;
        max += pad;
    }
    out.min = min;
    out.max = max;
    out.hasFit = hasFit;
    return out;
}
