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
import type { WebGLContextManager } from "../../webgl/context-manager";
import type { ContinuousChart, SplitGroup } from "./continuous-chart";

/**
 * Resolve per-split-prefix column-name tuples. `colorBase`/`sizeBase`
 * are optional (empty string when the corresponding slot is unset).
 */
function buildContinuousSplitGroups(
    columns: ColumnDataMap,
    xBase: string,
    yBase: string,
    colorBase: string,
    sizeBase: string,
): SplitGroup[] {
    const required = xBase ? [xBase, yBase] : [yBase];
    const optional: string[] = [];
    if (colorBase) optional.push(colorBase);
    if (sizeBase) optional.push(sizeBase);
    return buildSplitGroups(columns, required, optional).map((g) => ({
        prefix: g.prefix,
        xColName: xBase ? g.colNames.get(xBase)! : "",
        yColName: g.colNames.get(yBase)!,
        colorColName: colorBase ? `${g.prefix}|${colorBase}` : "",
        sizeColName: sizeBase ? `${g.prefix}|${sizeBase}` : "",
    }));
}

/**
 * First-chunk init: compile the glyph program, reset data extents,
 * resolve column roles and split groups, pre-allocate CPU + GPU buffers.
 */
export function initContinuousPipeline(
    chart: ContinuousChart,
    glManager: WebGLContextManager,
    columns: ColumnDataMap,
    endRow: number,
): void {
    chart.glyph.ensureProgram(chart, glManager);

    chart._allColumns = Array.from(columns.keys()).filter(
        (k) => !k.startsWith("__"),
    );
    chart._xMin = Infinity;
    chart._xMax = -Infinity;
    chart._yMin = Infinity;
    chart._yMax = -Infinity;
    chart._colorMin = Infinity;
    chart._colorMax = -Infinity;
    chart._sizeMin = Infinity;
    chart._sizeMax = -Infinity;
    chart._dataCount = 0;
    chart._numericRowData = new Map();
    chart._stringRowData = new Map();
    chart._uniqueColorLabels = new Map();
    chart._hitTest.clear();
    chart._maxSeriesUploaded = 0;

    const slots = chart._columnSlots;
    // Line uses `[yBase]` with row-index X; scatter and X/Y Line use
    // `[xBase, yBase, colorBase, sizeBase]`. A single positional layout
    // handles both: treat an empty slot[0] as "X = row index".
    const xBase = slots[0] || "";
    const yBase = slots[1] || "";
    const colorBase = slots[2] || "";
    const sizeBase = slots[3] || "";
    chart._xLabel = xBase;
    chart._yLabel = yBase;
    chart._xIsRowIndex = !xBase;

    // Capture the per-series row budget BEFORE any split expansion. When
    // split_by is active we grow `totalCapacity` to fit `numSplits`
    // parallel slot ranges; reading `totalCapacity` again after that
    // would hand every series the whole expanded buffer and cause
    // series 1..N writes to overshoot the GPU buffer.
    const rowsPerSeries = glManager.bufferPool.totalCapacity || endRow;

    if (chart._splitBy.length > 0) {
        chart._splitGroups = buildContinuousSplitGroups(
            columns,
            xBase,
            yBase,
            colorBase,
            sizeBase,
        );
        if (chart._splitGroups.length === 0) {
            chart._seriesCapacity = 0;
            chart._seriesUploadedCounts = [];
            return;
        }
        chart._colorIsString = true;
        chart._xName = chart._splitGroups[0].xColName;
        chart._yName = chart._splitGroups[0].yColName;
        chart._colorName = "";
        chart._sizeName = "";
        glManager.ensureBufferCapacity(
            rowsPerSeries * chart._splitGroups.length,
        );
        const baseNames = new Set<string>();
        for (const key of chart._allColumns) {
            const pipeIdx = key.lastIndexOf("|");
            baseNames.add(pipeIdx === -1 ? key : key.substring(pipeIdx + 1));
        }
        chart._tooltipColumns = ["Split", ...baseNames];
    } else {
        chart._splitGroups = [];
        chart._xName = xBase;
        chart._yName = yBase;
        chart._colorName = colorBase;
        chart._sizeName = sizeBase;
        chart._colorIsString = false;

        if (chart._colorName) {
            const colorCol = columns.get(chart._colorName);
            chart._colorIsString = colorCol?.type === "string";
        }
        chart._tooltipColumns = chart._allColumns.slice(0);
    }

    const numSeries = Math.max(1, chart._splitGroups.length);
    chart._seriesCapacity = rowsPerSeries;
    chart._seriesUploadedCounts = new Array(numSeries).fill(0);

    const cpuCap = numSeries * rowsPerSeries;
    chart._xData = new Float32Array(cpuCap);
    chart._yData = new Float32Array(cpuCap);
    chart._colorData = new Float32Array(cpuCap);
}

