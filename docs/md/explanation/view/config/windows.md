# Window Columns

The `windows` property declares _ordered, partitioned rolling computations_
over the rows of a `Table` — moving averages, cumulative sums,
period-over-period differences — analogous to SQL window functions.

Window Columns are declared per-`View`, keyed by output alias, exactly as
[`expressions`](./expressions.md) are:

<div class="javascript">

```javascript
const view = await table.view({
    columns: ["10-tick avg Sales"],
    windows: {
        "10-tick avg Sales": {
            column: "Sales",
            aggregate: "avg",
            rows: 10,
        },
    },
});
```

</div>
<div class="python">

```python
view = table.view(
    columns=["10-tick avg Sales"],
    windows={
        "10-tick avg Sales": {
            "column": "Sales",
            "aggregate": "avg",
            "rows": 10,
        }
    },
)
```

</div>

Each window produces a new column which may be used anywhere a `Table` column
can — in `columns`, `filter`, `sort`, `group_by`, and so on. An alias must not
collide with a `Table` column, an expression alias, or another window's key.

Window Columns update incrementally as the `Table` updates, including rows
_outside_ an update batch whose window frames were affected by it.

## Spec fields

| Field | Type | Description |
| --- | --- | --- |
| `column` | `string` | The input column — a `Table` column or an expression alias from the same config |
| `aggregate` | `string` | The window function to apply (see below) |
| `partition_by` | `string[]` | Columns whose distinct value tuples partition the rows; omitted partitions the whole `Table` as one group |
| `order_by` | `[string, "asc" \| "desc"]` | The column which orders each partition, and its direction |
| `rows` | `integer` | Frame of the N rows preceding each row, plus the row itself |
| `range` | `number` | Frame of rows whose `order_by` value lies within `range` of each row's |
| `cumulative` | `true` | Frame of all rows from the partition start through each row |
| `offset` | `integer` | Row offset for `lag`/`lead` (default `1`) |
| `alpha` | `number` | Smoothing factor in `(0, 1]` for `ema` |

`rows`, `range` and `cumulative` are **mutually exclusive** — supplying more
than one is an error. `range` requires a numeric or temporal `order_by`.

<div class="warning"><code>order_by</code> orders rows <em>within the window
frame</em> only. It does not reorder the <code>View</code> — that is what the
view-level <a href="./selection_and_ordering.md#sort"><code>sort</code></a>
property does.</div>

## Aggregates

| Aggregate | Description | Result type |
| --- | --- | --- |
| `sum`, `avg` | Rolling sum and mean over the frame | `float` |
| `stddev`, `var` | Rolling standard deviation and variance | `float` |
| `count` | Number of non-null values in the frame | `integer` |
| `min`, `max` | Smallest and largest value in the frame | input type |
| `lag`, `lead` | Value `offset` rows behind or ahead | input type |
| `diff` | This row's value minus the value `offset` rows behind | `float` |
| `rate` | Rate of change across the frame | `float` |
| `ema` | Exponential moving average, smoothed by `alpha` | `float` |

`sum`, `avg`, `stddev`, `var`, `diff`, `rate` and `ema` require a numeric
input column.

### Frame compatibility

- `sum`, `avg`, `count`, `min`, `max`, `stddev` and `var` accept any frame.
- `lag`, `lead`, `diff` and `ema` are frame-independent — they are computed
  from row offsets rather than a frame.
- **`rate` requires a `range` frame**, and is invalid with `rows` or
  `cumulative`.

<div class="warning">The <code>first</code> and <code>last</code> window
aggregates are declared in the type definitions but are <em>not yet
implemented</em> by the engine; a <code>View</code> which uses them will be
rejected.</div>

## Examples

### Moving average over a fixed row count

A 10-tick moving average, over the whole table in its natural order:

```json
{
    "columns": ["10-tick avg Sales"],
    "windows": {
        "10-tick avg Sales": {
            "column": "Sales",
            "aggregate": "avg",
            "rows": 10
        }
    }
}
```

### Moving average over a time range

A 5-second moving average, framing rows by their `Order Date` rather than by
count:

```json
{
    "columns": ["5s avg Sales"],
    "windows": {
        "5s avg Sales": {
            "column": "Sales",
            "aggregate": "avg",
            "order_by": ["Order Date", "asc"],
            "range": 5000
        }
    }
}
```

### Cumulative sum

A running total from the start of each partition:

```json
{
    "columns": ["Cumulative Sales"],
    "windows": {
        "Cumulative Sales": {
            "column": "Sales",
            "aggregate": "sum",
            "order_by": ["Order Date", "asc"],
            "cumulative": true
        }
    }
}
```

### Period-over-period change, per group

`partition_by` restarts the window at each new `Region`, so each region's
first row has no predecessor to difference against:

```json
{
    "columns": ["Region", "Sales", "Sales Δ"],
    "windows": {
        "Sales Δ": {
            "column": "Sales",
            "aggregate": "diff",
            "partition_by": ["Region"],
            "order_by": ["Order Date", "asc"]
        }
    }
}
```

## Support

Window Columns are implemented by Perspective's built-in engine, by the
DuckDB, ClickHouse and Polars
[Virtual Servers](../../virtual_servers.md), and by the
`<perspective-viewer>` UI. Virtual Servers advertise support through their
_features_ declaration, so the UI control is hidden for backends which do not
implement it.
