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

import type { Context2D } from "../canvas-types";
import type { WebGLContextManager } from "../../webgl/context-manager";
import {
    ensurePalette,
    type SeriesChart,
    type SeriesAutoFitCache,
} from "./series";
import type { PlotRect } from "../../layout/plot-layout";
import { PlotLayout } from "../../layout/plot-layout";
import { renderInPlotFrame } from "../../webgl/plot-frame";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import { drawBars, BAR_TYPE_BAR_VAL as BAR_TYPE_BAR } from "./glyphs/draw-bars";
import { getHoveredBar } from "./series-interact";
import { computeNiceTicks } from "../../layout/ticks";
import { type AxisDomain } from "../../axis/numeric-axis";
import {
    renderBarAxesChrome,
    renderBarGridlines,
    type BarCategoryAxis,
} from "../../axis/bar-axis";
import {
    measureCategoricalAxisHeight,
    measureCategoricalAxisWidth,
    type CategoricalDomain,
} from "../../axis/categorical-axis";
import { buildBarTooltipLines } from "./series-interact";

/**
 * Reusable scratch for bar instance uploads. Sized lazily at the first
 * use; grown on demand. Avoids `new Float32Array(n)` × 7 buffers per
 * legend-toggle / data-load; size is bounded by the bar-typed subset
 * of `_bars.count`.
 */
interface BarInstanceScratch {
    xCenters: Float32Array;
    halfWidths: Float32Array;
    y0s: Float32Array;
    y1s: Float32Array;
    seriesIds: Float32Array;
    axes: Float32Array;
    colors: Float32Array;
}

let _barInstanceScratch: BarInstanceScratch | null = null;

function ensureBarInstanceScratch(n: number): BarInstanceScratch {
    if (
        _barInstanceScratch &&
        _barInstanceScratch.xCenters.length >= n &&
        _barInstanceScratch.colors.length >= n * 3
    ) {
        return _barInstanceScratch;
    }

    const cap = Math.max(n, _barInstanceScratch?.xCenters.length ?? 0);
    _barInstanceScratch = {
        xCenters: new Float32Array(cap),
        halfWidths: new Float32Array(cap),
        y0s: new Float32Array(cap),
        y1s: new Float32Array(cap),
        seriesIds: new Float32Array(cap),
        axes: new Float32Array(cap),
        colors: new Float32Array(cap * 3),
    };
    return _barInstanceScratch;
}

/**
 * Upload bar instance buffers from the columnar `_bars` storage. Filters
 * to bar-typed records only (areas draw as triangle strips). Skips
 * hidden series. Re-called from data-load and legend-toggle paths; the
 * scratch buffers and `_visibleBarIndices` are reused across calls.
 */
