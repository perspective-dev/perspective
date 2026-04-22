// Per-vertex (divisor=0): unit quad corner in [0,1]^2 order
// 0=(0,0) bottom-left, 1=(1,0) bottom-right, 2=(0,1) top-left, 3=(1,1) top-right
attribute vec2 a_corner;

// Per-instance (divisor=1) bar attributes
attribute float a_x_center;
attribute float a_half_width;
attribute float a_y0;
attribute float a_y1;
attribute vec3 a_color;
attribute float a_series_id;
attribute float a_axis;

uniform mat4 u_proj_left;
uniform mat4 u_proj_right;
uniform float u_hover_series;
// 0 = vertical bars (categorical X, numeric Y).
// 1 = horizontal bars (numeric X, categorical Y). Instance attributes
// stay in "logical" form — x_center + halfWidth on the categorical axis,
// y0/y1 on the value axis — and we transpose at projection time.
uniform float u_horizontal;

varying vec3 v_color;
varying float v_hover;
varying vec2 v_local;

void main() {
    vec2 pos;
    if (u_horizontal > 0.5) {
        pos = vec2(
            mix(a_y0, a_y1, a_corner.x),
            a_x_center + (a_corner.y - 0.5) * 2.0 * a_half_width
        );
    } else {
        pos = vec2(
            a_x_center + (a_corner.x - 0.5) * 2.0 * a_half_width,
            mix(a_y0, a_y1, a_corner.y)
        );
    }

    // Branch on per-instance axis flag. Both matrices are set each frame.
    mat4 proj = a_axis < 0.5 ? u_proj_left : u_proj_right;
    gl_Position = proj * vec4(pos, 0.0, 1.0);

    v_color = a_color;
    v_hover = abs(a_series_id - u_hover_series) < 0.5 ? 1.0 : 0.0;
    v_local = a_corner;
}
