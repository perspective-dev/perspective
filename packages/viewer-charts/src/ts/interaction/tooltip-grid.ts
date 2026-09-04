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

import type { Context2D } from "../charts/canvas-types";
import type { Theme } from "../theme/theme";

export type TooltipRow = string[];

export type TooltipContent = TooltipRow[];

export interface TooltipStyle {
    opacity: number;
    maxColumnPx: number;
}

export const DEFAULT_TOOLTIP_STYLE: TooltipStyle = {
    opacity: 1.0,
    maxColumnPx: 160,
};

export function tooltipStyleOf(cfg: {
    tooltip_opacity: number;
    tooltip_max_column_px: number;
}): TooltipStyle {
    return {
        opacity: cfg.tooltip_opacity,
        maxColumnPx: cfg.tooltip_max_column_px,
    };
}

export const NUMERIC_RE =
    /^[-+−]?[$€£¥]?\s?\d[\d.,  \s]*(?:[eE][-+]?\d+|[KMB%])?$/;

export const TOOLTIP_ROW_HEIGHT = 16;
export const TOOLTIP_PADDING = 8;
export const TOOLTIP_COL_GAP = 8;

export interface MeasuredTooltipGrid {
    rows: string[][];

    colWidths: number[];

    colRightAlign: boolean[];

    boxW: number;
    boxH: number;
}

/**
 * Measure a tooltip grid under the current `ctx.font`.
 */
export function measureTooltipGrid(
    ctx: Context2D,
    grid: TooltipContent,
    maxColumnPx: number,
): MeasuredTooltipGrid {
    const spanCap = maxColumnPx * 2 + TOOLTIP_COL_GAP;
    const colWidths: number[] = [];
    const colNumeric: boolean[] = [];
    const rows: string[][] = [];
    let spanWidth = 0;

    for (const row of grid) {
        if (row.length <= 1) {
            const text = ellipsize(ctx, row[0] ?? "", spanCap);
            rows.push([text]);
            spanWidth = Math.max(spanWidth, ctx.measureText(text).width);
            continue;
        }

        const cells: string[] = [];
        for (let j = 0; j < row.length; j++) {
            const original = row[j] ?? "";
            const text = ellipsize(ctx, original, maxColumnPx);
            cells.push(text);
            colWidths[j] = Math.max(
                colWidths[j] ?? 0,
                ctx.measureText(text).width,
            );
            if (j >= 1 && original !== "") {
                const numeric = NUMERIC_RE.test(original);
                colNumeric[j] =
                    colNumeric[j] === undefined
                        ? numeric
                        : colNumeric[j] && numeric;
            }
        }

        rows.push(cells);
    }

    let columnsWidth = 0;
    for (let j = 0; j < colWidths.length; j++) {
        columnsWidth += colWidths[j] + (j > 0 ? TOOLTIP_COL_GAP : 0);
    }

    const innerW = Math.max(spanWidth, columnsWidth);
    return {
        rows,
        colWidths,
        colRightAlign: colWidths.map(
            (_, j) => (colNumeric[j] ?? false) && j >= 1,
        ),
        boxW: innerW + TOOLTIP_PADDING * 2,
        boxH: grid.length * TOOLTIP_ROW_HEIGHT + TOOLTIP_PADDING * 2 - 4,
    };
}

/**
 * Paint a measured tooltip grid at `(tx, ty)`.
 */
export function paintTooltipGrid(
    ctx: Context2D,
    measured: MeasuredTooltipGrid,
    tx: number,
    ty: number,
    theme: Theme,
    opacity: number,
): void {
    const { rows, colWidths, colRightAlign, boxW, boxH } = measured;

    ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
    ctx.fillStyle = theme.tooltipBg;
    ctx.strokeStyle = theme.tooltipBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(tx, ty, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = theme.tooltipText;
    ctx.textBaseline = "top";
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowY = ty + TOOLTIP_PADDING + i * TOOLTIP_ROW_HEIGHT;
        if (row.length <= 1) {
            ctx.textAlign = "left";
            ctx.fillText(row[0], tx + TOOLTIP_PADDING, rowY);
            continue;
        }

        let colX = tx + TOOLTIP_PADDING;
        for (let j = 0; j < row.length; j++) {
            const width = colWidths[j] ?? 0;
            if (colRightAlign[j]) {
                ctx.textAlign = "right";
                ctx.fillText(row[j], colX + width, rowY);
            } else {
                ctx.textAlign = "left";
                ctx.fillText(row[j], colX, rowY);
            }

            colX += width + TOOLTIP_COL_GAP;
        }
    }

    ctx.textAlign = "left";
}

export function ellipsize(ctx: Context2D, text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) {
        return text;
    }

    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }

    return text.slice(0, lo) + "…";
}
