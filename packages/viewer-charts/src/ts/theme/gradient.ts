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

/** A single stop on a parsed CSS gradient. `offset` ∈ [0, 1]. */
export interface GradientStop {
    offset: number;
    color: [number, number, number, number]; // RGBA, each ∈ [0, 1]
}

const DEFAULT_STOPS: GradientStop[] = [
    { offset: 0, color: [0x03 / 255, 0x66 / 255, 0xd6 / 255, 1] },
    { offset: 1, color: [0xff / 255, 0x7f / 255, 0x0e / 255, 1] },
];

/**
 * Parse a `linear-gradient(...)` CSS expression into ordered stops. Tolerates
 * missing percentages (distributes linearly between known offsets, matching
 * the CSS standard) and leading direction tokens (`to right`, `90deg`, etc.)
 * which are simply skipped.
 *
 * Returns the default blue → orange two-stop on any parse failure so themes
 * that never set the gradient still produce sane output.
 */
export function parseCssGradient(
    src: string | null | undefined,
): GradientStop[] {
    if (!src) return DEFAULT_STOPS.slice();
    const trimmed = src.trim();
    if (!trimmed) return DEFAULT_STOPS.slice();

    // Strip the `linear-gradient(` wrapper. Bail out if we don't find it.
    const openIdx = trimmed.indexOf("(");
    if (openIdx < 0) return DEFAULT_STOPS.slice();
    if (!/^linear-gradient\s*\(/i.test(trimmed)) return DEFAULT_STOPS.slice();
    const closeIdx = trimmed.lastIndexOf(")");
    if (closeIdx <= openIdx) return DEFAULT_STOPS.slice();
    const body = trimmed.substring(openIdx + 1, closeIdx);

    // Split on commas at depth 0 (respecting nested `rgb(...)` / `rgba(...)` /
    // `hsl(...)` parens which also contain commas).
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) {
            parts.push(body.substring(start, i));
            start = i + 1;
        }
    }
    parts.push(body.substring(start));

    // First part may be a direction (`to right`, `90deg`, `to bottom right`)
    // rather than a color-stop. Detect by: no matching color syntax.
    const stops: Array<{
        color: [number, number, number];
        offset: number | null;
    }> = [];
    let startIdx = 0;
    if (parts.length > 0) {
        const firstNorm = parts[0].trim().toLowerCase();
        if (
            firstNorm.startsWith("to ") ||
            /^[-\d.]+(deg|rad|grad|turn)/.test(firstNorm)
        ) {
            startIdx = 1;
        }
    }

    for (let i = startIdx; i < parts.length; i++) {
        const piece = parts[i].trim();
        if (!piece) continue;
        // Peel off an optional trailing `<number>%` or `<number>px`.
        const pctMatch = piece.match(/\s([\-\d.]+)%\s*$/);
        const color = pctMatch
            ? piece.substring(0, pctMatch.index).trim()
            : piece;
        const offset = pctMatch ? parseFloat(pctMatch[1]) / 100 : null;
        try {
            const rgb = parseCSSColorToVec3(color);
            stops.push({ color: rgb, offset });
        } catch {
            // skip unparseable stop
        }
    }

    if (stops.length === 0) return DEFAULT_STOPS.slice();
    if (stops.length === 1) {
        // Single stop → solid color. Duplicate across [0, 1] so sampling works.
        const [r, g, b] = stops[0].color;
        return [
            { offset: 0, color: [r, g, b, 1] },
            { offset: 1, color: [r, g, b, 1] },
        ];
    }

    // Fill in missing offsets by linear interpolation of neighbours with
    // known positions (CSS implicit-position semantics).
    if (stops[0].offset === null) stops[0].offset = 0;
    if (stops[stops.length - 1].offset === null)
        stops[stops.length - 1].offset = 1;

    for (let i = 1; i < stops.length - 1; i++) {
        if (stops[i].offset !== null) continue;
        // Find next known offset.
        let j = i + 1;
        while (j < stops.length && stops[j].offset === null) j++;
        const before = stops[i - 1].offset!;
        const after = stops[j].offset!;
        const span = j - (i - 1);
        for (let k = i; k < j; k++) {
            stops[k].offset =
                before + ((k - (i - 1)) / span) * (after - before);
        }
        i = j - 1;
    }

    // Clamp offsets to [0, 1] and ensure non-decreasing order.
    let prev = 0;
    const result: GradientStop[] = stops.map((s) => {
        const off = Math.max(prev, Math.min(1, s.offset!));
        prev = off;
        return {
            offset: off,
            color: [s.color[0], s.color[1], s.color[2], 1],
        };
    });

    return result;
}

