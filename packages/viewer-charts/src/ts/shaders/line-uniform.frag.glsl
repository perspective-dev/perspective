precision highp float;

uniform vec4 u_color;
uniform float u_line_width;

varying float v_edge_dist;

void main() {
    float dist = abs(v_edge_dist);
    float coreEdge = u_line_width / (u_line_width + 1.5);
    float alpha = 1.0 - smoothstep(coreEdge, 1.0, dist);

    gl_FragColor = vec4(u_color.rgb, u_color.a * alpha);
}
