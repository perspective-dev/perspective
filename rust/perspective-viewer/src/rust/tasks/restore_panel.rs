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

use perspective_client::clone;
use perspective_client::utils::PerspectiveResultExt;

use crate::config::*;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::{BindPlan, MissingTable, OpCtx, OpKind, Session, probe_table};
use crate::tasks::transactional_restore::{Outcome, commit_and_render, prepare};
use crate::tasks::*;
use crate::workspace::{PanelId, Workspace};
use crate::*;

/// How a [`restore_panel`] call reached the pipeline — the only two genuine
/// forks between updating a live panel and materializing a freshly-created one.
pub(crate) enum RestoreMode {
    Existing { active: bool },
    Fresh,
}

/// Where the error of a restore that COMMITTED and then failed to render goes.
#[derive(Clone, Copy)]
pub(crate) enum RestoreErrors {
    // Raise errors in the UI.
    Publish,

    // Report only in the API.
    Suppress,
}

/// The client to bind and the opened `Table`, or `None` when pending.
type Probed = (
    perspective_client::Client,
    Option<perspective_client::Table>,
);

/// Resolve and probe the client hosting `name` without touching the
/// session's own binding.
async fn probe(
    session: &Session,
    workspace: &Workspace,
    name: &str,
    missing: MissingTable,
) -> ApiResult<Probed> {
    let current = session.get_client();
    let resolved = workspace
        .resolve_client_for_table(name, current.as_ref())
        .await;

    let client = resolved.or(current).into_apierror()?;
    let table = probe_table(&client, name, missing).await?;
    Ok((client, table))
}

/// What a restore naming `table` does to the panel's binding.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Rebind {
    /// A caller's restore: a table that REPLACES what the panel showed (or
    /// recovers an errored panel) starts from a default config.
    Replace,

    /// The table lifecycle completing a pending bind: the committed config is
    /// the intent the bind exists to honor.
    Complete,
}

/// Decide a restore's [`BindPlan`], probing the incoming table — without
/// touching the session's own binding.
#[allow(clippy::too_many_arguments)]
async fn plan_binding(
    ctx: &OpCtx,
    session: &Session,
    renderer: &Renderer,
    workspace: &Workspace,
    table: &TableUpdate,
    fresh: bool,
    rebind: Rebind,
    missing: MissingTable,
) -> ApiResult<Option<BindPlan>> {
    let OptionalUpdate::Update(name) = table else {
        return Ok(Some(BindPlan::Keep));
    };

    let same = session
        .get_table()
        .is_some_and(|t| t.get_name() == name.as_str());

    if same && !session.is_errored() && renderer.failure().is_none() {
        return Ok(Some(BindPlan::Keep));
    }

    let (client, table) = probe(session, workspace, name, missing).await?;
    if !fresh && ctx.is_superseded() {
        return Ok(None);
    }

    if table.is_none()
        && rebind == Rebind::Complete
        && session.pending_table().as_deref() == Some(name.as_str())
    {
        return Ok(None);
    }

    let reset = !fresh && rebind == Rebind::Replace;
    Ok(Some(match table {
        Some(table) => BindPlan::Bind {
            client,
            table: Box::new(table),
            reset,
        },
        None => BindPlan::Pend {
            client,
            name: name.clone(),
            reset,
        },
    }))
}

/// Apply a [`ViewerConfigUpdate`] to a single panel and re-draw — the one
/// pipeline shared by `restorePanel` (an existing panel), `restoreWorkspace`,
/// and `addPanel` (both fresh panels).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn restore_panel(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    workspace: &Workspace,
    mode: RestoreMode,
    update: ViewerConfigUpdate,
    errors: RestoreErrors,
    missing: MissingTable,
    preamble: Option<futures::future::LocalBoxFuture<'static, ApiResult<()>>>,
) -> ApiResult<()> {
    let update = Rc::new(update);
    let kind = OpKind::Restore {
        update: (!matches!(mode, RestoreMode::Fresh)).then(|| update.clone()),
    };

    let ticket = session.submit(kind, {
        clone!(session, renderer, presentation, workspace);
        move |ctx| {
            Box::pin(async move {
                if let Some(preamble) = preamble {
                    preamble.await?;
                }

                restore_panel_step(
                    &ctx,
                    &session,
                    &renderer,
                    &presentation,
                    &workspace,
                    mode,
                    Rebind::Replace,
                    RunOrigin::Public,
                    Rc::unwrap_or_clone(update),
                    errors,
                    missing,
                )
                .await?;

                Ok(None)
            })
        }
    });

    ticket.settle().await
}

/// The body of [`restore_panel`], to be called only from a running op's step.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn restore_panel_step(
    ctx: &OpCtx,
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    workspace: &Workspace,
    mode: RestoreMode,
    rebind: Rebind,
    origin: RunOrigin,
    update: ViewerConfigUpdate,
    errors: RestoreErrors,
    missing: MissingTable,
) -> ApiResult<()> {
    let active = matches!(mode, RestoreMode::Existing { active: true });
    let fresh = matches!(mode, RestoreMode::Fresh);

    renderer.check_plugin_update(&update.plugin)?;
    let Some(plan) = plan_binding(
        ctx,
        session,
        renderer,
        workspace,
        &update.table,
        fresh,
        rebind,
        missing,
    )
    .await?
    else {
        return Ok(());
    };

    if !fresh {
        tracing::info!("Restoring {update}");
    }

    let overlay = renderer
        .slot_name()
        .map(|id| overlay_for(workspace, &PanelId::from(id)));

    let prepared = prepare(
        session,
        renderer,
        presentation,
        active,
        plan,
        overlay,
        update,
    )
    .await?;
    let Outcome { committed, result } =
        commit_and_render(session, renderer, presentation, origin, prepared).await;

    if let Err(e) = &result
        && committed
        && matches!(errors, RestoreErrors::Publish)
    {
        let _ = renderer.fail(e.clone());
    }

    result?;
    if fresh {
        renderer.resize().await.unwrap_or_log();
    }

    Ok(())
}
