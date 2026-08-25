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

import { restore_column_size_overrides } from "../model/column_overrides.js";
import {
    EDIT_MODES,
    toggle_edit_mode,
    toggle_scroll_lock,
} from "../model/toolbar.js";
import { PRIVATE_PLUGIN_SYMBOL } from "../model/index.js";
import {
    make_color_record,
    parseCssColorList,
    parseCssGradientStops,
    rgbToHex,
    type GradientStopRgb,
} from "../color_utils.js";
import type {
    DatagridPluginElement,
    ColumnOverrides,
    EditMode,
    ColumnsConfig,
    ColorRecord,
} from "../types.js";

interface RestoreToken {
    edit_mode?: EditMode;
    scroll_lock?: boolean;
}

interface StylesConfig {
    pos_fg_color?: ColorRecord;
    neg_fg_color?: ColorRecord;
    pos_bg_color?: ColorRecord;
    neg_bg_color?: ColorRecord;
    color?: ColorRecord;
    bg_color_stops?: GradientStopRgb[];
    palette_colors?: string[];
    [key: string]: unknown;
}

function parse_stops(raw: unknown): GradientStopRgb[] | undefined {
    if (typeof raw !== "string") {
        return undefined;
    }

    return parseCssGradientStops(raw) ?? undefined;
}

function parse_palette(raw: unknown): string[] | undefined {
    if (typeof raw !== "string") {
        return undefined;
    }

    return parseCssColorList(raw)?.map(rgbToHex) ?? undefined;
}

export function restore(
    this: DatagridPluginElement,
    token: RestoreToken,
    columns: ColumnsConfig,
): void {
    token = JSON.parse(JSON.stringify(token));
    columns = JSON.parse(JSON.stringify(columns));
    const overrides: ColumnOverrides = {};

    for (const [col, value] of Object.entries(columns)) {
        if (value.column_size_override !== undefined) {
            if (!this.model?._config.split_by?.length) {
                overrides[col] = value.column_size_override;
            }

            delete value.column_size_override;
        }
    }

    this._columns_config = structuredClone(columns);

    const styles: Record<string, StylesConfig> = {};
    if (columns) {
        for (const [col_name, controls] of Object.entries(columns)) {
            const fg_stops = parse_stops(controls.fg_colors);
            const bg_stops = parse_stops(controls.bg_colors);
            const end = (stops: GradientStopRgb[], i: number) =>
                make_color_record(rgbToHex(stops[i].rgb));
            styles[col_name] = {
                ...controls,
                pos_fg_color: fg_stops
                    ? end(fg_stops, fg_stops.length - 1)
                    : undefined,
                neg_fg_color: fg_stops ? end(fg_stops, 0) : undefined,
                pos_bg_color: bg_stops
                    ? end(bg_stops, bg_stops.length - 1)
                    : undefined,
                neg_bg_color: bg_stops ? end(bg_stops, 0) : undefined,
                color: controls.color
                    ? make_color_record(controls.color)
                    : undefined,
                bg_color_stops: bg_stops,
                palette_colors: parse_palette(controls.palette),
            };
        }
    }

    // `echo = false`: this `restore()` IS the host delivering the config —
    // echoing it back via `restore` queued a second render run
    // (draw-then-update on every initial load carrying a `plugin_config`).
    if ("edit_mode" in token) {
        if (EDIT_MODES.indexOf(token.edit_mode!) !== -1) {
            toggle_edit_mode.call(this, token.edit_mode, false);
        } else {
            console.error("Unknown edit mode " + token.edit_mode);
        }
    } else {
        toggle_edit_mode.call(this, "READ_ONLY", false);
    }

    if ("scroll_lock" in token) {
        toggle_scroll_lock.call(this, token.scroll_lock);
    } else {
        toggle_scroll_lock.call(this, false);
    }

    const datagrid = this.regular_table;
    restore_column_size_overrides.call(this, overrides, true);
    (datagrid as any)[PRIVATE_PLUGIN_SYMBOL] = styles as ColumnsConfig;
}
