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

import type { HeatmapChart } from "./heatmap";
import type { HeatmapCell } from "./heatmap-build";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import type { CategoricalLevel } from "../../axis/categorical-axis";

/**
 * Find the heatmap cell under `(mx, my)`. O(1) via the prebuilt `cells2D`
 * index. Sets `chart._hoveredCell` and schedules a re-render when the
 * hovered cell changes.
 *
 * In multi-facet mode, iterates facets to find the one whose plot rect
 * contains the cursor, then hit-tests against that facet's pipeline.
 */
export function handleHeatmapHover(
    chart: HeatmapChart,
    mx: number,
    my: number,
): void {
    chart._hoveredMouseX = mx;
    chart._hoveredMouseY = my;
    if (chart._facets.length > 0) {
        for (let i = 0; i < chart._facets.length; i++) {
            const facet = chart._facets[i];
            const plot = facet.layout.plotRect;
            if (
                mx < plot.x ||
                mx > plot.x + plot.width ||
                my < plot.y ||
                my > plot.y + plot.height
            ) {
                continue;
            }

            const cell = hitCell(
                facet.layout,
                facet.pipeline.numX,
                facet.pipeline.numY,
                facet.pipeline.cells2D,
                facet.pipeline.xPositions,
                facet.pipeline.yPositions,
                facet.pipeline.xNumericDomain?.bandWidth ?? 1,
                facet.pipeline.yNumericDomain?.bandWidth ?? 1,
                mx,
                my,
            );
            setHovered(chart, cell, i);
            return;
        }

        setHovered(chart, null, -1);
        return;
    }

    if (!chart._lastLayout) {
        return;
    }

    const cell = hitCell(
        chart._lastLayout,
        chart._numX,
        chart._numY,
        chart._cells2D,
        chart._xPositions,
        chart._yPositions,
        chart._xNumericDomain?.bandWidth ?? 1,
        chart._yNumericDomain?.bandWidth ?? 1,
        mx,
        my,
    );
    setHovered(chart, cell, -1);
}

/**
 * Binary-search a sorted positions array for the entry closest to
 * `value`. Returns -1 when the closest entry is more than half a band
 * away (the cursor is in the gap between two cells).
 */
function nearestCategoryIdx(
    positions: Float64Array,
    value: number,
    bandWidth: number,
): number {
    if (positions.length === 0) {
        return -1;
    }

    let lo = 0;
    let hi = positions.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (positions[mid] < value) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    let idx = lo;
    if (
        idx > 0 &&
        Math.abs(positions[idx - 1] - value) < Math.abs(positions[idx] - value)
    ) {
        idx -= 1;
    }

    if (Math.abs(positions[idx] - value) > bandWidth * 0.5) {
        return -1;
    }

    return idx;
}

function hitCell(
    layout: import("../../layout/plot-layout").PlotLayout,
    numX: number,
    numY: number,
    cells2D: (HeatmapCell | null)[],
    xPositions: Float64Array | null,
    yPositions: Float64Array | null,
    xBandWidth: number,
    yBandWidth: number,
    mx: number,
    my: number,
): HeatmapCell | null {
    const plot = layout.plotRect;
    if (
        mx < plot.x ||
        mx > plot.x + plot.width ||
        my < plot.y ||
        my > plot.y + plot.height
    ) {
        return null;
    }

    const xMin = layout.paddedXMin;
    const xMax = layout.paddedXMax;
    const yMin = layout.paddedYMin;
    const yMax = layout.paddedYMax;
    const dataX = xMin + ((mx - plot.x) / plot.width) * (xMax - xMin);
    const dataY = yMax - ((my - plot.y) / plot.height) * (yMax - yMin);
    const xIdx = xPositions
        ? nearestCategoryIdx(xPositions, dataX, xBandWidth)
        : Math.round(dataX);
    const yIdx = yPositions
        ? nearestCategoryIdx(yPositions, dataY, yBandWidth)
        : Math.round(dataY);
    if (xIdx < 0 || xIdx >= numX || yIdx < 0 || yIdx >= numY) {
        return null;
    }

    return cells2D[yIdx * numX + xIdx] ?? null;
}

function setHovered(
    chart: HeatmapChart,
    next: HeatmapCell | null,
    facetIdx: number,
): void {
    const prev = chart._hoveredCell;
    const same =
        (prev?.xIdx ?? -1) === (next?.xIdx ?? -1) &&
        (prev?.yIdx ?? -1) === (next?.yIdx ?? -1) &&
        chart._hoveredFacetIdx === facetIdx;
    if (same) {
        return;
    }

    chart._hoveredCell = next;
    chart._hoveredFacetIdx = facetIdx;
    if (chart._glManager && chart._renderChromeOverlay) {
        // Only the chrome overlay changes on hover — leave WebGL cells
        // alone to avoid a full re-upload on every mouse move.
        chart._renderChromeOverlay();
    }
}

/**
 * Format a hierarchical path from a precomputed-label `CategoricalLevel` array.
 */
export function formatHierarchicalPath(
    levels: CategoricalLevel[],
    idx: number,
): string {
    const parts: string[] = [];
    for (const lev of levels) {
        const s = lev.labels[idx];
        if (s != null && s !== "") {
            parts.push(s);
        }
    }

    return parts.join(" / ");
}

/**
 * Render a tooltip for the currently hovered cell.
 */
export function renderHeatmapTooltip(chart: HeatmapChart): void {
    if (!chart._chromeCanvas || !chart._hoveredCell) {
        return;
    }

    let layout: import("../../layout/plot-layout").PlotLayout | null;
    let xLevels: CategoricalLevel[];
    let yLevels: CategoricalLevel[];
    let facetLabel: string | null = null;

    if (chart._hoveredFacetIdx >= 0) {
        const facet = chart._facets[chart._hoveredFacetIdx];
        if (!facet) {
            return;
        }

        layout = facet.layout;
        xLevels = facet.pipeline.xLevels;
        yLevels = facet.pipeline.yLevels;
        facetLabel = facet.label;
    } else {
        if (!chart._lastLayout) {
            return;
        }

        layout = chart._lastLayout;
        xLevels = chart._xLevels;
        yLevels = chart._yLevels;
    }

    const cell = chart._hoveredCell;

    // Anchor the tooltip at the cursor rather than the cell center so
    // the label tracks the mouse on coarse heatmaps where cells span
    // many pixels.
    const pos = { px: chart._hoveredMouseX, py: chart._hoveredMouseY };

    const lines: string[] = [];
    if (facetLabel) {
        lines.push(facetLabel);
    }

    const xPath = formatHierarchicalPath(xLevels, cell.xIdx);
    const yPath = formatHierarchicalPath(yLevels, cell.yIdx);
    if (xPath) {
        lines.push(xPath);
    }

    if (yPath) {
        lines.push(yPath);
    }

    const valueFmt = chart.getColumnFormatter(chart._columnSlots[0], "value");
    lines.push(`Value: ${valueFmt(cell.value)}`);

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
