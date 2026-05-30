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
import {
    createLineCornerBuffer,
    getInstancing,
} from "../../../webgl/instanced-attrs";
import { compileProgram } from "../../../webgl/program-cache";
import lineVert from "../../../shaders/line-uniform.vert.glsl";
import lineFrag from "../../../shaders/line-uniform.frag.glsl";
import type { InterpolateMode } from "../series-type";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface LineProgramCache {
    program: WebGLProgram;
    cornerBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_color: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_line_width: WebGLUniformLocation | null;
    u_interp_alpha: WebGLUniformLocation | null;
    a_start: number;
    a_end: number;
    a_corner: number;
    a_real_start: number;
    a_real_end: number;
}

interface LineSeriesEntry {
    seriesId: number;
    axis: 0 | 1;
    color: [number, number, number];

    /**
     * GPU buffer holding `[x0,y0,x1,y1,...]` for cats `[start, end]`.
     */
    gpuBuffer: WebGLBuffer;

    /**
     * GPU buffer of per-vertex real-flag bytes (1 = real, 0 = synthesized).
     * Bound twice as `a_real_start` / `a_real_end` with overlapping
     * byte offsets so the segment shader sees both endpoints' flags.
     */
    gpuRealBuffer: WebGLBuffer;

    /**
     * Number of points = `end - start + 1`. Series draws `count - 1`
     * segments. The renderer always emits a single contiguous run;
     * gap rendering for skip mode happens in the shader via
     * `u_interp_alpha`.
     */
    count: number;

    /**
     * Interpolation mode for this series. Drives `u_interp_alpha` at
     * draw time. Same value the build pipeline resolved via
     * `resolveInterpolate`.
     */
    interpolateMode: InterpolateMode;
}

/**
 * Persistent line glyph state. Built in `rebuildBuffers` (called from
 * `uploadAndRender`) and reused across pan/zoom frames. Legacy code
 * rebuilt the JS-side polylines + GPU buffers on every frame, which
 * dominated the per-frame budget at high N.
 */
interface LineBuffers {
    /**
     * One entry per line series (hidden series included; draw skips them).
     */
    series: LineSeriesEntry[];
}

/**
 * Reusable Float32 scratch for assembling polyline points before GPU
 * upload. Sized lazily and grown on demand. Replaces the legacy
 * `scratch: number[]` (boxed) → `Float32Array.from(scratch)` (copy)
 * pattern.
 */
let _lineScratch: Float32Array = new Float32Array(0);
let _realScratch: Uint8Array = new Uint8Array(0);

function ensureLineScratch(n: number): Float32Array {
    if (_lineScratch.length >= n) {
        return _lineScratch;
    }

    _lineScratch = new Float32Array(Math.max(n, _lineScratch.length * 2));
    return _lineScratch;
}

function ensureRealScratch(n: number): Uint8Array {
    if (_realScratch.length >= n) {
        return _realScratch;
    }

    _realScratch = new Uint8Array(Math.max(n, _realScratch.length * 2));
    return _realScratch;
}

function alphaForMode(mode: InterpolateMode): number {
    if (mode === "solid") {
        return 1.0;
    }

    if (mode === "transparent") {
        return 0.5;
    }

    return 0.0;
}

/**
 * Line glyph for {@link SeriesChart}. Owns its program + per-series
 * GPU buffers privately; chart routes lifecycle through
 * `_glyphs.lines`.
 */
export class LineGlyph {
    private _program: LineProgramCache | null = null;
    private _buffers: LineBuffers | null = null;

    private ensureProgram(glManager: WebGLContextManager): LineProgramCache {
        if (this._program) {
            return this._program;
        }

        const cornerBuffer = createLineCornerBuffer(glManager.gl);
        const partial = compileProgram<Omit<LineProgramCache, "cornerBuffer">>(
            glManager,
            "bar-line",
            lineVert,
            lineFrag,
            [
                "u_projection",
                "u_color",
                "u_resolution",
                "u_line_width",
                "u_interp_alpha",
            ],
            ["a_start", "a_end", "a_corner", "a_real_start", "a_real_end"],
        );
        this._program = { ...partial, cornerBuffer };
        return this._program;
    }

    /**
     * Drop persistent line buffers. Subsequent draws will no-op until
     * the next `rebuildBuffers` call.
     */
    invalidateBuffers(chart: SeriesChart): void {
        const buf = this._buffers;
        if (!buf || !chart._glManager) {
            this._buffers = null;
            return;
        }

        const gl = chart._glManager.gl;
        for (const s of buf.series) {
            gl.deleteBuffer(s.gpuBuffer);
            gl.deleteBuffer(s.gpuRealBuffer);
        }

        this._buffers = null;
    }

