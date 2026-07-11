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

//! The small `MainPanelMsg` handlers dispatched from `MainPanel::update` —
//! pointer forwarding, layout-close detection, tab/active sync, and the panel
//! context menu. The heavier `BeforeResize` presize lives in
//! [`super::presize`].

use perspective_js::utils::JsValueSerdeExt;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::MainPanel;
use crate::components::panel_menu::PanelCommand;
use crate::js::{Layout, RegularLayout};
use crate::tasks::resize_callback;

impl MainPanel {
    pub(super) fn on_pointer_event(
        &self,
        ctx: &Context<Self>,
        event: web_sys::PointerEvent,
    ) -> bool {
        if event.target().map(JsValue::from)
            == self
                .main_panel_ref
                .cast::<web_sys::HtmlElement>()
                .map(JsValue::from)
        {
            ctx.props().presentation.statusbar_pointer_event.emit(event);
        }

        false
    }

    pub(super) fn on_layout_updated(&mut self, ctx: &Context<Self>) -> bool {
        // A panel still tracked in `inserted` but no longer present in
        // the layout (calculatePath → null) was removed by the layout —
        // i.e. its frame's close button was pressed. Report it for
        // disposal.
        let Some(el) = self.layout_ref.cast::<web_sys::HtmlElement>() else {
            return false;
        };

        // A `regular-layout-update` ends any in-flight drag (it fires on
        // the drop, not during the drag). Drop the drag ResizeObserver(s)
        // bound in `BeforeResize`; the post-commit `resize_callback` loop
        // below resizes the dropped panel to its final cell.
        self.panel_resize_observers.clear();

        let layout: RegularLayout = el.unchecked_into();
        let mut closed = Vec::new();
        self.inserted.retain(|id| {
            let path = layout.calculate_path(id);
            if path.is_null() || path.is_undefined() {
                closed.push(id.clone());
                false
            } else {
                true
            }
        });

        for id in closed {
            ctx.props().on_close_panel.emit(id);
        }

        // A layout change (divider drag, insert, restore) reflows the
        // grid cells without resizing the host, so the host
        // `ResizeObserver` never fires. Resize every activated panel's
        // plugin to match its new cell size — same per-panel
        // `resize_callback` the insert path uses (idempotent, and each
        // `Renderer` debounces its own resize).
        for id in ctx.props().panel_ids.iter() {
            // Skip any panel regular-layout reports as absent — it's
            // leaving the layout (a close / drag-out in flight). Spawning
            // a resize draw for it would race its disposal, and spawned
            // tasks can't be cancelled. App-initiated closes already drop
            // the panel from `panel_ids` before this fires; this also
            // covers a layout-originated removal.
            let path = layout.calculate_path(id.as_str());
            if path.is_null() || path.is_undefined() {
                continue;
            }

            if let Some(panel) = ctx.props().workspace.panel(id)
                && panel.renderer.is_plugin_activated().unwrap_or(false)
            {
                resize_callback(&panel.session, &panel.renderer).emit(());
            }
        }

        // Recompute which panels are hidden behind an unselected stack
        // index. Selection changes route through `restore` and so also
        // fire `regular-layout-update` — this is the single point of
        // truth for tab visibility. Re-render only when it changed, so
        // each `PanelTab` re-syncs its `visible` class.
        let hidden = layout
            .save()
            .into_serde_ext::<Layout>()
            .map(|tree| tree.hidden_slot_names().into_iter().collect())
            .unwrap_or_default();

        if hidden != self.hidden_tabs {
            self.hidden_tabs = hidden;
            true
        } else {
            false
        }
    }

    pub(super) fn on_tab_selected(&self, ctx: &Context<Self>, name: String) -> bool {
        ctx.props().on_activate_panel.emit(name);
        false
    }

    pub(super) fn on_context_menu(
        &mut self,
        ctx: &Context<Self>,
        id: String,
        x: f64,
        y: f64,
    ) -> bool {
        // Make the right-clicked panel active so active-targeting
        // commands (e.g. Reset) act on it; then show the menu.
        ctx.props().on_activate_panel.emit(id.clone());
        self.context_menu = Some((x, y, id));
        true
    }

    pub(super) fn on_close_context_menu(&mut self) -> bool {
        self.context_menu = None;
        true
    }

    pub(super) fn on_command(&mut self, ctx: &Context<Self>, cmd: PanelCommand) -> bool {
        let Some((_, _, id)) = self.context_menu.clone() else {
            return false;
        };

        match cmd {
            // Maximize/Restore act on the layout element this
            // component owns. As of regular-layout 0.6.1 both route
            // through the presize queue (cancelable `before-resize`
            // with the post-transition paths), so the shared
            // `BeforeResize` gate presizes the now-visible plugin(s)
            // — no reactive post-commit resize sweep needed.
            PanelCommand::Maximize => {
                if let Some(el) = self.layout_ref.cast::<web_sys::HtmlElement>() {
                    el.unchecked_ref::<RegularLayout>().maximize(&id);
                    self.maximized = Some(id);
                }
            },
            PanelCommand::Restore => {
                if let Some(el) = self.layout_ref.cast::<web_sys::HtmlElement>() {
                    el.unchecked_ref::<RegularLayout>().minimize();
                }

                self.maximized = None;
            },
            cmd => ctx.props().on_panel_command.emit((id, cmd)),
        }

        false
    }
}
