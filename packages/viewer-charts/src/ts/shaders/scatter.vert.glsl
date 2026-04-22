attribute vec2 a_position;
attribute float a_color_value;
attribute float a_size_value;

uniform mat4 u_projection;
uniform float u_point_size;
// Data extents of the color column. The vertex shader folds these into a
// sign-aware `t` whose 50% stop is always the sign pivot, matching the
// CPU-side `colorValueToT` helper used by heatmap and the Canvas2D
// legend / tooltip.
uniform vec2 u_color_range;
uniform vec2 u_size_range;
uniform vec2 u_point_size_range;

varying float v_color_t;
varying float v_point_size;

void main() {
    // Unused-slot sentinel: the per-series slotted buffer leaves tails
    // filled with `a_color_value = -1` so a single draw can cover all
    // series. Collapse those vertices to clip-discard. The sentinel is
    // only exposed in multi-series mode, where `a_color_value` holds a
    // non-negative series index; single-series draws bound the count to
    // valid rows and never reach this branch.
    if (a_color_value < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        v_point_size = 0.0;
        v_color_t = 0.0;
        return;
    }

    gl_Position = u_projection * vec4(a_position, 0.0, 1.0);

    float sizeRange = u_size_range.y - u_size_range.x;
    if (sizeRange > 0.0) {
        float size_t = clamp((a_size_value - u_size_range.x) / sizeRange, 0.0, 1.0);
        gl_PointSize = mix(u_point_size_range.x, u_point_size_range.y, size_t);
    } else {
        gl_PointSize = u_point_size;
    }

    v_point_size = gl_PointSize;

    // Color-t mapping. Linear across `[cmin, cmax]` for single-sign
    // domains (which includes categorical `[0, N-1]` split / string
    // indices, so the colors match `interpolatePalette`'s even sampling
    // used by the legend). When the domain actually crosses zero we
    // switch to sign-aware so the value 0 always lands at the 50% stop
    // of the diverging gradient — matching heatmap and the Canvas2D
    // tooltip paths.
    float cmin = u_color_range.x;
    float cmax = u_color_range.y;
    if (cmax <= cmin) {
        v_color_t = 0.5;
    } else if (cmin < 0.0 && cmax > 0.0) {
        float denom = max(-cmin, cmax);
        v_color_t = clamp(0.5 + 0.5 * (a_color_value / denom), 0.0, 1.0);
    } else {
        v_color_t = clamp((a_color_value - cmin) / (cmax - cmin), 0.0, 1.0);
    }
}
