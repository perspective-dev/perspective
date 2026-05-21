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
import { PlotLayout } from "../layout/plot-layout";
import { formatTickValue, formatDateTickValue } from "../layout/ticks";
import { initCanvas } from "./canvas";
import {
    renderCategoricalXTicks,
    renderCategoricalYTicks,
    type CategoricalDomain,
} from "./categorical-axis";
import {
    drawGridlinesX,
    drawGridlinesY,
    drawXTickRow,
    drawYTickColumn,
} from "./axis-primitives";
import type { AxisDomain } from "./numeric-axis";
import type { Theme } from "../theme/theme";

function tickFormatter(
    domain: AxisDomain,
    ticks: number[],
    override?: (v: number) => string,
): (v: number) => string {
    if (override) {
        return override;
    }

    if (!domain.isDate) {
        return formatTickValue;
    }

    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 0;
    return (v: number) => formatDateTickValue(v, step);
}

/**
 * Render a numeric axis along the bottom or top of the plot area.
 */
function drawNumericXAxis(
    ctx: Context2D,
    layout: PlotLayout,
    domain: AxisDomain,
    ticks: number[],
    side: "top" | "bottom",
    theme: Theme,
    formatter?: (v: number) => string,
): void {
    const { labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;
    const axisY = side === "bottom" ? plot.y + plot.height : plot.y;

    ctx.fillStyle = labelColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.lineWidth = 1;
    drawXTickRow(
        ctx,
        plot,
        ticks,
        axisY,
        side,
        (v) => layout.dataToPixel(v, 0).px,
        tickFormatter(domain, ticks, formatter),
    );

    ctx.font = `13px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
        domain.label,
        plot.x + plot.width / 2,
        side === "bottom" ? layout.cssHeight - 2 : 10,
    );
}

/**
 * Render a numeric Y axis along either the left or right side of the plot
 * area. The caller must have already `initCanvas`'d the target canvas.
 * Used by bar charts with a categorical X and optional split Y axes.
 */
function drawYAxis(
    ctx: Context2D,
    layout: PlotLayout,
    domain: AxisDomain,
    ticks: number[],
    side: "left" | "right",
    theme: Theme,
    formatter?: (v: number) => string,
): void {
    const { labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;
    const axisX = side === "left" ? plot.x : plot.x + plot.width;

    ctx.fillStyle = labelColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.lineWidth = 1;
    drawYTickColumn(
        ctx,
        plot,
        ticks,
        axisX,
        side,
        (v) => layout.dataToPixel(0, v).py,
        tickFormatter(domain, ticks, formatter),
    );

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
 * The category-axis side of a bar chart can render as either a
 * stringified hierarchical category axis or a true numeric axis (when
 * the single group_by level is date / datetime / integer / float).
 * Both shapes flow through `renderBarAxesChrome`; the discriminator is
 * the `mode` field.
 */
export type BarCategoryAxis =
    | { mode: "category"; domain: CategoricalDomain }
    | { mode: "numeric"; domain: AxisDomain; ticks: number[] };

/**
 * Render a numeric date-aware axis along the bottom of the plot. Aliases
 * the bar-axis bottom variant so heatmap can share the implementation.
 */
export function drawNumericCategoryX(
    ctx: Context2D,
    layout: PlotLayout,
    domain: AxisDomain,
    ticks: number[],
    theme: Theme,
    formatter?: (v: number) => string,
): void {
    drawNumericXAxis(ctx, layout, domain, ticks, "bottom", theme, formatter);
}

export function drawNumericCategoryY(
    ctx: Context2D,
    layout: PlotLayout,
    domain: AxisDomain,
    ticks: number[],
    theme: Theme,
    formatter?: (v: number) => string,
): void {
    drawYAxis(ctx, layout, domain, ticks, "left", theme, formatter);
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
export interface BarAxesFormatters {
    /** Formatter for the value (Y in vertical, X in horizontal) axis. */
    value?: (v: number) => string;
    /** Formatter for the secondary alt value axis. */
    alt?: (v: number) => string;
    /** Formatter for the numeric category axis (when `catAxis.mode === "numeric"`). */
    category?: (v: number) => string;
}

export function renderBarAxesChrome(
    canvas: Canvas2D,
    catAxis: BarCategoryAxis,
    valueDomain: AxisDomain,
    valueTicks: number[],
    layout: PlotLayout,
    theme: Theme,
    dpr: number,
    altDomain?: AxisDomain,
    altTicks?: number[],
    isHorizontal = false,
    formatters: BarAxesFormatters = {},
): void {
    const ctx = initCanvas(canvas, layout, dpr);
    if (!ctx) {
        return;
    }

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
        if (catAxis.mode === "category") {
            renderCategoricalYTicks(ctx, layout, catAxis.domain, theme);
        } else {
            drawNumericCategoryY(
                ctx,
                layout,
                catAxis.domain,
                catAxis.ticks,
                theme,
                formatters.category,
            );
        }

        drawNumericXAxis(
            ctx,
            layout,
            valueDomain,
            valueTicks,
            "bottom",
            theme,
            formatters.value,
        );
        if (altDomain && altTicks) {
            const origMin = layout.paddedXMin;
            const origMax = layout.paddedXMax;
            layout.paddedXMin = altDomain.min;
            layout.paddedXMax = altDomain.max;
            drawNumericXAxis(
                ctx,
                layout,
                altDomain,
                altTicks,
                "top",
                theme,
                formatters.alt,
            );
            layout.paddedXMin = origMin;
            layout.paddedXMax = origMax;
        }
    } else {
        if (catAxis.mode === "category") {
            renderCategoricalXTicks(ctx, layout, catAxis.domain, theme);
        } else {
            drawNumericCategoryX(
                ctx,
                layout,
                catAxis.domain,
                catAxis.ticks,
                theme,
                formatters.category,
            );
        }

        drawYAxis(
            ctx,
            layout,
            valueDomain,
            valueTicks,
            "left",
            theme,
            formatters.value,
        );
        if (altDomain && altTicks) {
            const origMin = layout.paddedYMin;
            const origMax = layout.paddedYMax;
            layout.paddedYMin = altDomain.min;
            layout.paddedYMax = altDomain.max;
            drawYAxis(
                ctx,
                layout,
                altDomain,
                altTicks,
                "right",
                theme,
                formatters.alt,
            );
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
    canvas: Canvas2D,
    layout: PlotLayout,
    valueTicks: number[],
    theme: Theme,
    dpr: number,
    isHorizontal = false,
): void {
    const ctx = initCanvas(canvas, layout, dpr);
    if (!ctx) {
        return;
    }

    ctx.strokeStyle = theme.gridlineColor;
    ctx.lineWidth = 1;
    if (isHorizontal) {
        drawGridlinesX(
            ctx,
            layout.plotRect,
            valueTicks,
            (v) => layout.dataToPixel(v, 0).px,
        );
    } else {
        drawGridlinesY(
            ctx,
            layout.plotRect,
            valueTicks,
            (v) => layout.dataToPixel(0, v).py,
        );
    }
}
