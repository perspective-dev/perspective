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
import {
    resolveChartType,
    resolveStack,
    type ChartType,
    type ColumnChartConfig,
} from "./chart-type";

const DUAL_Y_RATIO_THRESHOLD = 50;

export interface SeriesInfo {
    seriesId: number;
    aggIdx: number;
    splitIdx: number;
    aggName: string;
    splitKey: string;
    label: string;
    color: [number, number, number];
    axis: 0 | 1;
    chartType: ChartType;
    stack: boolean;
}

export interface BarRecord {
    catIdx: number;
    aggIdx: number;
    splitIdx: number;
    seriesId: number;
    xCenter: number;
    halfWidth: number;
    y0: number;
    y1: number;
    value: number;
    axis: 0 | 1;
    /** `"bar"` quads or `"area"` strip segments both stack via this record. */
    chartType: "bar" | "area";
}

export interface BarPipelineInput {
    columns: ColumnDataMap;
    numRows: number;
    columnSlots: (string | null)[];
    groupBy: string[];
    splitBy: string[];
    columnsConfig: Record<string, ColumnChartConfig> | undefined;
    /** Plugin-scoped default glyph when a column has no explicit entry. */
    defaultChartType?: ChartType;
}

export interface BarPipelineResult {
    aggregates: string[];
    splitPrefixes: string[];
    rowPaths: CategoricalLevel[];
    numCategories: number;
    rowOffset: number;
    series: SeriesInfo[];

    /**
     * Stacked records, one per (catIdx, agg, split) for series where
     * `stack === true && chartType in ["bar", "area"]`. Consumed by the bar
     * and area glyphs; areas draw their strip segments from the same y0/y1
     * ladder as bars.
     */
    bars: BarRecord[];

    /**
     * Unstacked sample grid: `samples[catIdx * S + seriesId]` is the raw
     * value for that cell. Only valid for non-stacking series (or for
     * stacking series when you need the raw, pre-stack value); the
     * corresponding bit in `sampleValid` indicates whether the cell carries
     * data. `S === series.length`.
     */
    samples: Float32Array;
    sampleValid: Uint8Array;

    leftDomain: { min: number; max: number };
    rightDomain: { min: number; max: number } | null;
    hasRightAxis: boolean;
}

function setValidBit(valid: Uint8Array, idx: number): void {
    valid[idx >> 3] |= 1 << (idx & 7);
}

/**
 * Pure pipeline: turn a raw `ColumnDataMap` into (a) stacked bar/area
 * records and (b) an unstacked `samples` grid for line/scatter glyphs
 * plus non-stacking bar/area series. Holds row_path data as zero-copy
 * views (no materialization of category strings).
 *
 * Automatically splits aggregates across a secondary Y axis when their
 * extents differ by more than {@link DUAL_Y_RATIO_THRESHOLD}×.
 */
