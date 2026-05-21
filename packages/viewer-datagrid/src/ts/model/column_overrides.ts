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

import type { ColumnOverrides, DatagridPluginElement } from "../types.js";

interface RegularTableWithOverrides {
    restoreColumnSizes(overrides: Record<number, number | undefined>): void;
    saveColumnSizes(): Record<number, number | undefined>;
}

interface DatagridPluginWithCache extends DatagridPluginElement {
    _cached_column_sizes?: ColumnOverrides;
}

/**
 * Restore a saved column width override token.
 *
 * @param old_sizes An object previously returned by a call to
 * `save_column_size_overrides()`
 * @param cache A flag indicating whether this value should
 * be cached so a future `resetAutoSize()` call does not clear it.
 */
export function restore_column_size_overrides(
    this: DatagridPluginWithCache,
    old_sizes: ColumnOverrides,
    cache = false,
): void {
    if (!this._initialized) {
        return;
    }

    if (cache) {
        this._cached_column_sizes = old_sizes;
    }

    const regular_table = this.regular_table as RegularTableWithOverrides;
    const overrides: Record<number, number | undefined> = {
        ...regular_table.saveColumnSizes(),
    };
    const { group_by } = this.model!._config;
    const tree_header_offset = group_by?.length > 0 ? group_by.length + 1 : 0;

    for (const key of Object.keys(old_sizes)) {
        if (key === "__ROW_PATH__") {
            overrides[tree_header_offset - 1] = old_sizes[key] as
                | number
                | undefined;
        } else {
            const index = this.model!._column_paths.indexOf(key);

            // Skip keys that don't resolve to a known column — e.g. on the
            // first draw after `activate`, `_column_paths` has not yet been
            // populated by the data listener, so we leave any existing
            // `regular-table` widths untouched rather than clobbering them
            // with garbage indices.
            if (index === -1) {
                continue;
            }

            overrides[index + tree_header_offset] = old_sizes[key] as
                | number
                | undefined;
        }
    }

    regular_table.restoreColumnSizes(overrides);
}

/**
 * Extract the current user-overriden column widths from
 * `regular-table`. This function depends on the internal
 * implementation of `regular-table` and may break!
 *
 * @returns An Object-as-dictionary keyed by column_path string, and
 * valued by the column's user-overridden pixel width.
 */
export function save_column_size_overrides(
    this: DatagridPluginWithCache,
): ColumnOverrides {
    if (!this._initialized) {
        return {};
    }

    if (this._cached_column_sizes) {
        const x = this._cached_column_sizes;
        this._cached_column_sizes = undefined;
        return x;
    }

    const overrides = (
        this.regular_table as RegularTableWithOverrides
    ).saveColumnSizes();
    const { group_by } = this.model!._config;
    const tree_header_offset = group_by?.length > 0 ? group_by.length + 1 : 0;

    const old_sizes: ColumnOverrides = {};
    for (const key of Object.keys(overrides)) {
        const numKey = Number(key);
        if (overrides[numKey] !== undefined) {
            const index = numKey - tree_header_offset;
            if (index > -1) {
                old_sizes[this.model!._column_paths[index]] = overrides[numKey];
            } else if (index === -1) {
                old_sizes["__ROW_PATH__"] = overrides[numKey];
            }
        }
    }

    return old_sizes;
}
