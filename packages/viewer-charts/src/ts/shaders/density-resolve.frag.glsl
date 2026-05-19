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

precision highp float;

uniform sampler2D u_heat;
uniform sampler2D u_extreme;
uniform sampler2D u_gradient_lut;

// Saturation knob shared by every mode. `density` maps it onto hue,
// `mean` / `extreme` map it onto alpha, `signed` uses it as the
// signed-sum denominator.
uniform float u_heat_max;

// 0 = density-only (color column ignored)
// 1 = mean (density-weighted average of color-t)
// 2 = extreme (sign-aware max-blended deviation)
// 3 = signed (net positive vs net negative accumulation)
uniform int u_color_mode;

varying vec2 v_uv;

void main() {
    vec4 sd = texture2D(u_heat, v_uv);
    float density = sd.r;
    float weighted = sd.g;

    if(density <= 0.0) {
        discard;
    }

    float t;
    float alpha;
    float n = clamp(density / max(u_heat_max, 1e-4), 0.0, 1.0);

    if(u_color_mode == 0) {
        // Density only: gamma-curve clamped density into the hue
        // axis. Alpha follows raw density so a single splat fades
        // smoothly into the plot background.
        t = pow(n, 0.6);
        alpha = clamp(density, 0.0, 1.0);
    } else if(u_color_mode == 2) {
        // Extreme: signed max of `t - 0.5` is split across R (positive
        // deviation) and G (negative deviation magnitude); whichever
        // is larger wins the sign. Falls back to neutral if neither
        // contributed at this pixel.
        vec4 ext = texture2D(u_extreme, v_uv);
        float pos = ext.r;
        float neg = ext.g;
        float winner = max(pos, neg);
        if(winner <= 0.0) {
            t = 0.5;
        } else if(pos >= neg) {
            t = clamp(0.5 + pos * 0.5, 0.5, 1.0);
        } else {
            t = clamp(0.5 - neg * 0.5, 0.0, 0.5);
        }
        alpha = n;
    } else if(u_color_mode == 3) {
        // Signed sum: each splat additively contributes `w * t`, so
        // the per-pixel signed sum (relative to the neutral midpoint)
        // is `Σ w(t-0.5) = G - 0.5·R`. Sign drives which half of the
        // LUT we land in, magnitude/heat_max drives both saturation
        // and alpha.
        float signed_sum = weighted - 0.5 * density;
        float mag = clamp(abs(signed_sum) / max(u_heat_max, 1e-4), 0.0, 1.0);
        float dir = signed_sum >= 0.0 ? 1.0 : -1.0;
        t = clamp(0.5 + 0.5 * dir * mag, 0.0, 1.0);
        alpha = mag;
    } else {
        // Mean (mode 1, default): density-weighted average of per-
        // point color-t, with density driving alpha so sparse
        // pixels fade out.
        t = clamp(weighted / density, 0.0, 1.0);
        alpha = n;
    }

    vec4 color = texture2D(u_gradient_lut, vec2(t, 0.5));
    gl_FragColor = vec4(color.rgb, color.a * alpha);
}
