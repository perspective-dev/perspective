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
    getInstancing,
    bindInstancedFloatAttr,
} from "../../../webgl/instanced-attrs";
import { BAR_TYPE_BAR } from "../series-build";

/**
 * Re-export of the bar discriminator value so `series-render.ts` can
 * filter the `_bars` columnar storage without pulling the full
 * `series-build` types into its import surface.
 */
export const BAR_TYPE_BAR_VAL = BAR_TYPE_BAR;

type GL = WebGL2RenderingContext | WebGLRenderingContext;

/**
 * Draw the bar-typed subset of `chart._bars` as instanced quads. Assumes
 * the caller has already `useProgram`'d the bar shader and set uniforms.
 *
 * `range` draws a contiguous instance sub-range instead of the full
 * uploaded set — the faceted renderer uploads instances split-major
 * (see `uploadBarInstances`) and dispatches one range per facet.
 */
export function drawBars(
    chart: SeriesChart,
    gl: GL,
    glManager: WebGLContextManager,
    range?: { start: number; count: number },
): void {
    const first = range?.start ?? 0;
    const count = range?.count ?? chart._uploadedBars;
    if (chart._uploadedBars === 0 || count === 0) {
        return;
    }

    const loc = chart._locations!;
    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;

    gl.bindBuffer(gl.ARRAY_BUFFER, chart._cornerBuffer!);
    gl.enableVertexAttribArray(loc.a_corner);
    gl.vertexAttribPointer(loc.a_corner, 2, gl.FLOAT, false, 0, 0);
    setDivisor(loc.a_corner, 0);

    // If any per-instance buffer hasn't been uploaded yet, skip the
    // draw rather than paint zeros: `bindInstancedFloatAttr` uses
    // `peek` and returns `false` when the buffer is missing. This
    // triggers when a render lands between a pending draw's
    // `ensureBufferCapacity` and its first `bufferPool.upload` —
    // common during pan/zoom while data is being repopulated.
    const ok =
        bindInstancedFloatAttr(
            glManager,
            instancing,
            loc.a_x_center,
            "bar_x",
            1,
            first,
        ) &&
        bindInstancedFloatAttr(
            glManager,
            instancing,
            loc.a_half_width,
            "bar_hw",
            1,
            first,
        ) &&
        bindInstancedFloatAttr(
            glManager,
            instancing,
            loc.a_y0,
            "bar_y0",
            1,
            first,
        ) &&
        bindInstancedFloatAttr(
            glManager,
            instancing,
            loc.a_y1,
            "bar_y1",
            1,
            first,
        ) &&
        bindInstancedFloatAttr(
            glManager,
            instancing,
            loc.a_color,
            "bar_color",
            3,
            first,
        ) &&
        bindInstancedFloatAttr(
            glManager,
            instancing,
            loc.a_series_id,
            "bar_sid",
            1,
            first,
        ) &&
        bindInstancedFloatAttr(
            glManager,
            instancing,
            loc.a_axis,
            "bar_axis",
            1,
            first,
        );

    if (ok) {
        instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    }

    setDivisor(loc.a_x_center, 0);
    setDivisor(loc.a_half_width, 0);
    setDivisor(loc.a_y0, 0);
    setDivisor(loc.a_y1, 0);
    setDivisor(loc.a_color, 0);
    setDivisor(loc.a_series_id, 0);
    setDivisor(loc.a_axis, 0);
}
