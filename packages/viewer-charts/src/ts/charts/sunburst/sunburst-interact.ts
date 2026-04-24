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

import type { SunburstChart } from "./sunburst";
import { NULL_NODE } from "../common/node-store";
import { rebuildBreadcrumbs } from "../common/tree-data";
import { formatTickValue } from "../../layout/ticks";
import {
    renderSunburstFrame,
    renderSunburstChromeOverlay,
} from "./sunburst-render";

export interface SunburstBreadcrumbRegion {
    nodeId: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

interface FacetHitContext {
    centerX: number;
    centerY: number;
    drillRoot: number;
    /** Pre-upload visible range for this facet; undefined in non-facet mode. */
    range?: { start: number; end: number };
}

/** Resolve the facet under cursor; returns single-plot defaults outside facet mode. */
function facetUnderCursor(
    chart: SunburstChart,
    mx: number,
    my: number,
): FacetHitContext | null {
    if (chart._facets.length === 0) {
        return {
            centerX: chart._centerX,
            centerY: chart._centerY,
            drillRoot: chart._currentRootId,
        };
    }
    for (const facet of chart._facets) {
        // Post-upload `instanceStart` / `instanceCount` are scan-index
        // ranges into `_visibleNodeIds` — we need the *pre-upload*
        // range to hit-test all arcs (including zero-width ones we
        // skipped for draw). Walk the IDs and match by drill root
        // ancestry instead.
        const dx = mx - facet.centerX;
        const dy = my - facet.centerY;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > facet.maxRadius + 4) continue;
        return {
            centerX: facet.centerX,
            centerY: facet.centerY,
            drillRoot: facet.drillRoot,
        };
    }
    return null;
}

/**
 * Walk the ancestor chain from `id` up to (but not including) the
 * synthetic `_rootId`, returning true if any step equals `anc`.
 * Used to filter hit-test candidates to arcs that belong to a given
 * facet's drill subtree.
 */
function isDescendantOf(
    chart: SunburstChart,
    id: number,
    anc: number,
): boolean {
    const store = chart._nodeStore;
    let p = id;
    while (p !== NULL_NODE) {
        if (p === anc) return true;
        p = store.parent[p];
    }
    return false;
}

/** Convert `(mx, my)` to polar and find the containing visible arc. */
function polarHitTest(chart: SunburstChart, mx: number, my: number): number {
    const ctx = facetUnderCursor(chart, mx, my);
    if (!ctx) return NULL_NODE;
    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds;
    const n = chart._visibleNodeCount;
    if (!ids) return NULL_NODE;

    const dx = mx - ctx.centerX;
    const dy = my - ctx.centerY;
    const r = Math.sqrt(dx * dx + dy * dy);
    let theta = Math.atan2(dy, dx);
    if (theta < 0) theta += 2 * Math.PI;

    // Center-circle hit — drill-up target.
    if (r < store.r1[chart._rootId] + 0.001) {
        if (ctx.drillRoot !== chart._rootId) {
            return ctx.drillRoot;
        }
    }

    const faceted = chart._facets.length > 0;
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === ctx.drillRoot) continue;
        if (faceted && !isDescendantOf(chart, id, ctx.drillRoot)) continue;
        const a0 = store.a0[id];
        const a1 = store.a1[id];
        const r0 = store.r0[id];
        const r1 = store.r1[id];
        if (r < r0 || r > r1) continue;
        if (theta < a0 || theta > a1) continue;
        return id;
    }
    return NULL_NODE;
}

export function handleSunburstHover(
    chart: SunburstChart,
    mx: number,
    my: number,
): void {
    if (chart._pinnedNodeId !== NULL_NODE) return;

    // Breadcrumb region check first (they sit atop the chart area).
    for (const region of chart._breadcrumbRegions) {
        if (
            mx >= region.x0 &&
            mx <= region.x1 &&
            my >= region.y0 &&
            my <= region.y1
        ) {
            if (chart._glCanvas) chart._glCanvas.style.cursor = "pointer";
            if (chart._hoveredNodeId !== NULL_NODE) {
                chart._hoveredNodeId = NULL_NODE;
                renderSunburstChromeOverlay(chart);
            }
            return;
        }
    }

    const hit = polarHitTest(chart, mx, my);
    const store = chart._nodeStore;
    if (chart._glCanvas) {
        chart._glCanvas.style.cursor =
            hit !== NULL_NODE && store.firstChild[hit] !== NULL_NODE
                ? "pointer"
                : "default";
    }

    if (hit !== chart._hoveredNodeId) {
        chart._hoveredNodeId = hit;
        chart._hoveredTooltipLines = null;
        chart._hoveredTooltipNodeId = hit;
        const serial = ++chart._hoveredTooltipSerial;
        if (hit !== NULL_NODE) {
            buildSunburstTooltipLines(chart, hit).then((lines) => {
                if (serial !== chart._hoveredTooltipSerial) return;
                chart._hoveredTooltipLines = lines;
                renderSunburstChromeOverlay(chart);
            });
        }
        renderSunburstChromeOverlay(chart);
    }
}

