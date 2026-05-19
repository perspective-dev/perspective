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

import type { ColumnDataMap } from "../../data/view-reader";
import { buildSplitGroups } from "../../data/split-groups";
import type { CategoricalLevel } from "../../axis/categorical-axis";
import {
    resolveAxisMode,
    resolveCategoryAxis,
    resolveNumericCategoryDomain,
    type AxisMode,
    type NumericCategoryDomain,
} from "../common/category-axis-resolver";
import { computeSlotGeometry } from "../common/band-layout";

export interface CandleSeriesInfo {
    seriesId: number;
    splitIdx: number;
    splitKey: string;
    label: string;
}

/**
 * Logical candle record. Synthesized on demand from {@link CandleColumns}
 * via {@link readCandleRecord} for tooltip / hover paths. The pipeline
 * never materializes these — see `CandleColumns` for the columnar
 * storage that replaces the legacy `CandleRecord[]`.
 */
export interface CandleRecord {
    catIdx: number;
    splitIdx: number;
    seriesId: number;
    xCenter: number;
    halfWidth: number;
    open: number;
    close: number;
    high: number;
    low: number;
    isUp: boolean;
}

/**
 * Columnar storage for the candle record set. Replaces the legacy
 * `CandleRecord[]` to avoid per-record POJO allocation at scale.
 *
 * Records are appended in `(splitIdx, catIdx)` order as the pipeline
 * loop is structured (outer split, inner category) — both `xCenter` and
 * `catIdx` are monotonically non-decreasing within a split, which the
 * hit-test uses for binary-search narrowing.
 *
 * `count` is the active record count; the underlying typed arrays may
 * be over-allocated for capacity reuse across builds.
 */
export interface CandleColumns {
    count: number;
    catIdx: Int32Array;
    splitIdx: Int32Array;
    seriesId: Int32Array;
    xCenter: Float64Array;
    halfWidth: Float64Array;
    open: Float64Array;
    close: Float64Array;
    high: Float64Array;
    low: Float64Array;

    /**
     * 1 = up (close ≥ open), 0 = down.
     */
    isUp: Uint8Array;
}

export function emptyCandleColumns(): CandleColumns {
    return {
        count: 0,
        catIdx: new Int32Array(0),
        splitIdx: new Int32Array(0),
        seriesId: new Int32Array(0),
        xCenter: new Float64Array(0),
        halfWidth: new Float64Array(0),
        open: new Float64Array(0),
        close: new Float64Array(0),
        high: new Float64Array(0),
        low: new Float64Array(0),
        isUp: new Uint8Array(0),
    };
}

/**
 * Reuse `prev`'s typed arrays when capacity is sufficient, else allocate
 * fresh. Resets `count` to 0; pipeline writes from index 0.
 */
export function ensureCandleColumnsCapacity(
    prev: CandleColumns | null,
    capacity: number,
): CandleColumns {
    if (prev && prev.catIdx.length >= capacity) {
        prev.count = 0;
        return prev;
    }

    return {
        count: 0,
        catIdx: new Int32Array(capacity),
        splitIdx: new Int32Array(capacity),
        seriesId: new Int32Array(capacity),
        xCenter: new Float64Array(capacity),
        halfWidth: new Float64Array(capacity),
        open: new Float64Array(capacity),
        close: new Float64Array(capacity),
        high: new Float64Array(capacity),
        low: new Float64Array(capacity),
        isUp: new Uint8Array(capacity),
    };
}

/**
 * Synthesize a {@link CandleRecord} POJO for record `i`. Used by
 * tooltip / pinned tooltip / hover return paths; not called in any
 * frame-rate hot loop.
 */
export function readCandleRecord(cols: CandleColumns, i: number): CandleRecord {
    return {
        catIdx: cols.catIdx[i],
        splitIdx: cols.splitIdx[i],
        seriesId: cols.seriesId[i],
        xCenter: cols.xCenter[i],
        halfWidth: cols.halfWidth[i],
        open: cols.open[i],
        close: cols.close[i],
        high: cols.high[i],
        low: cols.low[i],
        isUp: cols.isUp[i] !== 0,
    };
}

export interface CandlestickPipelineInput {
    columns: ColumnDataMap;
    numRows: number;
    columnSlots: (string | null)[];
    groupBy: string[];
    splitBy: string[];

    /**
     * Source-column types for `group_by` columns. Same shape as the bar
     * pipeline — used to stringify non-string row-paths and to enable
     * numeric-axis mode for a single non-string non-boolean group_by.
     */
    groupByTypes: Record<string, string>;

    /**
     * Band-slot geometry knobs sourced from
     * {@link PluginConfig.band_inner_frac} / `bar_inner_pad`. Forwarded
     * to `computeSlotGeometry`. Replace the `BAND_INNER_FRAC` /
     * `BAR_INNER_PAD` constants.
     */
    bandInnerFrac: number;
    barInnerPad: number;

    /**
     * Reusable scratch — pipeline writes records into the typed arrays
     * in place. Pass the previous build's columns to amortize
     * allocation across data reloads.
     */
    scratchCandles?: CandleColumns | null;
}

export type { NumericCategoryDomain };

