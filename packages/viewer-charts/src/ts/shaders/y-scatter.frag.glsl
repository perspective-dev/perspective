precision highp float;

varying vec3 v_color;
varying float v_point_size;

void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);

    if (dist > 0.5) discard;

    // Anti-alias at the circle edge.
    float pixelWidth = 1.5 / max(v_point_size, 1.0);
    float alpha = 1.0 - smoothstep(0.5 - pixelWidth, 0.5, dist);

    gl_FragColor = vec4(v_color, alpha);
}
