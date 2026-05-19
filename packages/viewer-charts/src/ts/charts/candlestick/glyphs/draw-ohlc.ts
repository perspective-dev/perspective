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
    getInstancing,
} from "../../../webgl/instanced-attrs";
import { compileProgram } from "../../../webgl/program-cache";
import lineVert from "../../../shaders/line-uniform.vert.glsl";
import lineFrag from "../../../shaders/line-uniform.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

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

/**
 * Persistent OHLC vertex buffer state — one buffer per color group
 * (up / down), each holding 3 line segments per candle (H–L vertical,
 * open tick, close tick). Built once per data load; pan/zoom redraws
 * rebind + dispatch with no uploads.
 */
interface OHLCBuffers {
    upBuffer: WebGLBuffer;
    downBuffer: WebGLBuffer;

    /**
     * Number of line-segment instances in the up buffer (= 3 × up candle count).
     */
    upInstanceCount: number;
    downInstanceCount: number;
}

/**
 * OHLC bar glyph. Owns the OHLC program + per-color persistent segment
 * buffers built per data load. Co-tenanted with `BodyWickGlyph` on
 * `CandlestickChart`; only one of the two is active per frame depending
 * on `_defaultChartType`.
 */
export class OHLCGlyph {
    private _program: OHLCCache | null = null;
    private _buffers: OHLCBuffers | null = null;

    private ensureProgram(glManager: WebGLContextManager): OHLCCache {
        if (this._program) {
            return this._program;
        }

        const gl = glManager.gl;
        const cornerBuffer = createLineCornerBuffer(gl);
        const partial = compileProgram<
            Omit<OHLCCache, "cornerBuffer" | "segmentBuffer">
        >(
            glManager,
            "line-uniform",
            lineVert,
            lineFrag,
            ["u_projection", "u_color", "u_resolution", "u_line_width"],
            ["a_corner", "a_start", "a_end"],
        );
        this._program = {
            ...partial,
            cornerBuffer,
            segmentBuffer: gl.createBuffer()!,
        };
        return this._program;
    }

    /**
     * Drop persistent OHLC vertex buffers. Called from data-load (before
     * `rebuildBuffers`) and from chart-destroy paths.
     */
    invalidateBuffers(chart: CandlestickChart): void {
        const buf = this._buffers;
        if (!buf || !chart._glManager) {
            this._buffers = null;
            return;
        }

        const gl = chart._glManager.gl;
        gl.deleteBuffer(buf.upBuffer);
        gl.deleteBuffer(buf.downBuffer);
        this._buffers = null;
    }

    /**
     * Pre-build the per-group OHLC instance buffers. Each candle emits 3
     * line segments (H–L, open tick, close tick); layout per instance is
     * `[start.x, start.y, end.x, end.y]`. Single GPU upload per group per
     * data load.
     */
    rebuildBuffers(
        chart: CandlestickChart,
        glManager: WebGLContextManager,
    ): void {
        // Only rebuild when this chart actually paints OHLC. Cheap enough
        // to always rebuild but skipping avoids two empty GPU buffers on
        // candlestick instances.
        if (chart._defaultChartType !== "ohlc") {
            return;
        }

        const candles = chart._candles;
        const gl = glManager.gl;
        this.ensureProgram(glManager);

        const xOrigin = chart._categoryOrigin;
        const xC = candles.xCenter;
        const hw = candles.halfWidth;
        const open = candles.open;
        const close = candles.close;
        const high = candles.high;
        const low = candles.low;
        const isUp = candles.isUp;

        let upCount = 0;
        let downCount = 0;
        for (let i = 0; i < candles.count; i++) {
            if (isUp[i] !== 0) {
                upCount++;
            } else {
                downCount++;
            }
        }

        const upData = new Float32Array(upCount * 3 * 4);
        const downData = new Float32Array(downCount * 3 * 4);
        let upW = 0;
        let downW = 0;

        for (let i = 0; i < candles.count; i++) {
            const xc = xC[i] - xOrigin;
            const o = open[i];
            const c = close[i];
            const lo = low[i];
            const hi = high[i];
            const halfW = hw[i];
            const target = isUp[i] !== 0 ? upData : downData;
            let w = isUp[i] !== 0 ? upW : downW;

            // H–L vertical line.
            target[w++] = xc;
            target[w++] = lo;
            target[w++] = xc;
            target[w++] = hi;

            // Open tick: left-facing horizontal stub at y=open.
            target[w++] = xc - halfW;
            target[w++] = o;
            target[w++] = xc;
            target[w++] = o;

            // Close tick: right-facing horizontal stub at y=close.
            target[w++] = xc;
            target[w++] = c;
            target[w++] = xc + halfW;
            target[w++] = c;

            if (isUp[i] !== 0) {
                upW = w;
            } else {
                downW = w;
            }
        }

        const prev = this._buffers;
        const upBuf = prev?.upBuffer ?? gl.createBuffer()!;
        const downBuf = prev?.downBuffer ?? gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, upBuf);
        gl.bufferData(gl.ARRAY_BUFFER, upData, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, downBuf);
        gl.bufferData(gl.ARRAY_BUFFER, downData, gl.STATIC_DRAW);

