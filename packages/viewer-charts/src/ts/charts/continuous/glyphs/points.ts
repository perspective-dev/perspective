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

import type { WebGLContextManager } from "../../../webgl/context-manager";
import type { ContinuousChart } from "../continuous-chart";
import type { Glyph } from "../glyph";
import { bindGradientTexture } from "../../../webgl/gradient-texture";
import { formatTickValue, formatDateTickValue } from "../../../layout/ticks";
import scatterVert from "../../../shaders/scatter.vert.glsl";
import scatterFrag from "../../../shaders/scatter.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface PointCache {
    program: WebGLProgram;
    u_projection: WebGLUniformLocation | null;
    u_point_size: WebGLUniformLocation | null;
    u_color_range: WebGLUniformLocation | null;
    u_gradient_lut: WebGLUniformLocation | null;
    u_size_range: WebGLUniformLocation | null;
    u_point_size_range: WebGLUniformLocation | null;
    a_position: number;
    a_color_value: number;
    a_size_value: number;
}

/**
 * `gl.POINTS` glyph — one squared/antialiased point per data row. Color
 * and size are driven by the shared `a_color_value` / `a_size_value`
 * buffers; the vertex shader does sign-aware color-t mapping and samples
 * the gradient LUT. One draw call per series (the slot layout leaves
 * gaps at each series' tail that we can't safely include in a single
 * draw — dispatching `count[s]` per series skips them).
 */
export class PointGlyph implements Glyph {
    readonly name = "point" as const;

    ensureProgram(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
    ): void {
        if (chart._glyphCache) return;
        const gl = glManager.gl;
        const program = glManager.shaders.getOrCreate(
            "scatter",
            scatterVert,
            scatterFrag,
        );
        const cache: PointCache = {
            program,
            u_projection: gl.getUniformLocation(program, "u_projection"),
            u_point_size: gl.getUniformLocation(program, "u_point_size"),
            u_color_range: gl.getUniformLocation(program, "u_color_range"),
            u_gradient_lut: gl.getUniformLocation(program, "u_gradient_lut"),
            u_size_range: gl.getUniformLocation(program, "u_size_range"),
            u_point_size_range: gl.getUniformLocation(
                program,
                "u_point_size_range",
            ),
            a_position: gl.getAttribLocation(program, "a_position"),
            a_color_value: gl.getAttribLocation(program, "a_color_value"),
            a_size_value: gl.getAttribLocation(program, "a_size_value"),
        };
        chart._glyphCache = cache;
    }

    draw(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
    ): void {
        const cache = chart._glyphCache as PointCache | null;
        if (!cache) return;
        if (!bindPointState(cache, chart, glManager, projection)) return;

        // Per-series tight draws: each series `s` occupies slots
        // `[s*cap, s*cap + count[s])`. Dispatching `count[s]` avoids
        // rasterizing unused tail slots. All attribs have divisor=0 so
        // `first` shifts them together.
        const gl = glManager.gl;
        const numSeries = Math.max(1, chart._splitGroups.length);
        const cap = chart._seriesCapacity;
        for (let s = 0; s < numSeries; s++) {
            const count = chart._seriesUploadedCounts[s] ?? 0;
            if (count <= 0) continue;
            gl.drawArrays(gl.POINTS, s * cap, count);
        }
    }

    drawSeries(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
        seriesIdx: number,
    ): void {
        const cache = chart._glyphCache as PointCache | null;
        if (!cache) return;
        if (!bindPointState(cache, chart, glManager, projection)) return;

        const count = chart._seriesUploadedCounts[seriesIdx] ?? 0;
        if (count <= 0) return;
        const gl = glManager.gl;
        const cap = chart._seriesCapacity;
        gl.drawArrays(gl.POINTS, seriesIdx * cap, count);
    }

