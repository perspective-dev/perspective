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

import { PlotLayout, type PlotRect } from "../layout/plot-layout";
import {
    computeNiceTicks,
    formatTickValue,
    formatDateTickValue,
} from "../layout/ticks";
import { getScaledContext } from "./canvas";
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

const TICK_SIZE = 5;

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
 *
 * Non-destructive: caller must call `initCanvas` (from
 * `chrome/canvas.ts`) on the target canvas exactly once per frame
 * before any per-rect renderer calls. This helper only reads the
 * already-sized canvas and draws into the current transform.
 */
export function renderGridlines(
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
    xTicks: number[],
    yTicks: number[],
    theme: Theme,
): void {
    const ctx = getScaledContext(canvas);
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
 * Paint the X axis chrome for a single plot rect: bottom axis line,
 * tick marks, tick labels, and (optionally) the axis label at the
 * bottom of the canvas.
 *
 * Non-destructive — see {@link renderGridlines}.
 */
export function renderCellXAxis(
    canvas: HTMLCanvasElement,
    xDomain: AxisDomain,
    layout: PlotLayout,
    xTicks: number[],
    theme: Theme,
    hasLabel: boolean,
): void {
    const ctx = getScaledContext(canvas);
    if (!ctx) return;

    const { plotRect: plot } = layout;
    const { tickColor, labelColor, gridlineColor: lineColor, fontFamily } =
        theme;
    const xToPixel = (val: number) => layout.dataToPixel(val, 0).px;
    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 0;
    const fmtX = xDomain.isDate
        ? (v: number) => formatDateTickValue(v, xStep)
        : formatTickValue;

    // Axis line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.height);
    ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
    ctx.stroke();

    // Ticks
    ctx.fillStyle = tickColor;
    ctx.strokeStyle = tickColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const tick of xTicks) {
        const px = xToPixel(tick);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) continue;
        ctx.beginPath();
        ctx.moveTo(px, plot.y + plot.height);
        ctx.lineTo(px, plot.y + plot.height + TICK_SIZE);
        ctx.stroke();
        ctx.fillText(fmtX(tick), px, plot.y + plot.height + TICK_SIZE + 3);
    }

    if (hasLabel && xDomain.label) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            xDomain.label,
            plot.x + plot.width / 2,
            layout.cssHeight - 2,
        );
    }
}

/**
 * Paint the Y axis chrome for a single plot rect: left axis line,
 * tick marks, tick labels, and (optionally) a rotated axis label in
 * the outer-left margin.
 *
 * Non-destructive — see {@link renderGridlines}.
 */
export function renderCellYAxis(
    canvas: HTMLCanvasElement,
    yDomain: AxisDomain,
    layout: PlotLayout,
    yTicks: number[],
    theme: Theme,
    hasLabel: boolean,
): void {
    const ctx = getScaledContext(canvas);
    if (!ctx) return;

    const { plotRect: plot } = layout;
    const { tickColor, labelColor, gridlineColor: lineColor, fontFamily } =
        theme;
    const yToPixel = (val: number) => layout.dataToPixel(0, val).py;
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 0;
    const fmtY = yDomain.isDate
        ? (v: number) => formatDateTickValue(v, yStep)
        : formatTickValue;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.height);
    ctx.stroke();

    ctx.fillStyle = tickColor;
    ctx.strokeStyle = tickColor;
    ctx.font = `11px ${fontFamily}`;
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

    if (hasLabel && yDomain.label) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.save();
        ctx.translate(14, plot.y + plot.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(yDomain.label, 0, 0);
        ctx.restore();
    }
}

/**
 * Render axis lines, tick marks, tick labels, and axis labels on the TOP
 * canvas (above WebGL points) for a numeric / numeric plot.
 *
 * Non-destructive — see {@link renderGridlines}. Caller owns the
 * per-frame `initCanvas` call. Single-plot convenience — composes
 * {@link renderCellXAxis} + {@link renderCellYAxis}.
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
    // `renderAxesChrome` historically treated `hasXLabel` / `hasYLabel`
    // as "does this layout reserve space for a label" — `PlotLayout`
    // encodes that in its margins, but there's no flag to read back.
    // Since single-plot callers always pass the same `layout` they
    // used for `computeTicks` / `buildProjectionMatrix`, just paint
    // labels unconditionally: the gutter is already sized for them.
    renderCellYAxis(canvas, yDomain, layout, yTicks, theme, true);
    renderCellXAxis(canvas, xDomain, layout, xTicks, theme, true);
}

/**
 * Paint a shared X axis into the outer band of a facet grid. The
 * axis line spans the full band width (once); ticks + labels repeat
 * per column — one pass per layout in `colLayouts`, each providing
 * the data→pixel mapping for that column's plot rect.
 *
 * `colLayouts` must contain one entry per bottom-row cell. All cells
 * share the same X scale, so the layout's `dataToPixel(val, 0).px`
 * gives the correct tick X for that column's pixel range.
 */
