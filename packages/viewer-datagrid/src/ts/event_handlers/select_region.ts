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
import type {
    DatagridPluginElement,
    EditMode,
    SelectionArea,
} from "../types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";
import type { ViewWindow } from "@perspective-dev/client";
import type { CellMetadataBody } from "regular-table/dist/esm/types.js";

const MOUSE_SELECTED_AREA_CLASS = "mouse-selected-area";

export type OnSelectCallback = (
    area: SelectionArea,
    isDeselect: boolean,
) => void;

interface AddAreaMouseSelectionOptions {
    className?: string;
    selected?: SelectionArea[];
    onSelect?: OnSelectCallback;
}

export const addAreaMouseSelection = (
    datagrid: DatagridPluginElement,
    table: RegularTableElement,
    {
        className = MOUSE_SELECTED_AREA_CLASS,
        selected = [],
        onSelect,
    }: AddAreaMouseSelectionOptions = {},
): RegularTableElement => {
    datagrid.model!._selection_state = {
        selected_areas: selected,
        dirty: true,
    };

    table.addEventListener(
        "mousedown",
        getMousedownListener(datagrid, table, className),
    );

    table.addEventListener(
        "mouseover",
        getMouseoverListener(datagrid, table, className),
    );

    table.addEventListener(
        "mouseup",
        getMouseupListener(datagrid, table, className, onSelect),
    );

    table.addStyleListener(() =>
        applyMouseAreaSelections(datagrid, table, className),
    );

    return table;
};

function isSingleClickMode(mode: EditMode): boolean {
    return mode === "SELECT_ROW_TREE";
}

const getMousedownListener =
    (
        datagrid: DatagridPluginElement,
        table: RegularTableElement,
        className: string,
    ) =>
    (event: Event): void => {
        const mouseEvent = event as MouseEvent;
        if (
            mouseEvent.button === 0 &&
            isSelectionMode(datagrid.model!._edit_mode)
        ) {
            if (isSingleClickMode(datagrid.model!._edit_mode)) {
                return;
            }

            datagrid.model!._selection_state.CURRENT_MOUSEDOWN_COORDINATES = {};
            const meta = table.getMeta(mouseEvent.target as HTMLElement);
            if (
                meta?.type === "body" &&
                meta.x !== undefined &&
                meta.y !== undefined
            ) {
                datagrid.model!._selection_state.CURRENT_MOUSEDOWN_COORDINATES =
                    {
                        x: meta.x,
                        y: meta.y,
                    };

                datagrid.model!._selection_state.old_selected_areas =
                    datagrid.model!._selection_state.selected_areas;
                datagrid.model!._selection_state.selected_areas = [];

                const start: SelectionArea = {
                    x0: meta.x,
                    x1: meta.x,
                    y0: meta.y,
                    y1: meta.y,
                };
                datagrid.model!._selection_state.potential_selection = start;
                applyMouseAreaSelections(
                    datagrid,
                    table,
                    className,
                    datagrid.model!._selection_state.selected_areas.concat([
                        start,
                    ]),
                );

                return;
            }
        }

        datagrid.model!._selection_state.selected_areas = [];
    };

const getMouseoverListener =
    (
        datagrid: DatagridPluginElement,
        table: RegularTableElement,
        className: string,
    ) =>
    (event: Event): void => {
        const mouseEvent = event as MouseEvent;
        const mode = datagrid.model!._edit_mode;
        if (isSelectionMode(mode) && !isSingleClickMode(mode)) {
            if (
                datagrid.model!._selection_state
                    .CURRENT_MOUSEDOWN_COORDINATES &&
                datagrid.model!._selection_state.CURRENT_MOUSEDOWN_COORDINATES
                    .x !== undefined
            ) {
                const meta = table.getMeta(mouseEvent.target as HTMLElement);
                if (
                    meta?.type === "body" &&
                    meta.x !== undefined &&
                    meta.y !== undefined
                ) {
                    const potentialSelection: SelectionArea = {
                        x0: Math.min(
                            meta.x,
                            datagrid.model!._selection_state
                                .CURRENT_MOUSEDOWN_COORDINATES.x!,
                        ),
                        x1: Math.max(
                            meta.x,
                            datagrid.model!._selection_state
                                .CURRENT_MOUSEDOWN_COORDINATES.x!,
                        ),
                        y0: Math.min(
                            meta.y,
                            datagrid.model!._selection_state
                                .CURRENT_MOUSEDOWN_COORDINATES.y!,
                        ),
                        y1: Math.max(
                            meta.y,
                            datagrid.model!._selection_state
                                .CURRENT_MOUSEDOWN_COORDINATES.y!,
                        ),
                    };

                    datagrid.model!._selection_state.potential_selection =
                        potentialSelection;

                    applyMouseAreaSelections(
                        datagrid,
                        table,
                        className,
                        datagrid.model!._selection_state.selected_areas.concat([
                            potentialSelection,
                        ]),
                    );
                }
            }
        }
    };

