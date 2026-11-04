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

    /// Whether `name` is currently placed in this layout's tree (a non-null
    /// [`Self::calculate_path`]).
    pub fn contains_panel(&self, name: &str) -> bool {
        let path = self.calculate_path(name);
        !path.is_null() && !path.is_undefined()
    }
}

/// The direction a [`SplitLayout`] divides its space in: `horizontal` places
/// children side by side as columns, `vertical` stacks them as rows.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Horizontal,
    Vertical,
}

/// A dashboard's panel arrangement: nested splits whose leaves are tab stacks
/// of panel ids, naming every panel exactly once.
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

/// A row or column of child layouts, nested to form a grid.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
pub struct SplitLayout {
    /// Child layouts, in left-to-right or top-to-bottom order.
    pub children: Vec<Layout>,

    /// Each child's fraction of the split, one per child, summing to 1.
    pub sizes: Vec<f64>,

    /// Whether children sit side by side (`horizontal`) or stacked
    /// (`vertical`).
    pub orientation: Orientation,
}

/// A stack of panels shown as tabs, one visible at a time.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
pub struct TabLayout {
    /// Panel ids (slot names) in this stack.
    pub tabs: Vec<String>,

    /// Index of the selected tab within `tabs`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub selected: Option<usize>,
}

/// A normalized `[0, 1]` rectangle of the layout box (regular-layout's
/// `ViewWindow`).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct ViewWindow {
    pub row_start: f64,
    pub row_end: f64,
    pub col_start: f64,
    pub col_end: f64,
}

impl Layout {
    /// Mirror of regular-layout's `insert_child(tree, name, [index],
    /// orientation)`, the single-index split insert `MainPanel::reconcile`
    /// issues.
    pub fn insert_split(&self, index: usize, name: &str, orientation: Orientation) -> Layout {
        let leaf = Layout::Tab(TabLayout {
            tabs: vec![name.to_owned()],
            selected: None,
        });

        match self {
            Layout::Split(split) if split.orientation == orientation => {
                let index = index.min(split.children.len());
                let mut children = split.children.clone();
                let mut sizes = split.sizes.clone();
                children.insert(index, leaf);
                sizes.insert(index, 1.0 / (children.len() - 1).max(1) as f64);
                let total: f64 = sizes.iter().sum();
                let sizes = if total.is_finite() && total > 0.0 {
                    sizes.iter().map(|size| size / total).collect()
                } else {
                    vec![1.0 / children.len() as f64; children.len()]
                };

                Layout::Split(SplitLayout {
                    children,
                    sizes,
                    orientation,
                })
            },
            _ => Layout::Split(SplitLayout {
                children: if index == 0 {
                    vec![leaf, self.clone()]
                } else {
                    vec![self.clone(), leaf]
                },
                sizes: vec![0.5, 0.5],
                orientation,
            }),
        }
    }

    /// The normalized box the visible panel `name` occupies (mirror of
    /// regular-layout's `calculate_presize_paths`).
    pub fn view_window(&self, name: &str) -> Option<ViewWindow> {
        self.view_window_in(name, ViewWindow {
            row_start: 0.0,
            row_end: 1.0,
            col_start: 0.0,
            col_end: 1.0,
        })
    }

    fn view_window_in(&self, name: &str, window: ViewWindow) -> Option<ViewWindow> {
        match self {
            Layout::Tab(tab) => {
                let selected = tab.tabs.get(tab.selected.unwrap_or(0));
                (selected.map(String::as_str) == Some(name)).then_some(window)
            },
            Layout::Split(split) => {
                let vertical = split.orientation == Orientation::Vertical;
                let (start, end) = if vertical {
                    (window.row_start, window.row_end)
                } else {
                    (window.col_start, window.col_end)
                };

                let mut pos = start;
                for (child, size) in split.children.iter().zip(&split.sizes) {
                    let next = pos + (end - start) * size;
                    let child_window = if vertical {
                        ViewWindow {
                            row_start: pos,
                            row_end: next,
                            ..window
                        }
                    } else {
                        ViewWindow {
                            col_start: pos,
                            col_end: next,
                            ..window
                        }
                    };

                    if let Some(found) = child.view_window_in(name, child_window) {
                        return Some(found);
                    }

                    pos = next;
                }

                None
            },
        }
    }

    /// Check that this tree is well-formed and names each of `ids` at most
    /// once, returning the `ids` it leaves unplaced.
    pub fn validate(&self, ids: &[String]) -> Result<Vec<String>, String> {
        let mut seen = Vec::new();
        self.validate_node("layout", ids, &mut seen)?;
        Ok(ids
            .iter()
            .filter(|id| !seen.contains(id))
            .cloned()
            .collect())
    }

    fn validate_node(
        &self,
        path: &str,
        ids: &[String],
        seen: &mut Vec<String>,
    ) -> Result<(), String> {
        match self {
            Layout::Split(split) => {
                if split.sizes.len() != split.children.len() {
                    return Err(format!(
                        "Invalid layout: {path}.sizes has {} entries for {} children",
                        split.sizes.len(),
                        split.children.len()
                    ));
                }

                if let Some(size) = split.sizes.iter().find(|x| !x.is_finite() || **x < 0.0) {
                    return Err(format!("Invalid layout: {path}.sizes contains {size}"));
                }

                if !split.sizes.is_empty() && split.sizes.iter().sum::<f64>() <= 0.0 {
                    return Err(format!("Invalid layout: {path}.sizes sum to zero"));
                }

                for (index, child) in split.children.iter().enumerate() {
                    child.validate_node(&format!("{path}.children[{index}]"), ids, seen)?;
                }

                Ok(())
            },
            Layout::Tab(tab) => {
                for name in &tab.tabs {
                    if !ids.contains(name) {
                        return Err(format!(
                            "Invalid layout: {path}.tabs names unknown panel \"{name}\" (panels: \
                             {ids:?})"
                        ));
                    }

                    if seen.contains(name) {
                        return Err(format!(
                            "Invalid layout: panel \"{name}\" appears more than once"
                        ));
                    }

                    seen.push(name.clone());
                }

                Ok(())
            },
        }
    }

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
    /// which `f` returns `None` are left unchanged. Used by `restoreWorkspace`,
    /// which recreates panels under fresh (collision-free) ids and must point
    /// the saved layout tree at them.
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
