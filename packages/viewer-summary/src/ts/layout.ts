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

import type { LabelPosition } from "./types.ts";

export type LabelPlacement = Exclude<LabelPosition, "auto">;

/** A tile's text widths per pixel of font size. */
export interface TileMetrics {
    value: number;
    label: number;
}

export interface LayoutInput {
    width: number;
    height: number;
    tiles: TileMetrics[];
    label_position: LabelPosition;
    uniform: boolean;

    /** Height reserved beneath each value, in multiples of its font size. */
    extra: number;
}

export interface Layout {
    cols: number;
    rows: number;

    /** Fixed tile height in pixels when the tiles overflow and scroll. */
    tile_height: number | undefined;
    padding: number;
    label_position: LabelPlacement;
    label_size: number;
    value_sizes: number[];
}

export const GAP = 1;
const VALUE_LINE_HEIGHT = 1.1;
const LABEL_LINE_HEIGHT = 1.3;
export const BREAKDOWN_EXTRA = 0.5;
export const TRACK_EXTRA = 0.2;

const LABEL_RATIO = 0.28;
const LABEL_MIN = 10;
const LABEL_MAX = 22;
const MIN_VALUE_SIZE = 14;
const INLINE_LABEL_MAX = 0.4;
const INLINE_LABEL_GAP = 0.75;
const FIT_SLACK = 0.96;
const SCROLL_PADDING = 8;
const SCROLLBAR = 12;

interface Fit {
    value: number;
    label: number;
    padding: number;
    placement: LabelPlacement;
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}

function is_stacked(placement: LabelPlacement): boolean {
    return placement === "top" || placement === "bottom";
}

/** The largest value font size that fits a `(w, h)` cell beside `label`. */
function fit_value(
    w: number,
    h: number,
    padding: number,
    label: number,
    em: TileMetrics,
    placement: LabelPlacement,
    extra: number,
): number {
    const iw = Math.max(1, w - 2 * padding);
    const ih = Math.max(1, h - 2 * padding);
    const lines = VALUE_LINE_HEIGHT + extra;
    if (placement === "none") {
        return Math.min(ih / lines, iw / em.value);
    }

    if (is_stacked(placement)) {
        return Math.min(
            (ih - label * LABEL_LINE_HEIGHT) / lines,
            iw / em.value,
        );
    }

    const label_width = Math.min(em.label * label, iw * INLINE_LABEL_MAX);
    return Math.min(
        ih / lines,
        (iw - label_width - label * INLINE_LABEL_GAP) / em.value,
    );
}

function label_for(value: number, placement: LabelPlacement): number {
    return placement === "none"
        ? 0
        : clamp(value * LABEL_RATIO, LABEL_MIN, LABEL_MAX);
}

function fit_cell(
    w: number,
    h: number,
    em: TileMetrics,
    placement: LabelPlacement,
    extra: number,
): Fit {
    const padding = clamp(Math.min(w, h) * 0.08, 4, 24);
    const ih = Math.max(1, h - 2 * padding);
    const share = is_stacked(placement) ? LABEL_RATIO * LABEL_LINE_HEIGHT : 0;
    const by_height = ih / (VALUE_LINE_HEIGHT + extra + share);
    const guess = fit_value(
        w,
        h,
        padding,
        label_for(by_height, placement),
        em,
        placement,
        extra,
    );

    const label = label_for(guess, placement);
    const value = fit_value(w, h, padding, label, em, placement, extra);
    return { value, label, padding, placement };
}

function best_fit(
    w: number,
    h: number,
    em: TileMetrics,
    position: LabelPosition,
    extra: number,
): Fit {
    if (position !== "auto") {
        return fit_cell(w, h, em, position, extra);
    }

    const top = fit_cell(w, h, em, "top", extra);
    const left = fit_cell(w, h, em, "left", extra);
    return left.value > top.value ? left : top;
}

/** The width of tile `index`, whose row stretches to fill the container. */
function tile_width(
    index: number,
    count: number,
    cols: number,
    rows: number,
    width: number,
): number {
    const row = Math.floor(index / cols);
    const in_row = row < rows - 1 ? cols : count - (rows - 1) * cols;
    return (width - (in_row - 1) * GAP) / in_row;
}

/**
 * The grid shape, label placement and font sizes that give `input.tiles` the
 * largest value text in a `(width, height)` box, falling back to fixed-height
 * scrolling tiles when that text would be too small to read.
 */
export function compute_layout(input: LayoutInput): Layout {
    const { width, height, tiles, label_position, uniform, extra } = input;
    const count = tiles.length;
    if (count === 0 || width <= 0 || height <= 0) {
        return {
            cols: 1,
            rows: 1,
            tile_height: undefined,
            padding: 4,
            label_position: label_position === "auto" ? "top" : label_position,
            label_size: LABEL_MIN,
            value_sizes: tiles.map(() => MIN_VALUE_SIZE),
        };
    }

    const widest: TileMetrics = {
        value: Math.max(...tiles.map((x) => x.value)),
        label: Math.max(...tiles.map((x) => x.label)),
    };

    let cols = 1;
    let rows = count;
    let total = Infinity;
    let fit: Fit | undefined;
    for (let c = 1; c <= count; c++) {
        const r = Math.ceil(count / c);
        const w = (width - (c - 1) * GAP) / c;
        const h = (height - (r - 1) * GAP) / r;
        const candidate = best_fit(w, h, widest, label_position, extra);
        if (
            fit === undefined ||
            candidate.value > fit.value ||
            (candidate.value === fit.value && c * r < total)
        ) {
            cols = c;
            rows = r;
            total = c * r;
            fit = candidate;
        }
    }

    let box_width = width;
    let cell_height = (height - (rows - 1) * GAP) / rows;
    let tile_height: number | undefined;
    if (fit!.value * FIT_SLACK < MIN_VALUE_SIZE) {
        const placement = label_position === "auto" ? "top" : label_position;
        const label = placement === "none" ? 0 : LABEL_MIN;
        const stacked = is_stacked(placement);
        const inline = placement === "left" || placement === "right";
        tile_height = Math.ceil(
            (MIN_VALUE_SIZE / FIT_SLACK) * (VALUE_LINE_HEIGHT + extra) +
                (stacked ? label * LABEL_LINE_HEIGHT : 0) +
                2 * SCROLL_PADDING,
        );

        box_width = Math.max(1, width - SCROLLBAR);
        const min_width =
            (MIN_VALUE_SIZE / FIT_SLACK) * widest.value +
            (inline ? (widest.label + INLINE_LABEL_GAP) * label : 0) +
            2 * SCROLL_PADDING;

        cols = clamp(
            Math.floor((box_width + GAP) / (min_width + GAP)),
            1,
            count,
        );
        rows = Math.ceil(count / cols);
        cell_height = tile_height;
        fit = { value: 0, label, padding: SCROLL_PADDING, placement };
    }

    const { label, padding, placement } = fit!;
    const sizes = tiles.map((em, index) => {
        const w = tile_width(index, count, cols, rows, box_width);
        return fit_value(
            w,
            cell_height,
            padding,
            label,
            uniform ? widest : em,
            placement,
            extra,
        );
    });

    const shared = Math.min(...sizes);
    const value_sizes = sizes.map((x) => {
        const px = (uniform ? shared : x) * FIT_SLACK;
        return Math.max(1, Math.floor(px * 2) / 2);
    });

    return {
        cols,
        rows,
        tile_height,
        padding,
        label_position: placement,
        label_size: label,
        value_sizes,
    };
}
