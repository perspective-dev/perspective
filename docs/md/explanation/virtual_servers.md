# Virtual Servers

A Virtual Server allows Perspective to query external data sources (such as
DuckDB or ClickHouse) without loading the entire dataset into Perspective's
built-in data engine. Instead, Perspective translates its query operations
(group by, sort, filter, etc.) into queries the external data source can execute
natively, and only transfers the data needed for the current view.

The Virtual Server API works on any platform that has a Perspective Client —
including JavaScript (both Node.js and the browser via WebAssembly), Python, and
Rust. In the browser, this means a virtual server can front a WASM-based engine
like `@duckdb/duckdb-wasm`, giving `<perspective-viewer>` the ability to query a
database running entirely client-side without loading data into Perspective's
own engine.

This is useful when:

- The dataset is too large to fit in browser memory or a single process.
- Data already lives in a database and you want to avoid duplicating it.
- You want to leverage a database's native query optimizations.
- A WASM build of the data source is available in the browser (e.g.
  `@duckdb/duckdb-wasm`) and you want to query it directly.

## How it works

A virtual server implements a handler interface that Perspective calls to
satisfy `Table` and `View` operations. The handler translates Perspective's view
configuration into the external system's query language (typically SQL),
executes the query, and returns the results as columnar data. Because the
handler speaks the standard Perspective Client protocol, it can run anywhere a
Client can — in-process, in a WebWorker, or on a remote server.

```
┌──────────────────────────────────────────────────┐
│  <perspective-viewer>                            │
└──┬───────────────────────────────────────────────┘
   │   ┌──────────────────────────────────────────────────┐
   └──►│  Perspective Virtual Server Handler              │
       └──┬───────────────────────────────────────────────┘
          │   ┌──────────────────────────────────────────────────┐
          └──►│  External DB (DuckDB, ClickHouse, …).            │
              └──────────────────────────────────────────────────┘
```

The viewer communicates with the virtual server handler the same way it would
with a regular Perspective server. The handler advertises its capabilities
(which operations it supports) via a _features_ object, and the viewer UI adapts
accordingly — disabling controls for unsupported operations.

## Built-in implementations

Perspective ships with virtual server implementations for:

- **DuckDB** — query DuckDB databases in-browser via WASM
  ([JavaScript](../how_to/javascript/virtual_server/duckdb.md)) or server-side
  ([Python](../how_to/python/virtual_server/duckdb.md)).
- **ClickHouse** — query a ClickHouse server from the browser
  ([JavaScript](../how_to/javascript/virtual_server/clickhouse.md)) or from
  Python ([Python](../how_to/python/virtual_server/clickhouse.md)).
- **PostgreSQL** — query a PostgreSQL server (16 or later) from Python
  ([Python](../how_to/python/virtual_server/postgres.md)).

## Custom implementations

You can implement your own virtual server to connect Perspective to any data
source. See the language-specific guides:

- [JavaScript: Implementing a custom Virtual Server](../how_to/javascript/virtual_server/custom.md)
- [Python: Implementing a custom Virtual Server](../how_to/python/virtual_server/custom.md)

## Features declaration

The `get_features()` / `getFeatures()` method returns an object that tells
Perspective which query operations the virtual server supports. The viewer will
only show controls for supported operations:

| Field         | Type   | Description                                                 |
| ------------- | ------ | ----------------------------------------------------------- |
| `group_by`    | `bool` | Whether group-by aggregation is supported                   |
| `split_by`    | `bool` | Whether split-by (pivot) is supported                       |
| `sort`        | `bool` | Whether sorting is supported                                |
| `expressions` | `bool` | Whether computed expressions are supported                  |
| `filter_ops`  | `dict` | Map of column type to list of supported filter operators    |
| `aggregates`  | `dict` | Map of column type to list of supported aggregate functions |
| `on_update`   | `bool` | Whether update callbacks are supported                      |
