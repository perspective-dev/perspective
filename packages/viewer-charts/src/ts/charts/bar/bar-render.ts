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
import type { BarChart } from "./bar";
import type { PlotRect } from "../../layout/plot-layout";
import { PlotLayout } from "../../layout/plot-layout";
import { resolveTheme, readSeriesPalette } from "../../theme/theme";
import { resolvePalette } from "../../theme/palette";
import { renderInPlotFrame } from "../../webgl/plot-frame";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import { drawBars } from "./glyphs/draw-bars";
import { drawLines } from "./glyphs/draw-lines";
import { drawScatter } from "./glyphs/draw-scatter";
import { drawAreas } from "./glyphs/draw-areas";
import { getHoveredBar } from "./bar-interact";
import { computeNiceTicks } from "../../layout/ticks";
import { type AxisDomain } from "../../chrome/numeric-axis";
import { renderBarAxesChrome, renderBarGridlines } from "../../chrome/bar-axis";
import {
    measureCategoricalAxisHeight,
    measureCategoricalAxisWidth,
    type CategoricalDomain,
} from "../../chrome/categorical-axis";
import { buildBarTooltipLines } from "./bar-interact";

/**
 * Upload visible bar instance buffers for the currently hidden-series mask.
 * Re-called after legend toggles.
 */
export function uploadBarInstances(
    chart: BarChart,
    glManager: WebGLContextManager,
): void {
    // Only bar-typed records go through the instanced-quad pipeline.
    // Area records are drawn as triangle strips by `draw-areas.ts` and
    // are excluded here (they stay in `_bars` so hover hit-testing can
    // still find them by rectangle).
    const visibleBars = chart._bars.filter(
        (b) => b.chartType === "bar" && !chart._hiddenSeries.has(b.seriesId),
    );
    chart._visibleBars = visibleBars;
    const n = visibleBars.length;
    chart._uploadedBars = n;
    if (n === 0) return;

    const xCenters = new Float32Array(n);
    const halfWidths = new Float32Array(n);
    const y0s = new Float32Array(n);
    const y1s = new Float32Array(n);
    const seriesIds = new Float32Array(n);
    const axes = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        const b = visibleBars[i];
        xCenters[i] = b.xCenter;
        halfWidths[i] = b.halfWidth;
        y0s[i] = b.y0;
        y1s[i] = b.y1;
        seriesIds[i] = b.seriesId;
        axes[i] = b.axis;
    }

    glManager.bufferPool.ensureCapacity(n);
    glManager.bufferPool.upload("bar_x", xCenters, 0, 1);
    glManager.bufferPool.upload("bar_hw", halfWidths, 0, 1);
    glManager.bufferPool.upload("bar_y0", y0s, 0, 1);
    glManager.bufferPool.upload("bar_y1", y1s, 0, 1);
    glManager.bufferPool.upload("bar_sid", seriesIds, 0, 1);
    glManager.bufferPool.upload("bar_axis", axes, 0, 1);

    uploadBarColors(chart, glManager);
}

/** Upload only the per-bar color buffer; cheaper than full re-upload. */
export function uploadBarColors(
    chart: BarChart,
    glManager: WebGLContextManager,
): void {
    const visibleBars = chart._visibleBars;
    const n = visibleBars.length;
    if (n === 0) return;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const s = chart._series[visibleBars[i].seriesId];
        colors[i * 3] = s.color[0];
        colors[i * 3 + 1] = s.color[1];
        colors[i * 3 + 2] = s.color[2];
    }
    glManager.bufferPool.upload("bar_color", colors, 0, 3);
}

/**
 * Full-frame render: gridlines → WebGL bars (instanced) → chrome overlay.
 */
