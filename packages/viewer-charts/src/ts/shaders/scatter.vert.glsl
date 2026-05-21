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

attribute vec2 a_position;
attribute float a_color_value;
attribute float a_size_value;

uniform mat4 u_projection;
uniform float u_point_size;
// Data extents of the color column. The vertex shader folds these into a
// sign-aware `t` whose 50% stop is always the sign pivot, matching the
// CPU-side `colorValueToT` helper used by heatmap and the Canvas2D
// legend / tooltip.
uniform vec2 u_color_range;
uniform vec2 u_size_range;
uniform vec2 u_point_size_range;

varying float v_color_t;
varying float v_point_size;

void main() {
    // No unused-slot discard: tight per-series draws in `points.ts`
    // already bound `gl.drawArrays(gl.POINTS, s*cap, count[s])` to
    // valid rows, so the shader never sees a tail slot. A historical
    // sentinel branch here culled `a_color_value < 0.0`, which under
    // current dispatch silently dropped real numeric color data
    // whenever the user's color column legitimately went negative
    // (e.g., a diverging `Profit` column).
    gl_Position = u_projection * vec4(a_position, 0.0, 1.0);

    float sizeRange = u_size_range.y - u_size_range.x;
    if(sizeRange > 0.0) {
        float size_t = clamp((a_size_value - u_size_range.x) / sizeRange, 0.0, 1.0);
        gl_PointSize = mix(u_point_size_range.x, u_point_size_range.y, size_t);
    } else {
        gl_PointSize = u_point_size;
    }

    v_point_size = gl_PointSize;

    // Color-t mapping. Linear across `[cmin, cmax]` for single-sign
    // domains (which includes categorical `[0, N-1]` split / string
    // indices, so the colors match `interpolatePalette`'s even sampling
    // used by the legend). When the domain actually crosses zero we
    // switch to sign-aware so the value 0 always lands at the 50% stop
    // of the diverging gradient — matching heatmap and the Canvas2D
    // tooltip paths.
    float cmin = u_color_range.x;
    float cmax = u_color_range.y;
    if(cmax <= cmin) {
        v_color_t = 0.5;
    } else if(cmin < 0.0 && cmax > 0.0) {
        float denom = max(-cmin, cmax);
        v_color_t = clamp(0.5 + 0.5 * (a_color_value / denom), 0.0, 1.0);
    } else {
        v_color_t = clamp((a_color_value - cmin) / (cmax - cmin), 0.0, 1.0);
    }
}
