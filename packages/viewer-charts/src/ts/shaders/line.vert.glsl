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

// Per-instance attributes (advance once per segment via divisor=1).
// Both `a_start`/`a_end` and `a_color_start`/`a_color_end` read from
// the same flat buffers using overlapping offsets: instance i reads
// vertex[i] into `*_start` and vertex[i+1] into `*_end`. Each per-
// series draw call binds into its own slot range, so segments never
// cross series boundaries — the CPU-side rebinding in `drawLineSeries`
// is the safeguard, so the shader contains no discard branch.
//
// `a_color_start` / `a_color_end` carry the segment endpoints' raw
// color values (numeric data value for gradient, dictionary index for
// categorical). The gradient LUT is sampled using the same mapping the
// scatter shader uses — `(v - cmin) / (cmax - cmin)` with sign-aware
// handling for zero-crossing domains. The two endpoints' colors are
// averaged so the segment reads as a single chord in gradient space.
attribute vec2 a_start;
attribute vec2 a_end;
attribute float a_color_start;
attribute float a_color_end;

// Per-vertex attribute (advance every vertex, divisor=0)
// 0 = start+left, 1 = start+right, 2 = end+left, 3 = end+right
attribute float a_corner;

uniform mat4 u_projection;
uniform vec2 u_resolution;
uniform float u_line_width;
uniform vec2 u_color_range;
uniform sampler2D u_gradient_lut;

varying float v_edge_dist;
varying vec3 v_color;

float colorT(float v, float cmin, float cmax) {
    if(cmax <= cmin) {
        return 0.5;
    } else if(cmin < 0.0 && cmax > 0.0) {
        float denom = max(-cmin, cmax);
        return clamp(0.5 + 0.5 * (v / denom), 0.0, 1.0);
    }
    return clamp((v - cmin) / (cmax - cmin), 0.0, 1.0);
}

void main() {
    // Average the two endpoints so the segment takes one color — keeps
    // the fragment shader cheap (no interpolated t sample) and matches
    // the single-tone feel of the old per-series palette.
    float cmin = u_color_range.x;
    float cmax = u_color_range.y;
    float avgVal = 0.5 * (a_color_start + a_color_end);
    float t = colorT(avgVal, cmin, cmax);
    v_color = texture2D(u_gradient_lut, vec2(t, 0.5)).rgb;

    vec4 clipStart = u_projection * vec4(a_start, 0.0, 1.0);
    vec4 clipEnd = u_projection * vec4(a_end, 0.0, 1.0);

    vec2 pixelStart = clipStart.xy * u_resolution * 0.5;
    vec2 pixelEnd = clipEnd.xy * u_resolution * 0.5;

    vec2 dir = pixelEnd - pixelStart;
    float segLen = length(dir);
    dir = segLen > 0.001 ? dir / segLen : vec2(1.0, 0.0);

    vec2 normal = vec2(-dir.y, dir.x);

    float isEnd = step(1.5, a_corner);
    float side = 1.0 - mod(a_corner, 2.0) * 2.0;

    vec4 clipPos = mix(clipStart, clipEnd, isEnd);

    float halfWidth = (u_line_width + 1.5) * 0.5;
    vec2 clipOffset = (normal * side * halfWidth) / (u_resolution * 0.5);

    gl_Position = clipPos + vec4(clipOffset, 0.0, 0.0);
    v_edge_dist = side;
}
