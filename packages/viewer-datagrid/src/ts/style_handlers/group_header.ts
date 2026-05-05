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

/**
 * Apply styles to group header rows.
 */
export function applyGroupHeaderStyles(
    model: DatagridModel,
    headerRows: CollectedHeaderRow[],
    regularTable: RegularTableElement,
): void {
    const header_depth = model._config.group_by.length;
    const m: boolean[][] = [];
    let marked = new Set<number>();

    for (let y = 0; y < headerRows.length; y++) {
        const { cells } = headerRows[y];
        const tops = new Set<number>();

        for (let x = 0; x < cells.length; x++) {
            const { element: td, metadata } = cells[x];
            if (!metadata) {
                continue;
            }

            td.style.backgroundColor = "";

            const needs_border =
                (metadata.type === "corner" &&
                    header_depth > 0 &&
                    metadata.row_header_x === header_depth) ||
                (metadata.type === "column_header" && metadata.x >= 0);

            td.classList.toggle("psp-align-right", false);
            td.classList.toggle("psp-align-left", false);
            td.classList.toggle("psp-header-group", true);
            td.classList.toggle("psp-header-leaf", false);
            td.classList.toggle("psp-header-border", needs_border);
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
            td.classList.toggle("psp-sort-enabled", false);

            // Calculate spanning for psp-is-top
            let xx = x;
            for (; m[y] && m[y][xx]; ++xx) {}

            tops.add(xx);

            const cell = td;
            for (let tx = xx; tx < xx + cell.colSpan; ++tx) {
                for (let ty = y; ty < y + cell.rowSpan; ++ty) {
                    if (!m[ty]) {
                        m[ty] = [];
                    }

                    m[ty][tx] = true;
                }
            }

            cell.classList.toggle("psp-is-top", y === 0 || !marked.has(xx));
        }

        marked = tops;
    }
}