/**
 * Process one data chunk: extract positions + optional color/size per
 * point, extend extents, write into per-series slots, capture tooltip
 * data, and let the glyph upload its own GPU attribute buffers.
 */
export function processContinuousChunk(
    chart: ContinuousChart,
    glManager: WebGLContextManager,
    columns: ColumnDataMap,
    startRow: number,
    chunkLength: number,
    endRow: number,
): void {
    if (!chart._yName) return;
    const sourceLength = chunkLength;
    if (sourceLength === 0) return;
    if (chart._seriesCapacity === 0) return;

    const hasSplits = chart._splitGroups.length > 0;

    type SeriesSrc = {
        xCol: Float32Array | Int32Array | null;
        yCol: Float32Array | Int32Array;
        xValid: Uint8Array | undefined;
        yValid: Uint8Array | undefined;
        colorLabel: string;
        sizeCol: (Float32Array | Int32Array) | null;
    };
    const series: SeriesSrc[] = [];

    if (hasSplits) {
        for (const sg of chart._splitGroups) {
            const xc = sg.xColName ? columns.get(sg.xColName) : null;
            const yc = columns.get(sg.yColName);
            if (!yc?.values) continue;
            const sc = sg.sizeColName ? columns.get(sg.sizeColName) : null;
            series.push({
                xCol: xc?.values ?? null,
                yCol: yc.values,
                xValid: xc?.valid,
                yValid: yc.valid,
                colorLabel: sg.prefix,
                sizeCol: sc?.values ?? null,
            });
        }
    } else {
        const xc = chart._xName ? columns.get(chart._xName) : null;
        const yc = chart._yName ? columns.get(chart._yName) : null;
        if (!yc?.values) return;
        series.push({
            xCol: xc?.values ?? null,
            yCol: yc.values,
            xValid: xc?.valid,
            yValid: yc?.valid,
            colorLabel: "",
            sizeCol: null,
        });
    }

    if (series.length === 0) return;

    const totalCapacity = chart._seriesCapacity * series.length;

    if (chart._stagingChunkSize < sourceLength) {
        chart._stagingPositions = new Float32Array(sourceLength * 2);
        chart._stagingColors = new Float32Array(sourceLength);
        chart._stagingSizes = new Float32Array(sourceLength);
        chart._stagingChunkSize = sourceLength;
    }
    const positions = chart._stagingPositions!;
    const colorValues = chart._stagingColors!;
    const sizeValues = chart._stagingSizes!;

    // Aggregated row-path (for tooltips) when group_by is active. Resolve
    // the `__ROW_PATH_N__` columns once per chunk; the inner row loop
    // only indexes into these arrays.
    let rowPathArr: string[] | null = null;
    let rowPathCols: { indices: Int32Array; dictionary: string[] }[] | null =
        null;
    if (chart._groupBy.length > 0) {
        const rpCols: { indices: Int32Array; dictionary: string[] }[] = [];
        for (let n = 0; ; n++) {
            const rp = columns.get(`__ROW_PATH_${n}__`);
            if (!rp || rp.type !== "string" || !rp.indices || !rp.dictionary)
                break;
            rpCols.push({ indices: rp.indices, dictionary: rp.dictionary });
        }
        if (rpCols.length > 0) {
            if (!chart._stringRowData.has("__ROW_PATH__")) {
                chart._stringRowData.set(
                    "__ROW_PATH__",
                    new Array(totalCapacity),
                );
            }
            rowPathArr = chart._stringRowData.get("__ROW_PATH__")!;
            rowPathCols = rpCols;
        }
    }

    // Split-series bookkeeping: numeric X/Y per base name + split label.
    let splitLabelArr: string[] | null = null;
    let splitXArr: Float32Array | null = null;
    let splitYArr: Float32Array | null = null;
    if (hasSplits) {
        if (!chart._stringRowData.has("Split")) {
            chart._stringRowData.set("Split", new Array(totalCapacity));
        }
        splitLabelArr = chart._stringRowData.get("Split")!;
        if (chart._xLabel && !chart._numericRowData.has(chart._xLabel)) {
            chart._numericRowData.set(
                chart._xLabel,
                new Float32Array(totalCapacity),
            );
        }
        if (chart._yLabel && !chart._numericRowData.has(chart._yLabel)) {
            chart._numericRowData.set(
                chart._yLabel,
                new Float32Array(totalCapacity),
            );
        }
        splitXArr = chart._xLabel
            ? chart._numericRowData.get(chart._xLabel)!
            : null;
        splitYArr = chart._yLabel
            ? chart._numericRowData.get(chart._yLabel)!
            : null;
    }

    const colorCol =
        !hasSplits && chart._colorName ? columns.get(chart._colorName) : null;

    // Non-split size column: resolve once; inner loop reads values[i].
    const nonSplitSizeValues =
        !hasSplits && chart._sizeName
            ? (columns.get(chart._sizeName)?.values ?? null)
            : null;

    // Snapshot pre-chunk counts so tooltip-column capture can use them
    // without depending on post-loop state.
    const preChunkCounts = chart._seriesUploadedCounts.slice();

    for (let s = 0; s < series.length; s++) {
        const ser = series[s];
        const prevCount = chart._seriesUploadedCounts[s] ?? 0;
        const slotBase = s * chart._seriesCapacity;
        const maxWrite = chart._seriesCapacity - prevCount;
        if (maxWrite <= 0) continue;

        let writeIdx = 0;
        for (let j = 0; j < sourceLength && writeIdx < maxWrite; j++) {
            const i = j;
            if (ser.yValid && !((ser.yValid[i >> 3] >> (i & 7)) & 1)) continue;
            if (
                ser.xCol &&
                ser.xValid &&
                !((ser.xValid[i >> 3] >> (i & 7)) & 1)
            )
                continue;

            const y = ser.yCol[i] as number;
            const x = ser.xCol ? (ser.xCol[i] as number) : startRow + i;
            if (isNaN(x) || isNaN(y)) continue;

            if (x < chart._xMin) chart._xMin = x;
            if (x > chart._xMax) chart._xMax = x;
            if (y < chart._yMin) chart._yMin = y;
            if (y > chart._yMax) chart._yMax = y;

            const flatIdx = slotBase + prevCount + writeIdx;
            chart._xData![flatIdx] = x;
            chart._yData![flatIdx] = y;

            positions[writeIdx * 2] = x;
            positions[writeIdx * 2 + 1] = y;

            // ── Color: raw numeric, or discrete label index.
            if (hasSplits) {
                if (!chart._uniqueColorLabels.has(ser.colorLabel)) {
                    chart._uniqueColorLabels.set(
                        ser.colorLabel,
                        chart._uniqueColorLabels.size,
                    );
                }
                const idx = chart._uniqueColorLabels.get(ser.colorLabel)!;
                colorValues[writeIdx] = idx;
                chart._colorData![flatIdx] = idx;
                if (idx < chart._colorMin) chart._colorMin = idx;
                if (idx > chart._colorMax) chart._colorMax = idx;
            } else if (colorCol && !chart._colorIsString && colorCol.values) {
                const v = colorCol.values[i] as number;
                colorValues[writeIdx] = v;
                chart._colorData![flatIdx] = v;
                if (v < chart._colorMin) chart._colorMin = v;
                if (v > chart._colorMax) chart._colorMax = v;
            } else if (
                colorCol &&
                chart._colorIsString &&
                colorCol.indices &&
                colorCol.dictionary
            ) {
                const label = colorCol.dictionary[colorCol.indices[i]];
                if (!chart._uniqueColorLabels.has(label)) {
                    chart._uniqueColorLabels.set(
                        label,
                        chart._uniqueColorLabels.size,
                    );
                }
                const idx = chart._uniqueColorLabels.get(label)!;
                colorValues[writeIdx] = idx;
                chart._colorData![flatIdx] = idx;
                if (idx < chart._colorMin) chart._colorMin = idx;
                if (idx > chart._colorMax) chart._colorMax = idx;
            } else {
                colorValues[writeIdx] = 0.5;
                chart._colorData![flatIdx] = 0.5;
            }

            // ── Size: per-split size column, or global sizeName.
            if (ser.sizeCol) {
                const v = ser.sizeCol[i] as number;
                sizeValues[writeIdx] = v;
                if (v < chart._sizeMin) chart._sizeMin = v;
                if (v > chart._sizeMax) chart._sizeMax = v;
            } else if (nonSplitSizeValues) {
                const v = nonSplitSizeValues[i] as number;
                sizeValues[writeIdx] = v;
                if (v < chart._sizeMin) chart._sizeMin = v;
                if (v > chart._sizeMax) chart._sizeMax = v;
            } else {
                sizeValues[writeIdx] = 0;
            }

            if (splitLabelArr) {
                splitLabelArr[flatIdx] = ser.colorLabel;
                if (splitXArr) splitXArr[flatIdx] = x;
                if (splitYArr) splitYArr[flatIdx] = y;
            }

            if (rowPathArr && rowPathCols && s === 0) {
                // Row-path is shared across all series for a given row;
                // capture once during series 0. Columns are resolved
                // above; build the composite string from cached refs.
                let path = "";
                for (let n = 0; n < rowPathCols.length; n++) {
                    const rp = rowPathCols[n];
                    const part = rp.dictionary[rp.indices[i]] ?? "";
                    path = n === 0 ? part : `${path} / ${part}`;
                }
                rowPathArr[flatIdx] = path;
            }

            writeIdx++;
        }

        if (writeIdx === 0) continue;

        // Upload the shared position buffer for this series's new slice.
        const positionByteOffset =
            (slotBase + prevCount) * 2 * Float32Array.BYTES_PER_ELEMENT;
        glManager.bufferPool.upload(
            "a_position",
            positions.subarray(0, writeIdx * 2),
            positionByteOffset,
            2,
        );

        // Upload the raw color and size buffers (consumed by glyphs).
        const scalarByteOffset =
            (slotBase + prevCount) * Float32Array.BYTES_PER_ELEMENT;
        glManager.bufferPool.upload(
            "a_color_value",
            colorValues.subarray(0, writeIdx),
            scalarByteOffset,
        );
        glManager.bufferPool.upload(
            "a_size_value",
            sizeValues.subarray(0, writeIdx),
            scalarByteOffset,
        );

        chart._seriesUploadedCounts[s] = prevCount + writeIdx;
        if (chart._seriesUploadedCounts[s] > chart._maxSeriesUploaded) {
            chart._maxSeriesUploaded = chart._seriesUploadedCounts[s];
        }
    }

    // Tooltip-column capture: non-split case copies one arrow row per
    // source index j, keyed by `slot0Base + preCount0 + j`. This matches
    // the behavior scatter had before the unification.
    if (!hasSplits) {
        const base = 0 + (preChunkCounts[0] ?? 0);
        for (const [name, col] of columns) {
            if (name.startsWith("__")) continue;
            if (col.type === "string") {
                if (!chart._stringRowData.has(name)) {
                    chart._stringRowData.set(name, new Array(totalCapacity));
                }
                const arr = chart._stringRowData.get(name)!;
                const indices = col.indices!;
                const dictionary = col.dictionary!;
                for (let j = 0; j < sourceLength; j++) {
                    arr[base + j] = dictionary[indices[j]];
                }
            } else if (col.values) {
                if (!chart._numericRowData.has(name)) {
                    chart._numericRowData.set(
                        name,
                        new Float32Array(totalCapacity),
                    );
                }
                const arr = chart._numericRowData.get(name)!;
                // TypedArray.set does the element copy + int→float coerce
                // in one native call; much faster than a JS for-loop.
                arr.set(col.values.subarray(0, sourceLength), base);
            }
        }
    }

    // Total dataCount = sum of all series' uploaded counts.
    let total = 0;
    for (const c of chart._seriesUploadedCounts) total += c;
    chart._dataCount = total;
    glManager.uploadedCount = total;
    chart._hitTest.markDirty();

    if (chart._zoomController && isFinite(chart._xMin)) {
        chart._zoomController.setBaseDomain(
            chart._xMin,
            chart._xMax,
            chart._yMin,
            chart._yMax,
        );
    }
}
