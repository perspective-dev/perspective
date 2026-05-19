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
import type { CandlestickChart, CandlestickAutoFitCache } from "./candlestick";
import { PlotLayout } from "../../layout/plot-layout";
import { sampleGradient } from "../../theme/gradient";
import { renderInPlotFrame } from "../../webgl/plot-frame";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import { computeNiceTicks } from "../../layout/ticks";
import { type AxisDomain } from "../../axis/numeric-axis";
import {
    renderBarAxesChrome,
    renderBarGridlines,
    type BarCategoryAxis,
} from "../../axis/bar-axis";
import {
    measureCategoricalAxisHeight,
    type CategoricalDomain,
} from "../../axis/categorical-axis";
import { buildCandlestickTooltipLines } from "./candlestick-interact";
import {
    computeVisibleExtent,
    type VisibleExtent,
} from "../common/visible-extent";

/**
 * Resolve up/down body colors from `theme.gradientStops`. Cached on the
 * chart via `_upDownColorKey` (reference identity of the stops array)
 * — only `restyle()` (which clears the theme cache via
 * `invalidateTheme`) or a data load with a fresh theme triggers
 * resampling. Legacy code re-sampled every frame.
 */
export function ensureUpDownColors(chart: CandlestickChart): void {
    const theme = chart._resolveTheme();
    const stops = theme.gradientStops;
    if (chart._upDownColorKey === stops) {
        return;
    }

    const upSample = sampleGradient(stops, 1.0);
    const downSample = sampleGradient(stops, 0.0);
    chart._upColor = [upSample[0], upSample[1], upSample[2]];
    chart._downColor = [downSample[0], downSample[1], downSample[2]];
    chart._upDownColorKey = stops;
}

/**
 * Drop persistent body / wick / OHLC vertex buffers. Subsequent draws
 * no-op until the next {@link rebuildGlyphBuffers} call.
 */
export function invalidateGlyphBuffers(chart: CandlestickChart): void {
    chart._glyphs.bodyWick.invalidateBuffers(chart);
    chart._glyphs.ohlc.invalidateBuffers(chart);
}

/**
 * Rebuild the persistent body / wick / OHLC vertex buffers. Reads
 * `_candles` (columnar) plus the cached `_upColor` / `_downColor` to
 * populate the GPU buffers exactly once per data load. Subsequent pan/
 * zoom redraws bind + dispatch with no uploads.
 */
export function rebuildGlyphBuffers(
    chart: CandlestickChart,
    glManager: WebGLContextManager,
): void {
    chart._glyphs.bodyWick.rebuildBuffers(chart, glManager);
    chart._glyphs.ohlc.rebuildBuffers(chart, glManager);
}

export function renderCandlestickFrame(
    chart: CandlestickChart,
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

    const theme = chart._resolveTheme();

    // Up/down colors sampled at the extremes of the theme gradient.
    // Cached on the chart — `ensureUpDownColors` is a no-op when the
    // gradient-stops reference matches the previous call. `restyle()`
    // clears the cache via `invalidateTheme`, and the data-load path
    // refreshes it before rebuilding glyph buffers.
    ensureUpDownColors(chart);

    const numericCat = chart._categoryAxisMode === "numeric";
    const xDomainMin = numericCat ? chart._numericCategoryDomain!.min : -0.5;
    const xDomainMax = numericCat
        ? chart._numericCategoryDomain!.max
        : chart._numCategories - 0.5;
    if (chart._zoomController) {
        chart._zoomController.setBaseDomain(
            xDomainMin,
            xDomainMax,
            chart._yDomain.min,
            chart._yDomain.max,
        );
    }

    const vis = chart._zoomController
        ? chart._zoomController.getVisibleDomain()
        : {
              xMin: xDomainMin,
              xMax: xDomainMax,
              yMin: chart._yDomain.min,
              yMax: chart._yDomain.max,
          };

    // Auto-fit the price axis to the visible X window. Skipped at
    // default zoom (the refit equals `_yDomain` there and would only
    // churn baselines).
    if (
        chart._autoFitValue &&
        chart._zoomController &&
        !chart._zoomController.isDefault()
    ) {
        const fit = computeVisibleCandleExtent(chart, vis.xMin, vis.xMax);
        if (fit.hasFit) {
            vis.yMin = fit.min;
            vis.yMax = fit.max;
        }
    }

    const hasXLabel = chart._groupBy.length > 0;

    const provisionalDomain: CategoricalDomain = {
        levels: chart._rowPaths,
        numRows: chart._numCategories,
        levelLabels: chart._groupBy.slice(),
    };

    let layout: PlotLayout;
    if (numericCat) {
        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel,
            hasYLabel: true,
            hasLegend: false,
            bottomExtra: 24,
        });
    } else {
        const estLeft = 55 + 16;
        const estRight = 16;
        const estPlotWidth = Math.max(1, cssWidth - estLeft - estRight);
        const bottomExtra = measureCategoricalAxisHeight(
            provisionalDomain,
            estPlotWidth,
        );
        layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel,
            hasYLabel: true,
            hasLegend: false,
            bottomExtra,
        });
    }

    chart._lastLayout = layout;
    if (chart._zoomController) {
        chart._zoomController.updateLayout(layout);
    }

    const projection = layout.buildProjectionMatrix(
        vis.xMin,
        vis.xMax,
        vis.yMin,
        vis.yMax,
        "y",
        undefined,
        undefined,
        chart._categoryOrigin,
        0,
    );

    const yTicks = computeNiceTicks(vis.yMin, vis.yMax, 6);
    const yLabel = chart._columnSlots[0] || "";

    const xDomain: CategoricalDomain = provisionalDomain;
    const yDomain: AxisDomain = {
        min: vis.yMin,
        max: vis.yMax,
        label: yLabel,
    };

    if (chart._gridlineCanvas) {
        renderBarGridlines(
            chart._gridlineCanvas,
            layout,
            yTicks,
            theme,
            glManager.dpr,
        );
    }

    renderInPlotFrame(gl, layout, glManager.dpr, () => {
        if (chart._defaultChartType === "ohlc") {
            chart._glyphs.ohlc.draw(chart, gl, glManager, projection);
        } else {
            chart._glyphs.bodyWick.draw(chart, gl, glManager, projection);
        }
    });

    chart._lastXDomain = xDomain;
    chart._lastYDomain = yDomain;
    chart._lastYTicks = yTicks;
    chart._lastCatTicks = numericCat
        ? computeNiceTicks(vis.xMin, vis.xMax, 6)
        : null;
    renderCandlestickChromeOverlay(chart);
}

