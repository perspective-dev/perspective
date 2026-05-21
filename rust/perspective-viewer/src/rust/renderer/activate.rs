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

use perspective_js::utils::ApiResult;
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
        plugin.restyle();
    }

    let result = task.await;
    html_plugin.style().set_property("opacity", "1")?;
    result
}

pub fn remove_inactive_plugin(
    viewer: &HtmlElement,
    plugin: &JsPerspectiveViewerPlugin,
    plugins: &[JsPerspectiveViewerPlugin],
) -> ApiResult<()> {
    for idx in 0..viewer.children().length() {
        let elem = viewer.children().item(idx).unwrap();
        if &elem != plugin.unchecked_ref::<Element>()
            && plugins
                .iter()
                .any(|x| *x.unchecked_ref::<Element>() == elem)
        {
            viewer.remove_child(&elem)?;
            break;
        }
    }

    Ok(())
}