export function uploadBarInstances(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): void {
    const bars = chart._bars;
    const total = bars.count;
    let n = 0;

    if (total > 0) {
        const scratch = ensureBarInstanceScratch(total);
        if (
            !chart._visibleBarIndices ||
            chart._visibleBarIndices.length < total
        ) {
            chart._visibleBarIndices = new Int32Array(total);
        }

        const indices = chart._visibleBarIndices;

        // Rebase each xCenter by `_categoryOrigin` before f32 narrowing.
        // For datetime numeric category axes the absolute xCenter is
        // ~1.7e12 and f32 narrowing collapses adjacent bars onto the
        // same value; subtracting the origin brings every value into
        // the seconds range where f32 has full precision. The matching
        // projection matrix is built with the same origin so the shader
        // math is consistent.
        const xOrigin = chart._categoryOrigin;
        const series = chart._series;
        const hidden = chart._hiddenSeries;
        const ct = bars.chartType;
        const sid = bars.seriesId;
        const xC = bars.xCenter;
        const hw = bars.halfWidth;
        const by0 = bars.y0;
        const by1 = bars.y1;
        const ax = bars.axis;
        for (let i = 0; i < total; i++) {
            if (ct[i] !== BAR_TYPE_BAR) {
                continue;
            }

            const seriesId = sid[i];
            if (hidden.has(seriesId)) {
                continue;
            }

            scratch.xCenters[n] = xC[i] - xOrigin;
            scratch.halfWidths[n] = hw[i];
            scratch.y0s[n] = by0[i];
            scratch.y1s[n] = by1[i];
            scratch.seriesIds[n] = seriesId;
            scratch.axes[n] = ax[i];
            const color = series[seriesId].color;
            scratch.colors[n * 3] = color[0];
            scratch.colors[n * 3 + 1] = color[1];
            scratch.colors[n * 3 + 2] = color[2];
            indices[n] = i;
            n++;
        }
    }

    chart._uploadedBars = n;
    if (n === 0) {
        chart._lastUploadedColors = null;
        return;
    }

    const scratch = _barInstanceScratch!;
    glManager.bufferPool.ensureCapacity(n);
    // `subarray(0, n)` slices the scratch to the current frame's
    // valid-data length. The scratch grows monotonically across
    // frames (see `ensureBarInstanceScratch`) so its `.length` reflects
    // historical peak, not current `n` — passing it whole would
    // overflow the GPU buffer after any session reset.
    glManager.bufferPool.upload("bar_x", scratch.xCenters.subarray(0, n), 0, 1);
    glManager.bufferPool.upload(
        "bar_hw",
        scratch.halfWidths.subarray(0, n),
        0,
        1,
    );
    glManager.bufferPool.upload("bar_y0", scratch.y0s.subarray(0, n), 0, 1);
    glManager.bufferPool.upload("bar_y1", scratch.y1s.subarray(0, n), 0, 1);
    glManager.bufferPool.upload(
        "bar_sid",
        scratch.seriesIds.subarray(0, n),
        0,
        1,
    );
    glManager.bufferPool.upload("bar_axis", scratch.axes.subarray(0, n), 0, 1);
    glManager.bufferPool.upload(
        "bar_color",
        scratch.colors.subarray(0, n * 3),
        0,
        3,
    );

    // Snapshot the uploaded color bytes so subsequent palette-only
    // changes can detect a no-op and skip the GPU write.
    if (
        !chart._lastUploadedColors ||
        chart._lastUploadedColors.length < n * 3
    ) {
        chart._lastUploadedColors = new Float32Array(
            Math.max(n * 3, chart._lastUploadedColors?.length ?? 0),
        );
    }

    chart._lastUploadedColors.set(scratch.colors.subarray(0, n * 3));
}

/**
 * Re-upload the per-bar color attribute. Short-circuits when the new
 * colors match the last-uploaded snapshot byte-for-byte. Legacy code
 * ran this every frame regardless; with the cached palette now stable
 * across pan/zoom this becomes a no-op except after data load /
 * `restyle()`.
 */
export function uploadBarColors(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): void {
    const n = chart._uploadedBars;
    if (n === 0) {
        return;
    }

    const indices = chart._visibleBarIndices;
    const series = chart._series;
    const sid = chart._bars.seriesId;
    const scratch = ensureBarInstanceScratch(n);
    for (let i = 0; i < n; i++) {
        const color = series[sid[indices[i]]].color;
        scratch.colors[i * 3] = color[0];
        scratch.colors[i * 3 + 1] = color[1];
        scratch.colors[i * 3 + 2] = color[2];
    }

    const last = chart._lastUploadedColors;
    if (last && last.length >= n * 3) {
        let same = true;
        for (let i = 0; i < n * 3; i++) {
            if (last[i] !== scratch.colors[i]) {
                same = false;
                break;
            }
        }

        if (same) {
            return;
        }
    }

    glManager.bufferPool.upload(
        "bar_color",
        scratch.colors.subarray(0, n * 3),
        0,
        3,
    );
    if (!last || last.length < n * 3) {
        chart._lastUploadedColors = new Float32Array(n * 3);
    }

    chart._lastUploadedColors!.set(scratch.colors.subarray(0, n * 3));
}

/**
 * Drop persistent vertex buffers for line / scatter / area glyphs.
 * Called from `uploadAndRender` before {@link rebuildGlyphBuffers}.
 */
