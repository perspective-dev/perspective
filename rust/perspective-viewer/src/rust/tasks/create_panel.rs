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
/// restore `update` into it. Shared by `addPanel`, `restore`'s
/// create-if-missing upsert, and `restorePanel`. `id` is the panel's id —
/// provided when restoring into a specific named slot, or `None` to
/// generate a fresh one. `theme` is stripped (element-level, not
/// per-panel) and `client` — or the element's default client when `None` —
/// is bound so the config's `table` resolves against it.
///
/// A `table` is OPTIONAL here: an update with none creates a deferred
/// panel that a later `load()` binds, which is the pre-existing
/// `restore`-then-`load` contract and the same state the reserved
/// `load()` path produces. The routes where a table-less panel WOULD be
/// permanently blank require one in their own argument types instead —
/// `addPanel`'s [`ViewerConfigInitial`], `WorkspaceConfigUpdate`'s
/// `panels` entries, and the agent's `add_panel` — so the guarantee sits
/// at the boundary that owns it rather than here, which would sweep
/// `restore`'s patch in with them.
pub(crate) async fn create_panel(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
    notify: &Callback<()>,
    id: Option<PanelId>,
    update: ViewerConfigUpdate,
    client: Option<perspective_client::Client>,
) -> ApiResult<PanelId> {
    let (id, session, renderer, update) = create_panel_model(
        elem,
        presentation,
        workspace,
        id,
        update,
        client,
        Placement::Placed,
    );

    stamp_global_overlay(workspace, &id, &session);
    // STAGE the panel (model-first): `MainPanel` renders its plugin slot
    // into a hidden pre-sized wrapper — not a layout cell — so the restore
    // below completes its first draw invisibly at (near-)final size. The
    // promote below then re-renders, and `MainPanel::reconcile` inserts an
    // ALREADY-DRAWN panel: the one layout transition reveals content,
    // never a blank frame.
    workspace.stage_panel(&id);
    notify.emit(());

    // The staging deadline: a slow restore promotes EARLY (placed, still
    // loading — the pre-staging progressive reveal) rather than leaving
    // the layout without feedback. Races the completion promote below on
    // the staged flag; only the winner re-renders.
    {
        clone!(workspace, id, notify);
        ApiFuture::spawn(async move {
            set_timeout(STAGING_DEADLINE_MS).await?;
            if workspace.clear_staged(&id) {
                notify.emit(());
            }

            Ok(())
        });
    }

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
    if workspace.clear_staged(&id) {
        notify.emit(());
    }

    result?;
    Ok(id)
}

/// Where [`create_panel_model`] registers the new panel model.
pub(crate) enum Placement {
    /// Into the placed panel set ([`Workspace::insert_panel`]) — a live,
    /// visible panel from the start.
    Placed,

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
    // Authored-theme boot: the FIRST panel of an empty element with no explicit
    // theme adopts the element's `theme` attribute (a one-time initial
    // selection; the attribute is otherwise an active-panel mirror). Captured
    // before `insert_panel` makes the workspace non-empty.
    let boot_theme = (workspace.is_empty() && matches!(update.theme, OptionalUpdate::Missing))
        .then(|| elem.get_attribute("theme"))
        .flatten();

    let session = Session::new();
    let renderer = Renderer::new(elem);
    let id = id.unwrap_or_else(|| workspace.generate_id());
    renderer.set_slot_name(id.as_str());
    renderer.set_default_theme(presentation.default_theme_name_sync());
    let subs = wire_panel_subs(elem, presentation, &session, &renderer);
    let panel = Panel::new(id.clone(), session.clone(), renderer.clone(), subs);
    match placement {
        Placement::Placed => workspace.insert_panel(panel),
        Placement::Reserved => workspace.reserve_panel(panel),
    }

    update.settings = OptionalUpdate::Missing;
    if let OptionalUpdate::Update(theme) = &update.theme {
        renderer.set_theme(Some(theme.clone()));
    } else if let Some(theme) = boot_theme {
        renderer.set_theme(Some(theme));
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

pub(crate) fn place_reserved(workspace: &Workspace, notify: &Callback<()>) -> Option<Panel> {
    let panel = workspace.claim_reserved()?;
    stamp_global_overlay(workspace, &panel.id, &panel.session);
    notify.emit(());
    Some(panel)
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
