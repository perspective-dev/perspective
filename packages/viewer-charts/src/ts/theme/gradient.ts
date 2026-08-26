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

import { parseCSSColorToVec3, vec3ToHexColor } from "../utils/css";

/**
 * A single stop on a parsed CSS gradient. `offset` ∈ [0, 1].
 */
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
    if (!src) {
        return DEFAULT_STOPS.slice();
    }

    const trimmed = src.trim();
    if (!trimmed) {
        return DEFAULT_STOPS.slice();
    }

    // Strip the `linear-gradient(` wrapper. Bail out if we don't find it.
    const openIdx = trimmed.indexOf("(");
    if (openIdx < 0) {
        return DEFAULT_STOPS.slice();
    }

    if (!/^linear-gradient\s*\(/i.test(trimmed)) {
        return DEFAULT_STOPS.slice();
    }

    const closeIdx = trimmed.lastIndexOf(")");
    if (closeIdx <= openIdx) {
        return DEFAULT_STOPS.slice();
    }

    const body = trimmed.substring(openIdx + 1, closeIdx);

    // Split on commas at depth 0 (respecting nested `rgb(...)` / `rgba(...)` /
    // `hsl(...)` parens which also contain commas).
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === "(") {
            depth++;
        } else if (ch === ")") {
            depth--;
        } else if (ch === "," && depth === 0) {
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
        if (!piece) {
            continue;
        }

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

    if (stops.length === 0) {
        return DEFAULT_STOPS.slice();
    }

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
    if (stops[0].offset === null) {
        stops[0].offset = 0;
    }

    if (stops[stops.length - 1].offset === null) {
        stops[stops.length - 1].offset = 1;
    }

    for (let i = 1; i < stops.length - 1; i++) {
        if (stops[i].offset !== null) {
            continue;
        }

        // Find next known offset.
        let j = i + 1;
        while (j < stops.length && stops[j].offset === null) {
            j++;
        }

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
 * A color literal — `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or
 * `rgba()` — as a `[0, 1]` RGB triple, or `null` for anything else.
 */
export function parseCssColorStrict(
    src: string,
): [number, number, number] | null {
    const s = src.trim();
    if (s.startsWith("#")) {
        const hex = s.slice(1);
        if (!/^[0-9a-f]+$/i.test(hex)) {
            return null;
        }

        if (hex.length === 3 || hex.length === 4) {
            return [
                parseInt(hex[0] + hex[0], 16) / 255,
                parseInt(hex[1] + hex[1], 16) / 255,
                parseInt(hex[2] + hex[2], 16) / 255,
            ];
        }

        if (hex.length === 6 || hex.length === 8) {
            return [
                parseInt(hex.slice(0, 2), 16) / 255,
                parseInt(hex.slice(2, 4), 16) / 255,
                parseInt(hex.slice(4, 6), 16) / 255,
            ];
        }

        return null;
    }

    const m = s.match(/^rgba?\(([^)]*)\)$/i);
    if (!m) {
        return null;
    }

    const tokens = m[1]
        .split("/")[0]
        .split(/[\s,]+/)
        .filter((x) => x.length > 0);
    if (tokens.length < 3 || tokens.length > 4) {
        return null;
    }

    const channel = (token: string): number | null => {
        const pct = token.endsWith("%");
        const n = parseFloat(pct ? token.slice(0, -1) : token);
        if (!isFinite(n)) {
            return null;
        }

        const v = pct ? (n / 100) * 255 : n;
        return Math.max(0, Math.min(255, Math.round(v))) / 255;
    };

    const r = channel(tokens[0]);
    const g = channel(tokens[1]);
    const b = channel(tokens[2]);
    return r === null || g === null || b === null ? null : [r, g, b];
}

/**
 * The shared `linear-gradient(...)` tokenizer of the viewer's CSS-valued
 * config grammar.
 */
export function tokenizeLinearGradient(
    src: string,
): Array<[[number, number, number], number | null]> | null {
    const m = src.trim().match(/^linear-gradient\s*\((.*)\)$/is);
    if (!m) {
        return null;
    }

    const body = m[1];
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === "(") {
            depth++;
        } else if (ch === ")") {
            depth--;
        } else if (ch === "," && depth === 0) {
            parts.push(body.substring(start, i));
            start = i + 1;
        }
    }

    parts.push(body.substring(start));
    const out: Array<[[number, number, number], number | null]> = [];
    for (let i = 0; i < parts.length; i++) {
        const piece = parts[i].trim();
        if (!piece) {
            return null;
        }

        const lower = piece.toLowerCase();
        if (
            i === 0 &&
            (lower.startsWith("to ") ||
                /^[-\d.]+(deg|rad|grad|turn)$/.test(lower))
        ) {
            continue;
        }

        const posMatch = piece.match(/\s([^\s)]+)$/);
        let color = piece;
        let offset: number | null = null;
        if (posMatch) {
            const tail = posMatch[1];
            if (tail.endsWith("%")) {
                const n = parseFloat(tail.slice(0, -1));
                if (!isFinite(n)) {
                    return null;
                }

                color = piece.substring(0, posMatch.index).trim();
                offset = n / 100;
            } else if (/^[-\d.]/.test(tail)) {
                return null;
            }
        }

        const rgb = parseCssColorStrict(color);
        if (!rgb) {
            return null;
        }

        out.push([rgb, offset]);
    }

    return out;
}

/**
 * Strict gradient reader: a `linear-gradient(...)` with ≥ 2 stops,
 * positions optional, offsets clamped to `[0, 1]` and sorted, or `null`
 * on malformed input.
 */
export function parseCssGradientStrict(src: string): GradientStop[] | null {
    const entries = tokenizeLinearGradient(src);
    if (!entries || entries.length < 2) {
        return null;
    }

    const offsets: Array<number | null> = entries.map(([, p]) => p);
    const last = offsets.length - 1;
    if (offsets[0] === null) {
        offsets[0] = 0;
    }

    if (offsets[last] === null) {
        offsets[last] = 1;
    }

    for (let i = 1; i < last; i++) {
        if (offsets[i] !== null) {
            continue;
        }

        let j = i + 1;
        while (offsets[j] === null) {
            j++;
        }

        const before = offsets[i - 1]!;
        const after = offsets[j]!;
        const span = j - (i - 1);
        for (let k = i; k < j; k++) {
            offsets[k] = before + ((k - (i - 1)) / span) * (after - before);
        }

        i = j - 1;
    }

    const stops: GradientStop[] = entries.map(([rgb], i) => ({
        offset: Math.max(0, Math.min(1, offsets[i]!)),
        color: [rgb[0], rgb[1], rgb[2], 1],
    }));

    stops.sort((a, b) => a.offset - b.offset);
    return stops;
}

/**
 * Strict palette reader: a `linear-gradient(...)` of ≥ 1 colors with no
 * positions, or `null` on malformed input.
 */
export function parseCssColorList(
    src: string,
): Array<[number, number, number]> | null {
    const entries = tokenizeLinearGradient(src);
    if (!entries || entries.length === 0) {
        return null;
    }

    const out: Array<[number, number, number]> = [];
    for (const [rgb, offset] of entries) {
        if (offset !== null) {
            return null;
        }

        out.push(rgb);
    }

    return out;
}

function formatPercent(offset: number): string {
    const rounded = Math.round(Math.max(0, Math.min(1, offset)) * 1000) / 10;
    return `${rounded}%`;
}

/**
 * The viewer's canonical gradient string for `stops`: `linear-gradient(to
 * right, #rrggbb P%, …)`, sorted, positions at 0.1% resolution.
 */
export function stopsToCss(stops: GradientStop[]): string {
    const body = [...stops]
        .sort((a, b) => a.offset - b.offset)
        .map(
            (stop) =>
                `${vec3ToHexColor([stop.color[0], stop.color[1], stop.color[2]])} ${formatPercent(stop.offset)}`,
        )
        .join(", ");

    return `linear-gradient(to right, ${body})`;
}

/**
 * The viewer's canonical palette string for `colors`: the same frame
 * with bare `#rrggbb` entries and no positions.
 */
export function colorsToCss(colors: Array<[number, number, number]>): string {
    return `linear-gradient(to right, ${colors.map(vec3ToHexColor).join(", ")})`;
}

/**
 * Piecewise-linear color sample at `t ∈ [0, 1]`. Returns RGBA in [0, 1].
 * Clamps `t` to the gradient's first/last stop outside `[0, 1]`.
 */
export function sampleGradient(
    stops: GradientStop[],
    t: number,
): [number, number, number, number] {
    if (stops.length === 0) {
        return [0, 0, 0, 1];
    }

    if (t <= stops[0].offset) {
        return stops[0].color.slice() as [number, number, number, number];
    }

    const last = stops[stops.length - 1];
    if (t >= last.offset) {
        return last.color.slice() as [number, number, number, number];
    }

    // Bisect for the interval containing `t`.
    let lo = 0;
    let hi = stops.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (stops[mid].offset <= t) {
            lo = mid;
        } else {
            hi = mid;
        }
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
    if (!isFinite(value) || colorMin === colorMax) {
        return 0.5;
    }

    let denom: number;
    if (colorMin >= 0) {
        denom = colorMax;
    } else if (colorMax <= 0) {
        denom = -colorMin;
    } else {
        denom = Math.max(-colorMin, colorMax);
    }

    if (denom <= 0) {
        return 0.5;
    }

    const t = 0.5 + 0.5 * (value / denom);
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function colorRangePivot(
    colorMin: number,
    colorMax: number,
): [number, number] {
    if (!isFinite(colorMin) || !isFinite(colorMax) || colorMin >= colorMax) {
        return [0, 0];
    }

    let denom: number;
    if (colorMin >= 0) {
        denom = colorMax;
    } else if (colorMax <= 0) {
        denom = -colorMin;
    } else {
        denom = Math.max(-colorMin, colorMax);
    }

    if (denom <= 0) {
        return [0, 0];
    }

    return [-denom, denom];
}

/**
 * Convert a discrete series palette (from `--psp-charts--series-N--color`)
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
    if (palette.length === 0) {
        return DEFAULT_STOPS.slice();
    }

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
