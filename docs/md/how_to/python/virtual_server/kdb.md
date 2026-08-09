# kdb+ Virtual Server

Perspective provides a built-in virtual server for
[kdb+](https://kx.com/), allowing `<perspective-viewer>` clients to query a q
process over WebSocket.

## Installation

```bash
pip install perspective-python pykx
```

## Usage

Start a q process listening on a port:

```bash
q -p 5001
```

Create a server that exposes its tables to browser clients:

```python
import pykx
import tornado.web
import tornado.ioloop
from perspective.virtual_servers.kdb import KdbVirtualServer
from perspective.handlers.tornado import PerspectiveTornadoHandler

# Connect to q over IPC
conn = pykx.SyncQConnection(host="localhost", port=5001)

# Create virtual server backed by kdb+
server = KdbVirtualServer(conn)

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
const table = await websocket.open_table("trades");
document.getElementById("viewer").load(table);
```

Tables in q's root namespace are discoverable, as reported by `tables[]`.

## Requirements of the q process

Views are materialized as globals under a `.psp` namespace, so the connected
handle **must permit global assignment**. A read-only handle (`q -b`) or a
gateway that rejects writes will not work; point the virtual server at a
process you control, which may of course proxy a read-only store.

Views are cleaned up when the UI closes them. If a view leaks — because a
client disconnected uncleanly, say — it remains as a global under `.psp` until
the process restarts.

## Type mapping

q's type system is richer than Perspective's six visual types. Columns whose q
type has no Perspective analogue are cast on the way out, so the schema
Perspective reports always matches the data it receives.

| q type                          | Perspective | Notes                              |
| ------------------------------- | ----------- | ---------------------------------- |
| `boolean`                       | `boolean`   |                                    |
| `short`, `int`, `byte`          | `integer`   |                                    |
| `long`, `real`, `float`         | `float`     | `long` is 64-bit; `integer` is 32  |
| `symbol`, `char`, string        | `string`    |                                    |
| `guid`                          | `string`    | cast with `string`                 |
| `date`                          | `date`      |                                    |
| `month`                         | `date`      | cast with `"d"$`                   |
| `timestamp`                     | `datetime`  |                                    |
| `datetime`                      | `datetime`  | cast with `"p"$`                   |
| `time`, `minute`, `second`, `timespan` | `string` | cast with `string`             |

### Nulls

q has no validity bitmap — a null long *is* `0Nj`, the minimum 64-bit integer.
The handler translates these sentinels to Arrow nulls so they render as empty
cells rather than as `-9223372036854775808`. The empty symbol `` ` `` is
likewise q's symbol null and arrives in Perspective as null, not as `""`.

Infinities (`0W`, `0w`) are genuine values in q and are passed through.

## Supported features

| Feature      | Supported | Notes                                              |
| ------------ | --------- | -------------------------------------------------- |
| Group By     | ✔         | `rollup`, `flat` and `total` modes                  |
| Sort         | ✔         |                                                     |
| Filter       | ✔         | see below                                           |
| Aggregates   | ✔         | q's own — see below                                 |
| Expressions  | ✔         | written in **q**, not Perspective's expression language |
| Windows      | ✔         | q's own — `mdev`, `mcount`, `xprev`, `ema`          |
| Split By     | ✘         |                                                     |

This handler exposes **q's data model**, not a lowest common denominator
shared with the other virtual servers. Aggregate and filter names are q's, and
they mean what q means by them. If you know kdb+, the menus should read as
kdb+; if you are moving a saved layout from the DuckDB virtual server, expect
to re-pick aggregates.

### Aggregates

| q aggregate | Applies to | Notes |
| ----------- | ---------- | ----- |
| `sum` `avg` `min` `max` `count` `first` `last` | numeric | `sum` over a boolean column counts the trues |
| `count distinct` | any | q's `count distinct` |
| `med` | numeric | median |
| `dev` / `sdev` | numeric | **population** / **sample** standard deviation |
| `var` / `svar` | numeric | **population** / **sample** variance |
| `prd` | numeric | product |
| `any` / `all` | numeric, boolean | |
| `wavg` / `wsum` | numeric | **weighted** by a second column — `Quantity wavg Sales` |
| `cor` / `cov` | numeric | correlation / covariance against a second column |

`dev` and `sdev` are offered separately because in q they are different
statistics, and the same goes for `var` and `svar`. Nothing here is renamed to
match another backend: there is no `stddev`, no `median`, no `product`.

`wavg`, `wsum`, `cor` and `cov` take a second column, and appear in the
aggregate menu as a submenu of the columns they can pair with.

### Filters

Filter *operators* — `==`, `!=`, `<`, `>`, `<=`, `>=` — are Perspective's
spelling of q's `=`, `<>`, `<`, `>`, `<=`, `>=` and mean the same thing. The
*predicates* are q's:

| Filter op | q |
| --------- | - |
| `like`    | q's `like`, taking **q's** pattern language — `*` and `?`. `%` and `_` are literal characters, not wildcards |
| `in` / `not in` | q's `in` over a vector of values |

Ordering comparisons (`<`, `>`, `<=`, `>=`) on string columns compare
lexicographically as symbols, which is q's ordering for `symbol` columns and
the intuitive one for the char-list types.

> If you are used to the DuckDB virtual server, note that `like` patterns are
> **not** translated: `"Bos%"` matches a literal percent sign here. Write
> `"Bos*"`.

`within` is absent despite being idiomatic q, because Perspective's filter UI
infers an operator's operand count from a fixed list of names and would render
a two-operand range filter as a single value box.

### Expressions

Expressions are q, passed through to the q process verbatim — there is no
translation from Perspective's ExprTK-style expression language, so what you
write in the expression editor is q:

```q
Sales * 0.9
```

```q
10 xbar Sales
```

```q
upper City
```

An expression may reference any column of the source table by name, provided
that name is a q identifier. Expressions are validated by q as you type: the
error q reports is the error the editor shows.

An expression's type is resolved by q — you do not declare it — and it behaves
like any other column thereafter, so it can be grouped by, sorted, filtered
and aggregated. An expression whose alias matches a source column shadows it,
matching the SQL virtual servers.

> **Expressions execute in your q process.** They are passed through
> unmodified, so an expression can call anything q can — including your own
> functions and `system`, which reaches the shell. This is the same trust model
> as the DuckDB virtual server, which inlines SQL fragments, but q's reach is
> wider. Only expose a kdb+ virtual server to clients you would grant query
> access to that process, and disable `expressions` in `get_features` if that
> is not true of your deployment.

### Window functions

Window columns are q's own moving and running primitives, under their q names.
A q developer already knows what `mdev` computes; it is not renamed to
`stddev`, which would both rename it and misdescribe it (`mdev` is a
*population* deviation, SQL's `STDDEV_SAMP` a sample one).

| Window aggregate | q |
| ---------------- | - |
| `msum` `mavg` `mmin` `mmax` | the moving verbs; a cumulative frame takes the running form (`sums`, `avgs`, `mins`, `maxs`) |
| `mcount`         | moving count of non-nulls |
| `mdev`           | moving **population** deviation |
| `mvar`           | its square — q has no moving-variance primitive |
| `first`          | the earliest row in the frame |
| `xprev` / `xnext` | shift back / forward by an offset |
| `deltas`         | difference from the previous row |
| `ema`            | exponential moving average — **rejected by the SQL virtual servers**, which have no recursive `OVER` equivalent |
