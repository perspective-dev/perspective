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
    type GlyphRun,
    type SeriesChart,
    type SeriesAutoFitCache,
} from "./series";
import type { PlotRect } from "../../layout/plot-layout";
import { PlotLayout } from "../../layout/plot-layout";
import {
    clearAndSetupFrame,
    renderInPlotFrame,
    withScissor,
} from "../../webgl/plot-frame";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import { drawBars, BAR_TYPE_BAR_VAL as BAR_TYPE_BAR } from "./glyphs/draw-bars";
import { getHoveredBar } from "./series-interact";
import { computeNiceTicks } from "../../layout/ticks";
import {
    renderOuterXAxis,
    renderOuterYAxis,
    type AxisDomain,
} from "../../axis/numeric-axis";
import {
    renderBarAxesChrome,
    renderBarGridlines,
    type BarCategoryAxis,
    type BarValueAxis,
} from "../../axis/bar-axis";
import {
    measureCategoricalAxisHeight,
    measureCategoricalAxisWidth,
    renderCategoricalXTicks,
    renderCategoricalYTicks,
    type CategoricalDomain,
} from "../../axis/categorical-axis";
import {
    bottomRowLayouts,
    buildFacetGrid,
    leftColumnLayouts,
    type FacetGrid,
} from "../../layout/facet-grid";
import { drawFacetTitle } from "../../axis/facet-chrome";
import { getScaledContext, initCanvas } from "../../axis/canvas";
import { drawGridlinesX, drawGridlinesY } from "../../axis/axis-primitives";
import { buildBarTooltipLines } from "./series-interact";
import {
    LEGEND_LINE_HEIGHT,
    legendAutoFit,
    paintFloatingLegendFrame,
    paintLegendScrollbar,
    truncateText,
    type LegendPaintView,
} from "../../axis/legend";
import {
    legendRightGutter,
    resolveLegendMode,
    legendSidebarWidth,
} from "../../interaction/legend-controller";

/**
 * Reusable scratch for bar instance uploads.
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
 * Upload bar instance buffers from the columnar `_bars` storage.
 *
 * Overlay mode emits instances in `_bars` order. Facet-grid mode
 * (`_facetActive`) emits them split-major via a counting sort so each
 * facet's instances form a contiguous range — recorded on
 * `chart._facetBarRanges` and drawn per facet with an instance-offset
 * `drawBars` call.
 */
