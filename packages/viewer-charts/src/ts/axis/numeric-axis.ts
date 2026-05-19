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
import { PlotLayout, type PlotRect } from "../layout/plot-layout";
import {
    computeNiceTicks,
    formatTickValue,
    formatDateTickValue,
} from "../layout/ticks";
import { getScaledContext } from "./canvas";
import {
    drawGridlinesX,
    drawGridlinesY,
    drawXTickRow,
    drawYTickColumn,
} from "./axis-primitives";
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

export function renderGridlines(
    canvas: Canvas2D,
    layout: PlotLayout,
    xTicks: number[],
    yTicks: number[],
    theme: Theme,
    dpr: number,
): void {
    const ctx = getScaledContext(canvas, dpr);
    if (!ctx) {
        return;
    }

    const { plotRect: plot } = layout;
    ctx.strokeStyle = theme.gridlineColor;
    ctx.lineWidth = 1;
    drawGridlinesX(ctx, plot, xTicks, (v) => layout.dataToPixel(v, 0).px);
    drawGridlinesY(ctx, plot, yTicks, (v) => layout.dataToPixel(0, v).py);
}

function tickFmt(
    domain: AxisDomain,
    ticks: number[],
    override?: (v: number) => string,
): (v: number) => string {
    if (override) {
        return override;
    }

    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 0;
    return domain.isDate
        ? (v: number) => formatDateTickValue(v, step)
        : formatTickValue;
}

/**
 * Shared core for X-axis rendering used by both per-cell and outer-band
 * variants. `axisY` is the pixel Y of the axis line; `band` defines the
 * span of that line. `labelBand` (when label-rendering is requested)
 * gives the box used to position/center the axis label below it.
 */
function renderXAxisCore(
    ctx: Context2D,
    xDomain: AxisDomain,
    xTicks: number[],
    layouts: PlotLayout[],
    axisY: number,
    band: { x: number; width: number },
    theme: Theme,
    label: { cx: number; baselineY: number } | null,
    formatter?: (v: number) => string,
): void {
    const { tickColor, labelColor, axisLineColor, fontFamily } = theme;
    const fmt = tickFmt(xDomain, xTicks, formatter);

    ctx.strokeStyle = axisLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(band.x, axisY);
    ctx.lineTo(band.x + band.width, axisY);
    ctx.stroke();

    ctx.fillStyle = tickColor;
    ctx.strokeStyle = tickColor;
    ctx.font = `11px ${fontFamily}`;
    for (const layout of layouts) {
        drawXTickRow(
            ctx,
            layout.plotRect,
            xTicks,
            axisY,
            "bottom",
            (v) => layout.dataToPixel(v, 0).px,
            fmt,
        );
    }

    if (label && xDomain.label) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(xDomain.label, label.cx, label.baselineY);
    }
}

/**
 * Shared core for Y-axis rendering. `axisX` is the pixel X of the axis
 * line; `band` defines its vertical span. `label` (when set) gives the
 * pivot point for the rotated axis label.
 */
function renderYAxisCore(
    ctx: Context2D,
    yDomain: AxisDomain,
    yTicks: number[],
    layouts: PlotLayout[],
    axisX: number,
    band: { y: number; height: number },
    theme: Theme,
    label: { pivotY: number } | null,
    formatter?: (v: number) => string,
): void {
    const { tickColor, labelColor, axisLineColor, fontFamily } = theme;
    const fmt = tickFmt(yDomain, yTicks, formatter);

    ctx.strokeStyle = axisLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisX, band.y);
    ctx.lineTo(axisX, band.y + band.height);
    ctx.stroke();

    ctx.fillStyle = tickColor;
    ctx.strokeStyle = tickColor;
    ctx.font = `11px ${fontFamily}`;
    for (const layout of layouts) {
        drawYTickColumn(
            ctx,
            layout.plotRect,
            yTicks,
            axisX,
            "left",
            (v) => layout.dataToPixel(0, v).py,
            fmt,
        );
    }

    if (label && yDomain.label) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.save();
        ctx.translate(14, label.pivotY);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(yDomain.label, 0, 0);
        ctx.restore();
    }
}

export function renderCellXAxis(
    canvas: Canvas2D,
    xDomain: AxisDomain,
    layout: PlotLayout,
    xTicks: number[],
    theme: Theme,
    hasLabel: boolean,
    dpr: number,
    formatter?: (v: number) => string,
): void {
    const ctx = getScaledContext(canvas, dpr);
    if (!ctx) {
        return;
    }

    const { plotRect: plot } = layout;
    renderXAxisCore(
        ctx,
        xDomain,
        xTicks,
        [layout],
        plot.y + plot.height,
        plot,
        theme,
        hasLabel
            ? {
                  cx: plot.x + plot.width / 2,
                  baselineY: layout.cssHeight - 2,
              }
            : null,
        formatter,
    );
}

export function renderCellYAxis(
    canvas: Canvas2D,
    yDomain: AxisDomain,
    layout: PlotLayout,
    yTicks: number[],
    theme: Theme,
    hasLabel: boolean,
    dpr: number,
    formatter?: (v: number) => string,
): void {
    const ctx = getScaledContext(canvas, dpr);
    if (!ctx) {
        return;
    }

    const { plotRect: plot } = layout;
    renderYAxisCore(
        ctx,
        yDomain,
        yTicks,
        [layout],
        plot.x,
        plot,
        theme,
        hasLabel ? { pivotY: plot.y + plot.height / 2 } : null,
        formatter,
    );
}

export function renderAxesChrome(
    canvas: Canvas2D,
    xDomain: AxisDomain,
    yDomain: AxisDomain,
    layout: PlotLayout,
    xTicks: number[],
    yTicks: number[],
    theme: Theme,
    dpr: number,
    xFormatter?: (v: number) => string,
    yFormatter?: (v: number) => string,
): void {
    renderCellYAxis(
        canvas,
        yDomain,
        layout,
        yTicks,
        theme,
        true,
        dpr,
        yFormatter,
    );
    renderCellXAxis(
        canvas,
        xDomain,
        layout,
        xTicks,
        theme,
        true,
        dpr,
        xFormatter,
    );
}

export function renderOuterXAxis(
    canvas: Canvas2D,
    rect: PlotRect,
    xDomain: AxisDomain,
    xTicks: number[],
    colLayouts: PlotLayout[],
    theme: Theme,
    hasLabel: boolean,
    dpr: number,
    formatter?: (v: number) => string,
): void {
    const ctx = getScaledContext(canvas, dpr);
    if (!ctx) {
        return;
    }

    renderXAxisCore(
        ctx,
        xDomain,
        xTicks,
        colLayouts,
        rect.y,
        rect,
        theme,
        hasLabel
            ? {
                  cx: rect.x + rect.width / 2,
                  baselineY: rect.y + rect.height - 2,
              }
            : null,
        formatter,
    );
}

export function renderOuterYAxis(
    canvas: Canvas2D,
    rect: PlotRect,
    yDomain: AxisDomain,
    yTicks: number[],
    rowLayouts: PlotLayout[],
    theme: Theme,
    hasLabel: boolean,
    dpr: number,
    formatter?: (v: number) => string,
): void {
    const ctx = getScaledContext(canvas, dpr);
    if (!ctx) {
        return;
    }

    renderYAxisCore(
        ctx,
        yDomain,
        yTicks,
        rowLayouts,
        rect.x + rect.width,
        rect,
        theme,
        hasLabel ? { pivotY: rect.y + rect.height / 2 } : null,
        formatter,
    );
}
