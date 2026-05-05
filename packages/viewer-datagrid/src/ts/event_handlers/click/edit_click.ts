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

import { CellMetadataBody } from "regular-table/dist/esm/types.js";
import {
    type RegularTable,
    type DatagridModel,
    get_psp_type,
} from "../../types.js";

import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

export function write_cell(
    table: RegularTable,
    model: DatagridModel,
    active_cell: HTMLElement,
): boolean {
    const meta = table.getMeta(active_cell) as CellMetadataBody;
    if (!meta) {
        return false;
    }

    const type = model._schema[model._column_paths[meta.x!]];
    let text: string | number | boolean | null = active_cell.textContent || "";
    const id = model._ids[meta.y! - meta.y0][0];
    if (type === "float" || type === "integer") {
        const parsed = parseFloat(text.replace(/,/g, ""));
        if (isNaN(parsed)) {
            return false;
        }

        text = parsed;
    } else if (type === "date" || type === "datetime") {
        const parsed = Date.parse(text);
        if (isNaN(parsed)) {
            return false;
        }

        text = parsed;
    } else if (type === "boolean") {
        text = text === "true" ? false : text === "false" ? true : null;
    }

    const msg = {
        __INDEX__: id,
        [model._column_paths[meta.x]]: text,
    };

    model._table.update([msg], { port_id: model._edit_port, format: null });
    return true;
}

export function clickListener(
    model: DatagridModel,
    table: RegularTable,
    _viewer: HTMLPerspectiveViewerElement,
    event: MouseEvent,
): void {
    const meta = table.getMeta(event.target as HTMLElement);
    if (meta?.type === "body" || meta?.type === "column_header") {
        const is_editable2 = model._is_editable[meta.x];
        const is_bool = get_psp_type(model, meta) === "boolean";
        const is_null = (event.target as Element).classList.contains(
            "psp-null",
        );

        if (is_editable2 && is_bool && !is_null) {
            write_cell(table, model, event.target as HTMLElement);
        }
    }
}
