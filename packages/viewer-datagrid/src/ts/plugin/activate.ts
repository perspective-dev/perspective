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

import { style_selected_column } from "../style_handlers/column_header.js";
import {
    createMousedownListener,
    createClickListener,
    createDblclickListener,
} from "../event_handlers/header_click.js";

import {
    createFocusinListener,
    createFocusoutListener,
} from "../event_handlers/focus.js";
import {
    createKeydownListener,
    createEditClickListener,
} from "../event_handlers/click.js";

import { createModel } from "../model/create.js";
import { createDispatchClickListener } from "../event_handlers/dispatch_click.js";

import {
    addAreaMouseSelection,
    type OnSelectCallback,
} from "../event_handlers/select_region.js";

import { createConsolidatedStyleListener } from "../style_handlers/consolidated.js";

import getCellConfig from "../get_cell_config.js";

import type { View } from "@perspective-dev/client";
import {
    type DatagridPluginElement,
    type SelectedPositionMap,
    type SelectionArea,
    PerspectiveSelectDetail,
} from "../types.js";

import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

interface ToggleColumnSettingsEvent extends CustomEvent {
    detail: {
        column_name: string | null;
        open: boolean;
    };
}

/**
 * Lazy initialize this plugin with various listeners.
 */
export async function activate(
    this: DatagridPluginElement,
    view: View,
): Promise<void> {
    const viewer = this.parentElement as HTMLPerspectiveViewerElement;
    const table = await viewer.getTable();

    if (!this._initialized) {
        this.innerHTML = "";
        if (this.shadowRoot) {
            this.shadowRoot.appendChild(this.regular_table);
        } else {
            this.appendChild(this.regular_table);
        }

        this.model = await createModel.call(
            this,
            this.regular_table,
            table,
            view,
            viewer.getAttribute("theme")!,
        );

        if (!this.model) {
            return;
        }

        const model = this.model;
        const regularTable = this.regular_table;
        const onSelect: OnSelectCallback = async (
            area: SelectionArea,
            isDeselect: boolean,
        ) => {
            if (model._edit_mode !== "SELECT_ROW_TREE") {
                return;
            }

            // Store the selected row identity on the model so it persists
            // even when the selected row scrolls out of the viewport.
            if (isDeselect) {
                model._tree_selection_id = undefined;
            } else {
                const idx = area.y0 - (model._last_window?.start_row ?? 0);
                if (idx >= 0 && idx < model._ids.length) {
                    model._tree_selection_id = model._ids[idx];
                }
            }

            const { row, column_names, config } = await getCellConfig(
                model,
                area.y0,
                0,
            );

            let detail: PerspectiveSelectDetail;
            if (isDeselect) {
                if ((model._last_insert_configs?.length || 0) > 0) {
                    detail = new PerspectiveSelectDetail(
                        false,
                        row,
                        [],
                        model._last_insert_configs ?? [],
                        [],
                    );
                } else {
                    throw new Error("Suprious deselect");
                }

                model._last_insert_configs = undefined;
            } else {
                detail = new PerspectiveSelectDetail(
                    true,
                    row,
                    column_names,
                    model._last_insert_configs ?? [],
                    [config],
                );
                model._last_insert_configs = [config];
            }

            await regularTable.draw({ preserve_width: true });
            viewer.dispatchEvent(
                new CustomEvent<PerspectiveSelectDetail>(
                    "perspective-global-filter",
                    {
                        bubbles: true,
                        composed: true,
                        detail,
                    },
                ),
            );
        };

        addAreaMouseSelection(this, this.regular_table, {
            className: "psp-select-region",
            onSelect,
        });

        // Create shared state map for focus tracking
        const selected_position_map: SelectedPositionMap = new WeakMap();

        this.regular_table.addStyleListener(
            createConsolidatedStyleListener(
                this,
                this.model,
                this.regular_table,
                viewer,
                selected_position_map,
            ),
        );

        this.regular_table.addEventListener(
            "click",
            createClickListener(this.regular_table),
        );

        // User event click
        this.regular_table.addEventListener(
            "click",
            createDispatchClickListener(this.model, this.regular_table, viewer),
        );

        // tree collapse, expand, edit button headers
        this.regular_table.addEventListener(
            "mousedown",
            createMousedownListener(this.model, this.regular_table, viewer),
        );

        this.regular_table.addEventListener(
            "dblclick",
            createDblclickListener(this.model, this.regular_table, viewer),
        );

        // Editing event handlers
        this.regular_table.addEventListener(
            "click",
            createEditClickListener(this.model, this.regular_table, viewer),
        );

        this.regular_table.addEventListener(
            "focusin",
            createFocusinListener(
                this.model,
                this.regular_table,
                viewer,
                selected_position_map,
            ),
        );

        this.regular_table.addEventListener(
            "focusout",
            createFocusoutListener(
                this.model,
                this.regular_table,
                viewer,
                selected_position_map,
            ),
        );

        this.regular_table.addEventListener(
            "keydown",
            createKeydownListener(
                this.model,
                this.regular_table,
                viewer,
                selected_position_map,
            ),
        );

        // viewer event listeners
        viewer.addEventListener(
            "perspective-toggle-column-settings",
            (event: Event) => {
                const toggleEvent = event as ToggleColumnSettingsEvent;
                if (this.isConnected) {
                    style_selected_column(
                        this.model!,
                        this.regular_table,
                        viewer,
                        toggleEvent.detail.column_name ?? undefined,
                    );
                    if (!toggleEvent.detail.open) {
                        this.model!._column_settings_selected_column =
                            undefined;
                        return;
                    }

                    this.model!._column_settings_selected_column =
                        toggleEvent.detail.column_name ?? undefined;
                }
            },
        );

        this._initialized = true;
    } else {
        await createModel.call(
            this,
            this.regular_table,
            table,
            view,
            viewer.getAttribute("theme")!,
            this.model,
        );
    }
}
