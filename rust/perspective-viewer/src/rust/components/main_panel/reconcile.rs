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
use crate::tasks::resize_callback;

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
    /// Reconcile the `<regular-layout>` grid against `panel_ids`: `insertPanel`
    /// newly-rendered cells (flipping each from `display:none` to a visible
    /// grid cell) and `removePanel` cells whose panels are gone.
    pub(super) fn reconcile(&mut self, ctx: &Context<Self>) {
        let Some(el) = self.layout_ref.cast::<web_sys::HtmlElement>() else {
            return;
        };

        // Attach the close-detection + active-panel-sync listeners once (the
        // `<regular-layout>` element is stable for this MainPanel's lifetime),
        // and configure resize physics — `GRID_DIVIDER_SIZE` is the divider hit
        // tolerance (0 by default → not resizable). The cell-edge band it grabs
        // must be left uncovered: each `.rl-panel` carries a `margin` (viewer.css)
        // so pointerdowns there reach `regular-layout` instead of the frame.
        if !self.listener_attached {
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

            let _ = el.add_event_listener_with_callback(
                "contextmenu",
                self._layout_contextmenu_listener.as_ref().unchecked_ref(),
            );

            if let Ok(physics) = JsValue::from_serde_ext(&LAYOUT_PHYSICS) {
                el.unchecked_ref::<RegularLayout>()
                    .restore_physics(&physics);
            }

            self.listener_attached = true;
        }

        let layout: RegularLayout = el.unchecked_into();
        let panel_ids = &ctx.props().panel_ids;

        // Whole-element restore stages its saved layout tree on the Workspace
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

            // Already placed in the layout tree (the layout is the placement
            // source of truth — e.g. a restored tree naming a panel this
            // component hasn't tracked yet): record it, never re-split it.
            let path = layout.calculate_path(name);
            if !path.is_null() && !path.is_undefined() {
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

            // If this panel's plugin is already drawn (e.g. its cell was
            // re-created while the plugin persisted in the light DOM), redraw it
            // now its cell is visible. A not-yet-loaded panel is skipped — the
            // normal draw path renders into the now-visible cell, and forcing a
            // render before a `Table` is loaded throws "No `Table` attached".
            if let Some(panel) = ctx.props().workspace.panel(id)
                && panel.renderer.is_plugin_activated().unwrap_or(false)
            {
                resize_callback(&panel.session, &panel.renderer).emit(());
            }
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