const getMouseupListener =
    (
        datagrid: DatagridPluginElement,
        table: RegularTableElement,
        className: string,
        onSelect?: OnSelectCallback,
    ) =>
    (event: Event): void => {
        const mouseEvent = event as MouseEvent;
        const mode = datagrid.model!._edit_mode;
        if (isSelectionMode(mode)) {
            const meta = table.getMeta(mouseEvent.target as HTMLElement);
            if (!meta) {
                return;
            }

            // For single-click modes (SELECT_ROW_TREE), handle toggle
            if (isSingleClickMode(mode)) {
                if (
                    (meta.type === "body" || meta.type === "row_header") &&
                    meta.y !== undefined &&
                    meta.y >= 0
                ) {
                    const existing =
                        datagrid.model!._selection_state.selected_areas;
                    const isSameRow =
                        existing.length > 0 && existing[0].y0 === meta.y;

                    if (isSameRow) {
                        // Deselect
                        datagrid.model!._selection_state.selected_areas = [];
                        datagrid.model!._selection_state.dirty = true;
                        applyMouseAreaSelections(
                            datagrid,
                            table,
                            className,
                            [],
                        );
                        onSelect?.(existing[0], true);
                    } else {
                        // Select new row
                        const area: SelectionArea = {
                            x0: 0,
                            x1: 0,
                            y0: meta.y,
                            y1: meta.y,
                        };
                        datagrid.model!._selection_state.selected_areas = [
                            area,
                        ];
                        datagrid.model!._selection_state.dirty = true;
                        applyMouseAreaSelections(datagrid, table, className);
                        onSelect?.(area, false);
                    }
                }

                datagrid.model!._selection_state.CURRENT_MOUSEDOWN_COORDINATES =
                    {};
                datagrid.model!._selection_state.potential_selection =
                    undefined;
                return;
            }

            // Drag-based modes (SELECT_ROW, SELECT_COLUMN, SELECT_REGION)
            if (
                (datagrid.model!._selection_state.old_selected_areas?.length ??
                    0) > 0
            ) {
                const selected =
                    datagrid.model!._selection_state.old_selected_areas![0];
                if (
                    selected.x0 === selected.x1 &&
                    selected.y0 === selected.y1 &&
                    meta?.type === "body" &&
                    selected.x0 === meta.x &&
                    selected.y0 === meta.y
                ) {
                    datagrid.model!._selection_state.selected_areas = [];
                    datagrid.model!._selection_state.old_selected_areas = [];
                    datagrid.model!._selection_state.CURRENT_MOUSEDOWN_COORDINATES =
                        {};
                    datagrid.model!._selection_state.potential_selection =
                        undefined;
                    applyMouseAreaSelections(datagrid, table, className, []);
                    return;
                }
            }

            datagrid.model!._selection_state.old_selected_areas = [];

            if (
                datagrid.model!._selection_state
                    .CURRENT_MOUSEDOWN_COORDINATES &&
                datagrid.model!._selection_state.CURRENT_MOUSEDOWN_COORDINATES
                    .x !== undefined &&
                meta?.type === "body" &&
                meta.x !== undefined &&
                meta.y !== undefined
            ) {
                const selection: SelectionArea = {
                    x0: Math.min(
                        meta.x,
                        datagrid.model!._selection_state
                            .CURRENT_MOUSEDOWN_COORDINATES.x!,
                    ),
                    x1: Math.max(
                        meta.x,
                        datagrid.model!._selection_state
                            .CURRENT_MOUSEDOWN_COORDINATES.x!,
                    ),
                    y0: Math.min(
                        meta.y,
                        datagrid.model!._selection_state
                            .CURRENT_MOUSEDOWN_COORDINATES.y!,
                    ),
                    y1: Math.max(
                        meta.y,
                        datagrid.model!._selection_state
                            .CURRENT_MOUSEDOWN_COORDINATES.y!,
                    ),
                };
                datagrid.model!._selection_state.selected_areas.push(selection);
                applyMouseAreaSelections(datagrid, table, className);
            }

            datagrid.model!._selection_state.CURRENT_MOUSEDOWN_COORDINATES = {};
            datagrid.model!._selection_state.potential_selection = undefined;
        }
    };

