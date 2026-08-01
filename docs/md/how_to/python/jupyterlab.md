# `PerspectiveWidget` for notebooks

Building on top of the API provided by `perspective.Table`, the
`PerspectiveWidget` offers the entire functionality of Perspective within a
notebook environment. It supports the same API semantics of
`<perspective-viewer>`, along with the additional data types supported by
`perspective.Table`.

## Installation

`PerspectiveWidget` is an [AnyWidget](https://anywidget.dev), shipped as a
prebuilt bundle inside the `perspective-python` wheel. There is no separate
labextension to install or version-match — install the `jupyter` extra, which
adds the `anywidget` dependency:

```bash
pip install "perspective-python[jupyter]"
```

The same wheel works in JupyterLab, classic Jupyter Notebook, VSCode
notebooks, Google Colab and Marimo.

<div class="warning">The <code>@perspective-dev/jupyterlab</code> package is
now <em>optional</em> and no longer ships the widget. It provides only the
"Open With &rarr; Perspective" file renderers for <code>csv</code>,
<code>json</code> and <code>arrow</code> files in JupyterLab.</div>

## Usage

`PerspectiveWidget` takes keyword arguments for the managed `View`:

```python
from perspective.widget import PerspectiveWidget
w = perspective.PerspectiveWidget(
    data,
    plugin="X Bar",
    aggregates={"datetime": "any"},
    sort=[["date", "desc"]]
)
```

## Creating a widget

A widget is created through the `PerspectiveWidget` constructor, which takes as
its first, required parameter a `perspective.Table`, a dataset, a schema, or
`None`, which serves as a special value that tells the Widget to defer loading
any data until later. In maintaining consistency with the Javascript API,
Widgets cannot be created with empty dictionaries or lists — `None` should be
used if the intention is to await data for loading later on. A widget can be
constructed from a dataset:

```python
from perspective.widget import PerspectiveWidget
PerspectiveWidget(data, group_by=["date"])
```

.. or a schema:

```python
PerspectiveWidget({"a": int, "b": str})
```

.. or an instance of a `perspective.Table`:

```python
table = perspective.table(data)
PerspectiveWidget(table)
```

## Updating a widget

`PerspectiveWidget` shares a similar API to the `<perspective-viewer>` Custom
Element, and has similar `save()` and `restore()` methods that
serialize/deserialize UI state for the widget.

## `PerspectiveRenderer`

The optional `@perspective-dev/jupyterlab` package exposes a JS-only
`mimerender-extension`. This lets you view `csv`, `json`, and `arrow` files
directly from the JupyterLab file browser — right-click one of these files and
choose `Open With → Perspective`.

```bash
jupyter labextension install @perspective-dev/jupyterlab
```

This package is independent of `PerspectiveWidget`; install it only if you
want the file renderers.
