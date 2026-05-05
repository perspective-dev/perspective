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
import {
    createLineCornerBuffer,
    createQuadCornerBuffer,
    getInstancing,
} from "../../../webgl/instanced-attrs";
import { compileProgram } from "../../../webgl/program-cache";
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

interface ProgramCache {
    body: BodyCache;
    wick: WickCache;
}

/**
 * Persistent body + wick vertex buffer state. Built once per data load
 * by `rebuildCandlestickBodyAndWickBuffers`; pan/zoom redraws bind +
 * dispatch with no uploads.
 */
interface BodyWickBuffers {
    /**
     * Number of body instances (= candle count).
     */
    bodyCount: number;

    /**
     * Number of up-wick instances (one segment per up candle).
     */
    upWickCount: number;

    /**
     * Number of down-wick instances.
     */
    downWickCount: number;

    /**
     * Persistent GPU buffer for up wicks. Layout: [x,low, x,high, ...].
     */
    upWickBuffer: WebGLBuffer;

    /**
     * Persistent GPU buffer for down wicks.
     */
    downWickBuffer: WebGLBuffer;
}

function ensureProgramCache(
    chart: CandlestickChart,
    glManager: WebGLContextManager,
): ProgramCache {
    if (chart._wickCache && (chart._wickCache as any).body) {
        return chart._wickCache as ProgramCache;
    }

    const gl = glManager.gl;

    const quadBuffer = createQuadCornerBuffer(gl);
    const bodyPartial = compileProgram<
        Omit<BodyCache, "quadBuffer" | "instanceBuffer">
    >(
        glManager,
        "candlestick-body",
        bodyVert,
        bodyFrag,
        ["u_projection"],
        ["a_corner", "a_x_center", "a_half_width", "a_y0", "a_y1", "a_color"],
    );
    const body: BodyCache = {
        ...bodyPartial,
        quadBuffer,
        instanceBuffer: gl.createBuffer()!,
    };

    const cornerBuffer = createLineCornerBuffer(gl);
    const wickPartial = compileProgram<
        Omit<WickCache, "cornerBuffer" | "segmentBuffer">
    >(
        glManager,
        "line-uniform",
        lineVert,
        lineFrag,
        ["u_projection", "u_color", "u_resolution", "u_line_width"],
        ["a_corner", "a_start", "a_end"],
    );
    const wick: WickCache = {
        ...wickPartial,
        cornerBuffer,
        segmentBuffer: gl.createBuffer()!,
    };

    const existing = (chart._wickCache as any) || {};
    chart._wickCache = { ...existing, body, wick };
    return chart._wickCache as ProgramCache;
}

/**
 * Drop persistent body + wick vertex buffers. Called from data-load
 * (before `rebuild...`) and from chart-destroy paths.
 */
export function invalidateCandlestickBodyAndWickBuffers(
    chart: CandlestickChart,
): void {
    const buf = (chart._glyphBuffers as { bodyWick?: BodyWickBuffers })
        ?.bodyWick;
    if (!buf || !chart._glManager) {
        if (chart._glyphBuffers) {
            (chart._glyphBuffers as { bodyWick?: BodyWickBuffers }).bodyWick =
                undefined;
        }

        return;
    }

    const gl = chart._glManager.gl;
    gl.deleteBuffer(buf.upWickBuffer);
    gl.deleteBuffer(buf.downWickBuffer);
    (chart._glyphBuffers as { bodyWick?: BodyWickBuffers }).bodyWick =
        undefined;
}

/**
 * Pre-build the per-instance body buffer (interleaved
 * [xCenter, halfWidth, y0, y1, r, g, b]) and the up/down wick
 * line-segment buffers. Single GPU upload per buffer per data load.
 */
export function rebuildCandlestickBodyAndWickBuffers(
    chart: CandlestickChart,
    glManager: WebGLContextManager,
): void {
    const candles = chart._candles;
    const cache = ensureProgramCache(chart, glManager);
    const gl = glManager.gl;
    const xOrigin = chart._categoryOrigin;

    if (candles.count === 0) {
        if (!chart._glyphBuffers) {
            chart._glyphBuffers = {};
        }

        const upBuf = gl.createBuffer()!;
        const downBuf = gl.createBuffer()!;
        (chart._glyphBuffers as { bodyWick?: BodyWickBuffers }).bodyWick = {
            bodyCount: 0,
            upWickCount: 0,
            downWickCount: 0,
            upWickBuffer: upBuf,
            downWickBuffer: downBuf,
        };
        return;
    }

    //  Body buffer: 7 floats per candle (interleaved).
    const data = new Float32Array(candles.count * 7);
    let upCount = 0;
    let downCount = 0;
    const xC = candles.xCenter;
    const hw = candles.halfWidth;
    const open = candles.open;
    const close = candles.close;
    const isUp = candles.isUp;
    const upColor = chart._upColor;
    const downColor = chart._downColor;
    for (let i = 0; i < candles.count; i++) {
        const o = open[i];
        const c = close[i];
        const bodyLow = o < c ? o : c;
        const bodyHigh = o < c ? c : o;
        const up = isUp[i] !== 0;
        const col = up ? upColor : downColor;
        const off = i * 7;
        data[off + 0] = xC[i] - xOrigin;
        data[off + 1] = hw[i] * 0.7;
        data[off + 2] = bodyLow;
        data[off + 3] = bodyHigh;
        data[off + 4] = col[0];
        data[off + 5] = col[1];
        data[off + 6] = col[2];

        if (up) {
            upCount++;
        } else {
            downCount++;
        }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.body.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    //  Wick buffers: per-color, packed [x,low, x,high] segments.
    const upWick = new Float32Array(upCount * 4);
    const downWick = new Float32Array(downCount * 4);
    let upW = 0;
    let downW = 0;
    const lows = candles.low;
    const highs = candles.high;
    for (let i = 0; i < candles.count; i++) {
        const x = xC[i] - xOrigin;
        const lo = lows[i];
        const hi = highs[i];
        if (isUp[i] !== 0) {
            upWick[upW + 0] = x;
            upWick[upW + 1] = lo;
            upWick[upW + 2] = x;
            upWick[upW + 3] = hi;
            upW += 4;
        } else {
            downWick[downW + 0] = x;
            downWick[downW + 1] = lo;
            downWick[downW + 2] = x;
            downWick[downW + 3] = hi;
            downW += 4;
        }
    }

    // Reuse existing wick GL buffers when available; otherwise allocate.
    const prev = (chart._glyphBuffers as { bodyWick?: BodyWickBuffers })
        ?.bodyWick;
    const upBuf = prev?.upWickBuffer ?? gl.createBuffer()!;
    const downBuf = prev?.downWickBuffer ?? gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, upBuf);
    gl.bufferData(gl.ARRAY_BUFFER, upWick, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, downBuf);
    gl.bufferData(gl.ARRAY_BUFFER, downWick, gl.STATIC_DRAW);

    if (!chart._glyphBuffers) {
        chart._glyphBuffers = {};
    }

    (chart._glyphBuffers as { bodyWick?: BodyWickBuffers }).bodyWick = {
        bodyCount: candles.count,
        upWickCount: upCount,
        downWickCount: downCount,
        upWickBuffer: upBuf,
        downWickBuffer: downBuf,
    };
}

