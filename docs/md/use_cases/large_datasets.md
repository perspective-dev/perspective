# Visualizing millions of rows in the browser

<!-- description: How Perspective renders data grids, pivot tables and charts over millions of rows in a browser tab: a columnar C++ engine compiled to WebAssembly, Apache Arrow loading, virtual-scrolling grid, WebGL charts, a 64-bit memory64 build, and server-side virtualization for data that does not fit. -->

Most JavaScript data grids and charting libraries hold rows as JavaScript
objects and lay out one DOM or SVG node per datum, which stalls somewhere
between ten thousand and a few hundred thousand rows. Perspective takes a
different approach at each layer:

- **Columnar engine in WebAssembly.** Data is stored in typed, columnar
  buffers inside a C++ query engine compiled to WebAssembly and run in a Web
  Worker, off the main thread. Strings are dictionary-encoded. Nothing is
  materialized as JavaScript objects unless you ask for it.
- **Apache Arrow in, Apache Arrow out.** A [`Table`](../explanation/table.md)
  loads [Arrow](../explanation/table/loading_data.md) directly into those
  buffers without per-row parsing, and `View.to_arrow()` exports the same way.
  CSV and JSON are also supported.
- **Queries, not rows, cross the boundary.** Grouping, pivoting, filtering and
  sorting happen inside the engine. The UI requests only the window of the
  result it is about to draw.
- **Virtual-scrolling data grid.** The
  [Datagrid](https://www.npmjs.com/package/@perspective-dev/viewer-datagrid)
  renders only visible cells, so scrolling a 10 million row grid costs the same
  as scrolling a 100 row grid.
- **WebGL charts.** Scatter, heatmap, line and map plugins draw on the GPU,
  staying interactive at point counts where SVG and 2D canvas charts do not.

## Loading a large file

```javascript
const worker = await perspective.worker();
const response = await fetch("/data/trips.arrow");
const table = await worker.table(await response.arrayBuffer());
await document.querySelector("perspective-viewer").load(table);
```

Prefer Arrow (optionally LZ4 or ZSTD compressed) over CSV or JSON for large
datasets: it is smaller on the wire, carries its own schema, and skips type
inference.

## More than 4GB: Memory64

32-bit WebAssembly caps the engine's heap at 4GB.
`@perspective-dev/server` also ships a
[Memory64 build](../how_to/javascript/importing.md) which raises the ceiling
to 16GB in browsers which support it. Register both binaries and only the one
the browser selects is downloaded:

```javascript
perspective.init_server({
    wasm32: () => fetch(SERVER_WASM),
    wasm64: () => fetch(SERVER_WASM64),
});
```

## More than memory: `page_to_disk`

A `Table` normally lives in the engine's memory. Created with
[`page_to_disk`](../explanation/table/options.md#page_to_disk), its columns
are backed by on-disk storage instead — the browser's Origin Private File
System under WebAssembly, memory-mapped files in Python and Rust — and the
engine evicts the coldest columns to it when it is over its
resident memory budget (1 GiB by default in the browser), reading them back
when a query needs them.

```javascript
const table = await worker.table(await response.arrayBuffer(), {
    page_to_disk: true,
});
```

Everything else about the `Table` is unchanged, including streaming updates
and the viewer on top of it. Use it for wide tables where users touch a few
columns at a time, or to hold several large tables in one tab; leave it off
for data which fits, since a query over evicted columns pays to read them
back.

## How many rows?

It depends on column count and types more than row count — numeric and
datetime columns are compact, high-cardinality strings are not. Millions of
rows is routine; tens of millions is practical for narrow numeric tables. Free
memory by calling [`delete()`](../how_to/javascript/deleting.md) on views and
tables you no longer need, and consider `page_to_disk` for tables which are
large but only partly in use at any moment.

## When the data does not fit in the browser

Keep it on a server and send the browser only what is visible:

- **[Server-only mode](../explanation/architecture/server_only.md)** — the
  same engine, running natively in Python, Node.js or Rust, with the browser
  connected over WebSocket.
- **[Virtual servers](../explanation/virtual_servers.md)** — no Perspective
  engine at all. View configurations are translated to SQL and run by DuckDB,
  ClickHouse, PostgreSQL or Polars, which can be as large as those systems
  allow.

In both modes the viewer, its configuration and its saved layouts are
identical to the in-browser case.

## Examples

- [Olympics](https://perspective-dev.github.io/gallery/olympics.html) — 120
  years of athlete records loaded from Arrow and pivoted in-browser.
- [NYPD CCRB](https://perspective-dev.github.io/gallery/nypd.html) —
  complaint records cross-filtered across grid and heatmaps.
