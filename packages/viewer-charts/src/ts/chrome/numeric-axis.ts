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

import { PlotLayout } from "../layout/plot-layout";
import {
    computeNiceTicks,
    formatTickValue,
    formatDateTickValue,
} from "../layout/ticks";
import { initCanvas } from "./canvas";
import type { Theme } from "../theme/theme";

export interface AxisDomain {
    min: number;
    max: number;
    label: string;
    isDate?: boolean;
}

export interface TickResult {
    xTicks: number[];
    yTicks: number[];
}

/**
 * Compute tick positions for both axes of a numeric plot.
 */
export function computeTicks(
    xDomain: AxisDomain,
    yDomain: AxisDomain,
    layout: PlotLayout,
): TickResult {
    const { plotRect: plot } = layout;
    const targetXTicks = Math.max(2, Math.floor(plot.width / 90));
    const targetYTicks = Math.max(2, Math.floor(plot.height / 60));
    return {
        xTicks: computeNiceTicks(xDomain.min, xDomain.max, targetXTicks),
        yTicks: computeNiceTicks(yDomain.min, yDomain.max, targetYTicks),
    };
}

/**
 * Render gridlines on the BOTTOM canvas (behind WebGL points) for a
 * numeric / numeric plot.
 */
export function renderGridlines(
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
    xTicks: number[],
    yTicks: number[],
    theme: Theme,
): void {
    const ctx = initCanvas(canvas, layout);
    if (!ctx) return;

    const { plotRect: plot } = layout;
    const xToPixel = (val: number) => layout.dataToPixel(val, 0).px;
    const yToPixel = (val: number) => layout.dataToPixel(0, val).py;

    ctx.strokeStyle = theme.gridlineColor;
    ctx.lineWidth = 1;

    for (const tick of xTicks) {
        const px = Math.round(xToPixel(tick)) + 0.5;
        if (px < plot.x || px > plot.x + plot.width) continue;
        ctx.beginPath();
        ctx.moveTo(px, plot.y);
        ctx.lineTo(px, plot.y + plot.height);
        ctx.stroke();
    }

    for (const tick of yTicks) {
        const py = Math.round(yToPixel(tick)) + 0.5;
        if (py < plot.y || py > plot.y + plot.height) continue;
        ctx.beginPath();
        ctx.moveTo(plot.x, py);
        ctx.lineTo(plot.x + plot.width, py);
        ctx.stroke();
    }
}

/**
 * Render axis lines, tick marks, tick labels, and axis labels on the TOP
 * canvas (above WebGL points) for a numeric / numeric plot.
 */
export function renderAxesChrome(
    canvas: HTMLCanvasElement,
    xDomain: AxisDomain,
    yDomain: AxisDomain,
    layout: PlotLayout,
    xTicks: number[],
    yTicks: number[],
    theme: Theme,
): void {
    const ctx = initCanvas(canvas, layout);
    if (!ctx) return;

    const {
        tickColor,
        labelColor,
        gridlineColor: lineColor,
        fontFamily,
    } = theme;

    const { plotRect: plot } = layout;
    const TICK_SIZE = 5;

    const xToPixel = (val: number) => layout.dataToPixel(val, 0).px;
    const yToPixel = (val: number) => layout.dataToPixel(0, val).py;

    // Axis lines
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.height);
    ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
    ctx.stroke();

    // X tick marks and labels
    ctx.fillStyle = tickColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.strokeStyle = tickColor;

    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 0;
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 0;
    const fmtX = xDomain.isDate
        ? (v: number) => formatDateTickValue(v, xStep)
        : formatTickValue;
    const fmtY = yDomain.isDate
        ? (v: number) => formatDateTickValue(v, yStep)
        : formatTickValue;

    for (const tick of xTicks) {
        const px = xToPixel(tick);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) continue;
        ctx.beginPath();
        ctx.moveTo(px, plot.y + plot.height);
        ctx.lineTo(px, plot.y + plot.height + TICK_SIZE);
        ctx.stroke();
        ctx.fillText(fmtX(tick), px, plot.y + plot.height + TICK_SIZE + 3);
    }

    // Y tick marks and labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const tick of yTicks) {
        const py = yToPixel(tick);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) continue;
        ctx.beginPath();
        ctx.moveTo(plot.x - TICK_SIZE, py);
        ctx.lineTo(plot.x, py);
        ctx.stroke();
        ctx.fillText(fmtY(tick), plot.x - TICK_SIZE - 3, py);
    }

    // Axis labels
    ctx.fillStyle = labelColor;
    ctx.font = `13px ${fontFamily}`;

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(xDomain.label, plot.x + plot.width / 2, layout.cssHeight - 2);

    ctx.save();
    ctx.translate(14, plot.y + plot.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(yDomain.label, 0, 0);
    ctx.restore();
}
