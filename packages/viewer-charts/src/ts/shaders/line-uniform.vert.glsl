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

// Uniform-color line shader used by bar's line-glyph overlay. The
// LineChart pipeline uses `line.vert.glsl` instead, which drives color
// from a per-point series-id + gradient LUT. Bar pre-computes one
// `s.color` per series from its own palette resolver, so a uniform
// is the right fit here.
attribute vec2 a_start;
attribute vec2 a_end;

// Per-vertex attribute (advance every vertex, divisor=0)
// 0 = start+left, 1 = start+right, 2 = end+left, 3 = end+right
attribute float a_corner;

// Per-segment "is endpoint a real source-data cell" flags. Both vertices
// of a segment's quad see the same instance values, so `v_seg_alpha`
// below is constant across the quad — no gradient fade. Read from the
// per-cell real-flag buffer with offset 0 / 1 (same overlap trick as
// the bar-line glyph's segment-position attributes).
attribute float a_real_start;
attribute float a_real_end;

uniform mat4 u_projection;
uniform vec2 u_resolution;
uniform float u_line_width;

// Alpha multiplier applied to any segment whose endpoints are not both
// real. Set per draw based on the series' interpolate mode:
//   0.0 = skip        (gaps at synthesized cells)
//   1.0 = solid       (no visible difference; default for non-line)
//   0.5 = transparent (50% opacity on segments touching synthesized cells)
uniform float u_interp_alpha;

varying float v_edge_dist;
varying float v_seg_alpha;

void main() {
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

    float bothReal = a_real_start * a_real_end;
    v_seg_alpha = mix(u_interp_alpha, 1.0, step(0.5, bothReal));
}
