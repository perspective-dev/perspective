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
import {
    resolveChartType,
    resolveStack,
    resolveAltAxis,
    type ChartType,
    type ColumnChartConfig,
} from "./series-type";

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

/**
 * Logical bar/area record. Synthesized on demand from {@link BarColumns}
 * via {@link readBarRecord} for tooltip / hover paths. The pipeline never
 * materializes these — see `BarColumns` for the columnar storage that
 * replaces the legacy `SeriesChartRecord[]`.
 */
export interface SeriesChartRecord {
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

    /**
     * `"bar"` quads or `"area"` strip segments both stack via this record.
     */
    chartType: "bar" | "area";
}

export const BAR_TYPE_BAR = 0;
export const BAR_TYPE_AREA = 1;

/**
 * Columnar storage for the bar/area record set. Replaces the legacy
 * `SeriesChartRecord[]` to avoid per-record POJO allocation at scale —
 * with N×M×P potentially in the millions, the array-of-objects layout
 * was the dominant build-time GC pressure.
 *
 * Records are appended in `(catIdx, aggIdx, splitIdx)` lexicographic
 * order — the outer category loop guarantees `catIdx` is monotonically
 * non-decreasing, which the renderer / hit-test use for binary-search
 * narrowing.
 *
 * `count` is the active record count; the underlying typed arrays may
 * be over-allocated for capacity reuse across builds.
 */
/**
 * Compact columnar storage for the bar/area record set.
 *
 * Three fields the prior schema carried have been dropped because
 * they're cheaply derivable at hover time:
 *   - `aggIdx`    ← `seriesId / splitCount` (integer division)
 *   - `splitIdx`  ← `seriesId % splitCount`
 *   - `value`     ← `samples[catIdx * S + seriesId]`
 *
 * Per-cell write count drops from 11 to 8 (~27% fewer typed-array
 * stores) and per-record memory drops from 58 B to 42 B (~28% lower
 * footprint at scale). `chartType` is kept (1 B / record) — it's
 * read in tight loops in the render and hit-test paths and a string
 * dispatch via `_series[]` would be slower than the byte compare.
 */
export interface BarColumns {
    count: number;
    catIdx: Int32Array;
    seriesId: Int32Array;

    /**
     * 0 = left axis, 1 = right axis.
     */
    axis: Uint8Array;

    /**
     * {@link BAR_TYPE_BAR} | {@link BAR_TYPE_AREA}.
     */
    chartType: Uint8Array;
    xCenter: Float64Array;
    halfWidth: Float64Array;
    y0: Float64Array;
    y1: Float64Array;
}

export function emptyBarColumns(): BarColumns {
    return {
        count: 0,
        catIdx: new Int32Array(0),
        seriesId: new Int32Array(0),
        axis: new Uint8Array(0),
        chartType: new Uint8Array(0),
        xCenter: new Float64Array(0),
        halfWidth: new Float64Array(0),
        y0: new Float64Array(0),
        y1: new Float64Array(0),
    };
}

/**
 * Reuse `prev`'s typed arrays when capacity is sufficient, else allocate
 * fresh. Resets `count` to 0 either way; pipeline writes from index 0.
 */
export function ensureBarColumnsCapacity(
    prev: BarColumns | null,
    capacity: number,
): BarColumns {
    if (prev && prev.catIdx.length >= capacity) {
        prev.count = 0;
        return prev;
    }

    return {
        count: 0,
        catIdx: new Int32Array(capacity),
        seriesId: new Int32Array(capacity),
        axis: new Uint8Array(capacity),
        chartType: new Uint8Array(capacity),
        xCenter: new Float64Array(capacity),
        halfWidth: new Float64Array(capacity),
        y0: new Float64Array(capacity),
        y1: new Float64Array(capacity),
    };
}

/**
 * Synthesize a {@link SeriesChartRecord} POJO for record `i`. Used by
 * tooltip / hover paths that hand out a single record reference; not
 * called in any frame-rate hot loop.
 *
 * `splitCount` is `splitPrefixes.length` from the build result (= `P`
 * in pipeline notation). `samples` + `numSeries` recover the raw
 * value from the unstacked sample grid; `samples[catIdx * S + sid]`
 * always carries the same value the pipeline saw when emitting the
 * record (both writes share the same `v` source).
 */
