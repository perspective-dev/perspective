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

//! The root `<perspective-viewer>` Yew component: state, lifecycle, and the
//! message dispatch table. Handler bodies live in the domain modules —
//! [`panels`] (workspace panel lifecycle + active targeting), [`settings`]
//! (settings sidebar + divider presize pump), [`filters`] (master/detail
//! cross-filter), [`snapshots`] (value-semantic props plumbing) — with engine
//! wiring in [`wiring`] and `view()` in [`render`]. (The panel context menu +
//! pickers + maximize live in `MainPanel`/`PanelMenu`, which own the layout
//! element.)

mod filters;
mod msg;
mod panels;
mod render;
mod settings;
mod snapshots;
mod wiring;

use std::rc::Rc;

use futures::channel::oneshot::Sender;
use perspective_client::config::Filter;
use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

pub use self::msg::PerspectiveViewerMsg;
use self::msg::PerspectiveViewerMsg::*;
use self::settings::SettingsGeometry;
use self::wiring::*;
use super::font_loader::{FontLoaderProps, FontLoaderStatus};
use crate::presentation::{Presentation, PresentationProps};
use crate::renderer::{RendererProps, *};
use crate::session::{SessionProps, *};
use crate::tasks::*;
use crate::utils::*;
use crate::workspace::Workspace;

#[derive(Clone, Properties)]
pub struct PerspectiveViewerProps {
    /// The light DOM element this component will render to.
    pub elem: web_sys::HtmlElement,

    /// State
    pub presentation: Presentation,

    /// The multi-panel model — the source of truth for engine state. The
    /// component derives the active panel's `Session`/`Renderer` via
    /// `workspace.active_*()` (see `create`), and renders a cell per panel.
    pub workspace: Workspace,
}

impl PartialEq for PerspectiveViewerProps {
    fn eq(&self, _rhs: &Self) -> bool {
        false
    }
}

pub struct PerspectiveViewer {
    _subscriptions: Vec<Subscription>,

    /// Per-active-panel subscriptions; dropped + recreated on `SetActivePanel`.
    _active_subscriptions: Vec<Subscription>,

    /// One `title_changed` subscription per panel (all panels, not just
    /// active), so a title change on any panel re-renders the tab titles.
    /// Recreated when the panel set changes (`LayoutChanged`/`ClosePanel`).
    _title_subscriptions: Vec<Subscription>,

    /// The active panel's engine handles — what the settings panel + status bar
    /// bind to. Re-targeted on `SetActivePanel`.
    active_session: Session,
    active_renderer: Renderer,
    debug_open: bool,
    fonts: FontLoaderProps,
    on_close_column_settings: Callback<()>,
    on_rendered: Vec<Sender<()>>,
    on_resize: Rc<PubSub<()>>,
    on_settings_panel_dimensions_reset: Rc<PubSub<()>>,
    settings_open: bool,

    /// Render snapshot of the `Workspace`-owned global filter set (see
    /// `Workspace::global_filters`); refreshed by `UpdateGlobalFilters` via
    /// the `filters_changed` subscription. The status-bar chips render from
    /// this when non-empty.
    global_filters: Vec<Filter>,

    /// The settings sidebar's geometry state (pane/drawer width overrides,
    /// divider presize pump, open-state deltas cache) — see
    /// [`settings::SettingsGeometry`].
    settings_geometry: SettingsGeometry,

    /// Value-semantic state snapshots (Step 4 scaffold).
    /// Populated by `UpdateSession` / `UpdateRenderer` / `UpdatePresentation` /
    /// `UpdateDragDrop` messages dispatched from async engine tasks.
    session_props: SessionProps,
    renderer_props: RendererProps,
    presentation_props: PresentationProps,
    dragdrop_props: crate::presentation::DragDropProps,

    /// The active panel's in-flight config-run count — a LEVEL-triggered
    /// snapshot of `Session::in_flight_config_runs` (RAII-settled;
    /// assigned by `UpdateInFlight`, re-read on retarget). Threaded to
    /// `StatusIndicator` as the "updating" spinner.
    update_count: u32,

    /// Window listeners that toggle the `.shift-active` class on the host
    /// element while the Shift key is held, making Shift-modified affordances
    /// (e.g. inactive column add, active column remove, status-bar reset)
    /// visually discoverable. Stored so the closures outlive `create`.
    _shift_listeners: ShiftListeners,

    /// `perspective-global-filter` + `perspective-click` listeners on the host
    /// (master/detail). Both route a master panel's selection state to
    /// `MasterContribution`. Kept alive here, attached once in `rendered`.
    _global_filter_listener: Closure<dyn FnMut(web_sys::Event)>,
    _master_click_listener: Closure<dyn FnMut(web_sys::Event)>,
    master_listeners_attached: bool,
}

