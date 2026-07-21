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

//! Panel-lifecycle handlers: the [`Workspace`] panel set (add / duplicate /
//! close) and active-panel targeting. INVARIANT: app-initiated layout changes
//! mutate the `Workspace` FIRST, synchronously — `regular-layout` is
//! reconciled as a downstream consequence of the re-render, never the source
//! of truth (see `ClosePanel`).
//!
//! [`Workspace`]: crate::workspace::Workspace

use perspective_js::utils::*;
use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::PerspectiveViewerMsg::*;
use super::wiring::{
    clear_active_callbacks, create_active_subscriptions, inject_active_callbacks,
    subscribe_panel_titles,
};
use crate::config::{TableUpdate, ViewerConfigUpdate};
use crate::queries::*;
use crate::renderer::Renderer;
use crate::session::*;
use crate::tasks::*;
use crate::utils::{Completion, spawn_owned};
use crate::workspace::PanelId;

impl PerspectiveViewer {
    pub(super) fn on_layout_changed(&mut self, ctx: &Context<Self>) -> bool {
        // The panel set may have changed (add); re-subscribe titles.
        self._title_subscriptions = subscribe_panel_titles(ctx);
        true
    }

    pub(super) fn on_set_active_panel(
        &mut self,
        ctx: &Context<Self>,
        id: String,
        completion: Option<Completion>,
    ) -> bool {
        let id = PanelId::from(id);
        let prev = ctx.props().workspace.active_id();
        if prev == id || !ctx.props().workspace.set_active(id.clone()) {
            // A no-op activation resolves immediately (nothing to render).
            if let Some(completion) = completion {
                completion.resolve_after(async { Ok(()) });
            }

            false
        } else {
            let new_session = ctx.props().workspace.active_session();
            let new_renderer = ctx.props().workspace.active_renderer();
            self.retarget_active(ctx, new_session, new_renderer);

            // Plugins render activation-dependent chrome (e.g. the
            // datagrid's extra "edit" column-header row while the
            // settings sidebar is open), but nothing else redraws a
            // panel on activation alone — so nudge BOTH sides of the
            // switch, each as ONE transactional, unthrottled draw that
            // stamps the `active` class atomically with the plugin DOM
            // it styles (`activation_render` — see the I5 audit gap in
            // SESSION_CONFIG_COHERENCE_PLAN.md §4). Hidden/undrawn
            // panels are skipped by the activation guard and the
            // plugin's own connected check. The runs are JOINED into
            // the caller's completion (invariant I6).
            let mut nudges = Vec::new();
            for pid in [&prev, &id] {
                if let Some(panel) = ctx.props().workspace.panel(pid)
                    && panel.renderer.is_plugin_activated().unwrap_or(false)
                {
                    nudges.push(activation_render(
                        panel.session.clone(),
                        panel.renderer.clone(),
                    ));
                }
            }

            let run = async move {
                futures::future::join_all(nudges)
                    .await
                    .into_iter()
                    .collect::<ApiResult<Vec<_>>>()?;
                Ok(())
            };

            match completion {
                Some(completion) => completion.resolve_after(run),
                None => spawn_owned("set-active-panel", run),
            }

            true
        }
    }

    /// Whole-element `restore`'s single commit: the `Workspace` already holds
    /// the final panel set (models inserted, olds ejected) and the staged
    /// layout. Re-subscribe the per-panel title wiring (the set changed
    /// wholesale), activate the restored panel, and re-render — `MainPanel`'s
    /// `rendered` pass applies the staged layout and mounts every cell in
    /// this one commit.
    pub(super) fn on_commit_workspace_restore(&mut self, ctx: &Context<Self>, id: String) -> bool {
        self._title_subscriptions = subscribe_panel_titles(ctx);
        self.on_set_active_panel(ctx, id, None);
        true
    }

