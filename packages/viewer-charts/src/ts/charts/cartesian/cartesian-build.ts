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

import type { ColumnDataMap, ColumnData } from "../../data/view-reader";
import { buildSplitGroups } from "../../data/split-groups";
import type { WebGLContextManager } from "../../webgl/context-manager";
import type { CartesianChart, SplitGroup } from "./cartesian";
import { LabelInterner } from "./label-interner";

/**
 * Resolve per-split-prefix column-name tuples. `colorBase`/`sizeBase`
 * are optional (empty string when the corresponding slot is unset).
 */
function buildCartesianSplitGroups(
    columns: ColumnDataMap,
    xBase: string,
    yBase: string,
    colorBase: string,
    sizeBase: string,
    labelBase: string,
): SplitGroup[] {
    const required = xBase ? [xBase, yBase] : [yBase];
    const optional: string[] = [];
    if (colorBase) {
        optional.push(colorBase);
    }

    if (sizeBase) {
        optional.push(sizeBase);
    }

    if (labelBase) {
        optional.push(labelBase);
    }

    return buildSplitGroups(columns, required, optional).map((g) => ({
        prefix: g.prefix,
        xColName: xBase ? g.colNames.get(xBase)! : "",
        yColName: g.colNames.get(yBase)!,
        colorColName: colorBase ? `${g.prefix}|${colorBase}` : "",
        sizeColName: sizeBase ? `${g.prefix}|${sizeBase}` : "",
        labelColName: labelBase ? `${g.prefix}|${labelBase}` : "",
    }));
}

/**
 * First-chunk init: compile the glyph program, reset data extents,
 * resolve column roles and split groups, pre-allocate CPU + GPU buffers.
 */
export function initCartesianPipeline(
    chart: CartesianChart,
    glManager: WebGLContextManager,
    columns: ColumnDataMap,
    endRow: number,
): void {
    chart.glyph.ensureProgram(chart, glManager);

    const prevColorName = chart._colorName;
    const prevColorIsString = chart._colorIsString;

    chart._xMin = Infinity;
    chart._xMax = -Infinity;
    chart._yMin = Infinity;
    chart._yMax = -Infinity;
    chart._xOrigin = NaN;
    chart._yOrigin = NaN;
    chart._colorMin = Infinity;
    chart._colorMax = -Infinity;
    chart._sizeMin = Infinity;
    chart._sizeMax = -Infinity;
    chart._dataCount = 0;
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
    const labelBase = slots[4] || "";
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
        chart._splitGroups = buildCartesianSplitGroups(
            columns,
            xBase,
            yBase,
            colorBase,
            sizeBase,
            labelBase,
        );
        if (chart._splitGroups.length === 0) {
            chart._seriesCapacity = 0;
            chart._seriesUploadedCounts = [];
            return;
        }

        // Split mode: per-point columns live under `${prefix}|${base}`.
        // The `_*Name` fields hold the base names so downstream code
        // (render labels, tooltip lookup) can present them as one
        // logical column. The per-facet resolution happens inside
        // `processCartesianChunk` via `_splitGroups[i].*ColName`.
        chart._xName = chart._splitGroups[0].xColName;
        chart._yName = chart._splitGroups[0].yColName;
        chart._colorName = colorBase;
        chart._sizeName = sizeBase;
        chart._labelName = labelBase;

        // Infer dtype from any split's color column — all splits
        // share the same underlying column type.
        chart._colorIsString = false;
        if (colorBase) {
            const firstColorCol = columns.get(
                chart._splitGroups[0].colorColName,
            );
            chart._colorIsString = firstColorCol?.type === "string";
        }

        glManager.ensureBufferCapacity(
            rowsPerSeries * chart._splitGroups.length,
        );
    } else {
        chart._splitGroups = [];
        chart._xName = xBase;
        chart._yName = yBase;
        chart._colorName = colorBase;
        chart._sizeName = sizeBase;
        chart._labelName = labelBase;
        chart._colorIsString = false;

        if (chart._colorName) {
            const colorCol = columns.get(chart._colorName);
            chart._colorIsString = colorCol?.type === "string";
        }
    }

    // Color label identity persists across `update()` calls so a given
    // string keeps the same palette index for as long as the color column
    // stays the same — perspective's dictionary encoding does not promise
    // a stable index order between batches, so re-seeding from scratch
    // would shuffle every label's color on each update. Reset only when
    // the user changes the column or its dtype (string ↔ numeric); a
    // numeric color column doesn't use this map and clearing keeps it
    // small.
    if (
        chart._colorName !== prevColorName ||
        chart._colorIsString !== prevColorIsString
    ) {
        chart._uniqueColorLabels = new Map();
    }

    const numSeries = Math.max(1, chart._splitGroups.length);
    chart._seriesCapacity = rowsPerSeries;
    chart._seriesUploadedCounts = new Array(numSeries).fill(0);

    const cpuCap = numSeries * rowsPerSeries;
    chart._xData = new Float32Array(cpuCap);
    chart._yData = new Float32Array(cpuCap);
    chart._colorData = new Float32Array(cpuCap);
    chart._rowIndexData = new Int32Array(cpuCap);

    chart._labels = labelBase ? new LabelInterner(cpuCap) : null;
}

