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

#![allow(non_snake_case)]

use web_sys::HtmlElement;
use yew::Callback;

use crate::config::*;
use crate::custom_events::wire_panel_events;
use crate::presentation::*;
use crate::renderer::*;
use crate::session::{ResetOptions, Session};
use crate::tasks::*;
use crate::utils::*;
use crate::workspace::{Panel, PanelId, Workspace};
use crate::*;

/// Build the full set of subscriptions a [`Panel`] owns for its lifetime: its
/// redraw subscription plus its custom-event fanout ([`wire_panel_events`]).
/// Shared by the seed (element constructor) and every [`create_panel_model`]
/// panel, so all panels wire identically and every panel — not just the seed —
/// dispatches its own `perspective-*` events (see C6).
pub(crate) fn wire_panel_subs(
    elem: &HtmlElement,
    presentation: &Presentation,
    session: &Session,
    renderer: &Renderer,
) -> Vec<Subscription> {
    let mut subs = vec![wire_panel_render_sub(session, renderer)];
    subs.extend(wire_panel_events(elem, session, renderer, presentation));
    subs
}

/// Wire a panel's data-refresh subscription: when its [`Session`]'s table emits
/// an update, redraw its [`Renderer`]. The returned [`Subscription`] must be
/// owned for the panel's lifetime (see [`Panel`]).
fn wire_panel_render_sub(session: &Session, renderer: &Renderer) -> Subscription {
    session.table_updated.add_listener({
        clone!(renderer, session);
        move |_| {
            clone!(renderer, session);
            ApiFuture::spawn(async move {
                renderer
                    .update_lazy(async move { Ok(session.get_view()) })
                    .await
                    .ignore_view_delete()
                    .map(|_| ())
            })
        }
    })
}

/// Create a new independent panel (own `Session` + `Renderer` + id) from a
/// `ViewerConfigUpdate`, mount and draw it, and return its id. Shared by
/// `addPanel`, whole-element `restore`, and `restorePanel`'s create-if-missing
/// path. `id` is the panel's id — provided when restoring into a specific named
/// slot, or `None` to generate a fresh one. `settings`/`theme` are stripped
/// (element-level, not per-panel) and `client` — or the element's default
/// client when `None` — is bound so the config's `table` resolves against it.
pub(crate) async fn create_panel(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
    notify: &Callback<()>,
    id: Option<PanelId>,
    update: ViewerConfigUpdate,
    client: Option<perspective_client::Client>,
) -> ApiResult<PanelId> {
    let (id, session, renderer, update) =
        create_panel_model(elem, presentation, workspace, id, update, client);

    stamp_global_overlay(workspace, &id, &session);
    notify.emit(());
    // A fresh panel is never the active one, so it needs no `root` for the
    // (active-only) settings-sidebar sequencing.
    restore_panel(
        &session,
        &renderer,
        presentation,
        None,
        RestoreMode::Fresh,
        update,
    )
    .await?;
    Ok(id)
}

/// The synchronous *model* half of [`create_panel`]: build and register a new
/// panel's engine handles (own `Session` + `Renderer` + id) in the
/// [`Workspace`], apply-and-strip the element-level config fields
/// (`settings`/`theme`), and bind `client` (falling back to the default
/// client). `id` is the panel's id, or `None` to generate a fresh one.
pub(crate) fn create_panel_model(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
    id: Option<PanelId>,
    mut update: ViewerConfigUpdate,
    client: Option<perspective_client::Client>,
) -> (PanelId, Session, Renderer, ViewerConfigUpdate) {
    let session = Session::new();
    let renderer = Renderer::new(elem);
    let id = id.unwrap_or_else(|| workspace.generate_id());
    renderer.set_slot_name(id.as_str());
    renderer.set_default_theme(presentation.default_theme_name_sync());
    let subs = wire_panel_subs(elem, presentation, &session, &renderer);
    workspace.insert_panel(Panel::new(
        id.clone(),
        session.clone(),
        renderer.clone(),
        subs,
    ));

    update.settings = OptionalUpdate::Missing;
    if let OptionalUpdate::Update(theme) = &update.theme {
        renderer.set_theme(Some(theme.clone()));
    }

    update.theme = OptionalUpdate::Missing;
    if let Some(client) = client.or_else(|| workspace.default_client()) {
        workspace.register_client(client.clone());
        session.set_client(client);
    }

    if let Some((idx, _)) = renderer.resolve_plugin_update(&update.plugin) {
        let _ = renderer.commit_plugin(Some(idx));
        let _ = renderer.mount_active_plugin();
    }

    (id, session, renderer, update)
}

/// Tear down a [`Panel`] already removed from the [`Workspace`]: dispose its
/// renderer (slot-scoped plugin + light-DOM cleanup) and eject its table.
/// Shared by the root's `ClosePanel` handler and whole-element `restore`'s
/// batch replacement of the pre-existing panel set.
pub(crate) fn eject_panel(panel: Panel) -> ApiFuture<()> {
    let was_errored = panel.session.is_errored();
    let dispose_task = panel.renderer.dispose();
    let reset_task = panel.session.reset(ResetOptions {
        config: true,
        expressions: true,
        table: Some(session::TableIntermediateState::Ejected),
        ..ResetOptions::default()
    });

    ApiFuture::new(async move {
        dispose_task.await?;
        match reset_task.await.ignore_view_delete() {
            Err(_) if was_errored => Ok(()),
            Err(e) => Err(e),
            Ok(_) => Ok(()),
        }
    })
}
