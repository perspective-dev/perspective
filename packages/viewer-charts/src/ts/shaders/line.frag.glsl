precision highp float;

uniform float u_line_width;

varying float v_edge_dist;
varying vec3 v_color;

void main() {
    // |v_edge_dist| ranges from 0 (line centre) to 1 (outer AA fringe edge).
    // The solid core of the line extends to coreEdge; beyond that we fade out.
    float dist = abs(v_edge_dist);
    float coreEdge = u_line_width / (u_line_width + 1.5);
    float alpha = 1.0 - smoothstep(coreEdge, 1.0, dist);

    gl_FragColor = vec4(v_color, alpha);
}
