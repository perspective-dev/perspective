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

/**
 * Streaming tree pipeline shared by treemap and sunburst. Rows arrive
 * incrementally; each chunk inserts its rows directly into the SOA
 * tree and appends to per-column row-data buffers for tooltip lookup.
 * After a chunk is processed, `finalizeTree` recomputes `value`
 * bottom-up and (in series mode) materializes `colorLabel` from the
 * ancestor-name composite.
 */

import type { ColumnDataMap, ColumnData } from "../../data/view-reader";
import { NULL_NODE } from "./node-store";
import type { TreeChartBase } from "./tree-chart";

// ── Reset ────────────────────────────────────────────────────────────────

/**
 * Reset the shared tree state. Called on the first chunk
 * (`startRow === 0`) of each dataset load.
 */
export function resetTreeState(chart: TreeChartBase): void {
    chart._nodeStore.reset();
    chart._childLookup.clear();

    // Allocate the synthetic root (id 0 by convention).
    const rootId = chart._nodeStore.allocate();
    chart._nodeStore.name[rootId] = "Total";
    chart._nodeStore.depth[rootId] = 0;
    chart._nodeStore.parent[rootId] = NULL_NODE;
    chart._childLookup.set(rootId, new Map());

    chart._rootId = rootId;
    chart._currentRootId = rootId;
    chart._breadcrumbIds = [rootId];

    chart._rowCount = 0;
    chart._rowCapacity = 0;
    chart._numericRowData.clear();
    chart._stringRowData.clear();

    chart._colorMin = Infinity;
    chart._colorMax = -Infinity;
    chart._uniqueColorLabels.clear();

    chart._visibleNodeIds = null;
    chart._visibleNodeCount = 0;
}

// ── Row-data buffer growth ───────────────────────────────────────────────

function ensureRowCapacity(chart: TreeChartBase, needed: number): void {
    if (needed <= chart._rowCapacity) return;
    const newCap = Math.max(needed, chart._rowCapacity * 2 || 1024);
    for (const [name, old] of chart._numericRowData) {
        const next = new Float32Array(newCap);
        next.set(old);
        chart._numericRowData.set(name, next);
    }
    for (const [, old] of chart._stringRowData) {
        old.length = newCap;
    }
    chart._rowCapacity = newCap;
}

function ensureNumericCol(chart: TreeChartBase, name: string): Float32Array {
    let arr = chart._numericRowData.get(name);
    if (!arr) {
        arr = new Float32Array(chart._rowCapacity);
        chart._numericRowData.set(name, arr);
    } else if (arr.length < chart._rowCapacity) {
        const next = new Float32Array(chart._rowCapacity);
        next.set(arr);
        chart._numericRowData.set(name, next);
        arr = next;
    }
    return arr;
}

function ensureStringCol(chart: TreeChartBase, name: string): string[] {
    let arr = chart._stringRowData.get(name);
    if (!arr) {
        arr = new Array(chart._rowCapacity);
        chart._stringRowData.set(name, arr);
    }
    return arr;
}

/**
 * Capture every non-`__` column's value at row `base + j` for
 * `j` in `[0, sourceLength)`. Enables O(1) tooltip lookup without
 * per-node `Map` allocations.
 */
function captureRowData(
    chart: TreeChartBase,
    columns: ColumnDataMap,
    base: number,
    sourceLength: number,
): void {
    for (const [name, col] of columns) {
        if (name.startsWith("__")) continue;
        if (col.type === "string" && col.indices && col.dictionary) {
            const arr = ensureStringCol(chart, name);
            const ind = col.indices;
            const dict = col.dictionary;
            for (let j = 0; j < sourceLength; j++) {
                arr[base + j] = dict[ind[j]];
            }
        } else if (col.values) {
            const arr = ensureNumericCol(chart, name);
            const vals = col.values;
            for (let j = 0; j < sourceLength; j++) {
                arr[base + j] = vals[j] as number;
            }
        }
    }
}

// ── Tree insertion ───────────────────────────────────────────────────────

/**
 * Find-or-create a child of `parentId` named `segment`. Uses a per-
 * parent `Map<name, childId>` for O(1) lookup.
 */
function childByName(
    chart: TreeChartBase,
    parentId: number,
    segment: string,
): number {
    let lookup = chart._childLookup.get(parentId);
    if (!lookup) {
        lookup = new Map();
        chart._childLookup.set(parentId, lookup);
    }
    const existing = lookup.get(segment);
    if (existing !== undefined) return existing;

    const childId = chart._nodeStore.allocate();
    chart._nodeStore.name[childId] = segment;
    chart._nodeStore.appendChild(parentId, childId);
    lookup.set(segment, childId);
    return childId;
}

/**
 * Insert one row into the tree.
 */
