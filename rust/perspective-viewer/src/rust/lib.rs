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

// Required by yew's `html` macro.
#![recursion_limit = "1024"]
#![feature(async_fn_in_trait)]
#![feature(const_type_name)]
#![feature(lazy_cell)]
#![feature(let_chains)]
#![feature(macro_metavar_expr)]
#![feature(return_position_impl_trait_in_trait)]
#![feature(stmt_expr_attributes)]
#![warn(
    clippy::all,
    clippy::panic_in_result_fn,
    clippy::await_holding_refcell_ref
)]

pub mod components;
pub mod config;
pub mod custom_elements;
mod custom_events;
mod dragdrop;
mod exprtk;
mod js;
mod model;
mod presentation;
mod renderer;
mod session;
pub mod utils;

use perspective::utils::*;
use perspective::JsClient;
use wasm_bindgen::prelude::*;

use crate::custom_elements::copy_dropdown::CopyDropDownMenuElement;
use crate::custom_elements::debug_plugin::PerspectiveDebugPluginElement;
use crate::custom_elements::export_dropdown::ExportDropDownMenuElement;
use crate::custom_elements::viewer::PerspectiveViewerElement;
use crate::utils::define_web_component;

/// Register a plugin globally.
#[wasm_bindgen(js_name = "registerPlugin")]
pub fn js_register_plugin(name: &str) {
    use crate::renderer::*;
    PLUGIN_REGISTRY.register_plugin(name);
}

#[wasm_bindgen]
pub fn js_worker(send: js_sys::Function) -> JsClient {
    perspective::worker(send)
}

/// Export all ExprTK commands, for use in generating documentation.
#[wasm_bindgen(js_name = "getExprTKCommands")]
pub fn js_get_exprtk_commands() -> ApiResult<Box<[JsValue]>> {
    crate::exprtk::COMPLETIONS.with(|x| {
        Ok(x.iter()
            .map(<JsValue as JsValueSerdeExt>::from_serde_ext)
            .collect::<Result<Box<[_]>, _>>()?)
    })
}

/// Register this crate's Custom Elements in the browser's current session.
/// This must occur before calling any public API methods on these Custom
/// Elements from JavaScript, as the methods themselves won't be defined yet.
/// By default, this crate does not register `PerspectiveViewerElement` (as to
/// preserve backwards-compatible synchronous API).
#[cfg(not(test))]
#[cfg(not(feature = "define_custom_elements_async"))]
#[wasm_bindgen(js_name = "init")]
pub fn js_init() {
    perspective::utils::set_global_logging();
    define_web_components!("export * as psp from '../../perspective-viewer.js'");
    tracing::info!("Perspective initialized.");
}

/// Register Web Components with the global registry, given a Perspective
/// module.  This function shouldn't be called directly;  instead, use the
/// `define_web_components!` macro to both call this method and hook the
/// wasm_bindgen module object.
pub fn bootstrap_web_components(psp: &JsValue) {
    if cfg!(feature = "define_custom_elements_async") {
        define_web_component::<PerspectiveViewerElement>(psp);
        define_web_component::<PerspectiveDebugPluginElement>(psp);
    }

    define_web_component::<ExportDropDownMenuElement>(psp);
    define_web_component::<CopyDropDownMenuElement>(psp);
}

#[macro_export]
macro_rules! define_web_components {
    ($x:expr) => {{
        #[wasm_bindgen::prelude::wasm_bindgen(inline_js = $x)]
        extern "C" {
            #[wasm_bindgen::prelude::wasm_bindgen(js_name = "psp")]
            pub static PSP: wasm_bindgen::prelude::JsValue;
        }

        $crate::bootstrap_web_components(&PSP);
    }};
}
