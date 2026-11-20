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

/**
 * Single-source-of-truth predicate for "this column is metadata, hide
 * it from the user-visible grid." Five distinct names show up across
 * the perspective protocol; older datagrid code filtered them by
 * exact-match in three places, which only worked when the wire shape
 * was the JSON-sidecar form (`__ROW_PATH__` array-of-arrays).
 *
 * The DuckDB virtual-server backend additionally surfaces per-level
 * `__ROW_PATH_<n>__` columns directly in `to_columns_string` /
 * `to_json` output (a side effect of keeping them in the frozen Arrow
 * batch so that `to_arrow` consumers — viewer-charts via
 * `with_typed_arrays` — see them inline, matching native
 * `perspective-server`'s `to_arrow` behavior). Without this helper,
 * those per-level columns slip through the legacy exact-match filters
 * and render as user columns to the right of the grid.
 *
 * Match list:
 *   - `__ROW_PATH__`     — JSON sidecar; used by the tree header.
 *   - `__ROW_PATH_<n>__` — per-level columns from the virtual server's
 *                          inline-arrow shape.
 *   - `__ID__`           — per-row identity column.
 *   - `__GROUPING_ID__`  — internal SQL-rollup discriminator. The
 *                          virtual server strips it server-side, but
 *                          we cover it defensively in case a future
 *                          backend leaks it.
 *
 * User columns named with leading/trailing double-underscores (e.g.
 * `__user_col__`) are *not* matched — the regex requires the exact
 * stems above.
 */
const META_COLUMN_RE = /^__(?:ROW_PATH(?:_\d+)?|ID|GROUPING_ID)__$/;

export function isMetaColumn(name: string): boolean {
    return META_COLUMN_RE.test(name);
}
