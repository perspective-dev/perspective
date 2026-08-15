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

import { CollectedHeaderRow } from "./types.js";
import { apply_borders, classify_header_cell } from "./border_model.js";

/// The row-header column index whose right edge separates the row-header
/// region from the data columns. Flat rollup mode has no tree-expander
/// gutter, so its last row-header column is one earlier.
export function corner_boundary_x(model: DatagridModel): number {
    return (
        model._config.group_by.length -
        (model._config.group_rollup_mode === "flat" ? 1 : 0)
    );
}

/**
 * Apply styles to group header rows. Border segments come from the pure
 * classification in `border_model.ts`; this handler only reads regular-table
 * metadata and toggles classes. Rows at and below the column-name row are
 * border-classified by `styleColumnHeaderRow` instead.
 */
export function applyGroupHeaderStyles(
    model: DatagridModel,
    headerRows: CollectedHeaderRow[],
    regularTable: RegularTableElement,
): void {
    const split_by_len = model._config.split_by.length;
    const single_header_row = headerRows.length <= 1;
    const boundary_x = corner_boundary_x(model);

    for (let y = 0; y < headerRows.length; y++) {
        const { cells } = headerRows[y];
        const is_group_row = y < split_by_len;

        for (let x = 0; x < cells.length; x++) {
            const { element: td, metadata } = cells[x];
            if (!metadata) {
                continue;
            }

            td.style.backgroundColor = "";
            td.classList.toggle("psp-header-group", true);
            td.classList.toggle("psp-header-leaf", false);
            td.classList.toggle(
                "psp-header-group-corner",
                metadata.type === "corner",
            );

            td.classList.toggle("psp-color-mode-bar", false);
            td.classList.toggle("psp-color-mode-label-bar", false);
            td.classList.toggle("psp-header-sort-asc", false);
            td.classList.toggle("psp-header-sort-desc", false);
            td.classList.toggle("psp-header-sort-col-asc", false);
            td.classList.toggle("psp-header-sort-col-desc", false);
            td.classList.toggle("psp-header-sort-abs-asc", false);
            td.classList.toggle("psp-header-sort-abs-desc", false);
            td.classList.toggle("psp-header-sort-abs-col-asc", false);
            td.classList.toggle("psp-header-sort-abs-col-desc", false);
            td.classList.toggle("psp-sort-enabled", false);

            // regular-table recycles `<th>`s across roles - when `split_by`
            // grows by 2+ in one step, the old menu row's cells land in a
            // group row still carrying their name/menu-row classes, and the
            // `.psp-menu-enabled` styling bleeds onto the group cell's
            // content span.
            td.classList.toggle("psp-menu-enabled", false);
            td.classList.toggle("psp-menu-open", false);

            if (!is_group_row) {
                // The name and menu rows are re-styled (including borders)
                // by `styleColumnHeaderRow` in the same pass.
                continue;
            }

            const is_corner = metadata.type === "corner";
            const is_data =
                metadata.type === "column_header" && metadata.x! >= 0;
            const borders = classify_header_cell({
                paths: model._column_paths,
                split_by_len,
                x: is_data ? metadata.x : undefined,
                colspan: td.colSpan || 1,
                y,
                row_kind: "group",
                is_corner,
                corner_needs_border:
                    is_corner &&
                    model._config.group_by.length > 0 &&
                    metadata.row_header_x === boundary_x,
                is_last_header_row: false,
                single_header_row,
            });

            apply_borders(td, borders);

            // Legacy semantic classes, kept for themes and event handlers;
            // no CSS in this package draws from them anymore.
            td.classList.toggle("psp-header-border", borders.right !== "none");
            td.classList.toggle("psp-is-top", borders.right === "miter-start");
        }
    }
}
