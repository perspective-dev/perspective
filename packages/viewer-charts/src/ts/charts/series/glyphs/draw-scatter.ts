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
import type { SeriesChart } from "../series";
import { compileProgram } from "../../../webgl/program-cache";
import scatterVert from "../../../shaders/y-scatter.vert.glsl";
import scatterFrag from "../../../shaders/y-scatter.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

const POINT_SIZE_PX = 8.0;

interface ScatterProgramCache {
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

/**
 * Persistent scatter glyph state — left/right axis position + color
 * buffers built once at data load. Pan/zoom redraws rebind without
 * uploading.
 */
export interface ScatterBuffers {
    program: WebGLProgram;
    posLeft: WebGLBuffer;
    posRight: WebGLBuffer;
    colLeft: WebGLBuffer;
    colRight: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_point_size: WebGLUniformLocation | null;
    a_position: number;
    a_color: number;
    leftCount: number;
    rightCount: number;
}

function ensureProgramCache(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): ScatterProgramCache {
    if (chart._scatterCache) {
        return chart._scatterCache as ScatterProgramCache;
    }

    const gl = glManager.gl;
    const partial = compileProgram<
        Omit<
            ScatterProgramCache,
            | "posLeftBuffer"
            | "posRightBuffer"
            | "colorLeftBuffer"
            | "colorRightBuffer"
        >
    >(
        glManager,
        "bar-scatter",
        scatterVert,
        scatterFrag,
        ["u_projection", "u_point_size"],
        ["a_position", "a_color"],
    );
    const cache: ScatterProgramCache = {
        ...partial,
        posLeftBuffer: gl.createBuffer()!,
        posRightBuffer: gl.createBuffer()!,
        colorLeftBuffer: gl.createBuffer()!,
        colorRightBuffer: gl.createBuffer()!,
    };
    chart._scatterCache = cache;
    return cache;
}

/**
 * Drop persistent scatter buffer state. The underlying GL buffer
 * objects on `_scatterCache` are reused (they're owned by the program
 * cache, not the per-build buffer view).
 */
export function invalidateScatterBuffers(chart: SeriesChart): void {
    chart._scatterBuffers = undefined;
}

/**
 * Reusable Float32 scratch for point assembly. Two buckets (positions
 * and colors) packed into one buffer; sized lazily.
 */
let _posScratch: Float32Array = new Float32Array(0);
let _colScratch: Float32Array = new Float32Array(0);

function ensureScratch(n: number): void {
    if (_posScratch.length < n * 2) {
        _posScratch = new Float32Array(Math.max(n * 2, _posScratch.length * 2));
    }

    if (_colScratch.length < n * 3) {
        _colScratch = new Float32Array(Math.max(n * 3, _colScratch.length * 2));
    }
}

/**
 * Build merged per-axis (position, color) buffers for every visible
 * scatter series and upload them. Hidden series are excluded — call
 * this from data-load and from the legend-toggle path so the GPU
 * buffers always reflect the current visible mask.
 */
export function rebuildScatterBuffers(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): void {
    const scatterSeries = chart._scatterSeries;
    if (scatterSeries.length === 0) {
        chart._scatterBuffers = undefined;
        return;
    }

    const N = chart._numCategories;
    const S = chart._series.length;
    if (N === 0 || S === 0) {
        chart._scatterBuffers = undefined;
        return;
    }

    const cache = ensureProgramCache(chart, glManager);
    const gl = glManager.gl;

    const samples = chart._samples;
    const valid = chart._sampleValid;
    const positions = chart._categoryPositions;
    const xOrigin = chart._categoryOrigin;
    const hidden = chart._hiddenSeries;

    // Two-pass: first count to size scratch, then fill. Avoids a number[]
    // growth path while still accommodating both axes in a single pair
    // of buffers.
    let leftCount = 0;
    let rightCount = 0;
    for (const s of scatterSeries) {
        if (hidden.has(s.seriesId)) {
            continue;
        }

        for (let c = 0; c < N; c++) {
            const idx = c * S + s.seriesId;
            if (!((valid[idx >> 3] >> (idx & 7)) & 1)) {
                continue;
            }

            if (s.axis === 1) {
                rightCount++;
            } else {
                leftCount++;
            }
        }
    }

    const total = leftCount + rightCount;
    if (total === 0) {
        chart._scatterBuffers = undefined;
        return;
    }

    ensureScratch(total);

    // Fill left bucket from `[0, leftCount)`, right bucket from
    // `[leftCount, total)` — single typed-array allocation each.
    let leftWrite = 0;
    let rightWrite = leftCount;
    for (const s of scatterSeries) {
        if (hidden.has(s.seriesId)) {
            continue;
        }

        const r = s.color[0];
        const g = s.color[1];
        const b = s.color[2];
        for (let c = 0; c < N; c++) {
            const idx = c * S + s.seriesId;
            if (!((valid[idx >> 3] >> (idx & 7)) & 1)) {
                continue;
            }

            const x = positions ? positions[c] - xOrigin : c;
            const v = samples[idx];
            if (s.axis === 1) {
                _posScratch[rightWrite * 2] = x;
                _posScratch[rightWrite * 2 + 1] = v;
                _colScratch[rightWrite * 3] = r;
                _colScratch[rightWrite * 3 + 1] = g;
                _colScratch[rightWrite * 3 + 2] = b;
                rightWrite++;
            } else {
                _posScratch[leftWrite * 2] = x;
                _posScratch[leftWrite * 2 + 1] = v;
                _colScratch[leftWrite * 3] = r;
                _colScratch[leftWrite * 3 + 1] = g;
                _colScratch[leftWrite * 3 + 2] = b;
                leftWrite++;
            }
        }
    }

    if (leftCount > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, cache.posLeftBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            _posScratch.subarray(0, leftCount * 2),
            gl.STATIC_DRAW,
        );
        gl.bindBuffer(gl.ARRAY_BUFFER, cache.colorLeftBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            _colScratch.subarray(0, leftCount * 3),
            gl.STATIC_DRAW,
        );
    }

