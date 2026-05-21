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

import type { TreeChartBase } from "./tree-chart";
import type { Vec3 } from "../../theme/palette";
import {
    colorValueToT,
    sampleGradient,
    type GradientStop,
} from "../../theme/gradient";

/**
 * Perceptual luminance for a 0..1 RGB triple. Used by tree-chart label
 * painters to pick a contrasting text color over each leaf's fill.
 */
export function luminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Sample a gradient and drop the alpha channel. Treemap / sunburst
 * fills carry alpha separately (see {@link leafRGBA}); this is the
 * "just give me the RGB" entry point.
 */
export function sampleRGB(
    stops: GradientStop[],
    t: number,
): [number, number, number] {
    const c = sampleGradient(stops, t);
    return [c[0], c[1], c[2]];
}

/**
 * Resolve a leaf's fill color according to the chart's color mode:
 *   - `"numeric"` — sign-aware gradient sample via `colorValueToT`.
 *   - `"series"` / `"empty"` — discrete palette lookup keyed by the
 *     node's `colorLabel` (composite of group_by levels in series mode;
 *     `""` in empty mode, which maps to `palette[0]`).
 *
 * Returns RGB only; the alpha channel is applied separately by
 * {@link leafRGBA} using `negativeAlpha` for leaves whose raw size was
 * negative.
 */
export function leafColor(
    chart: TreeChartBase,
    nodeId: number,
    stops: GradientStop[],
    palette: Vec3[],
): [number, number, number] {
    const store = chart._nodeStore;
    const colorValue = store.colorValue[nodeId];
    if (
        chart._colorMode === "numeric" &&
        !isNaN(colorValue) &&
        chart._colorMax > chart._colorMin
    ) {
        return sampleRGB(
            stops,
            colorValueToT(colorValue, chart._colorMin, chart._colorMax),
        );
    }

    const idx = chart._uniqueColorLabels.get(store.colorLabel[nodeId]) ?? 0;
    return palette[idx % palette.length] ?? [0, 0, 0];
}

/**
 * `leafColor` + an alpha channel. Negative-size leaves receive
 * `negativeAlpha` (mirrors `theme.areaOpacity` for area charts) so
 * they stay visually distinguishable from positive leaves without
 * disappearing.
 */
export function leafRGBA(
    chart: TreeChartBase,
    nodeId: number,
    stops: GradientStop[],
    palette: Vec3[],
    negativeAlpha: number,
): [number, number, number, number] {
    const rgb = leafColor(chart, nodeId, stops, palette);
    const alpha = chart._nodeStore.sizeSign[nodeId] < 0 ? negativeAlpha : 1.0;
    return [rgb[0], rgb[1], rgb[2], alpha];
}
