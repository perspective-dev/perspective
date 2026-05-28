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
import { PADDING_LABEL } from "./treemap-layout";
import {
    renderTreemapFrame,
    renderTreemapChromeOverlay,
} from "./treemap-render";
import {
    buildTreeTooltipLines,
    dismissTreePinnedTooltip,
    emitTreeNodeEvent,
    showTreePinnedTooltip,
    treeDrillTo,
} from "../common/tree-interact";

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
        if (id === rootId) {
            continue;
        }

        if (!(mx >= x0[id] && mx <= x1[id] && my >= y0[id] && my <= y1[id])) {
            continue;
        }

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
    if (chart._pinnedNodeId !== NULL_NODE) {
        return;
    }

    for (const region of chart._breadcrumbRegions) {
        if (
            mx >= region.x0 &&
            mx <= region.x1 &&
            my >= region.y0 &&
            my <= region.y1
        ) {
            chart._tooltip.setCursor("pointer");
            chart._hoveredNodeId = NULL_NODE;
            renderTreemapChromeOverlay(chart);
            return;
        }
    }

    const { leafId, branchId, inHeader } = hitTest(chart, mx, my);
    const best = inHeader ? branchId : leafId !== NULL_NODE ? leafId : branchId;

    if (best !== chart._hoveredNodeId) {
        chart._hoveredNodeId = best;
        chart._tooltip.setCursor(
            branchId !== NULL_NODE ? "pointer" : "default",
        );
        if (best !== NULL_NODE) {
            // Kick off the lazy tooltip build for hover; re-render
            // the chrome overlay once lines resolve. Stale results
            // (mouse moved elsewhere, new view) are dropped by the
            // controller's serial gate.
            const serial = chart._lazyTooltip.beginHover(best);
            buildTreeTooltipLines(chart, best).then((lines) => {
                if (chart._lazyTooltip.commitHover(serial, lines)) {
                    renderTreemapChromeOverlay(chart);
                }
            });
        } else {
            chart._lazyTooltip.clearHover();
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
        chart.emitUnselect();
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
                // Breadcrumb is chrome — no `perspective-click`. The
                // drill-up pops one or more levels off the host's
                // cached filter stack via `selected: false`.
                chart.emitUnselect();
            }

            return;
        }
    }

    const { leafId, branchId, inHeader } = hitTest(chart, mx, my);

    if (branchId !== NULL_NODE && inHeader) {
        drillTo(chart, branchId);
        void emitTreeNodeEvent(chart, branchId, "branch");
    } else if (leafId !== NULL_NODE) {
        showTreemapPinnedTooltip(chart, leafId);
        void emitTreeNodeEvent(chart, leafId, "leaf");
    } else if (branchId !== NULL_NODE) {
        drillTo(chart, branchId);
        void emitTreeNodeEvent(chart, branchId, "branch");
    }
}

export function handleTreemapDblClick(
    chart: TreemapChart,
    mx: number,
    my: number,
): void {
    const wasPinned = chart._pinnedNodeId !== NULL_NODE;
    dismissTreemapPinnedTooltip(chart);
    if (wasPinned) {
        chart.emitUnselect();
    }

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
        void emitTreeNodeEvent(chart, target, "branch");
        if (leafId !== NULL_NODE && store.firstChild[leafId] === NULL_NODE) {
            showTreemapPinnedTooltip(chart, leafId);
            void emitTreeNodeEvent(chart, leafId, "leaf");
        }
    }
}

function drillTo(chart: TreemapChart, nodeId: number): void {
    treeDrillTo(chart, nodeId, () => {
        if (chart._glManager) renderTreemapFrame(chart, chart._glManager);
    });
}

export function showTreemapPinnedTooltip(
    chart: TreemapChart,
    nodeId: number,
): void {
    const store = chart._nodeStore;
    const cx = (store.x0[nodeId] + store.x1[nodeId]) / 2;
    const cy = (store.y0[nodeId] + store.y1[nodeId]) / 2;
    showTreePinnedTooltip(chart, nodeId, { cx, cy }, () =>
        renderTreemapChromeOverlay(chart),
    );
}

export function dismissTreemapPinnedTooltip(chart: TreemapChart): void {
    dismissTreePinnedTooltip(chart);
}

export { buildTreeTooltipLines as buildTreemapTooltipLines } from "../common/tree-interact";
