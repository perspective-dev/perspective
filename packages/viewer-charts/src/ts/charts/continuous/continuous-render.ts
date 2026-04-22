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

import type { WebGLContextManager } from "../../webgl/context-manager";
import type { ContinuousChart } from "./continuous-chart";
import { PlotLayout } from "../../layout/plot-layout";
import { resolveTheme, readSeriesPalette } from "../../theme/theme";
import { resolvePalette } from "../../theme/palette";
import { paletteToStops } from "../../theme/gradient";
import { renderInPlotFrame } from "../../webgl/plot-frame";
import { ensureGradientTexture } from "../../webgl/gradient-texture";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import {
    computeTicks,
    renderGridlines,
    renderAxesChrome,
    type AxisDomain,
} from "../../chrome/numeric-axis";
import { renderLegend, renderCategoricalLegend } from "../../chrome/legend";

/**
 * Full-frame render: gridlines → glyph draw inside the plot-frame
 * scissor → chrome overlay (axes + legend + tooltip).
 */
export function renderContinuousFrame(
    chart: ContinuousChart,
    glManager: WebGLContextManager,
): void {
    const gl = glManager.gl;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = gl.canvas.width / dpr;
    const cssHeight = gl.canvas.height / dpr;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    const hasSplits = chart._splitGroups.length > 0;
    const hasColorCol =
        (chart._colorName !== "" || hasSplits) &&
        chart._colorMin < chart._colorMax;

    let domain: { xMin: number; xMax: number; yMin: number; yMax: number };
    if (chart._zoomController) {
        domain = chart._zoomController.getVisibleDomain();
    } else {
        domain = {
            xMin: chart._xMin,
            xMax: chart._xMax,
            yMin: chart._yMin,
            yMax: chart._yMax,
        };
    }
    if (!isFinite(domain.xMin) || !isFinite(domain.yMin)) return;

    const layout = new PlotLayout(cssWidth, cssHeight, {
        hasXLabel: !!chart._xLabel,
        hasYLabel: !!chart._yLabel,
        hasLegend: hasColorCol || hasSplits,
    });
    chart._lastLayout = layout;
    if (chart._zoomController) chart._zoomController.updateLayout(layout);

    const projection = layout.buildProjectionMatrix(
        domain.xMin,
        domain.xMax,
        domain.yMin,
        domain.yMax,
    );

    const themeEl = chart._gridlineCanvas!;
    const theme = resolveTheme(themeEl);
    chart._lastTheme = theme;
    // Palette is only needed when a categorical color source is present,
    // but we resolve it eagerly so the chrome overlay can reuse without a
    // second getComputedStyle pass.
    const seriesPalette = readSeriesPalette(themeEl);
    chart._lastSeriesPalette = seriesPalette;

    const xType = chart._columnTypes[chart._xLabel] || "";
    const yType = chart._columnTypes[chart._yLabel] || "";
    const xIsDate = xType === "date" || xType === "datetime";
    const yIsDate = yType === "date" || yType === "datetime";

    const xDomain: AxisDomain = {
        min: domain.xMin,
        max: domain.xMax,
        label:
            chart._xLabel || (chart._xIsRowIndex ? "Row" : chart._xName || ""),
        isDate: xIsDate,
    };
    const yDomain: AxisDomain = {
        min: domain.yMin,
        max: domain.yMax,
        label: chart._yLabel || chart._yName,
        isDate: yIsDate,
    };

    const { xTicks, yTicks } = computeTicks(xDomain, yDomain, layout);

    if (chart._gridlineCanvas) {
        renderGridlines(chart._gridlineCanvas, layout, xTicks, yTicks, theme);
    }

    // Pick the LUT source by color mode. Categorical data (split_by or
    // a string color column) samples the discrete series palette so
    // shader-rendered colors match the swatches in the legend; numeric
    // color columns keep the continuous gradient.
    //
    // Memoize the categorical LUT by (theme reference, label count) so
    // zoom-driven redraws hand the same array reference to
    // `ensureGradientTexture` and skip the 256-sample rebuild.
    const isCategorical = hasSplits || chart._colorIsString;
    let lutStops = theme.gradientStops;
    if (isCategorical) {
        const labelCount = Math.max(1, chart._uniqueColorLabels.size);
        const key = `${labelCount}|${seriesPalette.length}`;
        if (chart._lastLutStops && chart._lastLutKey === key) {
            lutStops = chart._lastLutStops;
        } else {
            const palette = resolvePalette(
                seriesPalette,
                theme.gradientStops,
                labelCount,
            );
            lutStops = paletteToStops(palette);
            chart._lastLutStops = lutStops;
            chart._lastLutKey = key;
        }
    } else {
        chart._lastLutStops = null;
        chart._lastLutKey = "";
    }
    chart._gradientCache = ensureGradientTexture(
        glManager,
        chart._gradientCache,
        lutStops,
    );

    renderInPlotFrame(gl, layout, () => {
        chart.glyph.draw(chart, glManager, projection);
    });

    chart._lastXDomain = xDomain;
    chart._lastYDomain = yDomain;
    chart._lastXTicks = xTicks;
    chart._lastYTicks = yTicks;
    chart._lastGradientStops = theme.gradientStops;
    chart._lastHasColorCol = hasColorCol || hasSplits;

    renderContinuousChromeOverlay(chart);
}

