# Trading blotters, order books and market data

<!-- description: Building trading UIs with Perspective: streaming blotters, order book depth, candlestick and OHLC charts, and heatmaps over live market data, in the browser or served from Python. -->

Perspective was originally developed to handle Financial market data: wide
tables, high update rates, keyed replacement of rows, and users who need to 
re-slice the data themselves while it is moving.

## The building blocks

**A blotter** is an indexed table in a data grid. With
[`index`](../explanation/table/options.md) set to the order or trade id, each
`update()` replaces that row in place; partial updates (only the changed
fields) are supported, and `remove()` deletes by key.

```javascript
const table = await worker.table(
    { id: "string", symbol: "string", side: "string", price: "float", qty: "integer", status: "string", time: "datetime" },
    { index: "id" },
);

table.update([{ id: "o-1841", status: "filled" }]);
```

**An order book** is a pivot of that same table: `group_by` price,
`split_by` side, `sum` of quantity, filtered to open orders.

```javascript
await viewer.restore({
    plugin: "X Bar",
    group_by: ["price"],
    split_by: ["side"],
    columns: ["qty"],
    filter: [["status", "==", "open"]],
});
```

**Candlesticks** are a pivot too: `group_by` a time bucket expression, with
`first`, `last`, `high` and `low` aggregates over aliases of the price column,
drawn by the Candlestick or OHLC plugin.

```javascript
await viewer.restore({
    plugin: "Candlestick",
    group_by: ["bucket(\"time\", 'm')"],
    columns: ["open", "close", "high", "low"],
    expressions: {
        "bucket(\"time\", 'm')": "bucket(\"time\", 'm')",
        open: '"price"',
        close: '"price"',
        high: '"price"',
        low: '"price"',
    },
    aggregates: { open: "first", close: "last", high: "high", low: "low" },
});
```

Because every one of these is a `View` over one streaming `Table`, they stay
mutually consistent tick by tick, and users can change any of them — regroup
by sector, filter to a book, switch the blotter to a heatmap — without code.

## Conditional formatting

The data grid supports per-column number formatting, positive/negative
foreground and background colors, gradients and in-cell bars, all set from the
column settings panel and captured in the saved configuration.

## Deployment shapes

- **Desktop containers and internal web apps** — `<perspective-viewer>` is a
  standard Web Component with no framework dependency, and ships
  [React bindings](../how_to/javascript/react.md).
- **Python services** — host tables from
  [Tornado, FastAPI/Starlette or aiohttp](../how_to/python/websocket.md);
  ingest `pandas`, `polars` or `pyarrow` directly.
- **ClickHouse, DuckDB, PostgreSQL, Polars** — put the UI directly over the
  tick store with a [virtual server](../explanation/virtual_servers.md).
- **Research notebooks** — the same widget in
  [Jupyter](../how_to/python/jupyterlab.md).

## Examples

- [Market](https://perspective-dev.github.io/gallery/market-trading-desk.html)
  — blotter, order book chart and candlesticks over one simulated feed.
- [Market — Orders](https://perspective-dev.github.io/gallery/market-order-flow.html)
