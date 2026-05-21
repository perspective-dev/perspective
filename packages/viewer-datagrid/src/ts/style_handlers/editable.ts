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

import type { DatagridModel } from "../types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";
import { styleColumnHeaderRow } from "./column_header.js";

import { CollectedHeaderRow } from "./types.js";

/**
 * Apply styles to column header rows.
 */
export function applyColumnHeaderStyles(
    model: DatagridModel,
    headerRows: CollectedHeaderRow[],
    regularTable: RegularTableElement,
    viewer: HTMLPerspectiveViewerElement,
): void {
    if (headerRows.length === 0) {
        return;
    }

    // Style selected column for settings panel
    const selectedColumn = model._column_settings_selected_column;
    const len = headerRows.length;
    const settings_open = viewer.hasAttribute("settings");

    // Set row IDs
    if (len <= 1) {
        headerRows[0]?.row.removeAttribute("id");
    } else {
        headerRows.forEach(({ row }, i) => {
            const offset = settings_open ? 1 : 0;
            const id =
                i === len - (offset + 1)
                    ? "psp-column-titles"
                    : i === len - offset
                      ? "psp-column-edit-buttons"
                      : null;
            id ? row.setAttribute("id", id) : row.removeAttribute("id");
        });
    }

    viewer.classList.toggle("psp-menu-open", !!selectedColumn);

    // Style column titles and edit buttons when settings open
    if (settings_open && len >= 2) {
        const titlesRow = headerRows[len - 2];
        const editBtnsRow = headerRows[len - 1];

        if (titlesRow && editBtnsRow) {
            // Clear menu-open from other rows
            headerRows.slice(0, len - 2).forEach(({ cells }) => {
                cells.forEach(({ element }) => {
                    element.classList.toggle("psp-menu-open", false);
                });
            });

            for (let i = 0; i < titlesRow.cells.length; i++) {
                const title = titlesRow.cells[i]?.element;
                const editBtn = editBtnsRow.cells[i]?.element;
                if (!title || !editBtn) {
                    continue;
                }

                const open = title.textContent === selectedColumn;
                title.classList.toggle("psp-menu-open", open);
                editBtn.classList.toggle("psp-menu-open", open);
            }
        }
    }

    // Style the actual column header rows
    const colHeadersIndex = model._config.split_by.length;
    if (colHeadersIndex < headerRows.length) {
        const colHeaders = headerRows[colHeadersIndex];
        if (colHeaders) {
            styleColumnHeaderRow(model, colHeaders, regularTable, false);
        }
    }

    const menuHeadersIndex = model._config.split_by.length + 1;
    if (menuHeadersIndex < headerRows.length) {
        const menuHeaders = headerRows[menuHeadersIndex];
        if (menuHeaders) {
            styleColumnHeaderRow(model, menuHeaders, regularTable, true);
        }
    }
}
