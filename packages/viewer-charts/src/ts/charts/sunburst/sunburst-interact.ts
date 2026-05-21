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
import { NULL_NODE, ancestorNames } from "../common/node-store";
import { rebuildBreadcrumbs } from "../common/tree-data";
import {
    renderSunburstFrame,
    renderSunburstChromeOverlay,
    facetCenterForNode,
} from "./sunburst-render";

export type { BreadcrumbRegion as SunburstBreadcrumbRegion } from "../common/tree-chrome";

interface FacetHitContext {
    centerX: number;
    centerY: number;
    drillRoot: number;

    /**
     * Pre-upload visible range for this facet; undefined in non-facet mode.
     */
    range?: { start: number; end: number };
}

/**
 * Resolve the facet under cursor; returns single-plot defaults outside facet mode.
 */
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
        if (r > facet.maxRadius + 4) {
            continue;
        }

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
        if (p === anc) {
            return true;
        }

        p = store.parent[p];
    }

    return false;
}

/**
 * Convert `(mx, my)` to polar and find the containing visible arc.
 */
function polarHitTest(chart: SunburstChart, mx: number, my: number): number {
    const ctx = facetUnderCursor(chart, mx, my);
    if (!ctx) {
        return NULL_NODE;
    }

    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds;
    const n = chart._visibleNodeCount;
    if (!ids) {
        return NULL_NODE;
    }

    const dx = mx - ctx.centerX;
    const dy = my - ctx.centerY;
    const r = Math.sqrt(dx * dx + dy * dy);
    let theta = Math.atan2(dy, dx);
    if (theta < 0) {
        theta += 2 * Math.PI;
    }

    // Center-circle hit — drill-up target.
    if (r < store.r1[chart._rootId] + 0.001) {
        if (ctx.drillRoot !== chart._rootId) {
            return ctx.drillRoot;
        }
    }

    const faceted = chart._facets.length > 0;
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === ctx.drillRoot) {
            continue;
        }

        if (faceted && !isDescendantOf(chart, id, ctx.drillRoot)) {
            continue;
        }

        const a0 = store.a0[id];
        const a1 = store.a1[id];
        const r0 = store.r0[id];
        const r1 = store.r1[id];
        if (r < r0 || r > r1) {
            continue;
        }

        if (theta < a0 || theta > a1) {
            continue;
        }

        return id;
    }

    return NULL_NODE;
}

export function handleSunburstHover(
    chart: SunburstChart,
    mx: number,
    my: number,
): void {
    if (chart._pinnedNodeId !== NULL_NODE) {
        return;
    }

    // Breadcrumb region check first (they sit atop the chart area).
    for (const region of chart._breadcrumbRegions) {
        if (
            mx >= region.x0 &&
            mx <= region.x1 &&
            my >= region.y0 &&
            my <= region.y1
        ) {
            chart._tooltip.setCursor("pointer");
            if (chart._hoveredNodeId !== NULL_NODE) {
                chart._hoveredNodeId = NULL_NODE;
                renderSunburstChromeOverlay(chart);
            }

            return;
        }
    }

    const hit = polarHitTest(chart, mx, my);
    const store = chart._nodeStore;
    chart._tooltip.setCursor(
        hit !== NULL_NODE && store.firstChild[hit] !== NULL_NODE
            ? "pointer"
            : "default",
    );

    if (hit !== chart._hoveredNodeId) {
        chart._hoveredNodeId = hit;
        if (hit !== NULL_NODE) {
            const serial = chart._lazyTooltip.beginHover(hit);
            buildSunburstTooltipLines(chart, hit).then((lines) => {
                if (chart._lazyTooltip.commitHover(serial, lines)) {
                    renderSunburstChromeOverlay(chart);
                }
            });
        } else {
            chart._lazyTooltip.clearHover();
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
        chart.emitUnselect();
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
                chart.emitUnselect();
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
                chart.emitUnselect();
            } else if (chart._facets.length > 0) {
                // Already at the facet root: reset this facet's drill.
                const facet = chart._facets.find(
                    (f) => f.drillRoot === ctx.drillRoot,
                );
                if (facet) {
                    chart._facetDrillRoots.delete(facet.label);
                    chart.emitUnselect();
                }

                if (chart._glManager) {
                    renderSunburstFrame(chart, chart._glManager);
                }
            }

            return;
        }
    }

    const hit = polarHitTest(chart, mx, my);
    if (hit === NULL_NODE) {
        return;
    }

    if (store.firstChild[hit] !== NULL_NODE) {
        drillTo(chart, hit);
        void emitSunburstNodeEvent(chart, hit, "branch");
    } else {
        showSunburstPinnedTooltip(chart, hit);
        void emitSunburstNodeEvent(chart, hit, "leaf");
    }
}

