#  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
#  ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
#  ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
#  ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
#  ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
#  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
#  ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
#  ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
#  ┃ This file is part of the Perspective library, distributed under the terms ┃
#  ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
#  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

__version__ = "4.0.1"
__all__ = [
    "_jupyter_labextension_paths",
    "Server",
    "Client",
    "Table",
    "View",
    "PerspectiveError",
    "ProxySession",
    "AsyncClient",
    "AsyncServer",
    "VirtualServer",
    "num_cpus",
    "set_num_cpus",
    "system_info",
]

__doc__ = """
The Python language bindings for [Perspective](https://perspective-dev.github.io), a
high performance data-visualization and analytics component for the web browser.

A simple example which loads an [Apache Arrow](https://arrow.apache.org/) and
computes a "Group By" operation, returning a new Arrow.

```python
from perspective import Server

client = Server().new_local_client()
table = client.table(arrow_bytes_data)
view = table.view(group_by = ["CounterParty", "Security"])
arrow = view.to_arrow()
```

Perspective for Python uses the exact same C++ data engine used by the
[WebAssembly version](https://docs.rs/perspective-js/latest/perspective_js/) and
[Rust version](https://docs.rs/crate/perspective/latest). The library consists
of many of the same abstractions and API as in JavaScript, as well as
Python-specific data loading support for [NumPy](https://numpy.org/),
[Pandas](https://pandas.pydata.org/) (and
[Apache Arrow](https://arrow.apache.org/), as in JavaScript).

Additionally, `perspective-python` provides a session manager suitable for
integration into server systems such as
[Tornado websockets](https://www.tornadoweb.org/en/stable/websocket.html),
[AIOHTTP](https://docs.aiohttp.org/en/stable/web_quickstart.html#websockets), or
[Starlette](https://www.starlette.io/websockets/)/[FastAPI](https://fastapi.tiangolo.com/advanced/websockets/),
which allows fully _virtual_ Perspective tables to be interacted with by
multiple `<perspective-viewer>` in a web browser. You can also interact with a
Perspective table from python clients, and to that end client libraries are
implemented for both Tornado and AIOHTTP.

As `<perspective-viewer>` will only consume the data necessary to render the
current screen, this runtime mode allows _ludicrously-sized_ datasets with
instant-load after they've been manifest on the server (at the expense of
network latency on UI interaction).

The included `PerspectiveWidget` allows running such a viewer in
[JupyterLab](https://jupyterlab.readthedocs.io/en/stable/) in either server or
client (via WebAssembly) mode, and the included `PerspectiveTornadoHandler`
makes it simple to extend a Tornado server with virtual Perspective support.

The `perspective` module exports several tools:

-   `Server` the constructor for a new isntance of the Perspective data engine.
-   The `perspective.widget` module exports `PerspectiveWidget`, the JupyterLab
    widget for interactive visualization in a notebook cell.
-   The `perspective.handlers` modules exports web frameworks handlers that
    interface with a `perspective-client` in JavaScript.
    -   `perspective.handlers.tornado.PerspectiveTornadoHandler` for
        [Tornado](https://www.tornadoweb.org/)
    -   `perspective.handlers.starlette.PerspectiveStarletteHandler` for
        [Starlette](https://www.starlette.io/) and
        [FastAPI](https://fastapi.tiangolo.com)
    -   `perspective.handlers.aiohttp.PerspectiveAIOHTTPHandler` for
        [AIOHTTP](https://docs.aiohttp.org),

This user's guide provides an overview of the most common ways to use
Perspective in Python: the `Table` API, the JupyterLab widget, and the Tornado
handler.

[More Examples](https://github.com/perspective-dev/perspective/tree/master/examples) are
available on GitHub.

## Installation

`perspective-python` contains full bindings to the Perspective API, a JupyterLab
widget, and a WebSocket handlers for several webserver libraries that allow you
to host Perspective using server-side Python.

`perspective-python` can be installed from [PyPI](https://pypi.org) via `pip`:

```bash
pip install perspective-python
```

## Quick Start

A `Table` can be created from a dataset or a schema, the specifics of which are
[discussed](#loading-data-with-table) in the JavaScript section of the user's
guide. In Python, however, Perspective supports additional data types that are
commonly used when processing data:

-   `pandas.DataFrame`
-   `polars.DataFrame`
-   `bytes` (encoding an Apache Arrow)
-   `objects` (either extracting a repr or via reference)
-   `str` (encoding as a CSV)

A `Table` is created in a similar fashion to its JavaScript equivalent:

```python
from datetime import date, datetime
import numpy as np
import pandas as pd
import perspective

data = pd.DataFrame({
    "int": np.arange(100),
    "float": [i * 1.5 for i in range(100)],
    "bool": [True for i in range(100)],
    "date": [date.today() for i in range(100)],
    "datetime": [datetime.now() for i in range(100)],
    "string": [str(i) for i in range(100)]
})

table = perspective.table(data, index="float")
```

Likewise, a `View` can be created via the `view()` method:

```python
view = table.view(group_by=["float"], filter=[["bool", "==", True]])
column_data = view.to_columns()
row_data = view.to_json()
```

#### Pandas and Polars Support

Perspective's `Table` can be constructed from `pandas.DataFrame` and
`polars.DataFrame` objects. Internally, this just uses
[`pyarrow::from_pandas`](https://arrow.apache.org/docs/python/pandas.html),
which dictates behavior of this feature including type support.

If the dataframe does not have an index set, an integer-typed column named
`"index"` is created. If you want to preserve the indexing behavior of the
dataframe passed into Perspective, simply create the `Table` with
`index="index"` as a keyword argument. This tells Perspective to once again
treat the index as a primary key:

```python
data.set_index("datetime")
table = perspective.table(data, index="index")
```

#### Time Zone Handling

When parsing `"datetime"` strings, times are assumed _local time_ unless an
explicit timezone offset is parsed. All `"datetime"` columns (regardless of
input time zone) are _output_ to the user as `datetime.datetime` objects in
_local time_ according to the Python runtime.

This behavior is consistent with Perspective's behavior in JavaScript. For more
details, see this in-depth
[explanation](https://github.com/perspective-dev/perspective/pull/867) of
`perspective-python` semantics around time zone handling.

#### Callbacks and Events

`perspective.Table` allows for `on_update` and `on_delete` callbacks to be
set—simply call `on_update` or `on_delete` with a reference to a function or a
lambda without any parameters:

```python
def update_callback():
    print("Updated!")

# set the update callback
on_update_id = view.on_update(update_callback)


def delete_callback():
    print("Deleted!")

# set the delete callback
on_delete_id = view.on_delete(delete_callback)

# set a lambda as a callback
view.on_delete(lambda: print("Deleted x2!"))
```

If the callback is a named reference to a function, it can be removed with
`remove_update` or `remove_delete`:

```python
view.remove_update(on_update_id)
view.remove_delete(on_delete_id)
```

Callbacks defined with a lambda function cannot be removed, as lambda functions
have no identifier.

### Hosting `Table` and `View` instances

`Server` "hosts" all `perspective.Table` and `perspective.View` instances
created by its connected `Client`s. Hosted tables/views can have their methods
called from other sources than the Python server, i.e. by a `perspective-viewer`
running in a JavaScript client over the network, interfacing with
`perspective-python` through the websocket API.

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
will be assigned randomlu and the `Client` must look this up with
`CLient.get_hosted_table_names()`

### Client/Server Replicated Mode

Using Tornado and
[`PerspectiveTornadoHandler`](python.md#perspectivetornadohandler), as well as
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
from perspective.hadnlers.tornado import PerspectiveTornadoHandler

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
        "ws://localhost:8888/websocket"
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

-   [Starlette Example Project](https://github.com/perspective-dev/perspective/tree/master/examples/python-starlette).
-   [AIOHTTP Example Project](https://github.com/perspective-dev/perspective/tree/master/examples/python-aiohttp).

### Server-only Mode

The server setup is identical to [Distributed Mode](#distributed-mode) above,
but instead of creating a view, the client calls `load(server_table)`: In
Python, use `Server` and `PerspectiveTornadoHandler` to create a websocket
server that exposes a `Table`. In this example, `table` is a proxy for the
`Table` we created on the server. All API methods are available on _proxies_,
the.g.us calling `view()`, `schema()`, `update()` on `table` will pass those
operations to the Python `Table`, execute the commands, and return the result
back to Javascript.

```html
<perspective-viewer id="viewer" editable></perspective-viewer>
```

```javascript
const websocket = perspective.websocket("ws://localhost:8888/websocket");
const table = websocket.open_table("data_source");
document.getElementById("viewer").load(table);
```

"""


