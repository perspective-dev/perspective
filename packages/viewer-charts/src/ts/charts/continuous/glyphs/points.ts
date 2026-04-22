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
        const gl = glManager.gl;
        const cache = chart._glyphCache as PointCache | null;
        if (!cache) return;

        gl.useProgram(cache.program);
        setUniforms(cache, gl, projection, chart);
        bindGradientTexture(
            glManager,
            chart._gradientCache!.texture,
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

        // Per-series tight draws: each series `s` occupies slots
        // `[s*cap, s*cap + count[s])`. Dispatching `count[s]` avoids
        // rasterizing unused tail slots. All attribs have divisor=0 so
        // `first` shifts them together.
        const numSeries = Math.max(1, chart._splitGroups.length);
        const cap = chart._seriesCapacity;
        for (let s = 0; s < numSeries; s++) {
            const count = chart._seriesUploadedCounts[s] ?? 0;
            if (count <= 0) continue;
            gl.drawArrays(gl.POINTS, s * cap, count);
        }
    }

    buildTooltipLines(chart: ContinuousChart, flatIdx: number): string[] {
        const lines: string[] = [];
        const rowPath = chart._stringRowData.get("__ROW_PATH__");
        if (rowPath && rowPath[flatIdx] != null) {
            lines.push(String(rowPath[flatIdx]));
        }
        for (const colName of chart._tooltipColumns) {
            const strData = chart._stringRowData.get(colName);
            if (strData && strData[flatIdx] != null) {
                lines.push(`${colName}: ${strData[flatIdx]}`);
                continue;
            }
            const numData = chart._numericRowData.get(colName);
            if (numData) {
                const colType = chart._columnTypes[colName] || "";
                const isDate = colType === "date" || colType === "datetime";
                const formatted = isDate
                    ? formatDateTickValue(numData[flatIdx])
                    : formatTickValue(numData[flatIdx]);
                lines.push(`${colName}: ${formatted}`);
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
