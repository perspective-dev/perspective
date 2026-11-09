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

import type { Filter, Scalar } from "@perspective-dev/client";
import type { PerspectiveHit } from "@perspective-dev/viewer";
import type { CellMetadataColumnHeader } from "regular-table/dist/esm/types.js";
import getCellConfig from "../get_cell_config.ts";
import type { DatagridModel, DatagridPluginElement } from "../types.ts";

function column_header_hit(
    model: DatagridModel,
    meta: CellMetadataColumnHeader,
): PerspectiveHit {
    const split_by = model._config.split_by;
    const depth = Math.min(meta.column_header_y + 1, split_by.length);
    const column_path = split_by
        .slice(0, depth)
        .map(
            (_, level) =>
                (model._column_path_area[level]?.[meta.x] ?? null) as Scalar,
        );

    const name = model._column_path_area[split_by.length]?.[meta.x];
    const is_leaf = meta.column_header_y >= split_by.length;
    const split_filters = column_path.flatMap((value, level): Filter[] =>
        value === null ? [] : [[split_by[level], "==", value]],
    );

    return {
        kind: "column_header",
        row: {},
        column_names: is_leaf && name != null ? [String(name)] : [],
        row_path: [],
        column_path,
        config: { filter: model._config.filter.concat(split_filters) },
    };
}

/**
 * Describe the cell or header rendered at a viewport point.
 */
export async function hit_test(
    this: DatagridPluginElement,
    x: number,
    y: number,
): Promise<PerspectiveHit | undefined> {
    const model = this.model;
    const cell = this.shadowRoot?.elementFromPoint(x, y)?.closest("td, th");
    if (!model || !cell || !this.regular_table.contains(cell)) {
        return undefined;
    }

    const meta = this.regular_table.getMeta(cell as HTMLElement);
    if (meta?.type === "body") {
        const result = await getCellConfig(model, meta.y, meta.x);
        return { kind: "cell", ...result };
    } else if (meta?.type === "row_header") {
        const result = await getCellConfig(model, meta.y, undefined);
        return { kind: "row_header", ...result };
    } else if (meta?.type === "column_header") {
        return column_header_hit(model, meta);
    }

    return undefined;
}
