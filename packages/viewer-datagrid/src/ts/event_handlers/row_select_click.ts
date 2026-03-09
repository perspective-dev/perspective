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

import getCellConfig from "../get_cell_config.js";
import {
    type RegularTable,
    type DatagridModel,
    type PerspectiveViewerElement,
    type HandledMouseEvent,
    PerspectiveSelectDetail,
} from "../types.js";

type SelectedRowsMap = Map<RegularTable, unknown[]>;

export async function selectionListener(
    this: DatagridModel,
    regularTable: RegularTable,
    viewer: PerspectiveViewerElement,
    selected_rows_map: SelectedRowsMap,
    event: HandledMouseEvent,
): Promise<void> {
    const meta = regularTable.getMeta(event.target as HTMLElement);
    if (!viewer.hasAttribute("selectable")) return;
    if (event.handled) return;
    if (event.shiftKey) return;
    if (event.button !== 0) {
        return;
    }

    event.stopImmediatePropagation();

    if (!meta) {
        return;
    }

    if ((meta.type === "body" || meta.type === "row_header") && meta.y >= 0) {
        const id = this._ids?.[meta.y - meta.y0];
        const selected = selected_rows_map.get(regularTable);
        const key_match =
            !!selected &&
            selected.reduce<boolean>((agg, x, i) => agg && x === id[i], true);

        const is_deselect =
            !!selected && id.length === selected.length && key_match;

        const { row, column_names, config } = await getCellConfig(
            this,
            meta.y,
            meta.type === "body" ? meta.x : 0,
        );

        let detail: PerspectiveSelectDetail;
        if (is_deselect) {
            selected_rows_map.delete(regularTable);
            detail = new PerspectiveSelectDetail(
                false,
                row,
                [],
                [],
                [{ filter: structuredClone(this._config.filter) }],
            );
        } else {
            selected_rows_map.set(regularTable, id);
            detail = new PerspectiveSelectDetail(
                true,
                row,
                column_names,
                [],
                [config],
            );
        }

        await regularTable.draw({ preserve_width: true });
        event.handled = true;
        viewer.dispatchEvent(
            new CustomEvent<PerspectiveSelectDetail>("perspective-select", {
                bubbles: true,
                composed: true,
                detail,
            }),
        );
    }
}