    async buildTooltipLines(
        chart: ContinuousChart,
        flatIdx: number,
    ): Promise<string[]> {
        const lines: string[] = [];
        if (!chart._rowIndexData || !chart._lazyRows) return lines;
        const rowIdx = chart._rowIndexData[flatIdx];
        if (rowIdx < 0) return lines;

        // In split mode, the row the user hovered corresponds to one
        // series — so surface the split prefix as the first line so
        // the user can tell which facet's data this is.
        if (chart._splitGroups.length > 0 && chart._seriesCapacity > 0) {
            const seriesIdx = Math.floor(flatIdx / chart._seriesCapacity);
            const sg = chart._splitGroups[seriesIdx];
            if (sg?.prefix) lines.push(sg.prefix);
        }

        const row = await chart._lazyRows.fetchRow(rowIdx);

        // Row-path (group_by): the view emits `__ROW_PATH_0__` …
        // `__ROW_PATH_N__` dictionary columns. `LazyRowFetcher`
        // filters out `__` columns, so fetch the row-path from the
        // levels we know: iterate the view schema via `_columnTypes`
        // is costly; instead, reuse the column-type map to infer only
        // the non-metadata columns. Row-path columns are metadata; we
        // skip them here and the visual hierarchy is instead conveyed
        // by the aggregated view already surfacing grouped columns.
        //
        // In split mode we only have per-split columns like
        // `A|price`. Filter to the prefix the user hovered on so
        // the tooltip shows only relevant facet values.
        const prefixFilter =
            chart._splitGroups.length > 0 && chart._seriesCapacity > 0
                ? (chart._splitGroups[
                      Math.floor(flatIdx / chart._seriesCapacity)
                  ]?.prefix ?? null)
                : null;

        for (const [colName, value] of row) {
            if (value === null || value === undefined) continue;
            let displayName = colName;
            if (prefixFilter !== null) {
                const expected = `${prefixFilter}|`;
                if (!colName.startsWith(expected)) continue;
                displayName = colName.substring(expected.length);
            } else if (colName.includes("|")) {
                // Non-split chart that somehow has pipe-prefixed
                // columns (shouldn't happen, but defensively skip).
                continue;
            }
            if (typeof value === "number") {
                const colType = chart._columnTypes[colName] || "";
                const isDate = colType === "date" || colType === "datetime";
                const formatted = isDate
                    ? formatDateTickValue(value)
                    : formatTickValue(value);
                lines.push(`${displayName}: ${formatted}`);
            } else {
                lines.push(`${displayName}: ${value}`);
            }
        }
        return lines;
    }

    tooltipOptions() {
        return { crosshair: true, highlightRadius: 6 };
    }

    destroy(_chart: ContinuousChart): void {
        // Program lifetime is owned by the shader registry; nothing glyph-
        // specific to free here beyond the cache reference itself, which
        // `ContinuousChart.destroyInternal` clears.
    }
}

function setUniforms(
    cache: PointCache,
    gl: GL,
    projection: Float32Array,
    chart: ContinuousChart,
): void {
    const dpr = window.devicePixelRatio || 1;
    gl.uniformMatrix4fv(cache.u_projection, false, projection);
    gl.uniform1f(cache.u_point_size, 8.0 * dpr);

    if (chart._colorMin < chart._colorMax) {
        gl.uniform2f(cache.u_color_range, chart._colorMin, chart._colorMax);
    } else {
        gl.uniform2f(cache.u_color_range, 0.0, 0.0);
    }

    if (chart._sizeMin < chart._sizeMax) {
        gl.uniform2f(cache.u_size_range, chart._sizeMin, chart._sizeMax);
    } else {
        gl.uniform2f(cache.u_size_range, 0.0, 0.0);
    }

    gl.uniform2f(cache.u_point_size_range, 2.0 * dpr, 16.0 * dpr);
}

/**
 * Shared pre-draw state setup for `draw` and `drawSeries`. Binds the
 * program, uploads uniforms + gradient texture, wires the three per-
 * vertex attributes. Returns false if the gradient cache is missing.
 */
function bindPointState(
    cache: PointCache,
    chart: ContinuousChart,
    glManager: WebGLContextManager,
    projection: Float32Array,
): boolean {
    const gl = glManager.gl;
    if (!chart._gradientCache) return false;

    gl.useProgram(cache.program);
    setUniforms(cache, gl, projection, chart);
    bindGradientTexture(
        glManager,
        chart._gradientCache.texture,
        cache.u_gradient_lut,
        0,
    );

    const posBuf = glManager.bufferPool.getOrCreate(
        "a_position",
        2,
        Float32Array.BYTES_PER_ELEMENT,
    );
    const colorBuf = glManager.bufferPool.getOrCreate(
        "a_color_value",
        1,
        Float32Array.BYTES_PER_ELEMENT,
    );
    const sizeBuf = glManager.bufferPool.getOrCreate(
        "a_size_value",
        1,
        Float32Array.BYTES_PER_ELEMENT,
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf.buffer);
    gl.enableVertexAttribArray(cache.a_position);
    gl.vertexAttribPointer(cache.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf.buffer);
    gl.enableVertexAttribArray(cache.a_color_value);
    gl.vertexAttribPointer(cache.a_color_value, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf.buffer);
    gl.enableVertexAttribArray(cache.a_size_value);
    gl.vertexAttribPointer(cache.a_size_value, 1, gl.FLOAT, false, 0, 0);

    return true;
}
