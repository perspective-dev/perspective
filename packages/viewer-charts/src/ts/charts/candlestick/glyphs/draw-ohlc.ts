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
import lineVert from "../../../shaders/line-uniform.vert.glsl";
import lineFrag from "../../../shaders/line-uniform.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

const OHLC_LINE_WIDTH_PX = 1.0;

interface OHLCCache {
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

function ensureCache(
    chart: CandlestickChart,
    glManager: WebGLContextManager,
): OHLCCache {
    if (chart._wickCache && (chart._wickCache as any).ohlc) {
        return (chart._wickCache as any).ohlc as OHLCCache;
    }
    const gl = glManager.gl;
    const prog = glManager.shaders.getOrCreate(
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
    const cache: OHLCCache = {
        program: prog,
        cornerBuffer,
        segmentBuffer: gl.createBuffer()!,
        u_projection: gl.getUniformLocation(prog, "u_projection"),
        u_color: gl.getUniformLocation(prog, "u_color"),
        u_resolution: gl.getUniformLocation(prog, "u_resolution"),
        u_line_width: gl.getUniformLocation(prog, "u_line_width"),
        a_corner: gl.getAttribLocation(prog, "a_corner"),
        a_start: gl.getAttribLocation(prog, "a_start"),
        a_end: gl.getAttribLocation(prog, "a_end"),
    };
    // Stash alongside any existing wick cache so destroy() can free both.
    const existing = (chart._wickCache as any) || {};
    chart._wickCache = { ...existing, ohlc: cache };
    return cache;
}

/**
 * OHLC glyph: for each record, three line segments — the vertical H–L
 * line through `xCenter`, a short left-facing tick at `open`, and a
 * short right-facing tick at `close`. Colors bichromatic by `isUp`,
 * identical to candlestick bodies.
 */
export function drawOHLC(
    chart: CandlestickChart,
    gl: GL,
    glManager: WebGLContextManager,
    projection: Float32Array,
): void {
    const candles = chart._candles;
    if (candles.length === 0) return;

    const cache = ensureCache(chart, glManager);

    drawOHLCGroup(
        gl,
        glManager,
        cache,
        candles.filter((c) => c.isUp),
        chart._upColor,
        projection,
    );
    drawOHLCGroup(
        gl,
        glManager,
        cache,
        candles.filter((c) => !c.isUp),
        chart._downColor,
        projection,
    );
}

/**
 * Pack all three line segments (H–L, open tick, close tick) for every
 * candle in `group` into a single interleaved instance buffer and
 * issue one instanced draw.
 *
 * Layout per instance (16 bytes = 4 floats): `[ start.x, start.y, end.x, end.y ]`.
 * `3 * group.length` total instances.
 */
function drawOHLCGroup(
    gl: GL,
    glManager: WebGLContextManager,
    cache: OHLCCache,
    group: CandleRecord[],
    color: [number, number, number],
    projection: Float32Array,
): void {
    if (group.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const data = new Float32Array(group.length * 3 * 4);
    let o = 0;
    for (let i = 0; i < group.length; i++) {
        const c = group[i];
        // H–L vertical line.
        data[o++] = c.xCenter;
        data[o++] = c.low;
        data[o++] = c.xCenter;
        data[o++] = c.high;
        // Open tick: left-facing horizontal stub at y=open.
        data[o++] = c.xCenter - c.halfWidth;
        data[o++] = c.open;
        data[o++] = c.xCenter;
        data[o++] = c.open;
        // Close tick: right-facing horizontal stub at y=close.
        data[o++] = c.xCenter;
        data[o++] = c.close;
        data[o++] = c.xCenter + c.halfWidth;
        data[o++] = c.close;
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
    gl.uniform1f(cache.u_line_width, OHLC_LINE_WIDTH_PX * dpr);
    gl.uniform4f(cache.u_color, color[0], color[1], color[2], 1.0);

    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.cornerBuffer);
    gl.enableVertexAttribArray(cache.a_corner);
    gl.vertexAttribPointer(cache.a_corner, 1, gl.FLOAT, false, 0, 0);
    setDivisor(cache.a_corner, 0);

    const instanceStride = 4 * Float32Array.BYTES_PER_ELEMENT;
    const pointSize = 2 * Float32Array.BYTES_PER_ELEMENT;

    gl.bindBuffer(gl.ARRAY_BUFFER, cache.segmentBuffer);
    gl.enableVertexAttribArray(cache.a_start);
    gl.vertexAttribPointer(
        cache.a_start,
        2,
        gl.FLOAT,
        false,
        instanceStride,
        0,
    );
    setDivisor(cache.a_start, 1);
    gl.enableVertexAttribArray(cache.a_end);
    gl.vertexAttribPointer(
        cache.a_end,
        2,
        gl.FLOAT,
        false,
        instanceStride,
        pointSize,
    );
    setDivisor(cache.a_end, 1);

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, group.length * 3);

    setDivisor(cache.a_start, 0);
    setDivisor(cache.a_end, 0);
}
