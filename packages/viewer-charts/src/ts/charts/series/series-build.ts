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
import type {
    CategoricalDomain,
    CategoricalLevel,
} from "../../axis/categorical-axis";
import {
    resolveAxisMode,
    resolveCategoryAxis,
    resolveNumericCategoryDomain,
    resolveValueCategoryDomain,
    type AxisMode,
    type NumericCategoryDomain,
    type ValueCategoryColumn,
} from "../common/category-axis-resolver";
import { computeSlotGeometry } from "../common/band-layout";
import {
    resolveChartType,
    resolveStack,
    resolveAltAxis,
    resolveInterpolate,
    type ChartType,
    type ColumnChartConfig,
    type InterpolateMode,
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

    /**
     * First / last category index this series contributes data to, in
     * the post-Pass-2 sample grid. For line+any mode and area+solid:
     * every cell in `[start, end]` has a value (real or synthesized).
     * For area+skip: `[start, end]` is the real-data extent; interior
     * cells with `sampleValid=0` are gaps. `start = -1` (with `end = -1`)
     * means the series has no real samples — downstream skips it.
     */
    start: number;
    end: number;

    /**
     * Resolved interpolation mode for this aggregate. The build
     * pipeline reads it to decide whether Pass 2 runs for area
     * (and which fills to apply); the line glyph reads it at draw
     * time to set `u_interp_alpha`. Always one of the three modes;
     * never the legacy boolean form.
     */
    interpolateMode: InterpolateMode;
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

    /**
     * Per-axis-side value mode discriminator. `"category"` fires when
     * every aggregate on that side is post-aggregation `string`-typed
     * (all-or-nothing rule). Bar y0/y1 then hold dictionary slot
     * indices and the chrome overlay paints a categorical axis on
     * that side. `null` for the alt side when there are no series
     * pinned to alt.
     */
    leftValueAxisMode: "numeric" | "category";
    rightValueAxisMode: "numeric" | "category" | null;

    /**
     * Single-level `CategoricalDomain` shared across every aggregate
     * on the corresponding side. Set only when that side's mode is
     * `"category"`; the chrome renderer in `series-render` materializes
     * the side's `BarCategoryAxis` from this.
     */
    leftValueCategoryDomain: CategoricalDomain | null;
    rightValueCategoryDomain: CategoricalDomain | null;
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
        leftValueAxisMode: "numeric",
        rightValueAxisMode: null,
        leftValueCategoryDomain: null,
        rightValueCategoryDomain: null,
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
            const interpolateMode = resolveInterpolate(
                aggName,
                chartType,
                columnsConfig,
            );
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
                start: -1,
                end: -1,
                interpolateMode,
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

    // Per-aggregate string-ness flag, plus default axis side from the
    // `columns_config.alt_axis` pin. `series[].axis` may still flip
    // again via the auto-alt heuristic below, but we suppress that
    // heuristic entirely once a string aggregate is present (numeric
    // extent ratios are not defined on categorical data).
    const aggIsString = new Array<boolean>(M);
    const defaultAxisSide = new Array<number>(M);
    let anyStringAgg = false;
    for (let k = 0; k < M; k++) {
        const aggName = aggregates[k];
        const splitKey = splitPrefixes[0];
        const colName = splitKey === "" ? aggName : `${splitKey}|${aggName}`;
        aggIsString[k] = columns.get(colName)?.type === "string";
        defaultAxisSide[k] = resolveAltAxis(aggName, columnsConfig) ? 1 : 0;
        if (aggIsString[k]) {
            anyStringAgg = true;
        }
    }

    // Per-side categorical resolution. Apply the all-or-nothing rule:
    // a side becomes categorical only if every aggregate currently
    // assigned to it (by `defaultAxisSide` — the alt_axis pin) is
    // string-typed. Auto-alt-axis can't re-assign across modes since
    // we disable it whenever any string aggregate exists.
    const primaryAggs: ValueCategoryColumn[] = [];
    const altAggs: ValueCategoryColumn[] = [];
    const primaryAggColIdx: number[] = [];
    const altAggColIdx: number[] = [];
    for (let k = 0; k < M; k++) {
        const aggName = aggregates[k];
        for (let p = 0; p < P; p++) {
            const splitKey = splitPrefixes[p];
            const colName =
                splitKey === "" ? aggName : `${splitKey}|${aggName}`;
            const colIdx = k * P + p;
            const entry: ValueCategoryColumn = {
                name: colName,
                type: aggIsString[k] ? "string" : "numeric",
                data: columns.get(colName),
            };
            if (defaultAxisSide[k] === 0) {
                primaryAggs.push(entry);
                primaryAggColIdx.push(colIdx);
            } else {
                altAggs.push(entry);
                altAggColIdx.push(colIdx);
            }
        }
    }

    const primaryValueAxisLabel = primaryAggs
        .map((c) => c.name)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .join(", ");
    const altValueAxisLabel = altAggs
        .map((c) => c.name)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .join(", ");

    const primaryCategorical =
        primaryAggs.length > 0
            ? resolveValueCategoryDomain(
                  primaryAggs,
                  numRows,
                  rowOffset,
                  primaryValueAxisLabel,
              )
            : null;
    const altCategorical =
        altAggs.length > 0
            ? resolveValueCategoryDomain(
                  altAggs,
                  numRows,
                  rowOffset,
                  altValueAxisLabel,
              )
            : null;

    // Per-column slot buffers indexed in the same `colIdx = k * P + p`
    // space as `colValues`. `colSlots[colIdx]` is non-null exactly when
    // the side `defaultAxisSide[k]` is categorical and that side's
    // resolver returned slot buffers.
    const colSlots: (Int32Array | null)[] = new Array(M * P).fill(null);
    if (primaryCategorical) {
        for (let i = 0; i < primaryAggColIdx.length; i++) {
            colSlots[primaryAggColIdx[i]] =
                primaryCategorical.perColumnSlots[i];
        }
    }

    if (altCategorical) {
        for (let i = 0; i < altAggColIdx.length; i++) {
            colSlots[altAggColIdx[i]] = altCategorical.perColumnSlots[i];
        }
    }

    // Pre-allocate columnar bar storage at N*M*P upper bound. The
    // pipeline emits at most one record per (cat, agg, split) cell;
    // `bars.count` tracks the active prefix.
    const barCap = N * M * P;
    const bars = ensureBarColumnsCapacity(scratchBars ?? null, barCap);
    let barWrite = 0;

    // Pass 1 — populate the raw sample grid + valid bitset. Stacking
    // and bar-record emission run in pass 3 (below) so that pass 2
    // can interpolate interior nulls for line/area series before the
    // stack accumulator sees them; otherwise an interpolated cell in
    // a stacked area would not contribute to the running y0/y1 of
    // subsequent series at the same catIdx.
    for (let catI = 0; catI < N; catI++) {
        const row = catI + rowOffset;
        for (let k = 0; k < M; k++) {
            for (let p = 0; p < P; p++) {
                const colIdx = k * P + p;

                // Categorical value-axis branch: `colSlots[colIdx]` is
                // a per-catI Int32Array of dictionary slot indices, with
                // `(null)` already routed to its own slot — every row
                // is a valid sample and stack/extent logic just runs
                // against the slot integer.
                const slots = colSlots[colIdx];
                if (slots) {
                    const seriesId = k * P + p;
                    const sampleIdx = catI * S + seriesId;
                    samples[sampleIdx] = slots[catI];
                    setValidBit(sampleValid, sampleIdx);
                    continue;
                }

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

                const seriesId = k * P + p;
                const sampleIdx = catI * S + seriesId;
                samples[sampleIdx] = v;
                setValidBit(sampleValid, sampleIdx);
            }
        }
    }

    // Compute per-series [start, end] from sampleValid (post-Pass 1).
    // Drives Pass 2's interpolation range, Pass 3's stack/bar emission,
    // axis-extent calc, and downstream rendering. Series with no real
    // samples keep start = end = -1 and are skipped everywhere.
    for (let seriesId = 0; seriesId < S; seriesId++) {
        let first = -1;
        let last = -1;
        for (let c = 0; c < N; c++) {
            const idx = c * S + seriesId;
            if ((sampleValid[idx >> 3] >> (idx & 7)) & 1) {
                if (first === -1) {
                    first = c;
                }

                last = c;
            }
        }

        series[seriesId].start = first;
        series[seriesId].end = last;
    }

    // Pass 2 — synthesize values for nulls covered by interpolation.
    // Writes `samples[c]` but deliberately does NOT touch `sampleValid`:
    // the renderer derives "synthesized cell" from
    // `c in [start, end] && sampleValid[c] === 0`, so the bit must stay
    // 0 at synthesized cells. Per-series gating:
    //
    //   - line, solid / transparent: interior linear interpolation.
    //   - area, solid: every synthesized cell (interior null,
    //     leading/trailing null) gets value 0. Stacked areas above the
    //     null sit on the unchanged baseline — interpolating to a
    //     non-zero value here would phantom-lift the upper series at
    //     the gap. Range collapses to [0, N-1].
    //   - any series with mode = "skip": skipped (the renderer's
    //     [start, end] iteration treats interior nulls correctly via
    //     the sampleValid lookup for area, and shader alpha=0 for line).
    //   - other chart types: skipped.
    //
    // X-axis units for line interpolation match the rendering: numeric
    // mode uses `categoryPositions[c]`, category mode uses the cat
    // index. `samples` is freshly allocated each build (Float32Array
    // zero-init), so interior null cells already hold 0 — area's
    // "zero-fill interior" is implicit and needs no explicit writes
    // there; only the leading/trailing range extension is written.
    for (let seriesId = 0; seriesId < S; seriesId++) {
        const s = series[seriesId];
        if (s.start < 0) {
            continue;
        }

        if (s.interpolateMode === "skip") {
            continue;
        }

        if (s.chartType === "line") {
            let lastValid = s.start;
            for (let c = s.start + 1; c <= s.end; c++) {
                const idx = c * S + seriesId;
                const ok = (sampleValid[idx >> 3] >> (idx & 7)) & 1;
                if (!ok) {
                    continue;
                }

                if (c - lastValid > 1) {
                    const startIdx = lastValid * S + seriesId;
                    const startV = samples[startIdx];
                    const endV = samples[idx];
                    const xStart = categoryPositions
                        ? categoryPositions[lastValid]
                        : lastValid;
                    const xEnd = categoryPositions ? categoryPositions[c] : c;
                    const dx = xEnd - xStart;
                    for (let g = 1; g < c - lastValid; g++) {
                        const cc = lastValid + g;
                        const xMid = categoryPositions
                            ? categoryPositions[cc]
                            : cc;
                        const t = dx === 0 ? 0 : (xMid - xStart) / dx;
                        samples[cc * S + seriesId] =
                            startV + (endV - startV) * t;
                    }
                }

                lastValid = c;
            }
        } else if (s.chartType === "area") {
            // Leading / trailing zero-fill. Interior nulls already sit
            // at 0 from Float32Array zero-init; no per-cell write
            // needed in (s.start, s.end). Range collapses to [0, N-1]
            // so Pass 3 and the area glyph treat the whole span as
            // renderable (continuous strip resting on the baseline at
            // synthesized cells).
            for (let c = 0; c < s.start; c++) {
                samples[c * S + seriesId] = 0;
            }

            for (let c = s.end + 1; c < N; c++) {
                samples[c * S + seriesId] = 0;
            }

            s.start = 0;
            s.end = N - 1;
        }
    }

    // Pass 3 — emit stack/bar records and update per-aggregate extents
    // from the (possibly synthesized) samples grid. The cell-validity
    // predicate is mode-aware: for line (any mode) and area+solid,
    // Pass 2 has guaranteed every cell in `[start, end]` carries a
    // meaningful value (real or synthesized) — `sampleValid` is the
    // "is real" mask, not the "has value" mask, so we trust the range
    // alone. For area+skip and bar/scatter, fall back to the original
    // per-cell `sampleValid` check.
    for (let catI = 0; catI < N; catI++) {
        const catCenter = categoryPositions ? categoryPositions[catI] : catI;
        for (let k = 0; k < M; k++) {
            const slotOffset = slotOffsets[k];
            const xCenter = catCenter + slotOffset;
            const ext = aggExtents[k];

            for (let p = 0; p < P; p++) {
                const seriesId = k * P + p;
                const s = series[seriesId];
                if (catI < s.start || catI > s.end) {
                    continue;
                }

                const treatRangeAsValid =
                    s.chartType === "line" ||
                    (s.chartType === "area" && s.interpolateMode !== "skip");
                const sampleIdx = catI * S + seriesId;
                if (!treatRangeAsValid) {
                    if (
                        !((sampleValid[sampleIdx >> 3] >> (sampleIdx & 7)) & 1)
                    ) {
                        continue;
                    }
                }

                const v = samples[sampleIdx];

                // Stacking-glyph path: emit a record with running y0/y1.
                if (
                    (s.chartType === "bar" || s.chartType === "area") &&
                    s.stack
                ) {
                    if (v === 0) {
                        // Non-area, or area+skip: a zero-value record
                        // is degenerate (zero-height bar / invisible
                        // strip wedge) and just costs allocation —
                        // drop it.
                        //
                        // Area + non-skip: keep the record so the
                        // stacked strip stays continuous through
                        // synthesized cells (interior zero-fill +
                        // leading / trailing zero-fill). `y1 = y0`
                        // makes it a zero-height vertex pair in the
                        // strip; posStack doesn't increment, so the
                        // series above stacks on the unchanged
                        // baseline.
                        if (
                            s.chartType !== "area" ||
                            s.interpolateMode === "skip"
                        ) {
                            continue;
                        }
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
    // Auto-alt-axis compares numeric magnitudes; a string aggregate
    // contributes no extent and would always land on the smaller side.
    // Skip the heuristic when any aggregate is string and let the
    // user's explicit `columns_config.alt_axis` pin (resolved below)
    // be the only axis-side override.
    if (autoAltYAxis && M >= 2 && !anyStringAgg) {
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

        if (s.start < 0) {
            continue;
        }

        const treatRangeAsValid =
            s.chartType === "line" ||
            (s.chartType === "area" && s.interpolateMode !== "skip");
        const ext = s.axis === 0 ? leftExtent : rightExtent;
        for (let catI = s.start; catI <= s.end; catI++) {
            const sampleIdx = catI * S + seriesId;
            if (!treatRangeAsValid) {
                if (!((sampleValid[sampleIdx >> 3] >> (sampleIdx & 7)) & 1)) {
                    continue;
                }
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

    // Categorical value-axis: override the numeric extent with the
    // slot-index range `[0, dictLen-1]`. The chrome renderer paints
    // the dictionary; the numeric domain we surface is only used by
    // the projection matrix and pixel mapping, both of which work on
    // raw slot indices when `*ValueAxisMode === "category"`.
    const leftValueAxisMode: "numeric" | "category" = primaryCategorical
        ? "category"
        : "numeric";
    const rightValueAxisMode: "numeric" | "category" | null = hasRightAxis
        ? altCategorical
            ? "category"
            : "numeric"
        : null;
    const finalLeftDomain =
        primaryCategorical && primaryCategorical.domain.numRows > 0
            ? {
                  min: 0,
                  max: Math.max(0, primaryCategorical.domain.numRows - 1),
              }
            : leftExtent;
    const finalRightDomain =
        altCategorical && altCategorical.domain.numRows > 0 && hasRightAxis
            ? {
                  min: 0,
                  max: Math.max(0, altCategorical.domain.numRows - 1),
              }
            : rightDomain;

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
        leftDomain: finalLeftDomain,
        rightDomain: finalRightDomain,
        hasRightAxis,
        leftValueAxisMode,
        rightValueAxisMode,
        leftValueCategoryDomain: primaryCategorical?.domain ?? null,
        rightValueCategoryDomain: altCategorical?.domain ?? null,
    };
}
