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
#![feature(more_qualified_paths)]
#![warn(
    clippy::all,
    clippy::panic_in_result_fn,
    clippy::await_holding_refcell_ref,
    clippy::fallible_impl_from,
    clippy::unneeded_field_pattern
)]

pub mod components;
pub mod config;
pub mod custom_elements;
mod custom_events;
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
pub mod utils;

#[macro_use]
extern crate macro_rules_attribute;
extern crate alloc;

use std::cell::RefCell;

use perspective_js::utils::*;
use wasm_bindgen::prelude::*;

use crate::custom_elements::copy_dropdown::CopyDropDownMenuElement;
use crate::custom_elements::debug_plugin::PerspectiveDebugPluginElement;
use crate::custom_elements::export_dropdown::ExportDropDownMenuElement;
use crate::custom_elements::viewer::PerspectiveViewerElement;
use crate::utils::define_web_component;

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
import type {
    ColumnType,
    TableInitOptions,
    ColumnWindow,
    ViewWindow, 
    TypedArrayWindow,
    OnUpdateOptions,
    JoinOptions,
    UpdateOptions,
    DeleteOptions,
    ViewConfigUpdate,
    SystemInfo,
} from "@perspective-dev/client";

export type * from "../../src/ts/ts-rs/ViewerConfig.d.ts";
export type * from "../../src/ts/ts-rs/ViewerConfigUpdate.d.ts";
export type * from "../../src/ts/ts-rs/PluginStaticConfig.d.ts";
import type {ViewerConfig} from "../../src/ts/ts-rs/ViewerConfig.d.ts";
import type {ViewerConfigUpdate} from "../../src/ts/ts-rs/ViewerConfigUpdate.d.ts";
"#;

/// Register a plugin globally.
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn registerPlugin(name: &str) {
    use crate::renderer::*;
    PLUGIN_REGISTRY.register_plugin(name);
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
    define_web_component::<CopyDropDownMenuElement>(psp);
    define_web_component::<ExportDropDownMenuElement>(psp);
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
