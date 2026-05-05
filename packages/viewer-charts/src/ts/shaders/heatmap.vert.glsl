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

// Unit-quad corner per vertex: (0,0) bottom-left → (1,1) top-right.
attribute vec2 a_corner;

// Per-instance: cell center (data units) + normalized color t in [0, 1].
// In category mode the center is the integer index `(xIdx, yIdx)`; in
// numeric mode the JS uploader pre-multiplies into real data values
// (e.g. ms-since-epoch).
attribute vec2 a_cell;
attribute float a_color_t;
uniform mat4 u_projection;

// Inset applied in data-space so the shader can carve a pixel-accurate
// gap between neighbouring cells regardless of plot size.
uniform vec2 u_cell_inset;

// Cell size in data units. `(1.0, 1.0)` for the integer category grid;
// in numeric mode the bandWidth derived from min adjacent delta.
uniform vec2 u_cell_size;
varying float v_color_t;

void main() {
    // Cell `c` occupies [c - half, c + half] on each axis. Inset shrinks
    // the rendered rect inward by `u_cell_inset` on all sides.
    vec2 half_size = 0.5 * u_cell_size;
    vec2 span = u_cell_size - 2.0 * u_cell_inset;
    float x = a_cell.x - half_size.x + u_cell_inset.x + a_corner.x * span.x;
    float y = a_cell.y - half_size.y + u_cell_inset.y + a_corner.y * span.y;
    gl_Position = u_projection * vec4(x, y, 0.0, 1.0);
    v_color_t = a_color_t;
}
