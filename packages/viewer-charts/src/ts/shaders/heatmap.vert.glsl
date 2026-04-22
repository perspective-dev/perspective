// Unit-quad corner per vertex: (0,0) bottom-left → (1,1) top-right.
attribute vec2 a_corner;

// Per-instance: cell grid coordinate + normalized color t in [0, 1].
attribute vec2 a_cell;
attribute float a_color_t;

uniform mat4 u_projection;
// Inset applied in data-space so the shader can carve a pixel-accurate
// gap between neighbouring cells regardless of plot size.
uniform vec2 u_cell_inset;

varying float v_color_t;

void main() {
    // Cell `c` occupies [c - 0.5, c + 0.5] on each axis. Inset shrinks
    // the rendered rect inward by `u_cell_inset` on all sides.
    float span_x = 1.0 - 2.0 * u_cell_inset.x;
    float span_y = 1.0 - 2.0 * u_cell_inset.y;
    float x = a_cell.x - 0.5 + u_cell_inset.x + a_corner.x * span_x;
    float y = a_cell.y - 0.5 + u_cell_inset.y + a_corner.y * span_y;

    gl_Position = u_projection * vec4(x, y, 0.0, 1.0);
    v_color_t = a_color_t;
}
