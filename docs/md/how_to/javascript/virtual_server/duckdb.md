# DuckDB Virtual Server

Perspective provides a built-in virtual server for
[DuckDB](https://duckdb.org/), allowing `<perspective-viewer>` to query
DuckDB-WASM databases directly in the browser.

For server-side Python usage, see the
[Python DuckDB guide](../../python/virtual_server/duckdb.md).

## Installation

```bash
npm install @perspective-dev/client @perspective-dev/viewer @duckdb/duckdb-wasm
```

## Usage

Initialize DuckDB-WASM, load data, and connect it to a Perspective viewer:

`DuckDBHandler` is an optional submodule and is _not_ exported from the package
root, so it must be imported by path. It takes an `AsyncDuckDBConnection` — the
result of `db.connect()` — not the `AsyncDuckDB` itself.

```javascript
import perspective, { createMessageHandler } from "@perspective-dev/client";
import "@perspective-dev/viewer";
import * as duckdb from "@duckdb/duckdb-wasm";
import { DuckDBHandler } from "@perspective-dev/client/dist/esm/virtual_servers/duckdb.js";

// Initialize DuckDB-WASM
const DUCKDB_BUNDLES = duckdb.getJsDelivrBundles();
const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
    }),
);

const worker = new Worker(worker_url);
const logger = new duckdb.ConsoleLogger();
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
URL.revokeObjectURL(worker_url);

// Load data into DuckDB. This pragma is required to match Perspective's
// sort-null semantics.
const conn = await db.connect();
await conn.query(`SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;`);
await conn.query(`CREATE TABLE my_table AS SELECT * FROM 'data.parquet'`);

// Create a Perspective virtual server backed by DuckDB
const messageHandler = await createMessageHandler(new DuckDBHandler(conn));

// Connect a viewer. Table ids are database-qualified, so a table created as
// `my_table` is hosted as `memory.my_table`.
const client = await perspective.worker(messageHandler);
const viewer = document.getElementById("viewer");
viewer.load(client);
viewer.restore({ table: "memory.my_table" });
```

<div class="warning">In the browser, <code>DuckDBHandler</code> resolves
Perspective's WASM module from the registered
<code>&lt;perspective-viewer&gt;</code> custom element, so it cannot be
constructed until that element has been defined. Off-browser, pass the module
explicitly as the second constructor argument.</div>

Perspective never intercepts your SQL — it only discovers what `SHOW ALL
TABLES` reports — so DuckDB's own remote-data features are available directly:

```javascript
await conn.query(`CREATE SECRET (TYPE s3, KEY_ID '...', SECRET '...', REGION 'us-east-1')`);
await conn.query(`CREATE TABLE trades AS SELECT * FROM read_parquet('s3://bucket/trades/*.parquet')`);
```

## Examples

- [Browser DuckDB example](https://github.com/perspective-dev/perspective/tree/master/examples/esbuild-duckdb-virtual)
