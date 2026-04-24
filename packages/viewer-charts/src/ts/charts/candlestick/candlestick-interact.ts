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
import type { CandleRecord } from "./candlestick-build";
import { formatTickValue } from "../../layout/ticks";
import {
    renderCandlestickChromeOverlay,
    renderCandlestickFrame,
} from "./candlestick-render";

/**
 * Test whether `(mx, my)` falls inside candle `i`'s body or wick
 * bounding rect. Wicks use a small x-tolerance in pixels so narrow
 * bodies with tall wicks stay clickable.
 */
function hitTestCandle(
    chart: CandlestickChart,
    i: number,
    mx: number,
    my: number,
): boolean {
    const layout = chart._lastLayout;
    if (!layout) return false;
    const c = chart._candles[i];
    if (!c) return false;

    const x = layout.dataToPixel(c.xCenter, 0).px;
    const xHalf = layout.plotRect.width * (c.halfWidth / chart._numCategories);
    if (mx < x - xHalf || mx > x + xHalf) {
        // Allow a few pixels of horizontal slack for the wick line.
        if (Math.abs(mx - x) > 3) return false;
    }

    const bodyTop = layout.dataToPixel(0, Math.max(c.open, c.close)).py;
    const bodyBot = layout.dataToPixel(0, Math.min(c.open, c.close)).py;
    const wickTop = layout.dataToPixel(0, c.high).py;
    const wickBot = layout.dataToPixel(0, c.low).py;

    // Body rect + wick line region.
    const insideBody = my >= bodyTop && my <= bodyBot;
    const insideWick = my >= wickTop && my <= wickBot;
    return insideBody || insideWick;
}

export function handleCandlestickHover(
    chart: CandlestickChart,
    mx: number,
    my: number,
): void {
    if (chart._pinnedIdx !== -1) return;

    // Scan in reverse so the most-recently-added (frontmost) candle wins
    // ties. At < 10k visible candles this linear scan is free.
    let hit = -1;
    for (let i = chart._candles.length - 1; i >= 0; i--) {
        if (hitTestCandle(chart, i, mx, my)) {
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
    chart._tooltip.dismissPinned();
    chart._pinnedIdx = idx;

    const candle = chart._candles[idx];
    if (!candle || !chart._lastLayout) return;

    const lines = buildCandlestickTooltipLines(chart, candle);
    if (lines.length === 0) return;

    const parent = chart._glCanvas?.parentElement;
    if (!parent) return;

    const pos = chart._lastLayout.dataToPixel(
        candle.xCenter,
        (candle.high + candle.low) / 2,
    );
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = (chart._glCanvas?.width || 100) / dpr;
    const cssHeight = (chart._glCanvas?.height || 100) / dpr;

    chart._tooltip.showPinned(parent, lines, pos, { cssWidth, cssHeight });

    chart._hoveredIdx = -1;
    if (chart._glManager) renderCandlestickFrame(chart, chart._glManager);
}

export function dismissCandlestickPinnedTooltip(chart: CandlestickChart): void {
    chart._tooltip.dismissPinned();
    chart._pinnedIdx = -1;
}

export function buildCandlestickTooltipLines(
    chart: CandlestickChart,
    candle: CandleRecord,
): string[] {
    const lines: string[] = [];

    // Category label from the row-path dictionaries.
    if (chart._rowPaths.length > 0) {
        const parts: string[] = [];
        for (const rp of chart._rowPaths) {
            const s = rp.labels[candle.catIdx] ?? "";
            if (s) parts.push(s);
        }
        if (parts.length > 0) lines.push(parts.join(" › "));
    } else {
        lines.push(`Row ${candle.catIdx + chart._rowOffset}`);
    }

    if (candle.splitIdx >= 0 && chart._splitPrefixes.length > 1) {
        const prefix = chart._splitPrefixes[candle.splitIdx];
        if (prefix) lines.push(prefix);
    }

    lines.push(`Open: ${formatTickValue(candle.open)}`);
    lines.push(`Close: ${formatTickValue(candle.close)}`);
    lines.push(`High: ${formatTickValue(candle.high)}`);
    lines.push(`Low: ${formatTickValue(candle.low)}`);

    return lines;
}
