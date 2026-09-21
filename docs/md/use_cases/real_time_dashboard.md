# Real-time dashboards over WebSocket

<!-- description: How to build a real-time dashboard with Perspective: stream data into a Table on a Python or Node.js server with update(), and every connected browser's data grid, pivot table and charts update incrementally over WebSocket. -->

A real-time dashboard is a set of tables and charts which stay current as the
data behind them changes, without the user reloading. Perspective is built for
this: a [`Table`](../explanation/table.md) accepts streaming
[`update()`](../explanation/table/update_and_remove.md) calls, every
[`View`](../explanation/view.md) over it — grouped, pivoted, filtered or
sorted — is maintained incrementally, and `<perspective-viewer>` repaints only
what changed.

There is no polling and no query re-execution. An update of 50 rows to a 10
million row table costs work proportional to the 50 rows.

## Architecture

1. A server process owns the `Table` and writes to it as new data arrives —
   from a message queue, a market data feed, a database change stream, or a
   timer.
2. The server exposes that `Table` by name on a WebSocket endpoint.
3. Each browser opens the `Table` by name and loads it into a
   `<perspective-viewer>`. The user configures their own grouping, filters and
   chart type; each browser gets its own `View`.

Perspective offers two ways to split this work between server and browser,
covered in [Data Architecture](../explanation/architecture.md):

- **[Client/server replicated](../explanation/architecture/client_server.md)**
  — the browser keeps a synchronized copy of the table in WebAssembly. Queries
  run locally, so interaction is instant and the server only ships deltas. Best
  when the dataset fits in browser memory.
- **[Server only](../explanation/architecture/server_only.md)** — queries run
  on the server and the browser receives only the visible window of rows. Best
  for very large tables or thin clients.

## A Python server

```python
import threading
import time

import tornado.ioloop
import tornado.web
from perspective import Server
from perspective.handlers.tornado import PerspectiveTornadoHandler

server = Server()
client = server.new_local_client()
table = client.table(
    {"symbol": "string", "price": "float", "time": "datetime"},
    name="prices",
)

def feed():
    while True:
        table.update(next_batch())
        time.sleep(0.05)

threading.Thread(target=feed, daemon=True).start()

app = tornado.web.Application([
    (r"/websocket", PerspectiveTornadoHandler, {"perspective_server": server}),
])

app.listen(8080)
tornado.ioloop.IOLoop.current().start()
```

Perspective's Python API is thread-safe and releases the GIL, so the feed can
run on its own thread; see [Multithreading](../how_to/python/multithreading.md).
Handlers are also provided for
[Starlette/FastAPI and aiohttp](../how_to/python/websocket.md).

## The browser

```html
<perspective-viewer id="viewer"></perspective-viewer>

<script type="module">
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js";
    import perspective from "https://cdn.jsdelivr.net/npm/@perspective-dev/client/dist/cdn/perspective.js";

    const websocket = await perspective.websocket("ws://localhost:8080/websocket");
    const table = await websocket.open_table("prices");
    const viewer = document.getElementById("viewer");
    await viewer.load(table);
    await viewer.restore({
        plugin: "Y Line",
        group_by: ["time"],
        split_by: ["symbol"],
        columns: ["price"],
    });
</script>
```

This is server-only mode. For replicated mode, create a `View` on the server
table and build a local table from it — `worker.table(server_view)` — as shown
in [Hosting a WebSocket server](../how_to/python/websocket.md).

## Keeping a rolling window

For feeds which never end, bound the table. An
[`index`](../explanation/table/options.md) makes updates replace rows by key
(latest price per symbol); a `limit` keeps only the most recent _n_ rows
(a rolling tick history).

## A Node.js server

The same server can be written in Node.js with
[`WebSocketServer`](../how_to/javascript/nodejs_server.md), or in Rust — see the
[`rust-axum` example](https://github.com/perspective-dev/perspective/tree/master/examples/rust-axum).

## See it running

- [Market](https://perspective-dev.github.io/gallery/market-trading-desk.html)
  — a simulated order book streaming into a blotter, depth chart and
  candlestick chart.
- [`python-tornado-streaming`](https://github.com/perspective-dev/perspective/tree/master/examples/python-tornado-streaming)
  — the complete version of the server above.
