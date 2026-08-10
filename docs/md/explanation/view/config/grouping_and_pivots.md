# Grouping and Pivots

## Group By

A group by _groups_ the dataset by the unique values of each column used as a
group by - a close analogue in SQL to the `GROUP BY` statement. The underlying
dataset is aggregated to show the values belonging to each group, and a total
row is calculated for each group, showing the currently selected aggregated
value (e.g. `sum`) of the column. Group by are useful for hierarchies,
categorizing data and attributing values, i.e. showing the number of units sold
based on State and City. In Perspective, group by are represented as an array of
string column names to pivot, are applied in the order provided; For example, a
group by of `["State", "City", "Postal Code"]` shows the values for each Postal
Code, which are grouped by City, which are in turn grouped by State.

<div class="javascript">

```javascript
const view = await table.view({ group_by: ["a", "c"] });
```

</div>
<div class="python">

```python
view = table.view(group_by=["a", "c"])
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    group_by: Some(vec!["a".into(), "c".into()]),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

### `group_rollup_mode`

The `group_rollup_mode` option controls how the grouped rows themselves render:

-   `"rollup"` (the default) - the full hierarchy, with a subtotal row for
    every group at every level and a grand total row, each addressable by its
    `__ROW_PATH__`.
-   `"flat"` - leaf rows only, one row per deepest-level group, with no
    subtotal or grand total rows. Useful for chart plugins and exports where
    subtotal rows would double-count.
-   `"total"` - the grand total row _only_. `"total"` is mutually exclusive
    with `group_by` (which is cleared when it is set) - it is the one shape
    an empty `group_by` cannot express, since no `group_by` at all yields the
    unaggregated dataset.

<div class="javascript">

```javascript
const view = await table.view({
    group_by: ["a"],
    group_rollup_mode: "flat",
});
```

</div>
<div class="python">

```python
view = table.view(group_by=["a"], group_rollup_mode="flat")
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    group_by: Some(vec!["a".into()]),
    group_rollup_mode: Some(GroupRollupMode::Flat),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

## Split By

A split by _splits_ the dataset by the unique values of each column used as a
split by. The underlying dataset is not aggregated, and a new column is created
for each unique value of the split by. Each newly created column contains the
parts of the dataset that correspond to the column header, i.e. a `View` that
has `["State"]` as its split by will have a new column for each state. In
Perspective, Split By are represented as an array of string column names to
pivot:

<div class="javascript">

```javascript
const view = await table.view({ split_by: ["a", "c"] });
```

</div>
<div class="python">

```python
view = table.view(split_by=["a", "c"])
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    split_by: Some(vec!["a".into(), "c".into()]),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

### `split_rollup_mode`

The `split_rollup_mode` option is the `split_by` counterpart to
[`group_rollup_mode`](#group_rollup_mode), controlling whether subtotal
_column groups_ are emitted:

-   `"flat"` (the default) - only full-depth split combinations appear as
    columns, e.g. `"CA|Sales"`. This is Perspective's historical behavior.
-   `"rollup"` - additionally emits a grand-total column per aggregate (named
    by the bare column name, e.g. `"Sales"`, aggregating across every split
    group) and, when more than one `split_by` column is applied, a subtotal
    column per intermediate split group (e.g. `"CA|Sales"` alongside
    `"CA|First Class|Sales"`). Total and subtotal columns precede their
    groups, in pre-order.

<div class="javascript">

```javascript
const view = await table.view({
    group_by: ["State"],
    split_by: ["Ship Mode"],
    split_rollup_mode: "rollup",
});
```

</div>
<div class="python">

```python
view = table.view(
    group_by=["State"],
    split_by=["Ship Mode"],
    split_rollup_mode="rollup",
)
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    group_by: Some(vec!["State".into()]),
    split_by: Some(vec!["Ship Mode".into()]),
    split_rollup_mode: Some(SplitRollupMode::Rollup),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

## Aggregates

