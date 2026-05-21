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
import { make_color_record } from "../color_utils.js";
import type {
    DatagridPluginElement,
    ColumnOverrides,
    EditMode,
    ColumnsConfig,
    ColorRecord,
} from "../types.js";

interface RestoreToken {
    columns?: Record<string, { column_size_override?: number }>;
    edit_mode?: EditMode;
    scroll_lock?: boolean;
}

// interface ColumnConfigWithColors {
//     pos_fg_color?: string;
//     neg_fg_color?: string;
//     pos_bg_color?: string;
//     neg_bg_color?: string;
//     color?: string;
//     [key: string]: unknown;
// }

interface StylesConfig {
    pos_fg_color?: ColorRecord;
    neg_fg_color?: ColorRecord;
    pos_bg_color?: ColorRecord;
    neg_bg_color?: ColorRecord;
    color?: ColorRecord;
    [key: string]: unknown;
}

export function restore(
    this: DatagridPluginElement,
    token: RestoreToken,
    columns: ColumnsConfig,
): void {
    token = JSON.parse(JSON.stringify(token));
    columns = JSON.parse(JSON.stringify(columns));
    const overrides: ColumnOverrides = {};

    if (token.columns) {
        for (const [col, value] of Object.entries(token.columns)) {
            if (value.column_size_override !== undefined) {
                overrides[col] = value.column_size_override;
                delete value["column_size_override"];
            }
        }
    }

    const styles: Record<string, StylesConfig> = {};
    if (columns) {
        for (const [col_name, controls] of Object.entries(columns)) {
            styles[col_name] = {
                ...controls,
                pos_fg_color: controls.pos_fg_color
                    ? make_color_record(controls.pos_fg_color)
                    : undefined,
                neg_fg_color: controls.neg_fg_color
                    ? make_color_record(controls.neg_fg_color)
                    : undefined,
                pos_bg_color: controls.pos_bg_color
                    ? make_color_record(controls.pos_bg_color)
                    : undefined,
                neg_bg_color: controls.neg_bg_color
                    ? make_color_record(controls.neg_bg_color)
                    : undefined,
                color: controls.color
                    ? make_color_record(controls.color)
                    : undefined,
            };
        }
    }

    if ("edit_mode" in token) {
        if (EDIT_MODES.indexOf(token.edit_mode!) !== -1) {
            toggle_edit_mode.call(this, token.edit_mode);
        } else {
            console.error("Unknown edit mode " + token.edit_mode);
        }
    } else {
        toggle_edit_mode.call(this, "READ_ONLY");
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
