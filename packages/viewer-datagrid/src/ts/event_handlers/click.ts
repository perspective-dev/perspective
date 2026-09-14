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

import * as edit_click from "./click/edit_click.js";
import * as edit_keydown from "./keydown/edit_keydown.js";
import type { DatagridModel, SelectedPositionMap } from "../types.js";
import { isEditableMode } from "../types.js";
import { RegularTableElement } from "regular-table";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

export function createKeydownListener(
    model: DatagridModel,
    table: RegularTableElement,
    viewer: HTMLPerspectiveViewerElement,
    selected_position_map: SelectedPositionMap,
): EventListener {
    return (event: Event): void => {
        const keyEvent = event as KeyboardEvent;
        if (model._edit_mode === "EDIT") {
            if (!isEditableMode(model, viewer)) {
                return;
            }

            edit_keydown.keydownListener(
                model,
                table,
                viewer,
                selected_position_map,
                keyEvent,
            );
        }
    };
}

export function createEditClickListener(
    model: DatagridModel,
    table: RegularTableElement,
    viewer: HTMLPerspectiveViewerElement,
): EventListener {
    return (event: Event): void => {
        const mouseEvent = event as MouseEvent;
        if (model._edit_mode === "EDIT") {
            if (!isEditableMode(model, viewer)) {
                return;
            }

            edit_click.clickListener(model, table, viewer, mouseEvent);
        }
    };
}
