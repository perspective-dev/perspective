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

import type { TreeChartBase } from "./tree-chart";
import { NULL_NODE, ancestorNames } from "./node-store";
import { rebuildBreadcrumbs } from "./tree-data";

/**
 * Common subset of `TreemapChart` / `SunburstChart` reached by the
 * shared interaction helpers — anything that lives on `TreeChartBase`
 * plus the pinned/hover/facet-drill state the two charts both declare
 * with identical shape but on the subclass (so we type it as an
 * intersection).
 */
export type TreeInteractChart = TreeChartBase & {
    _pinnedNodeId: number;
    _hoveredNodeId: number;
    _facetDrillRoots: Map<string, number>;
};

/**
 * Emit `perspective-click` + `perspective-global-filter selected:true`
 * for a treemap/sunburst node. The path is walked via `ancestorNames`
 * and split into split-by prefix + group-by levels using
 * `_splitBy.length` as the boundary; faceted mode keeps the depth-0
 * ancestor as the split prefix.
 */
export async function emitTreeNodeEvent(
    chart: TreeInteractChart,
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
 * Build tooltip lines for `nodeId`: ancestor name path + aggregate
 * value + (numeric) color value + per-row tooltip columns from
 * `_lazyRows` for leaves. The leaf branch awaits the source-view row
 * fetch; branch nodes have no underlying row so they emit a Children
 * count instead.
 */
export async function buildTreeTooltipLines(
    chart: TreeInteractChart,
    nodeId: number,
): Promise<string[]> {
    const store = chart._nodeStore;
    const lines: string[] = [];

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

    if (chart._colorName && !isNaN(store.colorValue[nodeId])) {
        const colorFmt = chart.getColumnFormatter(chart._colorName, "value");
        lines.push(
            `${chart._colorName}: ${colorFmt(store.colorValue[nodeId])}`,
        );
    }

    const rowIdx = store.leafRowIdx[nodeId];
    const isLeaf =
        store.firstChild[nodeId] === NULL_NODE && rowIdx !== NULL_NODE;

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

/**
 * Pin a tooltip at the chart-supplied anchor. Lines are fetched lazily;
 * the `_pinnedNodeId` check on resolve discards stale results from a
 * prior pin or dismissal.
 */
export function showTreePinnedTooltip(
    chart: TreeInteractChart,
    nodeId: number,
    anchor: { cx: number; cy: number },
    renderChromeOverlay: () => void,
): void {
    chart._tooltip.dismiss();
    chart._pinnedNodeId = nodeId;

    const cssWidth = chart._glManager?.cssWidth ?? 0;
    const cssHeight = chart._glManager?.cssHeight ?? 0;

    buildTreeTooltipLines(chart, nodeId).then((lines) => {
        if (chart._pinnedNodeId !== nodeId) {
            return;
        }

        if (lines.length === 0) {
            return;
        }

        chart._tooltip.pin(
            lines,
            { px: anchor.cx, py: anchor.cy },
            { cssWidth, cssHeight },
        );
    });

    chart._hoveredNodeId = NULL_NODE;
    renderChromeOverlay();
}

export function dismissTreePinnedTooltip(chart: TreeInteractChart): void {
    chart._tooltip.dismiss();
    chart._pinnedNodeId = NULL_NODE;
}

/**
 * Drill the clicked facet (or the whole chart in non-facet mode).
 * Faceted drill walks up to the facet root (top-level child of
 * `_rootId`), records the new drill node under that facet's label, and
 * re-renders.
 */
export function treeDrillTo(
    chart: TreeInteractChart,
    nodeId: number,
    renderFrame: () => void,
): void {
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
        renderFrame();
        return;
    }

    chart._currentRootId = nodeId;
    rebuildBreadcrumbs(chart, nodeId);
    chart._hoveredNodeId = NULL_NODE;
    renderFrame();
}