    pub(super) fn on_close_panel(
        &mut self,
        ctx: &Context<Self>,
        id: String,
        completion: Option<Completion>,
    ) -> bool {
        let id = PanelId::from(id);

        // Never close the last panel — it would leave an empty workspace
        // with an invalid active id. (The frame's close button is hidden
        // for a lone panel; this guards the context-menu path too.) The
        // public API documents this as a no-op, so it RESOLVES rather than
        // cancels.
        if ctx.props().workspace.len() <= 1 {
            if let Some(completion) = completion {
                completion.resolve_after(async { Ok(()) });
            }

            return false;
        }

        let was_active = ctx.props().workspace.active_id() == id;
        let removed = ctx.props().workspace.remove_panel(&id);

        // If the active panel was closed, re-point active to a surviving
        // panel BEFORE anything reads `active_*` (the workspace's `active`
        // still names the just-removed id). The lone panel can't be
        // closed (its close button is hidden), so a survivor exists.
        if was_active && let Some(next) = ctx.props().workspace.panel_ids().first().cloned() {
            ctx.props().workspace.set_active(next);
            let new_session = ctx.props().workspace.active_session();
            let new_renderer = ctx.props().workspace.active_renderer();
            self.retarget_active(ctx, new_session, new_renderer);
        }

        // Synchronous eject (see `eject_panel` for why its sync halves must
        // not be deferred); the DEFERRED teardown future resolves the
        // caller's completion, carrying any teardown error (invariant I6 —
        // previously fire-and-forget). Surviving panels' resizes are driven
        // by the subsequent layout-update event and are attributed to it.
        let eject = removed.map(eject_panel);
        match (eject, completion) {
            (Some(eject), Some(completion)) => completion.resolve_after(eject),
            (Some(eject), None) => spawn_owned("close-panel", eject),
            (None, Some(completion)) => completion.resolve_after(async { Ok(()) }),
            (None, None) => {},
        }

        // Closing a MASTER retracts its contribution (`remove_panel` already
        // cleaned the model); re-stamp the survivors so details drop its
        // clauses (diff-aware — a detail close re-renders nothing).
        apply_global_filters(&ctx.props().workspace);

        // The panel set shrank; drop the closed panel's title subscription.
        // (`MainPanel` clears its own `maximized` state when the panel's cell
        // leaves the layout.)
        self._title_subscriptions = subscribe_panel_titles(ctx);
        true
    }

    pub(super) fn on_duplicate_panel(&mut self, ctx: &Context<Self>, id: String) -> bool {
        if let Some(panel) = ctx.props().workspace.panel(&PanelId::from(id)) {
            let elem = ctx.props().elem.clone();
            let presentation = ctx.props().presentation.clone();
            let workspace = ctx.props().workspace.clone();
            let notify = ctx.link().callback(|_: ()| LayoutChanged);
            let activate = ctx.link().callback(|id| SetActivePanel(id, None));
            ApiFuture::spawn(async move {
                // Snapshot the source panel's config, then build a new
                // independent panel from it.
                let config = panel
                    .renderer
                    .clone()
                    .with_lock(async {
                        get_viewer_config(&panel.session, &panel.renderer, &presentation).await
                    })
                    .await?;

                let update = ViewerConfigUpdate::decode(&config.encode()?)?;
                // The SOURCE panel's client — its table name is only
                // meaningful there (it may not be the default client).
                let client = panel.session.get_client();
                let new_id = create_panel(
                    &elem,
                    &presentation,
                    &workspace,
                    &notify,
                    None,
                    update,
                    client,
                )
                .await?;
                // Make the duplicate active so the shared settings/toolbar
                // immediately target it.
                activate.emit(new_id.to_string());
                Ok(())
            });
        }

        false
    }

