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

import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

import * as duckdb from "@duckdb/duckdb-wasm";

import { test } from "@perspective-dev/test";
import {
    default as perspective,
    createMessageHandler,
    wasmModule,
} from "@perspective-dev/client";
import { DuckDBHandler } from "@perspective-dev/client/src/ts/virtual_servers/duckdb.ts";

const require = createRequire(import.meta.url);
const DUCKDB_DIST = path.dirname(require.resolve("@duckdb/duckdb-wasm"));
const Worker = require("web-worker");

async function initializeDuckDB() {
    const bundle = await duckdb.selectBundle({
        mvp: {
            mainModule: path.resolve(DUCKDB_DIST, "./duckdb-mvp.wasm"),
            mainWorker: path.resolve(
                DUCKDB_DIST,
                "./duckdb-node-mvp.worker.cjs",
            ),
        },
        eh: {
            mainModule: path.resolve(DUCKDB_DIST, "./duckdb-eh.wasm"),
            mainWorker: path.resolve(
                DUCKDB_DIST,
                "./duckdb-node-eh.worker.cjs",
            ),
        },
    });

    const logger = new duckdb.ConsoleLogger();
    const worker = new Worker(bundle.mainWorker);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const c = await db.connect();
    await c.query(`
        SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;
    `);

    return c;
}

async function loadSuperstoreData(db) {
    const arrowPath = path.resolve(
        import.meta.dirname,
        "../../../node_modules/superstore-arrow/superstore.lz4.arrow",
    );

    const arrayBuffer = fs.readFileSync(arrowPath);
    await db.insertArrowFromIPCStream(new Uint8Array(arrayBuffer), {
        name: "superstore",
        create: true,
    });
}

// Column names AND values contain underscores, which DuckDB's `PIVOT` uses
// as its own output-name separator. https://github.com/perspective-dev/perspective/issues/3187
async function loadUnderscoreData(db) {
    await db.query(`
        CREATE TABLE underscore_test (
            region_name VARCHAR,
            sub_region VARCHAR,
            account_number INTEGER,
            total_sales DOUBLE
        );
    `);

    await db.query(`
        INSERT INTO underscore_test VALUES
            ('east_coast', 'new_york', 1, 100.5),
            ('east_coast', 'new_jersey', 2, 200.25),
            ('west_coast', 'bay_area', 3, 300.75),
            ('west_coast', 'la_metro', 4, 400.0);
    `);
}

export function describeDuckDB(name, fn) {
    test.describe("DuckDB Virtual Server " + name, function () {
        let db;
        let client;

        test.beforeAll(async () => {
            db = await initializeDuckDB();
            const server = createMessageHandler(
                new DuckDBHandler(db, wasmModule),
            );
            client = await perspective.worker(server);
            await loadSuperstoreData(db);
            await loadUnderscoreData(db);
        });

        fn(() => client);
    });
}