impl Component for PerspectiveViewer {
    type Message = PerspectiveViewerMsg;
    type Properties = PerspectiveViewerProps;

    fn create(ctx: &Context<Self>) -> Self {
        let elem = ctx.props().elem.clone();
        let fonts = FontLoaderProps::new(&elem, ctx.link().callback(|()| PreloadFontsUpdate));
        let active_session = ctx.props().workspace.active_session();
        let active_renderer = ctx.props().workspace.active_renderer();
        inject_shared_callbacks(ctx);
        inject_active_callbacks(ctx, &active_session, &active_renderer);
        let subscriptions = create_shared_subscriptions(ctx);
        let active_subscriptions =
            create_active_subscriptions(ctx, &active_session, &active_renderer);
        let session_props = active_session.to_props();
        let renderer_props = active_renderer.to_props(None);
        let presentation_props = ctx.props().presentation.to_props(PtrEqRc::new(vec![]));
        let on_close_column_settings = ctx.link().callback(|_| OpenColumnSettings {
            locator: None,
            sender: None,
            toggle: false,
        });

        // Kick off an initial async theme fetch so that `available_themes` is
        // populated even if `theme_config_updated` fires before the PubSub
        // subscription is registered.
        {
            let presentation = ctx.props().presentation.clone();
            let cb = ctx.link().callback(move |themes: PtrEqRc<Vec<String>>| {
                UpdatePresentation(Box::new(presentation.to_props(themes)))
            });

            let presentation = ctx.props().presentation.clone();
            ApiFuture::spawn(async move {
                let themes = presentation.get_available_themes().await?;
                cb.emit(themes);
                Ok(())
            });
        }

        let shift_listeners = install_shift_listeners(elem);
        let global_filter_listener = wiring::global_filter_listener(ctx);
        let master_click_listener = wiring::master_click_listener(ctx);

        Self {
            _subscriptions: subscriptions,
            _global_filter_listener: global_filter_listener,
            _master_click_listener: master_click_listener,
            master_listeners_attached: false,
            _active_subscriptions: active_subscriptions,
            _title_subscriptions: subscribe_panel_titles(ctx),
            active_session,
            active_renderer,
            debug_open: false,
            fonts,
            on_close_column_settings,
            on_rendered: Vec::new(),
            on_resize: Default::default(),
            on_settings_panel_dimensions_reset: Default::default(),
            settings_open: false,
            global_filters: Vec::new(),
            settings_geometry: Default::default(),
            session_props,
            renderer_props,
            presentation_props,
            dragdrop_props: Default::default(),
            update_count: 0,
            _shift_listeners: shift_listeners,
        }
    }

    /// The protocol dispatch table: every arm is a one-line call into a domain
    /// module (see the module doc). Trivial self-describing arms stay inline.
    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            PreloadFontsUpdate => true,
            TitlesChanged => true,
            Resize => {
                self.on_resize.emit(());
                false
            },
            Reset(all, completion) => {
                // Element-level reset (symmetric with `save`, which fans out
                // over all panels): drop the element-level global-filter SET
                // first — otherwise a detail panel re-applies it right after
                // the reset — then reset EVERY panel. Master/detail ROLES are
                // layout state (like the panel arrangement), not panel
                // config, so they survive. The `Completion`
                // resolves only after ALL panels' reset runs complete
                // (invariant I6 — previously it rode the active panel only,
                // and the other panels' runs were unowned).
                let workspace = &ctx.props().workspace;
                let origins = workspace.clear_global_filters();
                clear_master_selections(workspace, origins);
                let mut tasks = Vec::new();
                for (id, panel) in workspace
                    .panel_ids()
                    .into_iter()
                    .filter_map(|id| workspace.panel(&id).map(|p| (id, p)))
                {
                    stamp_global_overlay(workspace, &id, &panel.session);
                    tasks.push(reset_all(
                        &panel.session,
                        &panel.renderer,
                        &ctx.props().presentation,
                        all,
                    ));
                }

                let run = async move {
                    futures::future::join_all(tasks)
                        .await
                        .into_iter()
                        .collect::<ApiResult<Vec<_>>>()?;
                    Ok(())
                };

                match completion {
                    Some(completion) => completion.resolve_after(run),
                    None => spawn_owned("reset", run),
                }

                false
            },
            ResetPanel(id, all, sender) => {
                // Panel-scoped reset (toolbar / context menu / `resetPanel()`
                // API): reset ONLY the target panel's config. The
                // element-level cross-filter overlay is workspace state, not
                // panel config, so it's deliberately left in place — the
                // rebuilt view re-applies it via `effective_view_config`,
                // keeping a detail panel consistent with the rest of the
                // workspace. A dangling id no-ops (dropping `sender` rejects
                // the API promise).
                let id = id.map(crate::workspace::PanelId::from);
                if let Some(panel) = ctx.props().workspace.panel_or_active(id.as_ref()) {
                    let run = reset_all(
                        &panel.session,
                        &panel.renderer,
                        &ctx.props().presentation,
                        all,
                    );

                    match sender {
                        Some(completion) => completion.resolve_after(run),
                        None => spawn_owned("reset-panel", run),
                    }
                }

                false
            },

