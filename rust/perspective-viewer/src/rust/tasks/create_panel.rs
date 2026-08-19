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

use web_sys::HtmlElement;
use yew::Callback;

use crate::config::*;
use crate::custom_events::wire_panel_events;
use crate::presentation::*;
use crate::renderer::*;
use crate::session::{ResetOptions, Session};
use crate::tasks::*;
use crate::utils::*;
use crate::workspace::{Panel, PanelId, PanelPhase, Workspace};
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
///
/// Hidden panels (an unslotted tab-stack panel, a `display: none` host)
/// don't redraw — a full charts dispatch per update is a fetch + render
/// nobody can see. The dropped update is recorded on the [`Renderer`]
/// instead, and the activation nudge (`tasks::pipeline::activation_render`)
/// consumes the marker to catch the panel up with ONE `plugin.update`.
fn wire_panel_render_sub(session: &Session, renderer: &Renderer) -> Subscription {
    session.table_updated.add_listener({
        clone!(renderer, session);
        move |_| {
            if renderer.is_plugin_hidden() {
                renderer.set_data_stale();
                return;
            }

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

/// Create a new independent panel (own `Session` + `Renderer` + id) and
/// restore `config` into it. Shared by `addPanel` and `restore`'s
/// create-if-missing upsert. `id` is the panel's id — provided when
/// restoring into a specific named slot, or `None` to generate a fresh
/// one. `theme` is stripped (element-level, not per-panel) and `client` —
/// or the element's default client when `None` — is bound so the config's
/// `table` resolves against it.
pub(crate) async fn create_panel(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
    notify: &Callback<()>,
    id: Option<PanelId>,
    config: ViewerConfigInitial,
    client: Option<perspective_client::Client>,
) -> ApiResult<PanelId> {
    let (id, session, renderer, update) = create_panel_model(
        elem,
        presentation,
        workspace,
        id,
        config.into(),
        client,
        Placement::Staged,
    );

    stamp_global_overlay(workspace, &id, &session);
    notify.emit(());

    ApiFuture::spawn({
        clone!(workspace, id, notify);
        async move {
            set_timeout(STAGING_DEADLINE_MS).await?;
            if workspace.promote(&id) {
                notify.emit(());
            }

            Ok(())
        }
    });

    // A fresh panel is never the active one, so it needs no `root` for the
    // (active-only) settings-sidebar sequencing.
    let result = restore_panel(
        &session,
        &renderer,
        presentation,
        workspace,
        RestoreMode::Fresh,
        update,
        crate::tasks::RestoreErrors::Publish,
    )
    .await;

    // Promote on completion AND error — a failed restore's error state
    // must become visible too.
    if workspace.promote(&id) {
        notify.emit(());
    }

    result?;
    Ok(id)
}

/// Where [`create_panel_model`] registers the new panel model.
pub(crate) enum Placement {
    /// Into the placed panel set at [`PanelPhase::Placed`] — a live, visible
    /// panel from the start (`restoreWorkspace` mounts panels directly at
    /// their saved layout positions).
    Placed,

    /// Into the placed panel set at [`PanelPhase::Staging`] — withheld from
    /// the layout while its first draw completes in the hidden staging
    /// wrapper, then promoted ([`Workspace::promote`]) by restore completion
    /// or the [`STAGING_DEADLINE_MS`] deadline, whichever wins.
    Staged,

    /// Into the reservation slot ([`Workspace::reserve_panel`]) — a pending
    /// `load()`'s first panel, held out of the placed set until it is
    /// claimed ([`place_reserved`]) or discarded.
    Reserved,
}

/// The synchronous *model* half of [`create_panel`]: build and register a new
/// panel's engine handles (own `Session` + `Renderer` + id) in the
/// [`Workspace`] (per `placement`), apply-and-strip the element-level config
/// fields (`settings`/`theme`), and bind `client` (falling back to the default
/// client). `id` is the panel's id, or `None` to generate a fresh one.
pub(crate) fn create_panel_model(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
    id: Option<PanelId>,
    mut update: ViewerConfigUpdate,
    client: Option<perspective_client::Client>,
    placement: Placement,
) -> (PanelId, Session, Renderer, ViewerConfigUpdate) {
    let session = Session::new();
    let renderer = Renderer::new(elem);
    let id = id.unwrap_or_else(|| workspace.generate_id());
    renderer.set_slot_name(id.as_str());
    let subs = wire_panel_subs(elem, presentation, &session, &renderer);
    let panel = Panel::new(id.clone(), session.clone(), renderer.clone(), subs);
    match placement {
        Placement::Placed => workspace.insert_panel(panel, PanelPhase::Placed),
        Placement::Staged => workspace.insert_panel(panel, PanelPhase::Staging),
        Placement::Reserved => workspace.reserve_panel(panel),
    }

    update.settings = OptionalUpdate::Missing;
    renderer.set_theme(match &update.theme {
        OptionalUpdate::Update(theme) => Some(theme.clone()),
        _ => presentation.active_theme_name_sync(),
    });

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

/// Claim the pending `load()` reservation into the placed set
/// ([`Workspace::claim_reserved`]), stamping the global-filter overlay and
/// notifying the root. `has_table` is whether the claimant carried a
/// `table`, recorded atomically with the claim — pass `true` when `load()`
/// itself places its reservation (a `Table` payload, or error surfacing),
/// which is not a restore claim and must never arm the epilogue's eviction.
pub(crate) fn place_reserved(
    workspace: &Workspace,
    notify: &Callback<()>,
    has_table: bool,
) -> Option<Panel> {
    let panel = workspace.claim_reserved(has_table)?;
    stamp_global_overlay(workspace, &panel.id, &panel.session);
    notify.emit(());
    Some(panel)
}

/// Tear down a [`Panel`] already removed from the [`Workspace`]: dispose its
/// renderer (slot-scoped plugin + light-DOM cleanup) and eject its table.
/// Shared by the root's `ClosePanel` handler and `restoreWorkspace`'s
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