export function renderOuterXAxis(
    canvas: HTMLCanvasElement,
    rect: PlotRect,
    xDomain: AxisDomain,
    xTicks: number[],
    colLayouts: PlotLayout[],
    theme: Theme,
    hasLabel: boolean,
): void {
    const ctx = getScaledContext(canvas);
    if (!ctx) return;

    const { tickColor, labelColor, gridlineColor: lineColor, fontFamily } =
        theme;
    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 0;
    const fmtX = xDomain.isDate
        ? (v: number) => formatDateTickValue(v, xStep)
        : formatTickValue;

    const axisY = rect.y;

    // Axis line: one span across the entire outer band.
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x, axisY);
    ctx.lineTo(rect.x + rect.width, axisY);
    ctx.stroke();

    // Ticks + tick labels: one pass per column. All columns share the
    // same X scale so tick values are the same; only the pixel range
    // shifts.
    ctx.fillStyle = tickColor;
    ctx.strokeStyle = tickColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const layout of colLayouts) {
        const colPlot = layout.plotRect;
        const xToPixel = (v: number) => layout.dataToPixel(v, 0).px;
        for (const tick of xTicks) {
            const px = xToPixel(tick);
            if (px < colPlot.x - 1 || px > colPlot.x + colPlot.width + 1)
                continue;
            ctx.beginPath();
            ctx.moveTo(px, axisY);
            ctx.lineTo(px, axisY + TICK_SIZE);
            ctx.stroke();
            ctx.fillText(fmtX(tick), px, axisY + TICK_SIZE + 3);
        }
    }

    // Axis label once, centered across the full band.
    if (hasLabel && xDomain.label) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(
            xDomain.label,
            rect.x + rect.width / 2,
            rect.y + rect.height - 2,
        );
    }
}

/**
 * Paint a shared Y axis into the outer band of a facet grid. The
 * axis line spans the full band height (once); ticks + labels repeat
 * per row — one pass per layout in `rowLayouts`.
 *
 * `rowLayouts` must contain one entry per leftmost-column cell.
 */
export function renderOuterYAxis(
    canvas: HTMLCanvasElement,
    rect: PlotRect,
    yDomain: AxisDomain,
    yTicks: number[],
    rowLayouts: PlotLayout[],
    theme: Theme,
    hasLabel: boolean,
): void {
    const ctx = getScaledContext(canvas);
    if (!ctx) return;

    const { tickColor, labelColor, gridlineColor: lineColor, fontFamily } =
        theme;
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 0;
    const fmtY = yDomain.isDate
        ? (v: number) => formatDateTickValue(v, yStep)
        : formatTickValue;

    const axisX = rect.x + rect.width;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisX, rect.y);
    ctx.lineTo(axisX, rect.y + rect.height);
    ctx.stroke();

    ctx.fillStyle = tickColor;
    ctx.strokeStyle = tickColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const layout of rowLayouts) {
        const rowPlot = layout.plotRect;
        const yToPixel = (v: number) => layout.dataToPixel(0, v).py;
        for (const tick of yTicks) {
            const py = yToPixel(tick);
            if (py < rowPlot.y - 1 || py > rowPlot.y + rowPlot.height + 1)
                continue;
            ctx.beginPath();
            ctx.moveTo(axisX - TICK_SIZE, py);
            ctx.lineTo(axisX, py);
            ctx.stroke();
            ctx.fillText(fmtY(tick), axisX - TICK_SIZE - 3, py);
        }
    }

    if (hasLabel && yDomain.label) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.save();
        ctx.translate(14, rect.y + rect.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(yDomain.label, 0, 0);
        ctx.restore();
    }
}