    /**
     * Rebuild the per-series GPU buffers for line glyphs. Called once
     * per data load (and once after `restyle()` because palette colors
     * are captured on the {@link LineSeriesEntry}). The buffer contents
     * encode `[x,y]` points for every cat in `[start, end]`; one
     * `bufferData` per series. After this, every `draw` call rebinds +
     * dispatches with no further uploads until the next data load.
     *
     * Gap behavior at synthesized cells is handled in the shader via
     * `u_interp_alpha` (set per draw based on the series'
     * `interpolateMode`): `skip` → 0 (invisible segments touching a
     * synthesized endpoint), `solid` → 1, `transparent` → 0.5.
     */
    rebuildBuffers(chart: SeriesChart, glManager: WebGLContextManager): void {
        const lineSeries = chart._lineSeries;
        if (lineSeries.length === 0) {
            this._buffers = null;
            return;
        }

        const N = chart._numCategories;
        if (N === 0) {
            this._buffers = null;
            return;
        }

        this.ensureProgram(glManager);
        const gl = glManager.gl;
        const samples = chart._samples;
        const valid = chart._sampleValid;
        const xOrigin = chart._categoryOrigin;
        const positions = chart._categoryPositions;
        const S = chart._series.length;

        const entries: LineSeriesEntry[] = [];
        for (const s of lineSeries) {
            const seriesInfo = chart._series[s.seriesId];
            const start = seriesInfo.start;
            const end = seriesInfo.end;
            if (start < 0 || end < start) {
                continue;
            }

            const count = end - start + 1;
            if (count < 2) {
                // A 1-point "line" has no segments to draw.
                continue;
            }

            const posScratch = ensureLineScratch(count * 2);
            const realScratch = ensureRealScratch(count);
            let write = 0;
            for (let c = start; c <= end; c++) {
                const x = positions ? positions[c] - xOrigin : c;
                const idx = c * S + s.seriesId;
                posScratch[write * 2] = x;
                posScratch[write * 2 + 1] = samples[idx];
                realScratch[write] = (valid[idx >> 3] >> (idx & 7)) & 1;
                write++;
            }

            const posBuf = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                posScratch.subarray(0, write * 2),
                gl.STATIC_DRAW,
            );

            const realBuf = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, realBuf);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                realScratch.subarray(0, write),
                gl.STATIC_DRAW,
            );

            entries.push({
                seriesId: s.seriesId,
                axis: s.axis,
                color: [s.color[0], s.color[1], s.color[2]],
                gpuBuffer: posBuf,
                gpuRealBuffer: realBuf,
                count,
                interpolateMode: seriesInfo.interpolateMode,
            });
        }

        this._buffers = { series: entries };
    }

    /**
     * Bind the persistent vertex buffers and dispatch one instanced draw
     * per series. Skips hidden series via `_hiddenSeries`. Gap /
     * transparency rendering is governed by `u_interp_alpha`, set per
     * series.
     */
    draw(
        chart: SeriesChart,
        gl: GL,
        glManager: WebGLContextManager,
        projLeft: Float32Array,
        projRight: Float32Array,
    ): void {
        const buf = this._buffers;
        const cache = this._program;
        if (!buf || !cache || buf.series.length === 0) {
            return;
        }

        const dpr = glManager.dpr;
        gl.useProgram(cache.program);
        gl.uniform2f(cache.u_resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(
            cache.u_line_width,
            chart._pluginConfig.line_width_px * dpr,
        );

        const instancing = getInstancing(glManager);
        const { setDivisor, drawArraysInstanced } = instancing;

        gl.bindBuffer(gl.ARRAY_BUFFER, cache.cornerBuffer);
        gl.enableVertexAttribArray(cache.a_corner);
        gl.vertexAttribPointer(cache.a_corner, 1, gl.FLOAT, false, 0, 0);
        setDivisor(cache.a_corner, 0);

        const posStride = 2 * Float32Array.BYTES_PER_ELEMENT;
        const realStride = Uint8Array.BYTES_PER_ELEMENT;
        const hidden = chart._hiddenSeries;
        for (const s of buf.series) {
            if (hidden.has(s.seriesId)) {
                continue;
            }

            gl.uniformMatrix4fv(
                cache.u_projection,
                false,
                s.axis === 1 ? projRight : projLeft,
            );

            const color = chart._series[s.seriesId].color;
            gl.uniform4f(cache.u_color, color[0], color[1], color[2], 1.0);
            gl.uniform1f(cache.u_interp_alpha, alphaForMode(s.interpolateMode));

            gl.enableVertexAttribArray(cache.a_start);
            setDivisor(cache.a_start, 1);
            gl.enableVertexAttribArray(cache.a_end);
            setDivisor(cache.a_end, 1);
            gl.enableVertexAttribArray(cache.a_real_start);
            setDivisor(cache.a_real_start, 1);
            gl.enableVertexAttribArray(cache.a_real_end);
            setDivisor(cache.a_real_end, 1);

            gl.bindBuffer(gl.ARRAY_BUFFER, s.gpuBuffer);
            gl.vertexAttribPointer(
                cache.a_start,
                2,
                gl.FLOAT,
                false,
                posStride,
                0,
            );
            gl.vertexAttribPointer(
                cache.a_end,
                2,
                gl.FLOAT,
                false,
                posStride,
                posStride,
            );

            // Bind the real-flag buffer twice with offsets 0 and 1 byte
            // — same overlap trick as the position buffer. `normalized
            // = false` makes the byte value cast directly to float
            // (0 → 0.0, 1 → 1.0) so the shader's `step(0.5, bothReal)`
            // cleanly discriminates real vs synthesized endpoints.
            gl.bindBuffer(gl.ARRAY_BUFFER, s.gpuRealBuffer);
            gl.vertexAttribPointer(
                cache.a_real_start,
                1,
                gl.UNSIGNED_BYTE,
                false,
                realStride,
                0,
            );
            gl.vertexAttribPointer(
                cache.a_real_end,
                1,
                gl.UNSIGNED_BYTE,
                false,
                realStride,
                realStride,
            );

            drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.count - 1);
        }

        setDivisor(cache.a_start, 0);
        setDivisor(cache.a_end, 0);
        setDivisor(cache.a_real_start, 0);
        setDivisor(cache.a_real_end, 0);
    }

    destroy(chart: SeriesChart): void {
        const gl = chart._glManager?.gl;
        if (gl) {
            this.invalidateBuffers(chart);
            const cache = this._program;
            if (cache) {
                gl.deleteBuffer(cache.cornerBuffer);
            }
        }

        this._program = null;
        this._buffers = null;
    }
}
