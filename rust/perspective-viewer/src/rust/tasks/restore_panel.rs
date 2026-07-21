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

use futures::channel::oneshot::channel;
use perspective_client::clone;
use perspective_client::utils::PerspectiveResultExt;

use crate::components::viewer::{PerspectiveViewer, PerspectiveViewerMsg};
use crate::config::*;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::root::Root;
use crate::session::{ResetOptions, Session};
use crate::tasks::*;
use crate::*;

/// How a [`restore_panel`] call reached the pipeline — the only two genuine
/// forks between updating a live panel and materializing a freshly-created one.
pub(crate) enum RestoreMode {
    Existing { active: bool },
    Fresh,
}

/// Apply a [`ViewerConfigUpdate`] to a single panel and re-draw — the one
/// pipeline shared by `restorePanel` (an existing panel), whole-element
/// `restoreWorkspace`, and `addPanel` (both fresh panels).
pub(crate) async fn restore_panel(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    root: Option<&Root<PerspectiveViewer>>,
    mode: RestoreMode,
    mut update: ViewerConfigUpdate,
) -> ApiResult<()> {
    let active = matches!(mode, RestoreMode::Existing { active: true });
    let fresh = matches!(mode, RestoreMode::Fresh);
    match &update.theme {
        OptionalUpdate::Update(theme) => {
            renderer.set_theme(Some(theme.clone()));
            renderer.stamp_theme(None);
        },
        OptionalUpdate::SetDefault => {
            renderer.set_theme(None);
            if renderer.default_theme().is_some() {
                renderer.stamp_theme(None);
            }
        },
        OptionalUpdate::Missing => {},
    }

    if !active {
        update.theme = OptionalUpdate::Missing;
    }

    if !fresh {
        tracing::info!("Restoring {update}");
    }

    let (sender, receiver) = channel::<()>();
    match (active, root) {
        (true, Some(root)) => {
            root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::ToggleSettingsComplete(update.settings.clone(), sender),
            );
        },
        _ => {
            let _ = sender.send(());
        },
    }

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
            clone!(session, update.table);
            async move {
                if let OptionalUpdate::Update(name) = table {
                    if let Some(reset) = reset {
                        reset.await?;
                    }

                    session.set_table(name).await?;
                    session.commit_table_defaults();
                }

                receiver.await.unwrap_or_log();
                Ok(())
            }
        },
    )
    .await;

    if let Err(e) = &result {
        session.set_error(false, e.clone()).await?;
    }

    result?;

    if fresh {
        renderer.resize().await.unwrap_or_log();
    } else if renderer.needs_restyle() {
        renderer.restyle_all().await?;
    }

    Ok(())
}
