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

use futures::future::join_all;
use perspective_client::Connection;
use perspective_client::config::ViewConfigUpdate;
use perspective_js::utils::*;

use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::tasks::{apply_and_render, subscribe_client};
use crate::workspace::{Panel, PanelId, Workspace};

/// Recover a panel from an error state and redraw it.
pub async fn recover_panel(session: &Session, renderer: &Renderer) -> ApiResult<()> {
    if renderer.failure().is_some() {
        session.reset_failed_config().await?;
    }

    session.reconnect().await?;
    apply_and_render(session, renderer, ViewConfigUpdate::default())?.await?;
    Ok(())
}

fn is_errored(panel: &Panel) -> bool {
    panel.session.error_state().is_some() || panel.renderer.failure().is_some()
}

/// Recover every errored panel in `ids` concurrently, reporting the first
/// failure once all have finished.
async fn recover_panels(workspace: &Workspace, ids: Vec<PanelId>) -> ApiResult<()> {
    let panels = ids
        .iter()
        .filter_map(|id| workspace.panel(id))
        .filter(is_errored)
        .collect::<Vec<_>>();

    join_all(
        panels
            .iter()
            .map(|panel| recover_panel(&panel.session, &panel.renderer)),
    )
    .await
    .into_iter()
    .collect::<ApiResult<Vec<_>>>()?;

    Ok(())
}

/// Reconnect the `Client` named `name` if its connection is lost, re-subscribe
/// its hosted tables if the viewer saw that loss, then recover its panels,
/// recording a failure as that client's error.
pub async fn reconnect_client(
    workspace: &Workspace,
    presentation: &Presentation,
    name: &str,
) -> ApiResult<()> {
    let result = reconnect_step(workspace, presentation, name).await;
    workspace.set_client_failure(name, result.as_ref().err().cloned());
    result
}

async fn reconnect_step(
    workspace: &Workspace,
    presentation: &Presentation,
    name: &str,
) -> ApiResult<()> {
    let client = workspace.client(name).into_apierror()?;
    if let Connection::Lost { error, reconnect } = client.connection() {
        match reconnect {
            Some(reconnect) => reconnect().await?,
            None => return Err(error.into()),
        }
    }

    let subscribed = if workspace.client_loss(name).is_some() {
        workspace.clear_client_loss(&client);
        let subscribed = subscribe_client(workspace, presentation, &client).await;
        workspace.client_state_changed().emit(());
        subscribed
    } else {
        Ok(())
    };

    let recovered = recover_panels(workspace, workspace.panels_for_client(name)).await;
    subscribed.and(recovered)
}
