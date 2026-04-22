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
import type { CandlestickChart } from "./candlestick";
import { PlotLayout } from "../../layout/plot-layout";
import { resolveTheme } from "../../theme/theme";
import { sampleGradient } from "../../theme/gradient";
import { renderInPlotFrame } from "../../webgl/plot-frame";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import { computeNiceTicks } from "../../layout/ticks";
import { type AxisDomain } from "../../chrome/numeric-axis";
import { renderBarAxesChrome, renderBarGridlines } from "../../chrome/bar-axis";
import {
    measureCategoricalAxisHeight,
    type CategoricalDomain,
} from "../../chrome/categorical-axis";
import { drawCandlesticks } from "./glyphs/draw-candlesticks";
import { drawOHLC } from "./glyphs/draw-ohlc";
import { buildCandlestickTooltipLines } from "./candlestick-interact";
import {
    computeVisibleExtent,
    type VisibleExtent,
} from "../common/visible-extent";

export function renderCandlestickFrame(
    chart: CandlestickChart,
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

    // Up/down colors sampled at the extremes of the theme gradient.
    // Matches the sign-aware convention (value 0 → gradient midpoint,
    // positive → top of gradient, negative → bottom).
    const upSample = sampleGradient(theme.gradientStops, 1.0);
    const downSample = sampleGradient(theme.gradientStops, 0.0);
    chart._upColor = [upSample[0], upSample[1], upSample[2]];
    chart._downColor = [downSample[0], downSample[1], downSample[2]];

    const xDomainMin = -0.5;
    const xDomainMax = chart._numCategories - 0.5;
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

    const estLeft = 55 + 16;
    const estRight = 16;
    const estPlotWidth = Math.max(1, cssWidth - estLeft - estRight);
    const provisionalDomain: CategoricalDomain = {
        levels: chart._rowPaths,
        numRows: chart._numCategories,
        levelLabels: chart._groupBy.slice(),
    };
    const bottomExtra = measureCategoricalAxisHeight(
        provisionalDomain,
        estPlotWidth,
    );

    const layout = new PlotLayout(cssWidth, cssHeight, {
        hasXLabel,
        hasYLabel: true,
        hasLegend: false,
        bottomExtra,
    });
    chart._lastLayout = layout;
    if (chart._zoomController) chart._zoomController.updateLayout(layout);

    const projection = layout.buildProjectionMatrix(
        vis.xMin,
        vis.xMax,
        vis.yMin,
        vis.yMax,
        "y",
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
        renderBarGridlines(chart._gridlineCanvas, layout, yTicks, theme);
    }

    renderInPlotFrame(gl, layout, () => {
        if (chart._defaultChartType === "ohlc") {
            drawOHLC(chart, gl, glManager, projection);
        } else {
            drawCandlesticks(chart, gl, glManager, projection);
        }
    });

    chart._lastXDomain = xDomain;
    chart._lastYDomain = yDomain;
    chart._lastYTicks = yTicks;
    renderCandlestickChromeOverlay(chart);
}

export function renderCandlestickChromeOverlay(chart: CandlestickChart): void {
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
    );

    if (chart._hoveredIdx >= 0 && chart._hoveredIdx < chart._candles.length) {
        renderCandlestickTooltip(chart);
    }
}

function renderCandlestickTooltip(chart: CandlestickChart): void {
    if (!chart._chromeCanvas || !chart._lastLayout) return;
    const candle = chart._candles[chart._hoveredIdx];
    if (!candle) return;

    const layout = chart._lastLayout;
    const pos = layout.dataToPixel(
        candle.xCenter,
        (candle.high + candle.low) / 2,
    );
    const lines = buildCandlestickTooltipLines(chart, candle);
    const theme = resolveTheme(chart._chromeCanvas);
    renderCanvasTooltip(chart._chromeCanvas, pos, lines, layout, theme, {
        crosshair: false,
        highlightRadius: 0,
    });
}

/**
 * Price extent over candles whose `xCenter` falls inside
 * `[visXMin, visXMax]`. Uses `low`/`high` (not `open`/`close`) so the
 * wick stays inside the plot at any zoom. Cached on
 * `chart._autoFitCache`; hover-only redraws hit the cache.
 *
 * Cache lifetime: reset on data upload ([candlestick.ts]
 * `uploadAndRender`). No legend / hidden-series path exists on this
 * chart, so no additional invalidation is required today.
 */
function computeVisibleCandleExtent(
    chart: CandlestickChart,
    visXMin: number,
    visXMax: number,
): VisibleExtent {
    const cache = chart._autoFitCache;
    if (cache && cache.xMin === visXMin && cache.xMax === visXMax) {
        // Cache hit — return the stored extent as a VisibleExtent.
        return cache;
    }

    const next =
        cache ?? ({} as NonNullable<CandlestickChart["_autoFitCache"]>);
    next.xMin = visXMin;
    next.xMax = visXMax;
    computeVisibleExtent(
        chart._candles,
        visXMin,
        visXMax,
        (c, out) => {
            out.cat = c.xCenter;
            out.lo = c.low;
            out.hi = c.high;
        },
        next,
    );
    chart._autoFitCache = next;
    return next;
}
