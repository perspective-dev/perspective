// Per-instance attributes (advance once per segment via divisor=1).
// Both `a_start`/`a_end` and `a_series_start`/`a_series_end` are read
// from the same flat buffers using overlapping offsets: instance i reads
// vertex[i] into `*_start` and vertex[i+1] into `*_end`. The single big
// draw call covers all series; segments whose endpoints straddle a
// series boundary (or land in unused slots) are collapsed to degenerate
// quads by the discard branch below.
attribute vec2 a_start;
attribute vec2 a_end;
attribute float a_series_start;
attribute float a_series_end;

// Per-vertex attribute (advance every vertex, divisor=0)
// 0 = start+left, 1 = start+right, 2 = end+left, 3 = end+right
attribute float a_corner;

uniform mat4 u_projection;
uniform vec2 u_resolution;
uniform float u_line_width;
uniform float u_series_count;
uniform sampler2D u_gradient_lut;

varying float v_edge_dist;
varying vec3 v_color;

void main() {
    // Cross-series segment or unused slot (sentinel series_id = -1).
    // Collapse to a degenerate quad outside clip space so the rasterizer
    // emits nothing.
    if (a_series_start != a_series_end || a_series_start < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        v_edge_dist = 0.0;
        v_color = vec3(0.0);
        return;
    }

    // Sample the theme gradient at evenly-spaced offsets across series,
    // matching the CPU `interpolatePalette` used by bar and by the prior
    // per-series uniform path.
    float denom = u_series_count - 1.0;
    float t = denom > 0.0 ? a_series_start / denom : 0.5;
    v_color = texture2D(u_gradient_lut, vec2(t, 0.5)).rgb;

    vec4 clipStart = u_projection * vec4(a_start, 0.0, 1.0);
    vec4 clipEnd   = u_projection * vec4(a_end,   0.0, 1.0);

    vec2 pixelStart = clipStart.xy * u_resolution * 0.5;
    vec2 pixelEnd   = clipEnd.xy   * u_resolution * 0.5;

    vec2 dir = pixelEnd - pixelStart;
    float segLen = length(dir);
    dir = segLen > 0.001 ? dir / segLen : vec2(1.0, 0.0);

    vec2 normal = vec2(-dir.y, dir.x);

    float isEnd = step(1.5, a_corner);
    float side  = 1.0 - mod(a_corner, 2.0) * 2.0;

    vec4 clipPos = mix(clipStart, clipEnd, isEnd);

    float halfWidth = (u_line_width + 1.5) * 0.5;
    vec2 clipOffset = (normal * side * halfWidth) / (u_resolution * 0.5);

    gl_Position = clipPos + vec4(clipOffset, 0.0, 0.0);
    v_edge_dist = side;
}
