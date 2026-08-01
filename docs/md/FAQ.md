# FAQ

## Installation

### Python installation fails on Windows

Python wheels are published for supported Python versions and platforms. On
Windows, ensure you have a compatible Python version and architecture. Install
with:

```bash
pip install perspective-python
```

If you encounter C++ binding errors or link errors, make sure you are using a
supported Python version and that your `pip` is up to date. Pre-built wheels
eliminate the need for a C++ compiler in most cases.

<!-- _Related: [#928](https://github.com/perspective-dev/perspective/issues/928),
[#1325](https://github.com/perspective-dev/perspective/issues/1325),
[#1025](https://github.com/perspective-dev/perspective/issues/1025)_ -->

### Python `import perspective` fails with `ImportError` or undefined symbol

This typically happens when the C++ shared library (`libpsp.so`) cannot be found
or was built against a different Python version. Ensure your Python version
matches the installed wheel. On Linux, verify that required system libraries are
present. If you see errors about `libpsp.so` or undefined symbols, try
reinstalling in a clean virtual environment.

<!-- _Related: [#937](https://github.com/perspective-dev/perspective/issues/937),
[#1120](https://github.com/perspective-dev/perspective/issues/1120),
[#1216](https://github.com/perspective-dev/perspective/issues/1216),
[#1332](https://github.com/perspective-dev/perspective/issues/1332)_ -->

### Python installation fails on macOS

On Apple Silicon (M1/M2/M3), make sure you are using a native ARM Python build,
not one running under Rosetta. The published wheels include `aarch64` variants
for supported platforms.

<!-- _Related: [#938](https://github.com/perspective-dev/perspective/issues/938),
[#1170](https://github.com/perspective-dev/perspective/issues/1170)_ -->

### How do I install Perspective in a Docker container?

Perspective's Python wheels are built against `manylinux_2_28` containers (see
[`.github/workflows/build.yaml`](../../.github/workflows/build.yaml)), so they
are compatible with most Linux distributions based on glibc 2.28+ (e.g., Debian
10+, Ubuntu 20.04+, RHEL 8+). Use a compatible base image:

```dockerfile
FROM python:3.12-slim
RUN pip install perspective-python
```

Alpine Linux uses musl instead of glibc and is **not** compatible with the
published wheels.

<!-- _Related: [#1201](https://github.com/perspective-dev/perspective/issues/1201)_ -->

## JavaScript Bundling

### How do I use Perspective with Vite, Webpack, or esbuild?

Perspective no longer exports bundler plugins. Instead, you must manually
bootstrap the WASM binaries using your bundler's asset handling. See
[Importing with or without a bundler](./how_to/javascript/importing.md) for
complete examples for Vite, Webpack, esbuild, CDN, and inline builds.

<!-- _Related: [#1734](https://github.com/perspective-dev/perspective/issues/1734),
[#2725](https://github.com/perspective-dev/perspective/issues/2725),
[#857](https://github.com/perspective-dev/perspective/issues/857),
[#1497](https://github.com/perspective-dev/perspective/issues/1497),
[#1655](https://github.com/perspective-dev/perspective/issues/1655)_ -->

## Framework Integration

### How do I use Perspective with React?

Perspective provides a dedicated
[React component](./how_to/javascript/react.md). You must also still initialize
Perspective's WebAssembly as per your bundler — see
[Importing with or without a bundler](./how_to/javascript/importing.md).

<!-- _Related: [#865](https://github.com/perspective-dev/perspective/issues/865),
[#931](https://github.com/perspective-dev/perspective/issues/931),
[#3023](https://github.com/perspective-dev/perspective/discussions/3023)_ -->

### How do I use Perspective with Next.js?

Perspective relies on Web Workers and WASM, which require client-side rendering.
Use dynamic imports with `ssr: false` in Next.js to load Perspective components
only on the client.

<!-- _Related:
[#2947](https://github.com/perspective-dev/perspective/discussions/2947),
[#2181](https://github.com/perspective-dev/perspective/discussions/2181)_ -->

### How do I use Perspective with Vue.js/Angular/etc?

As a standard Web Component, `<perspective-viewer>` works in most JavaScript web
frameworks directly via standard HTML/DOM APIs, but does not have dedicated
integration libraries for these frameworks.

<!-- _Related:
[#2787](https://github.com/perspective-dev/perspective/discussions/2787)_ -->

## Expressions

### How do I create computed/expression columns?

Use the [`expressions`](./explanation/view/config/expressions.md) config option
in your `View` to define new columns with ExprTK syntax, which must then be
_used_ somewhere else in your config (like `columns`) to actually be visible &
calculated. In `<perspective-viewer>`, expression columns can be created from
the UI column sidebar by clicking the "New Column" button.

<!-- _Related: [#1981](https://github.com/perspective-dev/perspective/issues/1981),
[#2148](https://github.com/perspective-dev/perspective/issues/2148),
[#1493](https://github.com/perspective-dev/perspective/issues/1493)_ -->

### Can I reference one expression column from another?

No, you must duplicate calculations that are shared between expression columns.

<!-- _Related: [#2148](https://github.com/perspective-dev/perspective/issues/2148)_ -->

### Can I do date arithmetic in expressions?

Yes, but they must be converted to `float` values first (`integer` is an `i32`
which is too small). See
[Expressions](./explanation/view/config/expressions.md).

<!-- _Related: [#3026](https://github.com/perspective-dev/perspective/issues/3026),
[#1768](https://github.com/perspective-dev/perspective/issues/1768)_ -->

### Can I do rolling sums or cumulative calculations?

Yes — use [Window Columns](./explanation/view/config/windows.md), the
`windows` property of a `View` config. These are ordered, partitioned rolling
computations analogous to SQL window functions, declared per-`View` like
expression columns:

```javascript
const view = await table.view({
    columns: ["Cumulative Sales"],
    windows: {
        "Cumulative Sales": {
            column: "Sales",
            aggregate: "sum",
            order_by: ["Order Date", "asc"],
            cumulative: true,
        },
    },
});
```

Window Columns are supported by Perspective's built-in engine, by the DuckDB,
ClickHouse and Polars [Virtual Servers](./explanation/virtual_servers.md), and
by the `<perspective-viewer>` UI. They update incrementally as the `Table`
updates.

<!-- _Related: [#504](https://github.com/perspective-dev/perspective/issues/504),
[#2600](https://github.com/perspective-dev/perspective/discussions/2600),
[#2624](https://github.com/perspective-dev/perspective/issues/2624)_ -->

## Filters

### Can I compose filters with OR logic?

Perspective
[filters](./explanation/view/config/selection_and_ordering.md#filter) are
composed with AND logic by default. As an alternative, you can use
[expression columns](./explanation/view/config/expressions.md) to create a
boolean column that encodes your OR logic (or any arbitrary multi-column
predicate), then filter on that column:

```javascript
const view = await table.view({
    expressions: {
        or_filter:
            "if (\"State\" == 'Texas') true; else if (\"State\" == 'California') true; else false",
    },
    filter: [["or_filter", "==", true]],
});
```

<!-- _Related: [#1192](https://github.com/perspective-dev/perspective/issues/1192)_ -->

### How do I update filters programmatically?

Set the [`filter`](./explanation/view/config/selection_and_ordering.md#filter)
property on a `View` config, or use the `<perspective-viewer>`
[`.restore()`](./how_to/javascript/save_restore.md) method to update filters at
runtime.

<!-- _Related: [#935](https://github.com/perspective-dev/perspective/issues/935)_ -->

### Does date filtering support ranges?

Date columns can be
[filtered](./explanation/view/config/selection_and_ordering.md#filter) with
comparison operators (`>`, `<`, `>=`, `<=`) to achieve range-based filtering.
Apply two filters on the same date column for a range.

<!-- _Related:
[#3100](https://github.com/perspective-dev/perspective/discussions/3100),
[#2023](https://github.com/perspective-dev/perspective/issues/2023)_ -->

## Notebooks

### `PerspectiveWidget` is not loading

`PerspectiveWidget` is an [AnyWidget](https://anywidget.dev), shipped entirely
inside the `perspective-python` wheel. There is no separate JupyterLab
extension to install or version-match for the widget, so
`jupyter labextension list` is not where to look.

Install the `jupyter` extra, which pulls in `anywidget`:

```bash
pip install "perspective-python[jupyter]"
```

Then restart the kernel — and, for JupyterLab, reload the browser page. See
the [`PerspectiveWidget` guide](./how_to/python/jupyterlab.md).

<!-- _Related: [#1392](https://github.com/perspective-dev/perspective/issues/1392),
[#2059](https://github.com/perspective-dev/perspective/issues/2059),
[#2307](https://github.com/perspective-dev/perspective/issues/2307)_ -->

### Does `PerspectiveWidget` work outside JupyterLab?

Yes. Because the widget is an AnyWidget bundled into the wheel rather than a
JupyterLab labextension, it runs in any AnyWidget-compatible host —
JupyterLab, classic Jupyter Notebook, **VSCode notebooks**, Google Colab and
Marimo — with no per-host install step.

The separate `@perspective-dev/jupyterlab` package is now _optional_ and
provides only the "Open With → Perspective" file renderers for `csv`, `json`
and `arrow` files in JupyterLab.

<!-- _Related: [#2783](https://github.com/perspective-dev/perspective/issues/2783),
[#3042](https://github.com/perspective-dev/perspective/issues/3042),
[#3056](https://github.com/perspective-dev/perspective/issues/3056)_ -->

## Memory and Performance

### Perspective has a memory leak

Maybe, but please review the
[Cleaning up resources](./how_to/javascript/deleting.md) docs carefully before
opening an Issue reporting it (and of course review
[`CONTRIBUTING.md`](https://github.com/perspective-dev/perspective/blob/master/CONTRIBUTING.md)
before opening _any_ Issue). Ensure you call `.delete()` on Views, Tables, and
`<perspective-viewer>` instances when they are no longer needed, in reverse
dependency order.

<!-- _Related: [#1037](https://github.com/perspective-dev/perspective/issues/1037),
[#1723](https://github.com/perspective-dev/perspective/issues/1723),
[#3035](https://github.com/perspective-dev/perspective/issues/3035),
[#1329](https://github.com/perspective-dev/perspective/issues/1329)_ -->

### How many rows can Perspective's built-in engine handle?

Perspective is designed for large datasets and can handle millions of rows
depending on the number of columns and available memory. Performance also
significantly depends on column types (`"string"` being slower and larger than
other types due to dictionary interning).

For larger datasets or out-of-memory virtualized datasets, see
[Virtual Servers](./explanation/virtual_servers.md).

<!-- _Related: [#341](https://github.com/perspective-dev/perspective/issues/341),
[#1719](https://github.com/perspective-dev/perspective/issues/1719),
[#1089](https://github.com/perspective-dev/perspective/issues/1089)_ -->

### How do I control threading in `perspective-python`?

The Python library uses a thread pool internally. For advanced threading
control, consult the
[multithreading documentation](./how_to/python/multithreading.md).

<!-- _Related: [#1145](https://github.com/perspective-dev/perspective/issues/1145),
[#1313](https://github.com/perspective-dev/perspective/issues/1313)_ -->

## Theming and Styling

### How do I enable dark theme?

Import `themes.css` (see [Theming](./how_to/javascript/theming.md)) and set the
theme via `restore()`:

```javascript
await viewer.restore({ theme: "Pro Dark" });
```

Or import just the dark theme directly:
`import "@perspective-dev/viewer/dist/css/pro-dark.css";`

<!-- _Related: [#950](https://github.com/perspective-dev/perspective/issues/950),
[#882](https://github.com/perspective-dev/perspective/issues/882)_ -->

### Can I create a custom cell renderer for the datagrid?

The datagrid plugin supports custom styling via
[`column_config`](https://perspective-dev.github.io/viewer/types/src_ts_ts-rs_ColumnConfigValues.ts.ColumnConfigValues.html)
and CSS custom properties, but custom cell renderers require building a custom
plugin.

<!-- _Related: [#1508](https://github.com/perspective-dev/perspective/issues/1508)_ -->

### How do I customize chart colors?

Chart colors can be customized via
[CSS custom properties](./how_to/javascript/theming.md#custom-themes) on the
`<perspective-viewer>` element.

<!-- _Related:
[#2810](https://github.com/perspective-dev/perspective/discussions/2810),
[#2859](https://github.com/perspective-dev/perspective/discussions/2859),
[#2000](https://github.com/perspective-dev/perspective/discussions/2000)_ -->

## Streaming and Real-Time Updates

### How do I stream data into a Perspective table?

Use [`table.update()`](./explanation/table/update_and_remove.md) to push new
data incrementally. For [indexed](./explanation/table/options.md) tables,
updates with matching index values will replace existing rows.

<!-- _Related: [#1133](https://github.com/perspective-dev/perspective/issues/1133),
[#1054](https://github.com/perspective-dev/perspective/issues/1054)_ -->

### `table.update()` raises "No Running Event Loop"

Perspective 3+ is now threadsafe by default and no longer requires special loop
integration.

<!-- _Related:
[#2801](https://github.com/perspective-dev/perspective/discussions/2801)_ -->

### How do I listen for data updates?

Use `view.on_update()` to register a callback that fires when the underlying
table data changes. See [Listening for events](./how_to/javascript/events.md)
and [Advanced View Operations](./explanation/view/advanced.md#update-callbacks).

<!-- _Related: [#1152](https://github.com/perspective-dev/perspective/issues/1152),
[#2912](https://github.com/perspective-dev/perspective/discussions/2912)_ -->

## Server Architecture

### What is the difference between Client-only, Client/Server, and Server-only modes?

- **Client-only**: The Perspective engine runs entirely in the browser via WASM.
  Best for small to medium datasets.
- **Client/Server (replicated)**: Data is hosted on a server and replicated to
  the client. The client has a full copy and performs queries locally.
- **Server-only**: All queries are executed on the server. The client only
  renders results. Best for very large datasets.

See [Data Architecture](./explanation/architecture.md) for detailed explanations
of each mode.

<!-- _Related:
[#2916](https://github.com/perspective-dev/perspective/discussions/2916)_ -->

### Is the WebSocket Perspective `Server` safe to expose to untrusted clients?

No. The WebSocket `Server` is not a security boundary. Every connected `Client`
is treated as the author of the queries it submits, and is permitted to create
and delete `Table`/`View` resources, author arbitrary
[expression columns](./explanation/view/config/expressions.md), and — for
[Virtual Server](./explanation/virtual_servers.md) backends like DuckDB or
ClickHouse — author SQL fragments executed under the configured database
role. The bundled WebSocket adapters
(`tornado.py`/`aiohttp.py`/`starlette.py`/`WebSocketServer`) are reference
integrations and do not authenticate, authorize, or enforce origin policy.

WebSocket Deployments that need per-user isolation must put an authenticating
proxy in front of the `Server`, run a least-privileged database role for any
`Virtual Server` backend, and/or isolate users into separate `Server`
instances. See [`SECURITY.md`](../../SECURITY.md) for the full threat model
and deployment guidance.

Obviously, none of this applies to WASM DBs like Perspective and DuckDB.

### Does Perspective sanitize SQL `Virtual Server`s?

No, by design. [Virtual Server](./explanation/virtual_servers.md) backends
interpolate client-supplied `view_id`, `table_id`, `column_name`, expression
strings, and filter operators directly into SQL templates without
parameterization or whitelist validation. The `Client` is the author of the
queries — there is no privilege boundary inside the engine for sanitization
to enforce. If your deployment needs to restrict the SQL surface area exposed
to a `Client`, the supported boundary is the database role the `Virtual Server`
is configured with (read-only etc), or better complete isolation via WASM
backend.

### How do I set up WebSocket authentication?

The [`WebSocketServer`](./how_to/javascript/nodejs_server.md) does not include
built-in authentication. Implement authentication at the transport layer (e.g.,
via middleware in your HTTP server) before the WebSocket upgrade. For more
complex needs, `WebSocketServer` is a simple example server based on the
`node:http` module which can serve as a starting point for a custom server.

<!-- _Related:
[#2788](https://github.com/perspective-dev/perspective/discussions/2788)_ -->

### Can I bind Perspective to a database?

Perspective supports [Virtual Servers](./explanation/virtual_servers.md) that
proxy queries to external data sources, with built-in implementations for e.g.
[DuckDB](./how_to/javascript/virtual_server/duckdb.md).

<!-- _Related: [#1255](https://github.com/perspective-dev/perspective/issues/1255),
[#1361](https://github.com/perspective-dev/perspective/discussions/1361)_ -->

## Aggregation

### Can I apply multiple aggregates to the same column?

Yes, by creating a duplicate/alias for your column via
[`expressions`](./explanation/view/config/expressions.md):

```javascript
await viewer.restore({
    columns: ["Sales", "Sales 2"],
    expresions: { "Sales 2": '"Sales"' },
    aggregate: {
        Sales: "sum",
        "Sales 2": "avg",
    },
});
```

<!-- _Related: [#272](https://github.com/perspective-dev/perspective/issues/272)_ -->

### Can I compute a ratio between aggregated columns?

Use [expression columns](./explanation/view/config/expressions.md) on an
aggregated View to compute ratios. Define an expression that divides one column
by another.

<!-- _Related:
[#2994](https://github.com/perspective-dev/perspective/discussions/2994),
[#3096](https://github.com/perspective-dev/perspective/discussions/3096)_ -->

## Data Loading and Arrow

### How do I load Apache Arrow data into Perspective?

Perspective natively accepts
[Apache Arrow format](./explanation/table/loading_data.md). Pass an
`ArrayBuffer` containing Arrow IPC data directly to `table()` or
`table.update()`.

<!-- _Related: [#1157](https://github.com/perspective-dev/perspective/issues/1157),
[#929](https://github.com/perspective-dev/perspective/issues/929)_ -->

### What data formats does Perspective accept?

Perspective accepts (see [Loading data](./explanation/table/loading_data.md)):

- **JavaScript**: JSON (row-oriented or column-oriented objects), CSV strings,
  Apache Arrow `ArrayBuffer`
- **Python**: `dict`, `list`, `pandas.DataFrame`, `pyarrow.Table`, CSV strings,
  Apache Arrow bytes

<!-- _Related: [#929](https://github.com/perspective-dev/perspective/issues/929),
[#2524](https://github.com/perspective-dev/perspective/issues/2524)_ -->

### CSV update fails but CSV creation works

When updating a table created with a schema, ensure the CSV column names and
types match the schema exactly. Mismatched column names or types will cause
update failures.

<!-- _Related: [#2524](https://github.com/perspective-dev/perspective/issues/2524)_ -->

## Export

### Can I export the viewer to HTML, PNG or PDF?

HTML export is available via `viewer.export({ method: "html" })`. For an
image, use `{ method: "plugin" }`, which asks the plugin to render itself —
this produces a PNG for chart plugins (and text for the datagrid). For PDF,
render the viewer and use browser or headless browser screenshot capabilities.

<!-- _Related: [#2836](https://github.com/perspective-dev/perspective/issues/2836),
[#2770](https://github.com/perspective-dev/perspective/discussions/2770),
[#2772](https://github.com/perspective-dev/perspective/issues/2772)_ -->

### Can I export data to Excel?

Perspective does not have built-in Excel export. Export data via
`view.to_csv()`, `view.to_json()`, or `view.to_arrow()` (see
[Serializing data](./how_to/javascript/serializing.md)) and convert to Excel
using a library like `xlsx` (JavaScript) or `openpyxl` (Python).

<!-- _Related:
[#2738](https://github.com/perspective-dev/perspective/discussions/2738)_ -->

### How do I copy data from a cell or row?

Use one of the `-selected` export methods, which operate on the current
selection. To place it on the clipboard:

```javascript
await viewer.copy({ method: "csv-selected" });
```

... or to get it as a string, `await viewer.export({ method: "csv-selected" })`.
`json-selected` and `arrow-selected` are also available.

<!-- _Related: [#2765](https://github.com/perspective-dev/perspective/issues/2765),
[#2356](https://github.com/perspective-dev/perspective/discussions/2356)_ -->

## Table Operations

### `table.remove()` does not update the viewer

The [`remove()`](./explanation/table/update_and_remove.md) method requires an
[indexed](./explanation/table/options.md) table. Ensure your table was created
with an `index` option, and pass the index values to remove.

<!-- _Related: [#1597](https://github.com/perspective-dev/perspective/issues/1597),
[#2293](https://github.com/perspective-dev/perspective/issues/2293)_ -->

## Viewer Configuration

### How do I save and restore the viewer state?

Use
[`viewer.save()` and `viewer.restore()`](./how_to/javascript/save_restore.md) to
serialize and deserialize the full viewer configuration.

<!-- _Related: [#1501](https://github.com/perspective-dev/perspective/issues/1501),
[#1560](https://github.com/perspective-dev/perspective/issues/1560)_ -->

### Can I hide the configuration panel?

The settings panel can be toggled programmatically via
`await viewer.restore({ settings: false })`.

<!-- _Related:
[#2581](https://github.com/perspective-dev/perspective/discussions/2581),
[#1085](https://github.com/perspective-dev/perspective/issues/1085)_ -->

### Can I collapse row groups by default?

Row group can be closed imperatively via
[`view.set_depth()`](./explanation/view/advanced.md). Expansion state is not
persisted or configurable via the `save`/`restore` API currently.

<!-- _Related:
[#2695](https://github.com/perspective-dev/perspective/discussions/2695),
[#2861](https://github.com/perspective-dev/perspective/issues/2861)_ -->

## Internationalization

### Can I change the UI language?

Perspective's UI text is defined via CSS variables, which can be customized per
theme. See the
[Icons and Translation](./how_to/javascript/theming.md#icons-and-translation)
section of the theming guide for details.

<!-- _Related: [#1934](https://github.com/perspective-dev/perspective/issues/1934),
[#2358](https://github.com/perspective-dev/perspective/issues/2358)_ -->

## Rust

### How do I build Perspective from Rust?

See the [Getting Started](./how_to/rust.md) guide for Rust. The Rust crate wraps
the C++ engine and requires a C++ toolchain. You need `cmake` installed and on
your path to build the engine.

<!-- _Related:
[#3121](https://github.com/perspective-dev/perspective/discussions/3121),
[#3080](https://github.com/perspective-dev/perspective/discussions/3080),
[#2684](https://github.com/perspective-dev/perspective/discussions/2684)_ -->

## Miscellaneous

### Can I use Perspective without `<perspective-viewer>`?

Yes. The `perspective` library (data engine) can be used independently for
server-side data processing without any UI. Use
[`table()` and `view()`](./how_to/javascript/worker.md) directly to query data.

<!-- _Related:
[#2933](https://github.com/perspective-dev/perspective/discussions/2933),
[#2644](https://github.com/perspective-dev/perspective/discussions/2644)_ -->

### Can I use Perspective in Pyodide?

Yes. Perspective publishes Emscripten wheels to PyPI under
[PEP 783](https://peps.python.org/pep-0783/), so `perspective-python` can be
installed by Pyodide's own package resolution — there is no need to download
and host a wheel yourself.

Emscripten wheels are ABI-tied to a specific Emscripten version, and thus to
the Pyodide versions built against it. If resolution fails, check that your
Pyodide version matches a published wheel tag.

<!-- _Related: [#3186](https://github.com/perspective-dev/perspective/issues/3186),
[#2880](https://github.com/perspective-dev/perspective/discussions/2880)_ -->

### How do I handle row selection events?

Listen for
[`perspective-click` and `perspective-select`](./how_to/javascript/events.md)
events on the `<perspective-viewer>` element.

<!-- _Related:
[#2589](https://github.com/perspective-dev/perspective/discussions/2589),
[#1076](https://github.com/perspective-dev/perspective/issues/1076)_ -->
