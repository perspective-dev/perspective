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

import type {
    PerspectiveHitRef,
    PerspectiveHitTest,
    PerspectiveViewFrame,
} from "@perspective-dev/viewer";
import type { CellMetadata } from "regular-table/dist/esm/types.js";
import type { DatagridModel, DatagridPluginElement } from "../types.ts";

/**
 * The cell or header rendered at a viewport point, as a one-cell frame built
 * from what the table holds for it.
 */
export async function hit_test(
    this: DatagridPluginElement,
    x: number,
    y: number,
): Promise<PerspectiveHitTest | undefined> {
    const model = this.model;
    const cell = this.shadowRoot?.elementFromPoint(x, y)?.closest("td, th");
    if (!model || !cell || !this.regular_table.contains(cell)) {
        return undefined;
    }

    const meta = this.regular_table.getMeta(cell as HTMLElement);
    const is_command_column = (x: number) => x >= model._column_paths.length;
    if (meta?.type === "body") {
        const ref = is_command_column(meta.x)
            ? { y: meta.y }
            : { y: meta.y, x: meta.x };

        return { frame: frame_at(model, meta, ref), ref };
    } else if (meta?.type === "row_header") {
        const ref = { y: meta.y };
        return { frame: frame_at(model, meta, ref), ref };
    } else if (meta?.type === "column_header" && !is_command_column(meta.x)) {
        const ref = { x: meta.x };
        return { frame: frame_at(model, meta, ref), ref };
    }

    return undefined;
}

/**
 * A frame covering only `ref`, from the row's id, the column's path and the
 * cell's value as the table drew them.
 */
function frame_at(
    model: DatagridModel,
    meta: CellMetadata,
    ref: PerspectiveHitRef,
): PerspectiveViewFrame {
    const x = ref.x ?? 0;
    const path = model._column_paths[x];
    const data: Record<string, unknown[]> = {};
    if (ref.y !== undefined) {
        const id = model._ids[ref.y - meta.y0];
        data.__ID__ = [id];
        if (model._config.group_by.length > 0) {
            data.__ROW_PATH__ = [id];
        }

        if (ref.x !== undefined && path !== undefined) {
            data[path] = [meta.user];
        }
    }

    return {
        start_row: ref.y ?? 0,
        start_col: x,
        paths: path === undefined ? [] : [path],
        column_paths: model._column_path_area.map((level) => [
            level[x] ?? null,
        ]) as PerspectiveViewFrame["column_paths"],
        data,
    };
}
