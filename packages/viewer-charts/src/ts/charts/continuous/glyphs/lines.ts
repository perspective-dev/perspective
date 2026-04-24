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
import { getInstancing } from "../../../webgl/instanced-attrs";
import { formatTickValue, formatDateTickValue } from "../../../layout/ticks";
import lineVert from "../../../shaders/line.vert.glsl";
import lineFrag from "../../../shaders/line.frag.glsl";

const LINE_WIDTH_PX = 2.0;

interface LineCache {
    program: WebGLProgram;
    cornerBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_line_width: WebGLUniformLocation | null;
    u_color_range: WebGLUniformLocation | null;
    u_gradient_lut: WebGLUniformLocation | null;
    a_start: number;
    a_end: number;
    a_color_start: number;
    a_color_end: number;
    a_corner: number;
}

/**
 * Polyline glyph — instanced triangle-strip segments between adjacent
 * same-series points. Segments are scoped per-series via byte-offset
 * rebinding (see `drawLineSeries`); the shader reads the endpoints'
 * raw color values and samples the gradient LUT via the same sign-
 * aware `(v - cmin) / (cmax - cmin)` mapping the scatter glyph uses.
 */
export class LineGlyph implements Glyph {
    readonly name = "line" as const;

    ensureProgram(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
    ): void {
        if (chart._glyphCache) return;
        const gl = glManager.gl;
        const program = glManager.shaders.getOrCreate(
            "line",
            lineVert,
            lineFrag,
        );
        const cornerBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([0, 1, 2, 3]),
            gl.STATIC_DRAW,
        );
        const cache: LineCache = {
            program,
            cornerBuffer,
            u_projection: gl.getUniformLocation(program, "u_projection"),
            u_resolution: gl.getUniformLocation(program, "u_resolution"),
            u_line_width: gl.getUniformLocation(program, "u_line_width"),
            u_color_range: gl.getUniformLocation(program, "u_color_range"),
            u_gradient_lut: gl.getUniformLocation(program, "u_gradient_lut"),
            a_start: gl.getAttribLocation(program, "a_start"),
            a_end: gl.getAttribLocation(program, "a_end"),
            a_color_start: gl.getAttribLocation(program, "a_color_start"),
            a_color_end: gl.getAttribLocation(program, "a_color_end"),
            a_corner: gl.getAttribLocation(program, "a_corner"),
        };
        chart._glyphCache = cache;
    }

    draw(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
    ): void {
        const cache = chart._glyphCache as LineCache | null;
        if (!cache) return;
        const bind = bindLineState(cache, chart, glManager, projection);
        if (!bind) return;

        const numSeries = Math.max(1, chart._splitGroups.length);
        for (let s = 0; s < numSeries; s++) {
            drawLineSeries(cache, chart, glManager, s);
        }
        unbindLineDivisors(cache, glManager);
    }

    drawSeries(
        chart: ContinuousChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
        seriesIdx: number,
    ): void {
        const cache = chart._glyphCache as LineCache | null;
        if (!cache) return;
        if (!bindLineState(cache, chart, glManager, projection)) return;
        drawLineSeries(cache, chart, glManager, seriesIdx);
        unbindLineDivisors(cache, glManager);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    async buildTooltipLines(
        chart: ContinuousChart,
        flatIdx: number,
    ): Promise<string[]> {
        const lines: string[] = [];
        if (!chart._xData || !chart._yData) return lines;

        if (chart._splitGroups.length > 0 && chart._seriesCapacity > 0) {
            const seriesIdx = Math.floor(flatIdx / chart._seriesCapacity);
            const sg = chart._splitGroups[seriesIdx];
            if (sg) lines.push(sg.prefix);
        }

        const xVal = chart._xData[flatIdx];
        const yVal = chart._yData[flatIdx];

        const xType = chart._columnTypes[chart._xLabel] || "";
        const xIsDate = xType === "date" || xType === "datetime";
        const xFormatted = xIsDate
            ? formatDateTickValue(xVal)
            : formatTickValue(xVal);
        lines.push(`${chart._xLabel || "Row"}: ${xFormatted}`);

        const yType = chart._columnTypes[chart._yLabel] || "";
        const yIsDate = yType === "date" || yType === "datetime";
        const yFormatted = yIsDate
            ? formatDateTickValue(yVal)
            : formatTickValue(yVal);
        lines.push(`${chart._yLabel}: ${yFormatted}`);

        return lines;
    }

    tooltipOptions() {
        return { crosshair: true, highlightRadius: 5 };
    }

    destroy(chart: ContinuousChart): void {
        const cache = chart._glyphCache as LineCache | null;
        if (cache?.cornerBuffer && chart._glManager) {
            chart._glManager.gl.deleteBuffer(cache.cornerBuffer);
        }
    }
}