/**
 * Piecewise-linear color sample at `t ∈ [0, 1]`. Returns RGBA in [0, 1].
 * Clamps `t` to the gradient's first/last stop outside `[0, 1]`.
 */
export function sampleGradient(
    stops: GradientStop[],
    t: number,
): [number, number, number, number] {
    if (stops.length === 0) return [0, 0, 0, 1];
    if (t <= stops[0].offset)
        return stops[0].color.slice() as [number, number, number, number];
    const last = stops[stops.length - 1];
    if (t >= last.offset)
        return last.color.slice() as [number, number, number, number];

    // Bisect for the interval containing `t`.
    let lo = 0;
    let hi = stops.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (stops[mid].offset <= t) lo = mid;
        else hi = mid;
    }
    const a = stops[lo];
    const b = stops[hi];
    const span = b.offset - a.offset;
    const u = span > 0 ? (t - a.offset) / span : 0;
    return [
        a.color[0] + (b.color[0] - a.color[0]) * u,
        a.color[1] + (b.color[1] - a.color[1]) * u,
        a.color[2] + (b.color[2] - a.color[2]) * u,
        a.color[3] + (b.color[3] - a.color[3]) * u,
    ];
}

/**
 * Sign-aware normalization. Returns `t ∈ [0, 1]` where the 50% stop is
 * always the sign pivot:
 *   - crosses zero → `[-maxAbs, maxAbs]` stretched symmetrically; 0 → 0.5.
 *   - all-positive → `[0, colorMax]` occupies top half `[0.5, 1]`.
 *   - all-negative → `[colorMin, 0]` occupies bottom half `[0, 0.5]`.
 *   - degenerate   → 0.5 (single colour at the midpoint).
 */
export function colorValueToT(
    value: number,
    colorMin: number,
    colorMax: number,
): number {
    if (!isFinite(value) || colorMin === colorMax) return 0.5;
    let denom: number;
    if (colorMin >= 0) {
        denom = colorMax;
    } else if (colorMax <= 0) {
        denom = -colorMin;
    } else {
        denom = Math.max(-colorMin, colorMax);
    }
    if (denom <= 0) return 0.5;
    const t = 0.5 + 0.5 * (value / denom);
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Convert a discrete series palette (from `--psp-webgl--series-N--color`)
 * into a `GradientStop[]` with stops at `i / (N - 1)`. The resulting
 * stops can feed `buildGradientLUT` / `ensureGradientTexture` / any
 * other code path that already accepts a gradient — so categorical
 * coloring and numeric gradients share one LUT pipeline. Integer idx
 * sampling via `t = idx / (N - 1)` lands exactly on a palette color;
 * the linear blend between stops is only hit by non-integer samples
 * (which categorical data doesn't produce).
 */
export function paletteToStops(
    palette: [number, number, number][],
): GradientStop[] {
    if (palette.length === 0) return DEFAULT_STOPS.slice();
    if (palette.length === 1) {
        const [r, g, b] = palette[0];
        return [
            { offset: 0, color: [r, g, b, 1] },
            { offset: 1, color: [r, g, b, 1] },
        ];
    }
    const denom = palette.length - 1;
    return palette.map(([r, g, b], i) => ({
        offset: i / denom,
        color: [r, g, b, 1],
    }));
}

/**
 * Bake a sampled LUT for GPU upload as RGBA8 (`size × 1`). Default 256
 * samples — visually indistinguishable from a denser sample at typical
 * viewport sizes and keeps the texture tiny (1 KB).
 */
export function buildGradientLUT(
    stops: GradientStop[],
    size: number = 256,
): Uint8Array {
    const out = new Uint8Array(size * 4);
    for (let i = 0; i < size; i++) {
        const t = size === 1 ? 0 : i / (size - 1);
        const c = sampleGradient(stops, t);
        out[i * 4] = Math.round(c[0] * 255);
        out[i * 4 + 1] = Math.round(c[1] * 255);
        out[i * 4 + 2] = Math.round(c[2] * 255);
        out[i * 4 + 3] = Math.round(c[3] * 255);
    }
    return out;
}
