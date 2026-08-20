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

import {
    parseCssColorList,
    parseCssGradientStrict,
    type GradientStop,
} from "./gradient";
import type { Theme } from "./theme";
import type { Vec3 } from "./palette";

/**
 * Per-column color-scale overrides from the viewer's `columns_config`,
 * patched into the resolved `Theme`'s `seriesPalette` / `gradientStops`
 * fields.
 */
export function applyColumnColorOverrides(
    theme: Theme,
    columnsConfig: Record<string, any> | undefined,
    colorColumn: string | null,
): Theme {
    if (!colorColumn) {
        return theme;
    }

    const cfg = columnsConfig?.[colorColumn];
    if (!cfg) {
        return theme;
    }

    let out = theme;
    const gradient = parseGradientOverride(cfg.gradient);
    if (gradient) {
        out = { ...out, gradientStops: gradient };
    }

    const palette = parsePaletteOverride(cfg.palette);
    if (palette) {
        out = { ...out, seriesPalette: palette };
    }

    return out;
}

/**
 * Parse a stored `palette` value into the `seriesPalette` shape, or
 * `null` on anything malformed.
 */
export function parsePaletteOverride(raw: unknown): Vec3[] | null {
    if (typeof raw !== "string") {
        return null;
    }

    return parseCssColorList(raw);
}

/**
 * Parse a stored `gradient` value into sorted `GradientStop[]`, or
 * `null` on malformed input or fewer than 2 stops.
 */
export function parseGradientOverride(raw: unknown): GradientStop[] | null {
    if (typeof raw !== "string") {
        return null;
    }

    return parseCssGradientStrict(raw);
}
