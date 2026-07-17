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
use crate::utils::RenderGuard;

/// Mount `plugin` (once) under its layout slot in the viewer's light DOM,
/// restyling it on first mount. Idempotent — a plugin that already has a
/// parent is left untouched (only its `slot` attribute is refreshed).
///
/// # Arguments
/// - `viewer` the root `<perspective-viewer>` element.
/// - `plugin` the plugin custom element.
/// - `slot` the layout slot name (panel id) to mount the plugin under, or
///   `None` to use the default unnamed `<slot>` (legacy single-panel behavior).
pub fn mount_plugin(
    viewer: &HtmlElement,
    plugin: &JsPerspectiveViewerPlugin,
    slot: Option<&str>,
) -> ApiResult<()> {
    let html_plugin = plugin.unchecked_ref::<HtmlElement>();
    if let Some(slot) = slot {
        html_plugin.set_attribute("slot", slot)?;
    }

    if html_plugin.parent_node().is_none() {
        // TODO(texodus): Place at the bottom of the stack so it is rendered
        // but not visible during a tab switch. This is dumb - fix this with
        // a real life cycle.
        viewer.prepend_with_node_1(html_plugin)?;
        plugin.restyle();
    }

    Ok(())
}

/// Given an async `task` which draws `plugin`, [`mount_plugin`] it, then run
/// `task`. Requires the [`RenderGuard`] lock witness — plugin dispatch
/// outside a locked run does not compile (invariants I3/I6 of the merge;
/// see `SESSION_CONFIG_COHERENCE_PLAN.md`).
pub async fn activate_plugin<T>(
    _guard: &RenderGuard,
    viewer: &HtmlElement,
    plugin: &JsPerspectiveViewerPlugin,
    slot: Option<&str>,
    task: impl Future<Output = ApiResult<T>>,
) -> ApiResult<T> {
    mount_plugin(viewer, plugin, slot)?;
    task.await
}

/// Remove the previously-active plugin for a panel from the viewer's light DOM.
///
/// When `slot` is `Some`, only a plugin mounted under that same slot (panel) is
/// removed, so the active plugins of *other* panels are left untouched.
pub fn remove_inactive_plugin(
    viewer: &HtmlElement,
    plugin: &JsPerspectiveViewerPlugin,
    slot: Option<&str>,
    plugins: &[JsPerspectiveViewerPlugin],
) -> ApiResult<()> {
    for idx in 0..viewer.children().length() {
        let elem = viewer.children().item(idx).unwrap();
        if &elem != plugin.unchecked_ref::<Element>()
            && plugins
                .iter()
                .any(|x| *x.unchecked_ref::<Element>() == elem)
            && (slot.is_none() || elem.get_attribute("slot").as_deref() == slot)
        {
            viewer.remove_child(&elem)?;
            break;
        }
    }

    Ok(())
}
