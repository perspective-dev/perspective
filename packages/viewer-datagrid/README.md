# `@perspective-dev/viewer-datagrid`

[![npm](https://img.shields.io/npm/v/@perspective-dev/viewer-datagrid.svg?style=for-the-badge)](https://www.npmjs.com/package/@perspective-dev/viewer-datagrid)

A virtual-scrolling, editable data grid and pivot table for the web, built on
[`regular-table`](https://github.com/finos/regular-table). It is the Datagrid
plugin for `<perspective-viewer>`.

Perspective is an open-source data grid, pivot table and charting component for 
large, real-time and streaming datasets.

- Renders only the visible window of rows and columns, so grids over millions
  of rows scroll smoothly, including when the data lives on a remote server.
- Row and column pivots (`group_by`, `split_by`) with expandable tree rows and
  grouped column headers.
- Live updates: cells repaint as the underlying `Table` streams.
- Per-column number, date and string formatting, conditional foreground and
  background colors, gradients and bars.
- Cell editing, row and region selection, copy and export.

## Usage

Importing the package registers the plugin with `<perspective-viewer>`:

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
import "@perspective-dev/viewer-datagrid";
```

```javascript
await viewer.restore({ plugin: "Datagrid", group_by: ["Region"], split_by: ["Category"] });
```

## Documentation

- [Project site and live examples](https://perspective-dev.github.io/)
- [User guide](https://perspective-dev.github.io/guide/)
- [Example gallery](https://perspective-dev.github.io/gallery/index.html)
- [GitHub](https://github.com/perspective-dev/perspective)
