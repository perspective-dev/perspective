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

//! The API for the [`@perspective-dev/viewer`](https://perspective-dev.github.io)
//! JavaScript library.

// Required by yew's `html` macro.
#![recursion_limit = "1024"]
#![feature(const_type_name)]
#![feature(iter_intersperse)]
#![feature(stmt_expr_attributes)]
#![feature(try_blocks)]
#![allow(async_fn_in_trait)]
#![warn(
    clippy::all,
    clippy::panic_in_result_fn,
    clippy::fallible_impl_from,
    clippy::unneeded_field_pattern
)]
#![deny(clippy::await_holding_refcell_ref)]

#[cfg(feature = "llm-agent")]
mod agent;
pub mod components;
pub mod config;
pub mod custom_elements;
mod custom_events;
mod derived;
pub mod exprtk;
mod js;
mod presentation;
mod root;

#[doc(hidden)]
pub mod queries;
mod renderer;
mod session;

#[doc(hidden)]
pub mod tasks;
pub mod ui;
pub mod utils;
mod workspace;

#[macro_use]
extern crate macro_rules_attribute;
extern crate alloc;

use std::cell::RefCell;

use perspective_js::utils::*;
use wasm_bindgen::prelude::*;

use crate::custom_elements::debug_plugin::PerspectiveDebugPluginElement;
use crate::custom_elements::viewer::PerspectiveViewerElement;
use crate::utils::define_web_component;

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
import type {
    ColumnType,
    ColumnWindow,
    DeleteOptions,
    Features,
    JoinOptions,
    OnRemoveData,
    OnUpdateData,
    OnUpdateOptions,
    Scalar,
    SystemInfo,
    TableInitOptions,
    TypedArrayWindow,
    UpdateOptions,
    ViewConfig,
    ViewConfigUpdate,
    ViewWindow,
} from "@perspective-dev/client";

export type * from "../../src/ts/ts-rs/ViewerConfig.ts";
export type * from "../../src/ts/ts-rs/ViewerConfigUpdate.ts";
export type * from "../../src/ts/ts-rs/ViewerConfigInitial.ts";
export type * from "../../src/ts/ts-rs/PluginStaticConfig.ts";
export type * from "../../src/ts/ts-rs/WorkspaceConfig.ts";
export type * from "../../src/ts/ts-rs/TableRef.ts";
export type * from "../../src/ts/ts-rs/DerivedTableConfig.ts";
export type * from "../../src/ts/ts-rs/WorkspaceConfigUpdate.ts";
export type * from "../../src/ts/ts-rs/ExportMethod.ts";
export type * from "../../src/ts/ts-rs/PanelOptions.ts";
export type * from "../../src/ts/ts-rs/RestoreOptions.ts";
export type * from "../../src/ts/ts-rs/RestoreWorkspaceOptions.ts";
export type * from "../../src/ts/ts-rs/AddPanelOptions.ts";
export type * from "../../src/ts/ts-rs/SaveWorkspaceOptions.ts";
export type * from "../../src/ts/ts-rs/ClientOptions.ts";
export type * from "../../src/ts/ts-rs/ExportOptions.ts";
export type * from "../../src/ts/ts-rs/GetTableOptions.ts";
export type * from "../../src/ts/ts-rs/GetClientOptions.ts";
export type * from "../../src/ts/ts-rs/GetViewOptions.ts";
export type * from "../../src/ts/ts-rs/GetViewMode.ts";
export type * from "../../src/ts/ts-rs/CustomNumberFormatConfig.ts";
export type * from "../../src/ts/ts-rs/NumberFormatStyle.ts";
export type * from "../../src/ts/ts-rs/Notation.ts";
export type * from "../../src/ts/ts-rs/DatetimeFormat.ts";
export type * from "../../src/ts/ts-rs/ConfigDefaultsOptions.ts";
export type * from "../../src/ts/ts-rs/ColumnConfigDefaultsOptions.ts";

