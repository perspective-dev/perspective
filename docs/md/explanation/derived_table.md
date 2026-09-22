# Derived `Table`s

A `Table` can be constructed from a `View`, producing a read-only `Table` whose
rows are that `View`'s output. The engine maintains it in place: an update to
the source `Table` is reflected in the derived `Table`, and in any `View` of it,
within the same update cycle.

This is how you query the result of a query — filter on an aggregate, group an
aggregate by a coarser key, or feed a pivot into a window function. It is also
the mechanism behind a
[Client/Server Replicated](./architecture/client_server.md) design, where it
handles `View` serialization and `on_update` forwarding for you.

<div class="javascript">

```javascript
const view = await table.view({
    group_by: ["Region"],
    columns: ["Sales"],
    aggregates: { Sales: "sum" },
    group_rollup_mode: "flat",
});

const totals = await client.table(view);
```

</div>
<div class="python">

```python
view = table.view(
    group_by=["Region"],
    columns=["Sales"],
    aggregates={"Sales": "sum"},
    group_rollup_mode="flat",
)

totals = client.table(view)
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    group_by: Some(vec!["Region".into()]),
    columns: Some(vec![Some("Sales".into())]),
    group_rollup_mode: Some(GroupRollupMode::Flat),
    ..ViewConfigUpdate::default()
})).await?;

let totals = client.table(TableData::View(view), TableInitOptions::default()).await?;
```

</div>

## Columns

An unpivoted `View` yields a `Table` with the `View`'s own columns, including
`expressions` and window columns, and one row for every row passing its
`filter`. The source's `index` is inherited when the index column is among the
`View`'s `columns`, and its `limit` is inherited as well.

A pivoted `View` yields the table you see on screen. Each `group_by` column
becomes a typed key column named `"<column> (Group by <n>)"`, and each data
column takes the name `View::column_paths` gives it:

```
Region (Group by 1),Central|Sales,East|Sales,South|Sales,West|Sales
Furniture,163797.16,208291.20,117298.68,252612.74
Office Supplies,167026.41,205516.05,125651.31,220853.25
```

Key columns are `null` below the depth of their row, which is how subtotal and
grand-total rows are represented.

## Rollup modes are mirrored

A derived `Table` has exactly the rows its source `View` displays. Under the
default `group_rollup_mode` of `"rollup"` that includes every subtotal row and
the grand total; under `"flat"` it is the leaves only; under `"total"` it is the
single total row. `split_rollup_mode` selects the data columns the same way.

<span class="warning">Set `group_rollup_mode: "flat"` on the source `View`
before grouping or filtering a derived `Table`, or its subtotal rows will be
counted alongside the rows they already summarize.</span>

`sort`, `expand`/`collapse` and `group_by_depth` describe how a `View` is
presented rather than what it contains, and do not affect the derived `Table`.

## Read-only

The engine owns a derived `Table`'s rows, so `update()`, `remove()`, `clear()`
and `replace()` all raise. Change the source `Table` instead. The `index` and
`limit` options are rejected for the same reason — identity comes from the
source.

Deleting a `View` that a derived `Table` still reads raises as well; delete the
derived `Table` first.

## The schema is fixed

A derived `Table`'s columns are decided when it is created, which matters for
`split_by`, whose columns depend on the data. A split value that first appears
later has no column to land in and its cells are dropped; one that disappears
leaves its column in place, filled with `null`.

Declare the columns up front to accept values that have not arrived yet:

<div class="javascript">

```javascript
const derived = await client.table(view, {
    schema: {
        "Region (Group by 1)": "string",
        "Mon|Sales": "float",
        "Tue|Sales": "float",
        "Wed|Sales": "float",
    },
});
```

</div>
<div class="python">

```python
derived = client.table(
    view,
    schema={
        "Region (Group by 1)": "string",
        "Mon|Sales": float,
        "Tue|Sales": float,
        "Wed|Sales": float,
    },
)
```

</div>
<div class="rust">

```rust
let derived = client.table(TableData::View(view), TableInitOptions {
    schema: Some(IndexMap::from([
        ("Region (Group by 1)".into(), ColumnType::String),
        ("Mon|Sales".into(), ColumnType::Float),
    ])),
    ..TableInitOptions::default()
}).await?;
```

</div>

A declared column that the `View` does not have is `null` until its values
arrive; a column the `View` has but the schema omits is dropped. A declared type
which disagrees with the `View`'s is an error.

