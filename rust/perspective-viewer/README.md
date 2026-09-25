# `@perspective-dev/viewer`

[![npm](https://img.shields.io/npm/v/@perspective-dev/viewer.svg?style=for-the-badge)](https://www.npmjs.com/package/@perspective-dev/viewer)

Perspective is an open-source data grid, pivot table and charting component for 
large, real-time and streaming datasets.

`@perspective-dev/viewer` provides `<perspective-viewer>`, a framework-free
Web Component (Custom Element) which gives users a drag-and-drop interface for
grouping, pivoting, filtering, sorting and charting a Perspective `Table`.
Configurations can be saved and restored as JSON, themed with CSS, and update
live as the underlying data streams in.

Visualizations are plugins:

- [`@perspective-dev/viewer-datagrid`](https://www.npmjs.com/package/@perspective-dev/viewer-datagrid),
  a virtual-scrolling, editable data grid and pivot table.
- [`@perspective-dev/viewer-charts`](https://www.npmjs.com/package/@perspective-dev/viewer-charts),
  WebGL bar, line, area, scatter, heatmap, treemap, sunburst, candlestick,
  OHLC and map charts.

For React, see
[`@perspective-dev/react`](https://www.npmjs.com/package/@perspective-dev/react).

## Quick start, no bundler

```html
<link rel="stylesheet" crossorigin="anonymous"
      href="https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/css/themes.css" />

<perspective-viewer style="height: 600px"></perspective-viewer>

<script type="module">
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js";
    import perspective from "https://cdn.jsdelivr.net/npm/@perspective-dev/client/dist/cdn/perspective.js";

    const worker = await perspective.worker();
    const table = worker.table("x,y\n1,2\n3,4");
    document.querySelector("perspective-viewer").load(table);
</script>
```

## Installation with a bundler

```bash
npm install @perspective-dev/client @perspective-dev/server \
    @perspective-dev/viewer @perspective-dev/viewer-datagrid \
    @perspective-dev/viewer-charts
```

```javascript
import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
import "@perspective-dev/viewer/dist/css/themes.css";

import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

await Promise.all([
    perspective.init_server(fetch(SERVER_WASM)),
    perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);

const worker = await perspective.worker();
const viewer = document.querySelector("perspective-viewer");
await viewer.load(worker.table(data));
await viewer.restore({ plugin: "Y Bar", group_by: ["Region"], columns: ["Sales"] });
```

Loader configuration for Vite, esbuild and Webpack is covered in the
[bundling guide](https://perspective-dev.github.io/guide/how_to/javascript/importing.html).

## Documentation

- [Project site and live examples](https://perspective-dev.github.io/)
- [User guide](https://perspective-dev.github.io/guide/)
- [Example gallery](https://perspective-dev.github.io/gallery/index.html)
- [GitHub](https://github.com/perspective-dev/perspective)
- [API reference](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html)
