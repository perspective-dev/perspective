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

import type { Canvas2D, Context2D } from "../charts/canvas-types";
import type { PlotLayout } from "../layout/plot-layout";
import type { Theme } from "../theme/theme";

export type AxisSide = "bottom" | "left" | "right";

export interface AxisIndicator {
    side: AxisSide;

    px: number;
    py: number;

    text: string;
}

const BADGE_FONT_PX = 11;
const BADGE_PAD_H = 4;
const BADGE_PAD_V = 2;
const BADGE_GAP = 4;

export function renderAxisHoverIndicators(
    canvas: Canvas2D | null,
    layout: PlotLayout,
    theme: Theme,
    dpr: number,
    indicators: AxisIndicator[],
    opacity: number = 1.0,
): void {
    if (!canvas || indicators.length === 0) {
        return;
    }

    const ctx = canvas.getContext("2d") as Context2D | null;
    if (!ctx) {
        return;
    }

    const plot = layout.plotRect;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.font = `${BADGE_FONT_PX}px ${theme.fontFamily}`;

    for (const ind of indicators) {
        if (
            ind.px < plot.x ||
            ind.px > plot.x + plot.width ||
            ind.py < plot.y ||
            ind.py > plot.y + plot.height
        ) {
            continue;
        }

        drawTraceLine(ctx, ind, plot, theme);
        drawBadge(ctx, ind, layout, theme, opacity);
    }

    ctx.restore();
}

function drawTraceLine(
    ctx: Context2D,
    ind: AxisIndicator,
    plot: { x: number; y: number; width: number; height: number },
    theme: Theme,
): void {
    ctx.strokeStyle = theme.tickColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ind.px, ind.py);
    if (ind.side === "bottom") {
        ctx.lineTo(ind.px, plot.y + plot.height);
    } else if (ind.side === "left") {
        ctx.lineTo(plot.x, ind.py);
    } else {
        ctx.lineTo(plot.x + plot.width, ind.py);
    }

    ctx.stroke();
    ctx.setLineDash([]);
}

function drawBadge(
    ctx: Context2D,
    ind: AxisIndicator,
    layout: PlotLayout,
    theme: Theme,
    opacity: number,
): void {
    const plot = layout.plotRect;
    const boxW = ctx.measureText(ind.text).width + BADGE_PAD_H * 2;
    const boxH = BADGE_FONT_PX + BADGE_PAD_V * 2 + 2;

    let bx: number;
    let by: number;
    if (ind.side === "bottom") {
        bx = ind.px - boxW / 2;
        by = plot.y + plot.height + BADGE_GAP;
    } else if (ind.side === "left") {
        bx = plot.x - BADGE_GAP - boxW;
        by = ind.py - boxH / 2;
    } else {
        bx = plot.x + plot.width + BADGE_GAP;
        by = ind.py - boxH / 2;
    }

    bx = Math.min(Math.max(bx, 0), Math.max(0, layout.cssWidth - boxW));
    by = Math.min(Math.max(by, 0), Math.max(0, layout.cssHeight - boxH));

    ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
    ctx.fillStyle = theme.tooltipBg;
    ctx.strokeStyle = theme.tooltipBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = theme.tooltipText;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(ind.text, bx + BADGE_PAD_H, by + boxH / 2 + 1);
}
