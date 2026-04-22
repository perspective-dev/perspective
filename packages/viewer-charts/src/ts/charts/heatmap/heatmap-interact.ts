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
 */
export function handleHeatmapHover(
    chart: HeatmapChart,
    mx: number,
    my: number,
): void {
    if (!chart._lastLayout) return;
    const layout = chart._lastLayout;
    const plot = layout.plotRect;

    if (
        mx < plot.x ||
        mx > plot.x + plot.width ||
        my < plot.y ||
        my > plot.y + plot.height
    ) {
        setHovered(chart, null);
        return;
    }

    const xMin = layout.paddedXMin;
    const xMax = layout.paddedXMax;
    const yMin = layout.paddedYMin;
    const yMax = layout.paddedYMax;
    const dataX = xMin + ((mx - plot.x) / plot.width) * (xMax - xMin);
    const dataY = yMax - ((my - plot.y) / plot.height) * (yMax - yMin);

    const xIdx = Math.round(dataX);
    const yIdx = Math.round(dataY);
    if (xIdx < 0 || xIdx >= chart._numX || yIdx < 0 || yIdx >= chart._numY) {
        setHovered(chart, null);
        return;
    }

    const cell = chart._cells2D[yIdx * chart._numX + xIdx] ?? null;
    setHovered(chart, cell);
}

function setHovered(chart: HeatmapChart, next: HeatmapCell | null): void {
    const prev = chart._hoveredCell;
    const same =
        (prev?.xIdx ?? -1) === (next?.xIdx ?? -1) &&
        (prev?.yIdx ?? -1) === (next?.yIdx ?? -1);
    if (same) return;
    chart._hoveredCell = next;
    if (chart._glManager && chart._renderChromeOverlay) {
        // Only the chrome overlay changes on hover — leave WebGL cells
        // alone to avoid a full re-upload on every mouse move.
        chart._renderChromeOverlay();
    }
}

/** Format a hierarchical path from a dictionary-backed `CategoricalLevel` array. */
export function formatHierarchicalPath(
    levels: CategoricalLevel[],
    idx: number,
): string {
    const parts: string[] = [];
    for (const lev of levels) {
        const s = lev.dictionary[lev.indices[idx]];
        if (s != null && s !== "") parts.push(s);
    }
    return parts.join(" / ");
}

/** Render a tooltip for the currently hovered cell. */
export function renderHeatmapTooltip(chart: HeatmapChart): void {
    if (!chart._chromeCanvas || !chart._lastLayout || !chart._hoveredCell)
        return;
    const layout = chart._lastLayout;
    const cell = chart._hoveredCell;
    const pos = layout.dataToPixel(cell.xIdx, cell.yIdx);

    const lines: string[] = [];
    const xPath = formatHierarchicalPath(chart._xLevels, cell.xIdx);
    const yPath = formatHierarchicalPath(chart._yLevels, cell.yIdx);
    if (xPath) lines.push(xPath);
    if (yPath) lines.push(yPath);
    lines.push(`Value: ${formatTickValue(cell.value)}`);

    const theme = resolveTheme(chart._chromeCanvas);
    renderCanvasTooltip(chart._chromeCanvas, pos, lines, layout, theme);
}
