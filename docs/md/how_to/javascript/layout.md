# Arranging panels: layouts and dashboards

A multi-panel `<perspective-viewer>` is a dashboard. Its panels are arranged by
a _layout_: a tree that places each panel in a grid of rows and columns, or
stacks several panels as tabs in one cell. The layout is the `layout` field of a
[`saveWorkspace()`](./save_restore.md#multi-panel-viewers) token, and
`restoreWorkspace()` applies one.

## The layout tree

A layout is built from two kinds of node:

- `split-layout` divides its space among its `children`. The `orientation`
  decides the direction: `"horizontal"` places the children side by side as
  columns, left to right, and `"vertical"` stacks them as rows, top to bottom.
  `sizes` gives each child's share of the split, one number per child, as
  proportions of their total (`[0.5, 0.5]` is an even split, `[0.25, 0.75]` a
  narrow column next to a wide one).
- `tab-layout` is a leaf cell holding a stack of panels, listed by panel id in
  `tabs`. Only one panel of a stack is visible at a time; `selected` is the
  index of the visible tab (default `0`). A cell with one panel is a
  `tab-layout` with a single entry in `tabs`.

Nesting splits makes a grid: a `vertical` split whose first child is a
`horizontal` split puts two panels side by side in the top row and one panel
across the bottom row. A split nested directly inside a split of the same
orientation is flattened into its parent, so `saveWorkspace()` may return an
equivalent but flatter tree than the one you restored.

Each panel may appear in the layout at most once. A panel the layout leaves out
is removed, with a warning logged to the console.

```javascript
const layout = {
    type: "split-layout",
    orientation: "vertical",
    sizes: [0.55, 0.45],
    children: [
        {
            type: "split-layout",
            orientation: "horizontal",
            sizes: [0.5, 0.5],
            children: [
                { type: "tab-layout", tabs: ["sales"], selected: 0 },
                { type: "tab-layout", tabs: ["regions"], selected: 0 },
            ],
        },
        { type: "tab-layout", tabs: ["grid"], selected: 0 },
    ],
};
```

## Building a grid dashboard

A complete dashboard is one `restoreWorkspace()` call: `panels` defines each
panel's view (keyed by an id of your choosing), and `layout` arranges those ids
into a grid. This one puts a bar chart and a treemap side by side above a pivot
grid that spans the bottom row. Give each panel a `title`; it is shown in the
panel's tab header.

```javascript
await viewer.restoreWorkspace({
    layout: {
        type: "split-layout",
        orientation: "vertical",
        sizes: [0.55, 0.45],
        children: [
            {
                type: "split-layout",
                orientation: "horizontal",
                sizes: [0.5, 0.5],
                children: [
                    { type: "tab-layout", tabs: ["sales"] },
                    { type: "tab-layout", tabs: ["regions"] },
                ],
            },
            { type: "tab-layout", tabs: ["grid"] },
        ],
    },
    panels: {
        sales: {
            table: "superstore",
            title: "Sales by Sub-Category",
            plugin: "Y Bar",
            group_by: ["Sub-Category"],
            split_by: ["Segment"],
            sort: [["Sales", "desc"]],
            columns: ["Sales"],
        },
        regions: {
            table: "superstore",
            title: "Sales by Region",
            plugin: "Treemap",
            group_by: ["Region", "State"],
            columns: ["Sales", "Profit"],
        },
        grid: {
            table: "superstore",
            title: "Profit by Region",
            plugin: "Datagrid",
            group_by: ["Region", "State"],
            split_by: ["Category"],
            columns: ["Sales", "Profit"],
        },
    },
});
```

Panels added one at a time with `addPanel()` are each placed as a new column,
side by side; arrange them afterwards by restoring a `layout`, as below.

## Rearranging existing panels

A `restoreWorkspace()` call with a `layout` but no `panels` keeps every panel
the layout names and only moves them. Name the panels by their existing ids, from
`getPanelNames()` or a `saveWorkspace()` token. This is how to move or swap a
panel, resize a row or column, change a row into a column, or stack panels as
tabs; nothing is re-created or re-queried.

```javascript
const [a, b, c] = viewer.getPanelNames();

// Three columns, the first twice as wide as the others.
await viewer.restoreWorkspace({
    layout: {
        type: "split-layout",
        orientation: "horizontal",
        sizes: [0.5, 0.25, 0.25],
        children: [
            { type: "tab-layout", tabs: [a] },
            { type: "tab-layout", tabs: [b] },
            { type: "tab-layout", tabs: [c] },
        ],
    },
});

// Stack all three panels as tabs in one cell, showing the second.
await viewer.restoreWorkspace({
    layout: { type: "tab-layout", tabs: [a, b, c], selected: 1 },
});
```

To resize panels, change `sizes` and keep the tree; to swap two panels, exchange
their ids in `tabs`.

## Layout validation errors

`restoreWorkspace()` rejects a malformed `layout` before changing anything, so
the viewer is left exactly as it was. A layout is rejected when:

- a panel id in `tabs` is unknown — without `panels` the ids must be existing
  panel ids, and with `panels` they must be `panels` keys;
- a panel appears more than once;
- a `split-layout`'s `sizes` do not have one entry per child, or a size is
  negative or not finite, or every size is zero.

The error message names the offending node by its path, e.g.
`layout.children[1].tabs`, and lists the valid panel ids.

## Master/detail cross-filtering

Panels can be linked so that clicking a row in one filters the others. A
_master_ panel is a filter source: selecting a row in it (for example a group in
a pivoted grid) writes a filter clause for that row's group-by values into the
element's `global_filters`. Every other, _detail_, panel applies the
`global_filters` as a transient overlay on its own `filter`, which is never
written into the detail panel's saved config. A master panel is not filtered by
`global_filters` itself.

Masters are listed by panel id in a workspace token's `masters` field, and the
cross-filter set is its `global_filters` field. Both can be set without
re-creating the panels:

```javascript
const [master, detail] = viewer.getPanelNames();

// Make the first panel a master; selecting a row filters the detail panel.
await viewer.restoreWorkspace({ masters: [master] });

// Apply a cross-filter directly, or clear it.
await viewer.restoreWorkspace({ global_filters: [["Region", "==", "West"]] });
await viewer.restoreWorkspace({ global_filters: null });

// Demote every master.
await viewer.restoreWorkspace({ masters: null });
```

The `perspective-global-filter-update` event fires whenever the cross-filter set
changes; see [Listening for events](./events.md#global-filter-events).

## Panel titles

Each panel's tab header shows its `title`, a field of the panel's own config.
Set it with the panel's other fields in `restoreWorkspace()` or `addPanel()`, or
change it later with `restore()`:

```javascript
await viewer.restore({ title: "Sales by Region" }, { panel: "regions" });
```
