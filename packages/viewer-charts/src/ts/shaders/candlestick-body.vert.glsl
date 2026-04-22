// Filled-rectangle shader for candlestick bodies. A trimmed copy of
// the bar shader without the hover-highlight / dual-axis plumbing that
// candlestick doesn't need.

attribute vec2 a_corner;          // per-vertex, divisor=0: (0|1, 0|1)

attribute float a_x_center;       // per-instance
attribute float a_half_width;
attribute float a_y0;
attribute float a_y1;
attribute vec3  a_color;

uniform mat4 u_projection;

varying vec3 v_color;

void main() {
    float x = a_x_center + (a_corner.x - 0.5) * 2.0 * a_half_width;
    float y = mix(a_y0, a_y1, a_corner.y);
    gl_Position = u_projection * vec4(x, y, 0.0, 1.0);
    v_color = a_color;
}
