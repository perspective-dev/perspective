# Listening for events

The `<perspective-viewer>` Custom Element fires all the same HTML `Event`s that
standard DOM `HTMLElement` objects fire, in addition to a few custom
`CustomEvent`s which relate to UI updates including those initiaed through user
interaction.

## Update events

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

## Click events

Whenever a `<perspective-viewer>`'s grid or chart is clicked, a
`perspective-click` DOM event is fired containing a detail object with
`config`, `column_names`, `row` and `panel`.

The `config` object contains an array of `filters` that can be applied to a
`<perspective-viewer>` through the use of `restore()` updating it to show the
filtered subset of data.

The `column_names` property contains an array of matching columns, the `row`
property returns the associated row data, and `panel` identifies the panel
which fired the event in a multi-panel viewer.

```javascript
elem.addEventListener("perspective-click", function (event) {
    const { config, panel } = event.detail;
    elem.restore(config, { panel });
});
```

## Selection events

`perspective-select` fires when a plugin's selection changes. Its detail is a
`PerspectiveSelectDetail`, exported from `@perspective-dev/viewer`:

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `boolean` | Whether anything is currently selected |
| `row` | `object` | The associated row data |
| `column_names` | `string[]` | Matching column names |
| `removeConfigs` | `ViewConfigUpdate[]` | Configs whose filters should be _removed_ |
| `insertConfigs` | `ViewConfigUpdate[]` | Configs whose filters should be _applied_ |
| `panel` | `string?` | The originating panel, in a multi-panel viewer |

`removeConfigs` is applied first, then `insertConfigs`. The
`removeFilters` and `insertFilters` getters flatten each to a plain `Filter[]`.

```javascript
import { PerspectiveSelectDetail } from "@perspective-dev/viewer";

elem.addEventListener("perspective-select", function (event) {
    const { insertFilters, removeFilters } = event.detail;
    console.log("apply", insertFilters, "clear", removeFilters);
});
```

<div class="warning">The <code>detail.config</code> field on
<code>perspective-select</code> was replaced by <code>insertConfigs</code> and
<code>removeConfigs</code>. Without an explicit <code>removeConfigs</code>,
a filter on a column outside the source's <code>group_by</code>,
<code>split_by</code> or <code>filter</code> cannot be cleared.</div>

## Global filter events

In a multi-panel viewer, panels toggled to _Master_ contribute filter clauses
to an element-level global filter set, which is applied as a transient overlay
to every _detail_ panel (and never written into their saved configs).

- `perspective-global-filter` fires on a master panel's selection.
- `perspective-global-filter-update` fires whenever the global filter set
  changes, with a `Filter[]` detail.

```javascript
elem.addEventListener("perspective-global-filter-update", function (event) {
    console.log("Global filters are now", event.detail);
});
```

## Layout events

A multi-panel `<perspective-viewer>` reports changes to its panel _collection_
on two separate channels. They are distinct facts — which panels exist, and
which one is selected — so neither event implies the other.

- `perspective-layout-update` fires when a panel is added to or removed from
  the layout. Its `detail.panels` is the placed panel ids in insertion order,
  identical to what [`getPanelNames()`](#) returns.
- `perspective-active-panel-update` fires when the active panel changes, with
  a `detail.panel` of the new panel's id — or `null` at zero panels.

```javascript
elem.addEventListener("perspective-layout-update", function (event) {
    console.log("Panels are now", event.detail.panels);
});
```

Geometry changes — dragging a split divider, reordering tabs — do **not** fire
these events, because they change the layout tree without changing the panel
set. Use `saveWorkspace()` to read the current geometry.

<div class="warning">The <code>workspace-layout-update</code> and
<code>workspace-new-view</code> events from the removed
<code>@perspective-dev/workspace</code> package no longer exist.
<code>perspective-layout-update</code> is the closest replacement for the
former; for per-panel config changes use
<code>perspective-config-update</code>.</div>
