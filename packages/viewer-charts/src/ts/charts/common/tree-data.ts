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
 * tree. Per-leaf tooltip columns are fetched lazily on pin via the
 * chart's `_lazyRows`; the tree only retains `leafRowIdx` per leaf
 * (small, O(leaves)) as the handle back to the source view row.
 * After a chunk is processed, `finalizeTree` recomputes `value`
 * bottom-up.
 *
 * Color mode:
 *   - `"numeric"` — `readColor` reads the row's numeric value; the
 *     render path maps it through the continuous gradient.
 *   - `"series"` — `readColor` reads the row's string value from the
 *     color column's dictionary, and `seedColorLabels` pre-populates
 *     `_uniqueColorLabels` in dictionary-index order. Render picks
 *     `palette[dictIdx % paletteSize]`.
 *   - `"empty"` — no color column; every leaf gets `palette[0]`.
 *
 * When `_splitBy` is populated, every row is duplicated — one insertion
 * per split prefix, with that prefix pushed as the top-level path
 * segment so the top-level children of the synthetic root become
 * facet roots. The per-prefix `size` / `color` columns (named
 * `${prefix}|${base}`) feed the facet's values. `seedColorLabels`
 * runs once per split so every split's dictionary contributes to the
 * shared legend.
 */

import type { ColumnDataMap, ColumnData } from "../../data/view-reader";
import { buildSplitGroups } from "../../data/split-groups";
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

    chart._colorMin = Infinity;
    chart._colorMax = -Infinity;
    chart._uniqueColorLabels.clear();

    chart._visibleNodeIds = null;
    chart._visibleNodeCount = 0;
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
                // Store `|size|` for layout; remember the sign so
                // render can dim negative leaves (matches the area
                // chart's `theme.areaOpacity`).
                chart._nodeStore.size[childId] = Math.abs(sizeValue);
                chart._nodeStore.sizeSign[childId] = sizeValue < 0 ? -1 : 1;
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
    let colorLabel = "";
    if (!colorCol) return { colorValue, colorLabel };
    if (chart._colorMode === "numeric" && colorCol.values) {
        colorValue = colorCol.values[rowIdx] as number;
    } else if (
        chart._colorMode === "series" &&
        colorCol.indices &&
        colorCol.dictionary
    ) {
        // Read the dictionary-decoded string for this row. The palette
        // index that render uses is `_uniqueColorLabels.get(label)`,
        // which `seedColorLabels` seeds in dictionary-index order so
        // the end result is `palette[dictIdx % paletteSize]`.
        colorLabel = colorCol.dictionary[colorCol.indices[rowIdx]];
    }
    return { colorValue, colorLabel };
}

/**
 * Seed `_uniqueColorLabels` with the color column's dictionary in
 * index order. Using insertion-order-guarded `.set` means later
 * chunks (or later splits in split_by mode) append new entries
 * without disturbing already-assigned indices; for a single stable
 * dictionary this yields `_uniqueColorLabels.get(dict[i]) === i`.
 *
 * No-op outside `"series"` mode or when the column lacks a
 * dictionary.
 */
function seedColorLabels(
    chart: TreeChartBase,
    colorCol: ColumnData | null | undefined,
): void {
    if (chart._colorMode !== "series") return;
    if (!colorCol?.dictionary) return;
    const dict = colorCol.dictionary;
    for (let i = 0; i < dict.length; i++) {
        const s = dict[i];
        if (!chart._uniqueColorLabels.has(s)) {
            chart._uniqueColorLabels.set(s, chart._uniqueColorLabels.size);
        }
    }
}

// ── Chunk processor ──────────────────────────────────────────────────────

interface SplitSource {
    prefix: string;
    sizeCol: ColumnData | null;
    colorCol: ColumnData | null;
}

/**
 * Resolve the per-split size / color columns. Returns `null` when
 * `_splitBy` is empty — callers then take the non-split fast path.
 */