function insertRow(
    chart: TreeChartBase,
    rowPath: string[],
    sizeValue: number,
    colorValue: number,
    colorLabel: string,
    rowIdx: number,
    groupByLen: number,
): void {
    let currentId = chart._rootId;
    const depth = rowPath.length;
    for (let d = 0; d < depth; d++) {
        const childId = childByName(chart, currentId, rowPath[d]);

        if (d === depth - 1) {
            if (groupByLen === 0 || depth === groupByLen) {
                chart._nodeStore.size[childId] = Math.max(0, sizeValue);
                chart._nodeStore.leafRowIdx[childId] = rowIdx;
            }
            if (!isNaN(colorValue)) {
                chart._nodeStore.colorValue[childId] = colorValue;
                if (colorValue < chart._colorMin) chart._colorMin = colorValue;
                if (colorValue > chart._colorMax) chart._colorMax = colorValue;
            }
            if (colorLabel) {
                chart._nodeStore.colorLabel[childId] = colorLabel;
                if (!chart._uniqueColorLabels.has(colorLabel)) {
                    chart._uniqueColorLabels.set(
                        colorLabel,
                        chart._uniqueColorLabels.size,
                    );
                }
            }
        }

        currentId = childId;
    }
}

function readColor(
    chart: TreeChartBase,
    colorCol: ColumnData | null | undefined,
    rowIdx: number,
): { colorValue: number; colorLabel: string } {
    let colorValue = NaN;
    const colorLabel = "";
    if (!colorCol) return { colorValue, colorLabel };
    if (chart._colorMode === "numeric" && colorCol.values) {
        colorValue = colorCol.values[rowIdx] as number;
    }
    // Series-mode colorLabel is populated in finalizeTree (post-pass)
    // from the group-by path, so readColor just returns empty.
    return { colorValue, colorLabel };
}

// ── Chunk processor ──────────────────────────────────────────────────────

/**
 * Process one incoming chunk: grow row-data buffers, walk every row,
 * capture column values, and insert into the tree.
 */
export function processTreeChunk(
    chart: TreeChartBase,
    columns: ColumnDataMap,
): void {
    const rpCols: { indices: Int32Array; dictionary: string[] }[] = [];
    for (let n = 0; ; n++) {
        const rp = columns.get(`__ROW_PATH_${n}__`);
        if (!rp || rp.type !== "string" || !rp.indices || !rp.dictionary) break;
        rpCols.push({ indices: rp.indices, dictionary: rp.dictionary });
    }

    const hasGroupBy = rpCols.length > 0;
    const groupByLen = chart._groupBy.length;

    const sizeCol = chart._sizeName ? columns.get(chart._sizeName) : null;
    const colorCol = chart._colorName ? columns.get(chart._colorName) : null;

    const numRows = hasGroupBy
        ? rpCols[0].indices.length
        : (sizeCol?.values?.length ?? 0);
    if (numRows === 0) return;

    const base = chart._rowCount;
    ensureRowCapacity(chart, base + numRows);
    captureRowData(chart, columns, base, numRows);

    if (!hasGroupBy) {
        // Flat fallback: synthesize a single-segment path per row from
        // the first string column (or a "Row N" sentinel).
        let labelCol: ColumnData | undefined;
        for (const [name, col] of columns) {
            if (name.startsWith("__")) continue;
            if (name === chart._sizeName || name === chart._colorName) continue;
            if (col.type === "string" && col.indices && col.dictionary) {
                labelCol = col;
                break;
            }
        }

        for (let i = 0; i < numRows; i++) {
            const label =
                labelCol?.indices && labelCol?.dictionary
                    ? labelCol.dictionary[labelCol.indices[i]]
                    : `Row ${base + i}`;
            const sizeValue = sizeCol?.values
                ? Math.max(0, sizeCol.values[i] as number)
                : 1;
            const { colorValue, colorLabel } = readColor(chart, colorCol, i);
            insertRow(
                chart,
                [label],
                sizeValue,
                colorValue,
                colorLabel,
                base + i,
                groupByLen,
            );
        }
        chart._rowCount = base + numRows;
        return;
    }

    // Hierarchical (group_by present): reuse a scratch path buffer
    // across rows to avoid per-row array allocation.
    const pathScratch: string[] = new Array(rpCols.length);
    for (let i = 0; i < numRows; i++) {
        let pathLen = 0;
        for (let d = 0; d < rpCols.length; d++) {
            const rp = rpCols[d];
            const label = rp.dictionary[rp.indices[i]];
            if (!label && label !== "0") break;
            pathScratch[pathLen++] = label;
        }
        if (pathLen === 0) continue; // skip total row

        const rowPath = pathScratch.slice(0, pathLen);
        const sizeValue = sizeCol?.values ? (sizeCol.values[i] as number) : 1;
        const { colorValue, colorLabel } = readColor(chart, colorCol, i);

        insertRow(
            chart,
            rowPath,
            sizeValue,
            colorValue,
            colorLabel,
            base + i,
            groupByLen,
        );
    }
    chart._rowCount = base + numRows;
}

