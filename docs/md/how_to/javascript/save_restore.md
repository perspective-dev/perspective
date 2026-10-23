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
method.

```javascript
const token = await elem.save();
```

The token can be restored to any `<perspective-viewer>` with a `Table` of
identical schema, via the `restore()` method. Note that while the data for a
token returned from `save()` may differ, generally its schema may not, as many
other settings depend on column names and types.

```javascript
await elem.restore(token);
```

`restore()` validates its argument, rejecting for example a key the config
format does not define; when a rejected token is stamped with another release's
`version`, the error names that release. Tokens saved by older releases should
be upgraded first — see [Migrating saved configs](../rust/migrate.md).

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
single-panel `restore()` is rejected (its `panels`/`layout` keys are not part
of a `ViewerConfig`).

The `layout` field is the tree arranging the panels into a grid of rows and
columns or stacks of tabs, naming every panel id exactly once. See
[Arranging panels: layouts and dashboards](./layout.md) for its format and for
rearranging, resizing and stacking existing panels.

Like `restore()`, `restoreWorkspace()` applies an _update_: a field that is
absent leaves that part of the element unchanged, `null` resets it to its
default, and a value replaces it. `panels` is the whole panel set — when present
every existing panel is replaced (`{}` empties the element); when absent the
panels are kept, and `layout`, `active` and `masters` name them by their
existing ids. So a cross-filter can be applied to the current panels without
re-creating them:

```javascript
await elem.restoreWorkspace({ global_filters: [["Region", "==", "West"]] });
await elem.restoreWorkspace({ global_filters: null }); // clear
```

### Derived tables

A workspace token carries a top-level `derived_tables` map, one entry per
derived `Table` the element owns, each naming the `table` its source `View`
reads plus that view's config:

```javascript
await elem.restoreWorkspace({
    panels: { one: { table: "Region Totals", plugin: "Datagrid" } },
    derived_tables: {
        "Region Totals": { table: "superstore", group_by: ["Region"] },
    },
});
```

Within a workspace token, panels refer to tables by name, so a panel entry never
contains a derivation of its own — `one` above simply binds `"Region Totals"`.
Entries may name another derived table as their `table`, and they are built
parent-first regardless of the order they appear in.

`derived_tables` follows the same update rule as `panels`: absent keeps the
current set, a value replaces it entirely, and `{}` deletes every derived table.
An entry whose definition has not changed is reused rather than rebuilt.

A derived table whose `table` is not hosted yet does not fail the restore — it
and anything under it wait, along with the panels bound to them, and are built
when the parent table appears. A dependency cycle is rejected outright.

The single-panel format inlines instead: `save()` of a panel bound to a derived
table writes the whole definition recursively in the `table` field, so the token
is self-contained:

```javascript
await elem.restore({
    plugin: "Datagrid",
    table: { table: "superstore", group_by: ["Region"] },
});
```

`restore()` rebinds to an existing derived table when one was built from a
structurally identical definition, and otherwise creates one under a generated
name. Only the single-panel `restore()` accepts the inline form — in
`restoreWorkspace()` every `table` field is a name.

See [Derived tables](../../explanation/derived_table.md).

## Datetime formats

A `date` or `datetime` column's `date_format` is a subset of
`Intl.DateTimeFormatOptions`: either the `dateStyle`/`timeStyle` presets or
per-part fields (`weekday`, `year`, `month`, `day`, `hour`, `minute`, `second`,
`fractionalSecondDigits`), never both, plus optional `timeZone` and `hour12`. As
in `Intl`, a display field that is left out is not shown:

```javascript
await viewer.restore({
    columns_config: {
        "Order Date": { date_format: { dateStyle: "long", timeZone: "UTC" } },
    },
});
```

A column inherits the plugin's display fields until it sets any of them, and
inherits `timeZone` and `hour12` individually.

Configs saved before 5.7.0 used a `"disabled"` value and a `format: "custom"`
marker, and a missing preset field meant `short` date or `medium` time.
`restore()` rejects the removed forms, and restores any other `date_format`
with its current meaning — `{ dateStyle: "long" }` shows the date alone,
whatever its `version`. [`perspective-migrate`](../rust/migrate.md) rewrites
older tokens into the current form with their original rendering.

## Colors, palettes and gradients

Per-column color styling lives in a panel's `columns_config`, keyed by column
name, and every color-scale value is a string usable verbatim in CSS:

| Kind     | Value                                                                               |
| -------- | ----------------------------------------------------------------------------------- |
| color    | `"#rrggbb"` (`#rgb`, `rgb()` and `rgba()` are accepted on input)                    |
| palette  | `"linear-gradient(to right, #rrggbb, #rrggbb, …)"` — N colors, **no** positions     |
| gradient | `"linear-gradient(to right, #rrggbb 0%, #rrggbb 37.5%, …)"` — every stop positioned |

Which reader applies is decided by the style control's kind, never by inspecting
the string. The datagrid's `fg_color`/`bg_color` are read according to the
column's type and its `fg_mode`/`bg_mode`: a gradient for numeric columns, a
color for string and datetime columns in `"color"` mode, and a palette for
string columns in `"series"` mode; the charts' `gradient` is a gradient and
`palette` a palette. A position anywhere in a palette is rejected, while a
gradient may omit positions on input (the CSS implicit-position rules fill them)
and may carry any direction token, which is normalized to `to right`. A mode the
column's type does not accept (say `fg_mode: "series"` on a float column)
rejects the `restore()` call, as does a value that does not parse under the
mode's reader. Values equal to the plugin's default are not serialized.

```javascript
await viewer.restore({
    plugin: "Datagrid",
    columns_config: {
        Profit: {
            bg_mode: "gradient",
            bg_color: "linear-gradient(to right, #ff0000, #ffffff, #0000ff)",
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
