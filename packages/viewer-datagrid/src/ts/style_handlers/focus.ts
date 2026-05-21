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
import type { DatagridModel, SelectedPositionMap } from "../types.js";
import { CollectedCell } from "./types.js";

/**
 * Apply focus style to the selected cell.
 * Optimized to use collected cells instead of querySelectorAll.
 */
export function applyFocusStyle(
    _model: DatagridModel,
    cells: CollectedCell[],
    regularTable: RegularTableElement,
    selectedPositionMap: SelectedPositionMap,
): void {
    const selected_position = selectedPositionMap.get(regularTable);
    const host = regularTable.getRootNode() as Document;

    if (selected_position) {
        for (const { element: td, metadata } of cells) {
            if (
                metadata.type === "body" &&
                metadata.x === selected_position.x &&
                metadata.y === selected_position.y
            ) {
                if (host.activeElement !== td) {
                    td.focus({ preventScroll: true });
                }

                return;
            }
        }

        // If we didn't find the cell to focus, blur current
        if (
            document.activeElement !== document.body &&
            regularTable.contains(host.activeElement)
        ) {
            (host.activeElement as HTMLElement).blur();
        }
    }
}

/**
 * Standalone function to focus the selected cell.
 * This collects cells from the table and tries to focus the selected position.
 * Returns true if focus was successful, false otherwise.
 *
 * Used by edit_keydown.ts for keyboard navigation.
 */
export function focusSelectedCell(
    regularTable: RegularTableElement,
    selectedPositionMap: SelectedPositionMap,
): boolean {
    const selected_position = selectedPositionMap.get(regularTable);
    if (!selected_position) {
        return false;
    }

    const host = regularTable.getRootNode() as Document;
    const tbody = regularTable.children[0]?.children[1];

    if (tbody) {
        for (const tr of tbody.children) {
            for (const cell of tr.children) {
                const metadata = regularTable.getMeta(cell as HTMLElement);
                if (
                    metadata?.type === "body" &&
                    metadata.x === selected_position.x &&
                    metadata.y === selected_position.y
                ) {
                    if (host.activeElement !== cell) {
                        (cell as HTMLElement).focus({ preventScroll: true });
                    }

                    return true;
                }
            }
        }
    }

    // If we didn't find the cell to focus, blur current
    if (
        document.activeElement !== document.body &&
        regularTable.contains(host.activeElement)
    ) {
        (host.activeElement as HTMLElement).blur();
    }

    return false;
}
