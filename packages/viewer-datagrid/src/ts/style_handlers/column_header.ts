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
import { get_psp_type, type DatagridModel } from "../types.js";
import { CollectedHeaderRow } from "./types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";
import { apply_borders, classify_header_cell } from "./border_model.js";
import { corner_boundary_x } from "./group_header.js";

/**
 * Apply selected column styling in response to column settings toggle events.
 * This is called directly (not as a style listener) when the user opens/closes
 * the column settings panel.
 */
export function style_selected_column(
    model: DatagridModel,
    regularTable: RegularTableElement,
    viewer: HTMLPerspectiveViewerElement,
    selectedColumn: string | undefined,
): void {
    const group_header_trs = Array.from(
        regularTable.children[0].children[0].children,
    ) as HTMLTableRowElement[];

    const len = group_header_trs.length;
    const settings_open = viewer.hasAttribute("settings");
    if (len <= 1) {
        group_header_trs[0]?.removeAttribute("id");
    } else {
        group_header_trs.forEach((tr, i) => {
            const offset = settings_open ? 1 : 0;
            const id =
                i === len - (offset + 1)
                    ? "psp-column-titles"
                    : i === len - offset
                      ? "psp-column-edit-buttons"
                      : null;
            id ? tr.setAttribute("id", id) : tr.removeAttribute("id");
        });
    }

    viewer.classList.toggle("psp-menu-open", !!selectedColumn);
    if (settings_open && len >= 2) {
        const titles = Array.from(
            group_header_trs[len - 2].children,
        ) as HTMLElement[];
        const editBtns = Array.from(
            group_header_trs[len - 1].children,
        ) as HTMLElement[];
        if (titles && editBtns) {
            group_header_trs.slice(0, len - 2).forEach((tr) => {
                Array.from(tr.children).forEach((th) => {
                    th.classList.toggle("psp-menu-open", false);
                });
            });

            for (let i = 0; i < titles.length; i++) {
                const title = titles[i];
                const editBtn = editBtns[i];

                const open = title.textContent === selectedColumn;
                title.classList.toggle("psp-menu-open", open);
                editBtn.classList.toggle("psp-menu-open", open);
                if (model._config.columns.length > 1) {
                    for (const r of regularTable.querySelectorAll("td")) {
                        const meta = regularTable.getMeta(r);
                        if (!meta?.column_header) {
                            continue;
                        }

                        const isOpen =
                            meta.column_header[
                                meta.column_header.length - 2
                            ] === selectedColumn;
                        r.classList.toggle("psp-menu-open", isOpen);
                    }
                }
            }
        }
    }
}

/**
 * Style a single column header row.
 */
export function styleColumnHeaderRow(
    model: DatagridModel,
    headerRow: CollectedHeaderRow,
    regularTable: RegularTableElement,
    is_menu_row: boolean,
    is_last_header_row: boolean,
    single_header_row: boolean,
): void {
    const header_depth = corner_boundary_x(model);
    const split_by_len = model._config.split_by.length;
    const selectedColumn = model._column_settings_selected_column;
    for (const { element: td, metadata } of headerRow.cells) {
        if (
            !metadata ||
            metadata.type === "body" ||
            metadata.type === "row_header"
        ) {
            continue;
        }

        const column_name =
            metadata.column_header?.[model._config.split_by.length];

        const sort = model._config.sort.find((x) => x[0] === column_name);
        const is_corner = typeof metadata.x === "undefined";
        const borders = classify_header_cell({
            paths: model._column_paths,
            split_by_len,
            x: is_corner ? undefined : metadata.x,
            colspan: td.colSpan || 1,
            y: split_by_len + (is_menu_row ? 1 : 0),
            row_kind: is_menu_row ? "menu" : "name",
            is_corner: metadata.type === "corner",
            corner_needs_border:
                metadata.type === "corner" &&
                model._config.group_by.length > 0 &&
                metadata.row_header_x === header_depth,
            is_last_header_row,
            single_header_row,
        });

        apply_borders(td, borders);
        td.classList.toggle("psp-header-border", borders.right !== "none");
        td.classList.toggle("psp-header-group", false);
        td.classList.toggle("psp-header-leaf", true);

        // Under `split_rollup_mode: "rollup"`, columns whose raw path has
        // fewer levels than `split_by` are subtotal (or, with zero levels,
        // grand-total) column groups.
        const n_split_levels = is_corner
            ? undefined
            : model._column_paths[metadata.x!]?.split("|").length - 1;
        const is_rollup_col =
            model._config.split_by.length > 0 &&
            n_split_levels !== undefined &&
            n_split_levels < model._config.split_by.length;
        td.classList.toggle(
            "psp-split-total",
            is_rollup_col && n_split_levels === 0,
        );
        td.classList.toggle(
            "psp-split-subtotal",
            is_rollup_col && n_split_levels! > 0,
        );
        td.classList.toggle("psp-is-top", false);
        td.classList.toggle("psp-header-corner", is_corner);
        td.classList.toggle(
            "psp-header-sort-asc",
            !is_menu_row && !!sort && sort[1] === "asc",
        );
        td.classList.toggle(
            "psp-header-sort-desc",
            !is_menu_row && !!sort && sort[1] === "desc",
        );
        td.classList.toggle(
            "psp-header-sort-col-asc",
            !is_menu_row && !!sort && sort[1] === "col asc",
        );
        td.classList.toggle(
            "psp-header-sort-col-desc",
            !is_menu_row && !!sort && sort[1] === "col desc",
        );
        td.classList.toggle(
            "psp-header-sort-abs-asc",
            !is_menu_row && !!sort && sort[1] === "asc abs",
        );
        td.classList.toggle(
            "psp-header-sort-abs-desc",
            !is_menu_row && !!sort && sort[1] === "desc abs",
        );
        td.classList.toggle(
            "psp-header-sort-abs-col-asc",
            !is_menu_row && !!sort && sort[1] === "col asc abs",
        );
        td.classList.toggle(
            "psp-header-sort-abs-col-desc",
            !is_menu_row && !!sort && sort[1] === "col desc abs",
        );

        const type = get_psp_type(model, metadata);
        const is_numeric = type === "integer" || type === "float";
        const is_string = type === "string";
        const is_date = type === "date";
        const is_datetime = type === "datetime";

        td.classList.toggle("psp-align-right", is_numeric);
        td.classList.toggle("psp-align-left", !is_numeric);
        td.classList.toggle(
            "psp-menu-enabled",
            (is_string || is_numeric || is_date || is_datetime) &&
                !is_corner &&
                metadata.column_header_y === model._config.split_by.length + 1,
        );
        td.classList.toggle(
            "psp-sort-enabled",
            (is_string || is_numeric || is_date || is_datetime) &&
                !is_corner &&
                metadata.column_header_y === model._config.split_by.length,
        );
        td.classList.toggle(
            "psp-is-width-override",
            regularTable.saveColumnSizes()[metadata.size_key!] !== undefined,
        );

        // Apply menu-open for selected column
        if (model._config.columns.length > 1 && selectedColumn) {
            const isOpen =
                metadata.column_header?.[metadata.column_header.length - 2] ===
                selectedColumn;
            td.classList.toggle("psp-menu-open", isOpen);
        }
    }
}
