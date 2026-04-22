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
import { formatTickValue } from "../layout/ticks";
import { initCanvas } from "./canvas";
import {
    renderCategoricalXTicks,
    renderCategoricalYTicks,
    type CategoricalDomain,
} from "./categorical-axis";
import type { AxisDomain } from "./numeric-axis";
import type { Theme } from "../theme/theme";

/** Render a numeric axis along the bottom or top of the plot area. */
function drawNumericXAxis(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    domain: AxisDomain,
    ticks: number[],
    side: "top" | "bottom",
    theme: Theme,
): void {
    const { tickColor, labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;
    const TICK_SIZE = 5;
    const axisY = side === "bottom" ? plot.y + plot.height : plot.y;
    const xToPixel = (val: number) => {
        const t =
            (val - layout.paddedXMin) / (layout.paddedXMax - layout.paddedXMin);
        return plot.x + t * plot.width;
    };

    ctx.fillStyle = labelColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = side === "bottom" ? "top" : "bottom";
    ctx.lineWidth = 1;

    for (const tick of ticks) {
        const px = xToPixel(tick);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) continue;
        ctx.beginPath();
        if (side === "bottom") {
            ctx.moveTo(px, axisY);
            ctx.lineTo(px, axisY + TICK_SIZE);
            ctx.stroke();
            ctx.fillText(formatTickValue(tick), px, axisY + TICK_SIZE + 3);
        } else {
            ctx.moveTo(px, axisY - TICK_SIZE);
            ctx.lineTo(px, axisY);
            ctx.stroke();
            ctx.fillText(formatTickValue(tick), px, axisY - TICK_SIZE - 3);
        }
    }

    // Axis label
    ctx.fillStyle = labelColor;
    ctx.font = `13px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (side === "bottom") {
        ctx.fillText(
            domain.label,
            plot.x + plot.width / 2,
            layout.cssHeight - 2,
        );
    } else {
        ctx.fillText(domain.label, plot.x + plot.width / 2, 10);
    }
}

/**
 * Render a numeric Y axis along either the left or right side of the plot
 * area. The caller must have already `initCanvas`'d the target canvas.
 * Used by bar charts with a categorical X and optional split Y axes.
 */
function drawYAxis(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    domain: AxisDomain,
    ticks: number[],
    side: "left" | "right",
    theme: Theme,
): void {
    const { tickColor, labelColor, fontFamily } = theme;

    const { plotRect: plot } = layout;
    const TICK_SIZE = 5;
    const axisX = side === "left" ? plot.x : plot.x + plot.width;
    const yToPixel = (val: number) => {
        const t =
            (val - layout.paddedYMin) / (layout.paddedYMax - layout.paddedYMin);
        return plot.y + (1 - t) * plot.height;
    };

    ctx.fillStyle = labelColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = side === "left" ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;

    for (const tick of ticks) {
        const py = yToPixel(tick);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) continue;
        ctx.beginPath();
        if (side === "left") {
            ctx.moveTo(axisX - TICK_SIZE, py);
            ctx.lineTo(axisX, py);
            ctx.stroke();
            ctx.fillText(formatTickValue(tick), axisX - TICK_SIZE - 3, py);
        } else {
            ctx.moveTo(axisX, py);
            ctx.lineTo(axisX + TICK_SIZE, py);
            ctx.stroke();
            ctx.fillText(formatTickValue(tick), axisX + TICK_SIZE + 3, py);
        }
    }

    // Axis label
    ctx.fillStyle = labelColor;
    ctx.font = `13px ${fontFamily}`;
    ctx.save();
    if (side === "left") {
        ctx.translate(14, plot.y + plot.height / 2);
        ctx.rotate(-Math.PI / 2);
    } else {
        ctx.translate(layout.cssWidth - 10, plot.y + plot.height / 2);
        ctx.rotate(Math.PI / 2);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(domain.label, 0, 0);
    ctx.restore();
}

/**
 * Render bar-chart chrome: L-shaped axis lines, a categorical axis
 * (bottom for Y Bar, left for X Bar), and one or two numeric axes on
 * the opposite sides.
 *
 * `isHorizontal=true` flips orientation for X Bar: categorical axis on
 * the left, numeric axes on the bottom (and top for dual-axis). The
 * `altDomain`/`altTicks` arguments always describe the *secondary*
 * numeric axis regardless of orientation.
 */
export function renderBarAxesChrome(
    canvas: HTMLCanvasElement,
    catDomain: CategoricalDomain,
    valueDomain: AxisDomain,
    valueTicks: number[],
    layout: PlotLayout,
    theme: Theme,
    altDomain?: AxisDomain,
    altTicks?: number[],
    isHorizontal = false,
): void {
    const ctx = initCanvas(canvas, layout);
    if (!ctx) return;

    const { plotRect: plot } = layout;
    ctx.strokeStyle = theme.axisLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.height);
    ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
    if (altDomain) {
        if (isHorizontal) {
            ctx.moveTo(plot.x, plot.y);
            ctx.lineTo(plot.x + plot.width, plot.y);
        } else {
            ctx.moveTo(plot.x + plot.width, plot.y);
            ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
        }
    }
    ctx.stroke();

    if (isHorizontal) {
        renderCategoricalYTicks(ctx, layout, catDomain, theme);
        drawNumericXAxis(ctx, layout, valueDomain, valueTicks, "bottom", theme);
        if (altDomain && altTicks) {
            const origMin = layout.paddedXMin;
            const origMax = layout.paddedXMax;
            layout.paddedXMin = altDomain.min;
            layout.paddedXMax = altDomain.max;
            drawNumericXAxis(ctx, layout, altDomain, altTicks, "top", theme);
            layout.paddedXMin = origMin;
            layout.paddedXMax = origMax;
        }
    } else {
        renderCategoricalXTicks(ctx, layout, catDomain, theme);
        drawYAxis(ctx, layout, valueDomain, valueTicks, "left", theme);
        if (altDomain && altTicks) {
            const origMin = layout.paddedYMin;
            const origMax = layout.paddedYMax;
            layout.paddedYMin = altDomain.min;
            layout.paddedYMax = altDomain.max;
            drawYAxis(ctx, layout, altDomain, altTicks, "right", theme);
            layout.paddedYMin = origMin;
            layout.paddedYMax = origMax;
        }
    }
}

/**
 * Render gridlines at the numeric axis ticks. In vertical bar charts
 * the gridlines run horizontally at numeric Y ticks; in horizontal bar
 * charts they run vertically at numeric X ticks.
 */
export function renderBarGridlines(
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
    valueTicks: number[],
    theme: Theme,
    isHorizontal = false,
): void {
    const ctx = initCanvas(canvas, layout);
    if (!ctx) return;

    const { plotRect: plot } = layout;

    ctx.strokeStyle = theme.gridlineColor;
    ctx.lineWidth = 1;

    if (isHorizontal) {
        const xToPixel = (val: number) => {
            const t =
                (val - layout.paddedXMin) /
                (layout.paddedXMax - layout.paddedXMin);
            return plot.x + t * plot.width;
        };
        for (const tick of valueTicks) {
            const px = Math.round(xToPixel(tick)) + 0.5;
            if (px < plot.x || px > plot.x + plot.width) continue;
            ctx.beginPath();
            ctx.moveTo(px, plot.y);
            ctx.lineTo(px, plot.y + plot.height);
            ctx.stroke();
        }
    } else {
        const yToPixel = (val: number) => {
            const t =
                (val - layout.paddedYMin) /
                (layout.paddedYMax - layout.paddedYMin);
            return plot.y + (1 - t) * plot.height;
        };
        for (const tick of valueTicks) {
            const py = Math.round(yToPixel(tick)) + 0.5;
            if (py < plot.y || py > plot.y + plot.height) continue;
            ctx.beginPath();
            ctx.moveTo(plot.x, py);
            ctx.lineTo(plot.x + plot.width, py);
            ctx.stroke();
        }
    }
}
