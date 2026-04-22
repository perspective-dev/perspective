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

import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";

import "@perspective-dev/viewer/dist/css/themes.css";
import "@perspective-dev/viewer/dist/css/pro.css";

// @ts-ignore
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";

// @ts-ignore
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

import { DuckDBHandler } from "@perspective-dev/client/dist/esm/virtual_servers/duckdb.js";
import * as duckdb from "@duckdb/duckdb-wasm";

// @ts-ignore
import SUPERSTORE_ARROW from "superstore-arrow/superstore.lz4.arrow";

await Promise.all([
    // @ts-ignore
    perspective.init_server(fetch(SERVER_WASM)),
    // @ts-ignore
    perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);

async function initializeDuckDB() {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
            type: "text/javascript",
        }),
    );

    const duckdb_worker = new Worker(worker_url);
    const logger = new duckdb.VoidLogger();
    const db = new duckdb.AsyncDuckDB(logger, duckdb_worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    const conn = await db.connect();
    await conn.query(`
        SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;
    `);

    console.log("DuckDB initialized");
    return conn;
}

async function loadSampleData(db: duckdb.AsyncDuckDBConnection) {
    try {
        const response = await fetch(SUPERSTORE_ARROW);
        const arrayBuffer = await response.arrayBuffer();
        await db.insertArrowFromIPCStream(new Uint8Array(arrayBuffer), {
            name: "data_source_one",
            create: true,
        });
    } catch (error) {
        console.error("Error loading Arrow data:", error);
    }
}

const db = await initializeDuckDB();
await perspective.init_client(fetch(CLIENT_WASM));
await loadSampleData(db);
const server = perspective.createMessageHandler(new DuckDBHandler(db));
const client = await perspective.worker(server);

const viewer = document.querySelector("perspective-viewer")!;
viewer.load(client);
viewer.restore({
    table: "memory.data_source_one",
    group_by: ["State"],
});
