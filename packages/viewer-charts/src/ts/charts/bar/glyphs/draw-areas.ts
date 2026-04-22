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
import type { BarRecord, SeriesInfo } from "../bar-build";
import areaVert from "../../../shaders/area.vert.glsl";
import areaFrag from "../../../shaders/area.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

export interface AreaCache {
    program: WebGLProgram;
    stripBuffer: WebGLBuffer;
    u_projection: WebGLUniformLocation | null;
    u_color: WebGLUniformLocation | null;
    u_opacity: WebGLUniformLocation | null;
    a_position: number;
}

function ensureAreaCache(
    chart: BarChart,
    glManager: WebGLContextManager,
): AreaCache {
    if (chart._areaCache) return chart._areaCache as AreaCache;
    const gl = glManager.gl;
    const program = glManager.shaders.getOrCreate(
        "bar-area",
        areaVert,
        areaFrag,
    );
    const cache: AreaCache = {
        program,
        stripBuffer: gl.createBuffer()!,
        u_projection: gl.getUniformLocation(program, "u_projection"),
        u_color: gl.getUniformLocation(program, "u_color"),
        u_opacity: gl.getUniformLocation(program, "u_opacity"),
        a_position: gl.getAttribLocation(program, "a_position"),
    };
    chart._areaCache = cache;
    return cache;
}

/**
 * Draw every area-typed series as a filled ribbon between its y0 baseline
 * and y1 value across categories. Stacking is handled by the pipeline:
 * stacked series get per-category (y0, y1) from the running stack ladder
 * via `BarRecord`; non-stacking series draw from y=0 to the raw sample.
 *
 * Each contiguous run of valid samples emits one `TRIANGLE_STRIP` draw.
 * Gaps (invalid samples) split the ribbon.
 */
export function drawAreas(
    chart: BarChart,
    gl: GL,
    glManager: WebGLContextManager,
    projLeft: Float32Array,
    projRight: Float32Array,
    opacity: number,
): void {
    const areaSeries = chart._series.filter(
        (s) => s.chartType === "area" && !chart._hiddenSeries.has(s.seriesId),
    );
    if (areaSeries.length === 0) return;

    const N = chart._numCategories;
    const S = chart._series.length;
    if (N === 0 || S === 0) return;

    const cache = ensureAreaCache(chart, glManager);
    gl.useProgram(cache.program);
    gl.uniform1f(cache.u_opacity, opacity);

    // Pre-index bar records by (seriesId, catIdx) for stacked area lookup.
    // Stacked area series contribute one BarRecord per valid (cat, series);
    // non-stacking area series have no BarRecord and are synthesised from
    // `_samples`.
    const barIndex = indexBarsBySeriesCat(chart._bars);

    const samples = chart._samples;
    const valid = chart._sampleValid;

    for (const s of areaSeries) {
        const runs = collectAreaRuns(s, N, S, samples, valid, barIndex);
        if (runs.length === 0) continue;

        gl.uniformMatrix4fv(
            cache.u_projection,
            false,
            s.axis === 1 ? projRight : projLeft,
        );
        gl.uniform3f(cache.u_color, s.color[0], s.color[1], s.color[2]);

        for (const strip of runs) {
            if (strip.length < 4) continue; // need >=2 cats
            gl.bindBuffer(gl.ARRAY_BUFFER, cache.stripBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, strip, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(cache.a_position);
            gl.vertexAttribPointer(cache.a_position, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip.length / 2);
        }
    }
}

/**
 * Returns a Map `(seriesId * 1e9 + catIdx) → BarRecord`. 1e9 is a safe key
 * separator since category counts never approach it; lets us avoid nested
 * maps in the lookup loop.
 */
function indexBarsBySeriesCat(bars: BarRecord[]): Map<number, BarRecord> {
    const m = new Map<number, BarRecord>();
    for (const b of bars) {
        if (b.chartType !== "area") continue;
        m.set(b.seriesId * 1_000_000_000 + b.catIdx, b);
    }
    return m;
}

/**
 * Collect per-run vertex arrays for one area series. Each run is a
 * `[x0,y0_bot, x0,y0_top, x1,y1_bot, x1,y1_top, ...]` strip.
 */
function collectAreaRuns(
    s: SeriesInfo,
    N: number,
    S: number,
    samples: Float32Array,
    valid: Uint8Array,
    barIndex: Map<number, BarRecord>,
): Float32Array[] {
    const runs: Float32Array[] = [];
    let scratch: number[] = [];
    const seriesBase = s.seriesId * 1_000_000_000;

    for (let c = 0; c < N; c++) {
        let bot: number;
        let top: number;
        let present = false;

        if (s.stack) {
            const b = barIndex.get(seriesBase + c);
            if (b) {
                bot = b.y0;
                top = b.y1;
                present = true;
            } else {
                bot = 0;
                top = 0;
            }
        } else {
            const idx = c * S + s.seriesId;
            if ((valid[idx >> 3] >> (idx & 7)) & 1) {
                bot = 0;
                top = samples[idx];
                present = true;
            } else {
                bot = 0;
                top = 0;
            }
        }

        if (present) {
            scratch.push(c, bot!, c, top!);
        } else if (scratch.length > 0) {
            runs.push(Float32Array.from(scratch));
            scratch = [];
        }
    }
    if (scratch.length > 0) runs.push(Float32Array.from(scratch));
    return runs;
}
