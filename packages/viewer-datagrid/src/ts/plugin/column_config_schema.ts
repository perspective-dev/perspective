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
import type {
    Align,
    ColumnConfigSchema,
    ControlSpec,
} from "@perspective-dev/viewer";
import { plugin_utils } from "../plugin_utils.ts";
import { measure_px } from "./plugin_config_schema.ts";
import { positive_px } from "./restore.ts";
import type {
    ColumnConfig,
    ColumnRole,
    DatagridPluginElement,
} from "../types.ts";

interface ViewerConfigLike {
    group_by?: string[];
    split_by?: string[];
    group_rollup_mode?: string;
}

/**
 * Plugin schema for the Datagrid column-settings sidebar. Returns the
 * controls the viewer should render in the Style tab for a given column.
 */
export default function column_config_schema(
    this: DatagridPluginElement,
    type: ColumnType,
    _group: string | undefined,
    _column_name: string,
    current_value: Record<string, unknown> | null,
    viewer_config?: ViewerConfigLike,
    plugin_config?: Record<string, unknown> | null,
    role?: ColumnRole,
): ColumnConfigSchema {
    const { schema, theme_style } = plugin_utils();
    if (role === "group_by" || role === "split_by") {
        return { fields: schema.format_fields(type) };
    }

    const grid =
        plugin_config === undefined || plugin_config === null
            ? {
                  font_family: this._font_family,
                  font_size: this._font_size,
                  bold: this._bold,
                  italic: this._italic,
                  align: this._align,
                  word_wrap: this._word_wrap,
              }
            : {
                  font_family:
                      typeof plugin_config.font_family === "string"
                          ? plugin_config.font_family
                          : undefined,
                  font_size: positive_px(plugin_config.font_size),
                  bold: plugin_config.bold === true,
                  italic: plugin_config.italic === true,
                  align: schema.ALIGNS.includes(plugin_config.align as Align)
                      ? (plugin_config.align as Align)
                      : undefined,
                  word_wrap: plugin_config.word_wrap === true,
              };

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
                default: grid.font_family ?? "inherit",
                size: {
                    key: "font_size" satisfies keyof ColumnConfig,
                    default:
                        grid.font_size ?? measure_px(this, "font-size", 12),
                    min: 4,
                    max: 96,
                    step: 1,
                },
                bold: {
                    key: "bold" satisfies keyof ColumnConfig,
                    default: grid.bold,
                },
                italic: {
                    key: "italic" satisfies keyof ColumnConfig,
                    default: grid.italic,
                },
            },
            {
                kind: "Alignment",
                key: "align" satisfies keyof ColumnConfig,
                default:
                    grid.align ??
                    (type === "integer" || type === "float" ? "right" : "left"),
            },
            {
                kind: "Bool",
                key: "word_wrap" satisfies keyof ColumnConfig,
                default: grid.word_wrap,
            },
        ],
    });

    const colors = schema.color_group(
        type,
        current_value,
        () => this.model ?? theme_style.readThemeStyle(this.regular_table),
    );

    if (colors !== undefined) {
        fields.push(colors);
    }

    fields.push(...schema.format_fields(type));
    if (type === "string") {
        fields.push({
            kind: "Bool",
            key: "link" satisfies keyof ColumnConfig,
            default: false,
        });
    }

    return { fields };
}
