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

import { plugin_utils } from "../plugin_utils.ts";
import type {
    DatagridModel,
    ResolvedColumnsConfig,
    ResolvedColumnStyle,
} from "../types.ts";
import type { ColumnType } from "@perspective-dev/client";

/** The type of column `title`, by the table's schema first when `use_table_schema`. */
function column_type(
    model: DatagridModel,
    title: string,
    use_table_schema: boolean,
): ColumnType {
    return ((use_table_schema && model._table_schema[title]) ||
        model._schema[title] ||
        model._window_schema?.[title] ||
        "string") as ColumnType;
}

/** Whether cells of `type` styled by `plugin` draw a bar in place of text. */
function is_bar(
    type: ColumnType,
    plugin: ResolvedColumnStyle,
    use_table_schema: boolean,
): boolean {
    return (
        (type === "integer" || type === "float") &&
        !use_table_schema &&
        (plugin.fg_mode === "bar" || plugin.fg_mode === "label-bar")
    );
}

/**
 * Format a single cell's text content as the content of a `<td>` or `<th>`.
 */
export function format_cell(
    this: DatagridModel,
    title: string,
    val: unknown,
    plugins: ResolvedColumnsConfig = {},
    use_table_schema = false,
): string | HTMLElement | null {
    if (val === null) {
        return null;
    }

    const type = column_type(this, title, use_table_schema);
    const plugin: ResolvedColumnStyle = plugins[title] || {};
    if (is_bar(type, plugin, use_table_schema)) {
        return "";
    } else if (plugin?.link === true && type === "string") {
        const anchor = document.createElement("a");
        anchor.setAttribute("href", val as string);
        anchor.setAttribute("target", "_blank");
        anchor.textContent = val as string;
        return anchor;
    } else {
        // `String(val)`, not a cast: with no formatter (e.g. an unknown
        // column type falling back to `"string"`), a raw non-string value
        // must not leak into consumers that expect text - see the
        // `{ toString }` wrapper in `format_tree_header.ts`.
        const formatter = plugin_utils().format.format_raw(type, plugin);
        return formatter ? formatter.format(val as number) : String(val);
    }
}

/**
 * Format every cell of `column` as `format_cell` does, in one call to the
 * column's formatter when it has one.
 */
export function format_column(
    this: DatagridModel,
    title: string,
    column: unknown[],
    plugins: ResolvedColumnsConfig = {},
): (string | HTMLElement | null)[] {
    const type = column_type(this, title, false);
    const plugin: ResolvedColumnStyle = plugins[title] || {};
    const formatter = is_bar(type, plugin, false)
        ? undefined
        : plugin_utils().format.format_raw(type, plugin);

    if (formatter === undefined) {
        return column.map((x) => format_cell.call(this, title, x, plugins));
    }

    const values: number[] = [];
    for (let i = 0; i < column.length; i++) {
        if (column[i] !== null) {
            values.push(column[i] as number);
        }
    }

    const texts = formatter.format_strings(new Float64Array(values));
    const out = new Array<string | null>(column.length);
    let next = 0;
    for (let i = 0; i < column.length; i++) {
        out[i] = column[i] === null ? null : texts[next++];
    }

    return out;
}