import type {GetTableOptions} from "../../src/ts/ts-rs/GetTableOptions.ts";
import type {PanelOptions} from "../../src/ts/ts-rs/PanelOptions.ts";
import type {RestoreOptions} from "../../src/ts/ts-rs/RestoreOptions.ts";
import type {RestoreWorkspaceOptions} from "../../src/ts/ts-rs/RestoreWorkspaceOptions.ts";
import type {AddPanelOptions} from "../../src/ts/ts-rs/AddPanelOptions.ts";
import type {SaveWorkspaceOptions} from "../../src/ts/ts-rs/SaveWorkspaceOptions.ts";
import type {ConfigDefaultsOptions} from "../../src/ts/ts-rs/ConfigDefaultsOptions.ts";
import type {ColumnConfigDefaultsOptions} from "../../src/ts/ts-rs/ColumnConfigDefaultsOptions.ts";
import type {ExportOptions} from "../../src/ts/ts-rs/ExportOptions.ts";
import type {GetClientOptions} from "../../src/ts/ts-rs/GetClientOptions.ts";
import type {GetViewOptions} from "../../src/ts/ts-rs/GetViewOptions.ts";
import type {ClientOptions} from "../../src/ts/ts-rs/ClientOptions.ts";
import type {ViewerConfig} from "../../src/ts/ts-rs/ViewerConfig.ts";
import type {ViewerConfigUpdate} from "../../src/ts/ts-rs/ViewerConfigUpdate.ts";
import type {ViewerConfigInitial} from "../../src/ts/ts-rs/ViewerConfigInitial.ts";
import type {WorkspaceConfig} from "../../src/ts/ts-rs/WorkspaceConfig.ts";
import type {WorkspaceConfigUpdate} from "../../src/ts/ts-rs/WorkspaceConfigUpdate.ts";
"#;

/// Register a plugin globally.
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn registerPlugin(name: &str) {
    use crate::renderer::*;
    PLUGIN_REGISTRY.register_plugin(name);
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Record<string, unknown> | null")]
    pub type JsConfigDefaults;

    #[wasm_bindgen(typescript_type = "ConfigDefaultsOptions")]
    pub type JsConfigDefaultsOptions;

    #[wasm_bindgen(typescript_type = "ColumnConfigDefaultsOptions")]
    pub type JsColumnConfigDefaultsOptions;

    #[wasm_bindgen(
        typescript_type = "Array<{ plugin?: string; defaults: Record<string, unknown> }>"
    )]
    pub type JsPluginConfigDefaultsSlots;

    #[wasm_bindgen(
        typescript_type = "Array<{ plugin?: string; type?: ColumnType; defaults: Record<string, \
                           unknown> }>"
    )]
    pub type JsColumnConfigDefaultsSlots;
}

fn defaults_options<T: Default + serde::de::DeserializeOwned>(
    options: Option<impl Into<JsValue>>,
) -> ApiResult<T> {
    match options {
        None => Ok(T::default()),
        Some(options) => Ok(options.into().into_serde_ext()?),
    }
}

/// Merge `defaults` into the `plugin_config` defaults every
/// `<perspective-viewer>` on the page applies, where a `null` value removes a
/// default and a `null` `defaults` clears the slot.
///
/// # Arguments
///
/// - `defaults` - Values keyed like `plugin_config`, or `null`.
/// - `options.plugin` - Limits the defaults to the named plugin.
///
/// # JavaScript Examples
///
/// ```javascript
/// customElements.get("perspective-viewer").setPluginConfigDefaults({group_pad: 10});
/// ```
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn setPluginConfigDefaults(
    defaults: JsConfigDefaults,
    options: Option<JsConfigDefaultsOptions>,
) -> ApiResult<()> {
    let config::ConfigDefaultsOptions { plugin } = defaults_options(options)?;
    renderer::set_plugin_config_defaults(&defaults, plugin.as_deref())
}

