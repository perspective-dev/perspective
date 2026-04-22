The JavaScript language bindings for`<perspective-viewer>` Custom Element, the
main UI for [Perspective](https://perspective-dev.github.io).

<div class="warning">
The examples in this module are in JavaScript. See <a href="https://docs.rs/crate/perspective/latest"><code>perspective</code></a> docs for the Rust API.
</div>

## `<perspective-viewer>` Custom Element library

`<perspective-viewer>` provides a complete graphical UI for configuring the
`perspective` library and formatting its output to the provided visualization
plugins.

If you are using `esbuild` or another bundler which supports ES6 modules, you
only need to import the `perspective-viewer` libraries somewhere in your
application - these modules export nothing, but rather register the components
for use within your site's regular HTML:

```javascript
import "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
```

Once imported, the `<perspective-viewer>` Web Component will be available in any
standard HTML on your site. A simple example:

```html
<perspective-viewer id="view1"></perspective-viewer>
```

or

```javascript
const viewer = document.createElement("perspective-viewer");
```

### Theming

Theming is supported in `perspective-viewer` and its accompanying plugins. A
number of themes come bundled with `perspective-viewer`; you can import any of
these themes directly into your app, and the `perspective-viewer`s will be
themed accordingly:

```javascript
// Themes based on Thought Merchants's Prospective design
import "@perspective-dev/viewer/dist/css/pro.css";
import "@perspective-dev/viewer/dist/css/pro-dark.css";

// Other themes
import "@perspective-dev/viewer/dist/css/solarized.css";
import "@perspective-dev/viewer/dist/css/solarized-dark.css";
import "@perspective-dev/viewer/dist/css/monokai.css";
import "@perspective-dev/viewer/dist/css/vaporwave.css";
```

Alternatively, you may use `themes.css`, which bundles all default themes

```javascript
import "@perspective-dev/viewer/dist/css/themes.css";
```

If you choose not to bundle the themes yourself, they are available through
[CDN](https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/css/). These can
be directly linked in your HTML file:

```html
<link
    rel="stylesheet"
    crossorigin="anonymous"
    href="https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/css/pro.css"
/>
```

Note the `crossorigin="anonymous"` attribute. When including a theme from a
cross-origin context, this attribute may be required to allow
`<perspective-viewer>` to detect the theme. If this fails, additional themes are
added to the `document` after `<perspective-viewer>` init, or for any other
reason theme auto-detection fails, you may manually inform
`<perspective-viewer>` of the available theme names with the `.resetThemes()`
method.

```javascript
// re-auto-detect themes
viewer.resetThemes();

// Set available themes explicitly (they still must be imported as CSS!)
viewer.resetThemes(["Pro Light", "Pro Dark"]);
```

`<perspective-viewer>` will default to the first loaded theme when initialized.
You may override this via `.restore()`, or provide an initial theme by setting
the `theme` attribute:

```html
<perspective-viewer theme="Pro Light"></perspective-viewer>
```

or

```javascript
const viewer = document.querySelector("perspective-viewer");
await viewer.restore({ theme: "Pro Dark" });
```

### Loading data into `<perspective-viewer>`

Data can be loaded into `<perspective-viewer>` in the form of a `Table()` or a
`Promise<Table>` via the `load()` method.

```javascript
// Create a new worker, then a new table promise on that worker.
const worker = await perspective.worker();
const table = await worker.table(data);

// Bind a viewer element to this table.
await viewer.load(table);
```

### Sharing a `table()` between multiple `perspective-viewer`s

Multiple `perspective-viewer`s can share a `table()` by passing the `table()`
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

### Server-only via `WebSocketServer()` and Node.js

Loading a virtual (server-only) [`Table`] works just like loading a local/Web
Worker [`Table`] - just pass the virtual [`Table`] to `viewer.load()`:

In the browser:

```javascript
const elem = document.getElementsByTagName("perspective-viewer")[0];

// Bind to the server's worker instead of instantiating a Web Worker.
const websocket = await perspective.websocket(
    window.location.origin.replace("http", "ws"),
);

// Bind the viewer to the preloaded data source.  `table` and `view` objects
// live on the server.
const server_table = await websocket.open_table("table_one");
await elem.load(server_table);

// Or load data from a table using a view. The browser now also has a copy of
// this view in its own `table`, as well as its updates transferred to the
// browser using Apache Arrow.
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

### Persistent `<perspective-viewer>` configuration via `save()`/`restore()`.

`<perspective-viewer>` is _persistent_, in that its entire state (sans the data
itself) can be serialized or deserialized. This include all column, filter,
pivot, expressions, etc. properties, as well as datagrid style settings, config
panel visibility, and more. This overloaded feature covers a range of use cases:

- Setting a `<perspective-viewer>`'s initial state after a `load()` call.
- Updating a single or subset of properties, without modifying others.
- Resetting some or all properties to their data-relative default.
- Persisting a user's configuration to `localStorage` or a server.

#### Serializing and deserializing the viewer state

To retrieve the entire state as a JSON-ready JavaScript object, use the `save()`
method. `save()` also supports a few other formats such as `"arraybuffer"` and
`"string"` (base64, not JSON), which you may choose for size at the expense of
easy migration/manual-editing.

```javascript
const json_token = await elem.save();
const string_token = await elem.save("string");
```

For any format, the serialized token can be restored to any
`<perspective-viewer>` with a `Table` of identical schema, via the `restore()`
method. Note that while the data for a token returned from `save()` may differ,
generally its schema may not, as many other settings depend on column names and
types.

```javascript
await elem.restore(json_token);
await elem.restore(string_token);
```

As `restore()` dispatches on the token's type, it is important to make sure that
these types match! A common source of error occurs when passing a
JSON-stringified token to `restore()`, which will assume base64-encoded msgpack
when a string token is used.

```javascript
// This will error!
await elem.restore(JSON.stringify(json_token));
```

#### Updating individual properties

Using the JSON format, every facet of a `<perspective-viewer>`'s configuration
can be manipulated from JavaScript using the `restore()` method. The valid
structure of properties is described via the
[`ViewerConfig`](https://github.com/perspective-dev/perspective/blob/ebced4caa/rust/perspective-viewer/src/ts/viewer.ts#L16)
and embedded
[`ViewConfig`](https://github.com/perspective-dev/perspective/blob/ebced4caa19435a2a57d4687be7e428a4efc759b/packages/perspective/index.d.ts#L140)
type declarations, and [`View`](view.md) chapter of the documentation which has
several interactive examples for each `ViewConfig` property.

```javascript
// Set the plugin (will also update `columns` to plugin-defaults)
await elem.restore({ plugin: "X Bar" });

// Update plugin and columns (only draws once)
await elem.restore({ plugin: "X Bar", columns: ["Sales"] });

// Open the config panel
await elem.restore({ settings: true });

// Create an expression
await elem.restore({
    columns: ['"Sales" + 100'],
    expressions: { "New Column": '"Sales" + 100' },
});

// ERROR if the column does not exist in the schema or expressions
// await elem.restore({columns: ["\"Sales\" + 100"], expressions: {}});

// Add a filter
await elem.restore({ filter: [["Sales", "<", 100]] });

// Add a sort, don't remove filter
await elem.restore({ sort: [["Prodit", "desc"]] });

// Reset just filter, preserve sort
await elem.restore({ filter: undefined });

// Reset all properties to default e.g. after `load()`
await elem.reset();
```

Another effective way to quickly create a token for a desired configuration is
to simply copy the token returned from `save()` after settings the view manually
in the browser. The JSON format is human-readable and should be quite easy to
tweak once generated, as `save()` will return even the default settings for all
properties. You can call `save()` in your application code, or e.g. through the
Chrome developer console:

```javascript
// Copy to clipboard
copy(await document.querySelector("perspective-viewer").save());
```

### Update events

Whenever a `<perspective-viewer>`s underlying `table()` is changed via the
`load()` or `update()` methods, a `perspective-view-update` DOM event is fired.
Similarly, `view()` updates instigated either through the Attribute API or
through user interaction will fire a `perspective-config-update` event:

```javascript
elem.addEventListener("perspective-config-update", function (event) {
    var config = elem.save();
    console.log("The view() config has changed to " + JSON.stringify(config));
});
```

### Click events

Whenever a `<perspective-viewer>`'s grid or chart is clicked, a
`perspective-click` DOM event is fired containing a detail object with `config`,
`column_names`, and `row`.

The `config` object contains an array of `filters` that can be applied to a
`<perspective-viewer>` through the use of `restore()` updating it to show the
filtered subset of data.

The `column_names` property contains an array of matching columns, and the `row`
property returns the associated row data.

```javascript
elem.addEventListener("perspective-click", function (event) {
    var config = event.detail.config;
    elem.restore(config);
});
```
