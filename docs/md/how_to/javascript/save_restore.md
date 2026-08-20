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
[`ViewerConfigUpdate`](https://github.com/perspective-dev/perspective/blob/master/rust/perspective-viewer/src/ts/ts-rs/ViewerConfigUpdate.ts)
and embedded
[`ViewConfigUpdate`](https://github.com/perspective-dev/perspective/blob/master/rust/perspective-js/src/ts/ts-rs/ViewConfigUpdate.ts)
type declarations (both generated from the Rust definitions), and the
[`View`](../../explanation/view.md) chapter of the documentation which has
several examples for each `ViewConfig` property.

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

A `saveWorkspace()` token is a `WorkspaceConfig`
(`{ version, layout, panels, ... }`), not a `ViewerConfig` — passing it to the
single-panel `restore()` will _not_ restore the layout (its `panels`/`layout`
keys are ignored).

## Colors, palettes and gradients

Per-column color styling lives in a panel's `columns_config`, keyed by column
name, and every color-scale value is a string usable verbatim in CSS:

| Kind     | Value                                                                               |
| -------- | ----------------------------------------------------------------------------------- |
| color    | `"#rrggbb"` (`#rgb`, `rgb()` and `rgba()` are accepted on input)                    |
| palette  | `"linear-gradient(to right, #rrggbb, #rrggbb, …)"` — N colors, **no** positions     |
| gradient | `"linear-gradient(to right, #rrggbb 0%, #rrggbb 37.5%, …)"` — every stop positioned |

Which reader applies is decided by the style control's kind (the datagrid's
`fg_colors`/`bg_colors` and the charts' `gradient` are gradients; `palette` is a
palette), never by inspecting the string — a position anywhere in a palette is
rejected, while a gradient may omit positions on input (the CSS
implicit-position rules fill them) and may carry any direction token, which is
normalized to `to right`. Values equal to the plugin's default are not
serialized.

```javascript
await viewer.restore({
    plugin: "Datagrid",
    columns_config: {
        Profit: {
            number_bg_mode: "gradient",
            bg_colors: "linear-gradient(to right, #ff0000, #ffffff, #0000ff)",
        },
    },
});
```

Any of these may instead be a reference to a CSS custom property of the same
kind — `"var(--psp-user--color-<name>)"`, `"var(--psp-user--palette-<name>)"` or
`"var(--psp-user--gradient-<name>)"`. References are resolved when the config is
written, against the element's computed style: the `palette` of the last
`restoreWorkspace()` (below) takes precedence, then any `--psp-user--*` property
a theme or the page defines on the element. An unresolvable reference is dropped
(the plugin's default renders). Panels hold literals from then on — `save()`
always emits literals, and the column style tab always edits a literal.

`saveWorkspace()` emits a **palette**: every color value in use across the
panels is written in `panels` as a `var()` reference, and the top-level
`palette` map (custom property name → value) carries each referenced definition
once. Names are stable — a value keeps the name the last `restoreWorkspace()`
gave it when the values match, reuses a theme entry's name when it matches one
(`--psp-user--<kind>-1`, `-2`, … are discovered by contiguous numbering), and
otherwise takes a fresh `--psp-user--<kind>-N`. `restoreWorkspace()` applies
`palette` to the element as inline custom properties (replacing any previously
restored palette) before the panels' references resolve — which also makes it
the way to inject a brand or theme variation for a workspace to draw on.

By default only the values the panels reference are serialized; a restored
palette's unused entries, and values pinned during a session, are in-session
state. Pass `{ full_palette: true }` to emit the element's whole set — in-use
values unioned with the last restored palette and anything pinned since — for a
symmetric round trip:

```javascript
const used_only = await elem.saveWorkspace();
const everything = await elem.saveWorkspace({ full_palette: true });
```

In the column style tab, each color field's **Load** control lists the element's
set (plus theme entries) for every panel and applies a chosen entry's value to
the field; **Pin** — offered while the field holds a value the restored set
lacks — adds that value to the set for the rest of the session.

```javascript
await elem.restoreWorkspace({
    palette: {
        "--psp-user--gradient-heat":
            "linear-gradient(to right, #0366d6, #ff7f0e)",
        "--psp-user--palette-brand":
            "linear-gradient(to right, #2771a8, #8b86ff, #ff471e)",
    },
    panels: {
        sales: {
            table: "superstore",
            plugin: "Heatmap",
            columns: ["Sales"],
            columns_config: {
                Sales: { gradient: "var(--psp-user--gradient-heat)" },
            },
        },
    },
});
```

A malformed `palette` entry (a key outside
`--psp-user--{gradient,palette,color}-`, or a value its kind rejects) fails the
whole `restoreWorkspace()` before any panel changes.
