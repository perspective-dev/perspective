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
import { resolveTheme } from "../../theme/theme";
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

/** Convert `(mx, my)` to polar and find the containing visible arc. */
function polarHitTest(chart: SunburstChart, mx: number, my: number): number {
    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds;
    const n = chart._visibleNodeCount;
    if (!ids) return NULL_NODE;

    const dx = mx - chart._centerX;
    const dy = my - chart._centerY;
    const r = Math.sqrt(dx * dx + dy * dy);
    let theta = Math.atan2(dy, dx);
    if (theta < 0) theta += 2 * Math.PI;

    // Center-circle hit — lets the user drill up by clicking the center.
    if (r < store.r1[chart._rootId] + 0.001) {
        // Use `_rootId`'s r1 as the INNER_RING_PX boundary.
        if (chart._currentRootId !== chart._rootId) {
            // Inside the inner circle = drill-up target.
            return chart._currentRootId;
        }
    }

    // Linear scan (post-LOD, bounded).
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === chart._currentRootId) continue;
        const a0 = store.a0[id];
        const a1 = store.a1[id];
        const r0 = store.r0[id];
        const r1 = store.r1[id];
        if (r < r0 || r > r1) continue;
        // Angular containment accounts for wrap-around by normalizing.
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
    const dx = mx - chart._centerX;
    const dy = my - chart._centerY;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < store.r1[chart._rootId] + 0.001) {
        const parent = store.parent[chart._currentRootId];
        if (parent !== NULL_NODE) {
            drillTo(chart, parent);
        }
        return;
    }

    const hit = polarHitTest(chart, mx, my);
    if (hit === NULL_NODE) return;

    if (store.firstChild[hit] !== NULL_NODE) {
        drillTo(chart, hit);
    } else {
        showSunburstPinnedTooltip(chart, hit);
    }
}

function drillTo(chart: SunburstChart, nodeId: number): void {
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

    const themeEl = chart._gridlineCanvas || chart._chromeCanvas;
    if (!themeEl) return;
    const theme = resolveTheme(themeEl);

    const lines = buildSunburstTooltipLines(chart, nodeId);
    if (lines.length === 0) return;

    const parent = chart._glCanvas?.parentElement;
    if (!parent) return;

    const store = chart._nodeStore;
    const midA = (store.a0[nodeId] + store.a1[nodeId]) / 2;
    const midR = (store.r0[nodeId] + store.r1[nodeId]) / 2;
    const cx = chart._centerX + Math.cos(midA) * midR;
    const cy = chart._centerY + Math.sin(midA) * midR;

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
    renderSunburstChromeOverlay(chart);
}

export function dismissSunburstPinnedTooltip(chart: SunburstChart): void {
    chart._tooltip.dismissPinned();
    chart._pinnedNodeId = NULL_NODE;
}

export function buildSunburstTooltipLines(
    chart: SunburstChart,
    nodeId: number,
): string[] {
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

    const rowIdx = store.leafRowIdx[nodeId];
    const isLeaf =
        store.firstChild[nodeId] === NULL_NODE && rowIdx !== NULL_NODE;

    if (isLeaf && chart._sizeName) {
        const numeric = chart._numericRowData.get(chart._sizeName);
        if (numeric) {
            lines.push(
                `${chart._sizeName}: ${formatTickValue(numeric[rowIdx])}`,
            );
        }
    }
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
