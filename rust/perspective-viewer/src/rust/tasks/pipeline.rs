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

//! The render pipeline (see `SESSION_CONFIG_COHERENCE_PLAN.md`) — the ONE
//! review surface for how config-driven renders happen.
//!
//! Invariants enforced here and by the types this composes:
//! - **I1** config mutation is a synchronous commit
//!   ([`Session::commit_view_config`]) — no async writer exists.
//! - **I2** every run consumes an immutable snapshot taken inside the draw
//!   lock; async stages never re-read the live config (the `ValidatedSnapshot`
//!   type-state token).
//! - **I3** runs serialize on the per-`Renderer` draw lock (the [`RenderGuard`]
//!   witness — plugin dispatch without it does not compile) and every commit
//!   schedules a run, so the final render always reflects the final commit.
//! - **I5** the run pins a [`RenderContext`] so plugin read-backs mid-render
//!   answer from the run's snapshot, never live state.

use std::rc::Rc;

use perspective_client::config::ViewConfigUpdate;
use perspective_client::{View, clone};
use perspective_js::utils::*;
use yew::prelude::*;

use crate::renderer::{RenderContext, Renderer};
use crate::session::{BindDisposition, Session};
use crate::utils::RenderGuard;

/// Snapshot → validate → bind → cache + pin the [`RenderContext`]. The core
/// of every config-driven run. Returns HOW the bind reconciled (the
/// [`BindDisposition`], whose `Rebuilt` arm alone carries the `plugin.draw`
/// witness — see [`dispatch_bound`]) and the RAII context pin (dropped —
/// unpinning — when the caller's locked task ends).
pub async fn bind_snapshot(
    guard: &RenderGuard,
    session: &Session,
    renderer: &Renderer,
) -> ApiResult<(BindDisposition, Option<crate::renderer::ContextPin>)> {
    let snap = session.snapshot(guard);
    let validated = session.validate_snapshot(guard, snap).await?;
    let disposition = session.bind_view(guard, validated).await?;
    let pin = if let Some(view) = disposition.view() {
        let ctx = Rc::new(build_render_context(session, renderer, view)?);
        renderer.set_cached_context(ctx.clone());
        Some(renderer.pin_context(guard, ctx))
    } else {
        None
    };

    Ok((disposition, pin))
}

/// Who initiated a render run — threaded EXPLICITLY from the closed set of
/// `#[wasm_bindgen]` element entry points, never inferred from lock state
/// or timing (a temporal "is this nested?" heuristic would misclassify
/// legitimate concurrent public calls).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunOrigin {
    /// A public element API entry (`restore`, `restorePanel`, `reset`,
    /// `load`, …): an explicit external request, so a run that reconciles
    /// `Unchanged` with no state delta STILL repaints — the documented
    /// no-op-restore refresh affordance (`update` source 6, "the user
    /// asked" — `PLUGIN_DRAW_INVARIANT_PLAN.md` amendment).
    Public,
    /// A host-initiated run (UI commits, unpause resumes, subscriptions):
    /// a reconciled no-op dispatches nothing.
    Internal,
}

/// The ONE decision table mapping a run's [`BindDisposition`] to its plugin
/// dispatch (`PLUGIN_DRAW_INVARIANT_PLAN.md`, as amended 2026-07-16):
/// `plugin.draw` fires iff there is a NEW `View` — a REBUILD, or a
/// freshly-selected plugin's first paint of the bound `View`
/// (`promote_first_paint`). `plugin.update` fires iff the `View` is
/// unchanged but a plugin-visible SOURCE changed: the `Adopted`
/// config delta, a genuinely changed plugin/columns bucket this run
/// delivered via `plugin.restore` (`plugin_state_changed`), or an explicit
/// public API request ([`RunOrigin::Public`]). An INTERNAL run that
/// reconciled `Unchanged` with no state delta dispatches NOTHING — no
/// defensive repaints (this is what makes an inert plugin echo, e.g. the
/// datagrid's `toggle_edit_mode` `restorePanel`, render-silent). Deferred
/// binds dispatch nothing.
pub async fn dispatch_bound(
    guard: &RenderGuard,
    renderer: &Renderer,
    disposition: BindDisposition,
    plugin_state_changed: bool,
    origin: RunOrigin,
) -> ApiResult<()> {
    match disposition {
        BindDisposition::Rebuilt(fresh) => renderer.draw_fresh(guard, fresh).await,
        BindDisposition::Adopted(view) => match renderer.promote_first_paint(&view) {
            Some(fresh) => renderer.draw_fresh(guard, fresh).await,
            // The adoption's effective-config delta IS the source.
            None => renderer.update_bound(guard, &view).await,
        },
        BindDisposition::Unchanged(view) => match renderer.promote_first_paint(&view) {
            Some(fresh) => renderer.draw_fresh(guard, fresh).await,
            None if plugin_state_changed || origin == RunOrigin::Public => {
                renderer.update_bound(guard, &view).await
            },
            None => {
                tracing::debug!("Render skipped, reconciled no-op (internal)");
                Ok(())
            },
        },
        BindDisposition::Deferred => {
            tracing::debug!("Render skipped, no `View` attached");
            Ok(())
        },
    }
}

