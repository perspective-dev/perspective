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

import { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";
import type {
    DatagridModel,
    DatagridPluginElement,
    EditMode,
} from "../types.js";

export const EDIT_MODES: readonly EditMode[] = [
    "READ_ONLY",
    "EDIT",
    "SELECT_ROW",
    "SELECT_COLUMN",
    "SELECT_REGION",
    "SELECT_ROW_TREE",
] as const;

function isSelectRowTreeAvailable(model?: DatagridModel): boolean {
    if (!model) {
        return false;
    }

    return (
        model._config.group_by.length > 0 &&
        model._config.group_rollup_mode !== "flat"
    );
}

export function toggle_edit_mode(
    this: DatagridPluginElement,
    mode?: EditMode,
): void {
    if (typeof mode === "undefined") {
        let idx = EDIT_MODES.indexOf(this._edit_mode);
        do {
            idx = (idx + 1) % EDIT_MODES.length;
        } while (
            EDIT_MODES[idx] === "SELECT_ROW_TREE" &&
            !isSelectRowTreeAvailable(this.model)
        );

        mode = EDIT_MODES[idx];
    }

    (this.parentElement as HTMLPerspectiveViewerElement)?.setSelection?.();
    this._edit_mode = mode;
    if (this.model) {
        this.model._edit_mode = mode;
        this.model._tree_selection_id = undefined;
        this.model._selection_state = {
            selected_areas: [],
            dirty: true,
        };
    }

    (this.parentElement as HTMLPerspectiveViewerElement)?.restore?.({
        plugin_config: { edit_mode: mode },
    });

    if (this._edit_button !== undefined) {
        this._edit_button.dataset.editMode = mode;
    }
}

export function toggle_scroll_lock(
    this: DatagridPluginElement,
    force?: boolean,
): void {
    if (typeof force === "undefined") {
        force = !this._is_scroll_lock;
    }

    this._is_scroll_lock = force;
    this.classList.toggle("sub-cell-scroll-disabled", force);
    if (this._scroll_lock !== undefined) {
        this._scroll_lock.classList.toggle("lock-scroll", force);
    }
}
