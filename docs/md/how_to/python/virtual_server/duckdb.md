# DuckDB Virtual Server

Perspective provides a built-in virtual server for
[DuckDB](https://duckdb.org/), allowing `<perspective-viewer>` clients to query
a server-side DuckDB database over WebSocket.

For browser-only usage via DuckDB-WASM, see the
[JavaScript DuckDB guide](../../javascript/virtual_server/duckdb.md).

## Installation

```bash
pip install perspective-python duckdb
```

## Usage

Create a server that exposes a DuckDB database to browser clients:

```python
import duckdb
import tornado.web
import tornado.ioloop
from perspective.virtual_servers.duckdb import DuckDBVirtualServer
from perspective.handlers.tornado import PerspectiveTornadoHandler

# Create DuckDB connection and load data
conn = duckdb.connect()
conn.execute("CREATE TABLE my_table AS SELECT * FROM 'data.parquet'")

# Create virtual server backed by DuckDB
server = DuckDBVirtualServer(conn)

# Serve over WebSocket
app = tornado.web.Application([
    (r"/websocket", PerspectiveTornadoHandler, {"perspective_server": server}),
])

app.listen(8080)
tornado.ioloop.IOLoop.current().start()
```

Connect from the browser:

```javascript
const websocket = await perspective.websocket("ws://localhost:8080/websocket");
const table = await websocket.open_table("my_table");
document.getElementById("viewer").load(table);
```

## Window functions

Window columns are DuckDB's own functions, under their DuckDB names — the
advertised name is emitted into the `OVER` clause verbatim.

| | |
| --- | --- |
| Aggregating | `sum` `avg` `count` `min` `max` `product` `median` |
| Deviation / variance | `stddev_samp` `stddev_pop` `var_samp` `var_pop` |
| Navigation | `first_value` `last_value` `nth_value` `lag` `lead` |
| Ranking | `row_number` `rank` `dense_rank` `percent_rank` `cume_dist` `ntile` |
| Perspective's own | `diff` `rate` |

## Examples

- [Python DuckDB example](https://github.com/perspective-dev/perspective/tree/master/examples/python-duckdb-virtual)