export function drawCandlesticks(
    chart: CandlestickChart,
    gl: GL,
    glManager: WebGLContextManager,
    projection: Float32Array,
): void {
    const buf = (chart._glyphBuffers as { bodyWick?: BodyWickBuffers })
        ?.bodyWick;
    if (!buf || buf.bodyCount === 0) {
        return;
    }

    const cache = ensureProgramCache(chart, glManager);
    drawBodies(gl, glManager, cache.body, buf.bodyCount, projection);
    drawWicks(chart, gl, glManager, cache.wick, buf, projection);
}

/**
 * Bind the persistent body buffer and issue one instanced draw.
 */
function drawBodies(
    gl: GL,
    glManager: WebGLContextManager,
    cache: BodyCache,
    instanceCount: number,
    projection: Float32Array,
): void {
    if (instanceCount === 0) {
        return;
    }

    const stride = 7 * Float32Array.BYTES_PER_ELEMENT;

    gl.useProgram(cache.program);
    gl.uniformMatrix4fv(cache.u_projection, false, projection);

    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;

    // Per-vertex corner.
    gl.bindBuffer(gl.ARRAY_BUFFER, cache.quadBuffer);
    gl.enableVertexAttribArray(cache.a_corner);
    gl.vertexAttribPointer(cache.a_corner, 2, gl.FLOAT, false, 0, 0);
    setDivisor(cache.a_corner, 0);

    // Per-instance attributes from the persistent interleaved buffer.
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

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);

    setDivisor(cache.a_x_center, 0);
    setDivisor(cache.a_half_width, 0);
    setDivisor(cache.a_y0, 0);
    setDivisor(cache.a_y1, 0);
    setDivisor(cache.a_color, 0);
}

/**
 * Bind the persistent up/down wick buffers and dispatch one
 * instanced draw per color group. No per-frame allocations.
 */
function drawWicks(
    chart: CandlestickChart,
    gl: GL,
    glManager: WebGLContextManager,
    cache: WickCache,
    buf: BodyWickBuffers,
    projection: Float32Array,
): void {
    if (buf.upWickCount === 0 && buf.downWickCount === 0) {
        return;
    }

    const dpr = glManager.dpr;
    gl.useProgram(cache.program);
    gl.uniformMatrix4fv(cache.u_projection, false, projection);
    gl.uniform2f(cache.u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(cache.u_line_width, WICK_WIDTH_PX * dpr);

    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.cornerBuffer);
    gl.enableVertexAttribArray(cache.a_corner);
    gl.vertexAttribPointer(cache.a_corner, 1, gl.FLOAT, false, 0, 0);
    setDivisor(cache.a_corner, 0);

    drawWickGroup(
        gl,
        instancing,
        cache,
        buf.upWickBuffer,
        buf.upWickCount,
        chart._upColor,
    );
    drawWickGroup(
        gl,
        instancing,
        cache,
        buf.downWickBuffer,
        buf.downWickCount,
        chart._downColor,
    );

    setDivisor(cache.a_start, 0);
    setDivisor(cache.a_end, 0);
}

function drawWickGroup(
    gl: GL,
    instancing: ReturnType<typeof getInstancing>,
    cache: WickCache,
    segmentBuffer: WebGLBuffer,
    count: number,
    color: [number, number, number],
): void {
    if (count === 0) {
        return;
    }

    const stride = 2 * Float32Array.BYTES_PER_ELEMENT;
    const { setDivisor } = instancing;

    gl.uniform4f(cache.u_color, color[0], color[1], color[2], 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, segmentBuffer);
    gl.enableVertexAttribArray(cache.a_start);
    gl.vertexAttribPointer(cache.a_start, 2, gl.FLOAT, false, 2 * stride, 0);
    setDivisor(cache.a_start, 1);
    gl.enableVertexAttribArray(cache.a_end);
    gl.vertexAttribPointer(cache.a_end, 2, gl.FLOAT, false, 2 * stride, stride);
    setDivisor(cache.a_end, 1);

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
}
