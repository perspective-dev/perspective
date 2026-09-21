# A pivot and charting UI for DuckDB, ClickHouse and PostgreSQL

<!-- description: Perspective's virtual servers put an interactive data grid, pivot table and charts directly on top of DuckDB, DuckDB-WASM, ClickHouse, PostgreSQL or Polars. View configurations are translated into native queries, so there is no ETL and no data copy. -->

If your data already lives in an analytical database, you do not need to load
it into Perspective's engine to explore it. A
[virtual server](../explanation/virtual_servers.md) implements Perspective's
protocol on top of an external engine: when a user drags a column to _Group
By_, adds a filter or scrolls the grid, the resulting `View` configuration is
translated into a native query, executed by the database, and only the visible
window of the result is returned.

The user sees the same `<perspective-viewer>` — data grid, pivot table, WebGL
charts, maps, saved layouts — and the database does the work.

| Engine | Where it runs | Guide |
| --- | --- | --- |
| DuckDB-WASM | In the browser, no server | [JavaScript](../how_to/javascript/virtual_server/duckdb.md) |
| DuckDB | Python server | [Python](../how_to/python/virtual_server/duckdb.md) |
| ClickHouse | Browser or Python server | [JavaScript](../how_to/javascript/virtual_server/clickhouse.md), [Python](../how_to/python/virtual_server/clickhouse.md) |
| PostgreSQL | Python server | [Python](../how_to/python/virtual_server/postgres.md) |
| Polars | Python server | [Python](../how_to/python/virtual_server/polars.md) |
| Anything else | Your code | [Custom virtual servers](../how_to/javascript/virtual_server/custom.md) |

## DuckDB in Python

```python
import duckdb
import tornado.ioloop
import tornado.web
from perspective.handlers.tornado import PerspectiveTornadoHandler
from perspective.virtual_servers.duckdb import DuckDBVirtualServer

conn = duckdb.connect()
conn.execute("CREATE TABLE trips AS SELECT * FROM 'trips/*.parquet'")

app = tornado.web.Application([
    (r"/websocket", PerspectiveTornadoHandler, {
        "perspective_server": DuckDBVirtualServer(conn),
    }),
])

app.listen(8080)
tornado.ioloop.IOLoop.current().start()
```

```javascript
const websocket = await perspective.websocket("ws://localhost:8080/websocket");
const table = await websocket.open_table("trips");
document.querySelector("perspective-viewer").load(table);
```

## DuckDB-WASM, entirely in the browser

With DuckDB-WASM the whole stack — database, query translation and UI — runs
in the browser tab. Because Perspective does not intercept your SQL, DuckDB's
own Parquet, S3 and HTTP readers are available for loading data. See the
[DuckDB-WASM guide](../how_to/javascript/virtual_server/duckdb.md).

DuckDB-WASM can also attach a whole
[DuckLake](https://ducklake.select/) lakehouse over HTTPS; see the
[DuckLake case study](./ducklake.md).

## When to use a virtual server, and when not to

Use a virtual server when the data is larger than memory, already lives in
the database, or must not leave it. Use Perspective's own engine when the data
is _streaming_: its `Table` applies `update()` calls incrementally and pushes
changes to every view, which a request/response SQL engine does not do.
The two can be mixed — one `<perspective-viewer>` workspace can hold panels
backed by different engines.

## Examples

- [`python-duckdb-virtual`](https://github.com/perspective-dev/perspective/tree/master/examples/python-duckdb-virtual)
- [`esbuild-duckdb-virtual`](https://github.com/perspective-dev/perspective/tree/master/examples/esbuild-duckdb-virtual)
- [`python-clickhouse-virtual`](https://github.com/perspective-dev/perspective/tree/master/examples/python-clickhouse-virtual)
- [`python-postgres-virtual`](https://github.com/perspective-dev/perspective/tree/master/examples/python-postgres-virtual)
- [`python-polars-virtual`](https://github.com/perspective-dev/perspective/tree/master/examples/python-polars-virtual)
