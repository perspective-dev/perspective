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

// MRT variant of the splat fragment used by `extreme` mode when the
// running context advertises `OES_draw_buffers_indexed`. One pass
// writes to both targets:
//
//   - location 0 (heat FBO, ADD blend): same payload as
//     density-splat.frag.glsl — `(w, w·t, 0, 0)`.
//   - location 1 (extreme FBO, MAX blend): same payload as
//     density-extreme.frag.glsl — split signed deviation.

precision highp float;

uniform float u_intensity;

in vec2 v_uv;
in float v_color_t;

layout(location = 0) out vec4 outHeat;
layout(location = 1) out vec4 outExtreme;

void main() {
    float r = length(v_uv);
    float w = max(0.0f, 1.0f - r);
    w = w * w * u_intensity;
    if(w <= 0.0f) {
        discard;
    }

    outHeat = vec4(w, w * v_color_t, 0.0f, 0.0f);
    float dev = (v_color_t - 0.5f) * 2.0f;
    outExtreme = vec4(max(0.0f, dev), max(0.0f, -dev), 0.0f, 0.0f);
}
