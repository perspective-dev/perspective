# `@perspective-dev/viewer-charts`

[![npm](https://img.shields.io/npm/v/@perspective-dev/viewer-charts.svg?style=for-the-badge)](https://www.npmjs.com/package/@perspective-dev/viewer-charts)

WebGL charts for large and streaming datasets. It is the charting plugin set
for `<perspective-viewer>`.

Perspective is an open-source data grid, pivot table and charting component for 
large, real-time and streaming datasets.

Chart types: X Bar, Y Bar, Y Line, Y Area, Y Scatter, X/Y Scatter, X/Y Line,
Heatmap, Treemap, Sunburst, Candlestick, OHLC, and tile-based Map Scatter, Map
Line and Map Density.

- Rendered with WebGL, so scatter plots and heatmaps stay interactive at
  dataset sizes where SVG and canvas charts stall.
- Charts redraw incrementally as the underlying `Table` updates in real time.
- Every chart is driven by the same pivot, filter, sort and expression
  configuration as the data grid, and users can switch between them freely.

## Usage

Importing the package registers the plugins with `<perspective-viewer>`:

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

With a bundler:

```javascript
import "@perspective-dev/viewer";
import "@perspective-dev/viewer-charts";
```

```javascript
await viewer.restore({ plugin: "Treemap", group_by: ["Category", "Sub-Category"], columns: ["Sales"] });
```

## Documentation

- [Project site and live examples](https://perspective-dev.github.io/)
- [User guide](https://perspective-dev.github.io/guide/)
- [Example gallery](https://perspective-dev.github.io/gallery/index.html)
- [GitHub](https://github.com/perspective-dev/perspective)
