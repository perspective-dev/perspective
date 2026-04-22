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

import { sampleGradient, type GradientStop } from "./gradient";

export type Vec3 = [number, number, number];

/**
 * Build a series palette of length `count` by sampling the theme gradient
 * at evenly-spaced offsets. For count == 1 returns the 50% stop.
 */
export function interpolatePalette(
    stops: GradientStop[],
    count: number,
): Vec3[] {
    if (count <= 0) return [];
    const out: Vec3[] = new Array(count);
    for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const c = sampleGradient(stops, t);
        out[i] = [c[0], c[1], c[2]];
    }
    return out;
}

/**
 * Resolve a series palette: use the discrete `--psp-webgl--series-N--color`
 * palette when available, otherwise fall back to evenly-spaced samples of
 * the theme gradient.
 */
export function resolvePalette(
    discrete: Vec3[],
    stops: GradientStop[],
    count: number,
): Vec3[] {
    if (discrete.length > 0) {
        if (discrete.length >= count) return discrete.slice(0, count);
        // Cycle through the discrete palette for overflow indices.
        const out: Vec3[] = new Array(count);
        for (let i = 0; i < count; i++) out[i] = discrete[i % discrete.length];
        return out;
    }
    return interpolatePalette(stops, count);
}