/**
 * Redraw the chrome canvas only. Used for lightweight hover updates.
 */
export function renderContinuousChromeOverlay(chart: ContinuousChart): void {
    if (
        !chart._chromeCanvas ||
        !chart._lastLayout ||
        !chart._lastXDomain ||
        !chart._lastYDomain
    )
        return;

    const layout = chart._lastLayout;
    // Prefer the cached theme/palette populated by the last full frame.
    // Falls back to a fresh read only if this overlay-only path ran
    // before any full render (shouldn't happen in normal flow).
    const theme = chart._lastTheme ?? resolveTheme(chart._chromeCanvas);

    renderAxesChrome(
        chart._chromeCanvas,
        chart._lastXDomain,
        chart._lastYDomain,
        layout,
        chart._lastXTicks!,
        chart._lastYTicks!,
        theme,
    );

    if (chart._lastHasColorCol) {
        const stops = chart._lastGradientStops ?? theme.gradientStops;
        if (chart._colorIsString && chart._uniqueColorLabels.size > 0) {
            const seriesPalette =
                chart._lastSeriesPalette ??
                readSeriesPalette(chart._chromeCanvas);
            const palette = resolvePalette(
                seriesPalette,
                stops,
                chart._uniqueColorLabels.size,
            );
            renderCategoricalLegend(
                chart._chromeCanvas,
                layout,
                chart._uniqueColorLabels,
                palette,
            );
        } else if (chart._colorName) {
            renderLegend(
                chart._chromeCanvas,
                layout,
                {
                    min: chart._colorMin,
                    max: chart._colorMax,
                    label: chart._colorName,
                },
                stops,
            );
        }
    }

    if (chart._hoveredIndex >= 0 && chart._xData && chart._yData) {
        renderTooltip(chart, chart._chromeCanvas, layout);
    }
}

function renderTooltip(
    chart: ContinuousChart,
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
): void {
    const idx = chart._hoveredIndex;
    if (idx < 0 || !chart._xData || !chart._yData) return;

    const pos = layout.dataToPixel(chart._xData[idx], chart._yData[idx]);
    const lines = chart.glyph.buildTooltipLines(chart, idx);
    if (lines.length === 0) return;
    const theme = chart._lastTheme ?? resolveTheme(canvas);
    renderCanvasTooltip(
        canvas,
        pos,
        lines,
        layout,
        theme,
        chart.glyph.tooltipOptions(),
    );
}
