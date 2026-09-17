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

import {
    CellMetadata,
    CellMetadataRowHeader,
} from "regular-table/dist/esm/types.js";
import type { DatagridModel } from "../../types.js";
import { RegularTableElement } from "regular-table";

/**
 * Classify a `<th>` row-header cell as a tree label, leaf or indent spacer by
 * its position in the row's header path.
 */
export function cell_style_row_header(
    model: DatagridModel,
    regularTable: RegularTableElement,
    td: HTMLElement,
    metadata: CellMetadataRowHeader,
): void {
    const x = metadata.row_header_x ?? 0;
    const is_flat = model._config.group_rollup_mode === "flat";
    const label_x = is_flat ? x : last_defined_index(metadata.row_header);
    const is_label = metadata.value !== undefined && x === label_x;
    const is_spacer = !is_flat && x < label_x;
    const is_leaf = x >= model._config.group_by.length;
    const next = regularTable.getMeta({
        dx: 0,
        dy: (metadata.y ?? 0) - (metadata.y0 ?? 0) + 1,
    } as CellMetadata);

    const is_collapse =
        next &&
        next.row_header &&
        typeof next.row_header[x + 1] !== "undefined";

    td.classList.toggle("psp-tree-spacer", is_spacer);
    td.classList.toggle("psp-tree-label", is_label && !is_leaf);
    td.classList.toggle(
        "psp-tree-label-expand",
        is_label && !is_leaf && !is_collapse,
    );

    td.classList.toggle(
        "psp-tree-label-collapse",
        is_label && !is_leaf && is_collapse,
    );
    td.classList.toggle("psp-tree-leaf", is_label && is_leaf);
}

function last_defined_index(row_header: unknown[] | undefined): number {
    if (!row_header) {
        return -1;
    }

    for (let i = row_header.length - 1; i >= 0; i--) {
        if (row_header[i] !== undefined) {
            return i;
        }
    }

    return -1;
}
