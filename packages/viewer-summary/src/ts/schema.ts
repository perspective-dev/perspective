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
    ColumnConfigSchema,
    ColumnRole,
    ControlSpec,
    ThemeStyle,
} from "@perspective-dev/viewer";
import { plugin_utils } from "./plugin_utils.ts";
import {
    BREAKDOWNS,
    LABEL_POSITIONS,
    VALUE_FITS,
    type ColumnConfig,
    type ResolvedPluginConfig,
    type SummaryPluginConfig,
} from "./types.ts";

function one_of<T extends string>(
    values: readonly T[],
    raw: unknown,
): T | undefined {
    return (values as readonly unknown[]).includes(raw)
        ? (raw as T)
        : undefined;
}

/** A `plugin_config` token with every unset or invalid key defaulted. */
export function parse_plugin_config(raw: unknown): ResolvedPluginConfig {
    const token = (
        raw !== null && typeof raw === "object" ? raw : {}
    ) as Record<string, unknown>;

    return {
        label_position: one_of(LABEL_POSITIONS, token.label_position) ?? "auto",
        value_fit: one_of(VALUE_FITS, token.value_fit) ?? "uniform",
        breakdown: one_of(BREAKDOWNS, token.breakdown) ?? "auto",
        font_family:
            typeof token.font_family === "string" &&
            token.font_family !== "inherit"
                ? token.font_family
                : undefined,
        bold: token.bold === true,
        italic: token.italic === true,
        align: plugin_utils().schema.parse_align(token.align),
    };
}

function font_group(
    defaults: Pick<
        ResolvedPluginConfig,
        "font_family" | "bold" | "italic" | "align"
    >,
): ControlSpec {
    return {
        kind: "Group",
        key: "font",
        fields: [
            {
                kind: "Font",
                key: "font_family" satisfies keyof ColumnConfig &
                    keyof SummaryPluginConfig,
                default: defaults.font_family ?? "inherit",
                bold: {
                    key: "bold" satisfies keyof ColumnConfig,
                    default: defaults.bold,
                },
                italic: {
                    key: "italic" satisfies keyof ColumnConfig,
                    default: defaults.italic,
                },
            },
            {
                kind: "Alignment",
                key: "align" satisfies keyof ColumnConfig,
                default: defaults.align ?? "center",
            },
        ],
    };
}

/** The Style-tab controls of one Summary column. */
export function summary_column_config_schema(
    type: ColumnType,
    current_value: Record<string, unknown> | null,
    plugin: ResolvedPluginConfig,
    role: ColumnRole | undefined,
    theme: () => ThemeStyle,
): ColumnConfigSchema {
    const { color_group, format_fields } = plugin_utils().schema;
    if (role === "group_by" || role === "split_by") {
        return { fields: format_fields(type) };
    }

    const fields: ControlSpec[] = [font_group(plugin)];
    const colors = color_group(type, current_value, theme);
    if (colors !== undefined) {
        fields.push(colors);
    }

    fields.push(...format_fields(type));
    return { fields };
}

function variants(values: readonly string[], labels: Record<string, string>) {
    return values.map((value) => ({ value, label: labels[value] }));
}

/** The Summary's plugin-level settings, with `breakdown` only under `split_by`. */
export function summary_plugin_config_schema(
    view_config: Record<string, unknown> | undefined,
): ColumnConfigSchema {
    const fields: ControlSpec[] = [
        {
            kind: "Enum",
            key: "label_position" satisfies keyof SummaryPluginConfig,
            default: "auto",
            variants: variants(LABEL_POSITIONS, {
                auto: "Auto",
                top: "Top",
                bottom: "Bottom",
                left: "Left",
                right: "Right",
                none: "Hidden",
            }),
        },
        {
            kind: "Enum",
            key: "value_fit" satisfies keyof SummaryPluginConfig,
            default: "uniform",
            variants: variants(VALUE_FITS, {
                uniform: "Uniform",
                independent: "Per Tile",
            }),
        },
    ];

    const split_by = view_config?.split_by;
    if (Array.isArray(split_by) && split_by.length > 0) {
        fields.push({
            kind: "Enum",
            key: "breakdown" satisfies keyof SummaryPluginConfig,
            default: "auto",
            variants: variants(BREAKDOWNS, {
                auto: "Auto",
                line: "Line",
                bar: "Bar",
                none: "Hidden",
            }),
        });
    }

    fields.push(
        font_group({
            font_family: undefined,
            bold: false,
            italic: false,
            align: undefined,
        }),
    );

    return { fields };
}
