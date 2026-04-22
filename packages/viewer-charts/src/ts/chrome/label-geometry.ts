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
 * Generic pixel-space label geometry helpers shared by the axis,
 * legend, and tooltip overlays.
 *
 * All rectangles are in CSS pixels, origin top-left, Y-axis pointing down.
 */

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type Rotation = 0 | 45 | 90;

/**
 * Bounding rectangle of a text label anchored at `(cx, cy)`, accounting for
 * rotation. Matches d3fc's approximation of rotated text bounds.
 */
export function labelRect(
    cx: number,
    cy: number,
    textWidth: number,
    textHeight: number,
    rotation: Rotation,
): Rect {
    if (rotation === 0) {
        return {
            x: cx - textWidth / 2,
            y: cy,
            width: textWidth,
            height: textHeight,
        };
    }
    if (rotation === 90) {
        return {
            x: cx - textHeight / 2,
            y: cy,
            width: textHeight,
            height: textWidth,
        };
    }
    const w = (textWidth + textHeight) / Math.SQRT2;
    return { x: cx - w, y: cy, width: w, height: w };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
    return (
        a.x <= b.x + b.width &&
        b.x <= a.x + a.width &&
        a.y <= b.y + b.height &&
        b.y <= a.y + a.height
    );
}

/**
 * Rotated-label overlap heuristic from d3fc: for steeply-rotated labels
 * the right edge of the previous box must precede the right edge of the
 * next (plus a small gap).
 */
export function rotatedLabelsOverlap(a: Rect, b: Rect): boolean {
    return a.x + a.width + 14 > b.x + b.width;
}

export function rectContained(inner: Rect, outer: Rect): boolean {
    return (
        inner.x >= outer.x &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y >= outer.y &&
        inner.y + inner.height <= outer.y + outer.height
    );
}

/**
 * Truncate `label` with a trailing ellipsis so the rendered width fits
 * within `maxWidth`. Returns "" when even one character would overflow.
 */
export function truncateLabel(
    ctx: CanvasRenderingContext2D,
    label: string,
    maxWidth: number,
): string {
    if (maxWidth <= 0) return "";
    if (ctx.measureText(label).width <= maxWidth) return label;
    let lo = 0;
    let hi = label.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const candidate = label.slice(0, mid) + "…";
        if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return lo === 0 ? "" : label.slice(0, lo) + "…";
}