/**
 * Counterpart to `emitTreemapNodeEvent` for sunburst. Same path-walk
 * semantics — split-by prefix in faceted mode, group-by levels
 * afterward, leaf row idx from `_nodeStore.leafRowIdx`.
 */
async function emitSunburstNodeEvent(
    chart: SunburstChart,
    nodeId: number,
    kind: "leaf" | "branch",
): Promise<void> {
    const store = chart._nodeStore;
    const path = ancestorNames(store, nodeId);
    const isFaceted =
        chart._splitBy.length > 0 && chart._facetConfig.facet_mode === "grid";
    const splitByValues: (string | null)[] = isFaceted
        ? path.slice(0, chart._splitBy.length)
        : [];
    const groupByValues: (string | null)[] = isFaceted
        ? path.slice(
              chart._splitBy.length,
              chart._splitBy.length + chart._groupBy.length,
          )
        : path.slice(0, chart._groupBy.length);

    const rowIdx = kind === "leaf" ? (store.leafRowIdx[nodeId] ?? null) : null;

    await chart.emitClickAndSelect({
        rowIdx: rowIdx != null && rowIdx >= 0 ? rowIdx : null,
        columnName: chart._sizeName,
        groupByValues,
        splitByValues,
    });
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
        if (chart._glManager) {
            renderSunburstFrame(chart, chart._glManager);
        }

        return;
    }

    chart._currentRootId = nodeId;
    rebuildBreadcrumbs(chart, nodeId);
    chart._hoveredNodeId = NULL_NODE;
    if (chart._glManager) {
        renderSunburstFrame(chart, chart._glManager);
    }
}

export function showSunburstPinnedTooltip(
    chart: SunburstChart,
    nodeId: number,
): void {
    chart._tooltip.dismiss();
    chart._pinnedNodeId = nodeId;

    const store = chart._nodeStore;
    const midA = (store.a0[nodeId] + store.a1[nodeId]) / 2;
    const midR = (store.r0[nodeId] + store.r1[nodeId]) / 2;
    const { centerX, centerY } = facetCenterForNode(chart, nodeId);
    const cx = centerX + Math.cos(midA) * midR;
    const cy = centerY + Math.sin(midA) * midR;

    // CSS bounds: prefer `glManager` (works in both local and worker
    // modes, since the worker constructs its own context manager).
    const cssWidth = chart._glManager?.cssWidth ?? 0;
    const cssHeight = chart._glManager?.cssHeight ?? 0;

    // Tooltip columns are fetched lazily from the view — the tree
    // itself only retains ancestor names + aggregated value + color.
    // Stale resolutions are discarded via the `_pinnedNodeId` check.
    buildSunburstTooltipLines(chart, nodeId).then((lines) => {
        if (chart._pinnedNodeId !== nodeId) {
            return;
        }

        if (lines.length === 0) {
            return;
        }

        chart._tooltip.pin(lines, { px: cx, py: cy }, { cssWidth, cssHeight });
    });

    chart._hoveredNodeId = NULL_NODE;
    renderSunburstChromeOverlay(chart);
}

export function dismissSunburstPinnedTooltip(chart: SunburstChart): void {
    chart._tooltip.dismiss();
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

    const sizeFmt = chart.getColumnFormatter(chart._sizeName, "value");
    lines.push(`Value: ${sizeFmt(store.value[nodeId])}`);

    // Color value (numeric branch): stored on the node at insert
    // time, so it's always available without a view fetch.
    if (chart._colorName && !isNaN(store.colorValue[nodeId])) {
        const colorFmt = chart.getColumnFormatter(chart._colorName, "value");
        lines.push(
            `${chart._colorName}: ${colorFmt(store.colorValue[nodeId])}`,
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
            if (value === null || value === undefined) {
                continue;
            }

            if (name === chart._colorName && !isNaN(store.colorValue[nodeId])) {
                continue;
            }

            if (typeof value === "number") {
                lines.push(
                    `${name}: ${chart.getColumnFormatter(name, "value")(value)}`,
                );
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
