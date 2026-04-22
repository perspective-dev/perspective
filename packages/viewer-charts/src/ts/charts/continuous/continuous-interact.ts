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

import type { ContinuousChart } from "./continuous-chart";
import { resolveTheme } from "../../theme/theme";
import { renderContinuousChromeOverlay } from "./continuous-render";

const TOOLTIP_RADIUS_PX = 24;

/**
 * Lazily rebuild the spatial hit-test index from the current CPU-side
 * point buffers. Walks every series slot so ranges with gaps (unused
 * tails) are skipped naturally.
 */
function ensureContinuousSpatialGrid(chart: ContinuousChart): void {
    if (!chart._hitTest.isDirty || !chart._xData || !chart._yData) return;
    const xData = chart._xData;
    const yData = chart._yData;
    const numSeries = Math.max(1, chart._splitGroups.length);
    const cap = chart._seriesCapacity;
    chart._hitTest.rebuild(
        {
            xMin: chart._xMin,
            xMax: chart._xMax,
            yMin: chart._yMin,
            yMax: chart._yMax,
        },
        chart._dataCount,
        (insert) => {
            for (let s = 0; s < numSeries; s++) {
                const count = chart._seriesUploadedCounts[s] ?? 0;
                const base = s * cap;
                for (let j = 0; j < count; j++) {
                    insert(base + j, xData[base + j], yData[base + j]);
                }
            }
        },
    );
}

/**
 * Update {@link ContinuousChart._hoveredIndex} for the given mouse
 * position. Triggers a chrome re-render if the hovered index changes.
 */
export function handleContinuousHover(
    chart: ContinuousChart,
    mx: number,
    my: number,
): void {
    if (!chart._xData || !chart._yData || !chart._lastLayout) return;

    const layout = chart._lastLayout;
    const plot = layout.plotRect;

    if (
        mx < plot.x ||
        mx > plot.x + plot.width ||
        my < plot.y ||
        my > plot.y + plot.height
    ) {
        if (chart._hoveredIndex !== -1) {
            chart._hoveredIndex = -1;
            renderContinuousChromeOverlay(chart);
        }
        return;
    }

    const xMin = layout.paddedXMin;
    const xMax = layout.paddedXMax;
    const yMin = layout.paddedYMin;
    const yMax = layout.paddedYMax;
    const dataX = xMin + ((mx - plot.x) / plot.width) * (xMax - xMin);
    const dataY = yMax - ((my - plot.y) / plot.height) * (yMax - yMin);
    const pxPerDataX = plot.width / (xMax - xMin);
    const pxPerDataY = plot.height / (yMax - yMin);

    ensureContinuousSpatialGrid(chart);
    let bestIdx: number = chart._hitTest.query(
        dataX,
        dataY,
        TOOLTIP_RADIUS_PX,
        pxPerDataX,
        pxPerDataY,
        chart._xData,
        chart._yData,
    );
    if (bestIdx < 0) {
        // Brute-force fallback over every valid slot.
        bestIdx = -1;
        let bestDistSq = TOOLTIP_RADIUS_PX * TOOLTIP_RADIUS_PX;
        const numSeries = Math.max(1, chart._splitGroups.length);
        const cap = chart._seriesCapacity;
        for (let s = 0; s < numSeries; s++) {
            const count = chart._seriesUploadedCounts[s] ?? 0;
            const base = s * cap;
            for (let j = 0; j < count; j++) {
                const idx = base + j;
                const dx = (chart._xData[idx] - dataX) * pxPerDataX;
                const dy = (chart._yData[idx] - dataY) * pxPerDataY;
                const distSq = dx * dx + dy * dy;
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    bestIdx = idx;
                }
            }
        }
    }

    if (bestIdx !== chart._hoveredIndex) {
        chart._hoveredIndex = bestIdx;
        renderContinuousChromeOverlay(chart);
    }
}

/**
 * Show a sticky (pinned) tooltip at the given point, anchored to the
 * GL canvas's parent via the tooltip controller.
 */
export function showContinuousPinnedTooltip(
    chart: ContinuousChart,
    pointIdx: number,
): void {
    chart._tooltip.dismissPinned();
    chart._pinnedIndex = pointIdx;
    if (pointIdx < 0 || !chart._xData || !chart._yData || !chart._lastLayout)
        return;

    const layout = chart._lastLayout;
    const pos = layout.dataToPixel(
        chart._xData[pointIdx],
        chart._yData[pointIdx],
    );
    const lines = chart.glyph.buildTooltipLines(chart, pointIdx);
    if (lines.length === 0) return;

    const themeEl = chart._gridlineCanvas || chart._chromeCanvas;
    if (!themeEl) return;
    const theme = resolveTheme(themeEl);

    const parent = chart._glCanvas?.parentElement;
    if (!parent) return;
    chart._tooltip.showPinned(parent, lines, pos, layout, theme);

    chart._hoveredIndex = -1;
    renderContinuousChromeOverlay(chart);
}

export function dismissContinuousPinnedTooltip(chart: ContinuousChart): void {
    chart._tooltip.dismissPinned();
    chart._pinnedIndex = -1;
}