function modeIncludesColumns(mode: EditMode): boolean {
    return mode === "SELECT_COLUMN" || mode === "SELECT_REGION";
}

function modeIncludesRows(mode: EditMode): boolean {
    return (
        mode === "SELECT_ROW" ||
        mode === "SELECT_REGION" ||
        mode === "SELECT_ROW_TREE"
    );
}

function set_psp_selection(
    viewer: HTMLPerspectiveViewerElement,
    datagrid: DatagridPluginElement,
    { x0, x1, y0, y1 }: SelectionArea,
): void {
    const viewport: ViewWindow = {};
    const mode = datagrid.model!._edit_mode;
    if (x0 !== undefined && modeIncludesColumns(mode)) {
        viewport.start_col = x0;
    }

    if (x1 !== undefined && modeIncludesColumns(mode)) {
        viewport.end_col = x1 + 1;
    }

    if (y0 !== undefined && modeIncludesRows(mode)) {
        viewport.start_row = y0;
    }

    if (y1 !== undefined && modeIncludesRows(mode)) {
        viewport.end_row = y1 + 1;
    }

    viewer.setSelection(viewport);
}

type CellPredicate = (meta: CellMetadataBody, area: SelectionArea) => boolean;

const SELECTION_PREDICATES: Record<string, CellPredicate> = {
    SELECT_REGION: (m, a) =>
        a.x0 <= m.x && m.x <= a.x1 && a.y0 <= m.y && m.y <= a.y1,
    SELECT_ROW: (m, a) => a.y0 <= m.y && m.y <= a.y1,
    SELECT_ROW_TREE: (m, a) => a.y0 <= m.y && m.y <= a.y1,
    SELECT_COLUMN: (m, a) => a.x0 <= m.x && m.x <= a.x1,
};

function isSelectionMode(mode: EditMode): boolean {
    return (
        mode === "SELECT_REGION" ||
        mode === "SELECT_ROW" ||
        mode === "SELECT_COLUMN" ||
        mode === "SELECT_ROW_TREE"
    );
}

export const applyMouseAreaSelections = (
    datagrid: DatagridPluginElement,
    table: RegularTableElement,
    className: string,
    selected?: SelectionArea[],
): void => {
    const mode = datagrid.model!._edit_mode;
    if (isSelectionMode(mode)) {
        selected = datagrid.model!._selection_state.selected_areas.slice(0);
        if (datagrid.model!._selection_state.potential_selection) {
            selected.push(datagrid.model!._selection_state.potential_selection);
        }

        if (selected.length > 0) {
            set_psp_selection(
                datagrid.parentElement as HTMLPerspectiveViewerElement,
                datagrid,
                selected[0],
            );

            // SELECT_ROW_TREE styling is handled entirely by the
            // identity-based system in body.ts, which styles both td
            // and th uniformly in a single draw pass.
            if (!isSingleClickMode(mode)) {
                applyMouseAreaSelection(datagrid, table, selected, className);
            }
        } else {
            (
                datagrid.parentElement as HTMLPerspectiveViewerElement
            ).setSelection();
            const tds = table.querySelectorAll("tbody td");
            for (const td of tds) {
                td.classList.remove(className);
            }
        }
    } else if (datagrid.model!._selection_state.dirty) {
        datagrid.model!._selection_state.dirty = false;
        const cells = table.querySelectorAll("tbody td, tbody th");
        for (const cell of cells) {
            cell.classList.remove(className);
        }
    }
};

const applyMouseAreaSelection = (
    datagrid: DatagridPluginElement,
    table: RegularTableElement,
    selected: SelectionArea[],
    className: string,
): void => {
    const predicate = SELECTION_PREDICATES[datagrid.model!._edit_mode];
    if (!predicate || selected.length === 0) {
        return;
    }

    const tds = table.querySelectorAll("tbody td");
    for (const td of tds) {
        const meta = table.getMeta(td as HTMLElement);
        if (!meta || meta.type !== "body") {
            continue;
        }

        let rendered = false;
        for (const area of selected) {
            if (
                area.x0 !== undefined &&
                area.y0 !== undefined &&
                area.x1 !== undefined &&
                area.y1 !== undefined &&
                predicate(meta, area)
            ) {
                rendered = true;
                datagrid.model!._selection_state.dirty = true;
                td.classList.add(className);
            }
        }

        if (!rendered) {
            td.classList.remove(className);
        }
    }
};
