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
import type { CandlestickChart } from "../candlestick";
import type { CandleRecord } from "../candlestick-build";
import { getInstancing } from "../../../webgl/instanced-attrs";
import bodyVert from "../../../shaders/candlestick-body.vert.glsl";
import bodyFrag from "../../../shaders/candlestick-body.frag.glsl";
import lineVert from "../../../shaders/line-uniform.vert.glsl";
import lineFrag from "../../../shaders/line-uniform.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

const WICK_WIDTH_PX = 1.0;

interface BodyCache {
    program: WebGLProgram;
    quadBuffer: WebGLBuffer;
    instanceBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    a_corner: number;
    a_x_center: number;
    a_half_width: number;
    a_y0: number;
    a_y1: number;
    a_color: number;
}

interface WickCache {
    program: WebGLProgram;
    cornerBuffer: WebGLBuffer;
    segmentBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_color: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_line_width: WebGLUniformLocation | null;
    a_corner: number;
    a_start: number;
    a_end: number;
}

interface Cache {
    body: BodyCache;
    wick: WickCache;
}

function ensureCache(
    chart: CandlestickChart,
    glManager: WebGLContextManager,
): Cache {
    if (chart._wickCache) return chart._wickCache as Cache;
    const gl = glManager.gl;

    // ── Body shader + buffers ────────────────────────────────────────
    const bodyProg = glManager.shaders.getOrCreate(
        "candlestick-body",
        bodyVert,
        bodyFrag,
    );
    const quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        gl.STATIC_DRAW,
    );
    const instanceBuffer = gl.createBuffer()!;
    const body: BodyCache = {
        program: bodyProg,
        quadBuffer,
        instanceBuffer,
        u_projection: gl.getUniformLocation(bodyProg, "u_projection"),
        a_corner: gl.getAttribLocation(bodyProg, "a_corner"),
        a_x_center: gl.getAttribLocation(bodyProg, "a_x_center"),
        a_half_width: gl.getAttribLocation(bodyProg, "a_half_width"),
        a_y0: gl.getAttribLocation(bodyProg, "a_y0"),
        a_y1: gl.getAttribLocation(bodyProg, "a_y1"),
        a_color: gl.getAttribLocation(bodyProg, "a_color"),
    };

    // ── Wick shader (reused for OHLC too via draw-ohlc) ──────────────
    const wickProg = glManager.shaders.getOrCreate(
        "line-uniform",
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
    const wick: WickCache = {
        program: wickProg,
        cornerBuffer,
        segmentBuffer: gl.createBuffer()!,
        u_projection: gl.getUniformLocation(wickProg, "u_projection"),
        u_color: gl.getUniformLocation(wickProg, "u_color"),
        u_resolution: gl.getUniformLocation(wickProg, "u_resolution"),
        u_line_width: gl.getUniformLocation(wickProg, "u_line_width"),
        a_corner: gl.getAttribLocation(wickProg, "a_corner"),
        a_start: gl.getAttribLocation(wickProg, "a_start"),
        a_end: gl.getAttribLocation(wickProg, "a_end"),
    };

    chart._wickCache = { body, wick };
    return chart._wickCache as Cache;
}

export function drawCandlesticks(
    chart: CandlestickChart,
    gl: GL,
    glManager: WebGLContextManager,
    projection: Float32Array,
): void {
    const candles = chart._candles;
    if (candles.length === 0) return;

    const cache = ensureCache(chart, glManager);
    drawBodies(chart, gl, glManager, cache.body, candles, projection);
    drawWicks(chart, gl, glManager, cache.wick, candles, projection);
}

/**
 * Upload one filled-rect instance per candle and issue a single
 * instanced draw. Interleaved layout:
 *   [ xCenter, halfWidth, y0, y1, r, g, b ]   (7 floats / candle)
 */
