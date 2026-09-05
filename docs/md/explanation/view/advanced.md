# Advanced View Operations

Beyond the standard query configuration, `View` provides additional methods for
interacting with hierarchical results and introspecting data.

## Tree Hierarchy Operations

When a `View` has `group_by` applied, the results form a tree hierarchy.
Perspective provides methods to control which levels of the tree are expanded or
collapsed:

<div class="javascript">

```javascript
const view = await table.view({ group_by: ["Region", "Country", "City"] });

// Collapse the tree at row index 5
await view.collapse(5);

// Expand the tree at row index 5
await view.expand(5);

// Set the expansion depth (0 = fully collapsed, 1 = first level, etc.)
await view.set_depth(1);
```

</div>
<div class="python">

Using the sync API

```python
view = table.view(group_by=["Region", "Country", "City"])

view.collapse(5)
view.expand(5)
view.set_depth(1)
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    group_by: Some(vec!["Region".into(), "Country".into(), "City".into()]),
    ..ViewConfigUpdate::default()
})).await?;

view.collapse(5).await?;
view.expand(5).await?;
view.set_depth(1).await?;
```

</div>

<span class="warning">Perspective's built-in engine is lazy — aggregates for
collapsed rows are not recalculated when the underlying `Table` is updated.
Updates are only computed for rows that are currently visible (expanded). When a
collapsed row is later expanded, its aggregates are calculated at that
point.</span>

## Column Range Queries

`View::get_min_max` returns the minimum and maximum values for a given column,
which is useful for setting up scales in custom visualizations:

<div class="javascript">

```javascript
const [min, max] = await view.get_min_max("Sales");
```

</div>
<div class="python">

```python
min_val, max_val = view.get_min_max("Sales")
```

</div>

## Expression Validation

Before creating a `View` with expressions, you can validate them against the
table's schema using `Table::validate_expressions`. This returns information
about which expressions are valid and their inferred types:

<div class="javascript">

```javascript
const result = await table.validate_expressions({
    expr1: '"Sales" + "Profit"',
    expr2: "invalid_column + 1",
});
// result.expression_schema contains valid expressions and their types
// result.errors contains invalid expressions and error messages
```

</div>
<div class="python">

```python
result = table.validate_expressions(['"Sales" + "Profit"', 'invalid + 1'])
```

</div>

## View Dimensions

`View::dimensions` returns the number of rows and columns in the current view,
including information about group-by header rows:

<div class="javascript">

```javascript
const dims = await view.dimensions();
// { num_view_rows, num_view_columns, num_table_rows, num_table_columns, ... }
```

</div>
<div class="python">

```python
dims = view.dimensions()
```

</div>

## View Configuration Introspection

`View::get_config` returns the full configuration used to create the view:

<div class="javascript">

```javascript
const config = await view.get_config();
// { group_by: [...], split_by: [...], sort: [...], filter: [...], ... }
```

</div>
<div class="python">

```python
config = view.get_config()
```

</div>

## Update Callbacks

Register a callback to be notified whenever the underlying `Table` is updated
and the `View` has been recalculated:

<div class="javascript">

```javascript
view.on_update(
    (updated) => {
        console.log("View updated", updated.port_id);
    },
    { mode: "row" },
);

// Later, remove the callback
view.remove_update(callback);
```

</div>
<div class="python">

```python
def on_update(port_id, delta):
    print("View updated", port_id)

view.on_update(on_update, mode="row")
view.remove_update(on_update)
```

</div>

When `mode` is set to `"row"`, the callback receives a delta of only the rows
that changed (as Apache Arrow), which is useful for efficiently synchronizing
tables across clients.

## Remove Callbacks

Register a callback to be notified whenever rows are removed from the underlying
`Table` by `remove()`, which requires an `index`. The callback receives the
`port_id` and the removed `index` column values as an Apache Arrow of a single
column named after the index. It fires once per update step, only for rows which
existed before that step; `replace()` reports the keys it does not re-supply,
and `clear()` reports every key:

<div class="javascript">

```javascript
const callback = await view.on_remove(({ indices, port_id }) => {
    replica.remove(indices);
});

// Later, remove the callback
await view.remove_remove(callback);
```

</div>
<div class="python">

```python
def on_remove(port_id, indices):
    replica.remove(indices)

callback = view.on_remove(on_remove)
view.remove_remove(callback)
```

</div>

## Flattening a View into a Table

A [`Table`] can be constructed on a [`Table::view`] instance, which will return
a new [`Table`] based on the [`Table::view`]'s dataset, and all future updates
that affect the [`Table::view`] will be forwarded to the new [`Table`]. This is
particularly useful for implementing a
[Client/Server Replicated](../architecture/client_server.md) design, as it
handles the `View` serialization and `on_update` forwarding for you. This
pattern is available in JavaScript, Python and Rust.

When the source `Table` has an `index`, and the `View` is unpivoted and includes
the index column, the new `Table` inherits that `index` and subscribes to the
source's `on_remove()`, so in-place updates and `remove()` calls on the source
are mirrored rather than appended. A pivoted `View`, or one which omits the
index column, produces an unindexed, append-only `Table`. A `limit` is inherited
the same way. `replace()` and `clear()` on the source are mirrored too.

<div class="javascript">

```javascript
const worker = await perspective.worker();
const table = await worker.table(data);
const view = await table.view({ filter: [["State", "==", "Texas"]] });
const table2 = await worker.table(view);
table.update([{ State: "Texas", City: "Austin" }]);
```

</div>
<div class="python">

```python
table = client.table(data)
view = table.view(filter=[["State", "==", "Texas"]])
table2 = client.table(view)
table.update([{"State": "Texas", "City": "Austin"}])
```

</div>
<div class="rust">

```rust
let opts = TableInitOptions::default();
let data = TableData::Update(UpdateData::Csv("x,y\n1,2\n3,4".into()));
let table = client.table(data, opts).await?;
let view = table.view(None).await?;
let table2 = client.table(TableData::View(view)).await?;
table.update(data).await?;
```

</div>
