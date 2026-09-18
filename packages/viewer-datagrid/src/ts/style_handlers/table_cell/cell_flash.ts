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

import { CellMetadataBody } from "regular-table/dist/esm/types.js";
import type { DatagridModel, ColorRecord } from "../../types.js";

export function style_cell_flash(
    model: DatagridModel,
    metadata: CellMetadataBody,
    td: HTMLElement,
    [, , , , , pos_s, pos_e]: ColorRecord,
    [, , , , , neg_s, neg_e]: ColorRecord,
): void {
    const id = model._ids?.[metadata.dy ?? 0]?.join("|");
    const metadata_path = model._column_paths[metadata.x];

    if (
        model.last_reverse_columns?.has(metadata_path) &&
        model.last_reverse_ids?.has(id)
    ) {
        const row_idx = model.last_reverse_ids?.get(id);
        const col_idx = model.last_reverse_columns.get(metadata_path);
        if (!model._is_old_viewport) {
            td.style.animation = "";
        } else if (
            col_idx !== undefined &&
            row_idx !== undefined &&
            (model.last_meta?.[col_idx]?.[row_idx] as number | undefined) !==
                undefined &&
            (model.last_meta![col_idx]![row_idx] as number) >
                ((metadata.user ?? 0) as number)
        ) {
            td.style.setProperty("--pulse--background-color-start", neg_s);
            td.style.setProperty("--pulse--background-color-end", neg_e);
            if (td.style.animationName === "pulse_neg") {
                td.style.animation = "pulse_neg2 0.5s linear";
            } else {
                td.style.animation = "pulse_neg 0.5s linear";
            }
        } else if (
            col_idx !== undefined &&
            row_idx !== undefined &&
            (model.last_meta?.[col_idx]?.[row_idx] as number | undefined) !==
                undefined &&
            (model.last_meta![col_idx]![row_idx] as number) <
                ((metadata.user ?? 0) as number)
        ) {
            td.style.setProperty("--pulse--background-color-start", pos_s);
            td.style.setProperty("--pulse--background-color-end", pos_e);
            if (td.style.animationName === "pulse_pos") {
                td.style.animation = "pulse_pos2 0.5s linear";
            } else {
                td.style.animation = "pulse_pos 0.5s linear";
            }
        } else if (row_idx !== metadata.dy) {
            td.style.animation = "";
        }
    } else {
        td.style.animation = "";
    }
}
