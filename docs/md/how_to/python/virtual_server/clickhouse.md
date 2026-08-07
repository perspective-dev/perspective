# ClickHouse Virtual Server

Perspective provides a built-in virtual server for
[ClickHouse](https://clickhouse.com/), allowing `<perspective-viewer>` clients
to query a ClickHouse server over WebSocket.

For browser-only usage, see the
[JavaScript ClickHouse guide](../../javascript/virtual_server/clickhouse.md).

## Installation

```bash
pip install perspective-python clickhouse-connect
```

## Usage

Create a server that exposes ClickHouse tables to browser clients:

```python
import clickhouse_connect
import tornado.web
import tornado.ioloop
from perspective.virtual_servers.clickhouse import ClickhouseVirtualServer
from perspective.handlers.tornado import PerspectiveTornadoHandler

# Connect to ClickHouse
client = clickhouse_connect.get_client(host="localhost")

# Create virtual server backed by ClickHouse
server = ClickhouseVirtualServer(client)

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

## Examples

- [Python ClickHouse example](https://github.com/perspective-dev/perspective/tree/master/examples/python-clickhouse-virtual)