            // Panel lifecycle (`panels.rs`)
            LayoutChanged => self.on_layout_changed(ctx),
            SetActivePanel(id, completion) => self.on_set_active_panel(ctx, id, completion),
            ClosePanel(id, completion) => self.on_close_panel(ctx, id, completion),
            CommitWorkspaceRestore(id) => self.on_commit_workspace_restore(ctx, id),
            DuplicatePanel(id) => self.on_duplicate_panel(ctx, id),
            NewPanel(id) => self.on_new_panel(ctx, id),
            NewPanelFrom { client, table } => self.on_new_panel_from(ctx, client, table),

            // Master/detail cross-filter (`filters.rs`)
            ToggleMaster(id) => self.on_toggle_master(ctx, id),
            MasterContribution(panel, selection) => {
                self.on_master_contribution(ctx, panel, selection)
            },
            RemoveGlobalFilter(index) => self.on_remove_global_filter(ctx, index),
            ClearGlobalFilters => self.on_clear_global_filters(ctx),

            // Settings sidebar + divider pump + column settings (`settings.rs`)
            ToggleSettingsInit(update, resolve) => {
                self.on_toggle_settings_init(ctx, update, resolve)
            },
            ToggleSettingsComplete(update, resolve) => {
                self.on_toggle_settings_complete(ctx, update, resolve)
            },
            SettingsPanelSizeUpdate(x) => self.on_settings_panel_size_update(x),
            SettingsDividerMove(w) => self.on_settings_divider_move(ctx, w),
            SettingsDividerPump => self.on_settings_divider_pump(ctx),
            SettingsDividerCommit(w) => self.on_settings_divider_commit(ctx, w),
            SettingsDividerFinish => self.on_settings_divider_finish(ctx),
            SettingsPanelTabChanged(tab) => self.on_settings_panel_tab_changed(tab),
            SettingsPanelAutoWidth(w) => self.on_settings_panel_auto_width(w),
            OpenColumnSettings {
                locator,
                sender,
                toggle,
            } => self.on_open_column_settings(ctx, locator, sender, toggle),
            ColumnSettingsPanelSizeUpdate(x) => self.on_column_settings_panel_size_update(x),
            ColumnSettingsTabChanged(tab) => self.on_column_settings_tab_changed(ctx, tab),
            ToggleDebug => self.on_toggle_debug(ctx),

            // Value-semantic snapshot plumbing (`snapshots.rs`)
            UpdateSession(props) => self.on_update_session(*props),
            UpdateSessionStats(stats, has_table) => self.on_update_session_stats(stats, has_table),
            UpdateGlobalFilters => self.on_update_global_filters(ctx),
            UpdateRenderer(props) => self.on_update_renderer(*props),
            UpdatePresentation(props) => self.on_update_presentation(ctx, *props),
            UpdateSettingsOpen(open) => self.on_update_settings_open(open),
            UpdateIsWorkspace(is_workspace) => self.on_update_is_workspace(is_workspace),
            UpdateColumnSettings(ocs) => self.on_update_column_settings(*ocs),
            UpdateDragDrop(props) => self.on_update_dragdrop(*props),
            UpdateInFlight(count) => self.on_update_in_flight(count),
        }
    }

    /// This top-level component is mounted to the Custom Element, so it has no
    /// API to provide props - but for sanity if needed, just return true on
    /// change.
    fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        true
    }

    /// On rendered call notify_resize().  This also triggers any registered
    /// async callbacks to the Custom Element API.
    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        // Attach the master/detail selection listeners once (the host element
        // is stable for this component's lifetime).
        if !self.master_listeners_attached {
            let _ = ctx.props().elem.add_event_listener_with_callback(
                "perspective-global-filter",
                self._global_filter_listener.as_ref().unchecked_ref(),
            );
            let _ = ctx.props().elem.add_event_listener_with_callback(
                "perspective-click",
                self._master_click_listener.as_ref().unchecked_ref(),
            );
            self.master_listeners_attached = true;
        }

        if !self.on_rendered.is_empty()
            && matches!(self.fonts.get_status(), FontLoaderStatus::Finished)
        {
            for resolve in self.on_rendered.drain(..) {
                if resolve.send(()).is_err() {
                    tracing::warn!("Orphan render");
                }
            }
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        self.render(ctx)
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {}
}
