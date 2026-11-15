# Adding custom commands

An application can add its own commands to a `<perspective-viewer>`: to the
right-click menu, as buttons on Datagrid rows or cells, and on pinned chart
tooltips. One function declares them all, and decides per location which to show
from what is there.

## Declaring commands

`setCommandSchema()` takes a function from a _context_ to the list of commands
to offer for it, and the surfaces it should be evaluated for:

```javascript
await viewer.setCommandSchema(
    (context) => {
        if (context.hit?.column_names[0] !== "security_id") {
            return { commands: [] };
        }

        return {
            commands: [
                {
                    kind: "Command",
                    key: "open-order-ticket",
                    label: `Open Order Ticket (${context.hit.value})`,
                    icon: "ticket",
                },
            ],
        };
    },
    { scopes: ["context-menu", "datagrid-cell"] },
);
```

The function must be synchronous and have no effects of its own. Calling
`setCommandSchema()` again replaces it, and `setCommandSchema(null)` removes it.
It is not part of `save()` or `saveWorkspace()`, and survives `restore()`,
`reset()`, `load()` and `eject()`.

Each entry of `commands` is one of:

| `kind`      | Fields                                         | Description                  |
| ----------- | ---------------------------------------------- | ---------------------------- |
| `"Command"` | `key`, `label`, `disabled?`, `icon?`, `title?` | A row the user can pick      |
| `"Group"`   | `key`, `label`, `commands`                     | A submenu of further entries |

In the context menu, custom commands are shown above the built-in items. As a
button, a command shows its label as text, preceded by its `icon` when it has
one, drawn through the theme's `--psp-icon--<icon>--mask-image` property. An
application supplies its own icons by defining that property on the
`<perspective-viewer>` with a `url()` to an SVG, which the plugins use as a
mask. Its tooltip, in the menu and on a button, is `title` when given and the
label otherwise, so a button can read "Buy" while its tooltip reads "Buy 100
PRSP". A `Group` renders as one button that opens a menu.

## Scopes

`scopes` names the surfaces the schema is evaluated for; it defaults to
`["context-menu"]`, and an unknown scope rejects. The schema is never called for
a surface outside its scopes, so a plugin pays nothing for a scope the
application did not ask for.

| Scope             | Where the commands appear                 | Evaluated          |
| ----------------- | ----------------------------------------- | ------------------ |
| `"context-menu"`  | The right-click menu                      | Once per open      |
| `"datagrid-row"`  | A button column on every Datagrid row     | Once per row drawn |
| `"datagrid-cell"` | Buttons beside every Datagrid cell value  | Once per cell      |
| `"chart-tooltip"` | A button row under a pinned chart tooltip | Once per pin       |

Each plugin can turn a surface off through its `plugin_config`, and offers the
option only while the schema declares the scope. Call `setCommandSchema` before
restoring one of these options; a value restored before its scope is declared is
dropped, like any `plugin_config` key the plugin does not offer:

| Plugin   | Option             | Values                                                                      |
| -------- | ------------------ | --------------------------------------------------------------------------- |
| Datagrid | `command_column`   | `"left"` (default), `"right"`, `"tree"` (after the group columns), `"none"` |
| Datagrid | `command_cells`    | `true` (default) or `false`                                                 |
| Charts   | `tooltip_commands` | `true` (default) or `false`                                                 |

Chart hover tooltips are drawn on canvas and show no buttons; pinned tooltips
do.

## Handling a command

Picking a command fires `perspective-command`, whose detail carries the
command's `key` and the same `context` object the schema function was called
with:

```javascript
viewer.addEventListener("perspective-command", (event) => {
    const { key, context } = event.detail;
    if (key === "open-order-ticket") {
        openOrderTicket(context.hit.value);
    }
});
```

## Invalidating commands

A command listener usually changes the state the schema reads: after "Flag
order" runs, the same row should offer "Unflag order". The viewer cannot see
that, so the listener says so with `invalidate()`, which redraws each panel's
plugin from its current view, re-querying the schema for every rendered button
surface, and resolves when the plugins have redrawn. Calls within one task run
as one, and `panel` limits the redraw to one panel:

```javascript
viewer.addEventListener("perspective-command", async (event) => {
    const { key, context } = event.detail;
    if (key === "flag") {
        flagged.add(String(context.hit.id));
        await viewer.invalidate({ panel: context.panel });
    }
});
```

`setCommandSchema()` with a new function or new scopes performs the same
re-query. The context menu re-queries on every open.

## The command context

| Field         | Type                         | Description                                        |
| ------------- | ---------------------------- | -------------------------------------------------- |
| `location`    | `PerspectiveCommandLocation` | The scope the commands will be shown in            |
| `panel`       | `string?`                    | The targeted panel; absent only at zero panels     |
| `table`       | `string?`                    | The name of the panel's `Table`                    |
| `plugin`      | `string?`                    | The name of the panel's plugin                     |
| `view_config` | `ViewConfig?`                | The panel's view config, as from `getViewConfig()` |
| `point`       | `{x, y}?`                    | Viewport coordinates of the right-click            |
| `hit`         | `PerspectiveHit?`            | What the plugin rendered at the location           |

In the context menu, `hit` is present only when the right-click landed on
something a plugin drew. It is absent over a panel's tab, the status bar and the
settings sidebar, and over empty space inside a plugin. In a button scope it is
always present.

| Field          | Type                          | Description                                      |
| -------------- | ----------------------------- | ------------------------------------------------ |
| `kind`         | `"cell" \| "row" \| "column"` | Which axes the location addresses                |
| `y`            | `number?`                     | The view row index, as drawn                     |
| `x`            | `number?`                     | The view column index, as drawn                  |
| `id`           | `Scalar[]?`                   | The row's index value(s), or its `group_by` path |
| `row_path`     | `Scalar[]`                    | The row's `group_by` values, outermost first     |
| `column_path`  | `Scalar[]`                    | The column's `split_by` values, outermost first  |
| `column_names` | `string[]`                    | The column targeted                              |
| `value`        | `Scalar?`                     | The cell's value, for a `"cell"` hit             |
| `config`       | `ViewConfigUpdate`            | A `restore()` patch selecting the target         |

A chart mark is a `"cell"` of its measure column, without a `value`.

`config.filter` is the panel's filter plus one clause per `group_by` level of
the row and per `split_by` level of the column, and, when the view is not
grouped and the table has an index, one clause per index column from `id`.
`config.expressions` is the panel's expressions whenever it has any, so the
patch is viewable when a filter names one. A flat row of an unindexed table has
no stable identity, so its `config` selects only what the panel's filter does.

The hit does not carry the row. A command that needs more of it fetches it in
its listener, where `async` is available. `y` and `x` address the view as it was
drawn and are stale after the next update on a live table; `config` identifies
the row and column against the data, so `table.view(context.hit.config)` reads
the row regardless of what has moved since:

```javascript
viewer.addEventListener("perspective-command", async (event) => {
    const { context } = event.detail;
    const table = await viewer.getTable({ panel: context.panel });
    const view = await table.view(context.hit.config);
    const [row] = await view.to_json({ end_row: 1 });
    await view.delete();
    openOrderTicket(row);
});
```