export function renderCandlestickChromeOverlay(chart: CandlestickChart): void {
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

    // OHLC value axis: all four price columns share the value axis;
    // pick the first available (Open is always present, the rest can
    // be null per `candlestick-build.ts`).
    const valueColumn =
        chart._columnSlots[0] ??
        chart._columnSlots[1] ??
        chart._columnSlots[2] ??
        chart._columnSlots[3];
    const xColumn = chart._groupBy[0];
    renderBarAxesChrome(
        chart._chromeCanvas,
        catAxis,
        chart._lastYDomain,
        chart._lastYTicks,
        chart._lastLayout,
        theme,
        chart._glManager?.dpr ?? 1,
        undefined,
        undefined,
        false,
        {
            value: chart.getColumnFormatter(valueColumn, "tick"),
            category: chart.getColumnFormatter(xColumn, "tick"),
        },
    );

    if (chart._hoveredIdx >= 0 && chart._hoveredIdx < chart._candles.count) {
        renderCandlestickTooltip(chart);
    }
}

function renderCandlestickTooltip(chart: CandlestickChart): void {
    if (!chart._chromeCanvas || !chart._lastLayout) {
        return;
    }

    const i = chart._hoveredIdx;
    const candles = chart._candles;
    if (i < 0 || i >= candles.count) {
        return;
    }

    const layout = chart._lastLayout;
    const xCenter = candles.xCenter[i];
    const yMid = (candles.high[i] + candles.low[i]) / 2;
    const pos = layout.dataToPixel(xCenter, yMid);
    const lines = buildCandlestickTooltipLines(chart, i);
    const theme = chart._resolveTheme();
    renderCanvasTooltip(
        chart._chromeCanvas,
        pos,
        lines,
        layout,
        theme,
        chart._glManager?.dpr ?? 1,
        {
            crosshair: false,
            highlightRadius: 0,
        },
    );
}

/**
 * Price extent over candles whose `xCenter` falls inside
 * `[visXMin, visXMax]`. Uses `low`/`high` (not `open`/`close`) so the
 * wick stays inside the plot at any zoom. Cached on
 * `chart._autoFitCache`; hover-only redraws hit the cache.
 *
 * Cache lifetime: reset on data upload ([candlestick.ts]
 * `uploadAndRender`).
 */
function computeVisibleCandleExtent(
    chart: CandlestickChart,
    visXMin: number,
    visXMax: number,
): VisibleExtent {
    const cache = chart._autoFitCache;
    if (cache && cache.xMin === visXMin && cache.xMax === visXMax) {
        return cache;
    }

    const next = cache ?? newCandlestickAutoFitCache();
    next.xMin = visXMin;
    next.xMax = visXMax;

    // Walk the columnar storage directly; the legacy form built a
    // closure adapter per call, defeating monomorphism in
    // `computeVisibleExtent`.
    const candles = chart._candles;
    let lo = Infinity;
    let hi = -Infinity;
    let hasFit = false;
    const xC = candles.xCenter;
    const lows = candles.low;
    const highs = candles.high;
    for (let j = 0; j < candles.count; j++) {
        const cx = xC[j];
        if (cx < visXMin || cx > visXMax) {
            continue;
        }

        if (lows[j] < lo) {
            lo = lows[j];
        }

        if (highs[j] > hi) {
            hi = highs[j];
        }

        hasFit = true;
    }

    next.min = hasFit ? lo : 0;
    next.max = hasFit ? hi : 1;
    next.hasFit = hasFit;
    chart._autoFitCache = next;

    // Reference suppression — `computeVisibleExtent` retained for the
    // shared common helper but no longer used in this fast path.
    void computeVisibleExtent;
    return next;
}

function newCandlestickAutoFitCache(): CandlestickAutoFitCache {
    return { xMin: 0, xMax: 0, min: 0, max: 1, hasFit: false };
}
