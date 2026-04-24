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

import type { PlotRect } from "../layout/plot-layout";

export const TICK_SIZE = 5;

/**
 * One horizontal row of numeric axis ticks + labels at CSS-pixel `axisY`.
 * `side` selects tick direction (down into the bottom margin or up into
 * the top margin) and the corresponding label baseline. Caller owns
 * `strokeStyle`, `fillStyle`, `font`, and `lineWidth`.
 */
export function drawXTickRow(
    ctx: CanvasRenderingContext2D,
    plot: PlotRect,
    ticks: number[],
    axisY: number,
    side: "top" | "bottom",
    xToPixel: (v: number) => number,
    format: (v: number) => string,
): void {
    const dir = side === "bottom" ? 1 : -1;
    ctx.textAlign = "center";
    ctx.textBaseline = side === "bottom" ? "top" : "bottom";
    const labelOffset = dir * (TICK_SIZE + 3);
    for (const tick of ticks) {
        const px = xToPixel(tick);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) continue;
        ctx.beginPath();
        ctx.moveTo(px, axisY);
        ctx.lineTo(px, axisY + dir * TICK_SIZE);
        ctx.stroke();
        ctx.fillText(format(tick), px, axisY + labelOffset);
    }
}

/**
 * One vertical column of numeric axis ticks + labels at CSS-pixel `axisX`.
 * `side` selects tick direction (out toward the left or right margin) and
 * the corresponding label alignment. Caller owns styling state.
 */
export function drawYTickColumn(
    ctx: CanvasRenderingContext2D,
    plot: PlotRect,
    ticks: number[],
    axisX: number,
    side: "left" | "right",
    yToPixel: (v: number) => number,
    format: (v: number) => string,
): void {
    const dir = side === "left" ? -1 : 1;
    ctx.textAlign = side === "left" ? "right" : "left";
    ctx.textBaseline = "middle";
    const labelOffset = dir * (TICK_SIZE + 3);
    for (const tick of ticks) {
        const py = yToPixel(tick);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) continue;
        ctx.beginPath();
        ctx.moveTo(axisX, py);
        ctx.lineTo(axisX + dir * TICK_SIZE, py);
        ctx.stroke();
        ctx.fillText(format(tick), axisX + labelOffset, py);
    }
}

/** Vertical gridlines at numeric X ticks, clipped to `plot`. */
export function drawGridlinesX(
    ctx: CanvasRenderingContext2D,
    plot: PlotRect,
    ticks: number[],
    xToPixel: (v: number) => number,
): void {
    for (const tick of ticks) {
        const px = Math.round(xToPixel(tick)) + 0.5;
        if (px < plot.x || px > plot.x + plot.width) continue;
        ctx.beginPath();
        ctx.moveTo(px, plot.y);
        ctx.lineTo(px, plot.y + plot.height);
        ctx.stroke();
    }
}

/** Horizontal gridlines at numeric Y ticks, clipped to `plot`. */
export function drawGridlinesY(
    ctx: CanvasRenderingContext2D,
    plot: PlotRect,
    ticks: number[],
    yToPixel: (v: number) => number,
): void {
    for (const tick of ticks) {
        const py = Math.round(yToPixel(tick)) + 0.5;
        if (py < plot.y || py > plot.y + plot.height) continue;
        ctx.beginPath();
        ctx.moveTo(plot.x, py);
        ctx.lineTo(plot.x + plot.width, py);
        ctx.stroke();
    }
}
