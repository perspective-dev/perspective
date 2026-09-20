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

use std::collections::BTreeSet;

use perspective_client::clone;
use perspective_client::utils::PerspectiveResultExt;

use crate::config::*;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::{
    BindPlan, MissingTable, OpCtx, OpKind, Session, StepOutcome, probe_table, view_fields,
};
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
async fn plan_binding(
    ctx: &OpCtx,
    session: &Session,
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

    if same && !session.is_errored() {
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

/// The top-level config keys `update` OVERWRITES, or `None` when it cannot be
/// superseded: `plugin_config` / `columns_config` updates MERGE into their
/// buckets, and a fresh panel's restore is what creates it.
fn restore_fields(
    update: &ViewerConfigUpdate,
    mode: &RestoreMode,
) -> Option<BTreeSet<&'static str>> {
    let ViewerConfigUpdate {
        version,
        plugin,
        plugin_config,
        columns_config,
        settings,
        theme,
        title,
        table,
        view_config,
    } = update;

    let _ = version;
    if matches!(mode, RestoreMode::Fresh)
        || matches!(plugin_config, OptionalUpdate::Update(_))
        || matches!(columns_config, OptionalUpdate::Update(_))
    {
        return None;
    }

    let mut fields = view_fields(view_config);
    let mut set = |name: &'static str, present: bool| {
        if present {
            fields.insert(name);
        }
    };

    set("plugin", !matches!(plugin, OptionalUpdate::Missing));
    set(
        "plugin_config",
        !matches!(plugin_config, OptionalUpdate::Missing),
    );
    set(
        "columns_config",
        !matches!(columns_config, OptionalUpdate::Missing),
    );
    set("settings", !matches!(settings, OptionalUpdate::Missing));
    set("theme", !matches!(theme, OptionalUpdate::Missing));
    set("title", !matches!(title, OptionalUpdate::Missing));
    set("table", !matches!(table, OptionalUpdate::Missing));
    Some(fields)
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
    let fields = restore_fields(&update, &mode);
    let ticket = session.submit(OpKind::Restore { fields }, {
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
                    update,
                    errors,
                    missing,
                )
                .await?;

                Ok(StepOutcome::Done)
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
        let _ = session.set_run_error(e.clone()).await;
    }

    result?;
    if fresh {
        renderer.resize().await.unwrap_or_log();
    }

    Ok(())
}
