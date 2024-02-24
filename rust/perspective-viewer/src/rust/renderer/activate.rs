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

use std::future::Future;

use perspective::utils::ApiResult;
use wasm_bindgen::JsCast;
use web_sys::*;

use crate::js::plugin::JsPerspectiveViewerPlugin;

/// Given an async `task` which draws `plugin`, activates the plugin in stages
/// to prevent screen shearing.  First, and plugin is appended ot the DOM with
/// opacity 0, then rendered.  After rendering, the previous plugin is removed
/// and the opacity is set back to 1.
///
/// # Arguments
/// - `viewer` the root `<perspective-viewer>` element.
/// - `plugin` the plugin custom element.
/// - `task` an async task which renders the plugin.
pub async fn activate_plugin<T>(
    viewer: &HtmlElement,
    plugin: &JsPerspectiveViewerPlugin,
    task: impl Future<Output = ApiResult<T>>,
) -> ApiResult<T> {
    let html_plugin = plugin.unchecked_ref::<HtmlElement>();
    if html_plugin.parent_node().is_none() {
        html_plugin.style().set_property("opacity", "0")?;
        viewer.append_child(html_plugin)?;
    }

    let result = task.await;
    let first_child = viewer.children().item(0).unwrap();
    if first_child != *plugin.unchecked_ref::<Element>() {
        viewer.remove_child(&first_child)?;
    }

    html_plugin.style().set_property("opacity", "1")?;
    result
}
