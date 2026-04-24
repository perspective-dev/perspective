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

// Per-vertex (divisor=0): position in the unit triangle-strip template.
//   a_strip_t ∈ [0, 1]  angular parameter along the arc
//   a_side    ∈ {0, 1}  0 = inner radius, 1 = outer radius
attribute float a_strip_t;
attribute float a_side;

// Per-instance (divisor=1) arc geometry.
attribute vec2 a_angles;  // (a0, a1)  in radians
attribute vec2 a_radii;   // (r0, r1)  inner / outer pixel radius
attribute vec4 a_color;

uniform vec2 u_center;      // chart center in pixel space
uniform vec2 u_resolution;  // viewport size in device pixels
uniform float u_border_px;   // symmetric inset, in device pixels

varying vec4 v_color;
varying vec2 v_edge;         // (angular t, radial t)  for optional AA fringe

void main() {
    // Symmetric inset: shrink the arc by half the border on every edge
    // so adjacent arcs each give up half, producing a
    // `u_border_px`-wide gap in pixel space.
    //
    // Radial inset is constant; angular inset is computed per-vertex
    // based on the vertex's *actual* radius. This keeps the angular gap
    // at exactly `u_border_px` pixels wide at every radial position —
    // without it, the gap narrows toward the center (since the same
    // dTheta corresponds to fewer pixels at smaller r).
    //
    // Side effect: the arc's side edges are slightly non-radial (they
    // curve so that the outer endpoint sits inside the inner endpoint's
    // wedge). At 1 px borders this is imperceptible; at very wide
    // borders the arc looks like a thin curved parallelogram — which
    // is, in fact, the shape with constant pixel-width gaps.
    float half_border = u_border_px * 0.5;

    float adjR0 = a_radii.x + half_border;
    float adjR1 = a_radii.y - half_border;
    if(adjR1 <= adjR0) {
        // Arc thinner than the border radially — nothing to draw.
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        v_color = vec4(0.0);
        v_edge = vec2(0.0);
        return;
    }

    // Per-vertex radius + angular inset. dTheta scales with 1/r so the
    // pixel-space gap is constant at every radial position. Clamp to
    // at most `span / 2` so narrow arcs collapse their inner edge to
    // a point at the midpoint angle instead of inverting (which would
    // send inner vertices past outer ones and rasterize degenerate
    // triangles across the screen). Every vertex of an instance takes
    // the same clamp path, so the triangle strip stays well-formed.
    float r = mix(adjR0, adjR1, a_side);
    float dTheta = half_border / max(r, 1.0);
    float span = a_angles.y - a_angles.x;
    dTheta = min(dTheta, span * 0.5);
    float angle = mix(a_angles.x + dTheta, a_angles.y - dTheta, a_strip_t);

    vec2 pixel = u_center + vec2(cos(angle), sin(angle)) * r;
    // Pixel → clip: origin top-left, Y flipped to match 2D canvas conv.
    vec2 clip = (pixel / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

    v_color = a_color;
    v_edge = vec2(a_strip_t, a_side);
}
