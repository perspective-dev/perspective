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
import {
    make_color_record,
    rgbToHex,
    type ColorRecord,
    type GradientStopRgb,
} from "./color.ts";
import {
    native,
    type DateFormatConfig,
    type NumberFormatConfig,
} from "./native.ts";

export { isMetaColumn } from "./meta_columns.ts";

/** Foreground treatments of an integer / float column. */
export const NUMBER_FG_MODES = [
    "disabled",
    "color",
    "bar",
    "label-bar",
] as const;

/** Background treatments of an integer / float column. */
export const NUMBER_BG_MODES = [
    "disabled",
    "color",
    "gradient",
    "pulse",
] as const;

/** Foreground and background treatments of a string column. */
export const STRING_MODES = ["disabled", "color", "series"] as const;

/** Foreground and background treatments of a date / datetime column. */
export const DATETIME_MODES = ["disabled", "color"] as const;

export type NumberFgMode = (typeof NUMBER_FG_MODES)[number];
export type NumberBgMode = (typeof NUMBER_BG_MODES)[number];
export type StringMode = (typeof STRING_MODES)[number];
export type DatetimeMode = (typeof DATETIME_MODES)[number];

/**
 * Every foreground treatment some column type accepts, of which a column
 * accepts `fg_modes_for(type)`.
 */
export type FgMode = NumberFgMode | StringMode | DatetimeMode;

/** Every background treatment some column type accepts, as {@link FgMode}. */
export type BgMode = NumberBgMode | StringMode | DatetimeMode;

/** The `fg_mode` values a column of `type` accepts, empty for boolean. */
export function fg_modes_for(type: ColumnType): readonly FgMode[] {
    switch (type) {
        case "integer":
        case "float":
            return NUMBER_FG_MODES;
        case "string":
            return STRING_MODES;
        case "date":
        case "datetime":
            return DATETIME_MODES;
        default:
            return [];
    }
}

/** The `bg_mode` values a column of `type` accepts, empty for boolean. */
export function bg_modes_for(type: ColumnType): readonly BgMode[] {
    switch (type) {
        case "integer":
        case "float":
            return NUMBER_BG_MODES;
        case "string":
            return STRING_MODES;
        case "date":
        case "datetime":
            return DATETIME_MODES;
        default:
            return [];
    }
}

/** `raw` as an `fg_mode` a column of `type` accepts, else `undefined`. */
export function parse_fg_mode(
    type: ColumnType,
    raw: unknown,
): FgMode | undefined {
    return (fg_modes_for(type) as readonly unknown[]).includes(raw)
        ? (raw as FgMode)
        : undefined;
}

/** `raw` as a `bg_mode` a column of `type` accepts, else `undefined`. */
export function parse_bg_mode(
    type: ColumnType,
    raw: unknown,
): BgMode | undefined {
    return (bg_modes_for(type) as readonly unknown[]).includes(raw)
        ? (raw as BgMode)
        : undefined;
}

/** The `columns_config` keys the cell style handlers and formatters read. */
export interface ColumnStyleConfig {
    fg_mode?: FgMode;
    bg_mode?: BgMode;
    fg_color?: string;
    bg_color?: string;
    fg_gradient?: number;
    bg_gradient?: number;
    link?: boolean;
    date_format?: DateFormatConfig;
    number_format?: NumberFormatConfig;
}

/** The parsed forms of a column's `fg_color` / `bg_color` strings. */
export interface ResolvedColors {
    /** `fg_color` as a single color (string / datetime `"color"` mode). */
    fg_color?: ColorRecord;
    bg_color?: ColorRecord;

    /** `fg_color` as gradient stops (numeric columns), t-ordered. */
    fg_stops?: GradientStopRgb[];
    bg_stops?: GradientStopRgb[];

    /** End colors of `fg_stops` / `bg_stops`: the last stop is positive. */
    pos_fg_color?: ColorRecord;
    neg_fg_color?: ColorRecord;
    pos_bg_color?: ColorRecord;
    neg_bg_color?: ColorRecord;

    /** `fg_color` as a palette (string `"series"` mode), `#rrggbb` each. */
    fg_palette?: string[];
    bg_palette?: string[];
}

/** `T` with its `fg_color` / `bg_color` strings replaced by their parsed forms. */
export type Resolved<T> = Omit<T, "fg_color" | "bg_color"> & ResolvedColors;

/**
 * A column's {@link ColumnStyleConfig} with its `fg_color` / `bg_color` strings
 * parsed once at `restore()`.
 */
export type ResolvedColumnStyle = Resolved<ColumnStyleConfig>;

/**
 * Every form one `fg_color` / `bg_color` string parses as, for each mode's
 * style handler to pick from.
 */
interface ParsedColor {
    color?: ColorRecord;
    stops?: GradientStopRgb[];
    palette?: string[];
}

function parse_color_value(raw: unknown): ParsedColor {
    if (typeof raw !== "string") {
        return {};
    }

    const stops = native().parse_css_gradient(raw);
    const palette = native().parse_css_palette(raw)?.map(rgbToHex);
    return {
        color: is_single_color(raw) ? make_color_record(raw) : undefined,
        stops,
        palette,
    };
}

/** A bare CSS color, as opposed to a `linear-gradient(…)` list. */
function is_single_color(raw: string): boolean {
    return !raw.trim().toLowerCase().startsWith("linear-gradient(");
}

function end_records(
    stops: GradientStopRgb[] | undefined,
): [neg: ColorRecord | undefined, pos: ColorRecord | undefined] {
    if (!stops) {
        return [undefined, undefined];
    }

    return [
        make_color_record(rgbToHex(stops[0].rgb)),
        make_color_record(rgbToHex(stops[stops.length - 1].rgb)),
    ];
}

/** `config` with its color strings parsed into every form a handler reads. */
export function resolve_column_style<
    T extends { fg_color?: string; bg_color?: string },
>(config: T): Resolved<T> {
    const { fg_color, bg_color, ...rest } = config;
    const fg = parse_color_value(fg_color);
    const bg = parse_color_value(bg_color);
    const [neg_fg_color, pos_fg_color] = end_records(fg.stops);
    const [neg_bg_color, pos_bg_color] = end_records(bg.stops);
    return {
        ...rest,
        fg_color: fg.color,
        bg_color: bg.color,
        fg_stops: fg.stops,
        bg_stops: bg.stops,
        pos_fg_color,
        neg_fg_color,
        pos_bg_color,
        neg_bg_color,
        fg_palette: fg.palette,
        bg_palette: bg.palette,
    };
}
