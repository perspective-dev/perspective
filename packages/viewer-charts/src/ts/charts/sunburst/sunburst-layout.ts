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
import { NULL_NODE, type NodeStore } from "../common/node-store";

/**
 * Minimum arc area (in pixels²) below which a subtree stops being
 * subdivided. Keeps the visible count bounded independent of tree
 * size — the core mechanism that lets sunburst scale to 2M nodes.
 */
const MIN_VISIBLE_ARC_AREA = 4;

/** Inner radius: reserved for the current-root drill-up target. */
const INNER_RING_PX = 30;

/**
 * Compute the max visible tree depth beneath `currentRootId`.
 * Needed for ring-width calculation.
 */
function maxDepthBelow(store: NodeStore, currentRootId: number): number {
    // Iterative DFS, no recursion.
    let maxDepth = 0;
    const baseDepth = store.depth[currentRootId];
    let stack = new Int32Array(128);
    stack[0] = currentRootId;
    let sp = 1;
    while (sp > 0) {
        sp--;
        const id = stack[sp];
        const d = store.depth[id] - baseDepth;
        if (d > maxDepth) maxDepth = d;
        for (
            let c = store.firstChild[id];
            c !== NULL_NODE;
            c = store.nextSibling[c]
        ) {
            if (sp >= stack.length) {
                const bigger = new Int32Array(stack.length * 2);
                bigger.set(stack);
                stack = bigger;
            }
            stack[sp++] = c;
        }
    }
    return maxDepth;
}

/**
 * Recursive polar partition writing `(a0, a1, r0, r1)` into the store.
 * The root node's own ring is reserved (inner radius = 0, outer =
 * `INNER_RING_PX`) for the drill-up click target; descendants start at
 * `INNER_RING_PX` and extend out.
 */
export function partitionSunburst(
    store: NodeStore,
    currentRootId: number,
    maxRadius: number,
): void {
    const baseDepth = store.depth[currentRootId];
    const maxD = Math.max(1, maxDepthBelow(store, currentRootId));
    const usableRadius = Math.max(0, maxRadius - INNER_RING_PX);
    const ringWidth = usableRadius / maxD;

    // Root spans full circle; its ring is the inner drill-up circle.
    store.a0[currentRootId] = 0;
    store.a1[currentRootId] = 2 * Math.PI;
    store.r0[currentRootId] = 0;
    store.r1[currentRootId] = INNER_RING_PX;

    // Recurse into children with stack (same pattern as treemap's
    // squarify scratch).
    partitionChildren(
        store,
        currentRootId,
        0,
        2 * Math.PI,
        INNER_RING_PX,
        ringWidth,
        baseDepth,
    );
}

function partitionChildren(
    store: NodeStore,
    parentId: number,
    a0: number,
    a1: number,
    parentR1: number,
    ringWidth: number,
    baseDepth: number,
): void {
    const totalValue = store.value[parentId];
    if (totalValue <= 0) return;
    const span = a1 - a0;

    let cursor = a0;
    for (
        let c = store.firstChild[parentId];
        c !== NULL_NODE;
        c = store.nextSibling[c]
    ) {
        const v = store.value[c];
        if (v <= 0) continue;
        const frac = v / totalValue;
        const childA0 = cursor;
        const childA1 = cursor + span * frac;
        cursor = childA1;

        const childR0 = parentR1;
        const childR1 = parentR1 + ringWidth;
        store.a0[c] = childA0;
        store.a1[c] = childA1;
        store.r0[c] = childR0;
        store.r1[c] = childR1;

        // LOD: stop subdividing if this arc's projected pixel area
        // falls below the threshold. Descendants keep stale coords but
        // `collectVisibleArcs` will skip them.
        const arcSpan = childA1 - childA0;
        const midR = (childR0 + childR1) / 2;
        const arcLen = arcSpan * midR; // pixel length along arc
        const area = arcLen * ringWidth;
        if (area < MIN_VISIBLE_ARC_AREA) continue;

        if (store.firstChild[c] !== NULL_NODE) {
            partitionChildren(
                store,
                c,
                childA0,
                childA1,
                childR1,
                ringWidth,
                baseDepth,
            );
        }
    }
}

/**
 * Walk from `startId` depth-first, emitting every descendant whose
 * arc area exceeds `MIN_VISIBLE_ARC_AREA`.
 *
 * The single-facet entry point; faceted rendering uses
 * {@link collectVisibleArcsAppend} to concatenate across facets.
 */
export function collectVisibleArcs(
    chart: SunburstChart,
    startId: number,
): void {
    chart._visibleNodeCount = collectVisibleArcsAppend(chart, startId, 0);
}

/**
 * Append visible arcs under `startId` to `_visibleNodeIds` starting at
 * `startOffset`, returning the new length.
 */
export function collectVisibleArcsAppend(
    chart: SunburstChart,
    startId: number,
    startOffset: number,
): number {
    const store = chart._nodeStore;
    const a0 = store.a0;
    const a1 = store.a1;
    const r0 = store.r0;
    const r1 = store.r1;
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

        out[outIdx++] = id;

        const arcSpan = a1[id] - a0[id];
        const midR = (r0[id] + r1[id]) / 2;
        const arcLen = arcSpan * midR;
        const ringWidth = r1[id] - r0[id];
        if (arcLen * ringWidth < MIN_VISIBLE_ARC_AREA) continue;

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

export { INNER_RING_PX, MIN_VISIBLE_ARC_AREA };
