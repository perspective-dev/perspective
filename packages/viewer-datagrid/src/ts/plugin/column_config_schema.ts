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
import type { DatagridPluginElement } from "../types.js";

interface ViewerConfigLike {
    group_by?: string[];
    group_rollup_mode?: string;
}

type ControlSpec = Record<string, unknown> & { kind: string };

export interface ColumnConfigSchema {
    fields: ControlSpec[];
}

/**
 * Plugin schema for the Datagrid column-settings sidebar. Returns the
 * controls the viewer should render in the Style tab for a given column.
 *
 * Each entry in `fields` is a `ControlSpec` discriminated by `kind`.
 * Composite kinds (`NumberStyle`, `DatetimeFormat`, `StringFormat`,
 * `NumberFormat`, `AggregateDepth`) own a fixed key namespace and
 * carry only their `default`. Primitive kinds (`Enum`, `Bool`, `Color`,
 * etc.) carry their own `key` (storage) and `label` (UI) inline.
 *
 * Aggregate Depth is plugin-owned — surfaced only inside the Datagrid
 * because rollup-mode pivots are a Datagrid concern. Emitted only when
 * the active view has a non-empty `group_by` and rollup mode is `Rollup`.
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

    if (type === "integer" || type === "float") {
        const pos_fg = this.model!._pos_fg_color[0];
        const neg_fg = this.model!._neg_fg_color[0];
        const pos_bg = this.model!._pos_bg_color[0];
        const neg_bg = this.model!._neg_bg_color[0];

        fields.push({
            kind: "Enum",
            key: "number_fg_mode",
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
            fields.push({
                kind: "ColorRange",
                key_pos: "pos_fg_color",
                key_neg: "neg_fg_color",
                default_pos: pos_fg,
                default_neg: neg_fg,
                is_gradient: false,
            });
        }

        if (fg_mode === "bar" || fg_mode === "label-bar") {
            fields.push({
                kind: "Number",
                key: "fg_gradient",
                default: column_stats?.abs_max ?? 0,
                include: true,
            });
        }

        fields.push({
            kind: "Enum",
            key: "number_bg_mode",
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
            fields.push({
                kind: "ColorRange",
                key_pos: "pos_bg_color",
                key_neg: "neg_bg_color",
                default_pos: pos_bg,
                default_neg: neg_bg,
                is_gradient: bg_mode === "gradient" || bg_mode === "pulse",
            });
        }

        if (bg_mode === "gradient") {
            fields.push({
                kind: "Number",
                key: "bg_gradient",
                include: true,
                default: column_stats?.abs_max ?? 0,
            });
        }

        fields.push({ kind: "NumberFormat" });
    } else if (type === "date" || type === "datetime") {
        fields.push({ kind: "DatetimeFormat" });

        fields.push({
            kind: "Enum",
            key: "datetime_color_mode",
            default: "none",
            variants: [
                { value: "none", label: "None" },
                { value: "foreground", label: "Foreground" },
                { value: "background", label: "Background" },
            ],
        });

        const dt_mode =
            (current_value?.datetime_color_mode as string) ?? "none";

        if (dt_mode !== "none") {
            fields.push({
                kind: "Color",
                key: "color",
                default: this.model!._color[0],
            });
        }
    } else if (type === "string") {
        fields.push({ kind: "StringFormat" });

        fields.push({
            kind: "Enum",
            key: "string_color_mode",
            default: "none",
            variants: [
                { value: "none", label: "None" },
                { value: "foreground", label: "Foreground" },
                { value: "background", label: "Background" },
                { value: "series", label: "Series" },
            ],
        });

        const str_mode = (current_value?.string_color_mode as string) ?? "none";
        if (str_mode !== "none") {
            fields.push({
                kind: "Color",
                key: "color",
                default: this.model!._color[0],
            });
        }
    }

    const group_by = viewer_config?.group_by ?? [];
    const is_rollup =
        (viewer_config?.group_rollup_mode ?? "rollup") === "rollup";

    if (group_by.length > 0 && is_rollup) {
        fields.push({ kind: "AggregateDepth" });
    }

    return { fields };
}
