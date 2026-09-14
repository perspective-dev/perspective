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
import { colorsToCss, rgbToHex, stopsToCss } from "../color_utils.js";
import { measure_px } from "./plugin_config_schema.js";
import type { ColumnConfig, DatagridPluginElement } from "../types.js";

interface ViewerConfigLike {
    group_by?: string[];
    split_by?: string[];
    group_rollup_mode?: string;
}

type ControlSpec = Record<string, unknown> & { kind: string };

export interface ColumnConfigSchema {
    fields: ControlSpec[];
}

/**
 * Plugin schema for the Datagrid column-settings sidebar. Returns the
 * controls the viewer should render in the Style tab for a given column.
 */
interface ColumnStats {
    abs_max?: number;
}

export default function column_config_schema(
    this: DatagridPluginElement,
    type: ColumnType,
    _group: string | undefined,
    _column_name: string,
    current_value: Record<string, unknown> | null,
    viewer_config?: ViewerConfigLike,
    column_stats?: ColumnStats,
): ColumnConfigSchema {
    const fields: ControlSpec[] = [];
    const group: ControlSpec & { fields: ControlSpec[] } = {
        kind: "Group",
        key: "column",
        fields: [],
    };

    fields.push(group);

    if ((viewer_config?.split_by?.length ?? 0) === 0) {
        group.fields.push({
            kind: "Number",
            key: "column_size_override" satisfies keyof ColumnConfig,
            default: 0,
            min: 1,
        });
    }

    const group_by = viewer_config?.group_by ?? [];
    const is_rollup =
        (viewer_config?.group_rollup_mode ?? "rollup") === "rollup";

    if (group_by.length > 0 && is_rollup) {
        group.fields.push({ kind: "AggregateDepth" });
    }

    fields.push({
        kind: "Group",
        key: "font",
        fields: [
            {
                kind: "Font",
                key: "font_family" satisfies keyof ColumnConfig,
                default: this._font_family ?? "inherit",
                size: {
                    key: "font_size" satisfies keyof ColumnConfig,
                    default:
                        this._font_size ?? measure_px(this, "font-size", 12),
                    min: 4,
                    max: 96,
                    step: 1,
                },
                bold: {
                    key: "bold" satisfies keyof ColumnConfig,
                    default: this._bold,
                },
                italic: {
                    key: "italic" satisfies keyof ColumnConfig,
                    default: this._italic,
                },
            },
            {
                kind: "Alignment",
                key: "align" satisfies keyof ColumnConfig,
                ...(this._align !== undefined ? { default: this._align } : {}),
            },
            {
                kind: "Bool",
                key: "word_wrap" satisfies keyof ColumnConfig,
                default: this._word_wrap,
            },
        ],
    });

    if (type === "integer" || type === "float") {
        const pos_fg = this.model!._pos_fg_color[0];
        const neg_fg = this.model!._neg_fg_color[0];
        const pos_bg = this.model!._pos_bg_color[0];
        const neg_bg = this.model!._neg_bg_color[0];
        const fg_fields: ControlSpec[] = [];
        fg_fields.push({
            kind: "Enum",
            key: "number_fg_mode" satisfies keyof ColumnConfig,
            default: "color",
            variants: [
                { value: "disabled", label: "Disabled" },
                { value: "color", label: "Color" },
                { value: "bar", label: "Bar" },
                { value: "label-bar", label: "Gradient" },
            ],
        });

        const fg_mode = (current_value?.number_fg_mode as string) ?? "color";
        if (fg_mode !== "disabled") {
            fg_fields.push({
                kind: "GradientStops",
                key: "fg_colors" satisfies keyof ColumnConfig,
                default: stopsToCss([
                    { color: neg_fg, offset: 0 },
                    { color: pos_fg, offset: 1 },
                ]),
                discrete: true,
            });
        }

        if (fg_mode === "bar" || fg_mode === "label-bar") {
            fg_fields.push({
                kind: "Number",
                key: "fg_gradient" satisfies keyof ColumnConfig,
                default: column_stats?.abs_max ?? 0,
                include: true,
            });
        }

        const bg_fields: ControlSpec[] = [];
        bg_fields.push({
            kind: "Enum",
            key: "number_bg_mode" satisfies keyof ColumnConfig,
            default: "disabled",
            variants: [
                { value: "disabled", label: "Disabled" },
                { value: "color", label: "Color" },
                { value: "gradient", label: "Gradient" },
                { value: "pulse", label: "Pulse" },
            ],
        });

        const bg_mode = (current_value?.number_bg_mode as string) ?? "disabled";
        if (bg_mode !== "disabled") {
            if (bg_mode === "color") {
                bg_fields.push({
                    kind: "GradientStops",
                    key: "bg_colors" satisfies keyof ColumnConfig,
                    default: stopsToCss([
                        { color: neg_bg, offset: 0 },
                        { color: pos_bg, offset: 1 },
                    ]),
                    discrete: true,
                });
            } else {
                bg_fields.push({
                    kind: "GradientStops",
                    key: "bg_colors" satisfies keyof ColumnConfig,
                    default: stopsToCss([
                        { color: neg_bg, offset: 0 },
                        {
                            color: rgbToHex(
                                this.model!._plugin_background as [
                                    number,
                                    number,
                                    number,
                                ],
                            ),
                            offset: 0.5,
                        },
                        { color: pos_bg, offset: 1 },
                    ]),
                });
            }
        }

        if (bg_mode === "gradient") {
            bg_fields.push({
                kind: "Number",
                key: "bg_gradient" satisfies keyof ColumnConfig,
                include: true,
                default: column_stats?.abs_max ?? 0,
            });
        }

        fields.push({
            kind: "Group",
            key: "color",
            fields: [...fg_fields, ...bg_fields],
        });

        fields.push({ kind: "NumberFormat" });
    } else if (type === "date" || type === "datetime") {
        const fg_mode =
            (current_value?.datetime_fg_mode as string) ?? "disabled";
        const bg_mode =
            (current_value?.datetime_bg_mode as string) ?? "disabled";
        fields.push({
            kind: "Group",
            key: "color",
            fields: [
                {
                    kind: "Enum",
                    key: "datetime_fg_mode" satisfies keyof ColumnConfig,
                    default: "disabled",
                    variants: [
                        { value: "disabled", label: "Disabled" },
                        { value: "color", label: "Color" },
                    ],
                },
                ...(fg_mode === "color"
                    ? [
                          color_spec.call(
                              this,
                              "fg_color" satisfies keyof ColumnConfig,
                          ),
                      ]
                    : []),
                {
                    kind: "Enum",
                    key: "datetime_bg_mode" satisfies keyof ColumnConfig,
                    default: "disabled",
                    variants: [
                        { value: "disabled", label: "Disabled" },
                        { value: "color", label: "Color" },
                    ],
                },
                ...(bg_mode === "color"
                    ? [
                          color_spec.call(
                              this,
                              "bg_color" satisfies keyof ColumnConfig,
                          ),
                      ]
                    : []),
            ],
        });

        fields.push({ kind: "DatetimeFormat" });
    } else if (type === "string") {
        const variants = [
            { value: "disabled", label: "Disabled" },
            { value: "color", label: "Color" },
            { value: "series", label: "Series" },
        ];

        const fg_mode = (current_value?.string_fg_mode as string) ?? "disabled";
        const bg_mode = (current_value?.string_bg_mode as string) ?? "disabled";
        fields.push({
            kind: "Group",
            key: "color",
            fields: [
                {
                    kind: "Enum",
                    key: "string_fg_mode" satisfies keyof ColumnConfig,
                    default: "disabled",
                    variants,
                },
                ...string_color_specs.call(
                    this,
                    fg_mode,
                    "fg_color" satisfies keyof ColumnConfig,
                    "fg_palette" satisfies keyof ColumnConfig,
                ),
                {
                    kind: "Enum",
                    key: "string_bg_mode" satisfies keyof ColumnConfig,
                    default: "disabled",
                    variants,
                },
                ...string_color_specs.call(
                    this,
                    bg_mode,
                    "bg_color" satisfies keyof ColumnConfig,
                    "bg_palette" satisfies keyof ColumnConfig,
                ),
            ],
        });

        fields.push({
            kind: "Bool",
            key: "link" satisfies keyof ColumnConfig,
            default: false,
        });
    }

    return { fields };
}

/** The `Color` control for a string / datetime foreground or background. */
function color_spec(this: DatagridPluginElement, key: string): ControlSpec {
    return { kind: "Color", key, default: this.model!._color[0] };
}

/**
 * The value control a string column's foreground or background mode
 * gates in: a `Color` for `"color"`, a `Palette` for `"series"`, nothing
 * for `"disabled"`.
 */
function string_color_specs(
    this: DatagridPluginElement,
    mode: string,
    color_key: string,
    palette_key: string,
): ControlSpec[] {
    if (mode === "color") {
        return [color_spec.call(this, color_key)];
    } else if (mode === "series") {
        return [
            {
                kind: "Palette",
                key: palette_key,
                default: colorsToCss(this.model!._series_palette),
            },
        ];
    }

    return [];
}
