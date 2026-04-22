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

import type { TreemapChart } from "./treemap";
import { NULL_NODE } from "../common/node-store";
import { PADDING_LABEL, rebuildBreadcrumbs } from "./treemap-layout";
import { resolveTheme } from "../../theme/theme";
import { formatTickValue } from "../../layout/ticks";
import {
    renderTreemapFrame,
    renderTreemapChromeOverlay,
} from "./treemap-render";

interface HitResult {
    leafId: number;
    branchId: number;
    inHeader: boolean;
}

/**
 * Find the smallest leaf AND deepest branch at `(mx, my)`. Walks the
 * (already LOD-filtered) `_visibleNodeIds` — at 2M total nodes this is
 * still a small linear scan because LOD keeps visible count bounded.
 */
function hitTest(chart: TreemapChart, mx: number, my: number): HitResult {
    const store = chart._nodeStore;
    const x0 = store.x0;
    const y0 = store.y0;
    const x1 = store.x1;
    const y1 = store.y1;
    const depth = store.depth;
    const firstChild = store.firstChild;
    const ids = chart._visibleNodeIds;
    const n = chart._visibleNodeCount;

    let bestLeafId = NULL_NODE;
    let bestLeafArea = Infinity;
    let bestBranchId = NULL_NODE;
    let bestBranchArea = Infinity;
    let labelBranchId = NULL_NODE;
    const baseDepth = depth[chart._currentRootId];

    if (!ids) {
        return { leafId: NULL_NODE, branchId: NULL_NODE, inHeader: false };
    }

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === chart._currentRootId) continue;
        if (!(mx >= x0[id] && mx <= x1[id] && my >= y0[id] && my <= y1[id]))
            continue;

        const area = (x1[id] - x0[id]) * (y1[id] - y0[id]);
        if (firstChild[id] !== NULL_NODE) {
            if (area < bestBranchArea) {
                bestBranchArea = area;
                bestBranchId = id;
            }
            const relDepth = depth[id] - baseDepth;
            if (relDepth === 1 && my <= y0[id] + PADDING_LABEL) {
                labelBranchId = id;
            }
            if (relDepth === 2) {
                const nw = x1[id] - x0[id];
                const nh = y1[id] - y0[id];
                if (nw >= 60 && nh >= 30) {
                    const cy = y0[id] + nh / 2;
                    const cx = x0[id] + nw / 2;
                    if (
                        Math.abs(my - cy) < 10 &&
                        Math.abs(mx - cx) < nw * 0.4
                    ) {
                        labelBranchId = id;
                    }
                }
            }
        } else {
            if (area < bestLeafArea) {
                bestLeafArea = area;
                bestLeafId = id;
            }
        }
    }

    if (labelBranchId !== NULL_NODE) {
        return { leafId: NULL_NODE, branchId: labelBranchId, inHeader: true };
    }
    return {
        leafId: bestLeafId,
        branchId: bestBranchId,
        inHeader: false,
    };
}

export function handleTreemapHover(
    chart: TreemapChart,
    mx: number,
    my: number,
): void {
    if (chart._pinnedNodeId !== NULL_NODE) return;

    for (const region of chart._breadcrumbRegions) {
        if (
            mx >= region.x0 &&
            mx <= region.x1 &&
            my >= region.y0 &&
            my <= region.y1
        ) {
            if (chart._glCanvas) chart._glCanvas.style.cursor = "pointer";
            chart._hoveredNodeId = NULL_NODE;
            renderTreemapChromeOverlay(chart);
            return;
        }
    }

    const { leafId, branchId, inHeader } = hitTest(chart, mx, my);
    const best = inHeader ? branchId : leafId !== NULL_NODE ? leafId : branchId;

    if (best !== chart._hoveredNodeId) {
        chart._hoveredNodeId = best;
        if (chart._glCanvas) {
            chart._glCanvas.style.cursor =
                branchId !== NULL_NODE ? "pointer" : "default";
        }
        renderTreemapChromeOverlay(chart);
    }
}

export function handleTreemapClick(
    chart: TreemapChart,
    mx: number,
    my: number,
): void {
    if (chart._pinnedNodeId !== NULL_NODE) {
        dismissTreemapPinnedTooltip(chart);
        return;
    }

    for (const region of chart._breadcrumbRegions) {
        if (
            mx >= region.x0 &&
            mx <= region.x1 &&
            my >= region.y0 &&
            my <= region.y1
        ) {
            if (region.nodeId !== chart._currentRootId) {
                drillTo(chart, region.nodeId);
            }
            return;
        }
    }

    const { leafId, branchId, inHeader } = hitTest(chart, mx, my);

    if (branchId !== NULL_NODE && inHeader) {
        drillTo(chart, branchId);
    } else if (leafId !== NULL_NODE) {
        showTreemapPinnedTooltip(chart, leafId);
    } else if (branchId !== NULL_NODE) {
        drillTo(chart, branchId);
    }
}

