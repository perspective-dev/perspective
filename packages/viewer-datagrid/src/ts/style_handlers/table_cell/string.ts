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
import {
    infer_foreground_from_background,
    parseColor,
    rgbaToRgb,
    type RGB,
} from "../../color_utils.js";
import {
    parse_bg_mode,
    parse_fg_mode,
    type DatagridModel,
    type ResolvedColumnStyle,
} from "../../types.js";

interface CellMetaWithExtras {
    _is_hidden_by_aggregate_depth?: boolean;
    user?: string | null;
    column_header?: string[];
}

/**
 * The palette index of `value` within `column_name`'s series, numbering
 * distinct values in encounter order.
 */
function series_seed(
    model: DatagridModel,
    column_name: string,
    value: string,
): number {
    if (!model._series_color_map.has(column_name)) {
        model._series_color_map.set(column_name, new Map());
        model._series_color_seed.set(column_name, 0);
    }

    const series_map = model._series_color_map.get(column_name)!;
    if (!series_map.has(value)) {
        const seed = model._series_color_seed.get(column_name) ?? 0;
        series_map.set(value, seed);
        model._series_color_seed.set(column_name, seed + 1);
    }

    return series_map.get(value) ?? 0;
}

function series_color(
    model: DatagridModel,
    palette_colors: string[] | undefined,
    seed: number,
): string {
    const palette =
        palette_colors && palette_colors.length > 0
            ? palette_colors
            : model._series_palette;

    return palette[seed % palette.length];
}

/** Apply a string column's foreground and background modes independently. */
export function cell_style_string(
    model: DatagridModel,
    plugin: ResolvedColumnStyle | undefined,
    td: HTMLElement,
    metadata: CellMetaWithExtras,
): void {
    const fg_mode = parse_fg_mode("string", plugin?.fg_mode) ?? "disabled";
    const bg_mode = parse_bg_mode("string", plugin?.bg_mode) ?? "disabled";
    const column_name = metadata.column_header?.[model._config.split_by.length];
    const value = metadata.user;
    let color = "";
    let background = "";
    if (
        !metadata._is_hidden_by_aggregate_depth &&
        value !== null &&
        value !== undefined &&
        column_name
    ) {
        const seed =
            fg_mode === "series" || bg_mode === "series"
                ? series_seed(model, column_name, value)
                : 0;

        let background_rgb: RGB | undefined;
        if (bg_mode === "color") {
            const [hex, r, g, b] = plugin?.bg_color ?? model._color;
            background = hex;
            background_rgb = [r, g, b];
        } else if (bg_mode === "series") {
            background = series_color(model, plugin?.bg_palette, seed);
            background_rgb = parseColor(background);
        }

        if (fg_mode === "color") {
            color = (plugin?.fg_color ?? model._color)[0];
        } else if (fg_mode === "series") {
            color = series_color(model, plugin?.fg_palette, seed);
        } else if (background_rgb !== undefined) {
            const source = model._plugin_background as RGB;
            color = infer_foreground_from_background(
                rgbaToRgb([...background_rgb, 1], source),
            );
        }
    }

    td.style.color = color;
    td.style.backgroundColor = background;
    if (plugin?.link === true && td.children[0]) {
        (td.children[0] as HTMLElement).style.color = color;
    }
}
