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
    ColumnRole,
    ControlSpec,
    ThemeStyle,
} from "@perspective-dev/viewer";
import { plugin_utils } from "./plugin_utils.ts";
import {
    LABEL_POSITIONS,
    LAYOUT_MODES,
    VALUE_FITS,
    type ColumnConfig,
    type LabelPosition,
    type ResolvedPluginConfig,
    type SummaryPluginConfig,
} from "./types.ts";

const MAX_GRID = 100;

const LABEL_VARIANTS = variants(LABEL_POSITIONS, {
    auto: "Auto",
    top: "Top",
    bottom: "Bottom",
    left: "Left",
    right: "Right",
    none: "Hidden",
});

function one_of<T extends string>(
    values: readonly T[],
    raw: unknown,
): T | undefined {
    return (values as readonly unknown[]).includes(raw)
        ? (raw as T)
        : undefined;
}

/** `raw` as a {@link LabelPosition}, else `undefined`. */
export function parse_label_position(raw: unknown): LabelPosition | undefined {
    return one_of(LABEL_POSITIONS, raw);
}

/** `raw` as a fixed count of grid tracks, else `undefined` for automatic. */
function parse_grid(raw: unknown): number | undefined {
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 1
        ? Math.min(Math.floor(raw), MAX_GRID)
        : undefined;
}

/** A `plugin_config` token with every unset or invalid key defaulted. */
export function parse_plugin_config(raw: unknown): ResolvedPluginConfig {
    const token = (
        raw !== null && typeof raw === "object" ? raw : {}
    ) as Record<string, unknown>;

    return {
        label_position: parse_label_position(token.label_position) ?? "auto",
        value_fit: one_of(VALUE_FITS, token.value_fit) ?? "uniform",
        layout_mode: one_of(LAYOUT_MODES, token.layout_mode) ?? "flat",
        grid_columns: parse_grid(token.grid_columns),
        grid_rows: parse_grid(token.grid_rows),
        font_family:
            typeof token.font_family === "string" &&
            token.font_family !== "inherit"
                ? token.font_family
                : undefined,
        bold: token.bold === true,
        italic: token.italic === true,
        align: plugin_utils().schema.ALIGNS.includes(token.align as Align)
            ? (token.align as Align)
            : undefined,
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
                ...(defaults.align !== undefined
                    ? { default: defaults.align }
                    : {}),
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

    const fields: ControlSpec[] = [
        {
            kind: "Enum",
            key: "label_position" satisfies keyof ColumnConfig,
            default: plugin.label_position,
            variants: LABEL_VARIANTS,
        },
        font_group({
            ...plugin,
            align:
                plugin.align ??
                (type === "integer" || type === "float" ? "right" : "left"),
        }),
    ];

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

/** The Summary's plugin-level settings. */
export function summary_plugin_config_schema(): ColumnConfigSchema {
    const fields: ControlSpec[] = [
        {
            kind: "Enum",
            key: "label_position" satisfies keyof SummaryPluginConfig,
            default: "auto",
            variants: LABEL_VARIANTS,
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
        {
            kind: "Enum",
            key: "layout_mode" satisfies keyof SummaryPluginConfig,
            default: "flat",
            variants: variants(LAYOUT_MODES, {
                flat: "Flat",
                hierarchy: "Hierarchy",
            }),
        },
    ];

    for (const key of ["grid_columns", "grid_rows"] as const) {
        fields.push({
            kind: "Number",
            key: key satisfies keyof SummaryPluginConfig,
            default: 0,
            min: 0,
            max: MAX_GRID,
            step: 1,
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