export function handleSunburstClick(
    chart: SunburstChart,
    mx: number,
    my: number,
): void {
    if (chart._pinnedNodeId !== NULL_NODE) {
        dismissSunburstPinnedTooltip(chart);
        return;
    }

    // Breadcrumb click = drill to that crumb.
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

    // Center-circle click = drill up one level (parent of current root).
    const store = chart._nodeStore;
    const ctx = facetUnderCursor(chart, mx, my);
    if (ctx) {
        const dx = mx - ctx.centerX;
        const dy = my - ctx.centerY;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < store.r1[chart._rootId] + 0.001) {
            const parent = store.parent[ctx.drillRoot];
            if (parent !== NULL_NODE && parent !== chart._rootId) {
                drillTo(chart, parent);
            } else if (chart._facets.length > 0) {
                // Already at the facet root: reset this facet's drill.
                const facet = chart._facets.find(
                    (f) => f.drillRoot === ctx.drillRoot,
                );
                if (facet) chart._facetDrillRoots.delete(facet.label);
                if (chart._glManager) {
                    renderSunburstFrame(chart, chart._glManager);
                }
            }
            return;
        }
    }

    const hit = polarHitTest(chart, mx, my);
    if (hit === NULL_NODE) return;

    if (store.firstChild[hit] !== NULL_NODE) {
        drillTo(chart, hit);
    } else {
        showSunburstPinnedTooltip(chart, hit);
    }
}

/**
 * Drill the clicked facet (or the whole chart in non-facet mode).
 * Faceted drill walks up to the facet root (top-level child of
 * `_rootId`), records the new drill node under that facet's label,
 * and re-renders.
 */
function drillTo(chart: SunburstChart, nodeId: number): void {
    const store = chart._nodeStore;
    if (chart._splitBy.length > 0 && chart._facetConfig.facet_mode === "grid") {
        let p = nodeId;
        while (p !== NULL_NODE && store.parent[p] !== chart._rootId) {
            p = store.parent[p];
        }
        if (p !== NULL_NODE) {
            chart._facetDrillRoots.set(store.name[p], nodeId);
        }
        chart._hoveredNodeId = NULL_NODE;
        if (chart._glManager) renderSunburstFrame(chart, chart._glManager);
        return;
    }
    chart._currentRootId = nodeId;
    rebuildBreadcrumbs(chart, nodeId);
    chart._hoveredNodeId = NULL_NODE;
    if (chart._glManager) renderSunburstFrame(chart, chart._glManager);
}

export function showSunburstPinnedTooltip(
    chart: SunburstChart,
    nodeId: number,
): void {
    chart._tooltip.dismissPinned();
    chart._pinnedNodeId = nodeId;

    const parent = chart._glCanvas?.parentElement;
    if (!parent) return;

    const store = chart._nodeStore;
    const midA = (store.a0[nodeId] + store.a1[nodeId]) / 2;
    const midR = (store.r0[nodeId] + store.r1[nodeId]) / 2;
    // In faceted mode resolve which facet owns this node so the
    // tooltip anchors to the correct sub-chart's center.
    let anchorX = chart._centerX;
    let anchorY = chart._centerY;
    if (chart._facets.length > 0) {
        for (const facet of chart._facets) {
            let p = nodeId;
            let owned = false;
            while (p !== NULL_NODE) {
                if (p === facet.drillRoot) {
                    owned = true;
                    break;
                }
                p = store.parent[p];
            }
            if (owned) {
                anchorX = facet.centerX;
                anchorY = facet.centerY;
                break;
            }
        }
    }
    const cx = anchorX + Math.cos(midA) * midR;
    const cy = anchorY + Math.sin(midA) * midR;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = (chart._glCanvas?.width || 100) / dpr;
    const cssHeight = (chart._glCanvas?.height || 100) / dpr;

    // Tooltip columns are fetched lazily from the view — the tree
    // itself only retains ancestor names + aggregated value + color.
    // Stale resolutions are discarded via the `_pinnedNodeId` check.
    buildSunburstTooltipLines(chart, nodeId).then((lines) => {
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
    renderSunburstChromeOverlay(chart);
}

export function dismissSunburstPinnedTooltip(chart: SunburstChart): void {
    chart._tooltip.dismissPinned();
    chart._pinnedNodeId = NULL_NODE;
}

export async function buildSunburstTooltipLines(
    chart: SunburstChart,
    nodeId: number,
): Promise<string[]> {
    const store = chart._nodeStore;
    const lines: string[] = [];

    // Ancestor path.
    const pathNames: string[] = [];
    let p = nodeId;
    while (store.parent[p] !== NULL_NODE) {
        pathNames.push(store.name[p]);
        p = store.parent[p];
    }
    pathNames.reverse();
    if (pathNames.length > 0) {
        lines.push(pathNames.join(" › "));
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

    // Extra tooltip columns fetched on demand — see the treemap
    // counterpart for the same pattern.
    if (isLeaf && chart._lazyRows) {
        const row = await chart._lazyRows.fetchRow(rowIdx);
        for (const [name, value] of row) {
            if (value === null || value === undefined) continue;
            if (name === chart._colorName && !isNaN(store.colorValue[nodeId])) {
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