    pub(super) fn on_new_panel(&mut self, ctx: &Context<Self>, id: String) -> bool {
        if let Some(panel) = ctx.props().workspace.panel(&PanelId::from(id)) {
            let table_name = panel.session.get_table().map(|t| t.get_name().to_owned());
            let elem = ctx.props().elem.clone();
            let presentation = ctx.props().presentation.clone();
            let workspace = ctx.props().workspace.clone();
            let notify = ctx.link().callback(|_: ()| LayoutChanged);
            let activate = ctx.link().callback(|id| SetActivePanel(id, None));
            ApiFuture::spawn(async move {
                // A minimal config: the source's table (if any), default
                // everything else.
                let update = ViewerConfigUpdate {
                    table: table_name.map(TableUpdate::Update).unwrap_or_default(),
                    ..Default::default()
                };

                // The SOURCE panel's client — its table name is only
                // meaningful there (it may not be the default client).
                let client = panel.session.get_client();
                let new_id = create_panel(
                    &elem,
                    &presentation,
                    &workspace,
                    &notify,
                    None,
                    update,
                    client,
                )
                .await?;
                // Make the new panel active so the shared settings/toolbar
                // immediately target it.
                activate.emit(new_id.to_string());
                Ok(())
            });
        }
        false
    }

    /// `NewPanelFrom` — the context menu's "New" sub-menu: a fresh
    /// (default-config) panel bound to the named `Table` on the named
    /// `Client`, resolved from the `Workspace` loaded-clients registry.
    pub(super) fn on_new_panel_from(
        &mut self,
        ctx: &Context<Self>,
        client_name: String,
        table: String,
    ) -> bool {
        let Some(client) = ctx
            .props()
            .workspace
            .clients()
            .into_iter()
            .find(|c| c.get_name() == client_name)
        else {
            tracing::warn!("No loaded `Client` named \"{client_name}\"");
            return false;
        };

        let elem = ctx.props().elem.clone();
        let presentation = ctx.props().presentation.clone();
        let workspace = ctx.props().workspace.clone();
        let notify = ctx.link().callback(|_: ()| LayoutChanged);
        let activate = ctx.link().callback(|id| SetActivePanel(id, None));
        ApiFuture::spawn(async move {
            let update = ViewerConfigUpdate {
                table: TableUpdate::Update(table),
                ..Default::default()
            };

            let new_id = create_panel(
                &elem,
                &presentation,
                &workspace,
                &notify,
                None,
                update,
                Some(client),
            )
            .await?;
            // Make the new panel active so the shared settings/toolbar
            // immediately target it.
            activate.emit(new_id.to_string());
            Ok(())
        });

        false
    }

    /// Re-point the root's per-active engine wiring + snapshots from the
    /// current active panel to a new one: clear the old panel's direct
    /// callbacks, set up the new panel's callbacks + subscriptions, refresh
    /// the snapshots, and reset the in-flight render counter (which tracked
    /// the old panel).
    fn retarget_active(&mut self, ctx: &Context<Self>, session: Session, renderer: Renderer) {
        clear_active_callbacks(&self.active_session, &self.active_renderer);
        inject_active_callbacks(ctx, &session, &renderer);
        self._active_subscriptions = create_active_subscriptions(ctx, &session, &renderer);
        self.session_props = session.to_props();
        self.renderer_props = renderer.to_props(None);
        // Level-triggered: read the new panel's TRUE in-flight count (its
        // `run_state_changed` subscription tracks it from here) — switching
        // to a busy panel spins truthfully, instead of the old reset-to-0.
        self.update_count = session.in_flight_config_runs();
        self.active_session = session;
        self.active_renderer = renderer;

        // Chrome (status bar / settings) follows the active panel: mirror its
        // EFFECTIVE theme — its own per-panel theme, else the registry default
        // (first registered theme) — onto the host `theme` attribute, so the
        // shadow's CSS custom properties (which the chrome inherits) resolve to
        // it. The normal theme pathway (`set_theme_name`) also refreshes the
        // picker's `selected_theme` (via `theme_config_updated`) and any external
        // theme listeners; its no-op guard avoids a redundant emit when the host
        // already matches.
        let default_theme = self.presentation_props.available_themes.first().cloned();
        if let Some(theme) = self.active_renderer.theme().or(default_theme) {
            let presentation = ctx.props().presentation.clone();
            ApiFuture::spawn(async move {
                presentation.set_theme_name(Some(&theme)).await?;
                Ok(())
            });
        }
    }
}
