// Per-vertex: one point per (series, category) sample. Color is carried
// per-vertex so a single draw call can render every scatter series with
// its palette color, no gradient lookup.

attribute vec2 a_position;
attribute vec3 a_color;

uniform mat4 u_projection;
uniform float u_point_size;

varying vec3 v_color;
varying float v_point_size;

void main() {
    gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
    gl_PointSize = u_point_size;
    v_point_size = u_point_size;
    v_color = a_color;
}