export interface CandlestickPipelineResult {
    splitPrefixes: string[];
    rowPaths: CategoricalLevel[];
    numCategories: number;
    rowOffset: number;

    /**
     * Axis mode discriminator (see bar-build for semantics).
     */
    axisMode: AxisMode;
    numericCategoryDomain: NumericCategoryDomain | null;

    /**
     * Per-category X position (real data units) in numeric mode.
     */
    categoryPositions: Float64Array | null;
    series: CandleSeriesInfo[];
    candles: CandleColumns;
    yDomain: { min: number; max: number };
}

const EMPTY_RESULT: Omit<CandlestickPipelineResult, "candles"> = {
    splitPrefixes: [],
    rowPaths: [],
    numCategories: 0,
    rowOffset: 0,
    axisMode: { mode: "category" },
    numericCategoryDomain: null,
    categoryPositions: null,
    series: [],
    yDomain: { min: 0, max: 1 },
};

/**
 * Pure pipeline: turn a raw `ColumnDataMap` into a columnar
 * {@link CandleColumns}. Column slots (Open / Close / High / Low) mirror
 * d3fc's convention:
 *   - `Open` is required.
 *   - `Close` falls back to the next row's Open (last row: own Open).
 *   - `High` falls back to `max(open, close)`.
 *   - `Low` falls back to `min(open, close)`.
 *
 * The fallbacks apply per series when `split_by` is active, so each
 * split reads the "next row" from its own series.
 */
