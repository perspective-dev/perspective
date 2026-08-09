# `@perspective-dev/react`

[![npm](https://img.shields.io/npm/v/@perspective-dev/react.svg?style=for-the-badge)](https://www.npmjs.com/package/@perspective-dev/react)

React bindings for [Perspective](https://perspective-dev.github.io/), an
interactive analytics and data visualization component for large, real-time
and streaming datasets. This package wraps the
[`<perspective-viewer>`](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html)
Custom Element in an idiomatic, declarative React component,
`<PerspectiveViewer>`, which manages the element's imperative
`load()`/`restore()`/`delete()` lifecycle for you.

## Installation

```bash
npm install @perspective-dev/react
```

`@perspective-dev/client` and `@perspective-dev/viewer` are installed as
dependencies, but you'll also want at least one plugin package for the
visualizations themselves:

```bash
npm install @perspective-dev/viewer-datagrid @perspective-dev/viewer-charts
```

## Setup

Perspective's engine and UI are WebAssembly binaries which must be initialized
once, before the first `<PerspectiveViewer>` renders. Plugins register
themselves via import side effects. See the
[User Guide's bundling section](https://perspective-dev.github.io/guide/how_to/javascript/importing.html)
for bundler configuration details.

```tsx
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
```

## Usage

Create a `Table` (here in a Web Worker `Client`) and pass it — or a `Promise`
of it — to `<PerspectiveViewer>`:

```tsx
import * as React from "react";
import { PerspectiveViewer } from "@perspective-dev/react";

const WORKER = await perspective.worker();

const TABLE = WORKER.table(
    fetch("superstore.lz4.arrow").then((resp) => resp.arrayBuffer()),
    { name: "superstore" },
);

const App: React.FC = () => (
    <PerspectiveViewer
        client={TABLE}
        config={{ group_by: ["State"], plugin: "Y Bar" }}
    />
);
```

## Props

| Prop             | Type                                                          | Description                                                     |
| :--------------- | :------------------------------------------------------------ | :-------------------------------------------------------------- |
| `client`         | `Client \| Table \| Promise<Client> \| Promise<Table>`        | Data source. When `undefined`, the viewer `eject()`s.           |
| `config`         | `ViewerConfigUpdate \| WorkspaceConfigUpdate`                 | Declarative viewer state, applied via `restore()`.              |
| `onConfigUpdate` | `(config: ViewerConfigUpdate) => void`                        | Called when the user reconfigures the viewer through its UI.    |
| `onClick`        | `(detail: PerspectiveClickEventDetail) => void`               | Called when the user clicks a datapoint.                        |
| `onSelect`       | `(detail: PerspectiveSelectEventDetail) => void`              | Called when the user selects (or deselects) a datapoint or row. |

A subset of standard HTML attributes — `className`, `id`, `style`, `hidden`,
`slot`, `tabIndex` and `title` — is forwarded to the underlying element.

### `client`

The viewer's data source, forwarded to
[`viewer.load()`](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html)
whenever it changes:

-   A `Table` (or `Promise<Table>`) displays that table directly.
-   A `Client` (e.g. from `perspective.worker()` or a WebSocket connection to a
    remote server) connects the viewer to every table hosted by that client;
    the table each panel displays is chosen by `config` or interactively by
    the user.
-   `undefined` ejects the viewer, returning it to an unloaded state without
    unmounting it.

The component does not take ownership of the `Table` — delete it yourself
when it is no longer needed (e.g. `table.delete({ lazy: true })`).

### `config`

Declarative viewer state — group-bys, splits, filters, sorts, expressions,
plugin and plugin config — applied with `restore()` whenever it (or `client`)
changes. A config with a `panels` property is treated as a multi-panel
workspace layout and applied with `restoreWorkspace()` instead. Configs are
compared structurally, so passing a fresh-but-equal object literal on each
render does not re-apply.

Combine `config` with `onConfigUpdate` to make the viewer a controlled
component — store the user's latest configuration in state (or persist it) and
pass it back down:

```tsx
const App: React.FC = () => {
    const [config, setConfig] = React.useState<pspViewer.ViewerConfigUpdate>({
        group_by: ["Category"],
    });

    return (
        <PerspectiveViewer
            client={TABLE}
            config={config}
            onConfigUpdate={setConfig}
        />
    );
};
```

## Lifecycle

On unmount, the component calls the element's `delete()` method, freeing the
viewer's WebAssembly resources. Tables and clients are created outside the
component and are yours to manage; a `Table` passed as `client` survives
unmount and can be shown again by a later mount.

## See also

-   [`react-example`](https://github.com/perspective-dev/perspective/tree/master/examples/react-example)
    — a complete bundler-configured project using this package, including a
    multi-panel workspace config.
-   [Perspective User Guide](https://perspective-dev.github.io/guide/)
-   [`<perspective-viewer>` API documentation](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html)
-   [`@perspective-dev/client` API documentation](https://perspective-dev.github.io/browser/modules/src_ts_perspective.browser.ts.html)