export function readBarRecord(
    cols: BarColumns,
    i: number,
    splitCount: number,
    samples: Float32Array,
    numSeries: number,
): SeriesChartRecord {
    const sid = cols.seriesId[i];
    const ci = cols.catIdx[i];
    return {
        catIdx: ci,
        aggIdx: Math.floor(sid / splitCount),
        splitIdx: sid % splitCount,
        seriesId: sid,
        xCenter: cols.xCenter[i],
        halfWidth: cols.halfWidth[i],
        y0: cols.y0[i],
        y1: cols.y1[i],
        value: samples[ci * numSeries + sid],
        axis: cols.axis[i] as 0 | 1,
        chartType: cols.chartType[i] === BAR_TYPE_BAR ? "bar" : "area",
    };
}

/**
 * Reusable Float64 scratch — chart owns one for `posStack` and one for
 * `negStack`. Pipeline zero-fills the active prefix on entry.
 */
export function ensureFloat64Scratch(
    prev: Float64Array | null,
    capacity: number,
): Float64Array {
    if (prev && prev.length >= capacity) {
        return prev;
    }

    return new Float64Array(Math.max(capacity, prev?.length ?? 0));
}

export interface SeriesPipelineInput {
    columns: ColumnDataMap;
    numRows: number;
    columnSlots: (string | null)[];
    groupBy: string[];
    splitBy: string[];

    /**
     * Source-column types for `group_by` columns (table.schema() merged
     * with view.expression_schema()). Used to (a) stringify non-string
     * row-path levels and (b) decide between category and numeric axis
     * mode for single-level group_bys.
     */
    groupByTypes: Record<string, string>;
    columnsConfig: Record<string, ColumnChartConfig> | undefined;

    /**
     * Plugin-scoped default glyph when a column has no explicit entry.
     */
    defaultChartType?: ChartType;

    /**
     * Plugin-config knobs consumed by the build pipeline. Pulled from
     * the chart impl's `_pluginConfig` (sourced from the host's
     * `plugin_config_schema` / `restore({ plugin_config })`):
     *
     *  - `autoAltYAxis` — auto-split aggregates onto a secondary Y
     *    axis when their magnitude ratio exceeds
     *    `DUAL_Y_RATIO_THRESHOLD`. Replaces the `AUTO_ALT_Y_AXIS`
     *    compile-time toggle.
     *  - `bandInnerFrac` / `barInnerPad` — band-slot geometry forwarded
     *    to `computeSlotGeometry`. Replace the `BAND_INNER_FRAC` /
     *    `BAR_INNER_PAD` constants.
     */
    autoAltYAxis: boolean;
    bandInnerFrac: number;
    barInnerPad: number;

    /**
     * Anchor value-axis extents to zero. When `true` (bar / area
     * default), `leftDomain` / `rightDomain` are guaranteed to enclose
     * `0` so bars and areas render against their natural baseline.
     * When `false` (line / scatter default), the domain is the raw
     * `min`/`max` of the data — the axis tightens around the visible
     * variation. Maps directly to `PluginConfig.include_zero`.
     */
    includeZero: boolean;

    /**
     * Reusable scratch — pipeline writes records into these in place
     * and zero-fills the stack ladder. Pass the previous build's
     * outputs to amortize allocation across data reloads.
     */
    scratchBars?: BarColumns | null;
    scratchPosStack?: Float64Array | null;
    scratchNegStack?: Float64Array | null;
}

export type { NumericCategoryDomain };

export interface SeriesPipelineResult {
    aggregates: string[];
    splitPrefixes: string[];
    rowPaths: CategoricalLevel[];
    numCategories: number;
    rowOffset: number;

    /**
     * Axis mode discriminator. `category` is the default (zero or
     * many group_by levels, or a single string/boolean level). `numeric`
     * fires for a single non-string non-boolean group_by — bars are
     * positioned by the underlying data value rather than logical
     * category index.
     */
    axisMode: AxisMode;

    /**
     * Populated only when `axisMode.mode === "numeric"`.
     */
    numericCategoryDomain: NumericCategoryDomain | null;

    /**
     * Per-category X coordinate in real data units. Populated only in
     * numeric axis mode — `null` in category mode where catIdx itself
     * is the position. Indexed by `catIdx` (0..numCategories-1).
     */
    categoryPositions: Float64Array | null;
    series: SeriesInfo[];

    /**
     * Columnar bar/area records, one per (catIdx, agg, split) for series
     * where `stack === true && chartType in ["bar", "area"]` (stacked) or
     * `chartType in ["bar", "area"]` with non-zero value (unstacked).
     */
    bars: BarColumns;

