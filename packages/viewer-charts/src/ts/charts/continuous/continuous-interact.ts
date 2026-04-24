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
 *
 * In faceted mode, the hit test first resolves which facet the mouse is
 * over, then restricts the search to that facet's series slice. This
 * makes hover local to a facet; coordinated ghost indicators in other
 * facets are painted by the chrome overlay.
 */
export function handleContinuousHover(
    chart: ContinuousChart,
    mx: number,
    my: number,
): void {
    if (!chart._xData || !chart._yData) return;

    // Resolve the facet (and its layout) under the cursor. Non-facet
    // charts have `_facetGrid = null` and fall back to the cached
    // `_lastLayout`; the hover then scans every series.
    const { layout, facetIdx } = resolveHoverTarget(chart, mx, my);
    if (!layout) {
        clearHover(chart);
        return;
    }

    const plot = layout.plotRect;
    if (
        mx < plot.x ||
        mx > plot.x + plot.width ||
        my < plot.y ||
        my > plot.y + plot.height
    ) {
        clearHover(chart);
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

    const bestIdx =
        facetIdx < 0
            ? hoverAllSeries(chart, dataX, dataY, pxPerDataX, pxPerDataY)
            : hoverOneSeries(
                  chart,
                  facetIdx,
                  dataX,
                  dataY,
                  pxPerDataX,
                  pxPerDataY,
              );

    if (bestIdx !== chart._hoveredIndex || facetIdx !== chart._hoveredFacet) {
        chart._hoveredIndex = bestIdx;
        chart._hoveredFacet = facetIdx;
        chart._hoveredTooltipLines = null;
        const serial = ++chart._hoveredTooltipSerial;
        if (bestIdx >= 0) {
            // Fire the lazy tooltip build; when it resolves, we only
            // apply the result if the user is still hovering the same
            // point (compare against the latest serial). The crosshair
            // / highlight ring are painted immediately from geometry
            // so the hover feels instant; the tooltip box fills in
            // once the row arrives (no "loading…" flicker).
            chart.glyph.buildTooltipLines(chart, bestIdx).then((lines) => {
                if (serial !== chart._hoveredTooltipSerial) return;
                chart._hoveredTooltipLines = lines;
                renderContinuousChromeOverlay(chart);
            });
        }
        renderContinuousChromeOverlay(chart);
    }
}

function clearHover(chart: ContinuousChart): void {
    if (chart._hoveredIndex !== -1 || chart._hoveredFacet !== -1) {
        chart._hoveredIndex = -1;
        chart._hoveredFacet = -1;
        renderContinuousChromeOverlay(chart);
    }
}

/**
 * Return `(layout, facetIdx)` for the sub-plot under `(mx, my)`.
 * `facetIdx` is `-1` in single-plot mode; the caller then scans every
 * series (legacy behaviour). In faceted mode, `-1` also signals "mouse
 * is in the grid frame but not inside any plot rect" — the caller
 * clears hover in that case.
 */
function resolveHoverTarget(
    chart: ContinuousChart,
    mx: number,
    my: number,
): {
    layout: import("../../layout/plot-layout").PlotLayout | null;
    facetIdx: number;
} {
    if (chart._facetGrid) {
        const cells = chart._facetGrid.cells;
        for (let i = 0; i < cells.length; i++) {
            const plot = cells[i].layout.plotRect;
            if (
                mx >= plot.x &&
                mx <= plot.x + plot.width &&
                my >= plot.y &&
                my <= plot.y + plot.height
            ) {
                return { layout: cells[i].layout, facetIdx: i };
            }
        }
        return { layout: null, facetIdx: -1 };
    }
    return { layout: chart._lastLayout, facetIdx: -1 };
}

function hoverAllSeries(
    chart: ContinuousChart,
    dataX: number,
    dataY: number,
    pxPerDataX: number,
    pxPerDataY: number,
): number {
    ensureContinuousSpatialGrid(chart);
    let bestIdx = chart._hitTest.query(
        dataX,
        dataY,
        TOOLTIP_RADIUS_PX,
        pxPerDataX,
        pxPerDataY,
        chart._xData,
        chart._yData,
    );
    if (bestIdx >= 0) return bestIdx;

    // Brute-force fallback over every valid slot.
    let bestDistSq = TOOLTIP_RADIUS_PX * TOOLTIP_RADIUS_PX;
    const numSeries = Math.max(1, chart._splitGroups.length);
    const cap = chart._seriesCapacity;
    const xData = chart._xData!;
    const yData = chart._yData!;
    for (let s = 0; s < numSeries; s++) {
        const count = chart._seriesUploadedCounts[s] ?? 0;
        const base = s * cap;
        for (let j = 0; j < count; j++) {
            const idx = base + j;
            const dx = (xData[idx] - dataX) * pxPerDataX;
            const dy = (yData[idx] - dataY) * pxPerDataY;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestIdx = idx;
            }
        }
    }
    return bestIdx;
}

