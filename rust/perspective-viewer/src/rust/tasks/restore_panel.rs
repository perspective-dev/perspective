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

use perspective_client::clone;
use perspective_client::utils::PerspectiveResultExt;

use crate::config::*;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::{
    LoadGuard, MissingTable, ResetOptions, Session, TableIntermediateState, probe_table,
};
use crate::tasks::*;
use crate::workspace::Workspace;
use crate::*;

/// How a [`restore_panel`] call reached the pipeline — the only two genuine
/// forks between updating a live panel and materializing a freshly-created one.
pub(crate) enum RestoreMode {
    Existing { active: bool },
    Fresh,
}

/// Where a failed restore's error goes.
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

/// Bind an unbound or same-named session to `name`.
pub(crate) async fn bind_table_task(
    session: &Session,
    workspace: &Workspace,
    name: String,
    missing: MissingTable,
) -> ApiResult<()> {
    if session
        .get_table()
        .is_some_and(|t| t.get_name() == name.as_str())
    {
        return Ok(());
    }

    let (client, table) = probe(session, workspace, &name, missing).await?;
    session.set_client(client);
    match table {
        Some(table) => session.bind_table(table).await?,
        None => session.pend_table(name).await?,
    }

    session.commit_table_defaults();
    Ok(())
}

/// Rebind a session to `name`, probing the incoming table before the
/// outgoing binding is dropped and replaying `load`'s journal over the
/// incoming table's defaults.
async fn rebind_table_task(
    session: &Session,
    renderer: &Renderer,
    workspace: &Workspace,
    name: String,
    missing: MissingTable,
    load: &LoadGuard,
) -> ApiResult<()> {
    let probed = probe(session, workspace, &name, missing).await;
    let journal = load.claim();
    let (client, table) = probed?;
    let Some(journal) = journal else {
        return Ok(());
    };

    session
        .reset(ResetOptions {
            config: true,
            expressions: true,
            stats: true,
            table: Some(TableIntermediateState::Reloaded),
        })
        .await?;

    session.set_client(client);
    match table {
        Some(table) => session.bind_table(table).await?,
        None => session.pend_table(name).await?,
    }

    session.commit_table_defaults();
    for delta in journal {
        session.commit_view_config(delta)?;
    }

    session.commit_table_defaults();
    if session.get_table().is_none()
        && let Some(plugin) = renderer.active_plugin()
    {
        plugin.clear().await?;
    }

    Ok(())
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
    mut update: ViewerConfigUpdate,
    errors: RestoreErrors,
    missing: MissingTable,
) -> ApiResult<()> {
    let active = matches!(mode, RestoreMode::Existing { active: true });
    let fresh = matches!(mode, RestoreMode::Fresh);
    match &update.theme {
        OptionalUpdate::Update(theme) => renderer.set_theme_stamped(Some(theme.clone())),
        // `SetDefault` resolves to a CONCRETE registry default here, rather
        // than clearing the panel's theme — nothing downstream re-resolves.
        OptionalUpdate::SetDefault => {
            renderer.set_theme_stamped(presentation.get_default_theme_name().await)
        },
        OptionalUpdate::Missing => {},
    }

    if !active {
        update.theme = OptionalUpdate::Missing;
    }

    if !fresh {
        tracing::info!("Restoring {update}");
    }

    // NOTE: `update.settings` is deliberately NOT applied here. It is
    // element-level chrome rather than panel state, so `restore()` — the
    // only caller that can carry it — applies it before dispatching, and
    // this pipeline stays per-panel. Applying it here reached only the
    // `Existing { active: true }` mode, which is why a freshly created
    // panel silently ignored it.

    // Under `Suppress` the restore is TRANSACTIONAL, so snapshot the config
    // it is about to overwrite — see the failure tail below for why.
    let rollback =
        matches!(errors, RestoreErrors::Suppress).then(|| session.get_view_config().clone());

    let binding_before = (
        session.get_table().map(|t| t.get_name().to_owned()),
        session.pending_table(),
    );

    let load = match &update.table {
        OptionalUpdate::Update(name)
            if session.is_errored()
                || (!fresh
                    && session
                        .get_table()
                        .map(|t| t.get_name() != name.as_str())
                        .unwrap_or(true)) =>
        {
            Some(session.begin_pending_load())
        },
        _ => None,
    };

    let result = restore_and_render(
        session,
        renderer,
        presentation,
        RunOrigin::Public,
        update.clone(),
        {
            clone!(session, renderer, update.table, workspace, load);
            async move {
                let OptionalUpdate::Update(name) = table else {
                    return Ok(());
                };

                match &load {
                    Some(load) => {
                        rebind_table_task(&session, &renderer, &workspace, name, missing, load)
                            .await
                    },
                    None => bind_table_task(&session, &workspace, name, missing).await,
                }
            }
        },
    )
    .await;

    if let Some(load) = &load {
        load.close();
    }

    if let Err(e) = &result {
        match errors {
            RestoreErrors::Publish => session.set_error(false, e.clone()).await?,
            RestoreErrors::Suppress => {
                let binding_after = (
                    session.get_table().map(|t| t.get_name().to_owned()),
                    session.pending_table(),
                );

                if let Some(config) = rollback
                    && binding_after == binding_before
                {
                    session.commit_view_config(config.into()).unwrap_or_log();
                }
            },
        }
    }

    result?;

    if fresh {
        renderer.resize().await.unwrap_or_log();
    }

    Ok(())
}
