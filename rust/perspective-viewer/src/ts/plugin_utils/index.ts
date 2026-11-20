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

import * as cell_style from "./cell_style.ts";
import * as color from "./color.ts";
import * as column_style from "./column_style.ts";
import * as format from "./format.ts";
import { bind_native, pick_native, type NativeUtils } from "./native.ts";
import * as schema from "./schema.ts";
import * as theme_style from "./theme_style.ts";

export type * from "./cell_style.ts";
export type * from "./color.ts";
export type * from "./column_style.ts";
export type * from "./format.ts";
export type {
    DateFormatConfig,
    DateFormatModifiers,
    FormattedColumn,
    Formatter,
    NativeUtils,
    NumberFormatConfig,
} from "./native.ts";
export type * from "./schema.ts";
export type * from "./theme_style.ts";

/** The code `<perspective-viewer>` shares with its plugins, as the element class's static `plugin_utils`. */
export interface PluginUtils extends NativeUtils {
    /** Formatter handles kept per column style. */
    format: typeof format;

    /** CSS color parsing, conversion and gradient sampling. */
    color: typeof color;

    /** The `fg_mode` / `bg_mode` vocabulary and `columns_config` color parsing. */
    column_style: typeof column_style;

    /** The theme colors read from an element's computed style. */
    theme_style: typeof theme_style;

    /** The per-type handlers which style one rendered cell. */
    cell_style: typeof cell_style;

    /** The `column_config_schema()` controls plugins share. */
    schema: typeof schema;
}

/** The `plugin_utils` of the viewer whose wasm module is `module`. */
export function create_plugin_utils(module: NativeUtils): PluginUtils {
    const native = pick_native(module);
    bind_native(native);
    return Object.freeze({
        ...native,
        format,
        cell_style,
        color,
        column_style,
        schema,
        theme_style,
    });
}
