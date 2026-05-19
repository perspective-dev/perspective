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

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface LineProgramCache {
    program: WebGLProgram;
    cornerBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_color: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_line_width: WebGLUniformLocation | null;
    a_start: number;
    a_end: number;
    a_corner: number;
}

interface LineRun {
    /**
     * Byte offset into the per-series GPU buffer at the start of this run.
     */
    offsetBytes: number;

    /**
     * Number of points in this run; the run draws `count - 1` segments.
     */
    count: number;
}

interface LineSeriesEntry {
    seriesId: number;
    axis: 0 | 1;
    color: [number, number, number];

    /**
     * GPU buffer holding `[x0,y0,x1,y1,...]` for every run in the series.
     */
    gpuBuffer: WebGLBuffer;

    /**
     * Run offsets into `gpuBuffer`. Empty when the series has no segments.
     */
    runs: LineRun[];
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

function ensureLineScratch(n: number): Float32Array {
    if (_lineScratch.length >= n) {
        return _lineScratch;
    }

    _lineScratch = new Float32Array(Math.max(n, _lineScratch.length * 2));
    return _lineScratch;
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
            ["u_projection", "u_color", "u_resolution", "u_line_width"],
            ["a_start", "a_end", "a_corner"],
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
        }

        this._buffers = null;
    }

    /**
     * Rebuild the per-series GPU buffers for line glyphs. Called once
     * per data load (and once after `restyle()` because palette colors
     * are captured on the {@link LineSeriesEntry}). The buffer contents
     * encode `[x,y]` points in run-major order; one `bufferData` per
     * series. After this, every `draw` call rebinds + dispatches with
     * no further uploads until the next data load.
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
            // Walk the per-category sample grid for this series, breaking
            // into contiguous valid runs. Write directly into a pre-sized
            // Float32 scratch — no boxed JS arrays, no `Float32Array.from`.
            const scratch = ensureLineScratch(N * 2);
            const runs: LineRun[] = [];
            let write = 0;
            let runStart = 0;
            for (let c = 0; c < N; c++) {
                const idx = c * S + s.seriesId;
                const ok = (valid[idx >> 3] >> (idx & 7)) & 1;
                if (ok) {
                    const x = positions ? positions[c] - xOrigin : c;
                    scratch[write++] = x;
                    scratch[write++] = samples[idx];
                } else if (write > runStart) {
                    const count = (write - runStart) / 2;
                    if (count >= 2) {
                        runs.push({ offsetBytes: runStart * 4, count });
                    }

                    runStart = write;
                }
            }

            if (write > runStart) {
                const count = (write - runStart) / 2;
                if (count >= 2) {
                    runs.push({ offsetBytes: runStart * 4, count });
                }
            }

            if (runs.length === 0) {
                continue;
            }

            const buf = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                scratch.subarray(0, write),
                gl.STATIC_DRAW,
            );

            entries.push({
                seriesId: s.seriesId,
                axis: s.axis,
                color: [s.color[0], s.color[1], s.color[2]],
                gpuBuffer: buf,
                runs,
            });
        }

        this._buffers = { series: entries };
    }

    /**
     * Bind the persistent vertex buffers and dispatch one instanced draw
     * per (series, run). Skips hidden series via `_hiddenSeries`.
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

        const stride = 2 * Float32Array.BYTES_PER_ELEMENT;
        const hidden = chart._hiddenSeries;
        for (const s of buf.series) {
            if (hidden.has(s.seriesId)) {
                continue;
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, s.gpuBuffer);
            gl.uniformMatrix4fv(
                cache.u_projection,
                false,
                s.axis === 1 ? projRight : projLeft,
            );

            const color = chart._series[s.seriesId].color;
            gl.uniform4f(cache.u_color, color[0], color[1], color[2], 1.0);

            gl.enableVertexAttribArray(cache.a_start);
            setDivisor(cache.a_start, 1);
            gl.enableVertexAttribArray(cache.a_end);
            setDivisor(cache.a_end, 1);

            for (const run of s.runs) {
                gl.vertexAttribPointer(
                    cache.a_start,
                    2,
                    gl.FLOAT,
                    false,
                    stride,
                    run.offsetBytes,
                );
                gl.vertexAttribPointer(
                    cache.a_end,
                    2,
                    gl.FLOAT,
                    false,
                    stride,
                    run.offsetBytes + stride,
                );
                drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count - 1);
            }
        }

        setDivisor(cache.a_start, 0);
        setDivisor(cache.a_end, 0);
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
