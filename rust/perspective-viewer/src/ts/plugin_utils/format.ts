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
    native,
    type DateFormatConfig,
    type Formatter,
    type NumberFormatConfig,
} from "./native.ts";

type FormatConfig = {
    date_format?: DateFormatConfig;
    number_format?: NumberFormatConfig;
};

const DEFAULT_FORMATTERS = new Map<ColumnType, Formatter | undefined>();

const STYLE_FORMATTERS = new WeakMap<
    object,
    Map<ColumnType, Formatter | undefined>
>();

function format_of(
    type: ColumnType,
    style: FormatConfig,
): NumberFormatConfig | DateFormatConfig | undefined {
    if (type === "integer" || type === "float") {
        return style.number_format;
    } else if (type === "date" || type === "datetime") {
        return style.date_format;
    }

    return undefined;
}

/**
 * The formatter of a column of `type` styled by `style`, created on first
 * use and kept for the life of the `style` object.
 */
export function format_raw(
    type: ColumnType,
    style: FormatConfig,
): Formatter | undefined {
    const format = format_of(type, style);
    let formatters = DEFAULT_FORMATTERS;
    if (format !== undefined) {
        let own = STYLE_FORMATTERS.get(style);
        if (own === undefined) {
            own = new Map();
            STYLE_FORMATTERS.set(style, own);
        }

        formatters = own;
    }

    if (!formatters.has(type)) {
        formatters.set(type, native().formatter(type, format));
    }

    return formatters.get(type);
}

/** Release every formatter `format_raw` created for the style objects in `styles`. */
export function free_formatters(styles: Record<string, object>): void {
    for (const style of Object.values(styles)) {
        const formatters = STYLE_FORMATTERS.get(style);
        if (formatters !== undefined) {
            STYLE_FORMATTERS.delete(style);
            for (const formatter of formatters.values()) {
                formatter?.free();
            }
        }
    }
}
