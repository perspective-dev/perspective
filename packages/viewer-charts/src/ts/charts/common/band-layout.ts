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
 * Shared per-category band geometry used by categorical-X charts (bar,
 * candlestick, ohlc). The category axis uses unit-wide bands centered
 * on integer indices; within each band, `numSlots` rectangles (bars,
 * candles, …) are laid out side by side with a small inner padding.
 */

/** Fraction of a category's band width actually covered by slots. */
export const BAND_INNER_FRAC = 0.5;

/** Relative padding between adjacent slots within a band. */
export const BAR_INNER_PAD = 0.1;

export interface SlotGeometry {
    /** Width (in data-space units) of a single slot. */
    slotWidth: number;
    /** Half the drawable width of each slot after inner padding. */
    halfWidth: number;
}

/** Compute slot geometry for `numSlots` rectangles per category band. */
export function computeSlotGeometry(numSlots: number): SlotGeometry {
    const slotWidth = BAND_INNER_FRAC / Math.max(1, numSlots);
    const halfWidth = (slotWidth * (1 - BAR_INNER_PAD)) / 2;
    return { slotWidth, halfWidth };
}

/**
 * X-center for slot `slotIdx` of `numSlots` in the band centered at
 * `catIdx`. Matches bar's layout: slot 0 on the far left, numSlots-1 on
 * the far right, symmetric about `catIdx`.
 */
export function slotCenter(
    catIdx: number,
    slotIdx: number,
    numSlots: number,
    slotWidth: number,
): number {
    return catIdx + (slotIdx - (numSlots - 1) / 2) * slotWidth;
}
