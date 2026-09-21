# Case study: a multi-billion row tick history in a browser tab with DuckLake and DuckDB-WASM

<!-- description: A case study in exploring a multi-billion row tick and trade history lakehouse from a browser tab with no backend: DuckDB-WASM attaches a DuckLake catalog over HTTPS, prunes hundreds of thousands of Parquet files to the slice a user asks for, holds 10 to 100 million rows locally, and Perspective provides the pivot table, candlestick charts and time travel UI on top. -->

[DuckLake](https://ducklake.select/) is an open lakehouse format which keeps
table data in Parquet files and _all_ metadata — schemas, snapshots, file
lists, statistics — in an ordinary SQL database. With a DuckDB file as that
database, an entire lakehouse catalog is one static file.

This case study puts a self-service analytics UI on a market data lake — a
tick-by-tick trade and price history, partitioned by symbol and trade date —
with **no backend at all**. The figures below are rounded from measurements
against a real _frozen_ (read-only) DuckLake of comparable size and layout:

| | |
| --- | --- |
| Rows | ~3 billion |
| Parquet files | Hundreds of thousands, partitioned by symbol and trade date |
| Data size | Tens of gigabytes, in object storage |
| Catalog | One `.ducklake` file of tens of megabytes, on a static host |
| Servers operated | None |

The browser runs three things:

1. [DuckDB-WASM](https://duckdb.org/docs/current/clients/wasm/overview), with
   the `ducklake` extension, as the query engine.
2. Perspective's [DuckDB virtual server](../how_to/javascript/virtual_server/duckdb.md),
   which translates `<perspective-viewer>` configurations into DuckDB SQL.
3. `<perspective-viewer>`, as the data grid, pivot table and charts.

```text
 static hosting / object storage           browser tab
┌─────────────────────────────────┐       ┌──────────────────────────────────┐
│ ticks.ducklake  (catalog)       │◄──────┤ DuckDB-WASM + ducklake extension │
│ trades/symbol=…/date=…/*.parquet│ HTTPS │        ▲ SQL                     │
└─────────────────────────────────┘ range │ Perspective DuckDB virtual server│
                                          │        ▲ view config             │
                                          │ <perspective-viewer>             │
                                          └──────────────────────────────────┘
```

## 1. Attach the lake

```javascript
import perspective from "@perspective-dev/client";
import "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
import * as duckdb from "@duckdb/duckdb-wasm";
import { DuckDBHandler } from "@perspective-dev/client/dist/esm/virtual_servers/duckdb.js";

const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
    }),
);

const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(worker_url));
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
URL.revokeObjectURL(worker_url);

const conn = await db.connect();
await conn.query(`SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;`);
await conn.query(`
    ATTACH 'ducklake:https://data.example.com/ticks.ducklake' AS lake;
`);
```

That is the whole connection. The `ducklake` extension is fetched and loaded
automatically by the `ATTACH`, and the attach takes one to three seconds:
DuckDB reads the catalog by HTTP range request rather than downloading the
whole file. A lake which records absolute `s3://` or `https://` paths for its data
files needs nothing else; one written with relative paths also needs
`DATA_PATH 'https://…/data/'` to say where they now live.

## 2. Pull a slice, then explore it

Every query against the lake is a set of HTTP range requests, so its cost is
set by how much of the table the `WHERE` clause lets DuckDB _skip_. The catalog
holds each file's partition values and column statistics, so pruning
hundreds of thousands of files to the relevant handful happens before any Parquet is touched:

| Query against the lake, in the browser | Rows | Time |
| --- | --- | --- |
| `ATTACH` the lake | — | ~1 s |
| Aggregate one symbol, one day | ~10 thousand | ~1 s |
| `CREATE TABLE … AS SELECT` one symbol, one month | ~300 thousand | ~5 s |
| Count one symbol, two years | ~6 million | ~1.5 min |
| `GROUP BY` over the materialized month | ~300 thousand | ~10 ms |

_Headless Chrome, DuckDB-WASM 1.4.3, one machine on one network, measured
once and rounded; treat these as orders of magnitude._

The last two rows are the design lesson. Interactive pivoting wants
millisecond queries, and a remote scan of millions of rows in hundreds of
small files is not that. So do what an analyst would do: materialize the
slice of interest into the local DuckDB once, and point Perspective at _that_.

```javascript
await conn.query(`
    CREATE TABLE trades_slice AS (
        SELECT * FROM lake.trades
        WHERE symbol IN ('AAPL', 'MSFT')
            AND trade_date BETWEEN DATE '2024-01-01' AND DATE '2024-03-31'
    );
`);

const handler = new DuckDBHandler(conn);
const client = await perspective.worker(
    await perspective.createMessageHandler(handler),
);

const viewer = document.querySelector("perspective-viewer");
await viewer.load(client);
await viewer.restore({
    table: "memory.trades_slice",
    plugin: "Candlestick",
    group_by: ["bucket(\"ts\", 'm')"],
    split_by: ["symbol"],
    columns: ["open", "close", "high", "low"],
    expressions: {
        "bucket(\"ts\", 'm')": "bucket(\"ts\", 'm')",
        open: '"price"',
        close: '"price"',
        high: '"price"',
        low: '"price"',
    },
    aggregates: { open: "first", close: "last", high: "high", low: "low" },
});
```

Perspective's DuckDB virtual server discovers tables with `SHOW ALL TABLES`
and names them `<database>.<table>`, so the slice appears as
`memory.trades_slice` with no registration step. From here the user has the
complete Perspective UI — group, split, filter, sort, expression columns,
every chart type — and each interaction is one local SQL query.

The slice selector — which symbols, which dates — is ordinary application UI
around that one `CREATE TABLE` statement. Several slices can be open as
panels of one `<perspective-viewer>` workspace at once.

### How big can a slice be?

Bigger than "slice" suggests. DuckDB is a columnar, vectorized engine, and
that is still true under WebAssembly. Synthetic tick data — timestamp, symbol,
price, size, side, venue — in DuckDB-WASM, single-threaded, in one browser
tab:

| Local table | Storage | Build | Pivot by symbol × side | 1-minute OHLC for one symbol |
| --- | --- | --- | --- | --- |
| 10 million rows | In memory, 599 MB | 1.7 s | 0.34 s | 0.11 s |
| 50 million rows | OPFS, 408 MiB on disk | 23 s | 0.78 s | 0.25 s |
| 100 million rows | OPFS, ~0.7 GiB on disk | 46 s | 1.5 s | 0.44 s |

_Build time is generating the rows, not fetching them. Synthetic data
compresses better than real ticks; expect real files to be larger._

Two regimes are visible:

- **In memory, plan on tens of millions of rows.** An in-memory DuckDB stores
  tables uncompressed — about 60 bytes per tick here — inside 32-bit
  WebAssembly's 4 GB address space, of which DuckDB budgets 3.1 GiB. Ten
  million rows is comfortable; fifty million of this shape did not fit.
- **On OPFS, plan on a hundred million and up.** Open the database at an
  `opfs://` path and tables live in a compressed, persistent file in the
  browser's
  [Origin Private File System](https://duckdb.org/2026/09/18/opfs-wasm), with
  DuckDB paging blocks in and out as needed. The same 50 million rows which
  failed in memory took 408 MiB on disk, and 100 million still pivoted in a
  second and a half. The slice also survives a reload, so a returning user
  does not pay for the fetch twice.

```javascript
await db.open({
    path: "opfs://ticks.duckdb",
    accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
});
```

OPFS support in DuckDB-WASM is recent; check the
[release notes](https://duckdb.org/2026/09/18/opfs-wasm) for the version to
pin, and `CHECKPOINT` after building a slice you want to keep.

So the practical limit on a slice is not the engine. It is how long the user
will wait for the fetch, which is a property of how well the lake is
partitioned for the question.

## Guard against full scans

DuckDB has no "maximum bytes scanned" setting, and a lakehouse table is only
cheap to query when a filter lets most of it be skipped. In a SQL console an
unfiltered query is something a user has to type. In a pivot UI it is one
drag: `SHOW ALL TABLES` lists `lake.trades` next to the slice, and opening it
and dropping a column on _Group By_ asks the browser to aggregate billions of
rows — tens of gigabytes of downloads, paid for by the reader's connection and
memory and by whoever hosts the bucket.

Design so that cannot happen:

- **Expose slices, never the lake.** Attach the lake on a DuckDB instance the
  viewer is not bound to, or do not offer its tables in your table picker;
  hand Perspective only the materialized tables.
- **Make the filter mandatory.** Build the `CREATE TABLE … AS SELECT` from
  validated inputs (a symbol list, a bounded date range), estimate its size
  from the catalog first — `ducklake_data_file` has `record_count` and
  `file_size_bytes` per file — and refuse slices over a budget.
- **Bound the damage.** Set DuckDB's `memory_limit` so a runaway query fails
  instead of taking the tab down.
- **Mind whose bucket it is.** If the Parquet is someone else's public data,
  your application's traffic is their request bill. Do not publish a link
  which lets copy-pasted code scan it.

## 3. Time travel as a user feature

Every DuckLake snapshot is queryable, and the catalog says what they are:

```javascript
const snapshots = await conn.query(
    `SELECT snapshot_id, snapshot_time, changes FROM lake.snapshots()`,
);
```

Because the virtual server sees DuckDB views as tables, exposing a point in
time to the UI is one statement:

```javascript
await conn.query(`
    CREATE OR REPLACE VIEW trades_as_of AS
        SELECT * FROM lake.trades AT (VERSION => ${snapshot_id})
        WHERE symbol = 'AAPL' AND trade_date = DATE '2024-03-15';
`);

await viewer.restore({ table: "memory.trades_as_of" });
```

For market data this is the correction workflow: put the current slice and an
`AT (VERSION => …)` slice in two panels with the same configuration, and the
user sees a day before and after a vendor's restatement, pivoted however they
like. Alternatively, attach the lake a second time with `SNAPSHOT_VERSION` or
`SNAPSHOT_TIME` to pin a whole catalog.

## Publishing your own

A frozen DuckLake is written by native DuckDB — a nightly job, a notebook,
CI — using a DuckDB file as the catalog:

```sql
INSTALL ducklake;
ATTACH 'ducklake:ticks.ducklake' AS lake (DATA_PATH 's3://my-bucket/ticks/');

CREATE TABLE lake.trades AS
    SELECT * FROM read_parquet('raw/trades_*.parquet');
```

Existing Parquet can also be registered in place, without rewriting it.
Upload the catalog file to any static host.

- **CORS and `Range`.** Both the catalog's host and the data's must allow
  your origin and honor `Range` requests. This is the most common reason an
  attach fails.
- **Partition for the questions users ask.** Pruning is what makes this
  interactive; a symbol/date layout is why a one-day query takes a second.
- **Fewer, larger files.** The two-year query above spans hundreds of small
  daily files, each costing its own round trips. Compact before publishing.
- **Match versions.** A lake written by a newer DuckLake than the browser's
  extension understands will not attach. Pin `@duckdb/duckdb-wasm` and the
  writer's DuckDB to compatible releases.
- **The browser is a reader.** Under WebAssembly, `ATTACH`, queries,
  `snapshots()`, time travel and even catalog DDL work; data writes to the
  lake did not in our testing, and PostgreSQL or MySQL catalogs are out of
  reach because browsers have no raw sockets. Write from native DuckDB.
- **Hide the plumbing.** `SHOW ALL TABLES` also lists DuckLake's own metadata
  tables (`__ducklake_metadata_<name>.*`), so they appear in the viewer's
  table list alongside your data.
- **Private lakes.** DuckDB's `CREATE SECRET (TYPE s3, …)` works in the
  browser, but a key in a page is a key in the browser; front a private
  bucket with short-lived signed URLs or a proxy.
- **Today's ticks do not belong here.** A lakehouse is request/response. For
  the live session use Perspective's own engine, whose `Table` pushes
  incremental updates to every view — see
  [Trading blotters, order books and market data](./market_data.md). History
  from the lake and live panels can share one workspace.

## Related

- [A UI for DuckDB, ClickHouse and PostgreSQL](./database_ui.md)
- [Trading blotters, order books and market data](./market_data.md)
- [DuckDB virtual server (JavaScript)](../how_to/javascript/virtual_server/duckdb.md)
- [Visualizing millions of rows in the browser](./large_datasets.md)
- [`esbuild-duckdb-virtual` example](https://github.com/perspective-dev/perspective/tree/master/examples/esbuild-duckdb-virtual)
