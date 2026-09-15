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
import {
    bg_modes_for,
    default_bg_mode,
    default_fg_mode,
    fg_modes_for,
    parse_bg_mode,
    parse_fg_mode,
    type BgMode,
    type ColumnConfig,
    type DatagridPluginElement,
    type FgMode,
} from "../types.js";

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

    const fg_modes = fg_modes_for(type);
    const bg_modes = bg_modes_for(type);
    if (fg_modes.length > 0 || bg_modes.length > 0) {
        const fg_mode =
            parse_fg_mode(type, current_value?.fg_mode) ??
            default_fg_mode(type);

        const bg_mode =
            parse_bg_mode(type, current_value?.bg_mode) ??
            default_bg_mode(type);

        const color_fields: ControlSpec[] = [
            mode_spec("fg_mode", fg_modes, default_fg_mode(type)),
            ...value_specs.call(this, type, "fg", fg_mode, column_stats),
            mode_spec("bg_mode", bg_modes, default_bg_mode(type)),
            ...value_specs.call(this, type, "bg", bg_mode, column_stats),
        ];

        fields.push({ kind: "Group", key: "color", fields: color_fields });
    }

    if (type === "integer" || type === "float") {
        fields.push({ kind: "NumberFormat" });
    } else if (type === "date" || type === "datetime") {
        fields.push({ kind: "DatetimeFormat" });
    } else if (type === "string") {
        fields.push({
            kind: "Bool",
            key: "link" satisfies keyof ColumnConfig,
            default: false,
        });
    }

    return { fields };
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
        key: key satisfies keyof ColumnConfig,
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
    this: DatagridPluginElement,
    type: ColumnType,
    side: "fg" | "bg",
    mode: FgMode | BgMode,
    column_stats: ColumnStats | undefined,
): ControlSpec[] {
    if (mode === "disabled") {
        return [];
    }

    const key = `${side}_color` satisfies keyof ColumnConfig;
    if (type === "integer" || type === "float") {
        const pos = this.model![`_pos_${side}_color`][0];
        const neg = this.model![`_neg_${side}_color`][0];
        const stops: ControlSpec =
            mode === "gradient" || mode === "pulse"
                ? {
                      kind: "GradientStops",
                      key,
                      default: stopsToCss([
                          { color: neg, offset: 0 },
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
                          { color: pos, offset: 1 },
                      ]),
                  }
                : {
                      kind: "GradientStops",
                      key,
                      default: stopsToCss([
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
                      key: `${side}_gradient` satisfies keyof ColumnConfig,
                      include: true,
                      default: column_stats?.abs_max ?? 0,
                  },
              ]
            : [stops];
    } else if (mode === "series") {
        return [
            {
                kind: "Palette",
                key,
                default: colorsToCss(this.model!._series_palette),
            },
        ];
    } else {
        return [{ kind: "Color", key, default: this.model!._color[0] }];
    }
}
