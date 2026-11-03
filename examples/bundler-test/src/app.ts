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

/**
 * A downstream app type-checked against the workspace packages by `build`, and
 * against the packed tarballs by `tools/scripts/test_consumers.mjs`.
 */
import type {
    Client,
    InitOptions as ClientInitOptions,
    Table,
    WasmRegistration,
} from "@perspective-dev/client";
import {
    init,
    type HTMLPerspectiveViewerElement,
    type InitOptions,
    type ViewerConfigUpdate,
} from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { DuckDBHandler } from "@perspective-dev/client/virtual_servers/duckdb";
import type { ClickhouseHandler } from "@perspective-dev/client/virtual_servers/clickhouse";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const not_any: [
    IsAny<ClientInitOptions>,
    IsAny<InitOptions>,
    IsAny<WasmRegistration>,
    IsAny<ViewerConfigUpdate>,
    IsAny<Table>,
    IsAny<DuckDBHandler>,
    IsAny<ClickhouseHandler>,
] = [false, false, false, false, false, false, false];

export async function main(
    el: HTMLPerspectiveViewerElement,
    client: Client,
    config: ViewerConfigUpdate,
    wasm: WasmRegistration,
    options: InitOptions & ClientInitOptions,
): Promise<Table> {
    await init(wasm, options);
    const table = await client.table("a,b\n1,2");
    await el.load(table);
    await el.restore(config);
    return table;
}

export const components = [PerspectiveViewer] as const;
