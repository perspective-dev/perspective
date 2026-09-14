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

import { mixRgb, parseColor, rgbToHex } from "../color_utils.js";
import type {
    Align,
    DatagridPluginConfig,
    DatagridPluginElement,
} from "../types.js";
import type { ColumnConfigSchema } from "./column_config_schema.js";

type ControlSpec = Record<string, unknown> & { kind: string };

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

/** Line height of a wrapped cell's block, as a multiple of its font size. */
export const WRAP_LINE_HEIGHT = 1.2;

/**
 * The number of `WRAP_LINE_HEIGHT` lines of `font_size` that fit in a row's
 * content box (`row_height` less its 1px top border), never fewer than one.
 */
export function wrap_lines(row_height: number, font_size: number): number {
    return Math.max(
        1,
        Math.floor((row_height - 1) / (font_size * WRAP_LINE_HEIGHT)),
    );
}

/**
 * A positive pixel length read from `elem`'s computed style, else
 * `fallback`.
 */
export function measure_px(
    elem: Element,
    property: string,
    fallback: number,
): number {
    const raw = window.getComputedStyle(elem).getPropertyValue(property);
    const px = parseFloat(raw);
    return Number.isFinite(px) && px > 0 ? Math.round(px) : fallback;
}

/**
 * The theme's zebra stripe color as opaque `#rrggbb`, a 6% blend of text
 * into background when the theme defines none.
 */
export function default_zebra_color(elem: Element): string {
    const style = window.getComputedStyle(elem);
    const own = style.getPropertyValue("--psp-datagrid--zebra--color").trim();
    if (own) {
        return rgbToHex(parseColor(own));
    }

    const background = parseColor(
        style.getPropertyValue("--psp--background-color").trim() || "#ffffff",
    );

    const color = parseColor(
        style.getPropertyValue("--psp--color").trim() || "#000000",
    );

    return rgbToHex(mixRgb(background, color, 0.06));
}

/**
 * The `plugin_config` the schema describes: the host's `current_value`, else
 * this element's own state.
 */
function current_config(
    elem: DatagridPluginElement,
    current_value: Record<string, unknown> | null | undefined,
): DatagridPluginConfig {
    if (current_value && typeof current_value === "object") {
        return current_value as DatagridPluginConfig;
    }

    return { zebra_rows: elem._zebra_rows };
}

/**
 * The Datagrid's plugin-level settings schema, advertising `zebra_color`
 * only while `zebra_rows >= 1`.
 */
export default function plugin_config_schema(
    this: DatagridPluginElement,
    _view_config?: Record<string, unknown>,
    current_value?: Record<string, unknown> | null,
): ColumnConfigSchema {
    const current = current_config(this, current_value);
    const fields: ControlSpec[] = [];
    fields.push({
        kind: "Enum",
        key: "edit_mode" satisfies keyof DatagridPluginConfig,
        default: "READ_ONLY",
        variants: [
            { value: "EDIT", label: "Edit" },
            { value: "READ_ONLY", label: "Read-only" },
            { value: "SELECT_ROW", label: "Row Select" },
            { value: "SELECT_COLUMN", label: "Column Select" },
            { value: "SELECT_REGION", label: "Region Select" },
            { value: "SELECT_ROW_TREE", label: "Tree Select" },
        ],
    });

    fields.push({
        kind: "Bool",
        key: "scroll_lock" satisfies keyof DatagridPluginConfig,
        default: false,
    });

    fields.push({
        kind: "Bool",
        key: "column_menus" satisfies keyof DatagridPluginConfig,
        default: true,
    });

    fields.push({
        kind: "Group",
        key: "font",
        fields: [
            {
                kind: "Font",
                key: "font_family" satisfies keyof DatagridPluginConfig,
                default: "inherit",
                size: {
                    key: "font_size" satisfies keyof DatagridPluginConfig,
                    default: measure_px(this, "font-size", 12),
                    min: 4,
                    max: 96,
                    step: 1,
                },
                bold: {
                    key: "bold" satisfies keyof DatagridPluginConfig,
                    default: false,
                },
                italic: {
                    key: "italic" satisfies keyof DatagridPluginConfig,
                    default: false,
                },
            },
            {
                kind: "Alignment",
                key: "align" satisfies keyof DatagridPluginConfig,
            },
            {
                kind: "Bool",
                key: "word_wrap" satisfies keyof DatagridPluginConfig,
                default: false,
            },
        ],
    });

    const rows: ControlSpec[] = [
        {
            kind: "Number",
            key: "row_height" satisfies keyof DatagridPluginConfig,
            default: measure_px(this, "--psp-datagrid--row--height", 23),
            min: 8,
            max: 512,
            step: 1,
        },
        {
            kind: "Number",
            key: "zebra_rows" satisfies keyof DatagridPluginConfig,
            default: 0,
            min: 0,
            step: 1,
        },
    ];

    const zebra_rows =
        typeof current.zebra_rows === "number" ? current.zebra_rows : 0;

    if (zebra_rows >= 1) {
        rows.push({
            kind: "Color",
            key: "zebra_color" satisfies keyof DatagridPluginConfig,
            default: default_zebra_color(this),
        });
    }

    fields.push({ kind: "Group", key: "rows", fields: rows });
    return { fields };
}
