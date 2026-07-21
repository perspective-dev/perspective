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

//! A `wasm-bindgen` binding to the `<regular-layout>` custom element from
//! [`regular-layout`](https://github.com/texodus/regular-layout), used as the
//! layout engine for `<perspective-viewer>`'s panels.

use js_sys::Promise;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    /// The `<regular-layout>` custom element.
    #[wasm_bindgen(extends = web_sys::HtmlElement)]
    pub type RegularLayout;

    /// Place the child named `name` into the grid, optionally at `path`
    /// (a `number[]`; pass [`JsValue::UNDEFINED`] to append) and optionally
    /// forcing a `split` (`bool` or an `Orientation` string).
    #[wasm_bindgen(method, js_name = "insertPanel")]
    pub fn insert_panel(this: &RegularLayout, name: &str, path: JsValue, split: JsValue)
    -> Promise;

    /// Remove the panel named `name` from the grid (its DOM child stays
    /// connected, but unslotted).
    #[wasm_bindgen(method, js_name = "removePanel")]
    pub fn remove_panel(this: &RegularLayout, name: &str) -> Promise;

    /// Unslot all panels.
    #[wasm_bindgen(method)]
    pub fn clear(this: &RegularLayout) -> Promise;

    /// Return the `number[]` index path for the panel named `name`, or `null`.
    #[wasm_bindgen(method, js_name = "calculatePath")]
    pub fn calculate_path(this: &RegularLayout, name: &str) -> JsValue;

    /// Hit-test for the [`LayoutPath`](https://github.com/texodus/regular-layout)
    /// under a pointer (`{clientX, clientY}`), or `null`.
    #[wasm_bindgen(method, js_name = "calculateIntersect")]
    pub fn calculate_intersect(this: &RegularLayout, coordinates: &JsValue) -> JsValue;

    /// Show the drag-preview overlay for `target` at the pointer `coordinates`.
    #[wasm_bindgen(method, js_name = "setOverlayState")]
    pub fn set_overlay_state(
        this: &RegularLayout,
        coordinates: &JsValue,
        target: &JsValue,
    ) -> Promise;

    /// Clear the drag-preview overlay and commit the placement for `target`.
    #[wasm_bindgen(method, js_name = "clearOverlayState")]
    pub fn clear_overlay_state(
        this: &RegularLayout,
        coordinates: &JsValue,
        target: &JsValue,
    ) -> Promise;

    /// Euclidean pixel distance between `coordinates` and a drag `target`.
    #[wasm_bindgen(method, js_name = "diffCoordinates")]
    pub fn diff_coordinates(this: &RegularLayout, coordinates: &JsValue, target: &JsValue) -> f64;

    /// Convert a `ViewWindow` (normalized 0–1) to a `DOMRect` in screen pixels.
    #[wasm_bindgen(method, js_name = "realCoordinates")]
    pub fn real_coordinates(this: &RegularLayout, window: &JsValue) -> JsValue;

    /// Configure resize physics (edge tolerances, divider size).
    #[wasm_bindgen(method, js_name = "restorePhysics")]
    pub fn restore_physics(this: &RegularLayout, physics: &JsValue);

    /// Read the current resize physics.
    #[wasm_bindgen(method, js_name = "savePhysics")]
    pub fn save_physics(this: &RegularLayout) -> JsValue;

    /// Resume a resize previously deferred via `preventDefault()` in the
    /// `regular-layout-before-resize` handler.
    #[wasm_bindgen(method, js_name = "resumeResize")]
    pub fn resume_resize(this: &RegularLayout);

    /// Serialize the current [`Layout`] tree.
    #[wasm_bindgen(method)]
    pub fn save(this: &RegularLayout) -> JsValue;

    /// Restore a [`Layout`] tree, dispatching a cancelable
    /// `regular-layout-before-resize` event first.
    #[wasm_bindgen(method)]
    pub fn restore(this: &RegularLayout, layout: &JsValue) -> Promise;

    /// Restore a [`Layout`] tree synchronously, without the resize event.
    #[wasm_bindgen(method, js_name = "restoreSync")]
    pub fn restore_sync(this: &RegularLayout, layout: &JsValue);

    /// Select the panel `name`, making it the front-most tab within its
    /// containing stack; dispatches a `regular-layout-select` event
    /// (`detail: { name }`). Fires even when re-selecting the active tab.
    #[wasm_bindgen(method)]
    pub fn select(this: &RegularLayout, name: &str) -> Promise;

    /// Maximize the panel `name` (full-size, others hidden). Transient — not
    /// persisted by [`Self::save`]; a subsequent [`Self::restore`] resets it.
    #[wasm_bindgen(method)]
    pub fn maximize(this: &RegularLayout, name: &str);

    /// Restore the normal multi-panel view after [`Self::maximize`].
    #[wasm_bindgen(method)]
    pub fn minimize(this: &RegularLayout);

    /// The `detail` of a [`Self::BEFORE_RESIZE_EVENT`] event.
    pub type PresizeDetail;

    /// Each panel's pending-resize target as a `Record<name, LayoutPath>`; each
    /// `LayoutPath` carries a normalized `view_window` that
    /// [`Self::real_coordinates`] converts to a pixel box. Used to pre-size
    /// panel contents before the layout commits.
    #[wasm_bindgen(method, js_name = "calculatePresizePaths")]
    pub fn calculate_presize_paths(this: &PresizeDetail) -> JsValue;

    /// For a drag transition, the dragged panel's `{slot, path}` — its name
    /// and the `LayoutPath` of its preview box (`path.view_window` is exactly
    /// where the overlay renders it). The dragged panel is removed from the
    /// layout tree during a drag, so it is absent from
    /// [`Self::calculate_presize_paths`]; this getter lets consumers pre-size
    /// it like any other panel (regular-layout >= 0.6.1). `null` when the
    /// pointer is outside every drop target (the dragged panel is hidden),
    /// `undefined` for non-drag transitions.
    #[wasm_bindgen(method, getter)]
    pub fn overlay(this: &PresizeDetail) -> JsValue;
}

