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

import { FormatterCache, Formatter } from "./formatter_cache.js";
import type { DatagridModel, ColumnsConfig, ColumnConfig } from "../types.js";
import type { ColumnType } from "@perspective-dev/client";

const FORMAT_CACHE = new FormatterCache();

export function format_raw(
    type: ColumnType,
    value: ColumnConfig,
): Formatter | false | undefined {
    return FORMAT_CACHE.get(type, value);
}

/**
 * Format a single cell's text content as the content of a `<td>` or `<th>`.
 */
export function format_cell(
    this: DatagridModel,
    title: string,
    val: unknown,
    plugins: ColumnsConfig = {},
    use_table_schema = false,
): string | HTMLElement | null {
    if (val === null) {
        return null;
    }

    const type: ColumnType = ((use_table_schema && this._table_schema[title]) ||
        this._schema[title] ||
        this._window_schema?.[title] ||
        "string") as ColumnType;
    const plugin: ColumnConfig = plugins[title] || {};
    const is_numeric = type === "integer" || type === "float";

    if (
        is_numeric &&
        !use_table_schema &&
        (plugin?.number_fg_mode === "bar" ||
            plugin?.number_fg_mode === "label-bar")
    ) {
        return "";
    } else if (plugin?.format === "link" && type === "string") {
        const anchor = document.createElement("a");
        anchor.setAttribute("href", val as string);
        anchor.setAttribute("target", "_blank");
        anchor.textContent = val as string;
        return anchor;
    } else if (plugin?.format === "bold" && type === "string") {
        const bold = document.createElement("b");
        bold.textContent = val as string;
        return bold;
    } else if (plugin?.format === "italics" && type === "string") {
        const italic = document.createElement("i");
        italic.textContent = val as string;
        return italic;
    } else {
        // `String(val)`, not a cast: with no formatter (e.g. an unknown
        // column type falling back to `"string"`), a raw non-string value
        // must not leak into consumers that expect text - see the
        // `{ toString }` wrapper in `format_tree_header.ts`.
        const formatter = FORMAT_CACHE.get(type, plugin);
        return formatter ? formatter.format(val) : String(val);
    }
}
