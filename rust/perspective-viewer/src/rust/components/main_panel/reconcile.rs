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

//! `MainPanel::rendered` reconcile: attach the layout listeners once, apply a
//! `restore`-staged layout tree, and `insertPanel`/`removePanel` cells
//! against `panel_ids`. Purely STRUCTURAL — it never touches plugin
//! rendering or paint-affecting plugin attributes (those belong to locked
//! draw dispatches; see the note at the end of `reconcile`).

use perspective_js::utils::JsValueSerdeExt;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::MainPanel;
use crate::js::RegularLayout;

/// Layout interaction tuning constants, applied via
/// [`RegularLayout::restore_physics`] when the layout element mounts.
#[derive(serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
struct LayoutPhysics {
    grid_divider_size: f64,
    split_edge_tolerance: f64,
    split_root_edge_tolerance: f64,
}

const LAYOUT_PHYSICS: LayoutPhysics = LayoutPhysics {
    grid_divider_size: 6.0,
    split_edge_tolerance: 0.33,
    split_root_edge_tolerance: 0.1,
};

impl MainPanel {
    /// Size each STAGED panel's hidden wrapper (`.psp-staging` — see
    /// `MainPanel::render` and `PanelPhase::Staging`) to its PREDICTED
    /// post-insert cell: an equal share of the layout box's width (the
    /// reconcile insert splits the root horizontally with equal
    /// redistribution) minus the frame-chrome fallback the presize sweep
    /// uses. Prediction only — the staged first draw renders at these
    /// dimensions, and any delta from the real committed cell is
    /// reconciled by the post-commit reactive resize (free when exact,
    /// via the charts transport's dims-unchanged guard). Imperative
    /// because it MEASURES the committed layout box, which a `view()`
    /// style prop cannot.
    pub(super) fn size_staging_wrappers(&self) {
        let Some(root) = self.main_panel_ref.cast::<web_sys::Element>() else {
            return;
        };

        let Ok(wrappers) = root.query_selector_all(".psp-staging") else {
            return;
        };

        if wrappers.length() == 0 {
            return;
        }

        let Some(layout) = self.layout_ref.cast::<web_sys::HtmlElement>() else {
            return;
        };

        let stage = layout.get_bounding_client_rect();
        let shares = (self.inserted.len() + wrappers.length() as usize).max(1) as f64;
        let (chrome_w, chrome_h) = crate::tasks::CHROME_FALLBACK;
        let width = (stage.width() / shares - chrome_w).max(0.0);
        let height = (stage.height() - chrome_h).max(0.0);
        for i in 0..wrappers.length() {
            if let Some(node) = wrappers.get(i)
                && let Some(el) = node.dyn_ref::<web_sys::HtmlElement>()
            {
                let _ = el.style().set_property("width", &format!("{width}px"));
                let _ = el.style().set_property("height", &format!("{height}px"));
            }
        }
    }

