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

import type { RegularTableElement } from "regular-table";
import type {
    ColumnConfig,
    ColumnsConfig,
    DatagridModel,
    DatagridPluginElement,
} from "../types.js";

type LiveOverrides = Record<number, number | undefined>;

/**
 * Reconcile `regular-table`'s override entries for columns `[x0, x1)` with
 * the path-keyed truth and return the live map.
 */
export function reconcile_column_widths(
    model: DatagridModel,
    regular_table: RegularTableElement,
    x0: number,
    x1: number,
): LiveOverrides {
    const live: LiveOverrides = regular_table.saveColumnSizes();
    if (model._config.split_by.length > 0) {
        return live;
    }

    const truth = model._column_overrides;
    const projected = model._projected;
    const offset = model._num_row_headers;
    const end = Math.min(x1, model._column_paths.length);
    let dirty = false;
    const write = (size_key: number, px: number | undefined) => {
        if (px === undefined) {
            delete live[size_key];
        } else {
            live[size_key] = px;
        }

        dirty = true;
    };

    for (let index = x0; index < end; index++) {
        const path = model._column_paths[index];
        if (path === undefined) {
            continue;
        }

        const size_key = offset + index;
        const live_px = live[size_key];
        const base = projected.get(size_key);
        const want = truth.get(path);
        if (base !== undefined && base.path === path && live_px !== base.px) {
            if (live_px === undefined) {
                truth.delete(path);
            } else {
                truth.set(path, live_px);
            }

            model._unpersisted_widths.add(path);
            projected.set(size_key, { path, px: live_px });
        } else {
            if (want !== live_px) {
                write(size_key, want);
            }

            projected.set(size_key, { path, px: want });
        }
    }

    if (dirty) {
        regular_table.restoreColumnSizes(live as Record<number, number>);
    }

    return live;
}

/**
 * The `columns_config` delta echoed to the host after a gesture: each of
 * `paths` with its full config and current override.
 */
export function width_config_delta(
    elem: DatagridPluginElement,
    paths: Iterable<string>,
): ColumnsConfig {
    const out: ColumnsConfig = {};
    for (const path of paths) {
        const config: ColumnConfig = structuredClone(
            elem._columns_config[path] ?? {},
        );

        delete config.column_size_override;
        const px = elem._column_overrides.get(path);
        if (px !== undefined) {
            config.column_size_override = px;
        }

        out[path] = config;
    }

    return out;
}