export function uploadBarInstances(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): void {
    const bars = chart._bars;
    const total = bars.count;
    const P = chart._splitPrefixes.length;
    const faceted = chart._facetActive && P > 0;
    let n = 0;

    chart._facetBarRanges = null;
    chart._facetBarAggRanges = null;
    chart._barAggRanges = null;
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

        // Counting sort so contiguous instance ranges exist for every
        // draw grouping. Overlay: key = aggIdx, publishing
        // `_barAggRanges` — a glyph run `[aggStart, aggEnd]` is one
        // contiguous slice, and within-call overlap Z follows `columns`
        // declaration order. Faceted: key = splitIdx-major then aggIdx,
        // publishing both the per-split `_facetBarRanges` (facet
        // dispatch) and the per-(split, agg) `_facetBarAggRanges` (run
        // slices within a facet). Pass 1 counts eligible instances per
        // bucket; prefix sums become the write cursors AND the ranges.
        const M = Math.max(1, chart._aggregates.length);
        const bucketOf = faceted
            ? (seriesId: number) =>
                  (seriesId % P) * M + Math.floor(seriesId / P)
            : (seriesId: number) =>
                  P > 0 ? Math.floor(seriesId / P) : seriesId;
        const numBuckets = faceted ? P * M : M;
        const counts = new Array<number>(numBuckets).fill(0);
        for (let i = 0; i < total; i++) {
            if (ct[i] !== BAR_TYPE_BAR || hidden.has(sid[i])) {
                continue;
            }

            counts[bucketOf(sid[i])]++;
        }

        const ranges: { start: number; count: number }[] = [];
        const cursors = new Int32Array(numBuckets);
        let acc = 0;
        for (let b = 0; b < numBuckets; b++) {
            ranges.push({ start: acc, count: counts[b] });
            cursors[b] = acc;
            acc += counts[b];
        }

        if (faceted) {
            chart._barAggRanges = null;
            chart._facetBarAggRanges = Array.from({ length: P }, (_, p) =>
                ranges.slice(p * M, (p + 1) * M),
            );
            chart._facetBarRanges = Array.from({ length: P }, (_, p) => {
                const first = ranges[p * M];
                const last = ranges[(p + 1) * M - 1];
                return {
                    start: first.start,
                    count: last.start + last.count - first.start,
                };
            });
        } else {
            chart._barAggRanges = ranges;
            chart._facetBarAggRanges = null;
        }

        const writeAt = (seriesId: number) => cursors[bucketOf(seriesId)]++;

        for (let i = 0; i < total; i++) {
            if (ct[i] !== BAR_TYPE_BAR) {
                continue;
            }

            const seriesId = sid[i];
            if (hidden.has(seriesId)) {
                continue;
            }

            const w = writeAt(seriesId);
            scratch.xCenters[w] = xC[i] - xOrigin;
            scratch.halfWidths[w] = hw[i];
            scratch.y0s[w] = by0[i];
            scratch.y1s[w] = by1[i];
            scratch.seriesIds[w] = seriesId;
            scratch.axes[w] = ax[i];
            const color = series[seriesId].color;
            scratch.colors[w * 3] = color[0];
            scratch.colors[w * 3 + 1] = color[1];
            scratch.colors[w * 3 + 2] = color[2];
            indices[w] = i;
            n++;
        }
    } else if (faceted) {
        chart._facetBarRanges = Array.from({ length: P }, () => ({
            start: 0,
            count: 0,
        }));
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
    // on `_autoFitValue` + the categorical axis being non-default: the
    // refit only narrows when the categorical axis is itself zoomed
    // (otherwise the visible window equals the data extent and the
    // refit collapses back to `_leftDomain`/`_rightDomain`). Vertical
    // charts put the category on X; horizontal charts put it on Y.
    const catNonDefault = horizontal
        ? !chart._zoomController?.isYDefault()
        : !chart._zoomController?.isXDefault();
    if (chart._autoFitValue && chart._zoomController && catNonDefault) {
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

    // Facet-grid branch — one sub-plot per split group. Keys off the
    // build-time `_facetActive` stamp (NOT the live `_facetConfig`) so
    // this frame's render mode always matches the stack geometry the
    // current `_bars` were built with.
    if (chart._facetActive && chart._splitPrefixes.length > 1) {
        renderFacetedBarFrame(chart, glManager, {
            horizontal,
            numericCat,
            cssWidth,
            cssHeight,
            visCatMin,
            visCatMax,
            visValMin,
            visValMax,
            visRightMin,
            visRightMax,
        });
        return;
    }

    chart._facetGrid = null;

    const hasLegend = chart._series.length > 1;
    const hasCatLabel = chart._groupBy.length > 0;

    const provisionalDomain: CategoricalDomain = {
        levels: chart._rowPaths,
        numRows: chart._numCategories,
        levelLabels: chart._groupBy.slice(),
    };

    // Categorical value-axis sizing. Y Bar puts the value axis on the
    // left (so the category labels need extra `leftExtra` width); X Bar
    // puts it on the bottom (extra `bottomExtra` height for the leaf
    // labels). We additionally override the category-axis gutter on
    // the opposite side via the existing `provisionalDomain` path.
    const valueCatDomain = chart._leftValueCategoryDomain;
    const valueCatActive =
        chart._leftValueAxisMode === "category" &&
        valueCatDomain !== null &&
        valueCatDomain.numRows > 0;

    let layout: PlotLayout;
    if (horizontal) {
        // X Bar: category axis on the left (Y side), value axis on the
        // bottom (X side). Categorical value axis grows the bottom
        // gutter; numeric value axis uses the fixed 24px row.
        const leftExtra = numericCat
            ? 55
            : measureCategoricalAxisWidth(provisionalDomain);
        const estLeft = leftExtra + (hasCatLabel ? 16 : 0);
        const estRight = legendRightGutter(
            chart._pluginConfig,
            hasLegend,
            80,
            chart._series.length,
        );
        const estPlotWidthH = Math.max(1, cssWidth - estLeft - estRight);
        const bottomExtra = valueCatActive
            ? measureCategoricalAxisHeight(valueCatDomain, estPlotWidthH)
            : undefined;
        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: true,
            hasYLabel: hasCatLabel,
            hasLegend,
            leftExtra,
            bottomExtra,
            rightExtra: estRight,
        });
    } else if (numericCat) {
        // Y Bar with numeric category axis on X. Value axis (Y, left)
        // may still be categorical when all aggregates are string.
        const leftExtra = valueCatActive
            ? measureCategoricalAxisWidth(valueCatDomain)
            : undefined;
        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: hasCatLabel,
            hasYLabel: true,
            hasLegend,
            bottomExtra: 24,
            leftExtra,
            rightExtra: legendRightGutter(
                chart._pluginConfig,
                hasLegend,
                80,
                chart._series.length,
            ),
        });
    } else {
        // Y Bar with categorical X. Value axis on the left may be
        // categorical too — independently sized.
        const leftExtraBase = valueCatActive
            ? measureCategoricalAxisWidth(valueCatDomain)
            : 55;
        const estLeft = leftExtraBase + 16;
        const estRight = legendRightGutter(
            chart._pluginConfig,
            hasLegend,
            80,
            chart._series.length,
        );
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
            leftExtra: valueCatActive ? leftExtraBase : undefined,
            rightExtra: estRight,
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

    const hovered = chart._series.length > 1 ? getHoveredBar(chart) : null;
    renderInPlotFrame(gl, layout, glManager.dpr, () => {
        drawGlyphRuns(
            chart,
            gl,
            glManager,
            projLeft,
            projRight,
            theme.areaOpacity,
            horizontal,
            hovered ? hovered.seriesId : -1,
        );
    });

    chart._lastXDomain = catDomain;
    chart._lastYDomain = valueDomain;
    chart._lastYTicks = leftValueTicks;
    chart._lastAltYDomain = altValueDomain;
    chart._lastAltYTicks = rightValueTicks;
    chart._lastCatTicks = numericCat
        ? computeNiceTicks(visCatMin, visCatMax, 6)
        : null;
    // Deferred past the GPU fence (see `_defer2D`) so the chrome canvas
    // doesn't present ahead of the GL glyphs on resize. Reads the
    // `_last*` frame state set above.
    chart._defer2D(() => renderBarChromeOverlay(chart));
}

