# PostgreSQL Virtual Server

Perspective provides a built-in virtual server for
[PostgreSQL](https://www.postgresql.org/), allowing `<perspective-viewer>`
clients to query a PostgreSQL server over WebSocket.

Requires PostgreSQL 16 or later.

## Installation

```bash
pip install perspective-python "psycopg[binary]"
```

## Usage

Create a server that exposes PostgreSQL tables to browser clients:

```python
import tornado.web
import tornado.ioloop
from perspective.virtual_servers.postgres import PostgresVirtualServer
from perspective.handlers.tornado import PerspectiveTornadoHandler

# Create virtual server backed by PostgreSQL. Each browser session opens its
# own connection with this DSN.
server = PostgresVirtualServer("postgresql://user@localhost:5432/mydb")

# Serve over WebSocket
app = tornado.web.Application([
    (r"/websocket", PerspectiveTornadoHandler, {"perspective_server": server}),
])

app.listen(8080)
tornado.ioloop.IOLoop.current().start()
```

Connect from the browser (table names are schema-qualified):

```javascript
const websocket = await perspective.websocket("ws://localhost:8080/websocket");
const table = await websocket.open_table("public.my_table");
document.getElementById("viewer").load(table);
```

The server is read-only with respect to your data: each viewer session
materializes its queries as connection-scoped `TEMPORARY VIEW`s, which
PostgreSQL drops automatically when the session disconnects.

## Aggregates

Aggregates are PostgreSQL's own functions, under their PostgreSQL names, and
each column type advertises only the aggregates PostgreSQL defines for it —
for example `bit_and`/`bit_or`/`bit_xor` on integers only, and
`bool_and`/`bool_or`/`every` (rather than `min`/`max`) on booleans.
`any_value` is the default for columns with no explicit aggregate, which is
why PostgreSQL 16 is required.

## Window functions

Window columns are PostgreSQL's own functions, under their PostgreSQL names —
the advertised name is emitted into the `OVER` clause verbatim.

|                      |                                                                     |
| -------------------- | ------------------------------------------------------------------- |
| Aggregating          | `sum` `avg` `count` `min` `max`                                     |
| Deviation / variance | `stddev_samp` `stddev_pop` `var_samp` `var_pop`                     |
| Navigation           | `first_value` `last_value` `nth_value` `lag` `lead`                 |
| Ranking              | `row_number` `rank` `dense_rank` `percent_rank` `cume_dist` `ntile` |
| Perspective's own    | `diff`                                                              |

`range` frames require a numeric order key in PostgreSQL, so they are
advertised for numeric column types only.

## Limitations

- **Split by** is not supported — PostgreSQL has no `PIVOT` statement.
- Natural-order (unsorted) window functions are not supported, since
  PostgreSQL has no stable row identity; window columns require an explicit
  order key.

## Examples

- [Python PostgreSQL example](https://github.com/perspective-dev/perspective/tree/master/examples/python-postgres-virtual)
