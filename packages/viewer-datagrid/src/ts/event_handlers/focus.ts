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

import { write_cell } from "./click/edit_click.js";
import {
    release_cell_editable,
    ensure_editable_for_focus,
} from "./edit_focus.js";
import type {
    RegularTable,
    DatagridModel,
    SelectedPosition,
    SelectedPositionMap,
} from "../types.js";
import { isEditableMode } from "../types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

export function createFocusoutListener(
    model: DatagridModel,
    table: RegularTable,
    viewer: HTMLPerspectiveViewerElement,
    selected_position_map: SelectedPositionMap,
): EventListener {
    return (event: Event): void => {
        const focusEvent = event as FocusEvent;
        const target = focusEvent.target as HTMLElement;
        let refocused = false;
        if (isEditableMode(model, viewer) && selected_position_map.has(table)) {
            target.classList.remove("psp-error");
            const selectedPosition = selected_position_map.get(table)!;
            selected_position_map.delete(table);
            if (selectedPosition.content !== target.textContent) {
                if (!write_cell(table, model, target)) {
                    target.textContent = selectedPosition.content || "";
                    target.classList.add("psp-error");
                    target.focus();
                    refocused = true;
                }
            }
        }

        if (!refocused && target?.hasAttribute?.("contenteditable")) {
            release_cell_editable(table, target);
        }
    };
}

export function createFocusinListener(
    model: DatagridModel,
    table: RegularTable,
    _viewer: HTMLPerspectiveViewerElement,
    selected_position_map: SelectedPositionMap,
): EventListener {
    return (event: Event): void => {
        const focusEvent = event as FocusEvent;
        const target = focusEvent.target as HTMLElement;
        ensure_editable_for_focus(model, table, target);
        const meta = table.getMeta(target);
        if (meta?.type === "body") {
            const new_state: SelectedPosition = {
                x: meta.x,
                y: meta.y,
                content: target.textContent || undefined,
            };
            selected_position_map.set(table, new_state);
        }
    };
}
