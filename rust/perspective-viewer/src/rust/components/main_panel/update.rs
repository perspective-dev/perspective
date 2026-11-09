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

use std::rc::Rc;

use perspective_js::utils::{ApiFuture, JsValueSerdeExt};
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::{MainPanel, MainPanelMsg, MenuOrigin, MenuRequest};
use crate::components::panel_menu::PanelCommand;
use crate::js::{Layout, RegularLayout};
use crate::queries::{
    CommandLocation, CommandSource, ResolvedCommands, has_command_schema, resolve_commands,
};
use crate::renderer::SUBPIXEL_EPSILON;
use crate::tasks::resize_callback;
use crate::utils::PtrEqRc;
use crate::workspace::PanelId;

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

    /// Report closed every panel this commit dropped from the layout, and
    /// re-render so its frame leaves the DOM in the commit's paint.
    pub(super) fn on_layout_updated(&mut self, ctx: &Context<Self>) -> bool {
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
        let on_screen = &mut self.on_screen;
        self.inserted.retain(|id| {
            if layout.contains_panel(id) {
                on_screen.insert(id.clone());
                true
            } else if on_screen.remove(id)
                || !ctx.props().panel_ids.iter().any(|p| p.as_str() == id)
            {
                closed.push(id.clone());
                false
            } else {
                true
            }
        });

        let closed_any = !closed.is_empty();
        for id in closed {
            self.pending_removals.remove(&id);
            ctx.props().on_panel_closed.emit(id);
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
            if !layout.contains_panel(id.as_str()) {
                continue;
            }

            if let Some(panel) = ctx.props().workspace.panel(id)
                && panel.renderer.is_plugin_activated().unwrap_or(false)
            {
                if let Some((w, h)) = panel.renderer.take_presized_box()
                    && let Some(plugin) = panel.renderer.active_plugin()
                {
                    let rect = plugin
                        .unchecked_ref::<web_sys::Element>()
                        .get_bounding_client_rect();
                    if (rect.width() - w).abs() <= SUBPIXEL_EPSILON
                        && (rect.height() - h).abs() <= SUBPIXEL_EPSILON
                    {
                        continue;
                    }
                }

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
            closed_any
        }
    }

    pub(super) fn on_tab_selected(&self, ctx: &Context<Self>, name: String) -> bool {
        ctx.props().on_activate_panel.emit(name);
        false
    }

    pub(super) fn on_context_menu(
        &mut self,
        ctx: &Context<Self>,
        id: Option<String>,
        x: f64,
        y: f64,
        origin: MenuOrigin,
    ) -> bool {
        // A frame-less right-click (status bar, sidebars) targets the
        // ACTIVE panel, validated against the workspace so a stale slot
        // name after an eject falls back to the target-less stage menu.
        let id = id.or_else(|| {
            ctx.props().renderer.slot_name().filter(|name| {
                ctx.props()
                    .workspace
                    .panel(&PanelId::from(name.as_str()))
                    .is_some()
            })
        });

        // Make the right-clicked panel active so active-targeting
        // commands (e.g. Reset) act on it; then show the menu.
        if let Some(id) = &id {
            ctx.props().on_activate_panel.emit(id.clone());
        }

        let panel = id
            .as_deref()
            .and_then(|id| ctx.props().workspace.panel(&PanelId::from(id)));

        if !has_command_schema(&ctx.props().presentation, panel.as_ref()) {
            self.pending_menu = None;
            self.context_menu_commands = PtrEqRc::default();
            self.context_menu = Some((x, y, id));
            return true;
        }

        let request = Rc::new(MenuRequest { x, y, panel: id });
        self.pending_menu = Some(request.clone());
        let presentation = ctx.props().presentation.clone();
        let link = ctx.link().clone();
        ApiFuture::spawn(async move {
            let commands = resolve_commands(
                &presentation,
                panel.as_ref(),
                CommandLocation::ContextMenu,
                (x, y),
                origin == MenuOrigin::Body,
            )
            .await;

            link.send_message(MainPanelMsg::ContextMenuResolved(request, commands));
            Ok(())
        });

        false
    }

    /// Open the context menu for `request` unless a later gesture superseded
    /// it or its panel has since closed.
    pub(super) fn on_context_menu_resolved(
        &mut self,
        ctx: &Context<Self>,
        request: Rc<MenuRequest>,
        commands: ResolvedCommands,
    ) -> bool {
        let is_pending = self
            .pending_menu
            .as_ref()
            .is_some_and(|pending| Rc::ptr_eq(pending, &request));

        if !is_pending {
            return false;
        }

        self.pending_menu = None;
        let is_closed = request
            .panel
            .as_deref()
            .is_some_and(|id| ctx.props().workspace.panel(&PanelId::from(id)).is_none());

        if is_closed {
            return false;
        }

        self.context_menu_commands = PtrEqRc::new(commands);
        self.context_menu = Some((request.x, request.y, request.panel.clone()));
        true
    }

    pub(super) fn on_close_context_menu(&mut self) -> bool {
        self.context_menu = None;
        true
    }

    /// Deliver a picked custom command to the party that declared it.
    pub(super) fn on_custom_command(
        &mut self,
        ctx: &Context<Self>,
        source: CommandSource,
        key: String,
    ) -> bool {
        let Some((_, _, target)) = self.context_menu.clone() else {
            return false;
        };

        let context = self.context_menu_commands.context.clone();
        match source {
            CommandSource::App => ctx
                .props()
                .presentation
                .command_invoked
                .emit((key, context)),
            CommandSource::Plugin => {
                let plugin = target
                    .and_then(|id| ctx.props().workspace.panel(&PanelId::from(id.as_str())))
                    .and_then(|panel| panel.renderer.active_plugin());

                if let Some(plugin) = plugin {
                    ApiFuture::spawn(async move { plugin.execute_command(key, context).await });
                }
            },
        }

        false
    }

    pub(super) fn on_command(&mut self, ctx: &Context<Self>, cmd: PanelCommand) -> bool {
        let Some((_, _, target)) = self.context_menu.clone() else {
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
                if let Some(id) = target
                    && let Some(el) = self.layout_ref.cast::<web_sys::HtmlElement>()
                {
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
            cmd => ctx
                .props()
                .on_panel_command
                .emit((target.unwrap_or_default(), cmd)),
        }

        false
    }
}
