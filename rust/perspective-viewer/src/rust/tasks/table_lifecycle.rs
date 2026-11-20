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

use perspective_client::utils::PerspectiveResultExt;
use perspective_client::{Client, ClientError, Connection, clone};
use perspective_js::utils::{ApiFuture, ApiResult, LocalPollLoop};
use wasm_bindgen::JsValue;

use super::pipeline::RunOrigin;
use super::restore_panel::{Rebind, RestoreErrors, RestoreMode, restore_panel_step};
use crate::config::{OptionalUpdate, ViewerConfigUpdate};
use crate::presentation::Presentation;
use crate::utils::{AddListener, Subscription};
use crate::workspace::{Panel, Workspace};

/// Wire the table lifecycle for an element: every registered [`Client`] is
/// watched for connection loss and has its hosted-tables updates subscribed to
/// [`sweep_client`].
pub(crate) fn wire_table_lifecycle(
    workspace: &Workspace,
    presentation: &Presentation,
) -> Subscription {
    workspace.client_registered().add_listener({
        clone!(workspace, presentation);
        move |client: Client| {
            clone!(workspace, presentation);
            ApiFuture::spawn(async move {
                watch_client(&workspace, &client).await?;
                subscribe_client(&workspace, &presentation, &client).await
            })
        }
    })
}

/// Mark every panel bound to `client` lost whenever its connection is.
async fn watch_client(workspace: &Workspace, client: &Client) -> ApiResult<()> {
    let poll_loop = LocalPollLoop::new({
        clone!(workspace, client);
        move |()| {
            mark_client_lost(&workspace, &client);
            Ok(JsValue::UNDEFINED)
        }
    });

    client
        .on_error(Box::new(move |_: ClientError, _| {
            let poll_loop = poll_loop.clone();
            async move {
                poll_loop.poll(()).await;
                Ok(())
            }
        }))
        .await?;

    if !client.connection().is_open() {
        mark_client_lost(workspace, client);
    }

    Ok(())
}

/// Record `client`'s lost connection on each panel bound to one of its
/// `Table`s and announce the change.
fn mark_client_lost(workspace: &Workspace, client: &Client) {
    if let Connection::Lost { error, .. } = client.connection() {
        workspace.record_client_loss(client, error);
    }

    for id in workspace.panels_for_client(client.get_name()) {
        if let Some(panel) = workspace.panel(&id)
            && panel.session.get_table().is_some()
        {
            panel.session.mark_lost(client);
        }
    }

    workspace.client_state_changed().emit(());
}

/// Subscribe `client`'s hosted-tables updates to [`sweep_client`], replacing
/// any earlier subscription, then sweep once.
pub(crate) async fn subscribe_client(
    workspace: &Workspace,
    presentation: &Presentation,
    client: &Client,
) -> ApiResult<()> {
    let poll_loop = LocalPollLoop::new({
        clone!(workspace, presentation, client);
        move |()| {
            clone!(workspace, presentation, client);
            ApiFuture::spawn(async move { sweep_client(&workspace, &presentation, &client).await });

            Ok(JsValue::UNDEFINED)
        }
    });

    let subscribed = client
        .on_hosted_tables_update(move || {
            let poll_loop = poll_loop.clone();
            async move {
                poll_loop.poll(()).await;
            }
        })
        .await;

    match subscribed {
        Ok(id) => workspace.set_table_sub(client.clone(), id),
        Err(_) => {
            workspace.list_tables(client).await;
            workspace.client_state_changed().emit(());
        },
    }

    subscribed?;
    sweep_client(workspace, presentation, client).await
}

/// Refresh the hosted-table listing of every open [`Client`], each
/// independently of the others.
pub(crate) fn refresh_listings(workspace: &Workspace) {
    for client in workspace.open_clients() {
        clone!(workspace);
        ApiFuture::spawn(async move {
            workspace.list_tables(&client).await;
            Ok(())
        });
    }
}

/// Reconcile the panels bound to `client` against its hosted set, then
/// complete every pending bind.
pub(crate) async fn sweep_client(
    workspace: &Workspace,
    presentation: &Presentation,
    client: &Client,
) -> ApiResult<()> {
    if let Err(err) = super::resume_derived(workspace).await {
        tracing::warn!("Failed to resume derived tables: {err}");
    }

    if let Some(hosted) = workspace.list_tables(client).await {
        for id in workspace.panels_for_client(client.get_name()) {
            if let Some(panel) = workspace.panel(&id)
                && let Some(name) = panel.session.get_table().map(|t| t.get_name().to_owned())
                && !hosted.iter().any(|n| n == &name)
            {
                suspend_panel(&panel).await.unwrap_or_log();
            }
        }
    }

    for panel in workspace.panels() {
        if panel.session.pending_table().is_some() {
            bind_pending(&panel, workspace, presentation)
                .await
                .unwrap_or_log();
        }
    }

    workspace.hosted_tables_changed().emit(());
    Ok(())
}

/// Suspend one panel's binding under its draw lock (see
/// [`Session::suspend_table`]) and blank its display. The suspend re-derives
/// the bound name inside the lock — a panel that rebound or ejected since the
/// sweep's observation suspends its CURRENT state or no-ops.
async fn suspend_panel(panel: &Panel) -> ApiResult<()> {
    clone!(panel.session, panel.renderer);
    let ticket = panel.session.submit(
        crate::session::OpKind::Restore { update: None },
        move |_ctx| {
            Box::pin(async move {
                renderer
                    .clone()
                    .render_task(|_guard| async move {
                        if let Some(reset) = session.suspend_table() {
                            reset.await?;
                            if let Some(plugin) = renderer.active_plugin() {
                                plugin.clear().await?;
                            }
                        }

                        Ok(())
                    })
                    .await?;

                Ok(None)
            })
        },
    );

    ticket.settle().await
}

/// Complete a PENDING panel's bind, as the restore it is: the pending name
/// re-derived inside the op (capture-free), the client federated exactly as a
/// `restore` would, and the config and buckets committed as INTENT while the
/// table was away validated against the table that arrived.
async fn bind_pending(
    panel: &Panel,
    workspace: &Workspace,
    presentation: &Presentation,
) -> ApiResult<()> {
    clone!(panel.session, panel.renderer, workspace, presentation);
    let ticket = panel.session.submit(
        crate::session::OpKind::Restore { update: None },
        move |ctx| {
            Box::pin(async move {
                let Some(name) = session.pending_table() else {
                    return Ok(None);
                };

                let update = ViewerConfigUpdate {
                    table: OptionalUpdate::Update(name.into()),
                    plugin_config: OptionalUpdate::Update(renderer.committed_plugin_config()),
                    columns_config: OptionalUpdate::Update(renderer.committed_columns_configs()),
                    ..ViewerConfigUpdate::default()
                };

                let result = restore_panel_step(
                    &ctx,
                    &session,
                    &renderer,
                    &presentation,
                    &workspace,
                    RestoreMode::Existing { active: false },
                    Rebind::Complete,
                    RunOrigin::Internal,
                    update,
                    RestoreErrors::Publish,
                    crate::session::MissingTable::Pend,
                )
                .await;

                if let Err(e) = &result
                    && session.pending_table().is_some()
                {
                    let _ = renderer.fail(e.clone());
                }

                result?;
                Ok(None)
            })
        },
    );

    ticket.settle().await
}
