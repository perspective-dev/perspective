# `perspective-python`

[![PyPI](https://img.shields.io/pypi/v/perspective-python.svg?style=for-the-badge)](https://pypi.org/project/perspective-python/)

Perspective is an open-source data grid, pivot table and charting component for 
large, real-time and streaming datasets.

`perspective-python` is the Python distribution of Perspective:

- A streaming query engine — `Table` and `View` — with incremental pivots,
  aggregates, filters, expressions and joins, reading and writing
  [Apache Arrow](https://arrow.apache.org/), CSV, JSON, `pandas`, `polars` and
  `pyarrow`. Tables can be memory-mapped from disk with `page_to_disk=True`
  to exceed available memory.
- `PerspectiveWidget`, an interactive data grid, pivot table and charting
  widget for JupyterLab, Jupyter Notebook, VS Code notebooks, Google Colab and
  marimo, built on [anywidget](https://anywidget.dev/).
- WebSocket handlers for Tornado, Starlette (FastAPI) and aiohttp, which serve
  real-time dashboards to `<perspective-viewer>` in the browser.
- Virtual servers which run the same UI directly against DuckDB, ClickHouse,
  PostgreSQL and Polars, with no data copy.

## Installation

```bash
pip install perspective-python
```

For notebooks, install the `jupyter` extra:

```bash
pip install "perspective-python[jupyter]"
```

## An interactive pivot table in Jupyter

```python
import pandas as pd
from perspective.widget import PerspectiveWidget

df = pd.read_csv("superstore.csv")
PerspectiveWidget(df, plugin="Y Bar", group_by=["Region"], columns=["Sales"])
```

## A streaming `Table`

```python
import perspective

server = perspective.Server()
client = server.new_local_client()
table = client.table({"symbol": "string", "price": "float"}, name="prices")
table.update([{"symbol": "AAPL", "price": 189.5}])
```

## A real-time dashboard server

```python
import tornado.ioloop
import tornado.web
from perspective.handlers.tornado import PerspectiveTornadoHandler

app = tornado.web.Application([
    (r"/websocket", PerspectiveTornadoHandler, {"perspective_server": server}),
])

app.listen(8888)
tornado.ioloop.IOLoop.current().start()
```

Any number of browser clients can then open the `prices` table over WebSocket
and receive every `update()` as it happens.

## Documentation

- [Project site and live examples](https://perspective-dev.github.io/)
- [User guide](https://perspective-dev.github.io/guide/)
- [Example gallery](https://perspective-dev.github.io/gallery/index.html)
- [GitHub](https://github.com/perspective-dev/perspective)
- [Python API reference](https://perspective-dev.github.io/python/index.html)
