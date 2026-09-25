# Glossary

<!-- description: Definitions of the terms used by Perspective and by data grid, pivot table and streaming analytics tools generally: Table, View, group by, split by, virtual server, replicated and server-only modes, virtual scrolling, Apache Arrow, WebAssembly and Memory64. -->

Short definitions of the terms used throughout this guide.

## Data grid

A scrollable, sortable table of rows and columns rendered in a user interface.
Perspective's data grid, the
[Datagrid plugin](https://www.npmjs.com/package/@perspective-dev/viewer-datagrid),
is _virtualized_: it renders only the visible cells, so its cost is independent
of the number of rows.

## Pivot table

A table which groups rows by one or more columns (row pivots), optionally
splits them across the distinct values of other columns (column pivots), and
shows an aggregate in each cell. In Perspective, row pivots are `group_by` and
column pivots are `split_by`. See
[Grouping and Pivots](./explanation/view/config/grouping_and_pivots.md).

## Streaming pivot table

A pivot table whose groups and aggregates are updated incrementally as rows
are inserted, updated or removed, rather than recomputed. See
[Streaming pivot tables](./use_cases/streaming_pivot_table.md).

## `Table`

Perspective's columnar, typed data store. A [`Table`](./explanation/table.md)
is created from a schema or a dataset (Apache Arrow, CSV, JSON, or a DataFrame
in Python), and modified with `update()`, `remove()`, `clear()` and
`replace()`.

## `View`

A continuous query over a `Table`: a combination of `group_by`, `split_by`,
`columns`, `aggregates`, `filter`, `sort` and `expressions`. A
[`View`](./explanation/view.md) stays current as its `Table` changes and
notifies `on_update` subscribers.

## `group_by`

The columns whose distinct values become the rows of a pivot. Multiple levels
form an expandable tree with subtotals.

## `split_by`

The columns whose distinct values become the column headers of a pivot.

## Aggregate

The function which reduces a group's values to one cell — `sum`, `avg`,
`count`, `distinct count`, `median`, `weighted mean`, `first`, `last` and
others. Chosen per column.

## Expression column

A computed column defined in Perspective's
[expression language](./explanation/view/config/expressions.md), based on
ExprTK. Expressions are evaluated column-wise inside the engine and can be
grouped, filtered, sorted and aggregated like stored columns.

## Index

A `Table` option naming a primary key column. Updates to an indexed table
replace the row with the matching key (and may be partial); without an index,
updates append. See [`index` and `limit`](./explanation/table/options.md).

## Limit

A `Table` option which keeps only the most recent _n_ rows, for rolling
windows over unbounded streams.

## `page_to_disk`

A `Table` option which backs the table's columns with on-disk storage — the
Origin Private File System in the browser, memory-mapped files natively — so
a `Table` can exceed the engine's memory. See
[`page_to_disk`](./explanation/table/options.md#page_to_disk).

## `<perspective-viewer>`

The Web Component (Custom Element) providing Perspective's user interface:
configuration panel, plugins, themes, multi-panel layout and save/restore.

## Plugin

A visualization hosted by `<perspective-viewer>` — the Datagrid, or one of
the WebGL charts (bar, line, area, scatter, heatmap, treemap, sunburst,
candlestick, OHLC, maps).

## Client, Server

A `Server` owns tables and executes queries. A `Client` is a handle to a
`Server`, whether that server is in the same process, in a Web Worker, or
across a WebSocket. The API is the same in every case.

## Client-only mode

The engine runs in the browser as WebAssembly in a Web Worker; no server is
involved. See [Client-only](./explanation/architecture/client_only.md).

## Client/server replicated mode

A server owns the authoritative `Table`; each browser keeps a synchronized
copy and queries it locally. See
[Client/Server replicated](./explanation/architecture/client_server.md).

## Server-only mode

Queries run on the server and the browser receives only the rows it is
displaying. See [Server only](./explanation/architecture/server_only.md).

## Virtual server

An implementation of Perspective's protocol over an external query engine,
such as DuckDB, ClickHouse, PostgreSQL or Polars, which translates view
configurations into that engine's native queries. See
[Virtual Servers](./explanation/virtual_servers.md).

## Virtual scrolling

Rendering only the rows and columns currently in the viewport, and fetching
more as the user scrolls.

## Apache Arrow

A language-independent columnar memory format. It is Perspective's preferred
interchange format: it loads without parsing and preserves types.

## WebAssembly

A portable binary instruction format which runs at near-native speed in
browsers. Perspective's C++ query engine and Rust UI are both compiled to
WebAssembly.

## Memory64

A WebAssembly extension for 64-bit memory addressing. Perspective ships an
optional Memory64 engine build which raises the in-browser heap limit from
4GB to 16GB.
