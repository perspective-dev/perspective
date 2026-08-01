# Implementing a custom Virtual Server

You can connect Perspective to any data source by subclassing
`VirtualServerHandler`, wrapping it in a `VirtualServer`, and exposing that
via a small _session factory_ object which the WebSocket handlers use to give
each connected client its own session.

For background on virtual servers, see the
[Virtual Servers overview](../../../explanation/virtual_servers.md).

## The handler

`VirtualServerHandler` is imported from `perspective.virtual_servers`. Only
`get_hosted_tables`, `table_schema`, `table_size`, `table_make_view`,
`view_delete` and `view_get_data` are required; the rest have defaults.

```python
from perspective.virtual_servers import VirtualServerHandler

class MyHandler(VirtualServerHandler):
    def __init__(self, db):
        self.db = db

    def get_features(self):
        return {
            "group_by": True,
            "split_by": False,
            "sort": True,
            "filter_ops": {
                "string": ["==", "!=", "contains"],
                "float": ["==", "!=", ">", "<"],
            },
            "aggregates": {
                "float": ["sum", "avg", "count"],
                "string": ["count"],
            },
        }

    def get_hosted_tables(self):
        return ["my_table"]

    def table_schema(self, table_name):
        return {"name": "string", "price": "float"}

    def table_size(self, table_name):
        return 1000

    def table_make_view(self, table_name, view_name, config):
        # Translate `config` (group_by, sort, filter, etc.) into a query
        # against your data source. Store the query keyed by `view_name`
        # for later data retrieval.
        pass

    def view_delete(self, view_name):
        # Clean up resources for this view. The UI does this automatically,
        # and can recover if a view dies early.
        pass

    def view_get_data(self, view_name, config, viewport, data):
        # Serialize the rectangular slice `viewport` of the temporary table
        # `view_name` into `data`, a push-only `VirtualDataSlice`. Once a
        # type has been pushed for a column name it must not change.
        pass
```

### Optional methods

| Method | Default | Purpose |
| --- | --- | --- |
| `get_features()` | `columns` only | Which UI controls to enable — see [Features declaration](../../../explanation/virtual_servers.md#features-declaration) |
| `view_schema(view_name, config)` | `table_schema` | Schema of a temporary table, when it differs from its source |
| `view_size(view_name)` | `table_size` | Row count of a temporary table, when it differs from its source |
| `table_validate_expression(view_name, expression)` | allow all | Type-check an expression column; enabled by `"expressions"` in `get_features` |
| `view_get_min_max(view_name, column_name, config)` | unsupported | Column bounds as a `(min, max)` tuple — required for gradient and sparkbar column styles |

## The session factory

The WebSocket handlers call `new_session(callback)` once per connection, so
the object passed as `perspective_server` must provide it. Wrap your handler
in a `perspective.VirtualServer` — which owns the protocol — and return one
session per client:

```python
import perspective

class MyVirtualSession:
    def __init__(self, callback, db):
        self.session = perspective.VirtualServer(MyHandler(db))
        self.callback = callback

    def handle_request(self, msg):
        self.callback(self.session.handle_request(msg))


class MyVirtualServer:
    def __init__(self, db):
        self.db = db

    def new_session(self, callback):
        return MyVirtualSession(callback, self.db)
```

## Serving it

A `MyVirtualServer` instance can then be passed to a Tornado, Starlette or
AIOHTTP handler just like a regular `Server`:

```python
from perspective.handlers.tornado import PerspectiveTornadoHandler

app = tornado.web.Application([
    (r"/websocket", PerspectiveTornadoHandler, {
        "perspective_server": MyVirtualServer(db),
    }),
])
```

The built-in [DuckDB](./duckdb.md), [ClickHouse](./clickhouse.md) and
[Polars](./polars.md) implementations all follow exactly this shape and are
worth reading as complete references.