Aggregates perform a calculation over an entire column, and are displayed when
one or more [Group By](#group-by) are applied to the `View`. Aggregates can be
specified by the user, or Perspective will use the following sensible default
aggregates based on column type:

-   "sum" for `integer` and `float` columns
-   "count" for all other columns

Perspective provides a selection of aggregate functions that can be applied to
columns in the `View` constructor using a dictionary of column name to aggregate
function name.

<div class="javascript">

```javascript
const view = await table.view({
    aggregates: {
        a: "avg",
        b: "distinct count",
    },
});
```

</div>
<div class="python">

```python
view = table.view(
  aggregates={
    "a": "avg",
    "b": "distinct count"
  }
)
```

</div>
<div class="rust">

```rust
use std::collections::HashMap;
let view = table.view(Some(ViewConfigUpdate {
    aggregates: Some(HashMap::from([
        ("a".into(), "avg".into()),
        ("b".into(), "distinct count".into()),
    ])),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

Every aggregate is described below, grouped by what it computes. Which of them
a given column accepts depends on its type — see
[Availability by column type](#availability-by-column-type).

### Sums and products

| Aggregate | Description | Result type |
| --- | --- | --- |
| `sum` | Total of the group's values | `integer` or `float` |
| `sum not null` | As `sum`, but non-finite (`NaN`) values are skipped rather than poisoning the total | `integer` or `float` |
| `sum abs` | Sum of the absolute values — `Σ abs(v)` | `integer` or `float` |
| `abs sum` | Absolute value of the sum — `abs(Σ v)` | `integer` or `float` |
| `mul` | Product of the group's values | `integer` or `float` |
| `gmv` | Gross market value — leaf rows are a plain `sum`, parent rows sum the _absolute_ subtotal of each immediate child group | `integer` or `float` |
| `pct sum parent` | The group's `sum` as a percentage of its parent row's, `0`–`100`; `100` at the root, and `null` when the parent's sum is `0` | `float` |
| `pct sum total` | The group's `sum` as a percentage of the grand total, `0`–`100` | `float` |

A numeric aggregate widens to the input's numeric class — `integer` columns
accumulate as `integer`, `float` columns as `float`.

### Averages and dispersion

| Aggregate | Description | Result type |
| --- | --- | --- |
| `avg` | Arithmetic mean of the non-null values | `float` |
| `weighted mean` | `Σ(value × weight) / Σ(weight)`, over rows where both the value and the weight are non-null and finite; `null` when the weights sum to `0`. Takes a **weight column** as an argument | `float` |
| `stddev` | Population standard deviation | `float` |
| `var` | Population variance — divides by `N`, not `N - 1` | `float` |

`stddev` and `var` are `null` for a group of fewer than two non-null values.

### Extrema and order statistics

| Aggregate | Description | Result type |
| --- | --- | --- |
| `min`, `max` | Smallest and largest of the group's current values | input type |
| `min by`, `max by` | The value from the row at which a **second column**, supplied as an argument, is smallest or largest | input type |
| `high`, `low` | High and low _water mark_ — the largest and smallest value this `View` has ever observed for the group, which never moves back when rows are updated or removed | input type |
| `high minus low` | `max - min` of the group's current values, i.e. its range. Despite the name this uses `min`/`max`, not the water marks | input type |
| `median`, `q1`, `q3` | The value at the 50%, 25% and 75% position of the group's values; on `float` columns an exact split averages the two adjacent values | input type |

### Positional

| Aggregate | Description | Result type |
| --- | --- | --- |
| `first` | Value from the group's earliest row | input type |
| `last by index` | Value from the group's latest row | input type |
| `last minus first` | `last by index` minus `first` | input type |
| `last` | Value from the group's most recently _updated_ row | input type |

"Earliest" and "latest" are by the `Table`'s `index` column, or by row order
when the `Table` is unindexed. This is not the same as `last`, which tracks
update recency rather than position.

### Cardinality and identity

| Aggregate | Description | Result type |
| --- | --- | --- |
| `count` | Number of rows in the group | `integer` |
| `distinct count` | Number of distinct values in the group | `integer` |
| `unique` | The group's value when every row shares one, otherwise `null` | input type |
| `distinct leaf` | As `unique`, but only on leaf rows — parent rows are blank | input type |
| `dominant` | The most frequent non-null value, i.e. the mode; a tie resolves to whichever value reached the winning count first | input type |
| `any` | The group's first _truthy_ value — any non-null value for `string` columns, the first non-zero for numbers and dates, the first `true` for `boolean` — or `null` if it has none | input type |
| `or` | Identical to `any` | input type |
| `and` | `true` when every value in the group is truthy, else `false` | `boolean` |
| `join` | The group's distinct values, sorted and rendered as a `", "`-delimited string, truncated at 280 characters. Nulls render as `null` | `string` |

### Nulls

Null handling is not uniform, and is usually what makes two similar-looking
aggregates differ:

- `count` counts **rows**, not values — a group of 3 rows whose value is
  `null` counts `3`. This is not the same as the `count` [window
  aggregate](./windows.md#aggregates), which counts non-null values.
- `distinct count` counts `null` as **one distinct value**, so a group of
  `[1, null, null]` counts `2`.
- `sum`, `avg`, `stddev`, `var`, `dominant` and `weighted mean` skip nulls
  entirely. `avg` divides by the count of non-null values, so a group of all
  nulls is `null` rather than `0`.
- `any` and `or` return the first _truthy_ value, not the first non-null one —
  a numeric group of all `0`, or a `boolean` group of all `false`, aggregates
  to `null`.
- `join` renders nulls into its output as the literal text `null`.

### Availability by column type

The aggregates a column accepts depend on its type:

**Numeric columns** (`integer`, `float`): `sum`, `abs sum`, `sum abs`,
`sum not null`, `mul`, `gmv`, `any`, `avg`, `mean`, `count`, `distinct count`,
`distinct leaf`, `dominant`, `first`, `last`, `last by index`, `high`, `low`,
`max`, `min`, `min by`, `max by`, `high minus low`, `last minus first`,
`median`, `q1`, `q3`, `pct sum parent`, `pct sum total`, `stddev`, `var`,
`unique`, `weighted mean`.

**String columns**: `count`, `any`, `distinct count`, `distinct leaf`,
`dominant`, `first`, `last`, `last by index`, `join`, `median`, `q1`, `q3`,
`unique`, `min by`, `max by`.

**Date/Datetime columns**: `count`, `any`, `avg`, `distinct count`,
`distinct leaf`, `dominant`, `first`, `last`, `last by index`, `high`, `low`,
`max`, `min`, `median`, `q1`, `q3`, `unique`.

**Boolean columns**: `count`, `any`, `and`, `or`, `distinct count`,
`distinct leaf`, `dominant`, `first`, `last`, `last by index`, `unique`.

<div class="warning"><code>avg</code> on a <code>date</code> or
<code>datetime</code> column returns a <code>float</code> — the mean of the
column's underlying numeric representation — not a date.</div>

### Argument-taking aggregates

`weighted mean`, `min by` and `max by` each read a second column, and are
written as a `[name, [argument]]` pair rather than a bare string:

<div class="javascript">

```javascript
const view = await table.view({
    aggregates: { a: ["weighted mean", ["b"]] },
});
```

</div>
<div class="python">

```python
view = table.view(aggregates={"a": ("weighted mean", ["b"])})
```

</div>
<div class="rust">

```rust
let view = table.view(Some(ViewConfigUpdate {
    aggregates: Some(HashMap::from([(
        "a".into(),
        Aggregate::MultiAggregate("weighted mean".into(), vec!["b".into()]),
    )])),
    ..ViewConfigUpdate::default()
})).await?;
```

</div>

<div class="warning">In Rust, <code>Aggregate::from(&amp;str)</code> splits on
<code>" by "</code> to build a <code>MultiAggregate</code>. Single aggregates
whose names contain that substring — <code>"last by index"</code> — must
therefore be constructed as
<code>Aggregate::SingleAggregate("last by index".into())</code> rather than
<code>"last by index".into()</code>, which silently resolves to
<code>last</code>.</div>

### Aliases

Several aggregates answer to more than one name. Every name below is accepted
anywhere an aggregate is, and each group refers to one function:

| Canonical | Also accepted |
| --- | --- |
| `avg` | `mean` |
| `distinct count` | `distinct`, `distinctcount`, `distinct_count` |
| `first` | `first by index` |
| `last` | `last_value` |
| `high` | `high_water_mark` |
| `low` | `low_water_mark` |
| `pct sum total` | `pct sum grand total`, `pct_sum_grand_total` |
| `var` | `variance` |
| `stddev` | `standard deviation` |

Most multi-word aggregates also answer to a snake_case spelling —
`sum_not_null`, `sum_abs`, `abs_sum`, `weighted_mean`, `distinct_leaf`,
`pct_sum_parent`, `pct_sum_total`, `min_by`, `max_by`. Three do not, and are
only accepted spelled with spaces: `high minus low`, `last minus first` and
`last by index`.

A few names the engine parses are _not implemented_ — `identity`,
`mean by count`, and `div`/`add`, which have no way to receive their operands
from a `ViewConfig`. Naming one is rejected exactly as a misspelled aggregate
is: the `View` fails to construct with an error naming the aggregate and the
column it was given for, and the `Table` is left untouched.
