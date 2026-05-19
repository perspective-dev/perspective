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

import {
    type DatagridModel,
    type ColumnsConfig,
    get_psp_type,
} from "../types.js";

import { cell_style_numeric } from "./table_cell/numeric.js";
import { cell_style_string } from "./table_cell/string.js";
import { cell_style_datetime } from "./table_cell/datetime.js";
import { cell_style_boolean } from "./table_cell/boolean.js";
import { cell_style_row_header } from "./table_cell/row_header.js";
import { CollectedCell } from "./types.js";

/**
 * Apply styles to all body cells in a single pass.
 */
export function applyBodyCellStyles(
    model: DatagridModel,
    cells: CollectedCell[],
    plugins: ColumnsConfig,
    isSettingsOpen: boolean,
    isSelectable: boolean,
    isEditable: boolean,
    regularTable: RegularTableElement,
): void {
    const selectedId = isSelectable ? model._tree_selection_id : undefined;

    regularTable.classList.toggle(
        "flat-group-rollup-mode",
        model._config.group_rollup_mode === "flat",
    );

    for (const { element: td, metadata, isHeader } of cells) {
        const column_name =
            metadata.column_header?.[model._config.split_by.length];
        const type = get_psp_type(model, metadata);
        const plugin = column_name
            ? plugins[column_name.toString()]
            : undefined;
        const is_numeric = type === "integer" || type === "float";

        // Calculate aggregate depth visibility
        // @ts-ignore
        metadata._is_hidden_by_aggregate_depth =
            model._config.group_rollup_mode === "rollup" &&
            ((x?: number) =>
                x === 0 || x === undefined
                    ? false
                    : x - 1 <
                      Math.min(
                          model._config.group_by.length,
                          plugin?.aggregate_depth || 0,
                      ))(
                (metadata.row_header as unknown[] | undefined)?.filter(
                    (x) => x !== undefined,
                )?.length,
            );

        // Apply type-specific cell styling
        if (is_numeric) {
            cell_style_numeric(
                model,
                plugin as any,
                td,
                metadata as any,
                isSettingsOpen,
            );
        } else if (type === "boolean") {
            cell_style_boolean(model, plugin, td, metadata as any);
        } else if (type === "string") {
            cell_style_string(model, plugin as any, td, metadata as any);
        } else if (type === "date" || type === "datetime") {
            cell_style_datetime(model, plugin as any, td, metadata);
        } else {
            td.style.backgroundColor = "";
            td.style.color = "";
        }

        // Apply common cell classes
        td.classList.toggle(
            "psp-bool-type",
            type === "boolean" && metadata.user !== null,
        );

        td.classList.toggle("psp-null", metadata.value === null);
        td.classList.toggle("psp-align-right", !isHeader && is_numeric);
        td.classList.toggle("psp-align-left", isHeader || !is_numeric);
        if (model._column_settings_selected_column) {
            td.classList.toggle(
                "psp-menu-open",
                column_name === model._column_settings_selected_column,
            );
        } else {
            td.classList.toggle("psp-menu-open", false);
        }

        td.classList.toggle(
            "psp-color-mode-bar",
            plugin?.number_fg_mode === "bar" && is_numeric,
        );

        td.classList.toggle(
            "psp-color-mode-label-bar",
            plugin?.number_fg_mode === "label-bar" && is_numeric,
        );

        // Apply row header styling
        if (isHeader) {
            cell_style_row_header(model, regularTable, td, metadata as any);
        }

        // Set data attributes
        const tr = td.parentElement as HTMLElement;
        if (tr) {
            tr.dataset.y = String(metadata.y);
        }

        if (
            metadata.type !== "row_header" ||
            metadata.row_header_x ===
                (metadata.row_header as unknown[]).length - 1 ||
            (metadata.row_header as unknown[])[metadata.row_header_x + 1] ===
                undefined
        ) {
            td.dataset.y = String(metadata.y);
            if (metadata.type !== "row_header") {
                td.dataset.x = String(metadata.x);
            } else {
                delete td.dataset.x;
            }
        } else {
            delete td.dataset.y;
            delete td.dataset.x;
        }

        // Apply tree selection styling (SELECT_ROW_TREE).
        // psp-select-region-inactive is exclusively a tree-selection class,
        // so always clean it up. psp-select-region is shared with the
        // coordinate-based selection modes, so only touch it when in
        // SELECT_ROW_TREE mode (isSelectable).
        td.classList.toggle("psp-select-region-inactive", false);
        if (isSelectable) {
            if (!selectedId) {
                td.classList.toggle("psp-select-region", false);
            } else {
                const id = model._ids[(metadata.y ?? 0) - (metadata.y0 ?? 0)];
                const key_match = selectedId.reduce<boolean>(
                    (agg, x, i) => agg && x === id[i],
                    true,
                );

                const isExact = id.length === selectedId.length && key_match;
                const isSub = id.length !== selectedId.length && key_match;

                if (isHeader) {
                    if (
                        metadata.type === "row_header" &&
                        metadata.row_header_x !== undefined &&
                        !!id[metadata.row_header_x]
                    ) {
                        td.classList.toggle("psp-select-region", false);
                    } else {
                        td.classList.toggle("psp-select-region", isExact);
                        td.classList.toggle(
                            "psp-select-region-inactive",
                            isSub,
                        );
                    }
                } else {
                    td.classList.toggle("psp-select-region", isExact);
                    td.classList.toggle("psp-select-region-inactive", isSub);
                }
            }
            // } else if (
            //     model._edit_mode === "READ_ONLY" ||
            //     model._edit_mode === "EDIT"
            // ) {
            //     td.classList.toggle("psp-select-region", false);
        }

        // Apply editable styling (if editable)
        if (!isHeader && metadata.type === "body") {
            if (isEditable && model._is_editable[metadata.x]) {
                const col_name =
                    metadata.column_header?.[model._config.split_by.length];
                const col_name_str = col_name?.toString();
                if (
                    col_name_str &&
                    type === "string" &&
                    plugins[col_name_str]?.format === "link"
                ) {
                    td.toggleAttribute("contenteditable", false);
                    td.classList.toggle("boolean-editable", false);
                } else if (type === "boolean") {
                    td.toggleAttribute("contenteditable", false);
                    td.classList.toggle(
                        "boolean-editable",
                        (metadata as { user?: unknown }).user !== null,
                    );
                } else {
                    if (isEditable !== td.hasAttribute("contenteditable")) {
                        td.toggleAttribute("contenteditable", isEditable);
                    }

                    td.classList.toggle("boolean-editable", false);
                }
            } else {
                td.toggleAttribute("contenteditable", false);
                td.classList.toggle("boolean-editable", false);
            }
        }
    }
}
