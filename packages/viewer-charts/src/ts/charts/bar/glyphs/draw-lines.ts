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
import type { BarChart } from "../bar";
import { getInstancing } from "../../../webgl/instanced-attrs";
import lineVert from "../../../shaders/line-uniform.vert.glsl";
import lineFrag from "../../../shaders/line-uniform.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

const LINE_WIDTH_PX = 2.0;

export interface LineCache {
    program: WebGLProgram;
    cornerBuffer: WebGLBuffer;
    segmentBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_color: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_line_width: WebGLUniformLocation | null;
    a_start: number;
    a_end: number;
    a_corner: number;
}

function ensureLineCache(
    chart: BarChart,
    glManager: WebGLContextManager,
): LineCache {
    if (chart._lineCache) return chart._lineCache as LineCache;
    const gl = glManager.gl;
    const program = glManager.shaders.getOrCreate(
        "bar-line",
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
    const segmentBuffer = gl.createBuffer()!;
    const cache: LineCache = {
        program,
        cornerBuffer,
        segmentBuffer,
        u_projection: gl.getUniformLocation(program, "u_projection"),
        u_color: gl.getUniformLocation(program, "u_color"),
        u_resolution: gl.getUniformLocation(program, "u_resolution"),
        u_line_width: gl.getUniformLocation(program, "u_line_width"),
        a_start: gl.getAttribLocation(program, "a_start"),
        a_end: gl.getAttribLocation(program, "a_end"),
        a_corner: gl.getAttribLocation(program, "a_corner"),
    };
    chart._lineCache = cache;
    return cache;
}

/**
 * Draw every line-typed series as a per-series polyline at (catIdx, value).
 * Segments spanning invalid samples are skipped (the polyline gaps rather
 * than interpolating across missing values).
 *
 * One draw call per visible line series; each dispatch is instanced over
 * the number of valid segments in that series.
 */
export function drawLines(
    chart: BarChart,
    gl: GL,
    glManager: WebGLContextManager,
    projLeft: Float32Array,
    projRight: Float32Array,
): void {
    const lineSeries = chart._series.filter(
        (s) => s.chartType === "line" && !chart._hiddenSeries.has(s.seriesId),
    );
    if (lineSeries.length === 0) return;

    const N = chart._numCategories;
    const S = chart._series.length;
    if (N === 0 || S === 0) return;

    const cache = ensureLineCache(chart, glManager);
    const dpr = window.devicePixelRatio || 1;

    gl.useProgram(cache.program);
    gl.uniform2f(cache.u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(cache.u_line_width, LINE_WIDTH_PX * dpr);

    const instancing = getInstancing(glManager);
    const { setDivisor, drawArraysInstanced } = instancing;

    // Per-vertex corner buffer (0..3), divisor = 0.
    gl.bindBuffer(gl.ARRAY_BUFFER, cache.cornerBuffer);
    gl.enableVertexAttribArray(cache.a_corner);
    gl.vertexAttribPointer(cache.a_corner, 1, gl.FLOAT, false, 0, 0);
    setDivisor(cache.a_corner, 0);

    // Scratch buffer for one series's segment-pair vertices. Grown on demand.
    const stride = 2 * Float32Array.BYTES_PER_ELEMENT;

    for (const s of lineSeries) {
        // Collect contiguous valid (x, y) points. Invalid cells break the
        // polyline: emit the accumulated run, then start a new one.
        const runs = collectRuns(chart, s.seriesId, N, S);
        if (runs.length === 0) continue;

        // Flatten into one Float32Array containing consecutive points; we
        // draw `count - 1` instanced segments per run with byte offsets
        // advancing one point at a time.
        let total = 0;
        for (const r of runs) total += r.length / 2;
        if (total < 2) continue;

        const positions = new Float32Array(total * 2);
        const runOffsets: { offset: number; count: number }[] = [];
        let write = 0;
        for (const r of runs) {
            const count = r.length / 2;
            if (count < 2) {
                // Still copy to keep offsets consistent? Better: skip single
                // points; a polyline of one point has no segments.
                continue;
            }
            runOffsets.push({ offset: write, count });
            positions.set(r, write * 2);
            write += count;
        }
        if (runOffsets.length === 0) continue;

        gl.bindBuffer(gl.ARRAY_BUFFER, cache.segmentBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

        gl.uniformMatrix4fv(
            cache.u_projection,
            false,
            s.axis === 1 ? projRight : projLeft,
        );
        gl.uniform4f(cache.u_color, s.color[0], s.color[1], s.color[2], 1.0);

        for (const { offset, count } of runOffsets) {
            const startBytes = offset * stride;

            gl.enableVertexAttribArray(cache.a_start);
            gl.vertexAttribPointer(
                cache.a_start,
                2,
                gl.FLOAT,
                false,
                stride,
                startBytes,
            );
            setDivisor(cache.a_start, 1);

            gl.enableVertexAttribArray(cache.a_end);
            gl.vertexAttribPointer(
                cache.a_end,
                2,
                gl.FLOAT,
                false,
                stride,
                startBytes + stride,
            );
            setDivisor(cache.a_end, 1);

            drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count - 1);
        }
    }

    setDivisor(cache.a_start, 0);
    setDivisor(cache.a_end, 0);
}

/**
 * Collect contiguous valid (catIdx, value) runs for one series. Each run is
 * a Float32Array of `[x0,y0,x1,y1,...]` with at least 2 points — callers
 * drop 1-point runs.
 */
function collectRuns(
    chart: BarChart,
    seriesId: number,
    N: number,
    S: number,
): Float32Array[] {
    const samples = chart._samples;
    const valid = chart._sampleValid;
    const runs: Float32Array[] = [];
    let scratch: number[] = [];
    for (let c = 0; c < N; c++) {
        const idx = c * S + seriesId;
        const ok = (valid[idx >> 3] >> (idx & 7)) & 1;
        if (ok) {
            scratch.push(c, samples[idx]);
        } else if (scratch.length > 0) {
            runs.push(Float32Array.from(scratch));
            scratch = [];
        }
    }
    if (scratch.length > 0) runs.push(Float32Array.from(scratch));
    return runs;
}
