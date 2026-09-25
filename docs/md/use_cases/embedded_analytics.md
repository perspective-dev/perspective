# Embedded analytics in a web application

<!-- description: Embed user-configurable, self-service analytics in your own web or React application with Perspective: a framework-free Web Component with drag-and-drop pivots, filters and charts, JSON save and restore, CSS theming, multi-panel dashboards, and an Apache-2.0 license. -->

Embedded analytics means giving your application's users a way to explore
_their_ data inside _your_ product — not a static chart you designed, and not a
link out to a separate BI tool. `<perspective-viewer>` is a component built for
that job.

- **A Web Component, not a platform.** It is one Custom Element with no
  framework dependency. It works in plain HTML and in React (via
  [`@perspective-dev/react`](../how_to/javascript/react.md)), Vue, Svelte and
  Angular through standard DOM APIs. There is no server to deploy unless you
  want one, and no iframe.
- **Self-service by default.** Users group, pivot, filter, sort, write
  computed columns and switch between data grid, charts and maps themselves.
- **State is JSON.** [`save()` and `restore()`](../how_to/javascript/save_restore.md)
  round-trip the entire configuration, so "saved views", shareable links and
  per-user defaults are a database column, not a feature to build.
- **Multi-panel dashboards.** One element can hold a tabbed, split layout of
  many panels with cross-panel global filters, saved and restored with
  `saveWorkspace()` and `restoreWorkspace()`.
- **Your brand.** [Themes](../how_to/javascript/theming.md) are CSS custom
  properties; several light and dark themes are included.
- **Your data path.** Load data in the browser, replicate it from your server,
  virtualize it server-side, or [point it at your database](./database_ui.md).
- **Apache-2.0.** No per-seat or per-deployment licensing, and no feature
  tier: pivoting, charts and server-side virtualization are all open source.

## React

```tsx
import * as React from "react";
import perspective from "@perspective-dev/client";
import { PerspectiveViewer } from "@perspective-dev/react";

const worker = await perspective.worker();
const table = worker.table(
    fetch("/api/orders.arrow").then((resp) => resp.arrayBuffer()),
);

export function OrdersReport({ saved, onChange }) {
    return (
        <PerspectiveViewer
            client={table}
            config={saved ?? { plugin: "Datagrid", group_by: ["Region"] }}
            onConfigUpdate={onChange}
        />
    );
}
```

WebAssembly initialization for your bundler is covered in
[Importing with or without a bundler](../how_to/javascript/importing.md); with
Next.js, load the component client-side only (`ssr: false`).

## Plain JavaScript

```javascript
const viewer = document.querySelector("perspective-viewer");
await viewer.load(table);
await viewer.restore(await loadSavedViewFor(user));

viewer.addEventListener("perspective-config-update", async () => {
    await persistSavedViewFor(user, await viewer.save());
});
```

## Constraining what users can do

`restore()` sets the starting point; users can change anything from there. To
lock an embedded report down, hide the configuration UI with the `settings`
config field and drive the element only from your own controls. Row-level
security belongs on the server: host a filtered `View`, or a
[virtual server](../explanation/virtual_servers.md) bound to a restricted
database role, rather than relying on a client-side filter.

## An assistant in the box

`<perspective-viewer>` includes an opt-in [LLM agent](./agent.md) which lets
users ask for a view in plain language.
