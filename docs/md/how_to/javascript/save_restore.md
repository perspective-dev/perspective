# Saving and restoring UI state.

`<perspective-viewer>` is _persistent_, in that its entire state (sans the data
itself) can be serialized or deserialized. This include all column, filter,
pivot, expressions, etc. properties, as well as datagrid style settings, config
panel visibility, and more. This overloaded feature covers a range of use cases:

- Setting a `<perspective-viewer>`'s initial state after a `load()` call.
- Updating a single or subset of properties, without modifying others.
- Resetting some or all properties to their data-relative default.
- Persisting a user's configuration to `localStorage` or a server.

## Serializing and deserializing the viewer state

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

### Updating individual properties

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

## Multi-panel viewers

`save()` and `restore()` operate on a _single_ panel — the _active_ one by
default, or a specific panel via their optional `{ panel }` selector (e.g.
`await elem.save({ panel: "my-panel" })`). If `restore()`'s `panel` names no
existing panel, a new panel is created with that id.

A `<perspective-viewer>` may host multiple panels. To serialize or restore the
_whole element_ — every panel plus the layout and cross-filter state — use
`saveWorkspace()` and `restoreWorkspace()` instead:

```javascript
const workspace_token = await elem.saveWorkspace();
await elem.restoreWorkspace(workspace_token);
```

A `saveWorkspace()` token is a `WorkspaceConfig` (`{ version, layout, panels,
... }`), not a `ViewerConfig` — passing it to the single-panel `restore()` will
_not_ restore the layout (its `panels`/`layout` keys are ignored).
