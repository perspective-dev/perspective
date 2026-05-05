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

import { sortHandler } from "./sort.js";
import { expandCollapseHandler } from "./expand_collapse.js";
import type { RegularTable, DatagridModel } from "../types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

export function createMousedownListener(
    model: DatagridModel,
    regularTable: RegularTable,
    viewer: HTMLPerspectiveViewerElement,
): EventListener {
    return async (event: Event): Promise<void> => {
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.which !== 1) {
            return;
        }

        let target = mouseEvent.target as HTMLElement | null;
        if (target?.tagName === "A") {
            return;
        }

        while (target && target.tagName !== "TD" && target.tagName !== "TH") {
            target = target.parentElement;
            if (!target || !regularTable.contains(target)) {
                return;
            }
        }

        if (!target) {
            return;
        }

        if (target.classList.contains("psp-tree-label")) {
            if (model._edit_mode !== "SELECT_ROW_TREE") {
                expandCollapseHandler(model, regularTable, mouseEvent);
            }

            return;
        }

        if (target.classList.contains("psp-menu-enabled")) {
            const meta = regularTable.getMeta(target);
            const column_name =
                meta?.column_header?.[model._config.split_by.length];
            await viewer.toggleColumnSettings(`${column_name}`);
        } else if (target.classList.contains("psp-sort-enabled")) {
            sortHandler(model, regularTable, viewer, mouseEvent, target);
        }
    };
}

export function createDblclickListener(
    model: DatagridModel,
    regularTable: RegularTable,
    viewer: HTMLPerspectiveViewerElement,
): EventListener {
    return async (event: Event): Promise<void> => {
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.which !== 1) {
            return;
        }

        let target = mouseEvent.target as HTMLElement | null;
        if (target?.tagName === "A") {
            return;
        }

        while (target && target.tagName !== "TD" && target.tagName !== "TH") {
            target = target.parentElement;
            if (!target || !regularTable.contains(target)) {
                return;
            }
        }

        if (!target) {
            return;
        }

        if (target.classList.contains("psp-tree-label")) {
            if (model._edit_mode === "SELECT_ROW_TREE") {
                expandCollapseHandler(model, regularTable, mouseEvent);
            }
        }
    };
}

export function createClickListener(regularTable: RegularTable): EventListener {
    return (event: Event): void => {
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.which !== 1) {
            return;
        }

        let target = mouseEvent.target as HTMLElement | null;
        while (target && target.tagName !== "TD" && target.tagName !== "TH") {
            target = target.parentElement;
            if (!target || !regularTable.contains(target)) {
                return;
            }
        }

        if (!target) {
            return;
        }

        if (
            target.classList.contains("psp-tree-label") &&
            mouseEvent.offsetX < 26
        ) {
            mouseEvent.stopImmediatePropagation();
        } else if (
            target.classList.contains("psp-header-leaf") &&
            !target.classList.contains("psp-header-corner")
        ) {
            mouseEvent.stopImmediatePropagation();
        }
    };
}
