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

use futures::future::LocalBoxFuture;
use perspective_client::config::ViewConfigUpdate;
use perspective_client::{View, clone};
use perspective_js::utils::*;
use wasm_bindgen::JsValue;
use yew::prelude::*;

use crate::config::{ColumnConfigUpdate, PluginConfigUpdate};
use crate::presentation::Presentation;
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
    // A `load()` is mid-classification (see [`Session::pending_load`]): DEFER
    // rather than bind the incoming config against the still-bound outgoing
    // table. Holds the last painted frame; the `load()` run performs the one
    // reconciling bind once its payload resolves — the single visible
    // transition, correct in whichever future (Table/Client) materializes.
    if session.has_pending_load() {
        return Ok((BindDisposition::Deferred, None));
    }

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

/// Everything that varies between locked render runs, consumed by
/// [`locked_run`] — the ONE lock-body composition. `Default` is the
/// host-internal UI-commit run: `Internal` origin, no plugin swap, no
/// pre-bind task, no bucket updates, no dispatch visibility gate.
pub(crate) struct RunSpec {
    /// Who initiated this run (see [`RunOrigin`]).
    pub origin: RunOrigin,

    /// A plugin swap resolved by [`Renderer::resolve_plugin_update`],
    /// committed inside the run atomically with the rebind.
    pub plugin_idx: Option<usize>,

    /// Plugin-level bucket update, applied inside the run after the bind
    /// (so strip-on-write sees fresh schemas).
    pub plugin_config: PluginConfigUpdate,

    /// Per-column bucket update; same timing as `plugin_config`.
    pub columns_config: ColumnConfigUpdate,

    /// Pre-bind hook awaited inside the lock (table binding, resets) —
    /// BEFORE the error guard, so a task that recovers the session (e.g.
    /// `restorePanel`'s errored-recovery reset) unblocks its own run.
    pub task: Option<LocalBoxFuture<'static, ApiResult<()>>>,

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
            plugin_idx: None,
            plugin_config: PluginConfigUpdate::Missing,
            columns_config: ColumnConfigUpdate::Missing,
            task: None,
            presentation: None,
        }
    }
}

/// One locked, witnessed, snapshot-consuming render run — the SINGLE lock
/// body shared by every config-driven run (`apply_and_render` &co. via
/// [`render_run`]'s tail, the `restore` family via
/// [`super::restore_and_render`]): eager mount → pre-bind `task` →
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
        .render_task(|guard| async move {
            renderer.mount_active_plugin()?;
            if let Some(task) = spec.task {
                task.await?;
            }

            let plugin_swapped = renderer.commit_plugin(spec.plugin_idx)?;
            let plugin = renderer.active_plugin().ok_or("No Plugin")?;
            renderer.stamp_theme(Some(&plugin));
            if let Some(error) = session.get_error() {
                return match spec.origin {
                    RunOrigin::Public => Err(error),
                    RunOrigin::Internal => Ok(()),
                };
            }

            let (disposition, _pin) = if session.get_table().is_some() {
                bind_snapshot(&guard, &session, &renderer).await?
            } else {
                (BindDisposition::Deferred, None)
            };

            let view_config_snapshot = session.get_view_config().clone();
            let plugin_config_changed =
                renderer.update_plugin_config(&view_config_snapshot, spec.plugin_config)?;
            let plugin_config_snapshot = renderer.get_plugin_config();
            let plugin_update =
                JsValue::from_serde_ext(&plugin_config_snapshot).unwrap_or(JsValue::NULL);

            let plugin_restored = plugin_config_changed || plugin_swapped;
            if plugin_restored {
                let columns_config = renderer
                    .all_columns_configs_materialized(&view_config_snapshot, &session)
                    .await;
                plugin.restore(&plugin_update, Some(&columns_config))?;
            }

            let columns_config_changed = renderer.update_columns_configs(
                &view_config_snapshot,
                &session,
                spec.columns_config,
            )?;

            let changed = plugin_config_changed || columns_config_changed;
            if columns_config_changed {
                let columns_config = renderer
                    .all_columns_configs_materialized(&view_config_snapshot, &session)
                    .await;
                plugin.restore(&plugin_update, Some(&columns_config))?;
                renderer.columns_config_changed.emit(columns_config);
            }

            if plugin_config_changed {
                renderer.plugin_config_changed.emit(plugin_config_snapshot);
            }

            if spec
                .presentation
                .as_ref()
                .map(|p| p.is_visible())
                .unwrap_or(true)
            {
                dispatch_bound(&guard, &renderer, disposition, changed, spec.origin).await?;
            }

            Ok(())
        })
        .await
}

/// [`locked_run`]'s host-internal tail: a failed RUN sets error state (with
/// the reset-reconnect affordance); the committed config is NOT rolled back
/// (I4). Cancellation by a superseding run ("View already deleted") is not
/// a failure.
async fn render_run(
    session: Session,
    renderer: Renderer,
    plugin_idx: Option<usize>,
) -> ApiResult<()> {
    let spec = RunSpec {
        plugin_idx,
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
