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
import scatterVert from "../../../shaders/y-scatter.vert.glsl";
import scatterFrag from "../../../shaders/y-scatter.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

const POINT_SIZE_PX = 8.0;

export interface ScatterCache {
    program: WebGLProgram;
    posLeftBuffer: WebGLBuffer;
    posRightBuffer: WebGLBuffer;
    colorLeftBuffer: WebGLBuffer;
    colorRightBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_point_size: WebGLUniformLocation | null;
    a_position: number;
    a_color: number;
}

function ensureScatterCache(
    chart: BarChart,
    glManager: WebGLContextManager,
): ScatterCache {
    if (chart._scatterCache) return chart._scatterCache as ScatterCache;
    const gl = glManager.gl;
    const program = glManager.shaders.getOrCreate(
        "bar-scatter",
        scatterVert,
        scatterFrag,
    );
    const cache: ScatterCache = {
        program,
        posLeftBuffer: gl.createBuffer()!,
        posRightBuffer: gl.createBuffer()!,
        colorLeftBuffer: gl.createBuffer()!,
        colorRightBuffer: gl.createBuffer()!,
        u_projection: gl.getUniformLocation(program, "u_projection"),
        u_point_size: gl.getUniformLocation(program, "u_point_size"),
        a_position: gl.getAttribLocation(program, "a_position"),
        a_color: gl.getAttribLocation(program, "a_color"),
    };
    chart._scatterCache = cache;
    return cache;
}

/**
 * Draw every scatter-typed series as per-(series, category) points colored
 * from the series palette. Collapses both axes into 2 draw calls (one per
 * projection); each vertex carries its own RGB, so series don't need
 * separate draws to change color.
 */
export function drawScatter(
    chart: BarChart,
    gl: GL,
    glManager: WebGLContextManager,
    projLeft: Float32Array,
    projRight: Float32Array,
): void {
    const scatterSeries = chart._series.filter(
        (s) =>
            s.chartType === "scatter" && !chart._hiddenSeries.has(s.seriesId),
    );
    if (scatterSeries.length === 0) return;

    const N = chart._numCategories;
    const S = chart._series.length;
    if (N === 0 || S === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const cache = ensureScatterCache(chart, glManager);

    // Partition by axis so each draw uses one projection uniform.
    const leftPos: number[] = [];
    const leftCol: number[] = [];
    const rightPos: number[] = [];
    const rightCol: number[] = [];
    const samples = chart._samples;
    const valid = chart._sampleValid;
    for (const s of scatterSeries) {
        const dst = s.axis === 1 ? rightPos : leftPos;
        const col = s.axis === 1 ? rightCol : leftCol;
        for (let c = 0; c < N; c++) {
            const idx = c * S + s.seriesId;
            if (!((valid[idx >> 3] >> (idx & 7)) & 1)) continue;
            dst.push(c, samples[idx]);
            col.push(s.color[0], s.color[1], s.color[2]);
        }
    }

    gl.useProgram(cache.program);
    gl.uniform1f(cache.u_point_size, POINT_SIZE_PX * dpr);

    drawBucket(
        gl,
        cache,
        cache.posLeftBuffer,
        cache.colorLeftBuffer,
        leftPos,
        leftCol,
        projLeft,
    );
    drawBucket(
        gl,
        cache,
        cache.posRightBuffer,
        cache.colorRightBuffer,
        rightPos,
        rightCol,
        projRight,
    );
}

function drawBucket(
    gl: GL,
    cache: ScatterCache,
    posBuf: WebGLBuffer,
    colBuf: WebGLBuffer,
    pos: number[],
    col: number[],
    proj: Float32Array,
): void {
    const count = pos.length / 2;
    if (count === 0) return;

    gl.uniformMatrix4fv(cache.u_projection, false, proj);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(cache.a_position);
    gl.vertexAttribPointer(cache.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(cache.a_color);
    gl.vertexAttribPointer(cache.a_color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, count);
}
