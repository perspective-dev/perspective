attribute vec2 a_position;
attribute vec3 a_color;

uniform vec2 u_resolution;

varying vec3 v_color;

void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    v_color = a_color;
}