## Filtering on an aggregate

SQL's `HAVING` — show only the groups whose total passes a predicate — is a
`filter` on a derived `Table`:

<div class="javascript">

```javascript
const totals = await table.view({
    group_by: ["Category", "Sub-Category"],
    columns: ["Sales"],
    aggregates: { Sales: "sum" },
    group_rollup_mode: "flat",
});

const derived = await client.table(totals);
const large = await derived.view({ filter: [["Sales", ">", 100000]] });
```

</div>
<div class="python">

```python
totals = table.view(
    group_by=["Category", "Sub-Category"],
    columns=["Sales"],
    aggregates={"Sales": "sum"},
    group_rollup_mode="flat",
)

derived = client.table(totals)
large = derived.view(filter=[["Sales", ">", 100000]])
```

</div>
<div class="rust">

```rust
let derived = client.table(TableData::View(totals), TableInitOptions::default()).await?;
let large = derived.view(Some(ViewConfigUpdate {
    filter: Some(vec![Filter::new("Sales", ">", 100000)]),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

## Change between pivot columns

To compare an aggregate against the previous column of a pivot — day-over-day
change of an accruing balance, for example — group by the pivot key rather than
splitting on it, then apply a `diff` [window](./view/config/windows.md) to the
derived `Table` and split there:

<div class="javascript">

```javascript
const daily = await table.view({
    group_by: ["Portfolio", "Date"],
    columns: ["PnL"],
    aggregates: { PnL: "last" },
    group_rollup_mode: "flat",
});

const derived = await client.table(daily);
const change = await derived.view({
    group_by: ["Portfolio (Group by 1)"],
    split_by: ["Date (Group by 2)"],
    columns: ["change"],
    aggregates: { change: "sum" },
    group_rollup_mode: "flat",
    windows: {
        change: {
            column: "PnL",
            aggregate: "diff",
            partition_by: ["Portfolio (Group by 1)"],
            order_by: ["Date (Group by 2)", "asc"],
        },
    },
});
```

</div>
<div class="python">

```python
daily = table.view(
    group_by=["Portfolio", "Date"],
    columns=["PnL"],
    aggregates={"PnL": "last"},
    group_rollup_mode="flat",
)

derived = client.table(daily)
change = derived.view(
    group_by=["Portfolio (Group by 1)"],
    split_by=["Date (Group by 2)"],
    columns=["change"],
    aggregates={"change": "sum"},
    group_rollup_mode="flat",
    windows={
        "change": {
            "column": "PnL",
            "aggregate": "diff",
            "partition_by": ["Portfolio (Group by 1)"],
            "order_by": ["Date (Group by 2)", "asc"],
        }
    },
)
```

</div>

A window runs down rows, so the axis it walks has to be a `group_by` of the
source. When each row of the source `Table` is already one observation per key —
one row per portfolio per day — no derived `Table` is needed, and the same
window applied directly to that `Table` gives the same result.

## Limitations

A derived `Table` re-aggregates its own rows, so an expression over aggregate
columns is only correct at the granularity those rows already have. A ratio of
sums, for instance, cannot be re-derived correctly for a coarser `group_by` of
the derived `Table`, because the ratios are averaged rather than recomputed.

Constructing a `Table` from a `View` hosted by a _different_ `Client` copies the
`View`'s data across that boundary instead, which appends rather than updates in
place for a pivoted `View`.

On a [Virtual Server](./virtual_servers.md) a derived `Table` is a snapshot of
the `View` taken when it is created, since a virtual `View` is itself a
snapshot.

## Changes to `client.table(view)`

Previous releases copied the `View`'s data into an ordinary `Table` and
forwarded updates to it. Derived `Table`s are maintained by the engine, which
changes several behaviors for code written against the old implementation:

- A derived `Table` is read-only, where the copy accepted writes that the next
  update would overwrite.
- Deleting the source `View` raises, where the copy became a frozen snapshot.
- Rows follow the source's insertion order; the source `View`'s `sort` no longer
  orders the copy.
- A row updated out of the source `View`'s `filter` is removed, where the copy
  retained it with stale values.
- Updates arrive in the same cycle as the source rather than eventually.
- A `View` which omits its source's index column is keyed by row identity, so
  updates apply in place rather than appending.
- A pivoted `View` yields named key columns and only the rows the `View`
  displays, where the copy appended its changed rows on every update.