impl RegularLayout {
    /// Emitted before the layout resizes its panels, so consumers can pre-size
    /// panel contents (`CustomEvent<PresizeDetail>`); cancelable.
    pub const BEFORE_RESIZE_EVENT: &'static str = "regular-layout-before-resize";
    /// Emitted before the layout tree changes (`CustomEvent<Layout>`).
    pub const BEFORE_UPDATE_EVENT: &'static str = "regular-layout-before-update";
    /// The `<regular-layout-frame>` chrome element tag name (titlebar + tabs).
    pub const FRAME_TAG_NAME: &'static str = "regular-layout-frame";
    /// Emitted when a tab is selected (`CustomEvent<{ name: string }>`). Fires
    /// on every tab interaction — including re-selecting the active tab or
    /// selecting the sole tab of a single-element stack — so consumers can
    /// always map a tab interaction to an "active panel".
    pub const SELECT_EVENT: &'static str = "regular-layout-select";
    /// The custom element tag name.
    pub const TAG_NAME: &'static str = "regular-layout";
    /// Emitted after the layout tree changes (`CustomEvent<Layout>`).
    pub const UPDATE_EVENT: &'static str = "regular-layout-update";
}

/// The orientation of a [`SplitLayout`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Horizontal,
    Vertical,
}

/// A serde mirror of `regular-layout`'s serialized layout tree, as returned by
/// [`RegularLayout::save`] and accepted by [`RegularLayout::restore`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(tag = "type")]
pub enum Layout {
    /// Space divided among children, side-by-side or stacked.
    #[serde(rename = "split-layout")]
    Split(SplitLayout),

    /// A leaf node holding one or more named tabs (a stack).
    #[serde(rename = "tab-layout")]
    Tab(TabLayout),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
pub struct SplitLayout {
    pub children: Vec<Layout>,
    pub sizes: Vec<f64>,
    pub orientation: Orientation,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
pub struct TabLayout {
    /// Panel ids (slot names) in this stack.
    pub tabs: Vec<String>,

    /// Index of the selected tab within `tabs`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub selected: Option<usize>,
}

impl Layout {
    /// Collect every panel id (slot name) in the tree, depth-first.
    pub fn slot_names(&self) -> Vec<String> {
        match self {
            Layout::Split(split) => split.children.iter().flat_map(Layout::slot_names).collect(),
            Layout::Tab(tab) => tab.tabs.clone(),
        }
    }

    /// Collect every panel id that is *hidden* — i.e. in a stack (tab-layout)
    /// at an index other than its `selected` one — in depth-first order. The
    /// complement of the visible set: every other panel is the front of its
    /// stack (single-tab leaves are trivially visible).
    pub fn hidden_slot_names(&self) -> Vec<String> {
        match self {
            Layout::Split(split) => split
                .children
                .iter()
                .flat_map(Layout::hidden_slot_names)
                .collect(),
            Layout::Tab(tab) => {
                let selected = tab.selected.unwrap_or(0);
                tab.tabs
                    .iter()
                    .enumerate()
                    .filter(|(idx, _)| *idx != selected)
                    .map(|(_, name)| name.clone())
                    .collect()
            },
        }
    }

    /// Rewrite every panel id through `f`, returning the remapped tree. Ids for
    /// which `f` returns `None` are left unchanged. Used by whole-element
    /// `restore`, which recreates panels under fresh (collision-free) ids and
    /// must point the saved layout tree at them.
    pub fn remap(&self, f: &impl Fn(&str) -> Option<String>) -> Layout {
        match self {
            Layout::Split(split) => Layout::Split(SplitLayout {
                children: split.children.iter().map(|c| c.remap(f)).collect(),
                sizes: split.sizes.clone(),
                orientation: split.orientation,
            }),
            Layout::Tab(tab) => Layout::Tab(TabLayout {
                tabs: tab
                    .tabs
                    .iter()
                    .map(|name| f(name).unwrap_or_else(|| name.clone()))
                    .collect(),
                selected: tab.selected,
            }),
        }
    }
}