/**
 * Shared pre-draw state setup for `draw` and `drawSeries`. Binds the
 * program, uploads uniforms + gradient texture, binds the static corner
 * buffer, enables the instanced attributes. Returns false if the
 * gradient cache is missing.
 */
function bindLineState(
    cache: LineCache,
    chart: ContinuousChart,
    glManager: WebGLContextManager,
    projection: Float32Array,
): boolean {
    const gl = glManager.gl;
    if (!chart._gradientCache) return false;

    const dpr = window.devicePixelRatio || 1;

    gl.useProgram(cache.program);
    gl.uniformMatrix4fv(cache.u_projection, false, projection);
    gl.uniform2f(cache.u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(cache.u_line_width, LINE_WIDTH_PX * dpr);
    if (chart._colorMin < chart._colorMax) {
        gl.uniform2f(cache.u_color_range, chart._colorMin, chart._colorMax);
    } else {
        gl.uniform2f(cache.u_color_range, 0.0, 0.0);
    }

    bindGradientTexture(
        glManager,
        chart._gradientCache.texture,
        cache.u_gradient_lut,
        0,
    );

    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.cornerBuffer);
    gl.enableVertexAttribArray(cache.a_corner);
    gl.vertexAttribPointer(cache.a_corner, 1, gl.FLOAT, false, 0, 0);
    setDivisor(cache.a_corner, 0);

    gl.enableVertexAttribArray(cache.a_start);
    setDivisor(cache.a_start, 1);
    gl.enableVertexAttribArray(cache.a_end);
    setDivisor(cache.a_end, 1);
    gl.enableVertexAttribArray(cache.a_color_start);
    setDivisor(cache.a_color_start, 1);
    gl.enableVertexAttribArray(cache.a_color_end);
    setDivisor(cache.a_color_end, 1);

    return true;
}

/**
 * Dispatch one instanced draw for series `s`. Rebinds start/end attrib
 * pointers with byte offsets into the slotted buffer so instance 0 is
 * the series' first segment.
 */
function drawLineSeries(
    cache: LineCache,
    chart: ContinuousChart,
    glManager: WebGLContextManager,
    s: number,
): void {
    const count = chart._seriesUploadedCounts[s] ?? 0;
    if (count < 2) return;

    const gl = glManager.gl;
    const cap = chart._seriesCapacity;
    const posStride = 2 * Float32Array.BYTES_PER_ELEMENT;
    const idStride = Float32Array.BYTES_PER_ELEMENT;

    const posBuf = glManager.bufferPool.getOrCreate(
        "a_position",
        2,
        Float32Array.BYTES_PER_ELEMENT,
    );
    const idBuf = glManager.bufferPool.getOrCreate(
        "a_color_value",
        1,
        Float32Array.BYTES_PER_ELEMENT,
    );

    const posBase = s * cap * posStride;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf.buffer);
    gl.vertexAttribPointer(
        cache.a_start,
        2,
        gl.FLOAT,
        false,
        posStride,
        posBase,
    );
    gl.vertexAttribPointer(
        cache.a_end,
        2,
        gl.FLOAT,
        false,
        posStride,
        posBase + posStride,
    );

    const idBase = s * cap * idStride;
    gl.bindBuffer(gl.ARRAY_BUFFER, idBuf.buffer);
    gl.vertexAttribPointer(
        cache.a_color_start,
        1,
        gl.FLOAT,
        false,
        idStride,
        idBase,
    );
    gl.vertexAttribPointer(
        cache.a_color_end,
        1,
        gl.FLOAT,
        false,
        idStride,
        idBase + idStride,
    );

    getInstancing(glManager).drawArraysInstanced(
        gl.TRIANGLE_STRIP,
        0,
        4,
        count - 1,
    );
}

function unbindLineDivisors(
    cache: LineCache,
    glManager: WebGLContextManager,
): void {
    const { setDivisor } = getInstancing(glManager);
    setDivisor(cache.a_start, 0);
    setDivisor(cache.a_end, 0);
    setDivisor(cache.a_color_start, 0);
    setDivisor(cache.a_color_end, 0);
}
