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
    const settings_open =
        viewer.hasAttribute("settings") &&
        viewer.getActivePanel() === model._panel;

    const name_row = model._config.split_by.length;
    const has_menu_row = len === name_row + 2;

    // Set row IDs
    if (len <= 1) {
        headerRows[0]?.row.removeAttribute("id");
    } else {
        headerRows.forEach(({ row }, i) => {
            const id =
                i === name_row
                    ? "psp-column-titles"
                    : has_menu_row && i === name_row + 1
                      ? "psp-column-edit-buttons"
                      : null;

            id ? row.setAttribute("id", id) : row.removeAttribute("id");
        });
    }

    viewer.classList.toggle("psp-menu-open", !!selectedColumn);

    if (settings_open && name_row < len) {
        const titlesRow = headerRows[name_row];
        const editBtnsRow = has_menu_row ? headerRows[name_row + 1] : undefined;

        if (titlesRow) {
            headerRows.slice(0, name_row).forEach(({ cells }) => {
                cells.forEach(({ element }) => {
                    element.classList.toggle("psp-menu-open", false);
                });
            });

            for (let i = 0; i < titlesRow.cells.length; i++) {
                const title = titlesRow.cells[i]?.element;
                if (!title) {
                    continue;
                }

                const open = title.textContent === selectedColumn;
                title.classList.toggle("psp-menu-open", open);
                editBtnsRow?.cells[i]?.element.classList.toggle(
                    "psp-menu-open",
                    open,
                );
            }
        }
    }

    // Style the actual column header rows
    const single_header_row = len <= 1;
    const colHeadersIndex = model._config.split_by.length;
    const menuHeadersIndex = model._config.split_by.length + 1;
    if (colHeadersIndex < headerRows.length) {
        const colHeaders = headerRows[colHeadersIndex];
        if (colHeaders) {
            styleColumnHeaderRow(
                model,
                colHeaders,
                regularTable,
                false,
                menuHeadersIndex >= headerRows.length,
                single_header_row,
            );
        }
    }

    if (menuHeadersIndex < headerRows.length) {
        const menuHeaders = headerRows[menuHeadersIndex];
        if (menuHeaders) {
            styleColumnHeaderRow(
                model,
                menuHeaders,
                regularTable,
                true,
                true,
                single_header_row,
            );
        }
    }
}
