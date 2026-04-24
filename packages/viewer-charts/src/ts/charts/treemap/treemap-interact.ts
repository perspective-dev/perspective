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
 *
 * In faceted mode `chart._visibleRootIds[i]` names the drill root that
 * owns node `i`, so the "skip the root itself" check works regardless
 * of which facet the node belongs to.
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
    const baseArr = chart._visibleBaseDepths;
    const rootArr = chart._visibleRootIds;

    let bestLeafId = NULL_NODE;
    let bestLeafArea = Infinity;
    let bestBranchId = NULL_NODE;
    let bestBranchArea = Infinity;
    let labelBranchId = NULL_NODE;

    if (!ids) {
        return { leafId: NULL_NODE, branchId: NULL_NODE, inHeader: false };
    }

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        const rootId = rootArr ? rootArr[i] : chart._currentRootId;
        if (id === rootId) continue;
        if (!(mx >= x0[id] && mx <= x1[id] && my >= y0[id] && my <= y1[id]))
            continue;

        const area = (x1[id] - x0[id]) * (y1[id] - y0[id]);
        if (firstChild[id] !== NULL_NODE) {
            if (area < bestBranchArea) {
                bestBranchArea = area;
                bestBranchId = id;
            }
            const baseDepth = baseArr
                ? baseArr[i]
                : depth[chart._currentRootId];
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
        chart._hoveredTooltipLines = null;
        chart._hoveredTooltipNodeId = best;
        const serial = ++chart._hoveredTooltipSerial;
        if (chart._glCanvas) {
            chart._glCanvas.style.cursor =
                branchId !== NULL_NODE ? "pointer" : "default";
        }
        if (best !== NULL_NODE) {
            // Kick off the lazy tooltip build for hover; re-render
            // the chrome overlay once lines resolve. Stale results
            // (mouse moved elsewhere, new view) are dropped via the
            // serial check.
            buildTreemapTooltipLines(chart, best).then((lines) => {
                if (serial !== chart._hoveredTooltipSerial) return;
                chart._hoveredTooltipLines = lines;
                renderTreemapChromeOverlay(chart);
            });
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

/**
 * Drill the current facet (or the whole chart in non-facet mode).
 *
 * In faceted mode, walks up the ancestor chain of `nodeId` until the
 * facet root (a top-level child of `_rootId`) is found, then sets
 * `_facetDrillRoots[facetLabel] = nodeId` so only that facet's
 * subtree re-layouts. Non-facet mode keeps the existing single-
 * `_currentRootId` behavior and rebuilds the breadcrumb trail.
 */
function drillTo(chart: TreemapChart, nodeId: number): void {
    const store = chart._nodeStore;
    if (chart._splitBy.length > 0 && chart._facetConfig.facet_mode === "grid") {
        // Walk up to find the facet-root ancestor (top-level child of
        // `_rootId`). Guard against drills that target the synthetic
        // root or a facet root itself — those would un-drill the facet.
        let p = nodeId;
        while (p !== NULL_NODE && store.parent[p] !== chart._rootId) {
            p = store.parent[p];
        }
        if (p !== NULL_NODE) {
            const label = store.name[p];
            chart._facetDrillRoots.set(label, nodeId);
        }
        chart._hoveredNodeId = NULL_NODE;
        if (chart._glManager) renderTreemapFrame(chart, chart._glManager);
        return;
    }
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

    const parent = chart._glCanvas?.parentElement;
    if (!parent) return;

    const store = chart._nodeStore;
    const cx = (store.x0[nodeId] + store.x1[nodeId]) / 2;
    const cy = (store.y0[nodeId] + store.y1[nodeId]) / 2;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = (chart._glCanvas?.width || 100) / dpr;
    const cssHeight = (chart._glCanvas?.height || 100) / dpr;

    // Tooltip columns are fetched lazily from the view — the tree
    // itself only retains ancestor names + aggregated value + color.
    // If the user dismisses or re-pins between click and resolve, the
    // `_pinnedNodeId` check discards the stale result.
    buildTreemapTooltipLines(chart, nodeId).then((lines) => {
        if (chart._pinnedNodeId !== nodeId) return;
        if (lines.length === 0) return;
        chart._tooltip.showPinned(
            parent,
            lines,
            { px: cx, py: cy },
            { cssWidth, cssHeight },
        );
    });

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
export async function buildTreemapTooltipLines(
    chart: TreemapChart,
    nodeId: number,
): Promise<string[]> {
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

    // Color value (numeric branch): stored on the node at insert
    // time, so it's always available without a view fetch.
    if (chart._colorName && !isNaN(store.colorValue[nodeId])) {
        lines.push(
            `${chart._colorName}: ${formatTickValue(store.colorValue[nodeId])}`,
        );
    }

    const rowIdx = store.leafRowIdx[nodeId];
    const isLeaf =
        store.firstChild[nodeId] === NULL_NODE && rowIdx !== NULL_NODE;

    // Extra tooltip columns come from the source view row, fetched on
    // demand via `_lazyRows`. Only leaves correspond to a single view
    // row; branch nodes aggregate rows and don't carry extra columns.
    if (isLeaf && chart._lazyRows) {
        const row = await chart._lazyRows.fetchRow(rowIdx);
        for (const [name, value] of row) {
            if (value === null || value === undefined) continue;
            if (name === chart._colorName && !isNaN(store.colorValue[nodeId])) {
                // Already emitted from the retained tree state above.
                continue;
            }
            if (typeof value === "number") {
                lines.push(`${name}: ${formatTickValue(value)}`);
            } else {
                lines.push(`${name}: ${value}`);
            }
        }
    }

    if (store.firstChild[nodeId] !== NULL_NODE) {
        lines.push(`Children: ${store.childCount[nodeId]}`);
    }

    return lines;
}
