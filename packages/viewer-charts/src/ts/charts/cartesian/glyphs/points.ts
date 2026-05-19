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
import type { CartesianChart } from "../cartesian";
import type { Glyph } from "../glyph";
import { bindGradientTexture } from "../../../webgl/gradient-texture";
import { buildPointRowTooltipLines } from "../tooltip-lines";
import scatterVert from "../../../shaders/scatter.vert.glsl";
import scatterFrag from "../../../shaders/scatter.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface PointCache {
    program: WebGLProgram;
    u_projection: WebGLUniformLocation | null;
    u_point_size: WebGLUniformLocation | null;
    u_color_range: WebGLUniformLocation | null;
    u_gradient_lut: WebGLUniformLocation | null;
    u_size_range: WebGLUniformLocation | null;
    u_point_size_range: WebGLUniformLocation | null;
    a_position: number;
    a_color_value: number;
    a_size_value: number;
}

/**
 * `gl.POINTS` glyph — one squared/antialiased point per data row. Color
 * and size are driven by the shared `a_color_value` / `a_size_value`
 * buffers; the vertex shader does sign-aware color-t mapping and samples
 * the gradient LUT. One draw call per series (the slot layout leaves
 * gaps at each series' tail that we can't safely include in a single
 * draw — dispatching `count[s]` per series skips them).
 */
export class PointGlyph implements Glyph {
    readonly name = "point" as const;
    private _cache: PointCache | null = null;

    ensureProgram(
        _chart: CartesianChart,
        glManager: WebGLContextManager,
    ): void {
        if (this._cache) {
            return;
        }

        const gl = glManager.gl;
        const program = glManager.shaders.getOrCreate(
            "scatter",
            scatterVert,
            scatterFrag,
        );
        this._cache = {
            program,
            u_projection: gl.getUniformLocation(program, "u_projection"),
            u_point_size: gl.getUniformLocation(program, "u_point_size"),
            u_color_range: gl.getUniformLocation(program, "u_color_range"),
            u_gradient_lut: gl.getUniformLocation(program, "u_gradient_lut"),
            u_size_range: gl.getUniformLocation(program, "u_size_range"),
            u_point_size_range: gl.getUniformLocation(
                program,
                "u_point_size_range",
            ),
            a_position: gl.getAttribLocation(program, "a_position"),
            a_color_value: gl.getAttribLocation(program, "a_color_value"),
            a_size_value: gl.getAttribLocation(program, "a_size_value"),
        };
    }

    draw(
        chart: CartesianChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
    ): void {
        const cache = this._cache;
        if (!cache) {
            return;
        }

        if (!bindPointState(cache, chart, glManager, projection)) {
            return;
        }

        // Per-series tight draws: each series `s` occupies slots
        // `[s*cap, s*cap + count[s])`. Dispatching `count[s]` avoids
        // rasterizing unused tail slots. All attribs have divisor=0 so
        // `first` shifts them together.
        const gl = glManager.gl;
        const numSeries = Math.max(1, chart._splitGroups.length);
        const cap = chart._seriesCapacity;
        for (let s = 0; s < numSeries; s++) {
            const count = chart._seriesUploadedCounts[s] ?? 0;
            if (count <= 0) {
                continue;
            }

            gl.drawArrays(gl.POINTS, s * cap, count);
        }
    }

    drawSeries(
        chart: CartesianChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
        seriesIdx: number,
    ): void {
        const cache = this._cache;
        if (!cache) {
            return;
        }

        if (!bindPointState(cache, chart, glManager, projection)) {
            return;
        }

        const count = chart._seriesUploadedCounts[seriesIdx] ?? 0;
        if (count <= 0) {
            return;
        }

        const gl = glManager.gl;
        const cap = chart._seriesCapacity;
        gl.drawArrays(gl.POINTS, seriesIdx * cap, count);
    }

    buildTooltipLines(
        chart: CartesianChart,
        flatIdx: number,
    ): Promise<string[]> {
        return buildPointRowTooltipLines(chart, flatIdx);
    }

    tooltipOptions() {
        return { crosshair: true, highlightRadius: 6 };
    }

    destroy(_chart: CartesianChart): void {
        // Program lifetime is owned by the shader registry; just drop
        // the cache reference. No private GPU resources to free.
        this._cache = null;
    }
}

function setUniforms(
    cache: PointCache,
    gl: GL,
    projection: Float32Array,
    chart: CartesianChart,
    dpr: number,
): void {
    gl.uniformMatrix4fv(cache.u_projection, false, projection);
    gl.uniform1f(cache.u_point_size, chart._pluginConfig.point_size_px * dpr);

    if (chart._colorMin < chart._colorMax) {
        gl.uniform2f(cache.u_color_range, chart._colorMin, chart._colorMax);
    } else {
        gl.uniform2f(cache.u_color_range, 0.0, 0.0);
    }

    if (chart._sizeMin < chart._sizeMax) {
        gl.uniform2f(cache.u_size_range, chart._sizeMin, chart._sizeMax);
    } else {
        gl.uniform2f(cache.u_size_range, 0.0, 0.0);
    }

    const size_scale_factor = Math.min(chart._pluginConfig.point_size_px, 3);

    gl.uniform2f(
        cache.u_point_size_range,
        Math.max(
            2 * dpr,
            (chart._pluginConfig.point_size_px / size_scale_factor) * dpr,
        ),
        chart._pluginConfig.point_size_px * size_scale_factor * dpr,
    );
}

/**
 * Shared pre-draw state setup for `draw` and `drawSeries`. Binds the
 * program, uploads uniforms + gradient texture, wires the three per-
 * vertex attributes. Returns false if the gradient cache is missing.
 */
function bindPointState(
    cache: PointCache,
    chart: CartesianChart,
    glManager: WebGLContextManager,
    projection: Float32Array,
): boolean {
    const gl = glManager.gl;
    if (!chart._gradientCache) {
        return false;
    }

    gl.useProgram(cache.program);
    setUniforms(cache, gl, projection, chart, glManager.dpr);
    bindGradientTexture(
        glManager,
        chart._gradientCache.texture,
        cache.u_gradient_lut,
        0,
    );

    // Render-path uses `peek` (not `getOrCreate`) so we never
    // recreate buffers from the draw path. If a buffer hasn't been
    // uploaded yet — e.g. pan/zoom render landing between a pending
    // draw's `ensureBufferCapacity` and its `uploadChunk` — return
    // false and let the caller skip `drawArrays`. Painting against
    // a freshly-recreated zero-filled buffer would show one frame
    // of empty plot area while gridlines/chrome remain correct.
    const posBuf = glManager.bufferPool.peek("a_position");
    const colorBuf = glManager.bufferPool.peek("a_color_value");
    const sizeBuf = glManager.bufferPool.peek("a_size_value");
    if (!posBuf || !colorBuf || !sizeBuf) {
        return false;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf.buffer);
    gl.enableVertexAttribArray(cache.a_position);
    gl.vertexAttribPointer(cache.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf.buffer);
    gl.enableVertexAttribArray(cache.a_color_value);
    gl.vertexAttribPointer(cache.a_color_value, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf.buffer);
    gl.enableVertexAttribArray(cache.a_size_value);
    gl.vertexAttribPointer(cache.a_size_value, 1, gl.FLOAT, false, 0, 0);

    return true;
}
