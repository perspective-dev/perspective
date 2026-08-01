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
 *
 * `seriesRanges` records each visible series' contiguous run within
 * its axis bucket (`first` is bucket-relative). The fill loop appends
 * series in order, so runs are contiguous by construction; the
 * faceted draw path uses them to dispatch per-facet sub-ranges via
 * `drawArrays(POINTS, first, count)`.
 */
interface ScatterBuffers {
    leftCount: number;
    rightCount: number;
    seriesRanges: {
        seriesId: number;
        axis: 0 | 1;
        first: number;
        count: number;
    }[];
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
 * Scatter glyph for {@link SeriesChart}. Owns the program + per-axis
 * (position, color) GPU buffers. Single program/buffer set; left and
 * right axes are merged into shared buffers with sub-ranges.
 */
export class ScatterGlyph {
    private _program: ScatterProgramCache | null = null;
    private _buffers: ScatterBuffers | null = null;

    private ensureProgram(glManager: WebGLContextManager): ScatterProgramCache {
        if (this._program) {
            return this._program;
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
        this._program = {
            ...partial,
            posLeftBuffer: gl.createBuffer()!,
            posRightBuffer: gl.createBuffer()!,
            colorLeftBuffer: gl.createBuffer()!,
            colorRightBuffer: gl.createBuffer()!,
        };
        return this._program;
    }

    /**
     * Drop persistent scatter buffer state. The underlying GL buffer
     * objects on `_program` are reused (owned by the program cache,
     * not the per-build buffer view).
     */
    invalidateBuffers(_chart: SeriesChart): void {
        this._buffers = null;
    }

    /**
     * Build merged per-axis (position, color) buffers for every visible
     * scatter series and upload them. Hidden series are excluded — call
     * this from data-load and from the legend-toggle path so the GPU
     * buffers always reflect the current visible mask.
     */
    rebuildBuffers(chart: SeriesChart, glManager: WebGLContextManager): void {
        const scatterSeries = chart._scatterSeries;
        if (scatterSeries.length === 0) {
            this._buffers = null;
            return;
        }

        const N = chart._numCategories;
        const S = chart._series.length;
        if (N === 0 || S === 0) {
            this._buffers = null;
            return;
        }

        const cache = this.ensureProgram(glManager);
        const gl = glManager.gl;

        const samples = chart._samples;
        const valid = chart._sampleValid;
        const positions = chart._categoryPositions;
        const xOrigin = chart._categoryOrigin;
        const hidden = chart._hiddenSeries;

        // Two-pass: first count to size scratch, then fill. Avoids a
        // number[] growth path while still accommodating both axes in a
        // single pair of buffers.
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
            this._buffers = null;
            return;
        }

        ensureScratch(total);

        // Fill left bucket from `[0, leftCount)`, right bucket from
        // `[leftCount, total)` — single typed-array allocation each.
        // Series runs are contiguous within their bucket; record each
        // run's bucket-relative `[first, count)` for the faceted draw.
        const seriesRanges: ScatterBuffers["seriesRanges"] = [];
        let leftWrite = 0;
        let rightWrite = leftCount;
        for (const s of scatterSeries) {
            if (hidden.has(s.seriesId)) {
                continue;
            }

            const runFirst = s.axis === 1 ? rightWrite - leftCount : leftWrite;
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

            const runEnd = s.axis === 1 ? rightWrite - leftCount : leftWrite;
            if (runEnd > runFirst) {
                seriesRanges.push({
                    seriesId: s.seriesId,
                    axis: s.axis,
                    first: runFirst,
                    count: runEnd - runFirst,
                });
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

        this._buffers = { leftCount, rightCount, seriesRanges };
    }

    /**
     * Bind the persistent left/right buffers and issue up to two draw
     * calls. No per-frame allocations or buffer uploads. `splitFilter`
     * (faceted frames) and/or `aggRange` (mixed glyph-run frames)
     * instead draw each matching series' contiguous bucket sub-range —
     * one `drawArrays(POINTS, first, count)` per matching series.
     */
    draw(
        chart: SeriesChart,
        gl: GL,
        glManager: WebGLContextManager,
        projLeft: Float32Array,
        projRight: Float32Array,
        splitFilter?: number,
        aggRange?: { start: number; end: number },
    ): void {
        const buf = this._buffers;
        const cache = this._program;
        if (!buf || !cache) {
            return;
        }

        if (buf.leftCount === 0 && buf.rightCount === 0) {
            return;
        }

        const dpr = glManager.dpr;
        gl.useProgram(cache.program);
        gl.uniform1f(
            cache.u_point_size,
            chart._pluginConfig.point_size_px * dpr,
        );

        if (splitFilter !== undefined || aggRange !== undefined) {
            for (const r of buf.seriesRanges) {
                if (
                    splitFilter !== undefined &&
                    chart._series[r.seriesId].splitIdx !== splitFilter
                ) {
                    continue;
                }

                const aggIdx = chart._series[r.seriesId].aggIdx;
                if (
                    aggRange !== undefined &&
                    (aggIdx < aggRange.start || aggIdx > aggRange.end)
                ) {
                    continue;
                }

                drawBucket(
                    gl,
                    cache,
                    r.axis === 1 ? cache.posRightBuffer : cache.posLeftBuffer,
                    r.axis === 1
                        ? cache.colorRightBuffer
                        : cache.colorLeftBuffer,
                    r.count,
                    r.axis === 1 ? projRight : projLeft,
                    r.first,
                );
            }

            return;
        }

        drawBucket(
            gl,
            cache,
            cache.posLeftBuffer,
            cache.colorLeftBuffer,
            buf.leftCount,
            projLeft,
        );
        drawBucket(
            gl,
            cache,
            cache.posRightBuffer,
            cache.colorRightBuffer,
            buf.rightCount,
            projRight,
        );
    }

    destroy(chart: SeriesChart): void {
        const gl = chart._glManager?.gl;
        if (gl) {
            const cache = this._program;
            if (cache) {
                gl.deleteBuffer(cache.posLeftBuffer);
                gl.deleteBuffer(cache.posRightBuffer);
                gl.deleteBuffer(cache.colorLeftBuffer);
                gl.deleteBuffer(cache.colorRightBuffer);
            }
        }

        this._program = null;
        this._buffers = null;
    }
}

function drawBucket(
    gl: GL,
    cache: ScatterProgramCache,
    posBuf: WebGLBuffer,
    colBuf: WebGLBuffer,
    count: number,
    proj: Float32Array,
    first = 0,
): void {
    if (count === 0) {
        return;
    }

    gl.uniformMatrix4fv(cache.u_projection, false, proj);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(cache.a_position);
    gl.vertexAttribPointer(cache.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.enableVertexAttribArray(cache.a_color);
    gl.vertexAttribPointer(cache.a_color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, first, count);
}
