# `@perspective-dev/viewer-summary`

[![npm](https://img.shields.io/npm/v/@perspective-dev/viewer-summary.svg?style=for-the-badge)](https://www.npmjs.com/package/@perspective-dev/viewer-summary)

A summary (KPI tile) plugin for `<perspective-viewer>`: each selected column's
total, drawn as large fitted text in a grid of tiles.

Perspective is an open-source data grid, pivot table and charting component for
large, real-time and streaming datasets.

- One tile per column, laid out to give the largest value text the panel allows,
  re-fitted as the panel resizes.
- The view is always the grand total (`group_rollup_mode: "total"`); filters and
  expressions apply as usual.
- `split_by` draws either a tile per split value or, in
  `split_rollup_mode: "rollup"`, a line or bar breakdown under each total.
- Per-column number and date formatting, colors, gradients, bars and pulse on
  update, shared with the Datagrid plugin.
- Live updates: tiles repaint as the underlying `Table` streams.

## Usage

Importing the package registers the plugin with `<perspective-viewer>`:

```html
<link
    rel="stylesheet"
    crossorigin="anonymous"
    href="https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/css/themes.css"
/>

<perspective-viewer style="height: 300px"></perspective-viewer>

<script type="module">
    import perspective from "https://cdn.jsdelivr.net/npm/@perspective-dev/client/dist/cdn/perspective.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-summary/dist/cdn/perspective-viewer-summary.js";

    const worker = await perspective.worker();
    const table = await worker.table([
        { region: "East", sales: 1250.5, profit: 310.25 },
        { region: "West", sales: 980.0, profit: -42.1 },
    ]);

    const viewer = document.querySelector("perspective-viewer");
    await viewer.load(table);
    await viewer.restore({ plugin: "Summary", columns: ["sales", "profit"] });
</script>
```

With a bundler:

```bash
npm install @perspective-dev/client @perspective-dev/viewer @perspective-dev/viewer-summary
```

```javascript
import "@perspective-dev/viewer";
import "@perspective-dev/viewer-summary";
```

## Documentation

- [Project site and live examples](https://perspective-dev.github.io/)
- [User guide](https://perspective-dev.github.io/guide/)
- [Example gallery](https://perspective-dev.github.io/gallery/index.html)
- [GitHub](https://github.com/perspective-dev/perspective)
