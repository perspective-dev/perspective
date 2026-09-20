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

use std::cell::RefCell;
use std::rc::Rc;

use perspective_client::utils::PerspectiveResultExt;
use perspective_client::{Client, clone};
use perspective_js::utils::{ApiFuture, ApiResult, LocalPollLoop};
use wasm_bindgen::JsValue;

use super::pipeline::RunOrigin;
use super::restore_panel::{Rebind, RestoreErrors, RestoreMode, restore_panel_step};
use crate::config::{OptionalUpdate, ViewerConfigUpdate};
use crate::presentation::Presentation;
use crate::utils::{AddListener, Subscription};
use crate::workspace::{Panel, Workspace};

/// The per-client hosted-tables-update subscriptions this element holds, for
/// removal at `delete()`.
pub(crate) type HostedTableSubs = Rc<RefCell<Vec<(Client, u32)>>>;

/// Wire reactive table binding for an element: subscribe every registered
/// [`Client`]'s hosted-tables updates (current and future registrations) to
/// [`sweep_table_bindings`]. Returns the registration listener (owned for the
/// element's lifetime) and the accumulated client subscriptions (removed at
/// element `delete()`).
pub(crate) fn wire_table_lifecycle(
    workspace: &Workspace,
    presentation: &Presentation,
) -> (Subscription, HostedTableSubs) {
    let subs: HostedTableSubs = Rc::default();
    let sub = workspace.client_registered().add_listener({
        clone!(workspace, presentation, subs);
        move |client: Client| {
            clone!(workspace, presentation, subs);
            ApiFuture::spawn(async move {
                let poll_loop = LocalPollLoop::new({
                    clone!(workspace, presentation);
                    move |()| {
                        clone!(workspace, presentation);
                        ApiFuture::spawn(async move {
                            sweep_table_bindings(&workspace, &presentation).await
                        });

                        Ok(JsValue::UNDEFINED)
                    }
                });

                let id = client
                    .on_hosted_tables_update(move || {
                        let poll_loop = poll_loop.clone();
                        async move {
                            poll_loop.poll(()).await;
                        }
                    })
                    .await?;

                subs.borrow_mut().push((client, id));

                // A table created between this client's registration and the
                // subscription above fired no callback — sweep NOW, after
                // subscribing, so no creation can be missed.
                sweep_table_bindings(&workspace, &presentation).await
            })
        }
    });

    (sub, subs)
}

/// One reconciliation pass over every panel's table binding vs. the loaded
/// clients' hosted sets: releases first (a delete and a re-create in the same
/// update settle as suspend-then-rebind), then completes pending binds.
/// Per-panel failures are logged, never aborting the sweep.
pub(crate) async fn sweep_table_bindings(
    workspace: &Workspace,
    presentation: &Presentation,
) -> ApiResult<()> {
    for panel in workspace.panels() {
        if let Some(name) = panel.session.get_table().map(|t| t.get_name().to_owned())
            && let Some(client) = panel.session.get_client()
            && let Ok(hosted) = client.get_hosted_table_names().await
            && !hosted.iter().any(|n| n == &name)
        {
            suspend_panel(&panel).await.unwrap_or_log();
        }
    }

    for panel in workspace.panels() {
        if panel.session.pending_table().is_some() {
            bind_pending(&panel, workspace, presentation)
                .await
                .unwrap_or_log();
        }
    }

    Ok(())
}

/// Suspend one panel's binding under its draw lock (see
/// [`Session::suspend_table`]) and blank its display. The suspend re-derives
/// the bound name inside the lock — a panel that rebound or ejected since the
/// sweep's observation suspends its CURRENT state or no-ops.
async fn suspend_panel(panel: &Panel) -> ApiResult<()> {
    clone!(panel.session, panel.renderer);
    let ticket = panel.session.submit(
        crate::session::OpKind::Restore { fields: None },
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

                Ok(crate::session::StepOutcome::Done)
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
        crate::session::OpKind::Restore { fields: None },
        move |ctx| {
            Box::pin(async move {
                let Some(name) = session.pending_table() else {
                    return Ok(crate::session::StepOutcome::Done);
                };

                let update = ViewerConfigUpdate {
                    table: OptionalUpdate::Update(name),
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
                    let _ = session.set_run_error(e.clone()).await;
                }

                result?;
                Ok(crate::session::StepOutcome::Done)
            })
        },
    );

    ticket.settle().await
}
