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
import type { SeriesInfo } from "../series-build";
import { compileProgram } from "../../../webgl/program-cache";
import areaVert from "../../../shaders/area.vert.glsl";
import areaFrag from "../../../shaders/area.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface AreaProgramCache {
    program: WebGLProgram;
    u_projection: WebGLUniformLocation | null;
    u_color: WebGLUniformLocation | null;
    u_opacity: WebGLUniformLocation | null;
    a_position: number;
}

interface AreaStrip {
    /**
     * Byte offset of the strip start within the per-series GPU buffer.
     */
    offsetBytes: number;

    /**
     * Vertex count (= 2 × number of categories in this run).
     */
    vertexCount: number;
}

interface AreaSeriesEntry {
    seriesId: number;
    axis: 0 | 1;
    color: [number, number, number];
    gpuBuffer: WebGLBuffer;
    strips: AreaStrip[];
}

/**
 * Persistent area glyph state. Built in `rebuildAreaBuffers`. Each
 * series owns one GPU buffer holding all of its strip vertices in
 * `[x,y_bot, x,y_top, ...]` layout; draws rebind without uploading.
 */
export interface AreaBuffers {
    program: WebGLProgram;
    u_projection: WebGLUniformLocation | null;
    u_color: WebGLUniformLocation | null;
    u_opacity: WebGLUniformLocation | null;
    a_position: number;
    series: AreaSeriesEntry[];
    gpuBuffer?: WebGLBuffer | null;
}

function ensureProgramCache(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): AreaProgramCache {
    if (chart._areaCache) {
        return chart._areaCache as AreaProgramCache;
    }

    const cache = compileProgram<AreaProgramCache>(
        glManager,
        "bar-area",
        areaVert,
        areaFrag,
        ["u_projection", "u_color", "u_opacity"],
        ["a_position"],
    );
    chart._areaCache = cache;
    return cache;
}

/**
 * Drop persistent area buffers. Subsequent draws no-op until rebuild.
 */
export function invalidateAreaBuffers(chart: SeriesChart): void {
    const buf = chart._areaBuffers as AreaBuffers | undefined;
    if (!buf || !chart._glManager) {
        chart._areaBuffers = undefined;
        return;
    }

    const gl = chart._glManager.gl;
    for (const s of buf.series) {
        gl.deleteBuffer(s.gpuBuffer);
    }

    chart._areaBuffers = undefined;
}

/**
 * Reusable Float32 strip scratch. Sized to `N * 4` (two vertices per
 * category: bottom + top). Grown on demand.
 */
let _stripScratch: Float32Array = new Float32Array(0);

function ensureStripScratch(n: number): Float32Array {
    if (_stripScratch.length >= n) {
        return _stripScratch;
    }

    _stripScratch = new Float32Array(Math.max(n, _stripScratch.length * 2));
    return _stripScratch;
}

/**
 * Build per-series strip buffers for area glyphs. Reads stacked y0/y1
 * from `chart._areaBarIndex` (cached at data load) and unstacked values
 * from `_samples`. Single GPU upload per series; subsequent frames just
 * rebind.
 */
export function rebuildAreaBuffers(
    chart: SeriesChart,
    glManager: WebGLContextManager,
): void {
    const areaSeries = chart._areaSeries;
    if (areaSeries.length === 0) {
        chart._areaBuffers = undefined;
        return;
    }

    const N = chart._numCategories;
    const S = chart._series.length;
    if (N === 0 || S === 0) {
        chart._areaBuffers = undefined;
        return;
    }

    const cache = ensureProgramCache(chart, glManager);
    const gl = glManager.gl;
    const samples = chart._samples;
    const valid = chart._sampleValid;
    const positions = chart._categoryPositions;
    const xOrigin = chart._categoryOrigin;
    const barIndex = chart._areaBarIndex;
    const bars = chart._bars;

    const entries: AreaSeriesEntry[] = [];
    for (const s of areaSeries) {
        const strips = collectAreaStrips(
            s,
            N,
            S,
            samples,
            valid,
            barIndex,
            bars.y0,
            bars.y1,
            positions,
            xOrigin,
        );
        if (strips.totalVertices === 0) {
            continue;
        }

        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            strips.scratch.subarray(0, strips.totalVertices * 2),
            gl.STATIC_DRAW,
        );

        entries.push({
            seriesId: s.seriesId,
            axis: s.axis,
            color: [s.color[0], s.color[1], s.color[2]],
            gpuBuffer: buf,
            strips: strips.descriptors,
        });
    }

    chart._areaBuffers = {
        program: cache.program,
        u_projection: cache.u_projection,
        u_color: cache.u_color,
        u_opacity: cache.u_opacity,
        a_position: cache.a_position,
        series: entries,
        gpuBuffer: null,
    };
}