/**
 * Paint every glyph in `columns` declaration Z-order — one pass per
 * {@link SeriesChart._glyphRuns} entry, ascending `aggIdx`, later
 * columns on top; splits within an aggregate paint in `splitIdx`
 * order. A homogeneous chart is a single run and takes exactly the
 * legacy one-pass path (no per-series filtering, single instanced bar
 * draw). X Bar (horizontal) paints bars only — the other glyphs bake
 * vertical geometry.
 *
 * The caller wraps this in its plot clip (`renderInPlotFrame` /
 * `withScissor`); `splitFilter` is the facet index in faceted frames.
 */
function drawGlyphRuns(
    chart: SeriesChart,
    gl: WebGL2RenderingContext | WebGLRenderingContext,
    glManager: WebGLContextManager,
    projLeft: Float32Array,
    projRight: Float32Array,
    areaOpacity: number,
    horizontal: boolean,
    hoveredSeriesId: number,
    splitFilter?: number,
): void {
    const runs = chart._glyphRuns;
    const single = runs.length <= 1;
    for (const run of runs) {
        const aggRange = single
            ? undefined
            : { start: run.aggStart, end: run.aggEnd };
        switch (run.chartType) {
            case "area":
                if (!horizontal) {
                    chart._glyphs.areas.draw(
                        chart,
                        gl,
                        glManager,
                        projLeft,
                        projRight,
                        areaOpacity,
                        splitFilter,
                        aggRange,
                    );
                }

                break;
            case "bar": {
                gl.useProgram(chart._program!);
                const loc = chart._locations!;
                gl.uniformMatrix4fv(loc.u_proj_left, false, projLeft);
                gl.uniformMatrix4fv(loc.u_proj_right, false, projRight);
                gl.uniform1f(loc.u_horizontal, horizontal ? 1.0 : 0.0);
                gl.uniform1f(loc.u_hover_series, hoveredSeriesId);
                drawBars(
                    chart,
                    gl,
                    glManager,
                    barRunRange(chart, run, splitFilter),
                );
                break;
            }

            case "line":
                if (!horizontal) {
                    chart._glyphs.lines.draw(
                        chart,
                        gl,
                        glManager,
                        projLeft,
                        projRight,
                        splitFilter,
                        aggRange,
                    );
                }

                break;
            case "scatter":
                if (!horizontal) {
                    chart._glyphs.scatter.draw(
                        chart,
                        gl,
                        glManager,
                        projLeft,
                        projRight,
                        splitFilter,
                        aggRange,
                    );
                }

                break;
        }
    }
}

/**
 * The contiguous uploaded-instance slice for a bar run — per-aggregate
 * ranges are adjacent by construction (`uploadBarInstances` counting
 * sort), so the run `[aggStart, aggEnd]` spans from the first range's
 * start through the last range's end. Faceted frames slice within the
 * facet's split-major block.
 */
function barRunRange(
    chart: SeriesChart,
    run: GlyphRun,
    splitFilter?: number,
): { start: number; count: number } | undefined {
    const table =
        splitFilter !== undefined
            ? chart._facetBarAggRanges?.[splitFilter]
            : chart._barAggRanges;
    if (!table) {
        return splitFilter !== undefined ? { start: 0, count: 0 } : undefined;
    }

    const first = table[run.aggStart];
    const last = table[run.aggEnd];
    return { start: first.start, count: last.start + last.count - first.start };
}

/**
 * Domain window computed by `renderBarFrame`'s shared prologue (zoom
 * window + auto-fit + `include_zero`), handed to the faceted branch.
 */
interface FacetedFrameCtx {
    horizontal: boolean;
    numericCat: boolean;
    cssWidth: number;
    cssHeight: number;
    visCatMin: number;
    visCatMax: number;
    visValMin: number;
    visValMax: number;
    visRightMin: number;
    visRightMax: number;
}