export function buildCandlestickPipeline(
    input: CandlestickPipelineInput,
): CandlestickPipelineResult {
    const {
        columns,
        numRows,
        columnSlots,
        groupBy,
        splitBy,
        groupByTypes,
        bandInnerFrac,
        barInnerPad,
        scratchCandles,
    } = input;
    const axisMode = resolveAxisMode(groupBy, groupByTypes);

    const openBase = columnSlots[0] || "";
    if (!openBase) {
        return { ...EMPTY_RESULT, candles: emptyCandleColumns() };
    }

    const closeBase = columnSlots[1] || "";
    const highBase = columnSlots[2] || "";
    const lowBase = columnSlots[3] || "";

    // Split-prefix resolution. Each split provides its own Open column
    // (required) and may provide any subset of Close / High / Low.
    const splitPrefixes: string[] = [];
    if (splitBy.length > 0) {
        const aggregates = [openBase];
        if (closeBase) {
            aggregates.push(closeBase);
        }

        if (highBase) {
            aggregates.push(highBase);
        }

        if (lowBase) {
            aggregates.push(lowBase);
        }

        for (const g of buildSplitGroups(columns, [openBase], aggregates)) {
            if (g.colNames.has(openBase)) {
                splitPrefixes.push(g.prefix);
            }
        }

        if (splitPrefixes.length === 0) {
            splitPrefixes.push("");
        }
    } else {
        splitPrefixes.push("");
    }

    const levelTypes = groupBy.map((name) => groupByTypes[name] ?? "string");
    const { rowPaths, numCategories, rowOffset } = resolveCategoryAxis(
        columns,
        numRows,
        groupBy.length,
        levelTypes,
    );
    if (numCategories === 0) {
        return {
            ...EMPTY_RESULT,
            axisMode,
            splitPrefixes,
            rowPaths,
            rowOffset,
            candles: emptyCandleColumns(),
        };
    }

    const P = splitPrefixes.length;
    const series: CandleSeriesInfo[] = [];
    for (let p = 0; p < P; p++) {
        const splitKey = splitPrefixes[p];
        series.push({
            seriesId: p,
            splitIdx: p,
            splitKey,
            label: splitKey === "" ? openBase : splitKey,
        });
    }

    // Numeric-mode category positions — read from `__ROW_PATH_0__` so
    // candles anchor at real data values (e.g. ms-since-epoch) instead
    // of logical category indices.
    let categoryPositions: Float64Array | null = null;
    let numericCategoryDomain: NumericCategoryDomain | null = null;
    let numericBandWidth = 1;
    if (axisMode.mode === "numeric" && numCategories > 0) {
        const rp = columns.get("__ROW_PATH_0__");
        const resolved = resolveNumericCategoryDomain(
            rp?.values,
            numCategories,
            rowOffset,
            groupBy[0] ?? "",
            axisMode.numericType === "date" ||
                axisMode.numericType === "datetime",
        );
        if (resolved) {
            categoryPositions = resolved.categoryPositions;
            numericCategoryDomain = resolved.numericCategoryDomain;
            numericBandWidth = resolved.numericCategoryDomain.bandWidth;
        }
    }

    const baseSlot = computeSlotGeometry(P, bandInnerFrac, barInnerPad);
    const slotWidth = baseSlot.slotWidth * numericBandWidth;
    const halfWidth = baseSlot.halfWidth * numericBandWidth;
    const halfP = (P - 1) / 2;

    // Per-series column references (resolved once, not per row).
    const seriesCols: {
        openCol: ArrayLike<unknown> | null;
        closeCol: ArrayLike<unknown> | null;
        highCol: ArrayLike<unknown> | null;
        lowCol: ArrayLike<unknown> | null;
        openValid: Uint8Array | null;
        closeValid: Uint8Array | null;
        highValid: Uint8Array | null;
        lowValid: Uint8Array | null;
    }[] = [];
    for (let p = 0; p < P; p++) {
        const prefix = splitPrefixes[p];
        const nm = (base: string) =>
            prefix === "" ? base : `${prefix}|${base}`;
        const openCol = columns.get(nm(openBase));
        if (!openCol?.values) {
            seriesCols.push({
                openCol: null,
                closeCol: null,
                highCol: null,
                lowCol: null,
                openValid: null,
                closeValid: null,
                highValid: null,
                lowValid: null,
            });
            continue;
        }

        const closeCol = closeBase ? columns.get(nm(closeBase)) : null;
        const highCol = highBase ? columns.get(nm(highBase)) : null;
        const lowCol = lowBase ? columns.get(nm(lowBase)) : null;
        seriesCols.push({
            openCol: openCol.values,
            closeCol: closeCol?.values ?? null,
            highCol: highCol?.values ?? null,
            lowCol: lowCol?.values ?? null,
            openValid: openCol.valid ?? null,
            closeValid: closeCol?.valid ?? null,
            highValid: highCol?.valid ?? null,
            lowValid: lowCol?.valid ?? null,
        });
    }

    // Pre-allocate columnar candle storage at N*P upper bound. The
    // pipeline emits at most one record per (split, cat) cell.
    const cap = numCategories * P;
    const candles = ensureCandleColumnsCapacity(scratchCandles ?? null, cap);
    let write = 0;

    let yMin = Infinity;
    let yMax = -Infinity;

    const N = numCategories;

    for (let p = 0; p < P; p++) {
        const sc = seriesCols[p];
        const openCol = sc.openCol;
        if (!openCol) {
            continue;
        }

        const closeCol = sc.closeCol;
        const highCol = sc.highCol;
        const lowCol = sc.lowCol;
        const openValid = sc.openValid;
        const closeValid = sc.closeValid;
        const highValid = sc.highValid;
        const lowValid = sc.lowValid;
        const slotOffset = (p - halfP) * slotWidth;

        for (let catI = 0; catI < N; catI++) {
            const row = catI + rowOffset;

            // Inlined valid-bit test (was a closure in the legacy build).
            if (openValid && !((openValid[row >> 3] >> (row & 7)) & 1)) {
                continue;
            }

            const open = openCol[row] as number;
            if (!isFinite(open)) {
                continue;
            }

            // Close fallback: explicit close column → next row's open →
            // own open (degenerate). Each branch inlines the validity
            // check to avoid a per-row closure.
            let close: number;
            if (
                closeCol &&
                (!closeValid || ((closeValid[row >> 3] >> (row & 7)) & 1) !== 0)
            ) {
                const v = closeCol[row] as number;
                close = isFinite(v) ? v : open;
            } else {
                const nextRow = catI < N - 1 ? catI + 1 + rowOffset : row;
                if (
                    !openValid ||
                    ((openValid[nextRow >> 3] >> (nextRow & 7)) & 1) !== 0
                ) {
                    const v = openCol[nextRow] as number;
                    close = isFinite(v) ? v : open;
                } else {
                    close = open;
                }
            }

            let high: number;
            if (
                highCol &&
                (!highValid || ((highValid[row >> 3] >> (row & 7)) & 1) !== 0)
            ) {
                const v = highCol[row] as number;
                high = isFinite(v) ? v : open > close ? open : close;
            } else {
                high = open > close ? open : close;
            }

            let low: number;
            if (
                lowCol &&
                (!lowValid || ((lowValid[row >> 3] >> (row & 7)) & 1) !== 0)
            ) {
                const v = lowCol[row] as number;
                low = isFinite(v) ? v : open < close ? open : close;
            } else {
                low = open < close ? open : close;
            }

            const center = categoryPositions ? categoryPositions[catI] : catI;
            const xCenter = center + slotOffset;
            const isUp = close >= open ? 1 : 0;

            candles.catIdx[write] = catI;
            candles.splitIdx[write] = p;
            candles.seriesId[write] = p;
            candles.xCenter[write] = xCenter;
            candles.halfWidth[write] = halfWidth;
            candles.open[write] = open;
            candles.close[write] = close;
            candles.high[write] = high;
            candles.low[write] = low;
            candles.isUp[write] = isUp;
            write++;

            if (low < yMin) {
                yMin = low;
            }

            if (high > yMax) {
                yMax = high;
            }
        }
    }

    candles.count = write;

    if (!isFinite(yMin) || !isFinite(yMax)) {
        yMin = 0;
        yMax = 1;
    } else if (yMin === yMax) {
        // Zero-height domain: pad symmetrically so the axis renders.
        const pad = Math.max(Math.abs(yMin), 1) * 0.05;
        yMin -= pad;
        yMax += pad;
    }

    return {
        splitPrefixes,
        rowPaths,
        numCategories,
        rowOffset,
        axisMode,
        numericCategoryDomain,
        categoryPositions,
        series,
        candles,
        yDomain: { min: yMin, max: yMax },
    };
}
