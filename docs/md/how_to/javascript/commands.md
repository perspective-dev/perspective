# Adding custom commands

An application can add its own commands to a `<perspective-viewer>`'s
right-click menu, and decide per click which of them to show from what was
clicked.

## Declaring commands

`setCommandSchema()` takes a function from a _context_ to the list of commands
to offer for it. The viewer calls it each time the menu opens:

```javascript
viewer.setCommandSchema((context) => {
    const id = context.hit?.row.security_id;
    if (id == null) {
        return { commands: [] };
    }

    return {
        commands: [
            {
                kind: "Command",
                key: "open-order-ticket",
                label: `Open Order Ticket (${id})`,
            },
        ],
    };
});
```

The function must be synchronous and have no effects of its own. Calling
`setCommandSchema()` again replaces it, and `setCommandSchema(null)` removes it.
It is not part of `save()` or `saveWorkspace()`, and survives `restore()`,
`reset()`, `load()` and `eject()`.

Each entry of `commands` is one of:

| `kind`      | Fields                      | Description                  |
| ----------- | --------------------------- | ---------------------------- |
| `"Command"` | `key`, `label`, `disabled?` | A row the user can pick      |
| `"Group"`   | `key`, `label`, `commands`  | A submenu of further entries |

Custom commands are shown above the built-in menu items.

## Handling a command

Picking a command fires `perspective-command`, whose detail carries the
command's `key` and the same `context` object the schema function was called
with:

```javascript
viewer.addEventListener("perspective-command", (event) => {
    const { key, context } = event.detail;
    if (key === "open-order-ticket") {
        openOrderTicket(context.hit.row.security_id, context.point);
    }
});
```

## The command context

| Field         | Type              | Description                                        |
| ------------- | ----------------- | -------------------------------------------------- |
| `location`    | `"context-menu"`  | Where the commands will be shown                   |
| `panel`       | `string?`         | The targeted panel; absent only at zero panels     |
| `table`       | `string?`         | The name of the panel's `Table`                    |
| `plugin`      | `string?`         | The name of the panel's plugin                     |
| `view_config` | `ViewConfig?`     | The panel's view config, as from `getViewConfig()` |
| `point`       | `{x, y}?`         | Viewport coordinates of the right-click            |
| `hit`         | `PerspectiveHit?` | What the plugin rendered under the cursor          |

`hit` is present only when the right-click landed on something a plugin drew. It
is absent over a panel's tab, the status bar and the settings sidebar, and over
empty space inside a plugin.

| Field          | Type                                                  | Description                                         |
| -------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `kind`         | `"cell" \| "row_header" \| "column_header" \| "mark"` | What was hit; `"mark"` is a chart glyph             |
| `row`          | `object`                                              | The view row, as in `perspective-click`             |
| `column_names` | `string[]`                                            | The column(s) targeted                              |
| `value`        | `Scalar?`                                             | The value under the cursor, for a grid cell         |
| `row_path`     | `Scalar[]`                                            | The row's `group_by` values, outermost first        |
| `column_path`  | `Scalar[]`                                            | The column's `split_by` values, outermost first     |
| `config`       | `ViewConfigUpdate`                                    | A `restore()` patch whose filters select the target |

`row` holds the columns of the _view_, so a column that is not in `columns` is
not in `row`, and a grouped row holds aggregates. When the view is grouped by
the column you need, read it from `row_path`:

```javascript
function security_id(context) {
    const level = context.view_config?.group_by.indexOf("security_id") ?? -1;
    return context.hit?.row.security_id ?? context.hit?.row_path[level];
}
```

When custom commands are declared, the menu opens once the plugin has resolved
`hit`, which for a remote `Table` takes one round trip to the server.

## Commands from a plugin

A plugin can offer commands of its own through two optional methods on
[`IPerspectiveViewerPlugin`](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html):
`command_schema(context)`, which returns the same `{ commands }` shape, and
`execute_command(key, context)`, which the viewer calls when one is picked.
Plugin commands do not fire `perspective-command`. A plugin supplies `hit` by
implementing `hit_test(x, y)`.
