# Hosting a WebSocket server

An in-memory `Server` "hosts" all `perspective.Table` and `perspective.View`
instances created by its connected `Client`s. Hosted tables/views can have their
methods called from other sources than the Python server, i.e. by a
`perspective-viewer` running in a JavaScript client over the network,
interfacing with `perspective-python` through the websocket API.

The server has full control of all hosted `Table` and `View` instances, and can
call any public API method on hosted instances. This makes it extremely easy to
stream data to a hosted `Table` using `.update()`:

```python
server = perspective.Server()
client = server.new_local_client()
table = client.table(data, name="data_source")

for i in range(10):
    # updates continue to propagate automatically
    table.update(new_data)
```

The `name` provided is important, as it enables Perspective in JavaScript to
look up a `Table` and get a handle to it over the network. Otherwise, `name`
will be assigned randomly and the `Client` must look this up with
`Client.get_hosted_table_names()`

## Client/Server Replicated Mode

Using Tornado and
[`PerspectiveTornadoHandler`](../../explanation/python.md#whats-included), as well as
`Perspective`'s JavaScript library, we can set up "distributed" Perspective
instances that allows multiple browser `perspective-viewer` clients to read from
a common `perspective-python` server, as in the
[Tornado Example Project](https://github.com/perspective-dev/perspective/tree/master/examples/python-tornado).

This architecture works by maintaining two `Tables`—one on the server, and one
on the client that mirrors the server's `Table` automatically using `on_update`.
All updates to the table on the server are automatically applied to each client,
which makes this architecture a natural fit for streaming dashboards and other
distributed use-cases. In conjunction with [multithreading](#multi-threading),
distributed Perspective offers consistently high performance over large numbers
of clients and large datasets.

_*server.py*_

```python
from perspective import Server
from perspective.handlers.tornado import PerspectiveTornadoHandler

# Create an instance of Server, and host a Table
SERVER = Server()
CLIENT = SERVER.new_local_client()

# The Table is exposed at `localhost:8888/websocket` with the name `data_source`
client.table(data, name = "data_source")

app = tornado.web.Application([
    # create a websocket endpoint that the client JavaScript can access
    (r"/websocket", PerspectiveTornadoHandler, {"perspective_server": SERVER})
])

# Start the Tornado server
app.listen(8888)
loop = tornado.ioloop.IOLoop.current()
loop.start()
```

Instead of calling `load(server_table)`, create a `View` using `server_table`
and pass that into `viewer.load()`. This will automatically register an
`on_update` callback that synchronizes state between the server and the client.

_*index.html*_

```html
<perspective-viewer id="viewer" editable></perspective-viewer>

<script type="module">
    // Create a client that expects a Perspective server
    // to accept connections at the specified URL.
    const websocket = await perspective.websocket(
        "ws://localhost:8888/websocket",
    );

    // Get a handle to the Table on the server
    const server_table = await websocket.open_table("data_source_one");

    // Create a new view
    const server_view = await table.view();

    // Create a Table on the client using `perspective.worker()`
    const worker = await perspective.worker();
    const client_table = await worker.table(view);

    // Load the client table in the `<perspective-viewer>`.
    document.getElementById("viewer").load(client_table);
</script>
```

For a more complex example that offers distributed editing of the server
dataset, see
[client_server_editing.html](https://github.com/perspective-dev/perspective/blob/master/examples/python-tornado/client_server_editing.html).

We also provide examples for Starlette/FastAPI and AIOHTTP:

- [Starlette Example Project](https://github.com/perspective-dev/perspective/tree/master/examples/python-starlette).
- [AIOHTTP Example Project](https://github.com/perspective-dev/perspective/tree/master/examples/python-aiohttp).

## Server-only Mode

The server setup is identical to
[Client/Server Replicated Mode](#client-server-replicated-mode) above, but
instead of creating a `View`, the client calls `load(server_table)`: In Python,
use `Server` and `PerspectiveTornadoHandler` to create a websocket server that
exposes a `Table`. In this example, `table` is a proxy for the `Table` we
created on the server. All API methods are available on _proxies_, e.g.
calling `view()`, `schema()`, `update()` on `table` will pass those operations
to the Python `Table`, execute the commands, and return the result back to
Javascript.

```html
<perspective-viewer id="viewer" editable></perspective-viewer>
```

```javascript
const websocket = perspective.websocket("ws://localhost:8888/websocket");
const table = websocket.open_table("data_source");
document.getElementById("viewer").load(table);
```
