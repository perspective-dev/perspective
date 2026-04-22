precision highp float;

varying float v_color_t;
varying float v_point_size;

uniform sampler2D u_gradient_lut;

void main() {
    // Distance from center of point sprite in [0, 0.5] space
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);

    // Discard fragments clearly outside the circle
    if (dist > 0.5) {
        discard;
    }

    // Anti-alias: smooth falloff over ~1.5 screen pixels at the edge.
    // In point-coord space, 1 pixel = 1/v_point_size.
    float pixelWidth = 1.5 / max(v_point_size, 1.0);
    float alpha = 1.0 - smoothstep(0.5 - pixelWidth, 0.5, dist);

    // LUT lookup — t is already sign-aware (pre-baked CPU-side via
    // `colorValueToT`), so the shader is a pure sampler.
    vec4 color = texture2D(u_gradient_lut, vec2(clamp(v_color_t, 0.0, 1.0), 0.5));
    gl_FragColor = vec4(color.rgb, color.a * alpha);
}
