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
import { PRIVATE_PLUGIN_SYMBOL } from "../model/index.js";
import type {
    DatagridModel,
    ColumnsConfig,
    DatagridPluginElement,
    SelectedPositionMap,
} from "../types.js";
import { isEditableMode } from "../types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

import { applyFocusStyle } from "./focus.js";
import { applyColumnHeaderStyles } from "./editable.js";
import { applyGroupHeaderStyles } from "./group_header.js";
import { applyBodyCellStyles } from "./body.js";
import { CellMetadata } from "regular-table/dist/esm/types.js";
import { CollectedCell, CollectedHeaderRow } from "./types.js";

/**
 * Consolidated style listener that handles all cell styling in a single pass.
 * This eliminates redundant DOM traversals and reduces layout thrashing by:
 * 1. Collecting all cell metadata in a read phase
 * 2. Applying all styles in a write phase
 */
export function createConsolidatedStyleListener(
    datagrid: DatagridPluginElement,
    model: DatagridModel,
    regularTable: RegularTableElement,
    viewer: HTMLPerspectiveViewerElement,
    selectedPositionMap: SelectedPositionMap,
): () => void {
    return function consolidatedStyleListener(): void {
        const plugins: ColumnsConfig =
            (regularTable as any)[PRIVATE_PLUGIN_SYMBOL] || {};
        const isSettingsOpen = viewer.hasAttribute("settings");
        const isSelectable = model._edit_mode === "SELECT_ROW_TREE";
        const isEditable = isEditableMode(model, viewer);
        const isEditableAllowed = isEditableMode(model, viewer, true);

        // Toggle edit mode class on datagrid
        datagrid.classList.toggle("edit-mode-allowed", isEditableAllowed);
        const bodyCells: CollectedCell[] = [];
        const groupHeaderRows: CollectedHeaderRow[] = [];
        const tbody = regularTable.children[0]?.children[1];
        if (tbody) {
            for (const tr of tbody.children) {
                for (const cell of tr.children) {
                    const metadata = regularTable.getMeta(
                        cell as HTMLElement,
                    ) as CellMetadata | undefined;

                    if (
                        metadata &&
                        (metadata.type === "body" ||
                            metadata.type === "row_header")
                    ) {
                        const isHeader = cell.tagName === "TH";
                        bodyCells.push({
                            element: cell as HTMLElement,
                            metadata,
                            isHeader,
                        });
                    }
                }
            }
        }

        // Collect header rows (thead)
        const thead = regularTable.children[0]?.children[0];
        if (thead) {
            for (const tr of thead.children) {
                const rowData: CollectedHeaderRow = {
                    row: tr as HTMLTableRowElement,
                    cells: [],
                };

                for (const cell of tr.children) {
                    const metadata = regularTable.getMeta(
                        cell as HTMLElement,
                    ) as CellMetadata | undefined;

                    rowData.cells.push({
                        element: cell as HTMLTableCellElement,
                        metadata,
                    });
                }

                groupHeaderRows.push(rowData);
            }
        }

        applyBodyCellStyles(
            model,
            bodyCells,
            plugins,
            isSettingsOpen,
            isSelectable,
            isEditable,
            regularTable,
        );

        applyGroupHeaderStyles(model, groupHeaderRows, regularTable);
        applyColumnHeaderStyles(model, groupHeaderRows, regularTable, viewer);
        applyFocusStyle(model, bodyCells, regularTable, selectedPositionMap);
    };
}
