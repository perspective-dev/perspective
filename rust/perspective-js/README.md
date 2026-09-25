# `@perspective-dev/client`

[![npm](https://img.shields.io/npm/v/@perspective-dev/client.svg?style=for-the-badge)](https://www.npmjs.com/package/@perspective-dev/client)

Perspective is an open-source data grid, pivot table and charting component for 
large, real-time and streaming datasets.

`@perspective-dev/client` is the JavaScript and TypeScript API for
Perspective's streaming query engine. The same `Client` connects to an engine
running in a Web Worker (WebAssembly), in-process in Node.js, or remotely over
WebSocket to a Python, Node.js or Rust server. It provides:

- `Table`, a columnar, optionally indexed store which accepts
  [Apache Arrow](https://arrow.apache.org/), CSV and JSON, and streams
  `update()` and `remove()` calls in real time. With `page_to_disk`, a
  `Table` pages its columns to disk (OPFS in the browser) to exceed memory.
- `View`, an incrementally-maintained query over a `Table`: `group_by`,
  `split_by` pivots, aggregates, filters, sorts and columnar expressions.
- Reactive joins across tables.
- Virtual servers for DuckDB and ClickHouse, which translate `View`
  configurations into native SQL.

## Installation

```bash
npm install @perspective-dev/client @perspective-dev/server
```

## Usage

```javascript
import perspective from "@perspective-dev/client";
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";

await perspective.init_server(fetch(SERVER_WASM));

const worker = await perspective.worker();
const table = await worker.table({ region: "string", sales: "float" });
const view = await table.view({
    group_by: ["region"],
    columns: ["sales"],
    aggregates: { sales: "sum" },
});

view.on_update(async () => console.log(await view.to_json()));
await table.update([{ region: "West", sales: 12.5 }]);
```

In Node.js the engine runs in-process, and the module exports the API
directly:

```javascript
const perspective = require("@perspective-dev/client");
const table = await perspective.table(data);
```

To render a `Table` as a data grid, pivot table or chart, see
[`@perspective-dev/viewer`](https://www.npmjs.com/package/@perspective-dev/viewer).

## Documentation

- [Project site and live examples](https://perspective-dev.github.io/)
- [User guide](https://perspective-dev.github.io/guide/)
- [Example gallery](https://perspective-dev.github.io/gallery/index.html)
- [GitHub](https://github.com/perspective-dev/perspective)
- [Bundling and WebAssembly setup](https://perspective-dev.github.io/guide/how_to/javascript/importing.html)
- [API reference](https://perspective-dev.github.io/browser/modules/src_ts_perspective.browser.ts.html)
