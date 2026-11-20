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

import type { ColumnType } from "@perspective-dev/client";
import { rgbToHex } from "./color.ts";
import { native } from "./native.ts";
import {
    bg_modes_for,
    default_bg_mode,
    default_fg_mode,
    fg_modes_for,
    parse_bg_mode,
    parse_fg_mode,
    type BgMode,
    type ColumnStyleConfig,
    type FgMode,
} from "./column_style.ts";
import type { ThemeStyle } from "./theme_style.ts";

/**
 * Where in the `ViewConfig` a column being configured appears, which is a
 * different axis from its plugin column slot.
 */
export type ColumnRole = "column" | "group_by" | "split_by";

/**
 * A cell of the 3×3 alignment grid: corners `"top-left"` etc., edges
 * `"top"`/`"left"`/`"right"`/`"bottom"`, or `"center"`.
 */
export type Align =
    | "top-left"
    | "top"
    | "top-right"
    | "left"
    | "center"
    | "right"
    | "bottom-left"
    | "bottom"
    | "bottom-right";

export const ALIGNS: readonly Align[] = [
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
];

/** An `align` value from a token, or `undefined` for anything else. */
export function parse_align(raw: unknown): Align | undefined {
    return ALIGNS.includes(raw as Align) ? (raw as Align) : undefined;
}

/** CSS generic font families, which are never quoted when applied. */
export const GENERIC_FONT_FAMILIES: readonly string[] = [
    "inherit",
    "monospace",
    "sans-serif",
    "serif",
    "system-ui",
];

/** The CSS `font-family` value for a `font_family` config value. */
export function css_font_family(family: string): string {
    if (GENERIC_FONT_FAMILIES.includes(family)) {
        return family;
    }

    return `"${family.replace(/["\\]/g, "\\$&")}"`;
}

export type ControlSpec = Record<string, unknown> & { kind: string };

export interface ColumnConfigSchema {
    fields: ControlSpec[];
}

/**
 * A column's `date_format` / `number_format` controls, which are the only ones
 * that apply to a value rendered as a pivot label rather than a cell.
 */
export function format_fields(type: ColumnType): ControlSpec[] {
    if (type === "integer" || type === "float") {
        return [{ kind: "NumberFormat" }];
    } else if (type === "date" || type === "datetime") {
        return [{ kind: "DatetimeFormat" }];
    }

    return [];
}

/**
 * The `"color"` group of a column of `type`: its `fg_mode` / `bg_mode`
 * selectors and the value controls `current_value`'s modes gate in, or
 * `undefined` for a type with no modes.
 */
export function color_group(
    type: ColumnType,
    current_value: Record<string, unknown> | null,
    theme: () => ThemeStyle,
): ControlSpec | undefined {
    const fg_modes = fg_modes_for(type);
    const bg_modes = bg_modes_for(type);
    if (fg_modes.length === 0 && bg_modes.length === 0) {
        return undefined;
    }

    const fg_mode =
        parse_fg_mode(type, current_value?.fg_mode) ?? default_fg_mode(type);

    const bg_mode =
        parse_bg_mode(type, current_value?.bg_mode) ?? default_bg_mode(type);

    const color_fields: ControlSpec[] = [
        mode_spec("fg_mode", fg_modes, default_fg_mode(type)),
        ...value_specs(type, "fg", fg_mode, theme),
        mode_spec("bg_mode", bg_modes, default_bg_mode(type)),
        ...value_specs(type, "bg", bg_mode, theme),
    ];

    return { kind: "Group", key: "color", fields: color_fields };
}

const MODE_LABELS: Record<FgMode | BgMode, string> = {
    disabled: "Disabled",
    color: "Color",
    bar: "Bar",
    "label-bar": "Gradient",
    gradient: "Gradient",
    pulse: "Pulse",
    series: "Series",
};

/** The `Enum` control for `fg_mode` / `bg_mode` over a type's modes. */
function mode_spec(
    key: "fg_mode" | "bg_mode",
    modes: readonly (FgMode | BgMode)[],
    default_mode: FgMode | BgMode,
): ControlSpec {
    return {
        kind: "Enum",
        key: key satisfies keyof ColumnStyleConfig,
        default: default_mode,
        variants: modes.map((value) => ({ value, label: MODE_LABELS[value] })),
    };
}

/**
 * The controls a foreground or background `mode` gates in for a column of
 * `type`: the `fg_color` / `bg_color` value control in the grammar the
 * (type, mode) pair reads - gradient stops for numbers, a color for
 * string / datetime `"color"`, a palette for string `"series"` - plus the
 * numeric scale extent. Nothing for `"disabled"`.
 */
function value_specs(
    type: ColumnType,
    side: "fg" | "bg",
    mode: FgMode | BgMode,
    read_theme: () => ThemeStyle,
): ControlSpec[] {
    if (mode === "disabled") {
        return [];
    }

    const theme = read_theme();

    const key = `${side}_color` satisfies keyof ColumnStyleConfig;
    if (type === "integer" || type === "float") {
        const pos = theme[`_pos_${side}_color`][0];
        const neg = theme[`_neg_${side}_color`][0];
        const stops: ControlSpec =
            mode === "gradient" || mode === "pulse"
                ? {
                      kind: "GradientStops",
                      key,
                      default: native().css_gradient([
                          { color: neg, offset: 0 },
                          {
                              color: rgbToHex(
                                  theme._plugin_background as [
                                      number,
                                      number,
                                      number,
                                  ],
                              ),
                              offset: 0.5,
                          },
                          { color: pos, offset: 1 },
                      ]),
                  }
                : {
                      kind: "GradientStops",
                      key,
                      default: native().css_gradient([
                          { color: neg, offset: 0 },
                          { color: pos, offset: 1 },
                      ]),
                      discrete: true,
                  };

        const scaled =
            mode === "bar" || mode === "label-bar" || mode === "gradient";

        return scaled
            ? [
                  stops,
                  {
                      kind: "Number",
                      key: `${side}_gradient` satisfies keyof ColumnStyleConfig,
                      include: true,
                      default: 0,
                      default_stat: "abs_max",
                  },
              ]
            : [stops];
    } else if (mode === "series") {
        return [
            {
                kind: "Palette",
                key,
                default: native().css_palette(theme._series_palette),
            },
        ];
    } else {
        return [{ kind: "Color", key, default: theme._color[0] }];
    }
}
