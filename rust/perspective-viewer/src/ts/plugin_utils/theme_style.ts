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
    blend,
    make_color_record,
    parseColor,
    rgbToHex,
    type ColorRecord,
    type GradientStopRgb,
    type RGB,
} from "./color.ts";

const UNSET_COLOR = "rgba(0, 0, 0, 0)";

function get_rule(regular: HTMLElement, tag: string, def: string): string {
    const color = window.getComputedStyle(regular).getPropertyValue(tag).trim();
    if (color.length > 0 && color !== UNSET_COLOR) {
        return color;
    } else {
        return def;
    }
}

/** The theme-derived colors the cell style handlers and settings schema read. */
export interface ThemeStyle {
    _theme: string;
    _plugin_background: number[];
    _color: ColorRecord;
    _pos_fg_color: ColorRecord;
    _neg_fg_color: ColorRecord;
    _pos_bg_color: ColorRecord;
    _neg_bg_color: ColorRecord;
    _default_bg_color_stops: GradientStopRgb[];
    _series_palette: string[];
}

function read_series_palette(regular: HTMLElement, accent: string): string[] {
    const walk = (prefix: string): string[] => {
        const out: string[] = [];
        for (let i = 1; ; i++) {
            const raw = get_rule(regular, `${prefix}${i}--color`, "");
            if (!raw) {
                break;
            }

            out.push(rgbToHex(parseColor(raw)));
        }

        return out;
    };

    const own = walk("--psp-datagrid--series-");
    if (own.length > 0) {
        return own;
    }

    const charts = walk("--psp-charts--series-");
    return charts.length > 0 ? charts : [rgbToHex(parseColor(accent))];
}

/**
 * Read the theme-derived style values off `regular`'s computed style, the
 * single source for the color/theme fields cached on `DatagridModel`.
 */
export function readThemeStyle(regular: HTMLElement): ThemeStyle {
    const _theme = get_rule(regular, "--psp-theme-name", "");
    const _plugin_background = parseColor(
        get_rule(regular, "--psp--background-color", "#FFFFFF"),
    );

    const _pos_fg_color = make_color_record(
        get_rule(regular, "--psp-datagrid--pos-cell--color", "#338DCD"),
    );

    const _neg_fg_color = make_color_record(
        get_rule(regular, "--psp-datagrid--neg-cell--color", "#FF5942"),
    );

    const _pos_bg_color = make_color_record(
        blend(_pos_fg_color[0], _plugin_background),
    );

    const _neg_bg_color = make_color_record(
        blend(_neg_fg_color[0], _plugin_background),
    );

    const _color = make_color_record(
        get_rule(regular, "--psp-active--color", "#ff0000"),
    );

    const _series_palette = read_series_palette(regular, _color[0]);

    const _default_bg_color_stops = [
        {
            rgb: [_neg_bg_color[1], _neg_bg_color[2], _neg_bg_color[3]] as RGB,
            offset: 0,
        },
        { rgb: _plugin_background as RGB, offset: 0.5 },
        {
            rgb: [_pos_bg_color[1], _pos_bg_color[2], _pos_bg_color[3]] as RGB,
            offset: 1,
        },
    ];

    return {
        _theme,
        _plugin_background,
        _color,
        _pos_fg_color,
        _neg_fg_color,
        _pos_bg_color,
        _neg_bg_color,
        _default_bg_color_stops,
        _series_palette,
    };
}