    /// Reconcile the `<regular-layout>` grid against `panel_ids`: `insertPanel`
    /// newly-rendered cells (flipping each from `display:none` to a visible
    /// grid cell) and `removePanel` cells whose panels are gone.
    pub(super) fn reconcile(&mut self, ctx: &Context<Self>) {
        // The `<regular-layout>` element is rendered unconditionally and so is
        // stable for this component's lifetime — zero panels is just another
        // count (empty insert loop; the retain below removes the last cell,
        // collapsing the layout tree to a childless split). Do NOT reset
        // `listener_target`/`inserted` on empty: the listeners stay attached
        // to the persistent element.
        let Some(el) = self.layout_ref.cast::<web_sys::HtmlElement>() else {
            return;
        };

        // Attach the close-detection + active-panel-sync listeners once per
        // ELEMENT (the `<regular-layout>` element is keyed into a fully-keyed
        // sibling list, so Yew reuses one instance for this MainPanel's
        // lifetime), and configure resize physics — `GRID_DIVIDER_SIZE` is the
        // divider hit tolerance (0 by default → not resizable). The cell-edge
        // band it grabs must be left uncovered: each `.rl-panel` carries a
        // `margin` (viewer.css) so pointerdowns there reach `regular-layout`
        // instead of the frame. Comparing the ELEMENT (not a latched bool)
        // self-heals an instance swap: a fresh element boots an EMPTY layout
        // tree with no listeners, so everything must be re-bound and every
        // placed panel re-inserted (see `listener_target`).
        if self.listener_target.as_ref() != Some(&el) {
            if self.listener_target.is_some() {
                self.inserted.clear();
            }

            let _ = el.add_event_listener_with_callback(
                RegularLayout::UPDATE_EVENT,
                self._layout_update_listener.as_ref().unchecked_ref(),
            );

            let _ = el.add_event_listener_with_callback(
                RegularLayout::SELECT_EVENT,
                self._layout_select_listener.as_ref().unchecked_ref(),
            );

            let _ = el.add_event_listener_with_callback(
                RegularLayout::BEFORE_RESIZE_EVENT,
                self._layout_before_resize_listener.as_ref().unchecked_ref(),
            );

            if let Ok(physics) = JsValue::from_serde_ext(&LAYOUT_PHYSICS) {
                el.unchecked_ref::<RegularLayout>()
                    .restore_physics(&physics);
            }

            self.listener_target = Some(el.clone());
        }

        let layout: RegularLayout = el.unchecked_into();
        let panel_ids = &ctx.props().panel_ids;

        // `restoreWorkspace` stages its saved layout tree on the Workspace
        // (the model; regular-layout is a slave view). Apply it here, BEFORE
        // the insert reconcile, and seed `inserted` from its panel names — so
        // restored panels mount directly at their saved positions in ONE
        // layout commit, never transiting the synthetic equal-split inserts
        // below.
        if let Some(tree) = ctx.props().workspace.take_pending_layout()
            && let Ok(js) = JsValue::from_serde_ext(&tree)
        {
            layout.restore_sync(&js);
            for name in tree.slot_names() {
                if !self.inserted.contains(&name) {
                    self.inserted.push(name);
                }
            }
        }

        // Insert cells that are newly present.
        for id in panel_ids {
            let name = id.as_str();
            if self.inserted.iter().any(|n| n == name) {
                continue;
            }

            // STAGED panels are withheld from the layout: their first draw
            // is completing in the hidden staging wrapper (see
            // `PanelPhase::Staging`). The promote re-render flips the phase,
            // and this loop then inserts the already-drawn panel.
            if ctx.props().workspace.is_staged(id) {
                continue;
            }

            // Already placed in the layout tree (the layout is the placement
            // source of truth — e.g. a restored tree naming a panel this
            // component hasn't tracked yet): record it, never re-split it.
            if layout.contains_panel(name) {
                self.inserted.push(name.to_owned());
                continue;
            }

            // Insert at this panel's index as a split (orientation = `true` →
            // horizontal) rather than the default (path `[]`), which would
            // *stack* into the root tab-layout — a stack only renders its
            // selected tab, and without frame chrome there's no tab-bar to
            // reach the others. Splitting keeps every panel visible side-by-side.
            let index = self.inserted.len();
            let path = JsValue::from(js_sys::Array::of1(&JsValue::from_f64(index as f64)));
            let _ = layout.insert_panel(name, path, JsValue::from_bool(true));
            self.inserted.push(name.to_owned());
        }

        // Remove cells whose panels are gone.
        self.inserted.retain(|name| {
            if panel_ids.iter().any(|id| id.as_str() == name) {
                true
            } else {
                let _ = layout.remove_panel(name);
                false
            }
        });

        // A removed panel can't stay "maximized" (regular-layout drops the
        // maximize stylesheet when its panel leaves the layout).
        if let Some(m) = &self.maximized
            && !panel_ids.iter().any(|id| id.as_str() == m.as_str())
        {
            self.maximized = None;
        }

        // NOTE: neither the plugin `theme` attribute nor the `active` class
        // is managed here. This pass is an async render — mutating
        // paint-affecting plugin state from it splits the change and the
        // plugin DOM it styles across two paints (the datagrid's "wrong-row
        // EDIT" artifact), and inferring "needs restyle" from DOM state here
        // raced in-flight locked runs (it once captured a pre-rebuild `View`
        // and restyled it after its deletion). Both stamps are applied by
        // `Renderer::stamp_active`/`stamp_theme` INSIDE locked plugin
        // dispatches, atomic with the draw ("stamp before draw"); theme
        // CHANGES are restyled by their mutation sites (the theme-picker
        // task, `restorePanel`, `resetThemes`, and the root's default-theme
        // fan-out in `snapshots.rs::on_update_presentation`).
    }
}
