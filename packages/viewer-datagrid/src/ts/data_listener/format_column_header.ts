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
import { format_cell } from "./format_cell.js";
import type { DatagridModel, ResolvedColumnsConfig } from "../types.js";

/**
 * A formatted `split_by` column header label.
 */
export type ColumnHeaderLabel = { toString(): string };

const DATE_RE =
    /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?)?$/;

/**
 * Recover one `split_by` level's typed value from its column path text, or
 * `undefined` when that text cannot be recovered exactly.
 */
export function parse_split_value(
    type: ColumnType | undefined,
    text: string,
): number | undefined {
    if (type === "integer") {
        const value = Number(text);
        return /^-?\d+$/.test(text) && Number.isSafeInteger(value)
            ? value
            : undefined;
    }

    if (type === "date" || type === "datetime") {
        const match = DATE_RE.exec(text);
        if (!match) {
            return undefined;
        }

        const [, y, mo, d, h = "0", mi = "0", s = "0", ms = "0"] = match;
        return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms.padEnd(3, "0"));
    }

    return undefined;
}

/**
 * Formats `split_by` column path levels with their source column's
 * `date_format` / `number_format`, one cached label object per split group.
 */
export class ColumnHeaderLabels {
    private _view: unknown;
    private _labels = new Map<string, ColumnHeaderLabel>();

    format(
        model: DatagridModel,
        path_parts: string[],
        level: number,
        plugins: ResolvedColumnsConfig,
    ): string | ColumnHeaderLabel {
        const column = model._config.split_by[level];
        const text = path_parts[level];
        const type = (model._table_schema[column] ||
            model._schema[column] ||
            model._window_schema?.[column]) as ColumnType | undefined;

        const value = parse_split_value(type, text);
        if (value === undefined) {
            return text;
        }

        const formatted = format_cell.call(model, column, value, plugins, true);

        if (typeof formatted !== "string") {
            return text;
        }

        if (this._view !== model._view) {
            this._view = model._view;
            this._labels.clear();
        }

        const key = JSON.stringify([path_parts.slice(0, level + 1), formatted]);
        let label = this._labels.get(key);
        if (label === undefined) {
            label = { toString: () => formatted };
            this._labels.set(key, label);
        }

        return label;
    }
}
