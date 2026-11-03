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
 * The public types of the `perspective-js` wasm-bindgen module, without its
 * loader internals.
 *
 * @module
 */

/// <reference lib="esnext.disposable" preserve="true" />

export type {
    Client,
    ExpressionError,
    GenericSQLVirtualServerModel,
    ProxySession,
    Table,
    TableDescription,
    View,
    VirtualDataSlice,
    VirtualHostedTable,
    VirtualServer,
    VirtualServerHandler,
} from "../../dist/wasm/perspective-js.d.ts";

export type * from "../../dist/ts-rs/AggSpec.d.ts";
export type * from "../../dist/ts-rs/ColumnType.d.ts";
export type * from "../../dist/ts-rs/ColumnWindow.d.ts";
export type * from "../../dist/ts-rs/DeleteOptions.d.ts";
export type * from "../../dist/ts-rs/Features.d.ts";
export type * from "../../dist/ts-rs/Filter.d.ts";
export type * from "../../dist/ts-rs/JoinOptions.d.ts";
export type * from "../../dist/ts-rs/JoinType.d.ts";
export type * from "../../dist/ts-rs/OnRemoveData.d.ts";
export type * from "../../dist/ts-rs/OnUpdateData.d.ts";
export type * from "../../dist/ts-rs/OnUpdateOptions.d.ts";
export type * from "../../dist/ts-rs/Scalar.d.ts";
export type * from "../../dist/ts-rs/SortDir.d.ts";
export type * from "../../dist/ts-rs/SystemInfo.d.ts";
export type * from "../../dist/ts-rs/TableInitOptions.d.ts";
export type * from "../../dist/ts-rs/TypedArrayWindow.d.ts";
export type * from "../../dist/ts-rs/UpdateOptions.d.ts";
export type * from "../../dist/ts-rs/ViewConfig.d.ts";
export type * from "../../dist/ts-rs/ViewConfigUpdate.d.ts";
export type * from "../../dist/ts-rs/ViewOnRemoveResp.d.ts";
export type * from "../../dist/ts-rs/ViewOnUpdateResp.d.ts";
export type * from "../../dist/ts-rs/ViewWindow.d.ts";
export type * from "../../dist/ts-rs/WindowAggSpec.d.ts";