// ── Finalize ─────────────────────────────────────────────────────────────

/**
 * Post-chunk finalization.
 *   1. Recompute `value` bottom-up from `size` via an iterative
 *      post-order walk.
 *   2. In series mode, materialize each leaf's `colorLabel` from its
 *      ancestor-name composite.
 *   3. Re-resolve `_currentRootId` from the breadcrumb name-path so
 *      drill state survives incremental chunk arrivals.
 */
export function finalizeTree(chart: TreeChartBase): void {
    const store = chart._nodeStore;
    const value = store.value;
    const size = store.size;
    const firstChild = store.firstChild;
    const nextSibling = store.nextSibling;
    const parent = store.parent;

    // Iterative post-order. Stack holds `(id, state)` pairs; state
    // 0 = pre-visit, 1 = post-visit.
    let stack = new Int32Array(128);
    stack[0] = chart._rootId;
    stack[1] = 0;
    let sp = 1;

    // Reset value accumulators.
    for (let i = 0; i < store.count; i++) value[i] = 0;

    while (sp > 0) {
        sp--;
        const id = stack[sp * 2];
        const s = stack[sp * 2 + 1];
        if (s === 0) {
            stack[sp * 2 + 1] = 1;
            sp++;
            for (let c = firstChild[id]; c !== NULL_NODE; c = nextSibling[c]) {
                if ((sp + 1) * 2 > stack.length) {
                    const bigger = new Int32Array(stack.length * 2);
                    bigger.set(stack);
                    stack = bigger;
                }
                stack[sp * 2] = c;
                stack[sp * 2 + 1] = 0;
                sp++;
            }
        } else {
            if (firstChild[id] === NULL_NODE) {
                value[id] = Math.max(0, size[id]);
            } else {
                let sum = 0;
                for (
                    let c = firstChild[id];
                    c !== NULL_NODE;
                    c = nextSibling[c]
                ) {
                    sum += value[c];
                }
                value[id] = sum;
            }
        }
    }

    // Series-mode colorLabel: composite of ancestor names (excluding
    // the synthetic root). Walk only leaves; reuse a short path buffer.
    if (chart._colorMode === "series") {
        const pathBuf: string[] = [];
        const colorLabels = store.colorLabel;
        const name = store.name;
        for (let id = 0; id < store.count; id++) {
            if (firstChild[id] !== NULL_NODE) continue;
            if (id === chart._rootId) continue;
            pathBuf.length = 0;
            let p = id;
            while (parent[p] !== NULL_NODE) {
                pathBuf.push(name[p]);
                p = parent[p];
            }
            pathBuf.reverse();
            const key = pathBuf.join("");
            colorLabels[id] = key;
            if (!chart._uniqueColorLabels.has(key)) {
                chart._uniqueColorLabels.set(
                    key,
                    chart._uniqueColorLabels.size,
                );
            }
        }
    }

    // Preserve drill state across incremental chunk arrivals: walk the
    // breadcrumb name-path from the root and re-resolve. If a segment
    // is missing (shouldn't happen with incremental build, but
    // defensively), fall back to the root.
    if (chart._breadcrumbIds.length > 1) {
        const breadcrumbNames: string[] = [];
        for (let i = 1; i < chart._breadcrumbIds.length; i++) {
            breadcrumbNames.push(store.name[chart._breadcrumbIds[i]]);
        }
        let node = chart._rootId;
        let valid = true;
        for (const seg of breadcrumbNames) {
            const lookup = chart._childLookup.get(node);
            const next = lookup?.get(seg);
            if (next === undefined) {
                valid = false;
                break;
            }
            node = next;
        }
        if (valid && store.firstChild[node] !== NULL_NODE) {
            chart._currentRootId = node;
            rebuildBreadcrumbs(chart, node);
            return;
        }
    }
    chart._currentRootId = chart._rootId;
    chart._breadcrumbIds = [chart._rootId];
}

// ── Breadcrumbs ──────────────────────────────────────────────────────────

/** Rebuild `chart._breadcrumbIds` by walking up from `nodeId`. */
export function rebuildBreadcrumbs(chart: TreeChartBase, nodeId: number): void {
    const ids: number[] = [];
    let n = nodeId;
    while (n !== NULL_NODE) {
        ids.unshift(n);
        n = chart._nodeStore.parent[n];
    }
    chart._breadcrumbIds = ids;
}