/// Merge `defaults` into the `columns_config` defaults every
/// `<perspective-viewer>` on the page applies, where a `null` value removes a
/// default and a `null` `defaults` clears the slot.
///
/// # Arguments
///
/// - `defaults` - Values keyed like one `columns_config` entry, or `null`.
/// - `options.plugin` - Limits the defaults to the named plugin.
/// - `options.type` - Limits the defaults to columns of this view type.
///
/// # JavaScript Examples
///
/// ```javascript
/// customElements
///     .get("perspective-viewer")
///     .setColumnConfigDefaults({date_format: {timeZone: "UTC"}}, {type: "datetime"});
/// ```
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn setColumnConfigDefaults(
    defaults: JsConfigDefaults,
    options: Option<JsColumnConfigDefaultsOptions>,
) -> ApiResult<()> {
    let config::ColumnConfigDefaultsOptions { plugin, ty } = defaults_options(options)?;
    renderer::set_column_config_defaults(&defaults, plugin.as_deref(), ty.as_deref())
}

/// The `plugin_config` defaults set by [`setPluginConfigDefaults`], one entry
/// per slot.
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn getPluginConfigDefaults() -> ApiResult<JsPluginConfigDefaultsSlots> {
    Ok(renderer::get_plugin_config_defaults()?.unchecked_into())
}

/// The `columns_config` defaults set by [`setColumnConfigDefaults`], one entry
/// per slot.
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn getColumnConfigDefaults() -> ApiResult<JsColumnConfigDefaultsSlots> {
    Ok(renderer::get_column_config_defaults()?.unchecked_into())
}

/// Register this crate's Custom Elements in the browser's current session.
///
/// This must occur before calling any public API methods on these Custom
/// Elements from JavaScript, as the methods themselves won't be defined yet.
/// By default, this crate does not register `PerspectiveViewerElement` (as to
/// preserve backwards-compatible synchronous API).
#[cfg(not(feature = "external-bootstrap"))]
#[wasm_bindgen(js_name = "init")]
pub fn js_init(module: js_sys::WebAssembly::Module, url: web_sys::Url) {
    console_error_panic_hook::set_once();
    perspective_js::utils::set_global_logging();
    define_web_components!("export * as psp from '../../perspective-viewer.js'");
    MODULE.with_borrow_mut(|f| {
        *f = Some((module, url));
    });

    tracing::info!("Perspective initialized.");
}

thread_local! {
    static MODULE: RefCell<Option<(js_sys::WebAssembly::Module, web_sys::Url)>> = RefCell::default();
}

#[cfg(not(feature = "external-bootstrap"))]
#[wasm_bindgen(js_name = "get_wasm_module")]
pub fn js_get_module() -> Result<js_sys::WebAssembly::Module, JsValue> {
    MODULE
        .with_borrow(|f| f.clone().map(|x| x.0))
        .ok_or_else(|| "Uninited module".into())
}

#[cfg(not(feature = "external-bootstrap"))]
#[wasm_bindgen(js_name = "get_worker_url")]
pub fn js_get_worker_url() -> Result<web_sys::Url, JsValue> {
    MODULE
        .with_borrow(|f| f.clone().map(|x| x.1))
        .ok_or_else(|| "Uninited module".into())
}

/// Register Web Components with the global registry, given a Perspective
/// module.
///
/// This function shouldn't be called directly;  instead, use the
/// `define_web_components!` macro to both call this method and hook the
/// wasm_bindgen module object.
pub fn bootstrap_web_components(psp: &JsValue) {
    define_web_component::<PerspectiveViewerElement>(psp);
    define_web_component::<PerspectiveDebugPluginElement>(psp);
}

/// Defining the web components needs an extern struct to reference the
/// generated JavaSript glue. This is parameterized by an attribute macro which
/// needs to be determined by the top-level compiled module - the JavaScript
/// glue code emitted by `wasm-bindgen-cli`.
#[macro_export]
macro_rules! define_web_components {
    ($x:expr) => {{
        #[wasm_bindgen::prelude::wasm_bindgen(inline_js = $x)]
        extern "C" {
            #[wasm_bindgen::prelude::wasm_bindgen(js_name = "psp")]
            #[wasm_bindgen::prelude::wasm_bindgen(thread_local_v2)]
            pub static PSP: wasm_bindgen::prelude::JsValue;
        }

        PSP.with(|x| $crate::bootstrap_web_components(x));
    }};
}
