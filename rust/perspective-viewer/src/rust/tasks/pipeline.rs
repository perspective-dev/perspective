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

use std::rc::Rc;

use perspective_client::config::ViewConfigUpdate;
use perspective_client::{View, clone};
use perspective_js::utils::*;
use wasm_bindgen::JsValue;
use yew::prelude::*;

use super::transactional_restore::{commit_edit, prepare_edit};
use crate::presentation::Presentation;
use crate::renderer::{RenderContext, Renderer};
use crate::session::{
    BindDisposition, BindingEffects, Disposal, EditDelta, OpKind, Session, StepOutcome, view_fields,
};
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
    Public,
    Internal,
}

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
/// [`Renderer::resolve_plugin_update`]), committed in the SAME swap as the
/// view config — in the op's step, never by the detached render.
pub fn update_plugin_and_render(
    session: &Session,
    renderer: &Renderer,
    update: ViewConfigUpdate,
    plugin_idx: Option<usize>,
) -> ApiResult<ApiFuture<()>> {
    session.check_edit(&update)?;
    let fields = plugin_idx.is_none().then(|| view_fields(&update));
    let kind = OpKind::Edit {
        delta: EditDelta::View(Box::new(update.clone())),
        fields,
    };

    let ticket = session.submit(kind, {
        clone!(session, renderer);
        move |_ctx| {
            Box::pin(async move {
                let prepared = prepare_edit(&session, &renderer, update, plugin_idx).await?;
                let committed = commit_edit(&session, &renderer, prepared);
                Ok(StepOutcome::Render(Box::pin(render_run(
                    session,
                    renderer,
                    RunCommit::Done(committed),
                ))))
            })
        }
    });

    Ok(ApiFuture::new(ticket.settle()))
}

/// Re-render from the current commit without applying an update.
pub fn just_render(session: &Session, renderer: &Renderer) -> ApiResult<ApiFuture<()>> {
    clone!(session, renderer);
    Ok(ApiFuture::new(async move {
        render_run(session, renderer, RunCommit::None).await
    }))
}

/// What a transactional restore committed (see
/// [`super::transactional_restore`]): the run has to bring the plugin element
/// and the paint in line with it.
pub(crate) struct Committed {
    /// A plugin selection was committed; its element must be activated.
    pub activate: bool,

    /// ...and it REPLACED an earlier selection (a first selection is not a
    /// swap, and does not force a `plugin.restore`).
    pub plugin_swapped: bool,
    pub plugin_config_changed: bool,
    pub columns_config_changed: bool,
}

/// The commit a locked run renders.
pub(crate) enum RunCommit {
    /// Whatever is committed (a repaint, an activation, a resize).
    None,

    /// A UI edit its op's step ALREADY committed; the plugin receives the final
    /// buckets in ONE `plugin.restore`.
    Done(Committed),

    /// A restore's commit, run first thing under the lock — a restore may
    /// REBIND, and under the lock no render of the outgoing state can bind a
    /// `View` over the incoming table.
    Deferred(Box<dyn FnOnce() -> (Committed, BindingEffects)>),
}

/// Everything that varies between locked render runs, consumed by
/// [`locked_run`] — the ONE lock-body composition. `Default` is the
/// host-internal UI-commit run: `Internal` origin, no plugin swap, no
/// pre-bind task, no bucket updates, no dispatch visibility gate.
pub(crate) struct RunSpec {
    /// Who initiated this run (see [`RunOrigin`]).
    pub origin: RunOrigin,

    /// What this run renders — see [`RunCommit`].
    pub commit: RunCommit,

    /// When set, plugin dispatch is skipped while the host element is not
    /// visible (`Presentation::is_visible`) — the `restore` family's gate
    /// (the eventual auto-pause resume rebuilds and redraws). `None`
    /// dispatches unconditionally (UI-commit runs, whose callers gate on
    /// drawn/loaded state themselves).
    pub presentation: Option<Presentation>,
}

impl Default for RunSpec {
    fn default() -> Self {
        Self {
            origin: RunOrigin::Internal,
            commit: RunCommit::None,
            presentation: None,
        }
    }
}

/// One locked, witnessed, snapshot-consuming render run — the SINGLE lock
/// body shared by every config-driven run (`apply_and_render` &co. via
/// [`render_run`]'s tail, the `restore` family via
/// [`super::transactional_restore`]): the restore's commit → eager mount →
/// plugin-swap commit → theme stamp → error guard → [`bind_snapshot`]
/// (gated on a bound `Table`, else `Deferred` — the config is already
/// committed, so the eventual `load()` run binds from it) → bucket updates
/// + materialized `plugin.restore` → [`dispatch_bound`].
///
/// A pre-existing session error skips the run for `Internal` origins and
/// fails it for `Public` ones (the caller asked and must hear the failure —
/// I6). Returns the RAW run result; error-reporting policy (`set_run_error`
/// vs. propagate) belongs to the caller.
pub(crate) async fn locked_run(
    session: &Session,
    renderer: &Renderer,
    spec: RunSpec,
) -> ApiResult<()> {
    clone!(session, renderer);
    renderer
        .clone()
        .render_task(|guard| run_locked(guard, session, renderer, spec))
        .await
}

