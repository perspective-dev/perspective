precision highp float;

uniform vec3 u_color;
uniform float u_opacity;

void main() {
    gl_FragColor = vec4(u_color, u_opacity);
}