import functools

from .perspective import (
    Client,
    PerspectiveError,
    ProxySession,
    Server,
    AsyncServer,
    AsyncClient,
    VirtualServer,
    # NOTE: these are classes without constructors,
    # so we import them just for type hinting
    Table,  # noqa: F401
    View,  # noqa: F401
    num_cpus,
    set_num_cpus,
)


GLOBAL_SERVER = Server()
GLOBAL_CLIENT = GLOBAL_SERVER.new_local_client()


@functools.wraps(Client.table)
def table(*args, **kwargs):
    return GLOBAL_CLIENT.table(*args, **kwargs)


@functools.wraps(Client.open_table)
def open_table(*args, **kwargs):
    return GLOBAL_CLIENT.table(*args, **kwargs)


@functools.wraps(Client.get_hosted_table_names)
def get_hosted_table_names(*args, **kwargs):
    return GLOBAL_CLIENT.get_hosted_table_names(*args, **kwargs)


@functools.wraps(Client.system_info)
def system_info(*args, **kwargs):
    return GLOBAL_CLIENT.system_info(*args, **kwargs)


def _jupyter_labextension_paths():
    """
    Read by `jupyter labextension develop`
    @private
    """
    return [{"src": "labextension", "dest": "@perspective-dev/jupyterlab"}]
