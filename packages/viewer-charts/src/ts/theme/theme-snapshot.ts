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

import type { ThemeSnapshot } from "./theme.ts";

/**
 * CSS variables (and one inherited property) the chart renderer reads.
 * Host-only: workers can't call `getComputedStyle`, so this list (and
 * `snapshotThemeVars`) doesn't need to ship in the worker bundle.
 */
const THEME_VARS = [
    "--psp-charts--font-family",
    "font-family",
    "--psp--background-color",
    "--psp-charts--axis-ticks--color",
    "--psp--color",
    "--psp-charts--axis-lines--color",
    "--psp-charts--gridline--color",
    "--psp-charts--gradient--background",
    "--psp-charts--full-gradient--background",
    "--psp-charts--legend--color",
    "--psp-charts--legend-border--color",
    "--psp-charts--tooltip--background",
    "--psp-charts--tooltip--color",
    "--psp-charts--tooltip--border-color",
    "--psp-charts--area--opacity",
    "--psp-charts--heatmap-gap--px",
    "--psp-charts--sunburst-gap--px",
];

/**
 * The computed value of an unset `--psp-*` color, which the theme defaults
 * register with `@property` so `light-dark()` resolves before it is read.
 */
const UNSET_COLOR = "rgba(0, 0, 0, 0)";

/**
 * Capture every CSS variable the renderer cares about into a
 * structured-cloneable map. Series-palette colours are walked until the
 * first missing var.
 */
export function snapshotThemeVars(el: Element): ThemeSnapshot {
    const style = getComputedStyle(el);
    const read = (name: string) => {
        const raw = style.getPropertyValue(name).trim();
        return raw === UNSET_COLOR ? "" : raw;
    };

    const out: ThemeSnapshot = {};
    for (const v of THEME_VARS) {
        const raw = read(v);
        if (raw) {
            out[v] = raw;
        }
    }

    for (let i = 1; ; i++) {
        const key = `--psp-charts--series-${i}--color`;
        const raw = read(key);
        if (!raw) {
            break;
        }

        out[key] = raw;
    }

    return out;
}