export function buildBarPipeline(input: BarPipelineInput): BarPipelineResult {
    const {
        columns,
        numRows,
        columnSlots,
        groupBy,
        splitBy,
        columnsConfig,
        defaultChartType,
    } = input;

    const empty: BarPipelineResult = {
        aggregates: [],
        splitPrefixes: [],
        rowPaths: [],
        numCategories: 0,
        rowOffset: 0,
        series: [],
        bars: [],
        samples: new Float32Array(0),
        sampleValid: new Uint8Array(0),
        leftDomain: { min: 0, max: 0 },
        rightDomain: null,
        hasRightAxis: false,
    };

    const aggregates = columnSlots.filter((s): s is string => !!s);
    if (aggregates.length === 0) return empty;

    const splitPrefixes: string[] = [];
    if (splitBy.length > 0) {
        for (const g of buildSplitGroups(columns, [], aggregates)) {
            if (g.colNames.size > 0) splitPrefixes.push(g.prefix);
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
            ...empty,
            aggregates,
            splitPrefixes,
            rowPaths,
            rowOffset,
        };
    }

    const series: SeriesInfo[] = [];
    const M = aggregates.length;
    const P = splitPrefixes.length;
    for (let k = 0; k < M; k++) {
        for (let p = 0; p < P; p++) {
            const aggName = aggregates[k];
            const splitKey = splitPrefixes[p];
            const label =
                splitKey === ""
                    ? aggName
                    : `${splitKey}${M > 1 ? ` | ${aggName}` : ""}`;
            const chartType = resolveChartType(
                aggName,
                columnsConfig,
                defaultChartType,
            );
            const stack = resolveStack(aggName, chartType, columnsConfig);
            series.push({
                seriesId: k * P + p,
                aggIdx: k,
                splitIdx: p,
                aggName,
                splitKey,
                label,
                color: [0.5, 0.5, 0.5],
                axis: 0,
                chartType,
                stack,
            });
        }
    }

    const aggExtents: { min: number; max: number }[] = [];
    for (let k = 0; k < M; k++) aggExtents.push({ min: 0, max: 0 });

    const N = numCategories;
    const S = series.length;
    // Stacking ladder, keyed by (catIdx, aggIdx). Only stacking series
    // contribute; non-stacking series still extend aggExtents for axis
    // domain computation but don't advance the stack.
    const posStack = new Float64Array(N * M);
    const negStack = new Float64Array(N * M);

    const samples = new Float32Array(N * S);
    const sampleValid = new Uint8Array((N * S + 7) >> 3);

    const { slotWidth, halfWidth } = computeSlotGeometry(M);

    const bars: BarRecord[] = [];
    for (let catI = 0; catI < N; catI++) {
        const row = catI + rowOffset;
        for (let k = 0; k < M; k++) {
            for (let p = 0; p < P; p++) {
                const seriesId = k * P + p;
                const s = series[seriesId];
                const aggName = aggregates[k];
                const splitKey = splitPrefixes[p];
                const colName =
                    splitKey === "" ? aggName : `${splitKey}|${aggName}`;
                const col = columns.get(colName);
                if (!col?.values) continue;
                if (col.valid) {
                    const bit = (col.valid[row >> 3] >> (row & 7)) & 1;
                    if (!bit) continue;
                }
                const v = col.values[row] as number;
                if (!isFinite(v)) continue;

                // Record the raw value in the unstacked grid for every
                // glyph that needs it (line, scatter, non-stacking bar/area).
                const sampleIdx = catI * S + seriesId;
                samples[sampleIdx] = v;
                setValidBit(sampleValid, sampleIdx);

                const ext = aggExtents[k];

                // Stacking-glyph path: emit a BarRecord with running y0/y1.
                if (
                    (s.chartType === "bar" || s.chartType === "area") &&
                    s.stack
                ) {
                    if (v === 0) continue;

                    const stackIdx = catI * M + k;
                    let y0: number;
                    let y1: number;
                    if (v >= 0) {
                        y0 = posStack[stackIdx];
                        y1 = y0 + v;
                        posStack[stackIdx] = y1;
                    } else {
                        y0 = negStack[stackIdx];
                        y1 = y0 + v;
                        negStack[stackIdx] = y1;
                    }

                    if (y0 < ext.min) ext.min = y0;
                    if (y1 < ext.min) ext.min = y1;
                    if (y0 > ext.max) ext.max = y0;
                    if (y1 > ext.max) ext.max = y1;

                    const xCenter = slotCenter(catI, k, M, slotWidth);

                    bars.push({
                        catIdx: catI,
                        aggIdx: k,
                        splitIdx: p,
                        seriesId,
                        xCenter,
                        halfWidth,
                        y0,
                        y1,
                        value: v,
                        axis: 0,
                        chartType: s.chartType,
                    });
                } else {
                    // Non-stacking: extend extents by raw value against zero
                    // baseline so the axis still encloses line/scatter data.
                    if (v < ext.min) ext.min = v;
                    if (v > ext.max) ext.max = v;
                    if (0 < ext.min) ext.min = 0;
                    if (0 > ext.max) ext.max = 0;

                    // Non-stacking bar/area still needs a BarRecord so the
                    // glyph draw call has a concrete rect. Unstacked: y0=0,
                    // y1=v.
                    if (s.chartType === "bar" || s.chartType === "area") {
                        if (v === 0) continue;
                        const xCenter = slotCenter(catI, k, M, slotWidth);
                        bars.push({
                            catIdx: catI,
                            aggIdx: k,
                            splitIdx: p,
                            seriesId,
                            xCenter,
                            halfWidth,
                            y0: 0,
                            y1: v,
                            value: v,
                            axis: 0,
                            chartType: s.chartType,
                        });
                    }
                }
            }
        }
    }

    let hasRightAxis = false;
    if (M >= 2) {
        const extents = aggExtents.map((e) =>
            Math.max(Math.abs(e.min), Math.abs(e.max), 1e-12),
        );
        const maxExt = Math.max(...extents);
        const minExt = Math.min(...extents);
        if (maxExt / minExt > DUAL_Y_RATIO_THRESHOLD) {
            const threshold = maxExt / Math.sqrt(DUAL_Y_RATIO_THRESHOLD);
            for (let k = 0; k < M; k++) {
                const onRight = extents[k] < threshold;
                if (onRight) {
                    for (const s of series) {
                        if (s.aggIdx === k) s.axis = 1;
                    }
                }
            }
            for (const b of bars) {
                b.axis = series[b.seriesId].axis;
            }
            hasRightAxis = series.some((s) => s.axis === 1);
        }
    }

    // Axis domains: stack records contribute y0/y1; non-stacking samples
    // contribute raw values against the zero baseline.
    const leftExtent = { min: 0, max: 0 };
    const rightExtent = { min: 0, max: 0 };
    for (const b of bars) {
        const ext = b.axis === 0 ? leftExtent : rightExtent;
        if (b.y0 < ext.min) ext.min = b.y0;
        if (b.y1 < ext.min) ext.min = b.y1;
        if (b.y0 > ext.max) ext.max = b.y0;
        if (b.y1 > ext.max) ext.max = b.y1;
    }
    for (let seriesId = 0; seriesId < S; seriesId++) {
        const s = series[seriesId];
        if (s.stack && (s.chartType === "bar" || s.chartType === "area")) {
            continue; // already counted via bars
        }
        const ext = s.axis === 0 ? leftExtent : rightExtent;
        for (let catI = 0; catI < N; catI++) {
            const sampleIdx = catI * S + seriesId;
            if (!((sampleValid[sampleIdx >> 3] >> (sampleIdx & 7)) & 1)) {
                continue;
            }
            const v = samples[sampleIdx];
            if (v < ext.min) ext.min = v;
            if (v > ext.max) ext.max = v;
        }
    }
    if (leftExtent.min === 0 && leftExtent.max === 0) leftExtent.max = 1;

    const rightDomain: { min: number; max: number } | null = hasRightAxis
        ? rightExtent.min === 0 && rightExtent.max === 0
            ? { min: 0, max: 1 }
            : rightExtent
        : null;

    return {
        aggregates,
        splitPrefixes,
        rowPaths,
        numCategories,
        rowOffset,
        series,
        bars,
        samples,
        sampleValid,
        leftDomain: leftExtent,
        rightDomain,
        hasRightAxis,
    };
}