function resolveSplitSources(
    chart: TreeChartBase,
    columns: ColumnDataMap,
): SplitSource[] | null {
    if (chart._splitBy.length === 0) return null;
    const required: string[] = chart._sizeName ? [chart._sizeName] : [];
    const optional: string[] = chart._colorName ? [chart._colorName] : [];
    const groups = buildSplitGroups(columns, required, optional);
    if (groups.length === 0) return null;
    return groups.map((g) => ({
        prefix: g.prefix,
        sizeCol: chart._sizeName
            ? (columns.get(`${g.prefix}|${chart._sizeName}`) ?? null)
            : null,
        colorCol: chart._colorName
            ? (columns.get(`${g.prefix}|${chart._colorName}`) ?? null)
            : null,
    }));
}

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
    const splitSources = resolveSplitSources(chart, columns);
    const hasSplits = splitSources !== null;

    const sizeCol = chart._sizeName ? columns.get(chart._sizeName) : null;
    const colorCol = chart._colorName ? columns.get(chart._colorName) : null;

    const firstSizeCol = hasSplits ? splitSources![0].sizeCol : sizeCol;
    const numRows = hasGroupBy
        ? rpCols[0].indices.length
        : (firstSizeCol?.values?.length ?? 0);
    if (numRows === 0) return;

    // Seed palette label indices from the color column's dictionary
    // BEFORE inserting rows, so the first row doesn't assign label 0
    // to whichever dict value it happens to reference. For splits we
    // seed once per split's own color column so every dict value is
    // known to the shared legend.
    if (hasSplits) {
        for (const src of splitSources!) seedColorLabels(chart, src.colorCol);
    } else {
        seedColorLabels(chart, colorCol);
    }

    // `base` is the source-view row offset the tree should tag its
    // leaves with. `_rowCount` tracks how many rows prior chunks
    // occupied so `leafRowIdx[childId] = base + i` still points back
    // to the correct view row after multiple chunk arrivals.
    const base = chart._rowCount;

    // The split expansion inserts the same row under N different path
    // prefixes. `groupByLen + 1` (or just 1 in non-group-by mode) is
    // passed as the `groupByLen` override so `insertRow` treats the
    // correct depth as the leaf; this keeps per-leaf `size` / `color`
    // aligned with each facet's source column.
    const effectiveGroupLen = hasSplits ? groupByLen + 1 : groupByLen;

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

        const sources = hasSplits ? splitSources! : null;
        for (let i = 0; i < numRows; i++) {
            const label =
                labelCol?.indices && labelCol?.dictionary
                    ? labelCol.dictionary[labelCol.indices[i]]
                    : `Row ${base + i}`;

            if (sources) {
                for (const src of sources) {
                    // Pass the signed value through; `insertRow` stores
                    // `|size|` and `sizeSign` separately so the
                    // render pass can dim negative leaves.
                    const sizeValue = src.sizeCol?.values
                        ? (src.sizeCol.values[i] as number)
                        : 1;
                    const { colorValue, colorLabel } = readColor(
                        chart,
                        src.colorCol,
                        i,
                    );
                    insertRow(
                        chart,
                        [src.prefix, label],
                        sizeValue,
                        colorValue,
                        colorLabel,
                        base + i,
                        effectiveGroupLen,
                    );
                }
            } else {
                const sizeValue = sizeCol?.values
                    ? (sizeCol.values[i] as number)
                    : 1;
                const { colorValue, colorLabel } = readColor(
                    chart,
                    colorCol,
                    i,
                );
                insertRow(
                    chart,
                    [label],
                    sizeValue,
                    colorValue,
                    colorLabel,
                    base + i,
                    effectiveGroupLen,
                );
            }
        }
        chart._rowCount = base + numRows;
        return;
    }

    // Hierarchical (group_by present): reuse a scratch path buffer
    // across rows to avoid per-row array allocation. When splits are
    // active the scratch is one slot longer to hold the leading prefix.
    const extra = hasSplits ? 1 : 0;
    const pathScratch: string[] = new Array(rpCols.length + extra);
    for (let i = 0; i < numRows; i++) {
        let pathLen = 0;
        for (let d = 0; d < rpCols.length; d++) {
            const rp = rpCols[d];
            const label = rp.dictionary[rp.indices[i]];
            if (!label && label !== "0") break;
            pathScratch[extra + pathLen++] = label;
        }
        if (pathLen === 0) continue; // skip total row

        if (hasSplits) {
            for (const src of splitSources!) {
                pathScratch[0] = src.prefix;
                const rowPath = pathScratch.slice(0, pathLen + 1);
                const sizeValue = src.sizeCol?.values
                    ? (src.sizeCol.values[i] as number)
                    : 1;
                const { colorValue, colorLabel } = readColor(
                    chart,
                    src.colorCol,
                    i,
                );
                insertRow(
                    chart,
                    rowPath,
                    sizeValue,
                    colorValue,
                    colorLabel,
                    base + i,
                    effectiveGroupLen,
                );
            }
        } else {
            const rowPath = pathScratch.slice(0, pathLen);
            const sizeValue = sizeCol?.values
                ? (sizeCol.values[i] as number)
                : 1;
            const { colorValue, colorLabel } = readColor(chart, colorCol, i);
            insertRow(
                chart,
                rowPath,
                sizeValue,
                colorValue,
                colorLabel,
                base + i,
                effectiveGroupLen,
            );
        }
    }
    chart._rowCount = base + numRows;
}

// ── Finalize ─────────────────────────────────────────────────────────────

/**
 * Post-chunk finalization.
 *   1. Recompute `value` bottom-up from `size` via an iterative
 *      post-order walk.
 *   2. Re-resolve `_currentRootId` from the breadcrumb name-path so
 *      drill state survives incremental chunk arrivals.
 *
 * `colorLabel` is set at insert time (`readColor`) and needs no
 * post-pass: in `"series"` mode it comes from the color column's
 * dictionary, and in `"numeric"` / `"empty"` modes it's unused.
 */
export function finalizeTree(chart: TreeChartBase): void {
    const store = chart._nodeStore;
    const value = store.value;
    const size = store.size;
    const firstChild = store.firstChild;
    const nextSibling = store.nextSibling;

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
