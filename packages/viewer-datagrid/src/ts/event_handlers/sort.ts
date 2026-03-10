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

import { RegularTableElement } from "regular-table";
import type {
    DatagridModel,
    PerspectiveViewerElement,
    SortRotationOrder,
    SortTerm,
} from "../types.js";
import { SortDir } from "@perspective-dev/client";

const ROW_SORT_ORDER: SortRotationOrder = {
    desc: "asc",
    asc: undefined,
    "desc abs": "asc abs",
    "asc abs": undefined,
};

const ROW_COL_SORT_ORDER: SortRotationOrder = {
    desc: "asc",
    asc: undefined,
    "desc abs": "asc abs",
    "asc abs": undefined,
    // "col desc": "col asc",
    // "col asc": undefined,
    // "col desc abs": "col asc abs",
    // "col asc abs": undefined,
};

export async function sortHandler(
    this: DatagridModel,
    regularTable: RegularTableElement,
    viewer: PerspectiveViewerElement,
    event: MouseEvent,
    target: HTMLElement,
): Promise<void> {
    const meta = regularTable.getMeta(target);
    if (!meta?.column_header) return;
    const column_name = meta.column_header[this._config.split_by.length];
    const sort_method =
        event.ctrlKey ||
        (event as MouseEvent & { metaKey?: boolean }).metaKey ||
        event.altKey
            ? append_sort
            : override_sort;

    const abs = event.shiftKey;
    const sort = sort_method.call(this, `${column_name}`, abs);
    await viewer.restore({ sort });
}

export function append_sort(
    this: DatagridModel,
    column_name: string,
    abs: boolean,
): SortTerm[] {
    const sort: SortTerm[] = [];
    let found = false;
    for (const sort_term of this._config.sort) {
        const [_column_name, _sort_dir] = sort_term;
        if (_column_name === column_name) {
            found = true;
            const term = create_sort.call(this, column_name, _sort_dir, abs);
            if (term) {
                sort.push(term);
            }
        } else {
            sort.push(sort_term);
        }
    }

    if (!found) {
        sort.push([column_name, abs ? "desc abs" : "desc"]);
    }

    return sort;
}

export function override_sort(
    this: DatagridModel,
    column_name: string,
    abs: boolean,
): SortTerm[] {
    for (const [_column_name, _sort_dir] of this._config.sort) {
        if (_column_name === column_name) {
            const sort = create_sort.call(this, column_name, _sort_dir, abs);
            return sort ? [sort] : [];
        }
    }

    return [[column_name, abs ? "desc abs" : "desc"]];
}

export function create_sort(
    this: DatagridModel,
    column_name: string,
    sort_dir: SortDir | undefined,
    _abs: boolean,
): SortTerm | undefined {
    const is_col_sortable = this._config.split_by.length > 0;
    const order = is_col_sortable ? ROW_COL_SORT_ORDER : ROW_SORT_ORDER;
    const inc_sort_dir: SortDir | undefined = sort_dir
        ? order[sort_dir]
        : "desc";

    if (inc_sort_dir) {
        return [column_name, inc_sort_dir];
    }

    return undefined;
}