/**
 * Process one data chunk: extract positions + optional color/size per
 * point, extend extents, write into per-series slots, capture tooltip
 * data, and let the glyph upload its own GPU attribute buffers.
 */
export function processCartesianChunk(
    chart: CartesianChart,
    glManager: WebGLContextManager,
    columns: ColumnDataMap,
    startRow: number,
    chunkLength: number,
    endRow: number,
): void {
    if (!chart._yName) {
        return;
    }

    const sourceLength = chunkLength;
    if (sourceLength === 0) {
        return;
    }

    if (chart._seriesCapacity === 0) {
        return;
    }

    const hasSplits = chart._splitGroups.length > 0;

    // Per-series data source. `colorCol` is the facet's color column
    // reference — in split mode each series has its own
    // `${prefix}|${colorBase}`, in non-split mode the single series
    // carries the user's selected color column. The color-resolution
    // logic in the inner loop reads uniformly from `ser.colorCol`
    // across both modes.
    type SeriesSrc = {
        xCol: Float32Array | Float64Array | Int32Array | null;
        yCol: Float32Array | Float64Array | Int32Array;
        xValid: Uint8Array | undefined;
        yValid: Uint8Array | undefined;
        colorCol: ColumnData | null;
        sizeCol: (Float32Array | Float64Array | Int32Array) | null;
        labelCol: ColumnData | null;
    };
    const series: SeriesSrc[] = [];

    if (hasSplits) {
        for (const sg of chart._splitGroups) {
            const xc = sg.xColName ? columns.get(sg.xColName) : null;
            const yc = columns.get(sg.yColName);
            if (!yc?.values) {
                continue;
            }

            const sc = sg.sizeColName ? columns.get(sg.sizeColName) : null;
            const cc = sg.colorColName
                ? (columns.get(sg.colorColName) ?? null)
                : null;
            const lc = sg.labelColName
                ? (columns.get(sg.labelColName) ?? null)
                : null;
            series.push({
                xCol: xc?.values ?? null,
                yCol: yc.values,
                xValid: xc?.valid,
                yValid: yc.valid,
                colorCol: cc,
                sizeCol: sc?.values ?? null,
                labelCol: lc,
            });
        }
    } else {
        const xc = chart._xName ? columns.get(chart._xName) : null;
        const yc = chart._yName ? columns.get(chart._yName) : null;
        if (!yc?.values) {
            return;
        }

        const cc = chart._colorName
            ? (columns.get(chart._colorName) ?? null)
            : null;
        const lc = chart._labelName
            ? (columns.get(chart._labelName) ?? null)
            : null;
        series.push({
            xCol: xc?.values ?? null,
            yCol: yc.values,
            xValid: xc?.valid,
            yValid: yc?.valid,
            colorCol: cc,
            sizeCol: null,
            labelCol: lc,
        });
    }

    if (series.length === 0) {
        return;
    }

    if (chart._stagingChunkSize < sourceLength) {
        chart._stagingPositions = new Float32Array(sourceLength * 2);
        chart._stagingColors = new Float32Array(sourceLength);
        chart._stagingSizes = new Float32Array(sourceLength);
        chart._stagingChunkSize = sourceLength;
    }

    const positions = chart._stagingPositions!;
    const colorValues = chart._stagingColors!;
    const sizeValues = chart._stagingSizes!;

    // Non-split size column: resolve once; inner loop reads values[i].
    const nonSplitSizeValues =
        !hasSplits && chart._sizeName
            ? (columns.get(chart._sizeName)?.values ?? null)
            : null;

    // Seed `_uniqueColorLabels` from the color column's dictionary in
    // index order. For a stable single dictionary this makes
    // `palette[_uniqueColorLabels.get(label)] === palette[dictIdx %
    // N]`. For splits (distinct dictionaries per facet) values that
    // appear in multiple splits are inserted once — later splits
    // extend the map without disturbing earlier indices, so the
    // same string has the same color in every facet.
    //
    // Also pin `_colorMin` / `_colorMax` to the full palette-index
    // domain. If the row loop only encountered a subset of indices
    // we'd otherwise set a narrower range and the shader's
    // `(v - min) / (max - min)` mapping would land on the wrong
    // palette stop.
    if (chart._colorIsString && chart._colorName) {
        for (const ser of series) {
            const dict = ser.colorCol?.dictionary;
            if (!dict) {
                continue;
            }

            for (let i = 0; i < dict.length; i++) {
                const s = dict[i];
                if (!chart._uniqueColorLabels.has(s)) {
                    chart._uniqueColorLabels.set(
                        s,
                        chart._uniqueColorLabels.size,
                    );
                }
            }
        }

        if (chart._uniqueColorLabels.size > 0) {
            chart._colorMin = 0;
            chart._colorMax = chart._uniqueColorLabels.size - 1;
        }
    }

    for (let s = 0; s < series.length; s++) {
        const ser = series[s];
        const prevCount = chart._seriesUploadedCounts[s] ?? 0;
        const slotBase = s * chart._seriesCapacity;
        const maxWrite = chart._seriesCapacity - prevCount;
        if (maxWrite <= 0) {
            continue;
        }

        const colorValid = ser.colorCol?.valid;
        let writeIdx = 0;
        for (let j = 0; j < sourceLength && writeIdx < maxWrite; j++) {
            const i = j;
            if (ser.yValid && !((ser.yValid[i >> 3] >> (i & 7)) & 1)) {
                continue;
            }

            if (
                ser.xCol &&
                ser.xValid &&
                !((ser.xValid[i >> 3] >> (i & 7)) & 1)
            ) {
                continue;
            }

            const colorIsNull =
                colorValid !== undefined &&
                !((colorValid[i >> 3] >> (i & 7)) & 1);

            const y = ser.yCol[i] as number;
            const x = ser.xCol ? (ser.xCol[i] as number) : startRow + i;
            if (isNaN(x) || isNaN(y)) {
                continue;
            }

            if (x < chart._xMin) {
                chart._xMin = x;
            }

            if (x > chart._xMax) {
                chart._xMax = x;
            }

            if (y < chart._yMin) {
                chart._yMin = y;
            }

            if (y > chart._yMax) {
                chart._yMax = y;
            }

            // Capture rebase origins from the first valid sample. The
            // origin is f64 in JS state but applied before every f32
            // store below — `_xData`, `_yData`, and the GPU `positions`
            // staging buffer all hold rebased values, so the projection
            // matrix's `tx`/`ty` terms (built from rebased extents in
            // cartesian-render) stay near zero and the shader's
            // `sx*x + tx` cancellation is precision-safe.
            if (isNaN(chart._xOrigin)) {
                chart._xOrigin = x;
            }

            if (isNaN(chart._yOrigin)) {
                chart._yOrigin = y;
            }

            const xr = x - chart._xOrigin;
            const yr = y - chart._yOrigin;

            const flatIdx = slotBase + prevCount + writeIdx;
            chart._xData![flatIdx] = xr;
            chart._yData![flatIdx] = yr;

            // Remember the source arrow row this slot came from so
            // lazy tooltip fetches can resolve columns on demand. In
            // split mode each series duplicates the same arrow row
            // into its own slot, so `startRow + i` is the right view
            // row regardless of `s`.
            chart._rowIndexData![flatIdx] = startRow + i;

            positions[writeIdx * 2] = xr;
            positions[writeIdx * 2 + 1] = yr;

            //  Color: unified resolution for split + non-split.
            // Read from this series' own color column (facet-specific
            // in split mode, the chart-wide column otherwise). Scales
            // (`_colorMin/_colorMax` and `_uniqueColorLabels`) are
            // shared across every series so identical values render
            // as identical colors in every facet.
            const cc = ser.colorCol;
            if (colorIsNull) {
                colorValues[writeIdx] = 0.5;
                chart._colorData![flatIdx] = 0.5;
            } else if (cc && !chart._colorIsString && cc.values) {
                const v = cc.values[i] as number;
                colorValues[writeIdx] = v;
                chart._colorData![flatIdx] = v;
                if (v < chart._colorMin) {
                    chart._colorMin = v;
                }

                if (v > chart._colorMax) {
                    chart._colorMax = v;
                }
            } else if (
                cc &&
                chart._colorIsString &&
                cc.indices &&
                cc.dictionary
            ) {
                const label = cc.dictionary[cc.indices[i]];

                // Dict-seeding above ensures this label is already
                // in `_uniqueColorLabels`; defensive insert for any
                // value that appears in data but not the dictionary
                // (shouldn't happen for Arrow dict columns).
                if (!chart._uniqueColorLabels.has(label)) {
                    chart._uniqueColorLabels.set(
                        label,
                        chart._uniqueColorLabels.size,
                    );
                    chart._colorMax = chart._uniqueColorLabels.size - 1;
                }

                const idx = chart._uniqueColorLabels.get(label)!;
                colorValues[writeIdx] = idx;
                chart._colorData![flatIdx] = idx;

                // Skip min/max updates — they were pinned to the full
                // palette-index domain during seeding.
            } else {
                colorValues[writeIdx] = 0.5;
                chart._colorData![flatIdx] = 0.5;
            }

            //  Label: resolve the slot's string via the column's arrow
            // dictionary; `LabelInterner.set` deduplicates across
            // facets so identical strings share an entry. Non-string
            // or unencoded label columns are silently skipped — the
            // slot stays at its `-1` initialization.
            if (chart._labels && ser.labelCol) {
                const lc = ser.labelCol;
                const labelValid = lc.valid;
                const labelIsNull =
                    labelValid !== undefined &&
                    !((labelValid[i >> 3] >> (i & 7)) & 1);
                if (!labelIsNull && lc.indices && lc.dictionary) {
                    chart._labels.set(flatIdx, lc.dictionary[lc.indices[i]]);
                }
            }

            //  Size: per-split size column, or global sizeName.
            if (ser.sizeCol) {
                const v = ser.sizeCol[i] as number;
                sizeValues[writeIdx] = v;
                if (v < chart._sizeMin) {
                    chart._sizeMin = v;
                }

                if (v > chart._sizeMax) {
                    chart._sizeMax = v;
                }
            } else if (nonSplitSizeValues) {
                const v = nonSplitSizeValues[i] as number;
                sizeValues[writeIdx] = v;
                if (v < chart._sizeMin) {
                    chart._sizeMin = v;
                }

                if (v > chart._sizeMax) {
                    chart._sizeMax = v;
                }
            } else {
                sizeValues[writeIdx] = 0;
            }

            writeIdx++;
        }

        if (writeIdx === 0) {
            continue;
        }

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

    // Total dataCount = sum of all series' uploaded counts.
    let total = 0;
    for (const c of chart._seriesUploadedCounts) {
        total += c;
    }

    chart._dataCount = total;
    glManager.uploadedCount = total;
    chart._hitTest.markDirty();

    if (isFinite(chart._xMin)) {
        chart.setZoomBaseDomain(
            chart._xMin,
            chart._xMax,
            chart._yMin,
            chart._yMax,
        );
    }
}
