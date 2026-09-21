# Interactive pivot tables and charts in Jupyter

<!-- description: PerspectiveWidget is an interactive data grid, pivot table and charting widget for JupyterLab, Jupyter Notebook, VS Code, Colab and marimo. Pass it a pandas, polars or pyarrow DataFrame and explore millions of rows without writing plotting code. -->

`PerspectiveWidget` puts the full `<perspective-viewer>` UI in a notebook
cell. Pass it a DataFrame and you get a sortable, filterable data grid; drag a
column to _Group By_ and it becomes a pivot table; pick a chart type and it
becomes a bar, line, scatter, heatmap, treemap or map — all without writing
plotting code or re-running the cell.

```bash
pip install "perspective-python[jupyter]"
```

```python
import pandas as pd
from perspective.widget import PerspectiveWidget

df = pd.read_parquet("trips.parquet")
PerspectiveWidget(df)
```

It is built on [anywidget](https://anywidget.dev/), so the same wheel works in
JupyterLab, classic Jupyter Notebook, VS Code notebooks, Google Colab and
marimo, with no separate lab extension to install or version-match.

## Why use it instead of `df.head()` or a plotting library

- **The whole DataFrame, not a preview.** The grid virtual-scrolls, so a
  multi-million row frame is browsable, sortable and filterable in place.
- **Exploration without code.** Grouping, pivoting, aggregating, filtering and
  charting are drag-and-drop. Computed columns use a built-in
  [expression language](../explanation/view/config/expressions.md).
- **Reproducible.** Every choice made in the UI is a keyword argument, so an
  exploration can be frozen back into the cell:

```python
PerspectiveWidget(
    df,
    plugin="Heatmap",
    group_by=["pickup_hour"],
    split_by=["weekday"],
    columns=["fare"],
    aggregates={"fare": "avg"},
)
```

- **Live.** Pass a `perspective.Table` instead of a DataFrame and call
  `table.update()` from another cell or thread; the widget ticks in real time.

## pandas, polars and pyarrow

`pandas.DataFrame`, `polars.DataFrame`, `pyarrow.Table`, Arrow IPC bytes, CSV
strings, and lists or dicts of Python values are all accepted directly; see
[DataFrame and Arrow compatibility](../how_to/python/table_data.md).

## Where the data lives

By default (`binding_mode="server"`) the data stays in the Python kernel and
the browser is streamed only the window of rows it is displaying, so very
large frames open quickly. For the most fluid interaction on small and medium
data, `binding_mode="client-server"` additionally replicates the table into
the browser's WebAssembly engine:

```python
PerspectiveWidget(df, binding_mode="client-server")
```

For frames which strain the kernel's memory, build the table with
[`page_to_disk`](../explanation/table/options.md#page_to_disk) so its columns
are memory-mapped from disk, and pass the table to the widget:

```python
import perspective

table = perspective.table(df, page_to_disk=True)
PerspectiveWidget(table)
```

See [`PerspectiveWidget` for notebooks](../how_to/python/jupyterlab.md) for the
full widget API.

## From notebook to application

The engine and UI in the notebook are the same ones used in production web
applications. A configuration explored in Jupyter can be saved as JSON and
restored in a `<perspective-viewer>` served from
[Tornado, FastAPI or aiohttp](../how_to/python/websocket.md).
