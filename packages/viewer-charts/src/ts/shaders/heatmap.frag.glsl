precision highp float;

uniform sampler2D u_gradient_lut;

varying float v_color_t;

void main() {
    float t = clamp(v_color_t, 0.0, 1.0);
    vec4 rgba = texture2D(u_gradient_lut, vec2(t, 0.5));
    gl_FragColor = vec4(rgba.rgb, 1.0);
}