/**
 * Hit-test a single series' slot range. Faceted mode scopes hover to
 * the series that owns the facet under the cursor; the spatial grid
 * spans all series so we do a brute-force scan over just that series'
 * slice — cheap even for dense datasets because only `count[s]` slots
 * are read.
 */
function hoverOneSeries(
    chart: ContinuousChart,
    seriesIdx: number,
    dataX: number,
    dataY: number,
    pxPerDataX: number,
    pxPerDataY: number,
): number {
    const count = chart._seriesUploadedCounts[seriesIdx] ?? 0;
    if (count === 0) return -1;
    const cap = chart._seriesCapacity;
    const base = seriesIdx * cap;
    const xData = chart._xData!;
    const yData = chart._yData!;

    let bestDistSq = TOOLTIP_RADIUS_PX * TOOLTIP_RADIUS_PX;
    let bestIdx = -1;
    for (let j = 0; j < count; j++) {
        const idx = base + j;
        const dx = (xData[idx] - dataX) * pxPerDataX;
        const dy = (yData[idx] - dataY) * pxPerDataY;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIdx = idx;
        }
    }
    return bestIdx;
}

/**
 * Show a sticky (pinned) tooltip at the given point, anchored to the
 * GL canvas's parent via the tooltip controller.
 *
 * In faceted mode, resolves the source facet from `pointIdx` and uses
 * that cell's layout so the tooltip anchors to the correct sub-plot.
 */
export function showContinuousPinnedTooltip(
    chart: ContinuousChart,
    pointIdx: number,
): void {
    chart._tooltip.dismissPinned();
    chart._pinnedIndex = pointIdx;
    if (pointIdx < 0 || !chart._xData || !chart._yData) return;

    const layout = layoutForIndex(chart, pointIdx);
    if (!layout) return;

    const pos = layout.dataToPixel(
        chart._xData[pointIdx],
        chart._yData[pointIdx],
    );

    const parent = chart._glCanvas?.parentElement;
    if (!parent) return;

    const serial = ++chart._pinnedTooltipSerial;
    chart.glyph.buildTooltipLines(chart, pointIdx).then((lines) => {
        // Abandon the pin if the user moved on (another pin/dismiss
        // between click and resolve) or the underlying view changed.
        if (serial !== chart._pinnedTooltipSerial) return;
        if (chart._pinnedIndex !== pointIdx) return;
        if (lines.length === 0) return;
        chart._tooltip.showPinned(parent, lines, pos, layout);
    });

    chart._hoveredIndex = -1;
    chart._hoveredFacet = -1;
    renderContinuousChromeOverlay(chart);
}

function layoutForIndex(
    chart: ContinuousChart,
    pointIdx: number,
): import("../../layout/plot-layout").PlotLayout | null {
    if (chart._facetGrid && chart._seriesCapacity > 0) {
        const s = Math.floor(pointIdx / chart._seriesCapacity);
        const cell = chart._facetGrid.cells[s];
        if (cell) return cell.layout;
    }
    return chart._lastLayout;
}

export function dismissContinuousPinnedTooltip(chart: ContinuousChart): void {
    chart._tooltip.dismissPinned();
    chart._pinnedIndex = -1;
}
