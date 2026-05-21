#version 300 es
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

// GLSL ES 3.00 variant of `density-splat.vert.glsl`, mirroring its math
// 1:1 in the modern dialect (`in`/`out` instead of `attribute`/
// `varying`). Paired with `density-mrt.frag.glsl` for the MRT fast
// path used by `extreme` mode on WebGL2 — the program's vertex and
// fragment shaders must share a GLSL version, so the WebGL1-style
// splat vert can't be linked against a 300 ES MRT frag.

in vec2 a_corner;
in vec2 a_position;
in float a_color_value;

uniform mat4 u_projection;
uniform vec2 u_radius_ndc;
uniform vec2 u_color_range;

out vec2 v_uv;
out float v_color_t;

void main() {
    vec4 center = u_projection * vec4(a_position, 0.0, 1.0);
    gl_Position = center + vec4(a_corner * u_radius_ndc * center.w, 0.0, 0.0);

    v_uv = a_corner;

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
