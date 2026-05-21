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
    if (!isFinite(v)) {
        return 0.5;
    }

    if (v < 0) {
        return 0;
    }

    if (v > 1) {
        return 1;
    }

    return v;
}

function clampGap(v: number): number {
    if (!isFinite(v) || v < 0) {
        return 1;
    }

    return v;
}

export interface Theme {
    fontFamily: string;
    tickColor: string;
    labelColor: string;
    axisLineColor: string;
    gridlineColor: string;
    backgroundColor: string;
    gradientStops: GradientStop[];
    legendText: string;
    legendBorder: string;
    tooltipBg: string;
    tooltipText: string;
    tooltipBorder: string;

    /**
     * Fill opacity for area glyphs. `--psp-charts--area--opacity`.
     */
    areaOpacity: number;

    /**
     * Pixel gap between heatmap cells. Controls the inset applied in the
     * heatmap vertex shader so neighbouring cells remain visually
     * distinguishable. `--psp-charts--heatmap-gap--px`.
     */
    heatmapGapPx: number;

    /**
     * Pixel gap between sunburst arcs (both radial — between ring
     * levels — and angular — between siblings). Works the same way as
     * `heatmapGapPx`: a symmetric inset in the vertex shader so the
     * transparent background shows through as a border.
     * `--psp-charts--sunburst-gap--px`.
     */
    sunburstGapPx: number;

    /**
     * Discrete series palette read from `--psp-charts--series-N--color`
     * (N = 1, 2, …). Empty when no palette is defined — callers should
     * fall back to `gradientStops` sampling in that case.
     */
    seriesPalette: [number, number, number][];
}

/**
 * Plain map of CSS variable name → resolved value. Produced on the
 * main thread via `snapshotThemeVars` and shipped to the worker
 * Renderer (which has no DOM and can't call `getComputedStyle`).
 */
export type ThemeSnapshot = Record<string, string>;

/**
 * Decode a `ThemeSnapshot` into the parsed `Theme` the renderer
 * consumes. Workers reach this from a serialized snapshot; host code
 * snapshots from the live DOM via `theme-snapshot.ts` and feeds it
 * through here.
 */
export function resolveThemeFromVars(vars: ThemeSnapshot): Theme {
    const get = (prop: string, fallback: string): string =>
        vars[prop] || fallback;

    const gradientSrc =
        vars["--psp-charts--gradient--background"] ||
        vars["--psp-charts--full-gradient--background"] ||
        "linear-gradient(#0366d6 0%, #ff7f0e 100%)";

    const gradientStops = parseCssGradient(gradientSrc);
    const seriesPalette: [number, number, number][] = [];
    for (let i = 1; ; i++) {
        const raw = vars[`--psp-charts--series-${i}--color`];
        if (!raw) {
            break;
        }

        seriesPalette.push(parseCSSColorToVec3(raw));
    }

    return {
        fontFamily: get(
            "--psp-charts--font-family",
            get("font-family", "monospace"),
        ),
        backgroundColor: get(
            "--psp--background-color",
            "rgba(255, 255, 255, 1)",
        ),
        tickColor: get(
            "--psp-charts--axis-ticks--color",
            "rgba(160, 0, 0, 0.8)",
        ),
        labelColor: get("--psp--color", "rgba(180, 0, 0, 0.9)"),
        axisLineColor: get(
            "--psp-charts--axis-lines--color",
            "rgba(160, 0, 0, 0.4)",
        ),
        gridlineColor: get(
            "--psp-charts--gridline--color",
            "rgba(255, 0, 0, 1)",
        ),
        gradientStops,
        legendText: get(
            "--psp-charts--legend--color",
            "rgba(180, 180, 180, 0.9)",
        ),
        legendBorder: get(
            "--psp-charts--legend-border--color",
            "rgba(128,128,128,0.3)",
        ),
        tooltipBg: get(
            "--psp-charts--tooltip--background",
            "rgba(155,155,155,0.8)",
        ),
        tooltipText: get("--psp-charts--tooltip--color", "#161616"),
        tooltipBorder: get("--psp-charts--tooltip--border-color", "#fff"),
        areaOpacity: clampOpacity(
            parseFloat(get("--psp-charts--area--opacity", "0.85")),
        ),
        heatmapGapPx: clampGap(
            parseFloat(get("--psp-charts--heatmap-gap--px", "0")),
        ),
        sunburstGapPx: clampGap(
            parseFloat(get("--psp-charts--sunburst-gap--px", "1")),
        ),
        seriesPalette,
    };
}
