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
use crate::config::ViewerConfigInitial;
use crate::queries::*;
use crate::renderer::Renderer;
use crate::session::*;
use crate::tasks::*;
use crate::utils::{Completion, spawn_owned};
use crate::workspace::PanelId;

impl PerspectiveViewer {
    pub(super) fn on_layout_changed(&mut self, ctx: &Context<Self>) -> bool {
        self._title_subscriptions = subscribe_panel_titles(ctx);
        self.resync_active(ctx);
        true
    }

    /// Level-triggered binding sync: re-point the root's engine bindings at
    /// the model's *current* active panel (or the detached empty engines at
    /// zero panels) when they differ, by `Rc` identity. Catches model-side
    /// activations that never dispatch `SetActivePanel`.
    fn resync_active(&mut self, ctx: &Context<Self>) -> bool {
        let session = ctx
            .props()
            .workspace
            .active_session()
            .unwrap_or_else(|| self.empty_session.clone());
        let renderer = ctx
            .props()
            .workspace
            .active_renderer()
            .unwrap_or_else(|| self.empty_renderer.clone());

        if session == self.active_session && renderer == self.active_renderer {
            false
        } else {
            self.retarget_active(ctx, session, renderer);
            true
        }
    }

    pub(super) fn on_set_active_panel(
        &mut self,
        ctx: &Context<Self>,
        id: String,
        completion: Option<Completion>,
    ) -> bool {
        let id = PanelId::from(id);
        let prev = ctx.props().workspace.active_id();
        if prev.as_ref() == Some(&id) || !ctx.props().workspace.set_active(id.clone()) {
            let resynced = self.resync_active(ctx);
            if let Some(completion) = completion {
                completion.resolve_after(async { Ok(()) });
            }

            resynced
        } else {
            let new_session = ctx
                .props()
                .workspace
                .active_session()
                .unwrap_or_else(|| self.empty_session.clone());

            let new_renderer = ctx
                .props()
                .workspace
                .active_renderer()
                .unwrap_or_else(|| self.empty_renderer.clone());

            self.retarget_active(ctx, new_session, new_renderer);
            let mut nudges = Vec::new();
            for pid in prev.iter().chain(std::iter::once(&id)) {
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

    /// `restoreWorkspace`'s single commit: the `Workspace` already holds
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

        let was_active = ctx.props().workspace.active_id().as_ref() == Some(&id);
        let removed = ctx.props().workspace.remove_panel(&id);
        if was_active {
            if let Some(next) = ctx.props().workspace.panel_ids().first().cloned() {
                ctx.props().workspace.set_active(next);
            }

            let new_session = ctx
                .props()
                .workspace
                .active_session()
                .unwrap_or_else(|| self.empty_session.clone());
            let new_renderer = ctx
                .props()
                .workspace
                .active_renderer()
                .unwrap_or_else(|| self.empty_renderer.clone());
            self.retarget_active(ctx, new_session, new_renderer);
        }

        let eject = removed.map(eject_panel);
        match (eject, completion) {
            (Some(eject), Some(completion)) => completion.resolve_after(eject),
            (Some(eject), None) => spawn_owned("close-panel", eject),
            (None, Some(completion)) => completion.resolve_after(async { Ok(()) }),
            (None, None) => {},
        }

        apply_global_filters(&ctx.props().workspace);
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
                let config = panel
                    .renderer
                    .clone()
                    .with_lock(async {
                        get_viewer_config(&panel.session, &panel.renderer, &presentation).await
                    })
                    .await?;

                // TODO(texodus): what the ****?
                let update = ViewerConfigInitial::decode(&config.encode()?)?;
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

                activate.emit(new_id.to_string());
                Ok(())
            });
        }

        false
    }

    pub(super) fn on_new_panel(&mut self, ctx: &Context<Self>, id: String) -> bool {
        if let Some(panel) = ctx.props().workspace.panel(&PanelId::from(id)) {
            let Some(table_name) = panel.session.get_table().map(|t| t.get_name().to_owned())
            else {
                tracing::warn!("Source panel has no `Table` to create a new panel from");
                return false;
            };

            let elem = ctx.props().elem.clone();
            let presentation = ctx.props().presentation.clone();
            let workspace = ctx.props().workspace.clone();
            let notify = ctx.link().callback(|_: ()| LayoutChanged);
            let activate = ctx.link().callback(|id| SetActivePanel(id, None));
            ApiFuture::spawn(async move {
                let client = panel.session.get_client();
                let new_id = create_panel(
                    &elem,
                    &presentation,
                    &workspace,
                    &notify,
                    None,
                    ViewerConfigInitial::new(table_name),
                    client,
                )
                .await?;

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
            let new_id = create_panel(
                &elem,
                &presentation,
                &workspace,
                &notify,
                None,
                ViewerConfigInitial::new(table),
                Some(client),
            )
            .await?;

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
        self.update_count = session.in_flight_config_runs();
        self.active_session = session;
        self.active_renderer = renderer;
        let presentation = ctx.props().presentation.clone();
        let workspace = ctx.props().workspace.clone();
        ApiFuture::spawn(async move {
            // Only an EXPLICITLY themed panel mirrors onto the host; an
            // unpinned one inherits whatever the host already shows, so
            // activating it must not restate (and thereby pin) that value.
            if let Some(theme) = workspace.active_renderer().and_then(|x| x.theme()) {
                presentation.set_theme_name(Some(&theme)).await?;
                presentation.publish_theme_config().await?;
            }

            Ok(())
        });
    }
}
