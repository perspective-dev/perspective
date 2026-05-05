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

import type { Context2D } from "../charts/canvas-types";

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
    ctx: Context2D,
    label: string,
    maxWidth: number,
): string {
    if (maxWidth <= 0) {
        return "";
    }

    if (ctx.measureText(label).width <= maxWidth) {
        return label;
    }

    let lo = 0;
    let hi = label.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const candidate = label.slice(0, mid) + "…";
        if (ctx.measureText(candidate).width <= maxWidth) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }

    return lo === 0 ? "" : label.slice(0, lo) + "…";
}

/**
 * Word-wrap `text` into at most `maxLines` lines, each fitting within
 * `maxWidth`. Breaks at the last whitespace before the fit boundary
 * when possible, falls back to a hard character break otherwise. The
 * final line is ellipsis-truncated via {@link truncateLabel} if it
 * still doesn't fit. Returns `[]` when nothing meaningful fits (only
 * one line of ≤ 2 chars after wrapping).
 */
export function wrapLabel(
    ctx: Context2D,
    text: string,
    maxWidth: number,
    maxLines: number,
): string[] {
    if (maxLines <= 0 || maxWidth <= 0) {
        return [];
    }

    if (ctx.measureText(text).width <= maxWidth) {
        return [text];
    }

    const lines: string[] = [];
    let remaining = text;

    while (remaining.length > 0 && lines.length < maxLines) {
        const isLastLine = lines.length === maxLines - 1;

        let fitLen = remaining.length;
        while (
            fitLen > 0 &&
            ctx.measureText(remaining.slice(0, fitLen)).width > maxWidth
        ) {
            fitLen--;
        }

        if (fitLen === 0) {
            fitLen = 1;
        }

        if (fitLen === remaining.length) {
            lines.push(remaining);
            break;
        }

        let breakAt = fitLen;
        const spaceIdx = remaining.lastIndexOf(" ", fitLen);
        if (spaceIdx > 0) {
            breakAt = spaceIdx;
        }

        if (isLastLine) {
            lines.push(truncateLabel(ctx, remaining, maxWidth));
            break;
        }

        lines.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).trimStart();
    }

    if (lines.length === 1 && lines[0].length <= 2) {
        return [];
    }

    return lines;
}