/**
 * Faceted frame — one sub-plot per split group, laid out by
 * `buildFacetGrid`. Geometry contract with the build pipeline
 * (`facetSplits`): every split's records share the same band-slot
 * coordinates and per-split stack baselines, so a facet is exactly
 * "the single-plot render restricted to one split" — same domains,
 * same projection math, different `PlotLayout` + instance subset.
 *
 * Axis policy: the value axis is shared (one outer band, one domain
 * for every facet); the category axis paints per-cell when
 * categorical (the outer painters are numeric-only — same compromise
 * as the cartesian faceted path) and shared-outer when numeric. Zoom
 * is shared: `syncFacetZoomLayouts` keeps the single controller's
 * layout on cell 0, and every facet renders the same visible window.
 *
 * Known limitation: the grid reserves no outer band for a secondary
 * value axis, so dual-axis series project correctly inside each facet
 * but the right-axis chrome is suppressed (`_lastAltYDomain = null`).
 */
function renderFacetedBarFrame(
    chart: SeriesChart,
    glManager: WebGLContextManager,
    ctx: FacetedFrameCtx,
): void {
    const gl = glManager.gl;
    const dpr = glManager.dpr;
    const theme = chart._resolveTheme();
    const {
        horizontal,
        numericCat,
        cssWidth,
        cssHeight,
        visCatMin,
        visCatMax,
        visValMin,
        visValMax,
        visRightMin,
        visRightMax,
    } = ctx;

    const hasCatLabel = chart._groupBy.length > 0;
    const valueCatDomain = chart._leftValueCategoryDomain;
    const valueCatActive =
        chart._leftValueAxisMode === "category" &&
        valueCatDomain !== null &&
        valueCatDomain.numRows > 0;

    // Facets absorb the split dimension and color follows the
    // aggregate, so only multiple aggregates warrant a legend.
    const hasLegend = chart._aggregates.length > 1;

    // `buildFacetGrid` axis modes are named in CANVAS orientation
    // (x = bottom band, y = left band); map the logical category /
    // value sides onto them per chart orientation.
    const catAxisMode = numericCat ? ("outer" as const) : ("cell" as const);
    const valAxisMode = valueCatActive ? ("cell" as const) : ("outer" as const);

    const grid: FacetGrid = buildFacetGrid(chart._splitPrefixes, {
        cssWidth,
        cssHeight,
        xAxis: horizontal ? valAxisMode : catAxisMode,
        yAxis: horizontal ? catAxisMode : valAxisMode,
        hasLegend:
            hasLegend &&
            resolveLegendMode(chart._pluginConfig, chart._aggregates.length) ===
                "sidebar",
        legendWidth: legendSidebarWidth(chart._pluginConfig, 96),
        hasXLabel: horizontal ? true : hasCatLabel,
        hasYLabel: horizontal ? hasCatLabel : true,
        gap: chart._facetConfig.facet_padding,
    });
    chart._facetGrid = grid;
    chart._lastLayout = grid.cells[0]?.layout ?? null;
    if (grid.cells.length === 0 || !chart._lastLayout) {
        return;
    }

    chart.syncFacetZoomLayouts(grid.cells);

    const leftValueTicks = computeNiceTicks(visValMin, visValMax, 6);
    const catTicks = numericCat
        ? computeNiceTicks(visCatMin, visCatMax, 6)
        : null;

    const sampleLayout = grid.cells[0].layout;
    const gridlineCanvas = chart._gridlineCanvas;
    if (gridlineCanvas) {
        // Deferred FIRST so the destructive resize/clear runs before
        // the per-cell gridline closures below (FIFO flush order).
        chart._defer2D(() => initCanvas(gridlineCanvas, sampleLayout, dpr));
    }

    const requireZero = chart._pluginConfig.include_zero;
    const hovered = chart._series.length > 1 ? getHoveredBar(chart) : null;
    const hasRight =
        chart._hasRightAxis && chart._rightDomain !== null && !horizontal;

    clearAndSetupFrame(gl);
    for (let p = 0; p < grid.cells.length; p++) {
        const cell = grid.cells[p];
        const layout = cell.layout;

        // Same projection args as the single-plot path, on the cell's
        // layout. Seeds the cell's padded domain, which the deferred
        // gridline closure, chrome overlay, and hover hit-test read.
        const projLeft = horizontal
            ? layout.buildProjectionMatrix(
                  visValMin,
                  visValMax,
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

        let projRight = projLeft;
        if (hasRight) {
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
        }

        if (gridlineCanvas) {
            chart._defer2D(() =>
                renderBarGridlinesCell(
                    gridlineCanvas,
                    layout,
                    leftValueTicks,
                    theme,
                    dpr,
                    horizontal,
                ),
            );
        }

        withScissor(gl, layout, dpr, () => {
            drawGlyphRuns(
                chart,
                gl,
                glManager,
                projLeft,
                projRight,
                theme.areaOpacity,
                horizontal,
                hovered && hovered.splitIdx === p ? hovered.seriesId : -1,
                p,
            );
        });
    }

    chart._lastXDomain = {
        levels: chart._rowPaths,
        numRows: chart._numCategories,
        levelLabels: chart._groupBy.slice(),
    };
    chart._lastYDomain = {
        min: visValMin,
        max: visValMax,
        label: chart._primaryValueLabel,
    };
    chart._lastYTicks = leftValueTicks;
    chart._lastAltYDomain = null;
    chart._lastAltYTicks = null;
    chart._lastCatTicks = catTicks;
    chart._defer2D(() => renderBarChromeOverlay(chart));
}

/**
 * Per-cell value-axis gridlines for the faceted frame. Non-destructive
 * counterpart to {@link renderBarGridlines} — the shared gridline
 * canvas is `initCanvas`'d once per frame, then each facet paints into
 * it via `getScaledContext`.
 */
function renderBarGridlinesCell(
    canvas: NonNullable<SeriesChart["_gridlineCanvas"]>,
    layout: PlotLayout,
    valueTicks: number[],
    theme: ReturnType<SeriesChart["_resolveTheme"]>,
    dpr: number,
    horizontal: boolean,
): void {
    const ctx = getScaledContext(canvas, dpr);
    if (!ctx) {
        return;
    }

    ctx.strokeStyle = theme.gridlineColor;
    ctx.lineWidth = 1;
    if (horizontal) {
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

/**
 * Resolve the `PlotLayout` a record renders in: the record's facet
 * cell in faceted frames, the single plot layout otherwise. Tooltip /
 * pin positioning must map through this so faceted anchors land in the
 * record's own cell.
 */
export function layoutForRecord(
    chart: SeriesChart,
    b: { splitIdx: number },
): PlotLayout | null {
    if (chart._facetGrid) {
        return chart._facetGrid.cells[b.splitIdx]?.layout ?? null;
    }

    return chart._lastLayout;
}

/**
 * Draw axes chrome + legend + tooltip onto the overlay canvas.
 */
export function renderBarChromeOverlay(chart: SeriesChart): void {
    paintBarChromeOverlay(chart);
    chart.presentOverlay();
}

function paintBarChromeOverlay(chart: SeriesChart): void {
    if (
        !chart._chromeCanvas ||
        !chart._lastLayout ||
        !chart._lastYDomain ||
        !chart._lastYTicks
    ) {
        return;
    }

    if (chart._facetGrid) {
        renderFacetedBarChromeOverlay(chart);
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

    // Discriminate each value-axis side independently: a side becomes
    // categorical when every aggregate on it is post-aggregation
    // `string`-typed (the build pipeline already applied this
    // all-or-nothing rule and stamped `_*ValueAxisMode`).
    const valueAxis: BarValueAxis =
        chart._leftValueAxisMode === "category" &&
        chart._leftValueCategoryDomain
            ? { mode: "category", domain: chart._leftValueCategoryDomain }
            : {
                  mode: "numeric",
                  domain: chart._lastYDomain,
                  ticks: chart._lastYTicks,
              };
    let altAxis: BarValueAxis | undefined;
    if (chart._lastAltYDomain && chart._lastAltYTicks) {
        altAxis =
            chart._rightValueAxisMode === "category" &&
            chart._rightValueCategoryDomain
                ? {
                      mode: "category",
                      domain: chart._rightValueCategoryDomain,
                  }
                : {
                      mode: "numeric",
                      domain: chart._lastAltYDomain,
                      ticks: chart._lastAltYTicks,
                  };
    }

    renderBarAxesChrome(
        chart._chromeCanvas,
        catAxis,
        valueAxis,
        chart._lastLayout,
        theme,
        chart._glManager?.dpr ?? 1,
        altAxis,
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
 * Chrome overlay for the faceted frame. The canvas is `initCanvas`'d
 * once, then every painter goes through `getScaledContext` — per-cell
 * axis frames, per-cell categorical ticks, shared outer numeric
 * bands, facet titles, the aggregate legend, and the tooltip (mapped
 * through the hovered record's own cell).
 */
function renderFacetedBarChromeOverlay(chart: SeriesChart): void {
    const grid = chart._facetGrid!;
    const canvas = chart._chromeCanvas!;
    const theme = chart._resolveTheme();
    const dpr = chart._glManager?.dpr ?? 1;
    const horizontal = chart._isHorizontal;
    const hasCatLabel = chart._groupBy.length > 0;
    const numericCat =
        chart._categoryAxisMode === "numeric" &&
        chart._numericCategoryDomain !== null &&
        chart._lastCatTicks !== null;

    if (!initCanvas(canvas, chart._lastLayout!, dpr)) {
        return;
    }

    const catDomain = chart._lastXDomain;
    const valueDomain = chart._lastYDomain!;
    const valueTicks = chart._lastYTicks!;
    const valueCatDomain = chart._leftValueCategoryDomain;
    const valueCatActive =
        chart._leftValueAxisMode === "category" &&
        valueCatDomain !== null &&
        valueCatDomain.numRows > 0;

    const primarySeries = chart._series.find((s) => s.axis === 0);
    const valueFmt = chart.getColumnFormatter(
        primarySeries?.aggName ?? null,
        "tick",
    );
    const catFmt = chart.getColumnFormatter(chart._groupBy[0], "tick");

    for (const cell of grid.cells) {
        const layout = cell.layout;
        const plot = layout.plotRect;
        const ctx = getScaledContext(canvas, dpr);
        if (!ctx) {
            continue;
        }

        ctx.strokeStyle = theme.axisLineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plot.x, plot.y);
        ctx.lineTo(plot.x, plot.y + plot.height);
        ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
        ctx.stroke();

        // Categorical sides paint per cell (the outer band painters
        // are numeric-only); numeric sides are painted once below
        // into the shared outer bands.
        if (!horizontal) {
            if (!numericCat && catDomain) {
                renderCategoricalXTicks(ctx, layout, catDomain, theme);
            }

            if (valueCatActive) {
                renderCategoricalYTicks(ctx, layout, valueCatDomain!, theme);
            }
        } else {
            if (!numericCat && catDomain) {
                renderCategoricalYTicks(ctx, layout, catDomain, theme);
            }

            if (valueCatActive) {
                renderCategoricalXTicks(ctx, layout, valueCatDomain!, theme);
            }
        }

        if (cell.titleRect) {
            drawFacetTitle(canvas, cell.label, cell.titleRect, theme, dpr);
        }
    }

    const numericCatAxisDomain: AxisDomain | null = numericCat
        ? {
              min: chart._numericCategoryDomain!.min,
              max: chart._numericCategoryDomain!.max,
              isDate: chart._numericCategoryDomain!.isDate,
              label: chart._numericCategoryDomain!.label,
          }
        : null;

    if (!horizontal) {
        if (numericCatAxisDomain && grid.outerXAxisRect) {
            renderOuterXAxis(
                canvas,
                grid.outerXAxisRect,
                numericCatAxisDomain,
                chart._lastCatTicks!,
                bottomRowLayouts(grid),
                theme,
                hasCatLabel,
                dpr,
                catFmt,
            );
        }

        if (!valueCatActive && grid.outerYAxisRect) {
            renderOuterYAxis(
                canvas,
                grid.outerYAxisRect,
                valueDomain,
                valueTicks,
                leftColumnLayouts(grid),
                theme,
                true,
                dpr,
                valueFmt,
            );
        }
    } else {
        if (numericCatAxisDomain && grid.outerYAxisRect) {
            renderOuterYAxis(
                canvas,
                grid.outerYAxisRect,
                numericCatAxisDomain,
                chart._lastCatTicks!,
                leftColumnLayouts(grid),
                theme,
                hasCatLabel,
                dpr,
                catFmt,
            );
        }

        if (!valueCatActive && grid.outerXAxisRect) {
            renderOuterXAxis(
                canvas,
                grid.outerXAxisRect,
                valueDomain,
                valueTicks,
                bottomRowLayouts(grid),
                theme,
                true,
                dpr,
                valueFmt,
            );
        }
    }

    renderFacetedBarLegend(chart, grid);

    if (getHoveredBar(chart)) {
        renderBarTooltipCanvas(chart);
    }
}

/**
 * One toggleable legend row, resolved lazily — only rows inside the
 * visible scroll window are ever materialized.
 */
interface SeriesLegendEntry {
    label: string;
    color: [number, number, number];
    seriesIds: number[];
    hidden: boolean;
}

/**
 * Shared swatch-list painter for both series legends (per-series and
 * per-aggregate). Paints only the rows inside the scroll window,
 * clipped to the content rect, rebuilds `chart._legendRects` with the
 * visible rows' canvas-space rects (so toggle clicks stay correct
 * while scrolled), and reports the painted geometry to the chart's
 * `LegendController`.
 */
function paintSeriesLegend(
    chart: SeriesChart,
    box: PlotRect,
    view: LegendPaintView,
    count: number,
    entryAt: (i: number) => SeriesLegendEntry,
): void {
    const ctx = chart._chromeCanvas!.getContext("2d") as Context2D | null;
    if (!ctx) {
        return;
    }

    ctx.save();
    const theme = chart._resolveTheme();
    let content = box;
    if (view.mode === "floating") {
        content = paintFloatingLegendFrame(
            ctx,
            box,
            theme,
            view.title,
            view.opacity,
        );
    }

    const swatchSize = 10;
    const lineHeight = LEGEND_LINE_HEIGHT;
    const contentHeight = count * lineHeight;
    const scroll = chart._legend.clampScroll(content.height, contentHeight);
    const scrollable = contentHeight > content.height;
    const textMax = Math.max(
        0,
        content.width - swatchSize - 6 - (scrollable ? 10 : 0),
    );

    ctx.beginPath();
    ctx.rect(content.x, content.y, content.width, content.height);
    ctx.clip();
    ctx.font = `11px ${theme.fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const x = content.x;
    const start = Math.floor(scroll / lineHeight);
    let y = content.y + lineHeight / 2 + start * lineHeight - scroll;
    for (
        let i = start;
        i < count && y - lineHeight / 2 < content.y + content.height;
        i++
    ) {
        const e = entryAt(i);
        const r = Math.round(e.color[0] * 255);
        const g = Math.round(e.color[1] * 255);
        const b = Math.round(e.color[2] * 255);

        ctx.globalAlpha = e.hidden ? 0.3 : 1.0;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y - swatchSize / 2, swatchSize, swatchSize);

        const shown = truncateText(ctx, e.label, textMax);
        const textW = ctx.measureText(shown).width;
        ctx.fillStyle = theme.legendText;
        ctx.fillText(shown, x + swatchSize + 6, y);

        if (e.hidden) {
            ctx.strokeStyle = theme.legendText;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + swatchSize + 6, y);
            ctx.lineTo(x + swatchSize + 6 + textW, y);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;

        chart._legendRects.push({
            seriesIds: e.seriesIds,
            rect: {
                x: x - 2,
                y: y - lineHeight / 2,
                width: Math.min(
                    swatchSize + 6 + textW + 4,
                    Math.max(1, content.width),
                ),
                height: lineHeight,
            },
        });

        y += lineHeight;
    }

    ctx.restore();
    paintLegendScrollbar(ctx, content, scroll, contentHeight, theme);

    chart._legend.setPainted({
        mode: view.mode,
        box,
        content,
        contentHeight,
        sidebarGutter: view.sidebarGutter,
    });
}

/**
 * Aggregate-level legend for the faceted frame, painted into the
 * grid's shared right gutter (or as a floating panel). One entry per
 * aggregate (facets absorb the split dimension; every split of an
 * aggregate shares its color — see `ensurePalette`). A legend toggle
 * targets the aggregate's full seriesId set, so hiding "Sales" hides
 * it in every facet at once; an entry reads as hidden only when ALL of
 * its series are hidden.
 */
function renderFacetedBarLegend(chart: SeriesChart, grid: FacetGrid): void {
    chart._legendRects = [];
    if (!chart._chromeCanvas || !chart._lastLayout) {
        return;
    }

    const cfg = chart._pluginConfig;
    const M = chart._aggregates.length;
    const mode = resolveLegendMode(cfg, M);
    const floating = mode === "floating";
    if (M <= 1 || mode === "none" || (!floating && !grid.legendRect)) {
        chart._legend.clearPainted();
        return;
    }

    // Pre-bucket series by aggregate once (O(series)) so the per-row
    // resolver is O(1) — the windowed painter may touch only a few of
    // potentially many rows.
    const idsByAgg: number[][] = Array.from({ length: M }, () => []);
    const colorByAgg: [number, number, number][] = Array.from(
        { length: M },
        () => [0.5, 0.5, 0.5],
    );
    for (const s of chart._series) {
        if (s.aggIdx >= 0 && s.aggIdx < M) {
            idsByAgg[s.aggIdx].push(s.seriesId);
            colorByAgg[s.aggIdx] = s.color;
        }
    }

    const layout = chart._lastLayout;
    const box = floating
        ? chart._legend.floatingBox(
              cfg,
              layout.cssWidth,
              layout.cssHeight,
              legendAutoFit(
                  chart._chromeCanvas,
                  chart._resolveTheme(),
                  M,
                  () => chart._aggregates.slice(0, M),
                  { title: "Legend" },
              ),
          )
        : {
              x: grid.legendRect!.x + 12,
              y: grid.legendRect!.y + 10,
              width: Math.max(1, grid.legendRect!.width - 16),
              height: Math.max(1, grid.legendRect!.height - 20),
          };

    paintSeriesLegend(
        chart,
        box,
        {
            mode: floating ? "floating" : "sidebar",
            legend: chart._legend,
            title: "Legend",
            sidebarGutter: floating ? undefined : grid.legendRect!.width,
            opacity: cfg.legend_opacity,
        },
        M,
        (k) => ({
            label: chart._aggregates[k],
            color: colorByAgg[k],
            seriesIds: idsByAgg[k],
            hidden: idsByAgg[k].every((sid) => chart._hiddenSeries.has(sid)),
        }),
    );
}

function renderBarLegend(chart: SeriesChart): void {
    chart._legendRects = [];
    if (!chart._chromeCanvas || !chart._lastLayout) {
        return;
    }

    const cfg = chart._pluginConfig;
    const series = chart._series;
    const mode = resolveLegendMode(cfg, series.length);
    if (series.length <= 1 || mode === "none") {
        chart._legend.clearPainted();
        return;
    }

    const layout = chart._lastLayout;
    const floating = mode === "floating";
    const title = chart._splitBy.join(" / ") || "Legend";
    const box = floating
        ? chart._legend.floatingBox(
              cfg,
              layout.cssWidth,
              layout.cssHeight,
              legendAutoFit(
                  chart._chromeCanvas,
                  chart._resolveTheme(),
                  series.length,
                  function* () {
                      for (const s of series) {
                          yield s.label;
                      }
                  },
                  { title },
              ),
          )
        : {
              x: layout.plotRect.x + layout.plotRect.width + 12,
              y: layout.margins.top + 10,
              width: Math.max(
                  1,
                  layout.cssWidth -
                      layout.plotRect.x -
                      layout.plotRect.width -
                      16,
              ),
              height: Math.max(1, layout.plotRect.height - 10),
          };

    paintSeriesLegend(
        chart,
        box,
        {
            mode: floating ? "floating" : "sidebar",
            legend: chart._legend,
            title,
            sidebarGutter: floating ? undefined : layout.margins.right,
            opacity: cfg.legend_opacity,
        },
        series.length,
        (i) => ({
            label: series[i].label,
            color: series[i].color,
            seriesIds: [series[i].seriesId],
            hidden: chart._hiddenSeries.has(series[i].seriesId),
        }),
    );
}

function renderBarTooltipCanvas(chart: SeriesChart): void {
    if (!chart._chromeCanvas || !chart._lastLayout) {
        return;
    }

    const b = getHoveredBar(chart);
    if (!b) {
        return;
    }

    // Faceted frames anchor in the record's own cell; single-plot
    // frames fall through to `_lastLayout`.
    const layout = layoutForRecord(chart, b);
    if (!layout) {
        return;
    }

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
            : rightAxisDataToPixel(chart, b.xCenter, anchorV, layout);

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
    layoutOverride?: PlotLayout,
): { px: number; py: number } {
    const layout = layoutOverride ?? chart._lastLayout!;
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
        // Resolve the visible catIdx range. Category mode: `visCat*` are
        // already in catIdx space, so floor/ceil into `[0, n-1]`.
        // Numeric mode (`date | datetime | integer | float` group_by):
        // `visCat*` are absolute data values from the zoom controller's
        // visible domain — for a datetime axis they're ~1.7e12-magnitude
        // timestamps. A blind `Math.floor(visCatMin)` of that gives `lo
        // ≫ n`, the loop body never executes, and the value-axis refit
        // silently no-ops (chart looks the same horizontally-zoomed as
        // unzoomed). Map the data range back to catIdx via the sorted
        // `_categoryPositions`. See [series-interact.ts:239-250] for the
        // parallel hit-test branch.
        const positions = chart._categoryPositions;
        let lo: number;
        let hi: number;
        if (positions) {
            const r = mapDomainToCatRange(
                positions,
                buckets.n,
                visCatMin,
                visCatMax,
            );
            lo = r.lo;
            hi = r.hi;
        } else {
            lo = Math.max(0, Math.floor(visCatMin));
            hi = Math.min(buckets.n - 1, Math.ceil(visCatMax));
        }

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

/**
 * Map a numeric visible domain `[visMin, visMax]` to the inclusive catIdx
 * range `[lo, hi]` that intersects it, using a sorted `categoryPositions`
 * vector (ASC, per the pivot order). Returns an empty range (`lo > hi`)
 * when the domain misses every category.
 *
 * Edges are expanded by one catIdx on each side so a category whose
 * center sits just outside the visible window — but whose band-half
 * still overlaps it — still contributes to the auto-fit extent.
 */
function mapDomainToCatRange(
    positions: Float64Array,
    n: number,
    visMin: number,
    visMax: number,
): { lo: number; hi: number } {
    if (n === 0 || visMin > visMax) {
        return { lo: 0, hi: -1 };
    }

    // Lower bound: smallest idx where positions[idx] >= visMin.
    let l = 0;
    let r = n;
    while (l < r) {
        const m = (l + r) >>> 1;
        if (positions[m] < visMin) {
            l = m + 1;
        } else {
            r = m;
        }
    }

    const lo = Math.max(0, l - 1);

    // Upper bound: smallest idx where positions[idx] > visMax (`l` after
    // loop). `l` itself is one past the last in-range catIdx, so the
    // inclusive `hi` for an exactly-overlapping band is `l - 1`; the
    // `+1`-then-clamp expands by one to capture partial-overlap bands.
    l = 0;
    r = n;
    while (l < r) {
        const m = (l + r) >>> 1;
        if (positions[m] <= visMax) {
            l = m + 1;
        } else {
            r = m;
        }
    }

    const hi = Math.min(n - 1, l);
    return { lo, hi };
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
