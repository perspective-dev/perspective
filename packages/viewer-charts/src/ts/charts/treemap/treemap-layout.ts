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
import { NodeStore, NULL_NODE } from "../common/node-store";

export interface BreadcrumbRegion {
    nodeId: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export const PADDING_OUTER = 1;
export const PADDING_LABEL = 14;
export const PADDING_INNER = 1;

// Re-export shared streaming pipeline so treemap-layout stays the one
// import site consumers use.
export {
    resetTreeState as resetTreemapState,
    processTreeChunk as processTreemapChunk,
    finalizeTree as finalizeTreemap,
    rebuildBreadcrumbs,
} from "../common/tree-data";

/**
 * Minimum visible rect area (in CSS pixels squared). Subtrees that
 * project to less than this are not subdivided during `squarify` and
 * are skipped by `collectVisible`.
 */
const MIN_VISIBLE_AREA = 4; // 2×2 px

// ── Squarify layout ──────────────────────────────────────────────────────

/**
 * Order-preserving treemap layout. Walks the linked-list child graph
 * and writes `x0/y0/x1/y1` in place into the node store.
 */
export function squarify(
    store: NodeStore,
    id: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    baseDepth: number,
    scratch: Int32Array,
    showBranchHeader: boolean,
): void {
    store.x0[id] = Math.round(x0);
    store.y0[id] = Math.round(y0);
    store.x1[id] = Math.round(x1);
    store.y1[id] = Math.round(y1);

    if (store.firstChild[id] === NULL_NODE) return;

    const area = (x1 - x0) * (y1 - y0);
    if (area < MIN_VISIBLE_AREA) return;

    const relDepth = store.depth[id] - baseDepth;
    const showHeader =
        showBranchHeader &&
        relDepth === 1 &&
        store.firstChild[id] !== NULL_NODE;
    const padTop = showHeader ? PADDING_LABEL : PADDING_INNER;
    const padOuter = showHeader ? PADDING_OUTER : PADDING_INNER;

    const ix0 = store.x0[id] + padOuter;
    const iy0 = store.y0[id] + padTop;
    const ix1 = store.x1[id] - padOuter;
    const iy1 = store.y1[id] - padOuter;
    if (ix1 <= ix0 || iy1 <= iy0) return;

    let activeCount = 0;
    for (
        let c = store.firstChild[id];
        c !== NULL_NODE;
        c = store.nextSibling[c]
    ) {
        if (store.value[c] > 0) {
            scratch[activeCount++] = c;
        }
    }
    if (activeCount === 0) return;

    layoutOrdered(
        store,
        scratch,
        0,
        activeCount,
        ix0,
        iy0,
        ix1,
        iy1,
        baseDepth,
        scratch.subarray(activeCount),
        showBranchHeader,
    );
}

function layoutOrdered(
    store: NodeStore,
    nodes: Int32Array,
    lo: number,
    hi: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    baseDepth: number,
    childScratch: Int32Array,
    showBranchHeader: boolean,
): void {
    const n = hi - lo;
    if (n === 0) return;
    if (n === 1) {
        squarify(
            store,
            nodes[lo],
            x0,
            y0,
            x1,
            y1,
            baseDepth,
            childScratch,
            showBranchHeader,
        );
        return;
    }

    let totalValue = 0;
    for (let i = lo; i < hi; i++) totalValue += store.value[nodes[i]];
    const halfValue = totalValue / 2;

    let cumulative = 0;
    let splitIdx = lo + 1;
    let bestDiff = Infinity;
    for (let i = lo; i < hi - 1; i++) {
        cumulative += store.value[nodes[i]];
        const diff = Math.abs(cumulative - halfValue);
        if (diff < bestDiff) {
            bestDiff = diff;
            splitIdx = i + 1;
        }
    }

    let leftValue = 0;
    for (let i = lo; i < splitIdx; i++) leftValue += store.value[nodes[i]];
    const fraction = leftValue / totalValue;

    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw >= rh) {
        const splitX = Math.round(x0 + rw * fraction);
        layoutOrdered(
            store,
            nodes,
            lo,
            splitIdx,
            x0,
            y0,
            splitX,
            y1,
            baseDepth,
            childScratch,
            showBranchHeader,
        );
        layoutOrdered(
            store,
            nodes,
            splitIdx,
            hi,
            splitX,
            y0,
            x1,
            y1,
            baseDepth,
            childScratch,
            showBranchHeader,
        );
    } else {
        const splitY = Math.round(y0 + rh * fraction);
        layoutOrdered(
            store,
            nodes,
            lo,
            splitIdx,
            x0,
            y0,
            x1,
            splitY,
            baseDepth,
            childScratch,
            showBranchHeader,
        );
        layoutOrdered(
            store,
            nodes,
            splitIdx,
            hi,
            x0,
            splitY,
            x1,
            y1,
            baseDepth,
            childScratch,
            showBranchHeader,
        );
    }
}

// ── Collect visible ──────────────────────────────────────────────────────

/**
 * Walk from `startId` depth-first, emitting every descendant whose rect
 * area is above `MIN_VISIBLE_AREA`. O(visible), not O(total).
 *
 * Faceted render paths call {@link collectVisibleAppend} once per facet
 * and do the final `_visibleNodeCount` bookkeeping themselves; this
 * single-facet entry point wraps that for non-split trees.
 */
export function collectVisible(
    chart: TreemapChart,
    startId: number,
    maxDepth: number,
    baseDepth: number,
): void {
    chart._visibleNodeCount = collectVisibleAppend(
        chart,
        startId,
        maxDepth,
        baseDepth,
        0,
    );
}

/**
 * Append the visible-node IDs below `startId` into `_visibleNodeIds`
 * starting at `startOffset`. Returns the new length. Used by faceted
 * treemap rendering to concatenate per-facet visibility without doing
 * a second pass.
 */
export function collectVisibleAppend(
    chart: TreemapChart,
    startId: number,
    maxDepth: number,
    baseDepth: number,
    startOffset: number,
): number {
    const store = chart._nodeStore;
    const x0 = store.x0;
    const y0 = store.y0;
    const x1 = store.x1;
    const y1 = store.y1;
    const depth = store.depth;
    const firstChild = store.firstChild;
    const nextSibling = store.nextSibling;
    const value = store.value;

    if (!chart._visibleNodeIds || chart._visibleNodeIds.length < store.count) {
        chart._visibleNodeIds = new Int32Array(store.count);
    }
    const out = chart._visibleNodeIds;

    let outIdx = startOffset;

    let stack = new Int32Array(128);
    stack[0] = startId;
    let sp = 1;

    while (sp > 0) {
        sp--;
        const id = stack[sp];
        if (value[id] <= 0) continue;

        if (depth[id] >= baseDepth) {
            out[outIdx++] = id;
        }

        if (depth[id] - baseDepth >= maxDepth) continue;

        const w = x1[id] - x0[id];
        const h = y1[id] - y0[id];
        if (w * h < MIN_VISIBLE_AREA) continue;

        for (let c = firstChild[id]; c !== NULL_NODE; c = nextSibling[c]) {
            if (sp >= stack.length) {
                const bigger = new Int32Array(stack.length * 2);
                bigger.set(stack);
                stack = bigger;
            }
            stack[sp++] = c;
        }
    }

    return outIdx;
}
