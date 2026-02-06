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
#[cfg(target_arch = "wasm32")]
mod duckdb_sql;
mod table;
mod table_data;
pub mod utils;
mod view;
#[cfg(target_arch = "wasm32")]
mod virtual_server;

#[cfg(feature = "export-init")]
use wasm_bindgen::prelude::*;

pub use crate::client::Client;
#[cfg(target_arch = "wasm32")]
pub use crate::duckdb_sql::*;
pub use crate::table::*;
pub use crate::table_data::*;
#[cfg(target_arch = "wasm32")]
pub use crate::virtual_server::*;

#[cfg(feature = "export-init")]
#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
export type * from "../../src/ts/ts-rs/ViewWindow.d.ts";
export type * from "../../src/ts/ts-rs/ColumnType.d.ts";
export type * from "../../src/ts/ts-rs/ColumnWindow.d.ts";
export type * from "../../src/ts/ts-rs/TableInitOptions.d.ts";
export type * from "../../src/ts/ts-rs/ViewConfigUpdate.d.ts";
export type * from "../../src/ts/ts-rs/ViewOnUpdateResp.d.ts";
export type * from "../../src/ts/ts-rs/OnUpdateOptions.d.ts";
export type * from "../../src/ts/ts-rs/UpdateOptions.d.ts";
export type * from "../../src/ts/ts-rs/DeleteOptions.d.ts";
export type * from "../../src/ts/ts-rs/Scalar.d.ts";
export type * from "../../src/ts/ts-rs/SystemInfo.d.ts";
export type * from "../../src/ts/ts-rs/SortDir.d.ts";
export type * from "../../src/ts/ts-rs/Filter.d.ts";
export type * from "../../src/ts/ts-rs/ViewConfig.d.ts";

import type {ColumnWindow} from "../../src/ts/ts-rs/ColumnWindow.d.ts";
import type {ColumnType} from "../../src/ts/ts-rs/ColumnType.d.ts";
import type {ViewWindow} from "../../src/ts/ts-rs/ViewWindow.d.ts";
import type {TableInitOptions} from "../../src/ts/ts-rs/TableInitOptions.d.ts";
import type {ViewConfigUpdate} from "../../src/ts/ts-rs/ViewConfigUpdate.d.ts";
import type * as on_update_args from "../../src/ts/ts-rs/ViewOnUpdateResp.d.ts";
import type {OnUpdateOptions} from "../../src/ts/ts-rs/OnUpdateOptions.d.ts";
import type {UpdateOptions} from "../../src/ts/ts-rs/UpdateOptions.d.ts";
import type {DeleteOptions} from "../../src/ts/ts-rs/DeleteOptions.d.ts";
import type {SystemInfo} from "../../src/ts/ts-rs/SystemInfo.d.ts";
"#;

#[cfg(feature = "export-init")]
#[wasm_bindgen]
pub fn init() {
    // console_error_panic_hook::set_once();
    utils::set_global_logging();
}