/**
 * Bind persistent strip buffers and dispatch one TRIANGLE_STRIP per
 * series-run. Skips hidden series.
 */
export function drawAreas(
    chart: SeriesChart,
    gl: GL,
    glManager: WebGLContextManager,
    projLeft: Float32Array,
    projRight: Float32Array,
    opacity: number,
): void {
    const buf = chart._areaBuffers as AreaBuffers | undefined;
    if (!buf || buf.series.length === 0) {
        return;
    }

    gl.useProgram(buf.program);
    gl.uniform1f(buf.u_opacity, opacity);

    const hidden = chart._hiddenSeries;
    for (const s of buf.series) {
        if (hidden.has(s.seriesId)) {
            continue;
        }

        gl.uniformMatrix4fv(
            buf.u_projection,
            false,
            s.axis === 1 ? projRight : projLeft,
        );
        const color = chart._series[s.seriesId].color;
        gl.uniform3f(buf.u_color, color[0], color[1], color[2]);

        gl.bindBuffer(gl.ARRAY_BUFFER, s.gpuBuffer);
        gl.enableVertexAttribArray(buf.a_position);
        gl.vertexAttribPointer(buf.a_position, 2, gl.FLOAT, false, 0, 0);

        for (const strip of s.strips) {
            gl.bindBuffer(gl.ARRAY_BUFFER, s.gpuBuffer);
            gl.vertexAttribPointer(
                buf.a_position,
                2,
                gl.FLOAT,
                false,
                0,
                strip.offsetBytes,
            );
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip.vertexCount);
        }
    }

    void glManager;
}

interface CollectedStrips {
    descriptors: AreaStrip[];
    totalVertices: number;
    scratch: Float32Array;
}

/**
 * Walk the per-category sample grid for one series and emit strip
 * descriptors. Each contiguous run of present cells becomes one
 * `TRIANGLE_STRIP` with `[x,bot, x,top, ...]` layout.
 *
 * Reads stacked y0/y1 from the pre-built `barIndex` (cached on the
 * chart at data load) so this hot path doesn't rebuild the map each
 * call.
 */
function collectAreaStrips(
    s: SeriesInfo,
    N: number,
    S: number,
    samples: Float32Array,
    valid: Uint8Array,
    barIndex: Map<number, number> | null,
    barY0: Float64Array,
    barY1: Float64Array,
    positions: Float64Array | null,
    xOrigin: number,
): CollectedStrips {
    const scratch = ensureStripScratch(N * 4);
    const descriptors: AreaStrip[] = [];
    const seriesBase = s.seriesId * 1_000_000_000;

    let write = 0;
    let runStart = 0;

    for (let c = 0; c < N; c++) {
        let bot = 0;
        let top = 0;
        let present = false;

        if (s.stack) {
            const idx = barIndex?.get(seriesBase + c);
            if (idx !== undefined) {
                bot = barY0[idx];
                top = barY1[idx];
                present = true;
            }
        } else {
            const idx = c * S + s.seriesId;
            if ((valid[idx >> 3] >> (idx & 7)) & 1) {
                top = samples[idx];
                present = true;
            }
        }

        if (present) {
            const x = positions ? positions[c] - xOrigin : c;
            scratch[write++] = x;
            scratch[write++] = bot;
            scratch[write++] = x;
            scratch[write++] = top;
        } else if (write > runStart) {
            const vertexCount = (write - runStart) / 2;
            if (vertexCount >= 4) {
                descriptors.push({
                    offsetBytes: runStart * 4,
                    vertexCount,
                });
            }

            runStart = write;
        }
    }

    if (write > runStart) {
        const vertexCount = (write - runStart) / 2;
        if (vertexCount >= 4) {
            descriptors.push({
                offsetBytes: runStart * 4,
                vertexCount,
            });
        }
    }

    return {
        descriptors,
        totalVertices: write / 2,
        scratch,
    };
}