    /**
     * Reusable scratch passthrough — these own the stack ladder typed
     * arrays so the next build can reuse capacity.
     */
    posStack: Float64Array | null;
    negStack: Float64Array | null;

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
 * Pure pipeline: turn a raw `ColumnDataMap` into (a) columnar stacked
 * bar/area records and (b) an unstacked `samples` grid for line/scatter
 * glyphs plus non-stacking bar/area series. Holds row_path data as
 * zero-copy views (no materialization of category strings).
 *
 * Automatically splits aggregates across a secondary Y axis when their
 * extents differ by more than {@link DUAL_Y_RATIO_THRESHOLD}×.
 */
export function buildSeriesPipeline(
    input: SeriesPipelineInput,
): SeriesPipelineResult {
    const {
        columns,
        numRows,
        columnSlots,
        groupBy,
        splitBy,
        groupByTypes,
        columnsConfig,
        defaultChartType,
        autoAltYAxis,
        bandInnerFrac,
        barInnerPad,
        includeZero,
        scratchBars,
        scratchPosStack,
        scratchNegStack,
    } = input;

    const axisMode = resolveAxisMode(groupBy, groupByTypes);
    const empty: SeriesPipelineResult = {
        aggregates: [],
        splitPrefixes: [],
        rowPaths: [],
        numCategories: 0,
        rowOffset: 0,
        axisMode,
        numericCategoryDomain: null,
        categoryPositions: null,
        series: [],
        bars: emptyBarColumns(),
        posStack: scratchPosStack ?? null,
        negStack: scratchNegStack ?? null,
        samples: new Float32Array(0),
        sampleValid: new Uint8Array(0),
        leftDomain: { min: 0, max: 0 },
        rightDomain: null,
        hasRightAxis: false,
    };

    const aggregates = columnSlots.filter((s): s is string => !!s);
    if (aggregates.length === 0) {
        return empty;
    }

    const splitPrefixes: string[] = [];
    if (splitBy.length > 0) {
        for (const g of buildSplitGroups(columns, [], aggregates)) {
            if (g.colNames.size > 0) {
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

    // `aggExtents` accumulates per-aggregate value ranges for the
    // dual-axis split heuristic below. `includeZero` decides whether
    // the range starts anchored at zero (bar / area: the bar grows
    // from the zero baseline, so it's part of the natural extent) or
    // open (line / scatter: extent is the raw `min`..`max`).
    const aggExtents: { min: number; max: number }[] = [];
    for (let k = 0; k < M; k++) {
        aggExtents.push(
            includeZero
                ? { min: 0, max: 0 }
                : { min: Infinity, max: -Infinity },
        );
    }

    const N = numCategories;
    const S = series.length;

    // Stacking ladder, keyed by (catIdx, aggIdx). Reuse chart-owned
    // scratch when sized; else allocate. Active prefix is zero-filled.
    const stackLen = N * M;
    const posStack = ensureFloat64Scratch(scratchPosStack ?? null, stackLen);
    const negStack = ensureFloat64Scratch(scratchNegStack ?? null, stackLen);
    posStack.fill(0, 0, stackLen);
    negStack.fill(0, 0, stackLen);

    const samples = new Float32Array(N * S);
    const sampleValid = new Uint8Array((N * S + 7) >> 3);

    // Numeric-mode category positions: real data values from __ROW_PATH_0__.
    // null in category mode (catIdx is the position).
    let categoryPositions: Float64Array | null = null;
    let numericCategoryDomain: NumericCategoryDomain | null = null;
    let numericBandWidth = 1;
    if (axisMode.mode === "numeric" && N > 0) {
        const rp = columns.get("__ROW_PATH_0__");
        const resolved = resolveNumericCategoryDomain(
            rp?.values,
            N,
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

    // Per-band slot geometry — `computeSlotGeometry` returns values in
    // band-relative units (band width = 1). In numeric mode scale by
    // the data-unit band width derived above.
    const baseSlot = computeSlotGeometry(M, bandInnerFrac, barInnerPad);
    const slotWidth = baseSlot.slotWidth * numericBandWidth;
    const halfWidth = baseSlot.halfWidth * numericBandWidth;

    // Pre-build per-aggregate slot offsets. The legacy form recomputed
    // `(k - (M - 1) / 2) * slotWidth` for every (catI, k, p) — N×M×P
    // FMA chains in the inner loop. Hoist to a length-M lookup.
    const slotOffsets = new Float64Array(M);
    const halfWidthOffset = (M - 1) / 2;
    for (let k = 0; k < M; k++) {
        slotOffsets[k] = (k - halfWidthOffset) * slotWidth;
    }

    // Pre-resolve the (k, p) → column reference + valid mask. The legacy
    // form built the column name string and called `columns.get(...)` for
    // every (catI, k, p) cell — N×M×P string allocs + Map lookups, which
    // dominates for dense data. Hoist outside the row loop to an
    // M*P-shaped flat array of (values, valid) tuples.
    const colValues: (ArrayLike<unknown> | null)[] = new Array(M * P);
    const colValid: (Uint8Array | null)[] = new Array(M * P);
    for (let k = 0; k < M; k++) {
        const aggName = aggregates[k];
        for (let p = 0; p < P; p++) {
            const splitKey = splitPrefixes[p];
            const colName =
                splitKey === "" ? aggName : `${splitKey}|${aggName}`;
            const col = columns.get(colName);
            const idx = k * P + p;
            colValues[idx] = col?.values ?? null;
            colValid[idx] = col?.valid ?? null;
        }
    }

    // Pre-allocate columnar bar storage at N*M*P upper bound. The
    // pipeline emits at most one record per (cat, agg, split) cell;
    // `bars.count` tracks the active prefix.
    const barCap = N * M * P;
    const bars = ensureBarColumnsCapacity(scratchBars ?? null, barCap);
    let barWrite = 0;

    for (let catI = 0; catI < N; catI++) {
        const row = catI + rowOffset;

        // Hoist the category center — same value across all (k, p) for
        // the current catI.
        const catCenter = categoryPositions ? categoryPositions[catI] : catI;

        for (let k = 0; k < M; k++) {
            const slotOffset = slotOffsets[k];
            const xCenter = catCenter + slotOffset;
            const ext = aggExtents[k];

            for (let p = 0; p < P; p++) {
                const seriesId = k * P + p;
                const s = series[seriesId];
                const colIdx = k * P + p;
                const values = colValues[colIdx];
                if (!values) {
                    continue;
                }

                const valid = colValid[colIdx];
                if (valid) {
                    const bit = (valid[row >> 3] >> (row & 7)) & 1;
                    if (!bit) {
                        continue;
                    }
                }

                const v = values[row] as number;
                if (!isFinite(v)) {
                    continue;
                }

                // Record the raw value in the unstacked grid for every
                // glyph that needs it (line, scatter, non-stacking bar/area).
                const sampleIdx = catI * S + seriesId;
                samples[sampleIdx] = v;
                setValidBit(sampleValid, sampleIdx);

                // Stacking-glyph path: emit a record with running y0/y1.
                if (
                    (s.chartType === "bar" || s.chartType === "area") &&
                    s.stack
                ) {
                    if (v === 0) {
                        continue;
                    }

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

                    if (y0 < ext.min) {
                        ext.min = y0;
                    }

                    if (y1 < ext.min) {
                        ext.min = y1;
                    }

                    if (y0 > ext.max) {
                        ext.max = y0;
                    }

                    if (y1 > ext.max) {
                        ext.max = y1;
                    }

                    bars.catIdx[barWrite] = catI;
                    bars.seriesId[barWrite] = seriesId;
                    bars.axis[barWrite] = 0;
                    bars.chartType[barWrite] =
                        s.chartType === "bar" ? BAR_TYPE_BAR : BAR_TYPE_AREA;
                    bars.xCenter[barWrite] = xCenter;
                    bars.halfWidth[barWrite] = halfWidth;
                    bars.y0[barWrite] = y0;
                    bars.y1[barWrite] = y1;
                    barWrite++;
                } else {
                    // Non-stacking: extend extents by raw value against zero
                    // baseline so the axis still encloses line/scatter data.
                    if (v < ext.min) {
                        ext.min = v;
                    }

                    if (v > ext.max) {
                        ext.max = v;
                    }

                    if (includeZero) {
                        if (0 < ext.min) {
                            ext.min = 0;
                        }

                        if (0 > ext.max) {
                            ext.max = 0;
                        }
                    }

                    // Non-stacking bar/area still needs a record so the
                    // glyph draw call has a concrete rect. Unstacked: y0=0,
                    // y1=v.
                    if (s.chartType === "bar" || s.chartType === "area") {
                        if (v === 0) {
                            continue;
                        }

                        bars.catIdx[barWrite] = catI;
                        bars.seriesId[barWrite] = seriesId;
                        bars.axis[barWrite] = 0;
                        bars.chartType[barWrite] =
                            s.chartType === "bar"
                                ? BAR_TYPE_BAR
                                : BAR_TYPE_AREA;
                        bars.xCenter[barWrite] = xCenter;
                        bars.halfWidth[barWrite] = halfWidth;
                        bars.y0[barWrite] = 0;
                        bars.y1[barWrite] = v;
                        barWrite++;
                    }
                }
            }
        }
    }

    bars.count = barWrite;

    let hasRightAxis = false;
    if (autoAltYAxis && M >= 2) {
        const extents: number[] = new Array(M);
        let maxExt = 0;
        let minExt = Infinity;
        for (let k = 0; k < M; k++) {
            const e = aggExtents[k];
            const ae = Math.max(Math.abs(e.min), Math.abs(e.max), 1e-12);
            extents[k] = ae;
            if (ae > maxExt) {
                maxExt = ae;
            }

            if (ae < minExt) {
                minExt = ae;
            }
        }

        if (maxExt / minExt > DUAL_Y_RATIO_THRESHOLD) {
            const threshold = maxExt / Math.sqrt(DUAL_Y_RATIO_THRESHOLD);
            for (let k = 0; k < M; k++) {
                const onRight = extents[k] < threshold;
                if (onRight) {
                    for (const s of series) {
                        if (s.aggIdx === k) {
                            s.axis = 1;
                        }
                    }
                }
            }

            // Propagate axis assignment into bar storage.
            for (let i = 0; i < bars.count; i++) {
                bars.axis[i] = series[bars.seriesId[i]].axis;
            }

            hasRightAxis = series.some((s) => s.axis === 1);
        }
    }

    // Per-column `alt_axis` override — always wins over the auto
    // split. Runs unconditionally so it works even when
    // `autoAltYAxis` is off or there's only a single aggregate.
    let forcedRight = false;
    for (let k = 0; k < M; k++) {
        if (resolveAltAxis(aggregates[k], columnsConfig)) {
            for (const s of series) {
                if (s.aggIdx === k) {
                    s.axis = 1;
                    forcedRight = true;
                }
            }
        }
    }

    if (forcedRight) {
        for (let i = 0; i < bars.count; i++) {
            bars.axis[i] = series[bars.seriesId[i]].axis;
        }

        hasRightAxis = true;
    }

    // Axis domains: stack records contribute y0/y1; non-stacking
    // samples contribute raw values. When `includeZero` is true the
    // domain starts anchored at zero so bar / area glyphs always have
    // their baseline in view; when false the domain opens to
    // `[Infinity, -Infinity]` and closes around the data extent.
    const leftExtent = includeZero
        ? { min: 0, max: 0 }
        : { min: Infinity, max: -Infinity };
    const rightExtent = includeZero
        ? { min: 0, max: 0 }
        : { min: Infinity, max: -Infinity };
    for (let i = 0; i < bars.count; i++) {
        const ext = bars.axis[i] === 0 ? leftExtent : rightExtent;
        const y0 = bars.y0[i];
        const y1 = bars.y1[i];
        if (y0 < ext.min) {
            ext.min = y0;
        }

        if (y1 < ext.min) {
            ext.min = y1;
        }

        if (y0 > ext.max) {
            ext.max = y0;
        }

        if (y1 > ext.max) {
            ext.max = y1;
        }
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
            if (v < ext.min) {
                ext.min = v;
            }

            if (v > ext.max) {
                ext.max = v;
            }
        }
    }

    // Empty-data fallback: an untouched extent still sits at its
    // sentinel state. `includeZero=true` initializes to `{0, 0}`;
    // `includeZero=false` initializes to `{Infinity, -Infinity}`.
    // Either way, collapse to `{0, 1}` so axis rendering has a finite
    // domain to work with.
    const leftEmpty =
        !isFinite(leftExtent.min) ||
        !isFinite(leftExtent.max) ||
        (leftExtent.min === 0 && leftExtent.max === 0);
    if (leftEmpty) {
        leftExtent.min = 0;
        leftExtent.max = 1;
    }

    const rightEmpty =
        !isFinite(rightExtent.min) ||
        !isFinite(rightExtent.max) ||
        (rightExtent.min === 0 && rightExtent.max === 0);
    const rightDomain: { min: number; max: number } | null = hasRightAxis
        ? rightEmpty
            ? { min: 0, max: 1 }
            : rightExtent
        : null;

    return {
        aggregates,
        splitPrefixes,
        rowPaths,
        numCategories,
        rowOffset,
        axisMode,
        numericCategoryDomain,
        categoryPositions,
        series,
        bars,
        posStack,
        negStack,
        samples,
        sampleValid,
        leftDomain: leftExtent,
        rightDomain,
        hasRightAxis,
    };
}
