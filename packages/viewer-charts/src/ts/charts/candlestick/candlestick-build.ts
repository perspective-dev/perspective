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
import type { CategoricalLevel } from "../../chrome/categorical-axis";
import { resolveCategoryAxis } from "../common/category-axis";
import { computeSlotGeometry, slotCenter } from "../common/band-layout";

export interface CandleSeriesInfo {
    seriesId: number;
    splitIdx: number;
    splitKey: string;
    label: string;
}

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

export interface CandlestickPipelineInput {
    columns: ColumnDataMap;
    numRows: number;
    columnSlots: (string | null)[];
    groupBy: string[];
    splitBy: string[];
}

export interface CandlestickPipelineResult {
    splitPrefixes: string[];
    rowPaths: CategoricalLevel[];
    numCategories: number;
    rowOffset: number;
    series: CandleSeriesInfo[];
    candles: CandleRecord[];
    yDomain: { min: number; max: number };
}

const EMPTY: CandlestickPipelineResult = {
    splitPrefixes: [],
    rowPaths: [],
    numCategories: 0,
    rowOffset: 0,
    series: [],
    candles: [],
    yDomain: { min: 0, max: 1 },
};

/**
 * Pure pipeline: turn a raw `ColumnDataMap` into `CandleRecord[]`.
 *
 * Column slots (Open / Close / High / Low) mirror d3fc's convention:
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
    const { columns, numRows, columnSlots, groupBy, splitBy } = input;

    const openBase = columnSlots[0] || "";
    if (!openBase) return EMPTY;
    const closeBase = columnSlots[1] || "";
    const highBase = columnSlots[2] || "";
    const lowBase = columnSlots[3] || "";

    // Split-prefix resolution. Each split provides its own Open column
    // (required) and may provide any subset of Close / High / Low.
    const splitPrefixes: string[] = [];
    if (splitBy.length > 0) {
        const aggregates = [openBase];
        if (closeBase) aggregates.push(closeBase);
        if (highBase) aggregates.push(highBase);
        if (lowBase) aggregates.push(lowBase);
        for (const g of buildSplitGroups(columns, [openBase], aggregates)) {
            if (g.colNames.has(openBase)) splitPrefixes.push(g.prefix);
        }
        if (splitPrefixes.length === 0) splitPrefixes.push("");
    } else {
        splitPrefixes.push("");
    }

    const { rowPaths, numCategories, rowOffset } = resolveCategoryAxis(
        columns,
        numRows,
        groupBy.length,
    );
    if (numCategories === 0) {
        return {
            ...EMPTY,
            splitPrefixes,
            rowPaths,
            rowOffset,
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

    const { slotWidth, halfWidth } = computeSlotGeometry(P);

    // Per-series column references (resolved once per frame, not per
    // row). For each split, the candle value reads come out of typed
    // arrays with no repeated map lookups.
    const seriesCols: {
        openCol: Float32Array | Int32Array;
        closeCol: Float32Array | Int32Array | null;
        highCol: Float32Array | Int32Array | null;
        lowCol: Float32Array | Int32Array | null;
        openValid: Uint8Array | undefined;
        closeValid: Uint8Array | undefined;
        highValid: Uint8Array | undefined;
        lowValid: Uint8Array | undefined;
    }[] = [];
    for (let p = 0; p < P; p++) {
        const prefix = splitPrefixes[p];
        const nm = (base: string) =>
            prefix === "" ? base : `${prefix}|${base}`;
        const openCol = columns.get(nm(openBase));
        if (!openCol?.values) {
            // Skip this split if Open is unresolvable.
            seriesCols.push({
                openCol: new Float32Array(0),
                closeCol: null,
                highCol: null,
                lowCol: null,
                openValid: undefined,
                closeValid: undefined,
                highValid: undefined,
                lowValid: undefined,
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
            openValid: openCol.valid,
            closeValid: closeCol?.valid,
            highValid: highCol?.valid,
            lowValid: lowCol?.valid,
        });
    }

    const candles: CandleRecord[] = [];
    let yMin = Infinity;
    let yMax = -Infinity;

    const N = numCategories;

    const isValid = (valid: Uint8Array | undefined, row: number): boolean => {
        if (!valid) return true;
        return !!((valid[row >> 3] >> (row & 7)) & 1);
    };

    for (let p = 0; p < P; p++) {
        const sc = seriesCols[p];
        if (sc.openCol.length === 0) continue;

        for (let catI = 0; catI < N; catI++) {
            const row = catI + rowOffset;
            if (!isValid(sc.openValid, row)) continue;
            const open = sc.openCol[row] as number;
            if (!isFinite(open)) continue;

            // d3fc's getNextOpen fallback: use the next row's open as
            // close; on the last row, fall back to own open (yielding a
            // degenerate zero-height candle, as in d3fc).
            let close: number;
            if (sc.closeCol && isValid(sc.closeValid, row)) {
                const v = sc.closeCol[row] as number;
                close = isFinite(v) ? v : open;
            } else {
                const nextRow = catI < N - 1 ? catI + 1 + rowOffset : row;
                if (isValid(sc.openValid, nextRow)) {
                    const v = sc.openCol[nextRow] as number;
                    close = isFinite(v) ? v : open;
                } else {
                    close = open;
                }
            }

            let high: number;
            if (sc.highCol && isValid(sc.highValid, row)) {
                const v = sc.highCol[row] as number;
                high = isFinite(v) ? v : Math.max(open, close);
            } else {
                high = Math.max(open, close);
            }

            let low: number;
            if (sc.lowCol && isValid(sc.lowValid, row)) {
                const v = sc.lowCol[row] as number;
                low = isFinite(v) ? v : Math.min(open, close);
            } else {
                low = Math.min(open, close);
            }

            const xCenter = slotCenter(catI, p, P, slotWidth);
            const isUp = close >= open;
            candles.push({
                catIdx: catI,
                splitIdx: p,
                seriesId: p,
                xCenter,
                halfWidth,
                open,
                close,
                high,
                low,
                isUp,
            });

            if (low < yMin) yMin = low;
            if (high > yMax) yMax = high;
        }
    }

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
        series,
        candles,
        yDomain: { min: yMin, max: yMax },
    };
}