function drawBodies(
    chart: CandlestickChart,
    gl: GL,
    glManager: WebGLContextManager,
    cache: BodyCache,
    candles: CandleRecord[],
    projection: Float32Array,
): void {
    const stride = 7 * Float32Array.BYTES_PER_ELEMENT;
    const data = new Float32Array(candles.length * 7);
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const bodyLow = Math.min(c.open, c.close);
        const bodyHigh = Math.max(c.open, c.close);
        const col = c.isUp ? chart._upColor : chart._downColor;
        const o = i * 7;
        data[o + 0] = c.xCenter;
        data[o + 1] = c.halfWidth * 0.7; // bodies narrower than the slot
        data[o + 2] = bodyLow;
        data[o + 3] = bodyHigh;
        data[o + 4] = col[0];
        data[o + 5] = col[1];
        data[o + 6] = col[2];
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.useProgram(cache.program);
    gl.uniformMatrix4fv(cache.u_projection, false, projection);

    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;

    // Per-vertex corner.
    gl.bindBuffer(gl.ARRAY_BUFFER, cache.quadBuffer);
    gl.enableVertexAttribArray(cache.a_corner);
    gl.vertexAttribPointer(cache.a_corner, 2, gl.FLOAT, false, 0, 0);
    setDivisor(cache.a_corner, 0);

    // Per-instance attributes, all sourced from the interleaved buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, cache.instanceBuffer);
    const f = Float32Array.BYTES_PER_ELEMENT;
    const bind = (loc: number, size: number, offset: number) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        setDivisor(loc, 1);
    };
    bind(cache.a_x_center, 1, 0);
    bind(cache.a_half_width, 1, 1 * f);
    bind(cache.a_y0, 1, 2 * f);
    bind(cache.a_y1, 1, 3 * f);
    bind(cache.a_color, 3, 4 * f);

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, candles.length);

    setDivisor(cache.a_x_center, 0);
    setDivisor(cache.a_half_width, 0);
    setDivisor(cache.a_y0, 0);
    setDivisor(cache.a_y1, 0);
    setDivisor(cache.a_color, 0);
}

/**
 * Wicks: thin vertical line from `low` to `high` through each candle's
 * x-center. One draw per color (up / down) since the line-uniform
 * shader takes color as a uniform.
 */
function drawWicks(
    chart: CandlestickChart,
    gl: GL,
    glManager: WebGLContextManager,
    cache: WickCache,
    candles: CandleRecord[],
    projection: Float32Array,
): void {
    drawWickGroup(
        gl,
        glManager,
        cache,
        candles.filter((c) => c.isUp),
        chart._upColor,
        projection,
    );
    drawWickGroup(
        gl,
        glManager,
        cache,
        candles.filter((c) => !c.isUp),
        chart._downColor,
        projection,
    );
}

/**
 * Issue one instanced draw over `group`, where each instance is a
 * single line segment. Layout: consecutive `[x, y_start, x, y_end, …]`
 * so `a_start` reads offset 0 and `a_end` reads offset stride — exactly
 * the trick `draw-lines.ts` uses for continuous runs.
 */
function drawWickGroup(
    gl: GL,
    glManager: WebGLContextManager,
    cache: WickCache,
    group: CandleRecord[],
    color: [number, number, number],
    projection: Float32Array,
): void {
    if (group.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const stride = 2 * Float32Array.BYTES_PER_ELEMENT;

    // One pair of points per wick — not a continuous polyline. Pack
    // start/end together; enable divisor=1 on a_start with offset 0 and
    // on a_end with offset `stride`.
    const data = new Float32Array(group.length * 4);
    for (let i = 0; i < group.length; i++) {
        const c = group[i];
        const o = i * 4;
        data[o + 0] = c.xCenter;
        data[o + 1] = c.low;
        data[o + 2] = c.xCenter;
        data[o + 3] = c.high;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.segmentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.useProgram(cache.program);
    gl.uniformMatrix4fv(cache.u_projection, false, projection);
    gl.uniform2f(
        cache.u_resolution,
        (gl.canvas as HTMLCanvasElement).width,
        (gl.canvas as HTMLCanvasElement).height,
    );
    gl.uniform1f(cache.u_line_width, WICK_WIDTH_PX * dpr);
    gl.uniform4f(cache.u_color, color[0], color[1], color[2], 1.0);

    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.cornerBuffer);
    gl.enableVertexAttribArray(cache.a_corner);
    gl.vertexAttribPointer(cache.a_corner, 1, gl.FLOAT, false, 0, 0);
    setDivisor(cache.a_corner, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.segmentBuffer);
    gl.enableVertexAttribArray(cache.a_start);
    gl.vertexAttribPointer(cache.a_start, 2, gl.FLOAT, false, 2 * stride, 0);
    setDivisor(cache.a_start, 1);
    gl.enableVertexAttribArray(cache.a_end);
    gl.vertexAttribPointer(cache.a_end, 2, gl.FLOAT, false, 2 * stride, stride);
    setDivisor(cache.a_end, 1);

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, group.length);

    setDivisor(cache.a_start, 0);
    setDivisor(cache.a_end, 0);
}