/// [`locked_run`]'s body, for a caller that already holds the draw lock.
pub(crate) async fn run_locked(
    guard: RenderGuard,
    session: Session,
    renderer: Renderer,
    spec: RunSpec,
) -> ApiResult<()> {
    {
        {
            if let Some(disposal) = session.disposal() {
                return match (disposal, spec.origin) {
                    (Disposal::Reject, RunOrigin::Public) => Err(ApiError::new("Panel disposed")),
                    _ => Ok(()),
                };
            }

            let committed = match spec.commit {
                RunCommit::Done(committed) => Some(committed),
                RunCommit::Deferred(commit) => {
                    let (committed, binding) = commit();
                    let rebound = binding.rebound();
                    session.finish_binding(binding).await?;
                    if rebound
                        && session.get_table().is_none()
                        && let Some(plugin) = renderer.active_plugin()
                    {
                        plugin.clear().await?;
                    }

                    Some(committed)
                },
                RunCommit::None => None,
            };

            if !committed.as_ref().is_some_and(|c| c.activate) {
                renderer.mount_active_plugin()?;
            }

            let plugin_swapped = match &committed {
                Some(committed) => {
                    if committed.activate {
                        renderer.activate_committed_plugin()?;
                    }

                    committed.plugin_swapped
                },
                None => {
                    renderer.ensure_plugin_selected()?;
                    false
                },
            };
            let plugin = renderer.active_plugin().ok_or("No Plugin")?;
            renderer.stamp_theme(Some(&plugin));
            if let Some(error) = session.blocking_error() {
                return match spec.origin {
                    RunOrigin::Public => Err(error),
                    RunOrigin::Internal => Ok(()),
                };
            }

            session.set_rendered(false);

            let (disposition, _pin) = if session.get_table().is_some() {
                bind_snapshot(&guard, &session, &renderer).await?
            } else {
                (BindDisposition::Deferred, None)
            };

            let view_config_snapshot = session.committed_view_config().clone();
            let changed = match committed {
                Some(committed) => {
                    let changed =
                        committed.plugin_config_changed || committed.columns_config_changed;

                    if changed || plugin_swapped {
                        let plugin_config = renderer.committed_plugin_config();
                        let plugin_update =
                            JsValue::from_serde_ext(&plugin_config).unwrap_or(JsValue::NULL);

                        let columns_config = renderer
                            .all_columns_configs_materialized(&view_config_snapshot, &session)
                            .await;

                        plugin.restore(&plugin_update, Some(&columns_config))?;
                        if committed.columns_config_changed {
                            renderer.columns_config_changed.emit(columns_config);
                        }

                        if committed.plugin_config_changed {
                            renderer.plugin_config_changed.emit(plugin_config);
                        }
                    }

                    changed
                },
                None => false,
            };

            if spec
                .presentation
                .as_ref()
                .map(|p| p.is_visible())
                .unwrap_or(true)
            {
                dispatch_bound(&guard, &renderer, disposition, changed, spec.origin).await?;
            }

            session.set_rendered(true);
            Ok(())
        }
    }
}

/// [`locked_run`]'s host-internal tail: a failed RUN sets error state (with
/// the reset-reconnect affordance); the committed config is NOT rolled back
/// (I4). Cancellation by a superseding run ("View already deleted") is not
/// a failure.
pub(super) async fn render_run(
    session: Session,
    renderer: Renderer,
    commit: RunCommit,
) -> ApiResult<()> {
    let spec = RunSpec {
        commit,
        ..RunSpec::default()
    };

    match locked_run(&session, &renderer, spec)
        .await
        .ignore_view_delete()
    {
        Err(e) => session.set_run_error(e).await,
        Ok(_) => Ok(()),
    }
}

pub async fn activation_render(session: Session, renderer: Renderer) -> ApiResult<()> {
    let result = {
        clone!(session, renderer);
        renderer
            .clone()
            .render_task(|guard| async move {
                match session.get_view() {
                    Some(view) => {
                        let _pin = renderer
                            .cached_context()
                            .map(|ctx| renderer.pin_context(&guard, ctx));
                        if renderer.take_data_stale() {
                            renderer.update_bound(&guard, &view).await
                        } else {
                            renderer.activation_repaint(&guard).await
                        }
                    },
                    None => Ok(()),
                }
            })
            .await
    };

    result.ignore_view_delete().map(|_| ())
}

/// Create a [`Callback`] that resizes from the current `View` and `Plugin`,
/// or runs a full render when the plugin has never drawn.
pub fn resize_callback(session: &Session, renderer: &Renderer) -> Callback<()> {
    clone!(session, renderer);
    Callback::from(move |_| {
        clone!(renderer, session);
        crate::utils::spawn_owned("resize-callback", async move {
            if !renderer.is_plugin_activated()? {
                just_render(&session, &renderer)?.await
            } else {
                renderer.resize().await
            }
        });
    })
}
