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

//! <div class="warning">
//! The examples in this module are in JavaScript. See <a href="https://docs.rs/crate/perspective/latest"><code>perspective</code></a> docs for the Rust API.
//! </div>

#![warn(
    clippy::all,
    clippy::panic_in_result_fn,
    clippy::await_holding_refcell_ref,
    rustdoc::broken_intra_doc_links,
    unstable_features
)]
#![allow(non_snake_case)]

extern crate alloc;

mod client;
mod generic_sql_model;
mod table;
mod table_data;
mod typed_array;
pub mod utils;
mod view;
mod virtual_server;

#[cfg(feature = "export-init")]
use wasm_bindgen::prelude::*;

pub use crate::client::Client;
pub use crate::generic_sql_model::*;
pub use crate::table::*;
pub use crate::table_data::*;
pub use crate::typed_array::*;
pub use crate::virtual_server::*;

#[cfg(feature = "export-init")]
#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
export type * from "../ts-rs/ViewWindow.d.ts";
export type * from "../ts-rs/ColumnType.d.ts";
export type * from "../ts-rs/ColumnWindow.d.ts";
export type * from "../ts-rs/TableInitOptions.d.ts";
export type * from "../ts-rs/ViewConfigUpdate.d.ts";
export type * from "../ts-rs/ViewOnUpdateResp.d.ts";
export type * from "../ts-rs/ViewOnRemoveResp.d.ts";
export type * from "../ts-rs/OnRemoveData.d.ts";
export type * from "../ts-rs/OnUpdateData.d.ts";
export type * from "../ts-rs/OnUpdateOptions.d.ts";
export type * from "../ts-rs/UpdateOptions.d.ts";
export type * from "../ts-rs/DeleteOptions.d.ts";
export type * from "../ts-rs/Scalar.d.ts";
export type * from "../ts-rs/SystemInfo.d.ts";
export type * from "../ts-rs/SortDir.d.ts";
export type * from "../ts-rs/Filter.d.ts";
export type * from "../ts-rs/ViewConfig.d.ts";
export type * from "../ts-rs/JoinOptions.d.ts";
export type * from "../ts-rs/JoinType.d.ts";
export type * from "../ts-rs/TypedArrayWindow.d.ts";
export type * from "../ts-rs/Features.d.ts";
export type * from "../ts-rs/AggSpec.d.ts";
export type * from "../ts-rs/WindowAggSpec.d.ts";

import type {ColumnWindow} from "../ts-rs/ColumnWindow.d.ts";
import type {ColumnType} from "../ts-rs/ColumnType.d.ts";
import type {ViewWindow} from "../ts-rs/ViewWindow.d.ts";
import type {TypedArrayWindow} from "../ts-rs/TypedArrayWindow.d.ts";
import type {TableInitOptions} from "../ts-rs/TableInitOptions.d.ts";
import type {JoinOptions} from "../ts-rs/JoinOptions.d.ts";
import type {JoinType} from "../ts-rs/JoinType.d.ts";
import type {ViewConfigUpdate} from "../ts-rs/ViewConfigUpdate.d.ts";
import type * as on_update_args from "../ts-rs/ViewOnUpdateResp.d.ts";
import type {OnRemoveData} from "../ts-rs/OnRemoveData.d.ts";
import type {OnUpdateData} from "../ts-rs/OnUpdateData.d.ts";
import type {OnUpdateOptions} from "../ts-rs/OnUpdateOptions.d.ts";
import type {UpdateOptions} from "../ts-rs/UpdateOptions.d.ts";
import type {DeleteOptions} from "../ts-rs/DeleteOptions.d.ts";
import type {SystemInfo} from "../ts-rs/SystemInfo.d.ts";
import type {ViewConfig} from "../ts-rs/ViewConfig.d.ts";
import type {Scalar} from "../ts-rs/Scalar.d.ts";
import type {Features} from "../ts-rs/Features.d.ts";
"#;

#[cfg(feature = "export-init")]
#[wasm_bindgen]
pub fn init() {
    // console_error_panic_hook::set_once();
    utils::set_global_logging();
}
