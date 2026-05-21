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

import type { View, ViewConfig, Filter, Scalar } from "@perspective-dev/client";
import type { CellConfigResult } from "./types.js";
import { isMetaColumn } from "./model/meta_columns.js";

interface ModelWithViewAndConfig {
    _view: View;
    _config: ViewConfig;
}

interface RowData {
    __ROW_PATH__?: unknown[];
    [key: string]: unknown;
}

export default async function getCellConfig(
    { _view, _config }: ModelWithViewAndConfig,
    row_idx: number,
    col_idx: number,
): Promise<CellConfigResult> {
    const group_by = _config.group_by;
    const split_by = _config.split_by;
    const start_row = row_idx >= 0 ? row_idx : 0;
    const end_row = start_row + 1;
    const r = (await _view.to_json({ start_row, end_row })) as RowData[];
    const row_paths = r.map((x) => x.__ROW_PATH__);
    const group_by_values = (row_paths[0] || []) as Scalar[];
    const row_filters = group_by
        .map((pivot, index): Filter | undefined => {
            const pivot_value = group_by_values[index];
            return pivot_value ? [pivot, "==", pivot_value] : undefined;
        })
        .filter((x): x is Filter => x !== undefined);

    // Filter out *all* meta columns before indexing into the row's
    // keys — the DuckDB virtual server's JSON output now includes
    // per-level `__ROW_PATH_<n>__` columns alongside the
    // `__ROW_PATH__` sidecar, so the previous `+1` skip (which
    // assumed exactly one leading meta column) lands on a meta key
    // when group_by has multiple levels.
    const user_keys = Object.keys(r[0]).filter((k) => !isMetaColumn(k));
    const column_paths = user_keys[col_idx];
    const result: CellConfigResult = {
        row: r[0] as Record<string, unknown>,
        column_names: [],
        config: { filter: [] },
    };

    let column_filters: Filter[] = [];
    if (column_paths) {
        const split_by_values = column_paths.split("|");
        result.column_names = [split_by_values[split_by.length]];
        column_filters = split_by
            .map((pivot, index): Filter | undefined => {
                const pivot_value = split_by_values[index];
                return pivot_value ? [pivot, "==", pivot_value] : undefined;
            })
            .filter((x): x is Filter => x !== undefined)
            .filter(([, , value]) => !isMetaColumn(value as string));
    }

    const filter = _config.filter.concat(row_filters).concat(column_filters);
    result.config = { filter };
    return result;
}