export function renderBarFrame(
    chart: BarChart,
    glManager: WebGLContextManager,
): void {
    const gl = glManager.gl;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = gl.canvas.width / dpr;
    const cssHeight = gl.canvas.height / dpr;
    if (cssWidth <= 0 || cssHeight <= 0) return;
    if (chart._numCategories === 0) return;

    const themeEl = (chart._gridlineCanvas!.getRootNode() as ShadowRoot).host;
    const theme = resolveTheme(themeEl);
    const palette = resolvePalette(
        readSeriesPalette(themeEl),
        theme.gradientStops,
        chart._series.length,
    );
    for (let i = 0; i < chart._series.length; i++) {
        chart._series[i].color = palette[i];
    }
    if (chart._uploadedBars > 0) uploadBarColors(chart, glManager);

    const horizontal = chart._isHorizontal;

    // Category axis always runs [-0.5, N-0.5] in logical units. In
    // horizontal mode the Y domain is flipped so catIdx=0 sits at the
    // top (standard horizontal-bar reading order); the flip happens in
    // the projection-matrix call below.
    const catMin = -0.5;
    const catMax = chart._numCategories - 0.5;
    const valMin = chart._leftDomain.min;
    const valMax = chart._leftDomain.max;

    if (chart._zoomController) {
        if (horizontal) {
            chart._zoomController.setBaseDomain(valMin, valMax, catMin, catMax);
        } else {
            chart._zoomController.setBaseDomain(catMin, catMax, valMin, valMax);
        }
    }
    // `visCat*` and `visVal*` always describe the currently-visible window
    // in logical (category/value) coords regardless of orientation.
    let visCatMin = catMin;
    let visCatMax = catMax;
    let visValMin = valMin;
    let visValMax = valMax;
    let visRightMin = chart._rightDomain?.min ?? 0;
    let visRightMax = chart._rightDomain?.max ?? 1;
    if (chart._zoomController) {
        const vd = chart._zoomController.getVisibleDomain();
        if (horizontal) {
            visValMin = vd.xMin;
            visValMax = vd.xMax;
            visCatMin = vd.yMin;
            visCatMax = vd.yMax;
        } else {
            visCatMin = vd.xMin;
            visCatMax = vd.xMax;
            visValMin = vd.yMin;
            visValMax = vd.yMax;
        }
    }

    // Auto-fit the value axis to the visible categorical window. Gated
    // on `_autoFitValue` + non-default zoom: at default zoom the refit
    // result always equals `_leftDomain`/`_rightDomain`, so walking
    // would be wasted work (and would shift test baselines).
    if (
        chart._autoFitValue &&
        chart._zoomController &&
        !chart._zoomController.isDefault()
    ) {
        const fit = computeVisibleValueExtent(chart, visCatMin, visCatMax);
        if (fit.hasLeft) {
            visValMin = fit.leftMin;
            visValMax = fit.leftMax;
        }
        if (chart._rightDomain && fit.hasRight) {
            visRightMin = fit.rightMin;
            visRightMax = fit.rightMax;
        }
    }

    const hasLegend = chart._series.length > 1;
    const hasCatLabel = chart._groupBy.length > 0;

    const provisionalDomain: CategoricalDomain = {
        levels: chart._rowPaths,
        numRows: chart._numCategories,
        levelLabels: chart._groupBy.slice(),
    };

    let layout: PlotLayout;
    if (horizontal) {
        const leftExtra = measureCategoricalAxisWidth(provisionalDomain);
        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: true,
            hasYLabel: hasCatLabel,
            hasLegend,
            leftExtra,
        });
    } else {
        const estLeft = 55 + 16;
        const estRight = hasLegend ? 80 : 16;
        const estPlotWidth = Math.max(1, cssWidth - estLeft - estRight);
        const bottomExtra = measureCategoricalAxisHeight(
            provisionalDomain,
            estPlotWidth,
        );
        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: hasCatLabel,
            hasYLabel: true,
            hasLegend,
            bottomExtra,
        });
    }
    chart._lastLayout = layout;
    if (chart._zoomController) chart._zoomController.updateLayout(layout);

    // Build the primary projection. `clamp` names the axis that carries
    // the *value* data (Y for Y Bar, X for X Bar). `requireZero: true`
    // pins the baseline at zero so bars grow from the axis line even
    // when the data range doesn't naturally include zero.
    const projLeft = horizontal
        ? layout.buildProjectionMatrix(
              visValMin,
              visValMax,
              // Flip so catIdx=0 renders at the top.
              visCatMax,
              visCatMin,
              "x",
              true,
          )
        : layout.buildProjectionMatrix(
              visCatMin,
              visCatMax,
              visValMin,
              visValMax,
              "y",
              true,
          );

    let projRight: Float32Array;
    if (chart._hasRightAxis && chart._rightDomain && !horizontal) {
        const savedPadXMin = layout.paddedXMin;
        const savedPadXMax = layout.paddedXMax;
        const savedPadYMin = layout.paddedYMin;
        const savedPadYMax = layout.paddedYMax;
        projRight = layout.buildProjectionMatrix(
            visCatMin,
            visCatMax,
            visRightMin,
            visRightMax,
            "y",
            true,
        );
        layout.paddedXMin = savedPadXMin;
        layout.paddedXMax = savedPadXMax;
        layout.paddedYMin = savedPadYMin;
        layout.paddedYMax = savedPadYMax;
    } else {
        // Dual-axis horizontal is not supported in this iteration; fall
        // through to a single axis when horizontal + _hasRightAxis.
        projRight = projLeft;
    }

    const leftValueTicks = computeNiceTicks(visValMin, visValMax, 6);
    const rightValueTicks =
        chart._hasRightAxis && chart._rightDomain && !horizontal
            ? computeNiceTicks(visRightMin, visRightMax, 6)
            : null;

    const primaryValueLabel = chart._series
        .filter((s) => s.axis === 0)
        .map((s) => s.aggName)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ");
    const altValueLabel = chart._series
        .filter((s) => s.axis === 1)
        .map((s) => s.aggName)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ");

    const catDomain: CategoricalDomain = provisionalDomain;
    const valueDomain: AxisDomain = {
        min: visValMin,
        max: visValMax,
        label: primaryValueLabel,
    };
    const altValueDomain: AxisDomain | null =
        chart._rightDomain && !horizontal
            ? {
                  min: visRightMin,
                  max: visRightMax,
                  label: altValueLabel,
              }
            : null;

    if (chart._gridlineCanvas) {
        renderBarGridlines(
            chart._gridlineCanvas,
            layout,
            leftValueTicks,
            theme,
            horizontal,
        );
    }

    renderInPlotFrame(gl, layout, () => {
        // Paint order: areas behind bars (so bar borders stay crisp),
        // bars above, lines above those, scatter points on top. X Bar
        // only paints bars — the other glyphs bake in vertical geometry
        // and aren't supported for horizontal orientation.
        if (!horizontal) {
            drawAreas(
                chart,
                gl,
                glManager,
                projLeft,
                projRight,
                theme.areaOpacity,
            );
        }

        gl.useProgram(chart._program!);
        const loc = chart._locations!;
        gl.uniformMatrix4fv(loc.u_proj_left, false, projLeft);
        gl.uniformMatrix4fv(loc.u_proj_right, false, projRight);
        gl.uniform1f(loc.u_horizontal, horizontal ? 1.0 : 0.0);
        const hovered = getHoveredBar(chart);
        gl.uniform1f(loc.u_hover_series, hovered ? hovered.seriesId : -1);
        drawBars(chart, gl, glManager);

        if (!horizontal) {
            drawLines(chart, gl, glManager, projLeft, projRight);
            drawScatter(chart, gl, glManager, projLeft, projRight);
        }
    });

    chart._lastXDomain = catDomain;
    chart._lastYDomain = valueDomain;
    chart._lastYTicks = leftValueTicks;
    chart._lastAltYDomain = altValueDomain;
    chart._lastAltYTicks = rightValueTicks;
    renderBarChromeOverlay(chart);
}

