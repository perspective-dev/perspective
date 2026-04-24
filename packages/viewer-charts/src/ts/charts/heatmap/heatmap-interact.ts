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
import { resolveTheme } from "../../theme/theme";
import { formatTickValue } from "../../layout/ticks";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import type { CategoricalLevel } from "../../chrome/categorical-axis";

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
                mx,
                my,
            );
            setHovered(chart, cell, i);
            return;
        }
        setHovered(chart, null, -1);
        return;
    }

    if (!chart._lastLayout) return;
    const cell = hitCell(
        chart._lastLayout,
        chart._numX,
        chart._numY,
        chart._cells2D,
        mx,
        my,
    );
    setHovered(chart, cell, -1);
}

function hitCell(
    layout: import("../../layout/plot-layout").PlotLayout,
    numX: number,
    numY: number,
    cells2D: (HeatmapCell | null)[],
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
    const xIdx = Math.round(dataX);
    const yIdx = Math.round(dataY);
    if (xIdx < 0 || xIdx >= numX || yIdx < 0 || yIdx >= numY) return null;
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
    if (same) return;
    chart._hoveredCell = next;
    chart._hoveredFacetIdx = facetIdx;
    if (chart._glManager && chart._renderChromeOverlay) {
        // Only the chrome overlay changes on hover — leave WebGL cells
        // alone to avoid a full re-upload on every mouse move.
        chart._renderChromeOverlay();
    }
}

/** Format a hierarchical path from a precomputed-label `CategoricalLevel` array. */
export function formatHierarchicalPath(
    levels: CategoricalLevel[],
    idx: number,
): string {
    const parts: string[] = [];
    for (const lev of levels) {
        const s = lev.labels[idx];
        if (s != null && s !== "") parts.push(s);
    }
    return parts.join(" / ");
}

/** Render a tooltip for the currently hovered cell. */
export function renderHeatmapTooltip(chart: HeatmapChart): void {
    if (!chart._chromeCanvas || !chart._hoveredCell) return;

    let layout: import("../../layout/plot-layout").PlotLayout | null;
    let xLevels: CategoricalLevel[];
    let yLevels: CategoricalLevel[];
    let facetLabel: string | null = null;

    if (chart._hoveredFacetIdx >= 0) {
        const facet = chart._facets[chart._hoveredFacetIdx];
        if (!facet) return;
        layout = facet.layout;
        xLevels = facet.pipeline.xLevels;
        yLevels = facet.pipeline.yLevels;
        facetLabel = facet.label;
    } else {
        if (!chart._lastLayout) return;
        layout = chart._lastLayout;
        xLevels = chart._xLevels;
        yLevels = chart._yLevels;
    }

    const cell = chart._hoveredCell;
    const pos = layout.dataToPixel(cell.xIdx, cell.yIdx);

    const lines: string[] = [];
    if (facetLabel) lines.push(facetLabel);
    const xPath = formatHierarchicalPath(xLevels, cell.xIdx);
    const yPath = formatHierarchicalPath(yLevels, cell.yIdx);
    if (xPath) lines.push(xPath);
    if (yPath) lines.push(yPath);
    lines.push(`Value: ${formatTickValue(cell.value)}`);

    const theme = resolveTheme(chart._chromeCanvas);
    renderCanvasTooltip(chart._chromeCanvas, pos, lines, layout, theme);
}