/// Assemble the plugin-visible state bundle for the just-bound `View` —
/// every value a plugin may read back during its render, all belonging to
/// the same snapshot (I5).
fn build_render_context(
    session: &Session,
    renderer: &Renderer,
    view: &View,
) -> ApiResult<RenderContext> {
    Ok(RenderContext {
        view_config: session
            .get_rendered_view_config()
            .ok_or("No bound `View`")?,
        view: view.clone(),
        table: session.get_table().ok_or("No `Table` set")?,
        client: session.get_client().ok_or("No `Client` set")?,
        edit_port: session.metadata().get_edit_port(),
        theme: renderer.theme(),
    })
}

/// Commit `update` (sync, may `Err` before any state changes — I4) and
/// schedule a locked run. The single entry point for every "change the
/// config and draw" action; returns the run's future (I6: public mutators
/// resolve at render completion).
pub fn apply_and_render(
    session: &Session,
    renderer: &Renderer,
    update: ViewConfigUpdate,
) -> ApiResult<ApiFuture<()>> {
    update_plugin_and_render(session, renderer, update, None)
}

/// [`apply_and_render`] plus a plugin selection (resolved via
/// [`Renderer::resolve_plugin_update`]). The plugin swap is committed inside
/// the locked run, atomically with the view rebind — never staged on the
/// `Renderer` where a concurrent draw could observe it.
pub fn update_plugin_and_render(
    session: &Session,
    renderer: &Renderer,
    update: ViewConfigUpdate,
    plugin_idx: Option<usize>,
) -> ApiResult<ApiFuture<()>> {
    session.commit_view_config(update)?;
    // Spinner accounting (RAII): created only when the commit succeeded,
    // moved into the run future, settled on every exit path by `Drop`.
    let run_token = session.begin_config_run();
    clone!(session, renderer);
    Ok(ApiFuture::new(async move {
        let _run_token = run_token;
        render_run(session, renderer, plugin_idx).await
    }))
}

/// Re-render from the current commit without applying an update.
pub fn just_render(session: &Session, renderer: &Renderer) -> ApiResult<ApiFuture<()>> {
    clone!(session, renderer);
    Ok(ApiFuture::new(async move {
        render_run(session, renderer, None).await
    }))
}

