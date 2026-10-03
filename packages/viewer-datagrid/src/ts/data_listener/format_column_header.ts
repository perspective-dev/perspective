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

import { format_cell } from "./format_cell.js";
import type { DatagridModel, ResolvedColumnsConfig } from "../types.js";
import type { CellScalar } from "regular-table/dist/esm/types.js";

/**
 * A formatted `split_by` column header label.
 */
export type ColumnHeaderLabel = { toString(): string };

/**
 * Formats `split_by` column path levels with their source column's
 * `date_format` / `number_format`, one cached label object per split group.
 */
export class ColumnHeaderLabels {
    private _view: unknown;
    private _labels = new Map<string, ColumnHeaderLabel>();

    format(
        model: DatagridModel,
        levels: (CellScalar | null)[],
        level: number,
        plugins: ResolvedColumnsConfig,
    ): string | ColumnHeaderLabel {
        const column = model._config.split_by[level];
        const value = levels[level];
        const text = value === null || value === undefined ? "" : String(value);
        const formatted = format_cell.call(model, column, value, plugins, true);

        if (typeof formatted !== "string") {
            return text;
        }

        if (this._view !== model._view) {
            this._view = model._view;
            this._labels.clear();
        }

        const key = JSON.stringify([levels.slice(0, level + 1), formatted]);
        let label = this._labels.get(key);
        if (label === undefined) {
            label = { toString: () => formatted };
            this._labels.set(key, label);
        }

        return label;
    }
}
