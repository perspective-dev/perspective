# Loading data from a Table

Data can be loaded into `<perspective-viewer>` in the form of a `Table()` or a
`Promise<Table>` via the `load()` method.

```javascript
// Create a new worker, then a new table promise on that worker.
const worker = await perspective.worker();
const table = await worker.table(data);

// Bind a viewer element to this table.
await viewer.load(table);
```

## Sharing a `Table` between multiple `<perspective-viewer>`s

Multiple `<perspective-viewer>`s can share a `table()` by passing the `table()`
into the `load()` method of each viewer. Each `perspective-viewer` will update
when the underlying `table()` is updated, but `table.delete()` will fail until
all `perspective-viewer` instances referencing it are also deleted:

```javascript
const viewer1 = document.getElementById("viewer1");
const viewer2 = document.getElementById("viewer2");

// Create a new WebWorker
const worker = await perspective.worker();

// Create a table in this worker
const table = await worker.table(data);

// Load the same table in 2 different <perspective-viewer> elements
await viewer1.load(table);
await viewer2.load(table);

// Both `viewer1` and `viewer2` will reflect this update
await table.update([{ x: 5, y: "e", z: true }]);
```

## Loading from a virtual `Table`

Loading a virtual (server-only) `Table` works just like loading a local/Web
Worker `Table` — just pass the virtual `Table` to `viewer.load()`. In the
browser:

```javascript
const elem = document.getElementsByTagName("perspective-viewer")[0];

// Bind to the server's worker instead of instantiating a Web Worker.
const websocket = await perspective.websocket(
    window.location.origin.replace("http", "ws")
);

// Bind the viewer to the preloaded data source.  `table` and `view` objects
// live on the server.
const server_table = await websocket.open_table("table_one");
await elem.load(server_table);
```

Alternatively, data can be _cloned_ from a server-side virtual `Table` into a
client-side WebAssembly `Table`. The browser clone will be synced via delta
updates transferred via Apache Arrow IPC format, but local `View`s created will
be calculated locally on the client browser.

```javascript
const worker = await perspective.worker();
const server_view = await server_table.view();
const client_table = worker.table(server_view);
await elem.load(client_table);
```

`<perspective-viewer>` instances bound in this way are otherwise no different
than `<perspective-viewer>`s which rely on a Web Worker, and can even share a
host application with Web Worker-bound `table()`s. The same `promise`-based API
is used to communicate with the server-instantiated `view()`, only in this case
it is over a websocket.

## Nested columns

Perspective's data model is flat, so nested Arrow and JSON values are
normalized on ingest, controlled by three `Table` options.

`struct_flatten` applies to Arrow `struct` columns and to JSON objects.
`"pivot"` (the default) hoists each field into its own dotted column, so
`{ s: { a: 1 } }` becomes a column `s.a`. `"stringify"` keeps the whole value
as JSON text in a single string column, with datetimes as epoch milliseconds;
`"stringify_formatted"` writes them as the text `to_json` emits under
`formatted`.

`map_flatten` applies to Arrow `map` columns. `"pivot"` makes a map `m` one
column `m.<key>` per distinct key in the batch, with a null where a row lacks
the key, and `"stringify"` or `"stringify_formatted"` keeps the map as JSON
text. When unset it follows `struct_flatten`. JSON has no map type, so JSON objects always follow
`struct_flatten`.

`list_flatten` applies to Arrow `list` columns and JSON arrays. `"zip"` (the
default) expands a row into one row per element, repeating its siblings, and
requires sibling lists in a row to agree in length. `"cartesian"` expands to
the product of the lists' lengths. `"stringify"` keeps each list as a JSON
array in a string column, with datetimes and dates as epoch milliseconds, as
in `to_json`; `"stringify_formatted"` writes them as the text `to_json` emits
under `formatted`.

The options compose from the outside in: a list inside a stringified struct
stays inside its JSON text, a struct inside an expanded list is stringified
once per element row, and a struct under a pivoted map is stringified once per
key column when `struct_flatten` is `"stringify"` and `map_flatten` is
`"pivot"`.

```javascript
const table = await worker.table(
    [{ id: 1, m: { a: 1, b: 2 } }, { id: 2, m: { b: 3 } }],
    { struct_flatten: "pivot" },
);

// { id: [1, 2], "m.a": [1, null], "m.b": [2, 3] }
await (await table.view()).to_columns();
```
