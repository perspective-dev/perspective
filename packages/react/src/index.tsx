// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

/**
 * React bindings for [Perspective](https://perspective-dev.github.io/).
 *
 * This module exports {@link PerspectiveViewer}, a declarative React wrapper
 * for the `<perspective-viewer>` Custom Element. The component manages the
 * element's imperative lifecycle — `load()` and `restore()` in response to
 * prop changes, `delete()` on unmount — and exposes the element's Custom
 * Events as React-style callback props.
 *
 * Perspective's WebAssembly engine and UI must be initialized (and at least
 * one plugin package imported) before the first `<PerspectiveViewer>`
 * renders:
 *
 * ```tsx
 * import perspective from "@perspective-dev/client";
 * import perspective_viewer from "@perspective-dev/viewer";
 * import "@perspective-dev/viewer-datagrid";
 * import "@perspective-dev/viewer-charts";
 *
 * import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
 * import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";
 *
 * await Promise.all([
 *     perspective.init_server(fetch(SERVER_WASM)),
 *     perspective_viewer.init_client(fetch(CLIENT_WASM)),
 * ]);
 * ```
 *
 * Then pass a `Table` (or `Client`, or a `Promise` of either) and an optional
 * config:
 *
 * ```tsx
 * import { PerspectiveViewer } from "@perspective-dev/react";
 *
 * const WORKER = await perspective.worker();
 * const TABLE = WORKER.table(
 *     fetch("superstore.lz4.arrow").then((resp) => resp.arrayBuffer()),
 *     { name: "superstore" },
 * );
 *
 * const App: React.FC = () => (
 *     <PerspectiveViewer
 *         client={TABLE}
 *         config={{ group_by: ["State"], plugin: "Y Bar" }}
 *     />
 * );
 * ```
 *
 * # See Also
 *
 * - [`react-example`](https://github.com/perspective-dev/perspective/tree/master/examples/react-example)
 *   project from the Perspective GitHub repo, a complete bundler-configured
 *   application including a multi-panel workspace config.
 * - [Perspective User Guide](https://perspective-dev.github.io/guide/)
 * - [`<perspective-viewer>` API documentation](https://perspective-dev.github.io/viewer/modules/perspective-viewer.html)
 *
 * @module
 */

export * from "./viewer";
