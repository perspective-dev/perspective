# Streaming pivot tables

<!-- description: A streaming pivot table keeps its groups, column splits and aggregates current as rows arrive. Perspective maintains pivots incrementally in a WebAssembly, Python or Rust engine, for free and open source under Apache-2.0. -->

A pivot table groups rows by one set of columns, splits them across another,
and aggregates the cells. A _streaming_ pivot table keeps that result correct
as the underlying rows are inserted, updated and removed — without recomputing
the whole pivot.

In Perspective a pivot is a [`View`](../explanation/view.md) with `group_by`
and `split_by`:

```javascript
const view = await table.view({
    group_by: ["Region", "State"],
    split_by: ["Category"],
    columns: ["Sales", "Profit"],
    aggregates: { Sales: "sum", Profit: "avg" },
    sort: [["Sales", "desc"]],
});
```

When [`table.update()`](../explanation/table/update_and_remove.md) is called,
the engine applies the delta to only the affected groups and notifies
subscribers:

```javascript
view.on_update(async (updated) => {
    const rows = await view.to_json();
}, { mode: "row" });
```

Loaded into `<perspective-viewer>`, the same configuration is an interactive
pivot grid: users drag columns between _Group By_, _Split By_, _Order By_ and
_Where_, expand and collapse row groups, and switch to a chart of the same
pivot.

```javascript
await viewer.load(table);
await viewer.restore({
    plugin: "Datagrid",
    group_by: ["Region", "State"],
    split_by: ["Category"],
    columns: ["Sales", "Profit"],
});
```

## What can be pivoted

- **Row pivots** — any number of [`group_by`](../explanation/view/config/grouping_and_pivots.md)
  levels, rendered as an expandable tree with subtotals at each level.
- **Column pivots** — any number of `split_by` levels, rendered as grouped
  column headers.
- **Aggregates** — sum, count, distinct count, average, weighted mean, median,
  min/max, first/last, standard deviation, variance and more, chosen per
  column.
- **Computed columns** — [`expressions`](../explanation/view/config/expressions.md)
  can be grouped, split, aggregated and filtered like any other column, so
  bucketing a datetime by month or binning a number is one expression.
- **Window columns** — [running totals, ranks, lags and rates](../explanation/view/config/windows.md).
- **Joins** — pivot over a [reactive join](../explanation/join.md) of two
  streaming tables.

## Where the pivot runs

The same pivot API runs in the browser (WebAssembly), in Node.js, in Python
and in Rust. It can also be delegated to a database: with a
[virtual server](../explanation/virtual_servers.md), a `group_by`/`split_by`
configuration is translated to SQL and executed by DuckDB, ClickHouse or
PostgreSQL.

## Licensing

Row and column pivoting, aggregation, charting of pivots and server-side
virtualization are all part of Perspective's Apache-2.0 open source
distribution. There is no commercial tier.

## Examples

- [Pivot by 2 row levels and 2 column levels](https://perspective-dev.github.io/gallery/feature-05-both-2.html)
- [Superstore workspace](https://perspective-dev.github.io/gallery/superstore-overview.html)
- [All examples](https://perspective-dev.github.io/gallery/index.html)