/// One locked, witnessed, snapshot-consuming render run.
async fn render_run(
    session: Session,
    renderer: Renderer,
    plugin_idx: Option<usize>,
) -> ApiResult<()> {
    let result = {
        clone!(session, renderer);
        renderer
            .clone()
            .render_task(|guard| async move {
                // The previous run errored; skip until the error clears.
                if session.get_error().is_some() {
                    return Ok(());
                }

                // Mount eagerly — BEFORE the (possibly slow) view query — so
                // the panel's frame is never empty while the query runs.
                renderer.mount_active_plugin()?;
                let plugin_swapped = renderer.commit_plugin(plugin_idx)?;
                let (disposition, _pin) = bind_snapshot(&guard, &session, &renderer).await?;
                if plugin_swapped {
                    // `commit_plugin_idx` already restored the new plugin from
                    // its raw bucket; re-run with the materialized snapshot so
                    // any `include: true` schema defaults make it into the
                    // plugin's state before the first draw.
                    let view_config_snapshot = session.get_view_config().clone();
                    let plugin_token =
                        wasm_bindgen::JsValue::from_serde_ext(&renderer.get_plugin_config())
                            .unwrap_or(wasm_bindgen::JsValue::NULL);
                    let columns_config = renderer
                        .all_columns_configs_materialized(&view_config_snapshot, &session)
                        .await;
                    renderer
                        .ensure_plugin_selected()?
                        .restore(&plugin_token, Some(&columns_config))?;
                }

                // `render_run` initiators are host-internal UI flows and
                // never touch plugin buckets (`commit_plugin` swaps route
                // through the first-paint promotion), so: no state delta,
                // internal origin — a reconciled no-op dispatches nothing.
                dispatch_bound(&guard, &renderer, disposition, false, RunOrigin::Internal).await
            })
            .await
    };

    // A failed RUN sets error state (with the reset-reconnect affordance);
    // the committed config is NOT rolled back (I4). Cancellation by a
    // superseding run ("View already deleted") is not a failure.
    match result.ignore_view_delete() {
        Err(e) => session.set_run_error(e).await,
        Ok(_) => Ok(()),
    }
}

/// Create a [`Callback`] that re-renders the current commit. Replaces the
/// old `render_callback` (which drew the bound view without validation).
pub fn render_callback(session: &Session, renderer: &Renderer) -> Callback<()> {
    clone!(session, renderer);
    Callback::from(move |_| {
        clone!(renderer, session);
        crate::utils::spawn_owned("render-callback", async move {
            just_render(&session, &renderer)?.await
        });
    })
}

/// One TRANSACTIONAL activation repaint (see the I5 audit gap in
/// `SESSION_CONFIG_COHERENCE_PLAN.md` §4): under the panel's draw lock,
/// stamp the `active` class + theme and `plugin.resize()` in ONE dispatch,
/// so the activation-dependent chrome (e.g. the datagrid's edit
/// column-header row, decided by its style listener reading that class) and
/// the class that styles it land in a single paint commit, never split.
///
/// `resize`, NOT `draw`/`update`: activation creates no new `View` and
/// changes no data (`plugin.draw` ⇔ new `View` —
/// `PLUGIN_DRAW_INVARIANT_PLAN.md`), and a full dispatch on charts is a
/// fetch + multi-blit repaint — the stacked-tab two-stage regression, paid
/// by BOTH sides of every tab switch. `resize` is each plugin's cheap
/// repaint-from-retained-state, and both built-ins skip it while hidden, so
/// the OUTGOING (unslotted) panel's nudge costs nothing. Deliberately NOT
/// debounced/throttled: activation is a one-shot interaction, not a data
/// stream, and the throttle timer is a task boundary the browser paints
/// across.
pub async fn activation_render(session: Session, renderer: Renderer) -> ApiResult<()> {
    let result = {
        clone!(session, renderer);
        renderer
            .clone()
            .render_task(|guard| async move {
                match session.get_view() {
                    Some(_) => {
                        let _pin = renderer
                            .cached_context()
                            .map(|ctx| renderer.pin_context(&guard, ctx));
                        renderer.activation_repaint(&guard).await
                    },
                    None => Ok(()),
                }
            })
            .await
    };

    result.ignore_view_delete().map(|_| ())
}

/// Resize from the current `View` and `Plugin`, or run a full render when
/// the plugin has never drawn. The future form — callers that must own
/// completion (invariant I6) join THIS; [`resize_callback`] is its
/// event-listener-leaf wrapper.
pub async fn resize_or_render(session: Session, renderer: Renderer) -> ApiResult<()> {
    if !renderer.is_plugin_activated()? {
        just_render(&session, &renderer)?.await
    } else {
        renderer.resize().await
    }
}

/// Create a [`Callback`] that resizes from the current `View` and `Plugin`,
/// or runs a full render when the plugin has never drawn.
pub fn resize_callback(session: &Session, renderer: &Renderer) -> Callback<()> {
    clone!(session, renderer);
    Callback::from(move |_| {
        clone!(renderer, session);
        crate::utils::spawn_owned("resize-callback", resize_or_render(session, renderer));
    })
}
