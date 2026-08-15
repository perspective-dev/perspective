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

import { PRIVATE_PLUGIN_SYMBOL } from "../model/index.js";
import {
    type RegularTable,
    type DatagridModel,
    type ColumnsConfig,
    get_psp_type,
    isEditableMode,
} from "../types.js";
import type { ColumnType } from "@perspective-dev/client";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

const LAST_EDITABLE: WeakMap<RegularTable, HTMLElement> = new WeakMap();

/**
 * Whether a column of `type` holds text-editable cells (booleans toggle by
 * click and "link"-formatted strings navigate, so neither takes a caret).
 */
export function is_type_text_editable(
    type: ColumnType | undefined,
    format?: string,
): boolean {
    return type !== "boolean" && !(type === "string" && format === "link");
}

function is_cell_text_editable(
    model: DatagridModel,
    table: RegularTable,
    td: HTMLElement,
): boolean {
    const meta = table.getMeta(td);
    if (
        meta?.type !== "body" ||
        !isEditableMode(model, undefined as unknown as HTMLPerspectiveViewerElement)
    ) {
        return false;
    }

    if (!model._is_editable[meta.x]) {
        return false;
    }

    const type = get_psp_type(model, meta);
    const plugins: ColumnsConfig =
        (table as any)[PRIVATE_PLUGIN_SYMBOL] || {};
    const column_name = meta.column_header?.[model._config.split_by.length];
    const format = column_name
        ? plugins[column_name.toString()]?.format
        : undefined;

    return is_type_text_editable(type, format);
}

export function ensure_cell_editable(
    table: RegularTable,
    td: HTMLElement,
): void {
    const prev = LAST_EDITABLE.get(table);
    if (prev !== td) {
        prev?.removeAttribute("contenteditable");
        td.setAttribute("contenteditable", "true");
        LAST_EDITABLE.set(table, td);
    }
}

export function release_cell_editable(
    table: RegularTable,
    td: HTMLElement,
): void {
    td.removeAttribute("contenteditable");
    if (LAST_EDITABLE.get(table) === td) {
        LAST_EDITABLE.delete(table);
    }
}

export function createEditPointerdownListener(
    model: DatagridModel,
    table: RegularTable,
    _viewer: HTMLPerspectiveViewerElement,
): EventListener {
    return (event: Event): void => {
        const target = event.target as HTMLElement;
        if (target?.tagName !== "TD") {
            return;
        }

        if (is_cell_text_editable(model, table, target)) {
            ensure_cell_editable(table, target);
        }
    };
}

export function ensure_editable_for_focus(
    model: DatagridModel,
    table: RegularTable,
    td: HTMLElement,
): void {
    if (is_cell_text_editable(model, table, td)) {
        ensure_cell_editable(table, td);
    }
}