        this._buffers = {
            upBuffer: upBuf,
            downBuffer: downBuf,
            upInstanceCount: upCount * 3,
            downInstanceCount: downCount * 3,
        };
    }

    /**
     * Bind the persistent up/down OHLC buffers and dispatch one instanced
     * draw per color group.
     */
    draw(
        chart: CandlestickChart,
        gl: GL,
        glManager: WebGLContextManager,
        projection: Float32Array,
    ): void {
        const buf = this._buffers;
        if (
            !buf ||
            (buf.upInstanceCount === 0 && buf.downInstanceCount === 0)
        ) {
            return;
        }

        const cache = this.ensureProgram(glManager);
        const dpr = glManager.dpr;

        gl.useProgram(cache.program);
        gl.uniformMatrix4fv(cache.u_projection, false, projection);
        gl.uniform2f(cache.u_resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(
            cache.u_line_width,
            chart._pluginConfig.ohlc_line_width_px * dpr,
        );

        const instancing = getInstancing(glManager);
        const { setDivisor } = instancing;

        gl.bindBuffer(gl.ARRAY_BUFFER, cache.cornerBuffer);
        gl.enableVertexAttribArray(cache.a_corner);
        gl.vertexAttribPointer(cache.a_corner, 1, gl.FLOAT, false, 0, 0);
        setDivisor(cache.a_corner, 0);

        drawGroup(
            gl,
            instancing,
            cache,
            buf.upBuffer,
            buf.upInstanceCount,
            chart._upColor,
        );
        drawGroup(
            gl,
            instancing,
            cache,
            buf.downBuffer,
            buf.downInstanceCount,
            chart._downColor,
        );

        setDivisor(cache.a_start, 0);
        setDivisor(cache.a_end, 0);
    }

    destroy(chart: CandlestickChart): void {
        const gl = chart._glManager?.gl;
        if (gl) {
            this.invalidateBuffers(chart);
            const cache = this._program;
            if (cache) {
                gl.deleteBuffer(cache.cornerBuffer);
                gl.deleteBuffer(cache.segmentBuffer);
            }
        }

        this._program = null;
        this._buffers = null;
    }
}

function drawGroup(
    gl: GL,
    instancing: ReturnType<typeof getInstancing>,
    cache: OHLCCache,
    buffer: WebGLBuffer,
    instanceCount: number,
    color: [number, number, number],
): void {
    if (instanceCount === 0) {
        return;
    }

    const instanceStride = 4 * Float32Array.BYTES_PER_ELEMENT;
    const pointSize = 2 * Float32Array.BYTES_PER_ELEMENT;
    const { setDivisor } = instancing;

    gl.uniform4f(cache.u_color, color[0], color[1], color[2], 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
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

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
}
