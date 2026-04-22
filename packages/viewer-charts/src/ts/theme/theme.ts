// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import { parseCSSColorToVec3 } from "../utils/css";
import { parseCssGradient, type GradientStop } from "./gradient";

export type { GradientStop } from "./gradient";

function clampOpacity(v: number): number {
    if (!isFinite(v)) return 0.5;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function clampGap(v: number): number {
    if (!isFinite(v) || v < 0) return 1;
    return v;
}

export interface Theme {
    fontFamily: string;
    tickColor: string;
    labelColor: string;
    axisLineColor: string;
    gridlineColor: string;
    /**
     * Parsed multi-stop sequential gradient. Source precedence:
     *   1. `--psp-webgl--gradient--background` (canonical)
     *   2. `--psp-webgl--full-gradient--background` (legacy d3fc name)
     *   3. Hard-coded blue → orange fallback.
     *
     * The **50% offset stop** is the sign pivot used by the chart
     * renderers (see `colorValueToT` in `theme/gradient`). Pair the stops
     * with the chart's `[colorMin, colorMax]` and pass the result through
     * `colorValueToT` / `sampleGradient` to produce a consistent color
     * across the WebGL, Canvas2D legend, and tooltip paths.
     */
    gradientStops: GradientStop[];
    legendText: string;
    legendBorder: string;
    tooltipBg: string;
    tooltipText: string;
    tooltipBorder: string;
    /** Fill opacity for area glyphs. `--psp-webgl--area--opacity`. */
    areaOpacity: number;

    /**
     * Pixel gap between heatmap cells. Controls the inset applied in the
     * heatmap vertex shader so neighbouring cells remain visually
     * distinguishable. `--psp-webgl--heatmap-gap--px`.
     */
    heatmapGapPx: number;

    /**
     * Pixel gap between sunburst arcs (both radial — between ring
     * levels — and angular — between siblings). Works the same way as
     * `heatmapGapPx`: a symmetric inset in the vertex shader so the
     * transparent background shows through as a border.
     * `--psp-webgl--sunburst-gap--px`.
     */
    sunburstGapPx: number;
}

/**
 * Read every theme CSS variable from a single `getComputedStyle` call and
 * return a plain object. Cheap to call once per render; do not call per bar
 * or per series.
 */
export function resolveTheme(el: Element): Theme {
    const style = getComputedStyle(el);
    const get = (prop: string, fallback: string): string =>
        style.getPropertyValue(prop).trim() || fallback;

    // Canonical multi-stop gradient var with a legacy fallback for themes
    // that only define the d3fc-era `full-gradient` variant.
    const gradientSrc =
        style.getPropertyValue("--psp-webgl--gradient--background").trim() ||
        style
            .getPropertyValue("--psp-webgl--full-gradient--background")
            .trim() ||
        "linear-gradient(#0366d6 0%, #ff7f0e 100%)";
    const gradientStops = parseCssGradient(gradientSrc);

    return {
        fontFamily: get("--psp-webgl--font-family", "monospace"),
        tickColor: get(
            "--psp-webgl--axis-ticks--color",
            "rgba(160, 0, 0, 0.8)",
        ),
        labelColor: get("--psp--color", "rgba(180, 0, 0, 0.9)"),
        axisLineColor: get(
            "--psp-webgl--axis-lines--color",
            "rgba(160, 0, 0, 0.4)",
        ),
        gridlineColor: get(
            "--psp-webgl--gridline--color",
            "rgba(255, 0, 0, 1)",
        ),
        gradientStops,
        legendText: get(
            "--psp-webgl--legend--color",
            "rgba(180, 180, 180, 0.9)",
        ),
        legendBorder: get(
            "--psp-webgl--legend-border--color",
            "rgba(128,128,128,0.3)",
        ),
        tooltipBg: get(
            "--psp-webgl--tooltip--background",
            "rgba(155,155,155,0.8)",
        ),
        tooltipText: get("--psp-webgl--tooltip--color", "#161616"),
        tooltipBorder: get("--psp-webgl--tooltip--border-color", "#fff"),
        areaOpacity: clampOpacity(
            parseFloat(get("--psp-webgl--area--opacity", "0.75")),
        ),
        heatmapGapPx: clampGap(
            parseFloat(get("--psp-webgl--heatmap-gap--px", "0")),
        ),
        sunburstGapPx: clampGap(
            parseFloat(get("--psp-webgl--sunburst-gap--px", "1")),
        ),
    };
}

/**
 * Read the discrete series palette from `--psp-webgl--series-N--color`
 * custom properties (N = 1, 2, …). Stops at the first missing index.
 * Returns an empty array when no palette is defined — callers should fall
 * back to `theme.gradientStops` sampling in that case.
 */
export function readSeriesPalette(el: Element): [number, number, number][] {
    const style = getComputedStyle(el);
    const palette: [number, number, number][] = [];
    for (let i = 1; ; i++) {
        const raw = style
            .getPropertyValue(`--psp-webgl--series-${i}--color`)
            .trim();
        if (!raw) break;
        palette.push(parseCSSColorToVec3(raw));
    }
    return palette;
}
