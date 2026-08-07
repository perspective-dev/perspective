# `<perspective-viewer>` Custom Element library

`<perspective-viewer>` provides a complete graphical UI for configuring the
`perspective` library and formatting its output to the provided visualization
plugins.

Once imported and initialized in JavaScript, the `<perspective-viewer>` Web
Component will be available in any standard HTML on your site. A simple example:

```html
<perspective-viewer id="view1"></perspective-viewer>
<script type="module">
    import perspective from "@perspective-dev/client";
    import "@perspective-dev/viewer";

    const viewer = document.getElementById("view1");
    const worker = await perspective.worker();
    await worker.table(data, { name: "my_table" });

    await viewer.load(worker);
    await viewer.restore({ table: "my_table" });
</script>
```

`load()` binds the viewer to a `Client`, and `restore()` selects which of that
client's `Table`s to show via the `table` field. Because `load()` alone
selects no table, it does not render — the pair guarantees exactly one atomic
render.

Passing a `Table` directly is still supported as a legacy shorthand,

```javascript
await viewer.load(table);
```

... which is internally equivalent to:

```javascript
await viewer.load(await table.get_client());
await viewer.restore({ table: await table.get_name() });
```

<div class="warning">Always give your <code>Table</code> a <code>name</code>.
When <code>name</code> is omitted a random one is assigned, so the
<code>table</code> field in a token from <code>save()</code> will not match
the table after a page reload, and <code>restore()</code> will fail.</div>

## Attributes

`<perspective-viewer>` can be configured via HTML attributes or JavaScript
properties. When set as attributes, the viewer will apply the configuration on
initialization:

```html
<perspective-viewer
    columns='["Sales", "Profit"]'
    group-by='["Region"]'
    sort='[["Sales", "desc"]]'>
</perspective-viewer>
```

## UI Features

The viewer provides an interactive side panel with:

- **Column list** - drag and drop columns to configure `group_by`, `split_by`,
  `sort`, and `filter` fields.
- **New Column** button - opens an expression editor for creating computed
  columns via the [expression language](../../explanation/view/config/expressions.md).
- **Plugin selector** - switch between the visualization plugins registered on
  the page. `@perspective-dev/viewer-datagrid` provides `Datagrid`;
  `@perspective-dev/viewer-charts` provides `X Bar`, `Y Bar`, `Y Line`,
  `Y Scatter`, `Y Area`, `X/Y Scatter`, `X/Y Line`, `Density`, `Treemap`,
  `Sunburst`, `Heatmap`, `Candlestick`, `OHLC`, `Map Scatter`, `Map Line` and
  `Map Density`.
- **Theme** selector - toggle between available themes.
- **Export** - download the current view as CSV or Arrow.
- **Copy** - copy the current view to the clipboard.
- **Reset** - restore the viewer to its default configuration.

## Methods

A `<perspective-viewer>` hosts one or more _panels_. Methods which address a
single panel take an options-dict with an optional `panel` id, defaulting to
the _active_ panel — e.g. `await viewer.save({ panel: "PANEL_ID_0" })`.

### Binding

| Method | Description |
|---|---|
| `load(client)` | Bind a `Client` (or, legacy, a `Table`) to the viewer |
| `eject(options?)` | Remove a `Client` and dispose every panel bound to it |
| `delete()` | Release the element's resources |
| `getClient(options?)` | Get a bound `Client` |
| `getTable(options?)` | Get a panel's `Table` |
| `getView(options?)` | Get a panel's `View` |
| `getViewConfig(options?)` | Get a panel's `ViewConfig` |

### Configuration

| Method | Description |
|---|---|
| `save(options?)` | Serialize one panel's configuration |
| `restore(config, options?)` | Apply a configuration to one panel |
| `saveWorkspace()` | Serialize the whole element — every panel, plus layout and global filters |
| `restoreWorkspace(config)` | Restore a whole-element configuration |
| `reset(all?, options?)` | Reset configuration (pass `true` to also reset expressions) |
| `resetError()` | Clear the error overlay |

### Panels

| Method | Description |
|---|---|
| `addPanel(config)` | Add a panel, returning its generated id |
| `removePanel(id)` | Remove a panel |
| `getPanelNames()` | List panel ids |
| `getActivePanel()` / `setActivePanel(id)` | Get or set the active panel |

### Output

| Method | Description |
|---|---|
| `export(options?)` | Export a panel — see the export methods below |
| `download(options?)` | Export and download as a file |
| `copy(options?)` | Copy a panel to the clipboard |

`export()`, `download()` and `copy()` all take a `method`, one of `"csv"`,
`"json"`, `"ndjson"` or `"arrow"` — each with `-all` and `-selected` variants
(e.g. `"csv-selected"`) — plus `"html"`, `"json-config"`, and `"plugin"`.
The `"plugin"` method asks the plugin to render itself, which produces a PNG
for charts and text for the datagrid.
| `getSelection(options?)` / `setSelection(...)` | Get or set the selected region |
| `getEditPort(options?)` | Get a panel's edit port |
| `getRenderStats(options?)` | Get render timing statistics |

### Rendering and chrome

| Method | Description |
|---|---|
| `flush()` | Wait for any pending UI updates to complete |
| `resize(options?)` | Redraw, optionally at a `{dimensions: {width, height}}` size hint |
| `setAutoSize(bool)` / `setAutoPause(bool)` / `setThrottle(ms)` | Render policy |
| `toggleConfig(force?)` | Toggle the settings sidebar |
| `toggleColumnSettings(...)` | Toggle the column settings sidebar |
| `resetThemes(themes?)` | Re-detect or explicitly set available themes |
| `restyleElement()` | Re-read CSS and repaint |
| `getPlugin(name?)` / `getAllPlugins()` | Look up registered plugins |

See [Saving and restoring UI state](./save_restore.md) for the `save`/`restore`
formats and the panel selector, and
[Plugin render limits](./plugin_settings.md) for `getPlugin`.
