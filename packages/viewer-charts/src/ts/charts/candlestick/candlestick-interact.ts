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

import type { CandlestickChart } from "./candlestick";
import { renderCandlestickChromeOverlay } from "./candlestick-render";

/**
 * Pixels of horizontal slack around the wick centerline so narrow
 * bodies with tall wicks stay clickable.
 */
const WICK_TOLERANCE_PX = 3;

/**
 * Find the leftmost candle index whose `xCenter` is `>= target`. Bars
 * are appended in (split, cat) order; within a split `xCenter` is
 * monotonically increasing, but across splits it interleaves at the
 * same catIdx. The hit-test still only needs the first candidate at or
 * after `target` — subsequent split records share the same catIdx and
 * are visited until xCenter exceeds `target + halfWidth`, so a plain
 * binary search on `xCenter` ordered as written suffices when
 * splits=1; for multi-split we fall back to a linear scan from the
 * lower bound found.
 */
function lowerBoundXCenter(
    xC: Float64Array,
    count: number,
    target: number,
): number {
    let lo = 0;
    let hi = count;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (xC[mid] < target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

export function handleCandlestickHover(
    chart: CandlestickChart,
    mx: number,
    my: number,
): void {
    if (chart._pinnedIdx !== -1) {
        return;
    }

    const layout = chart._lastLayout;
    if (!layout) {
        return;
    }

    const candles = chart._candles;
    if (candles.count === 0) {
        if (chart._hoveredIdx !== -1) {
            chart._hoveredIdx = -1;
            renderCandlestickChromeOverlay(chart);
        }

        return;
    }

    // Convert mouse → data once; from then on hit-tests are in data
    // space, eliminating ~5 `dataToPixel` calls per candidate that the
    // legacy implementation performed.
    const plot = layout.plotRect;
    const padXMin = layout.paddedXMin;
    const padXMax = layout.paddedXMax;
    const padYMin = layout.paddedYMin;
    const padYMax = layout.paddedYMax;
    if (
        mx < plot.x ||
        mx > plot.x + plot.width ||
        my < plot.y ||
        my > plot.y + plot.height
    ) {
        if (chart._hoveredIdx !== -1) {
            chart._hoveredIdx = -1;
            renderCandlestickChromeOverlay(chart);
        }

        return;
    }

    const dataX = padXMin + ((mx - plot.x) / plot.width) * (padXMax - padXMin);
    const dataY = padYMax - ((my - plot.y) / plot.height) * (padYMax - padYMin);
    const pxPerDataX = plot.width / (padXMax - padXMin);
    const wickToleranceData = WICK_TOLERANCE_PX / pxPerDataX;

    const xC = candles.xCenter;
    const hw = candles.halfWidth;
    const open = candles.open;
    const close = candles.close;
    const high = candles.high;
    const low = candles.low;

    // Estimate a generous halfWidth bound so the binary-search visible
    // slice covers any candle whose body could overlap `dataX`. The
    // halfWidth is uniform per build; conservatively read from the
    // first record (or fall back to a small constant).
    const maxHalfWidth = candles.count > 0 ? hw[0] : 0;
    const tol = Math.max(maxHalfWidth, wickToleranceData);

    // Binary-search to a small slice [lo, hi) covering candidates whose
    // xCenter falls within ±tol of dataX. Candles outside this window
    // can't possibly be hit; the linear scan that follows is bounded by
    // (split count × overlap), not the full candle count.
    const lo = lowerBoundXCenter(xC, candles.count, dataX - tol);
    const hi = lowerBoundXCenter(xC, candles.count, dataX + tol + 1e-12);

    // Walk the slice in reverse so the most-recently-added (frontmost)
    // candle wins ties — matches legacy behavior.
    let hit = -1;
    for (let i = hi - 1; i >= lo; i--) {
        const xc = xC[i];
        const halfW = hw[i];
        const xWithinBody = dataX >= xc - halfW && dataX <= xc + halfW;
        const xWithinWick = Math.abs(dataX - xc) <= wickToleranceData;
        if (!xWithinBody && !xWithinWick) {
            continue;
        }

        const o = open[i];
        const c = close[i];
        const bodyLow = o < c ? o : c;
        const bodyHigh = o < c ? c : o;
        const insideBody = xWithinBody && dataY >= bodyLow && dataY <= bodyHigh;
        const insideWick = dataY >= low[i] && dataY <= high[i];
        if (insideBody || insideWick) {
            hit = i;
            break;
        }
    }

    if (hit !== chart._hoveredIdx) {
        chart._hoveredIdx = hit;
        renderCandlestickChromeOverlay(chart);
    }
}

export function showCandlestickPinnedTooltip(
    chart: CandlestickChart,
    idx: number,
): void {
    chart._tooltip.dismiss();
    chart._pinnedIdx = idx;

    const candles = chart._candles;
    if (idx < 0 || idx >= candles.count || !chart._lastLayout) {
        return;
    }

    const lines = buildCandlestickTooltipLines(chart, idx);
    if (lines.length === 0) {
        return;
    }

    const xCenter = candles.xCenter[idx];
    const yMid = (candles.high[idx] + candles.low[idx]) / 2;
    const pos = chart._lastLayout.dataToPixel(xCenter, yMid);

    // CSS bounds come from the chart's own layout, which is populated
    // by the render path regardless of where the chart runs.
    const cssWidth = chart._lastLayout.cssWidth;
    const cssHeight = chart._lastLayout.cssHeight;

    chart._tooltip.pin(lines, pos, { cssWidth, cssHeight });

    // Pinning hides the inline hover tooltip but does not change the
    // WebGL pass — only the chrome overlay needs to redraw.
    chart._hoveredIdx = -1;
    renderCandlestickChromeOverlay(chart);
}

export function dismissCandlestickPinnedTooltip(chart: CandlestickChart): void {
    chart._tooltip.dismiss();
    chart._pinnedIdx = -1;
}

/**
 * Build tooltip lines for candle at index `idx` in the columnar
 * storage. Indexed access avoids materializing a `CandleRecord` POJO
 * on the hot tooltip path.
 */
export function buildCandlestickTooltipLines(
    chart: CandlestickChart,
    idx: number,
): string[] {
    const lines: string[] = [];
    const candles = chart._candles;
    if (idx < 0 || idx >= candles.count) {
        return lines;
    }

    const catIdx = candles.catIdx[idx];
    const splitIdx = candles.splitIdx[idx];
    const open = candles.open[idx];
    const close = candles.close[idx];
    const high = candles.high[idx];
    const low = candles.low[idx];

    if (
        chart._categoryAxisMode === "numeric" &&
        chart._numericCategoryDomain &&
        chart._categoryPositions
    ) {
        const v = chart._categoryPositions[catIdx];
        const xColumn = chart._groupBy[0];
        lines.push(chart.getColumnFormatter(xColumn, "value")(v));
    } else if (chart._rowPaths.length > 0) {
        const parts: string[] = [];
        for (const rp of chart._rowPaths) {
            const s = rp.labels[catIdx] ?? "";
            if (s) {
                parts.push(s);
            }
        }

        if (parts.length > 0) {
            lines.push(parts.join(" › "));
        }
    } else {
        lines.push(`Row ${catIdx + chart._rowOffset}`);
    }

    if (splitIdx >= 0 && chart._splitPrefixes.length > 1) {
        const prefix = chart._splitPrefixes[splitIdx];
        if (prefix) {
            lines.push(prefix);
        }
    }

    const openFmt = chart.getColumnFormatter(chart._columnSlots[0], "value");
    const closeFmt = chart.getColumnFormatter(chart._columnSlots[1], "value");
    const highFmt = chart.getColumnFormatter(chart._columnSlots[2], "value");
    const lowFmt = chart.getColumnFormatter(chart._columnSlots[3], "value");
    lines.push(`Open: ${openFmt(open)}`);
    lines.push(`Close: ${closeFmt(close)}`);
    lines.push(`High: ${highFmt(high)}`);
    lines.push(`Low: ${lowFmt(low)}`);

    return lines;
}
