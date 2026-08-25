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
use crate::session::{ResetOptions, Session};
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

pub(crate) async fn bind_table_task(
    session: &Session,
    workspace: &Workspace,
    name: String,
) -> ApiResult<()> {
    let current = session.get_client();
    if let Some(client) = workspace
        .resolve_client_for_table(&name, current.as_ref())
        .await
    {
        session.set_client(client);
    }

    session.set_table(name).await?;
    session.commit_table_defaults();
    Ok(())
}

/// Apply a [`ViewerConfigUpdate`] to a single panel and re-draw — the one
/// pipeline shared by `restorePanel` (an existing panel), `restoreWorkspace`,
/// and `addPanel` (both fresh panels).
pub(crate) async fn restore_panel(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    workspace: &Workspace,
    mode: RestoreMode,
    mut update: ViewerConfigUpdate,
    errors: RestoreErrors,
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

    let table_changed = !fresh
        && matches!(&update.table, OptionalUpdate::Update(name)
            if session.get_table().map(|t| t.get_name() != name.as_str()).unwrap_or(true));

    let errored_recovery =
        session.is_errored() && matches!(&update.table, OptionalUpdate::Update(_));

    let reset = (table_changed || errored_recovery).then(|| {
        session.reset(ResetOptions {
            config: true,
            expressions: true,
            stats: true,
            ..ResetOptions::default()
        })
    });

    let result = restore_and_render(
        session,
        renderer,
        presentation,
        RunOrigin::Public,
        update.clone(),
        {
            clone!(session, update.table, workspace);
            async move {
                if let OptionalUpdate::Update(name) = table {
                    if let Some(reset) = reset {
                        reset.await?;
                    }

                    bind_table_task(&session, &workspace, name).await?;
                }

                Ok(())
            }
        },
    )
    .await;

    if let Err(e) = &result {
        match errors {
            RestoreErrors::Publish => session.set_error(false, e.clone()).await?,
            RestoreErrors::Suppress => {
                if let Some(config) = rollback {
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
