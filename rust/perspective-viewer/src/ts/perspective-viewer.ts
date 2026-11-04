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
 * Module for the `<perspective-viewer>` custom element.  This module has no
 * (real) exports, but importing it has a side effect: the
 * `PerspectiveViewerElement` class is registered as a custom element, after
 * which it can be used as a standard DOM element.
 *
 * Though `<perspective-viewer>` is written mostly in Rust, the nature
 * of WebAssembly's compilation makes it a dynamic module;  in order to
 * guarantee that the Custom Elements extension methods are registered
 * synchronously with this package's import, we need perform said registration
 * within this wrapper module.  As a result, the API methods of the Custom
 * Elements are all `async` (as they must await the wasm module instance).
 *
 * The documentation in this module defines the instance structure of a
 * `<perspective-viewer>` DOM object instantiated typically, through HTML or any
 * relevent DOM method e.g. `document.createElement("perspective-viewer")` or
 * `document.getElementsByTagName("perspective-viewer")`.
 *
 * @module perspective-viewer
 */

/// <reference lib="esnext.disposable" preserve="true" />

import "regular-layout";

export type { IPerspectiveViewerPlugin } from "./plugin.ts";
export { HTMLPerspectiveViewerPluginElement } from "./plugin.ts";
export { providers } from "./providers.ts";
export type { AgentProviderPreset } from "./providers.ts";

export {
    createNumberFormatter,
    createDatetimeFormatter,
    createDateFormatter,
    sourceColumn,
} from "./column-format.ts";
export type { NumberFormatConfig, DateFormatConfig } from "./column-format.ts";

export type * from "./extensions.ts";
export { PerspectiveSelectDetail } from "./select-detail.ts";
export type * from "../../dist/ts-rs/ViewerConfigUpdate.d.ts";
export type * from "../../dist/ts-rs/ViewerConfig.d.ts";
export type * from "../../dist/ts-rs/WorkspaceConfigUpdate.d.ts";
export type * from "../../dist/ts-rs/WorkspaceConfig.d.ts";
export type * from "../../dist/ts-rs/Filter.d.ts";
export type * from "../../dist/ts-rs/FilterTerm.d.ts";
export type * from "../../dist/ts-rs/FilterReducer.d.ts";
export type * from "../../dist/ts-rs/PluginStaticConfig.d.ts";
export type * from "../../dist/ts-rs/ExportMethod.d.ts";
export type * from "../../dist/ts-rs/PanelOptions.d.ts";
export type * from "../../dist/ts-rs/SaveWorkspaceOptions.d.ts";
export type * from "../../dist/ts-rs/ClientOptions.d.ts";
export type * from "../../dist/ts-rs/ExportOptions.d.ts";
export type * from "../../dist/ts-rs/GetTableOptions.d.ts";
export type * from "../../dist/ts-rs/GetClientOptions.d.ts";
export type * from "../../dist/ts-rs/GetViewOptions.d.ts";
export type * from "../../dist/ts-rs/GetViewMode.d.ts";

export { init, init_client, migrate } from "./bootstrap.ts";
export type {
    InitOptions,
    ViewerWasmRegistration,
    ViewerWasmSource,
    WasmBinary,
    WasmRegistration,
    WasmSource,
} from "./bootstrap.ts";
export type {
    MigrateKind,
    MigrateNotice,
    MigrateResult,
} from "@perspective-dev/client";
import { init, init_client, migrate } from "./bootstrap.ts";

export default { init, init_client, migrate };
