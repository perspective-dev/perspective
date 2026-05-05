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

import type { ColorRecord } from "./types.js";

/** 8-bit sRGB color as `[r, g, b]` with each channel in `[0, 255]`. */
export type RGB = [number, number, number];

/** HSL color as `[h, s, l]` with `h` in degrees `[0, 360)` and `s`, `l` in `[0, 1]`. */
export type HSL = [number, number, number];

const parse_cache = new Map<string, RGB>();
let parse_ctx: CanvasRenderingContext2D | null = null;

/** Parse a CSS hex color (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`). Returns `null` if `input` is not a hex literal. Alpha is ignored. */
function parse_hex(input: string): RGB | null {
    const s = input.startsWith("#") ? input.slice(1) : input;
    if (s.length === 3 || s.length === 4) {
        const r = parseInt(s[0] + s[0], 16);
        const g = parseInt(s[1] + s[1], 16);
        const b = parseInt(s[2] + s[2], 16);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            return [r, g, b];
        }
    } else if (s.length === 6 || s.length === 8) {
        const r = parseInt(s.slice(0, 2), 16);
        const g = parseInt(s.slice(2, 4), 16);
        const b = parseInt(s.slice(4, 6), 16);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            return [r, g, b];
        }
    }

    return null;
}

/** Parse a CSS `rgb()` or `rgba()` functional color. Returns `null` if `input` does not match. Alpha is ignored. */
function parse_rgb_fn(input: string): RGB | null {
    const m = input.match(
        /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i,
    );
    if (!m) {
        return null;
    }

    return [
        Math.round(parseFloat(m[1])),
        Math.round(parseFloat(m[2])),
        Math.round(parseFloat(m[3])),
    ];
}

/** Fallback parser that defers to the browser by assigning `input` to a 2D canvas `fillStyle` and re-reading the normalized value. Handles named colors, `hsl()`, etc. Returns `[0, 0, 0]` if the value is invalid or no canvas context is available. */
function parse_via_canvas(input: string): RGB {
    if (!parse_ctx) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        parse_ctx = canvas.getContext("2d");
    }

    if (!parse_ctx) {
        return [0, 0, 0];
    }

    parse_ctx.fillStyle = "#000";
    parse_ctx.fillStyle = input;
    const normalized = parse_ctx.fillStyle as string;
    return parse_hex(normalized) ?? parse_rgb_fn(normalized) ?? [0, 0, 0];
}

/** Parse any CSS color string into an `RGB` triple. Tries hex and `rgb()` fast paths, then falls back to a canvas-based parser for named colors, `hsl()`, etc. Results are memoized per input. */
export function parseColor(input: string): RGB {
    const key = input.trim();
    const cached = parse_cache.get(key);
    if (cached) {
        return cached;
    }

    const rgb = parse_hex(key) ?? parse_rgb_fn(key) ?? parse_via_canvas(key);
    parse_cache.set(key, rgb);
    return rgb;
}

/** Format a single channel as a clamped, zero-padded two-digit hex byte. */
function toHex(c: number): string {
    const v = Math.max(0, Math.min(255, Math.round(c)));
    return v.toString(16).padStart(2, "0");
}

/** Format an `RGB` triple as a `#rrggbb` hex string. Channels are clamped to `[0, 255]`. */
export function rgbToHex([r, g, b]: RGB): string {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert sRGB to HSL. Output `h` is in degrees `[0, 360)`; `s` and `l` are in `[0, 1]`. */
export function rgbToHsl([r, g, b]: RGB): HSL {
    const rn = r / 255,
        gn = g / 255,
        bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let s = 0;
    if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rn) {
            h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        } else if (max === gn) {
            h = ((bn - rn) / d + 2) * 60;
        } else {
            h = ((rn - gn) / d + 4) * 60;
        }
    }

    return [h, s, l];
}

/** Convert HSL to sRGB. `h` is wrapped into `[0, 360)`; `s` and `l` are expected in `[0, 1]`. Output channels are rounded to integers in `[0, 255]`. */
export function hslToRgb([h, s, l]: HSL): RGB {
    const hn = (((h % 360) + 360) % 360) / 360;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number): number => {
        if (t < 0) {
            t += 1;
        }

        if (t > 1) {
            t -= 1;
        }

        if (t < 1 / 6) {
            return p + (q - p) * 6 * t;
        }

        if (t < 1 / 2) {
            return q;
        }

        if (t < 2 / 3) {
            return p + (q - p) * (2 / 3 - t) * 6;
        }

        return p;
    };

    return [
        Math.round(f(hn + 1 / 3) * 255),
        Math.round(f(hn) * 255),
        Math.round(f(hn - 1 / 3) * 255),
    ];
}

/**
 * Blend two `RGB` colors using LRGB (gamma-naive linear) interpolation,
 * matching chroma-js's default `mix` mode. `f` is the weight of `b` in `[0, 1]`
 * (0 returns `a`, 1 returns `b`).
 */
export function mixRgb(a: RGB, b: RGB, f = 0.5): RGB {
    return [
        Math.round(Math.sqrt(a[0] * a[0] * (1 - f) + b[0] * b[0] * f)),
        Math.round(Math.sqrt(a[1] * a[1] * (1 - f) + b[1] * b[1] * f)),
        Math.round(Math.sqrt(a[2] * a[2] * (1 - f) + b[2] * b[2] * f)),
    ];
}

/** 50/50 LRGB blend of CSS color `a` with `RGB`-ish triple `b`, returned as `#rrggbb`. */
export function blend(a: string, b: number[]): string {
    return rgbToHex(mixRgb(parseColor(a), [b[0], b[1], b[2]], 0.5));
}

/** Composite a premultiplied-style `RGBA` cell color over `source` (default white) and return the resulting opaque `RGB`. Used to flatten heatmap cells against the background. */
export function rgbaToRgb(
    [r, g, b, a]: [number, number, number, number],
    source: [number, number, number] = [255, 255, 255],
): [number, number, number] {
    function f(i: number, c: number): number {
        return ((1 - a) * (source[i] / 255) + a * (c / 255)) * 255;
    }

    return [f(0, r), f(1, g), f(2, b)];
}

/** Pick a readable foreground (`#161616` or `#ffffff`) for the given background using a perceptual luminance threshold. */
export function infer_foreground_from_background([r, g, b]: [
    number,
    number,
    number,
]): string {
    // TODO Implement dark/light themes.
    return Math.sqrt(r * r * 0.299 + g * g * 0.587 + b * b * 0.114) > 130
        ? "#161616"
        : "#ffffff";
}

/** Build a CSS `linear-gradient` that fans `rgb` ±15° in hue, used as the negative-value swatch in column color pickers. */
function make_gradient(rgb: RGB): string {
    const [h, s, l] = rgbToHsl(rgb);
    const [r, g, b] = rgb;
    const [r1, g1, b1] = hslToRgb([h - 15, s, l]);
    const [r2, g2, b2] = hslToRgb([h + 15, s, l]);
    return `linear-gradient(to right top,rgb(${r1},${g1},${b1}),rgb(${r},${g},${b}) 50%,rgb(${r2},${g2},${b2}))`;
}

/** Precompute the tuple of derived color strings (RGB channels, gradient, opaque/transparent rgba) cached on the model for a configured plugin color. */
export function make_color_record(color: string): ColorRecord {
    const rgb = parseColor(color);
    const _neg_grad = make_gradient(rgb);
    return [
        color,
        rgb[0],
        rgb[1],
        rgb[2],
        _neg_grad,
        `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`,
        `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`,
    ];
}
