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

import "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
import "/node_modules/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
import "/node_modules/@perspective-dev/viewer-d3fc/dist/cdn/perspective-viewer-d3fc.js";

import perspective from "/node_modules/@perspective-dev/client/dist/cdn/perspective.js";
import { DuckDBHandler } from "/node_modules/@perspective-dev/client/dist/esm/virtual_servers/duckdb.js";

// Need to use jsDelivr's ESM features to load this as packaged.
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev18.0/+esm";

const LOGGER = {
    log(entry) {
        // table2.update([{ timestamp: entry.timestamp, sql: entry.value }]);
    },
};

const db = await initializeDuckDB();
const server = perspective.createMessageHandler(new DuckDBHandler(db));
const client = await perspective.worker(server);

// const logworker = await perspective.worker();
// const table2 = await logworker.table(
//     { timestamp: "datetime", sql: "string" },
//     { name: "logs", limit: 10_000 },
// );

// const log_element = document.querySelector("#logger");
// log_element.load(logworker);
// log_element.restore({
//     table: "logs",
//     sort: [["timestamp", "desc"]],
//     title: "SQL Log",
// });

// const log_element2 = document.querySelector("#logger2");
// log_element2.load(logworker);
// log_element2.restore({
//     table: "logs",
//     sort: [["timestamp", "desc"]],
//     columns: ["sql"],
//     group_by: ["1s"],
//     plugin: "Y Bar",
//     expressions: { "1s": `bucket("timestamp",'1s')` },
//     title: "SQL Timeline",
// });

async function initializeDuckDB() {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
            type: "text/javascript",
        }),
    );

    const duckdb_worker = new Worker(worker_url);
    const db = new duckdb.AsyncDuckDB(LOGGER, duckdb_worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    const conn = await db.connect();
    return conn;
}

async function loadSampleData(db) {
    const response = await fetch(
        "/node_modules/superstore-arrow/superstore.lz4.arrow",
    );

    const text = await response.arrayBuffer();
    await db.insertArrowFromIPCStream(new Uint8Array(text), {
        name: "data_source_one",
        create: true,
    });
}

await loadSampleData(db);

const viewer = document.querySelector("#query");
viewer.load(client);
viewer.restore({
    table: "data_source_one",
    group_by: ["Region", "State", "City"],
    columns: ["Sales", "Profit", "Quantity", "Discount"],
    plugin: "Datagrid",
    theme: "Pro Dark",
    settings: true,
});
