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

// Per-vertex (divisor 0): unit-quad corner in `[(-1,-1), (1,-1), (-1,1), (1,1)]`.
attribute vec2 a_corner;

// Per-instance (divisor 1): data-space xy of the splat center.
attribute vec2 a_position;

// Per-instance (divisor 1): raw color column value. Folded into a
// sign-aware `t` matching the scatter glyph for cross-chart parity.
attribute float a_color_value;

// Splat radius expressed in NDC. Computed CPU-side as
// `(radius_px * dpr * 2) / plot_pixel_width` so the disk maintains a
// fixed pixel footprint as the user zooms.
uniform vec2 u_radius_ndc;

uniform mat4 u_projection;
uniform vec2 u_color_range;
varying vec2 v_uv;
varying float v_color_t;

void main() {
    // Project the data-space center into clip space, then offset by the
    // unit-quad corner scaled by `u_radius_ndc`. This keeps splats
    // axis-aligned to the screen regardless of zoom level.
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