    if (rightCount > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, cache.posRightBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            _posScratch.subarray(leftCount * 2, total * 2),
            gl.STATIC_DRAW,
        );
        gl.bindBuffer(gl.ARRAY_BUFFER, cache.colorRightBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            _colScratch.subarray(leftCount * 3, total * 3),
            gl.STATIC_DRAW,
        );
    }

    chart._scatterBuffers = {
        program: cache.program,
        posLeft: cache.posLeftBuffer,
        posRight: cache.posRightBuffer,
        colLeft: cache.colorLeftBuffer,
        colRight: cache.colorRightBuffer,
        u_projection: cache.u_projection,
        u_point_size: cache.u_point_size,
        a_position: cache.a_position,
        a_color: cache.a_color,
        leftCount,
        rightCount,
    };
}

/**
 * Bind the persistent left/right buffers and issue up to two draw
 * calls. No per-frame allocations or buffer uploads.
 */
export function drawScatter(
    chart: SeriesChart,
    gl: GL,
    glManager: WebGLContextManager,
    projLeft: Float32Array,
    projRight: Float32Array,
): void {
    const buf = chart._scatterBuffers as ScatterBuffers | undefined;
    if (!buf) {
        return;
    }

    if (buf.leftCount === 0 && buf.rightCount === 0) {
        return;
    }

    const dpr = glManager.dpr;
    gl.useProgram(buf.program);
    gl.uniform1f(buf.u_point_size, POINT_SIZE_PX * dpr);

    drawBucket(gl, buf, buf.posLeft, buf.colLeft, buf.leftCount, projLeft);
    drawBucket(gl, buf, buf.posRight, buf.colRight, buf.rightCount, projRight);

    // Suppress unused-param warning for `glManager` — kept for symmetry
    // with the other glyph entry points and for future use.
    void glManager;
}

function drawBucket(
    gl: GL,
    buf: ScatterBuffers,
    posBuf: WebGLBuffer,
    colBuf: WebGLBuffer,
    count: number,
    proj: Float32Array,
): void {
    if (count === 0) {
        return;
    }

    gl.uniformMatrix4fv(buf.u_projection, false, proj);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(buf.a_position);
    gl.vertexAttribPointer(buf.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.enableVertexAttribArray(buf.a_color);
    gl.vertexAttribPointer(buf.a_color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, count);
}
