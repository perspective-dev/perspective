precision highp float;

varying vec3 v_color;
varying float v_hover;
varying vec2 v_local;

void main() {
    vec3 color = v_color;
    if (v_hover > 0.5) {
        color = mix(color, vec3(1.0), 0.25);
    }
    gl_FragColor = vec4(color, 1.0);
}