/**
 * Draw axes chrome + legend + tooltip onto the overlay canvas.
 */
export function renderBarChromeOverlay(chart: BarChart): void {
    if (
        !chart._chromeCanvas ||
        !chart._lastLayout ||
        !chart._lastXDomain ||
        !chart._lastYDomain ||
        !chart._lastYTicks
    )
        return;

    const theme = resolveTheme(chart._chromeCanvas);
    renderBarAxesChrome(
        chart._chromeCanvas,
        chart._lastXDomain,
        chart._lastYDomain,
        chart._lastYTicks,
        chart._lastLayout,
        theme,
        chart._lastAltYDomain ?? undefined,
        chart._lastAltYTicks ?? undefined,
        chart._isHorizontal,
    );

    renderBarLegend(chart);

    if (getHoveredBar(chart)) {
        renderBarTooltipCanvas(chart);
    }
}

function renderBarLegend(chart: BarChart): void {
    chart._legendRects = [];
    if (!chart._chromeCanvas || !chart._lastLayout) return;
    if (chart._series.length <= 1) return;

    const ctx = chart._chromeCanvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    const theme = resolveTheme(chart._chromeCanvas);
    const textColor = theme.legendText;
    const fontFamily = theme.fontFamily;

    const layout = chart._lastLayout;
    const swatchSize = 10;
    const lineHeight = 18;
    const x = layout.plotRect.x + layout.plotRect.width + 12;
    let y = layout.margins.top + 10;

    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (const s of chart._series) {
        const hidden = chart._hiddenSeries.has(s.seriesId);
        const r = Math.round(s.color[0] * 255);
        const g = Math.round(s.color[1] * 255);
        const b = Math.round(s.color[2] * 255);

        ctx.globalAlpha = hidden ? 0.3 : 1.0;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y - swatchSize / 2, swatchSize, swatchSize);

        ctx.fillStyle = textColor;
        ctx.fillText(s.label, x + swatchSize + 6, y);

        if (hidden) {
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 1;
            const textW = ctx.measureText(s.label).width;
            ctx.beginPath();
            ctx.moveTo(x + swatchSize + 6, y);
            ctx.lineTo(x + swatchSize + 6 + textW, y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        const rect: PlotRect = {
            x: x - 2,
            y: y - lineHeight / 2,
            width: swatchSize + 6 + ctx.measureText(s.label).width + 4,
            height: lineHeight,
        };
        chart._legendRects.push({ seriesId: s.seriesId, rect });

        y += lineHeight;
    }

    ctx.restore();
}

function renderBarTooltipCanvas(chart: BarChart): void {
    if (!chart._chromeCanvas || !chart._lastLayout) return;
    const b = getHoveredBar(chart);
    if (!b) return;
    const layout = chart._lastLayout;
    // Bar glyphs anchor the tooltip at the midpoint of the bar body so
    // it reads against a solid swatch. Line / scatter / area glyphs
    // have no body — the data point sits at `y1`, so anchor there
    // (the tooltip visually hovers *over* the point). Hit records
    // synthesized from line/scatter hover tag themselves as "bar" in
    // `_hoveredSample` for rendering purposes, so we pull the true
    // glyph from the series info instead.
    const glyph = chart._series[b.seriesId]?.chartType ?? "bar";
    const anchorV = glyph === "bar" ? (b.y0 + b.y1) / 2 : b.y1;
    // In horizontal mode the plot's dataToPixel expects (value, category).
    const pos =
        b.axis === 0
            ? chart._isHorizontal
                ? layout.dataToPixel(anchorV, b.xCenter)
                : layout.dataToPixel(b.xCenter, anchorV)
            : rightAxisDataToPixel(chart, b.xCenter, anchorV);

    const lines = buildBarTooltipLines(chart, b);
    const theme = resolveTheme(chart._chromeCanvas);
    renderCanvasTooltip(chart._chromeCanvas, pos, lines, layout, theme);
}

export function rightAxisDataToPixel(
    chart: BarChart,
    x: number,
    y: number,
): { px: number; py: number } {
    const layout = chart._lastLayout!;
    const { x: px, y: py, width, height } = layout.plotRect;
    const tx =
        (x - layout.paddedXMin) / (layout.paddedXMax - layout.paddedXMin);
    const r = chart._rightDomain!;
    const ty = (y - r.min) / (r.max - r.min);
    return { px: px + tx * width, py: py + (1 - ty) * height };
}

/**
 * Compute per-axis value extent over bars whose `catIdx` falls inside
 * `[visCatMin, visCatMax]`. Skips hidden series. Returns a cached
 * result on `chart._autoFitCache` when `(visCatMin, visCatMax,
 * _hiddenSeries)` match the previous call — hover-only redraws hit
 * the cache every time.
 *
 * Value source is `min(y0, y1)`/`max(y0, y1)` per bar, which handles
 * stacked + negative-value bars uniformly.
 *
 * TODO(perf): O(|_bars|) linear scan. `_bars` is already ordered by
 * `catIdx`, so a binary-search pair to locate the visible slice would
 * drop this to O(log N + K_visible). Deferred — under current
 * `max_cells` ceilings the scan is <1% of frame time.
 *
 * Cache lifetime: reset on data upload ([bar.ts] `uploadAndRender`)
 * and legend toggle ([bar-interact.ts] `handleBarLegendClick`). Any
 * other mutation that affects the bar set must also null the cache.
 */
function computeVisibleValueExtent(
    chart: BarChart,
    visCatMin: number,
    visCatMax: number,
): {
    leftMin: number;
    leftMax: number;
    hasLeft: boolean;
    rightMin: number;
    rightMax: number;
    hasRight: boolean;
} {
    const cache = chart._autoFitCache;
    if (
        cache &&
        cache.catMin === visCatMin &&
        cache.catMax === visCatMax &&
        cache.hidden === chart._hiddenSeries
    ) {
        return cache;
    }

    let leftMin = Infinity;
    let leftMax = -Infinity;
    let hasLeft = false;
    let rightMin = Infinity;
    let rightMax = -Infinity;
    let hasRight = false;

    const bars = chart._bars;
    const hidden = chart._hiddenSeries;
    for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (b.catIdx < visCatMin || b.catIdx > visCatMax) continue;
        if (hidden.has(b.seriesId)) continue;
        const lo = b.y0 < b.y1 ? b.y0 : b.y1;
        const hi = b.y0 < b.y1 ? b.y1 : b.y0;
        if (b.axis === 1) {
            if (lo < rightMin) rightMin = lo;
            if (hi > rightMax) rightMax = hi;
            hasRight = true;
        } else {
            if (lo < leftMin) leftMin = lo;
            if (hi > leftMax) leftMax = hi;
            hasLeft = true;
        }
    }

    // Reuse the same cache object to avoid per-frame allocation.
    // `hidden` stored by reference — identity comparison in the cache
    // hit path catches set-content changes because the legend-click
    // handler swaps / mutates the set in ways that invalidate the
    // cache via the explicit null-out.
    const next = cache ?? ({} as NonNullable<BarChart["_autoFitCache"]>);
    next.catMin = visCatMin;
    next.catMax = visCatMax;
    next.hidden = hidden;
    next.leftMin = leftMin;
    next.leftMax = leftMax;
    next.hasLeft = hasLeft;
    next.rightMin = rightMin;
    next.rightMax = rightMax;
    next.hasRight = hasRight;
    chart._autoFitCache = next;
    return next;
}
