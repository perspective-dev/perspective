# What is `perspective-python`

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

## Example

A simple example which loads an [Apache Arrow](https://arrow.apache.org/) and
computes a "Group By" operation, returning a new Arrow.

```python
from perspective import Server

client = Server().new_local_client()
table = client.table(arrow_bytes_data)
view = table.view(group_by = ["CounterParty", "Security"])
arrow = view.to_arrow()
```

[More Examples](https://github.com/perspective-dev/perspective/tree/master/examples)
are available on GitHub.

## What's included

The `perspective` module exports several tools:

- `Server` the constructor for a new instance of the Perspective data engine.
- The `perspective.widget` module exports `PerspectiveWidget`, the JupyterLab
  widget for interactive visualization in a notebook cell.
- The `perspective.handlers` modules exports web frameworks handlers that
  interface with a `perspective-client` in JavaScript.
    - `perspective.handlers.tornado.PerspectiveTornadoHandler` for
      [Tornado](https://www.tornadoweb.org/)
    - `perspective.handlers.starlette.PerspectiveStarletteHandler` for
      [Starlette](https://www.starlette.io/) and
      [FastAPI](https://fastapi.tiangolo.com)
    - `perspective.handlers.aiohttp.PerspectiveAIOHTTPHandler` for
      [AIOHTTP](https://docs.aiohttp.org),

### Virtual UI server

As `<perspective-viewer>` or any other Perspective `Client` will only consume
the data necessary to render the current screen (or whatever else was requested
via the API), this runtime mode allows large datasets without the need to copy
them entirely to the Browser, at the expense of network latency on UI
interaction/API calls.

### Notebooks

`PerspectiveWidget` is an [AnyWidget](https://anywidget.dev) that implements
the same API as `<perspective-viewer>`, and runs such a viewer in either
server or client (via WebAssembly) mode.

The widget is bundled entirely inside the `perspective-python` wheel, so
there is no per-host extension to install. It runs identically in
[JupyterLab](https://jupyterlab.readthedocs.io/en/stable/), classic Jupyter
Notebook, VSCode notebooks, Google Colab and Marimo. Install the `jupyter`
extra to pull in `anywidget`:

```bash
pip install "perspective-python[jupyter]"
```

Separately, the _optional_ `@perspective-dev/jupyterlab` package provides
convenient builtin viewers for `csv`, `json`, or `arrow` files in JupyterLab.
With it installed, right-click a file of one of these types and choose the
appropriate `Perspective` option from the context menu.