export function invalidateGlyphBuffers(chart: SeriesChart): void {
    chart._glyphs.lines.invalidateBuffers(chart);
    chart._glyphs.scatter.invalidateBuffers(chart);
    chart._glyphs.areas.invalidateBuffers(chart);
}

/**
 * Build persistent vertex buffers for line / scatter / area glyphs.
 * The legacy renderers rebuilt and re-uploaded these every frame inside
 * the per-glyph draw functions; with stable post-build geometry the
 * uploads now happen exactly once per data-load / palette change.
 */
export function rebuildGlyphBuffers(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): void {
    chart._glyphs.lines.rebuildBuffers(chart, glManager);
    chart._glyphs.scatter.rebuildBuffers(chart, glManager);
    chart._glyphs.areas.rebuildBuffers(chart, glManager);
}

/**
 * Full-frame render: gridlines → WebGL bars (instanced) → chrome overlay.
 */
export function renderBarFrame(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): void {
    const gl = glManager.gl;
    const dpr = glManager.dpr;
    const cssWidth = gl.canvas.width / dpr;
    const cssHeight = gl.canvas.height / dpr;
    if (cssWidth <= 0 || cssHeight <= 0) {
        return;
    }

    if (chart._numCategories === 0) {
        return;
    }

    // Resolve the theme + palette. `ensurePalette` is a no-op when the
    // palette inputs (theme refs + series count) are unchanged — under
    // pan/zoom this short-circuits, leaving frame work to the GPU draw
    // calls only. After data load / `restyle()` it stamps fresh RGB
    // onto `_series[i].color`, and the color upload path detects the
    // change and re-uploads the bar instance colors.
    const theme = chart._resolveTheme();
    if (ensurePalette(chart) && chart._uploadedBars > 0) {
        uploadBarColors(chart, glManager);
    }

    const horizontal = chart._isHorizontal;
    const numericCat = chart._categoryAxisMode === "numeric";

    // Category axis bounds. Category mode runs [-0.5, N-0.5] in logical
    // units; numeric mode reads min/max from the data-unit
    // `_numericCategoryDomain`. Horizontal mode flips the Y domain so
    // catIdx=0 sits at the top (handled below in the projection call).
    const catMin = numericCat ? chart._numericCategoryDomain!.min : -0.5;
    const catMax = numericCat
        ? chart._numericCategoryDomain!.max
        : chart._numCategories - 0.5;

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

    // `include_zero` is absolute — zero must stay inside the rendered
    // domain even after a dynamic-zoom refit (`computeVisibleValueExtent`
    // returns the data-only extent, which can drop the baseline).
    // Without this, tick computation sees the refit window while the
    // projection's `requireZero` snap silently re-anchors to zero, so
    // ticks crowd one edge of an otherwise zero-anchored plot.
    if (chart._pluginConfig.include_zero) {
        if (visValMin > 0) {
            visValMin = 0;
        }

        if (visValMax < 0) {
            visValMax = 0;
        }

        if (chart._rightDomain) {
            if (visRightMin > 0) {
                visRightMin = 0;
            }

            if (visRightMax < 0) {
                visRightMax = 0;
            }
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
        // Numeric category axis on the Y side: the gutter just needs
        // standard numeric tick width (~55px), no per-row label
        // measurement.
        const leftExtra = numericCat
            ? 55
            : measureCategoricalAxisWidth(provisionalDomain);

        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: true,
            hasYLabel: hasCatLabel,
            hasLegend,
            leftExtra,
        });
    } else if (numericCat) {
        // Numeric category axis on the X side: bottom gutter is a
        // fixed numeric-axis row (~24px), no leaf-rotation measurement.
        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: hasCatLabel,
            hasYLabel: true,
            hasLegend,
            bottomExtra: 24,
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
    if (chart._zoomController) {
        chart._zoomController.updateLayout(layout);
    }

    // Build the primary projection. `clamp` names the axis that carries
    // the *value* data (Y for Y Bar, X for X Bar). `requireZero` pins
    // the baseline at zero so bar / area glyphs grow from the axis
    // line; it must track `include_zero` so the projection's padded
    // domain matches the build pipeline's `leftDomain` (otherwise the
    // tick computation and the WebGL geometry use different scales).
    const requireZero = chart._pluginConfig.include_zero;
    const projLeft = horizontal
        ? layout.buildProjectionMatrix(
              visValMin,
              visValMax,

              // Flip so catIdx=0 renders at the top.
              visCatMax,
              visCatMin,
              "x",
              requireZero,
              undefined,
              0,
              chart._categoryOrigin,
          )
        : layout.buildProjectionMatrix(
              visCatMin,
              visCatMax,
              visValMin,
              visValMax,
              "y",
              requireZero,
              undefined,
              chart._categoryOrigin,
              0,
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
            requireZero,
            undefined,
            chart._categoryOrigin,
            0,
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

    const catDomain: CategoricalDomain = provisionalDomain;
    const valueDomain: AxisDomain = {
        min: visValMin,
        max: visValMax,
        label: chart._primaryValueLabel,
    };
    const altValueDomain: AxisDomain | null =
        chart._rightDomain && !horizontal
            ? {
                  min: visRightMin,
                  max: visRightMax,
                  label: chart._altValueLabel,
              }
            : null;

    if (chart._gridlineCanvas) {
        renderBarGridlines(
            chart._gridlineCanvas,
            layout,
            leftValueTicks,
            theme,
            glManager.dpr,
            horizontal,
        );
    }

    renderInPlotFrame(gl, layout, glManager.dpr, () => {
        // Paint order: areas behind bars (so bar borders stay crisp),
        // bars above, lines above those, scatter points on top. X Bar
        // only paints bars — the other glyphs bake in vertical geometry
        // and aren't supported for horizontal orientation.
        if (!horizontal) {
            chart._glyphs.areas.draw(
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
        const hovered = chart._series.length > 1 ? getHoveredBar(chart) : null;
        gl.uniform1f(loc.u_hover_series, hovered ? hovered.seriesId : -1);
        drawBars(chart, gl, glManager);

        if (!horizontal) {
            chart._glyphs.lines.draw(chart, gl, glManager, projLeft, projRight);
            chart._glyphs.scatter.draw(
                chart,
                gl,
                glManager,
                projLeft,
                projRight,
            );
        }
    });

    chart._lastXDomain = catDomain;
    chart._lastYDomain = valueDomain;
    chart._lastYTicks = leftValueTicks;
    chart._lastAltYDomain = altValueDomain;
    chart._lastAltYTicks = rightValueTicks;
    chart._lastCatTicks = numericCat
        ? computeNiceTicks(visCatMin, visCatMax, 6)
        : null;
    renderBarChromeOverlay(chart);
}

/**
 * Draw axes chrome + legend + tooltip onto the overlay canvas.
 */
export function renderBarChromeOverlay(chart: SeriesChart): void {
    if (
        !chart._chromeCanvas ||
        !chart._lastLayout ||
        !chart._lastYDomain ||
        !chart._lastYTicks
    ) {
        return;
    }

    const theme = chart._resolveTheme();
    let catAxis: BarCategoryAxis;
    if (
        chart._categoryAxisMode === "numeric" &&
        chart._numericCategoryDomain &&
        chart._lastCatTicks
    ) {
        catAxis = {
            mode: "numeric",
            domain: {
                min: chart._numericCategoryDomain.min,
                max: chart._numericCategoryDomain.max,
                isDate: chart._numericCategoryDomain.isDate,
                label: chart._numericCategoryDomain.label,
            },
            ticks: chart._lastCatTicks,
        };
    } else if (chart._lastXDomain) {
        catAxis = { mode: "category", domain: chart._lastXDomain };
    } else {
        return;
    }

    // Y axis columns: the primary axis aggregates the unique Y column
    // shared by all series on it. With `auto_alt_y_axis`, series can
    // split across primary/secondary by `_series[i].onAltAxis`; the
    // primary formatter follows the first non-alt series, alt follows
    // the first alt series (falls back to the formatter's own type-
    // aware fallback if no such series exists).
    const primarySeries = chart._series.find((s) => s.axis === 0);
    const altSeries = chart._series.find((s) => s.axis === 1);
    const xColumn = chart._groupBy[0];
    renderBarAxesChrome(
        chart._chromeCanvas,
        catAxis,
        chart._lastYDomain,
        chart._lastYTicks,
        chart._lastLayout,
        theme,
        chart._glManager?.dpr ?? 1,
        chart._lastAltYDomain ?? undefined,
        chart._lastAltYTicks ?? undefined,
        chart._isHorizontal,
        {
            value: chart.getColumnFormatter(
                primarySeries?.aggName ?? null,
                "tick",
            ),
            alt: chart.getColumnFormatter(altSeries?.aggName ?? null, "tick"),
            category: chart.getColumnFormatter(xColumn, "tick"),
        },
    );

    renderBarLegend(chart);

    if (getHoveredBar(chart)) {
        renderBarTooltipCanvas(chart);
    }
}

/**
 * Cached parallel array of measured legend text widths. The legend
 * renderer reads from this each frame instead of re-running
 * `ctx.measureText` per series; the widths only change on series-set
 * or theme change. `_legendCacheValid` gates rebuild.
 */
let _legendTextWidths: Float64Array = new Float64Array(0);

function ensureLegendLayout(
    chart: SeriesChart,
    ctx: Context2D,
    fontFamily: string,
): void {
    if (chart._legendCacheValid) {
        return;
    }

    const series = chart._series;
    if (_legendTextWidths.length < series.length) {
        _legendTextWidths = new Float64Array(series.length);
    }

    ctx.save();
    ctx.font = `11px ${fontFamily}`;
    for (let i = 0; i < series.length; i++) {
        _legendTextWidths[i] = ctx.measureText(series[i].label).width;
    }

    ctx.restore();
    chart._legendCacheValid = true;
}

function renderBarLegend(chart: SeriesChart): void {
    chart._legendRects = [];
    if (!chart._chromeCanvas || !chart._lastLayout) {
        return;
    }

    if (chart._series.length <= 1) {
        return;
    }

    const ctx = chart._chromeCanvas.getContext("2d") as Context2D | null;
    if (!ctx) {
        return;
    }

    ctx.save();

    const theme = chart._resolveTheme();
    const textColor = theme.legendText;
    const fontFamily = theme.fontFamily;

    ensureLegendLayout(chart, ctx, fontFamily);

    const layout = chart._lastLayout;
    const swatchSize = 10;
    const lineHeight = 18;
    const x = layout.plotRect.x + layout.plotRect.width + 12;
    let y = layout.margins.top + 10;

    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const series = chart._series;
    const widths = _legendTextWidths;
    for (let i = 0; i < series.length; i++) {
        const s = series[i];
        const hidden = chart._hiddenSeries.has(s.seriesId);
        const r = Math.round(s.color[0] * 255);
        const g = Math.round(s.color[1] * 255);
        const b = Math.round(s.color[2] * 255);

        ctx.globalAlpha = hidden ? 0.3 : 1.0;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y - swatchSize / 2, swatchSize, swatchSize);

        ctx.fillStyle = textColor;
        ctx.fillText(s.label, x + swatchSize + 6, y);

        const textW = widths[i];
        if (hidden) {
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + swatchSize + 6, y);
            ctx.lineTo(x + swatchSize + 6 + textW, y);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;

        const rect: PlotRect = {
            x: x - 2,
            y: y - lineHeight / 2,
            width: swatchSize + 6 + textW + 4,
            height: lineHeight,
        };
        chart._legendRects.push({ seriesId: s.seriesId, rect });

        y += lineHeight;
    }

    ctx.restore();
}

function renderBarTooltipCanvas(chart: SeriesChart): void {
    if (!chart._chromeCanvas || !chart._lastLayout) {
        return;
    }

    const b = getHoveredBar(chart);
    if (!b) {
        return;
    }

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

    const pos =
        b.axis === 0
            ? chart._isHorizontal
                ? layout.dataToPixel(anchorV, b.xCenter)
                : layout.dataToPixel(b.xCenter, anchorV)
            : rightAxisDataToPixel(chart, b.xCenter, anchorV);

    const lines = buildBarTooltipLines(chart, b);
    const theme = chart._resolveTheme();
    renderCanvasTooltip(
        chart._chromeCanvas,
        pos,
        lines,
        layout,
        theme,
        chart._glManager?.dpr ?? 1,
    );
}

export function rightAxisDataToPixel(
    chart: SeriesChart,
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
    chart: SeriesChart,
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

    // Pre-bucketed extent table — built once per data load (and on
    // hidden-series mutation) — turns the per-frame walk from
    // O(`bars.count` = N×M×P) into O(visibleCats). The original
    // O(`bars.count`) walk now runs only inside `ensureCatExtents`.
    const buckets = ensureCatExtents(chart);

    let leftMin = Infinity;
    let leftMax = -Infinity;
    let hasLeft = false;
    let rightMin = Infinity;
    let rightMax = -Infinity;
    let hasRight = false;

    if (buckets.n > 0) {
        // Clamp to the populated [0, n-1] range. `visCat*` is in
        // continuous coords (numeric or category index space), so
        // floor/ceil to integer bucket indices.
        const lo = Math.max(0, Math.floor(visCatMin));
        const hi = Math.min(buckets.n - 1, Math.ceil(visCatMax));
        const lMin = buckets.leftMin;
        const lMax = buckets.leftMax;
        const rMin = buckets.rightMin;
        const rMax = buckets.rightMax;
        const hL = buckets.hasLeft;
        const hR = buckets.hasRight;
        for (let i = lo; i <= hi; i++) {
            if (hL[i]) {
                if (lMin[i] < leftMin) {
                    leftMin = lMin[i];
                }

                if (lMax[i] > leftMax) {
                    leftMax = lMax[i];
                }

                hasLeft = true;
            }

            if (hR[i]) {
                if (rMin[i] < rightMin) {
                    rightMin = rMin[i];
                }

                if (rMax[i] > rightMax) {
                    rightMax = rMax[i];
                }

                hasRight = true;
            }
        }
    }

    // Reuse the same cache object to avoid per-frame allocation.
    // `hidden` stored by reference — identity comparison in the cache
    // hit path catches set-content changes because the legend-click
    // handler swaps / mutates the set in ways that invalidate the
    // cache via the explicit null-out.
    const next = cache ?? newSeriesAutoFitCache();
    next.catMin = visCatMin;
    next.catMax = visCatMax;
    next.hidden = chart._hiddenSeries;
    next.leftMin = leftMin;
    next.leftMax = leftMax;
    next.hasLeft = hasLeft;
    next.rightMin = rightMin;
    next.rightMax = rightMax;
    next.hasRight = hasRight;
    chart._autoFitCache = next;
    return next;
}

function newSeriesAutoFitCache(): SeriesAutoFitCache {
    return {
        catMin: 0,
        catMax: 0,
        hidden: new Set(),
        leftMin: 0,
        leftMax: 0,
        hasLeft: false,
        rightMin: 0,
        rightMax: 0,
        hasRight: false,
    };
}

/**
 * Build (or rebuild) the per-category extent buckets for the current
 * `_bars` set plus the line / scatter sample grid, filtered by the
 * current `_hiddenSeries` set. The buckets answer "what's the value
 * range across this category?" in O(1) per category, replacing the
 * O(`bars.count` + N × |line+scatter|) per-frame walk.
 *
 * Bar / area glyphs contribute via `_bars` (min/max of `y0`,`y1`, so
 * stacking and negative values are handled uniformly). Line / scatter
 * glyphs have no `_bars` records — they contribute the raw sample
 * value `v` as the single-point extent `[v, v]`; without this pass
 * `series_zoom_mode === "dynamic"` would silently behave as `"fixed"`
 * on any pure line/scatter chart.
 *
 * Capacity-reused: typed arrays grown only when `_numCategories`
 * exceeds prior capacity. Amortizes across pan/zoom frames — runs
 * once per data load + once per legend toggle, not per frame.
 */
function ensureCatExtents(
    chart: SeriesChart,
): NonNullable<SeriesChart["_catExtents"]> {
    const N = chart._numCategories;
    let buckets = chart._catExtents;

    const sameCapacity = buckets && buckets.leftMin.length >= N;
    if (
        buckets &&
        sameCapacity &&
        chart._catExtentsHidden === chart._hiddenSeries
    ) {
        return buckets;
    }

    if (!buckets || !sameCapacity) {
        buckets = {
            leftMin: new Float64Array(N),
            leftMax: new Float64Array(N),
            rightMin: new Float64Array(N),
            rightMax: new Float64Array(N),
            hasLeft: new Uint8Array(N),
            hasRight: new Uint8Array(N),
            n: N,
        };
        chart._catExtents = buckets;
    } else {
        buckets.n = N;
    }

    // Initialize every per-cat slot to the empty extent. `Infinity` /
    // `-Infinity` so that the first contributing bar wins on
    // min/max comparisons.
    for (let i = 0; i < N; i++) {
        buckets.leftMin[i] = Infinity;
        buckets.leftMax[i] = -Infinity;
        buckets.rightMin[i] = Infinity;
        buckets.rightMax[i] = -Infinity;
        buckets.hasLeft[i] = 0;
        buckets.hasRight[i] = 0;
    }

    const bars = chart._bars;
    const hidden = chart._hiddenSeries;
    const catIdxArr = bars.catIdx;
    const seriesIdArr = bars.seriesId;
    const y0Arr = bars.y0;
    const y1Arr = bars.y1;
    const axisArr = bars.axis;
    for (let i = 0; i < bars.count; i++) {
        if (hidden.has(seriesIdArr[i])) {
            continue;
        }

        const ci = catIdxArr[i];
        if (ci < 0 || ci >= N) {
            continue;
        }

        const y0 = y0Arr[i];
        const y1 = y1Arr[i];
        const lo = y0 < y1 ? y0 : y1;
        const hi = y0 < y1 ? y1 : y0;
        if (axisArr[i] === 1) {
            if (lo < buckets.rightMin[ci]) {
                buckets.rightMin[ci] = lo;
            }

            if (hi > buckets.rightMax[ci]) {
                buckets.rightMax[ci] = hi;
            }

            buckets.hasRight[ci] = 1;
        } else {
            if (lo < buckets.leftMin[ci]) {
                buckets.leftMin[ci] = lo;
            }

            if (hi > buckets.leftMax[ci]) {
                buckets.leftMax[ci] = hi;
            }

            buckets.hasLeft[ci] = 1;
        }
    }

    // Line / scatter glyphs route through `_samples`, not `_bars`, so
    // fold their per-cat values in here. Bar / area series are already
    // covered by the loop above (including non-stacking bar/area, which
    // emit `_bars` records with `y0=0`, `y1=v`); line / scatter never
    // stack, so the sample grid is their only contribution.
    const samplingSeries = [chart._lineSeries, chart._scatterSeries];
    const samples = chart._samples;
    const sampleValid = chart._sampleValid;
    const S = chart._series.length;
    for (const seriesArr of samplingSeries) {
        for (const s of seriesArr) {
            if (hidden.has(s.seriesId)) {
                continue;
            }

            const onRight = s.axis === 1;
            const sid = s.seriesId;
            for (let ci = 0; ci < N; ci++) {
                const sampleIdx = ci * S + sid;
                if (!((sampleValid[sampleIdx >> 3] >> (sampleIdx & 7)) & 1)) {
                    continue;
                }

                const v = samples[sampleIdx];
                if (onRight) {
                    if (v < buckets.rightMin[ci]) {
                        buckets.rightMin[ci] = v;
                    }

                    if (v > buckets.rightMax[ci]) {
                        buckets.rightMax[ci] = v;
                    }

                    buckets.hasRight[ci] = 1;
                } else {
                    if (v < buckets.leftMin[ci]) {
                        buckets.leftMin[ci] = v;
                    }

                    if (v > buckets.leftMax[ci]) {
                        buckets.leftMax[ci] = v;
                    }

                    buckets.hasLeft[ci] = 1;
                }
            }
        }
    }

    chart._catExtentsHidden = hidden;
    return buckets;
}