export function handleTreemapDblClick(
    chart: TreemapChart,
    mx: number,
    my: number,
): void {
    dismissTreemapPinnedTooltip(chart);
    const { leafId, branchId } = hitTest(chart, mx, my);
    const store = chart._nodeStore;
    let target = branchId;
    if (target === NULL_NODE && leafId !== NULL_NODE) {
        const parent = store.parent[leafId];
        if (parent !== chart._currentRootId && parent !== NULL_NODE) {
            target = parent;
        }
    }
    if (
        target !== NULL_NODE &&
        target !== chart._currentRootId &&
        store.firstChild[target] !== NULL_NODE
    ) {
        drillTo(chart, target);
        if (leafId !== NULL_NODE && store.firstChild[leafId] === NULL_NODE) {
            showTreemapPinnedTooltip(chart, leafId);
        }
    }
}

function drillTo(chart: TreemapChart, nodeId: number): void {
    chart._currentRootId = nodeId;
    rebuildBreadcrumbs(chart, nodeId);
    chart._hoveredNodeId = NULL_NODE;
    if (chart._glManager) renderTreemapFrame(chart, chart._glManager);
}

export function showTreemapPinnedTooltip(
    chart: TreemapChart,
    nodeId: number,
): void {
    chart._tooltip.dismissPinned();
    chart._pinnedNodeId = nodeId;

    const themeEl = chart._gridlineCanvas || chart._chromeCanvas;
    if (!themeEl) return;
    const theme = resolveTheme(themeEl);

    const lines = buildTreemapTooltipLines(chart, nodeId);
    if (lines.length === 0) return;

    const parent = chart._glCanvas?.parentElement;
    if (!parent) return;

    const store = chart._nodeStore;
    const cx = (store.x0[nodeId] + store.x1[nodeId]) / 2;
    const cy = (store.y0[nodeId] + store.y1[nodeId]) / 2;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = (chart._glCanvas?.width || 100) / dpr;
    const cssHeight = (chart._glCanvas?.height || 100) / dpr;

    chart._tooltip.showPinned(
        parent,
        lines,
        { px: cx, py: cy },
        { cssWidth, cssHeight },
        theme,
    );

    chart._hoveredNodeId = NULL_NODE;
    renderTreemapChromeOverlay(chart);
}

export function dismissTreemapPinnedTooltip(chart: TreemapChart): void {
    chart._tooltip.dismissPinned();
    chart._pinnedNodeId = NULL_NODE;
}

/**
 * Build the tooltip for `nodeId`. The node's own name path + aggregate
 * value are derived from the tree; per-row tooltip columns come from
 * the `leafRowIdx` → column-buffer lookup (no per-node `Map`).
 */
export function buildTreemapTooltipLines(
    chart: TreemapChart,
    nodeId: number,
): string[] {
    const store = chart._nodeStore;
    const lines: string[] = [];

    // Name path (ancestors, topmost first, excluding synthetic root).
    const pathNames: string[] = [];
    let p = nodeId;
    while (store.parent[p] !== NULL_NODE) {
        pathNames.push(store.name[p]);
        p = store.parent[p];
    }
    pathNames.reverse();
    if (pathNames.length > 0) {
        lines.push(pathNames.join(" \u203A "));
    } else {
        lines.push(store.name[nodeId]);
    }

    lines.push(`Value: ${formatTickValue(store.value[nodeId])}`);

    const rowIdx = store.leafRowIdx[nodeId];
    const isLeaf =
        store.firstChild[nodeId] === NULL_NODE && rowIdx !== NULL_NODE;

    // Size column value, from leaf's source row if available.
    if (isLeaf && chart._sizeName) {
        const numeric = chart._numericRowData.get(chart._sizeName);
        if (numeric) {
            lines.push(
                `${chart._sizeName}: ${formatTickValue(numeric[rowIdx])}`,
            );
        } else {
            const str = chart._stringRowData.get(chart._sizeName);
            if (str && str[rowIdx] !== undefined) {
                lines.push(`${chart._sizeName}: ${str[rowIdx]}`);
            }
        }
    }

    // Color column value / label.
    if (chart._colorName) {
        if (!isNaN(store.colorValue[nodeId])) {
            lines.push(
                `${chart._colorName}: ${formatTickValue(store.colorValue[nodeId])}`,
            );
        } else if (isLeaf) {
            const str = chart._stringRowData.get(chart._colorName);
            if (str && str[rowIdx] !== undefined) {
                lines.push(`${chart._colorName}: ${str[rowIdx]}`);
            }
        }
    }

    // Extra tooltip columns (leaf-only).
    if (isLeaf) {
        for (const [name, arr] of chart._numericRowData) {
            if (name === chart._sizeName || name === chart._colorName) continue;
            lines.push(`${name}: ${formatTickValue(arr[rowIdx])}`);
        }
        for (const [name, arr] of chart._stringRowData) {
            if (name === chart._sizeName || name === chart._colorName) continue;
            const v = arr[rowIdx];
            if (v !== undefined) lines.push(`${name}: ${v}`);
        }
    }

    if (store.firstChild[nodeId] !== NULL_NODE) {
        lines.push(`Children: ${store.childCount[nodeId]}`);
    }

    return lines;
}
