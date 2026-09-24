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
use perspective_js::utils::ApiFuture;

use super::pipeline::{RunCommit, render_run};
use super::transactional_restore::{commit_edit, prepare_overlay};
use crate::session::{OpKind, OverlayClause, StepOutcome};
use crate::utils::spawn_owned;
use crate::workspace::{Panel, PanelId, Workspace};

/// The element's global filter as broadcast to panel `id` — EMPTY for master
/// (filter-source) panels, the full set for details.
pub(crate) fn overlay_for(workspace: &Workspace, id: &PanelId) -> Rc<Vec<OverlayClause>> {
    Rc::new(if workspace.is_master(id) {
        Vec::new()
    } else {
        workspace.overlay()
    })
}

/// Broadcast the [`Workspace`]'s current global filter to one panel, as an op
/// on ITS queue: the overlay is panel state, committed with the description of
/// the config it yields, like any other write.
pub fn broadcast_overlay(workspace: &Workspace, panel: &Panel) -> ApiFuture<()> {
    let overlay = overlay_for(workspace, &panel.id);
    clone!(panel.session, panel.renderer);
    let ticket = panel.session.submit(OpKind::Overlay, move |_ctx| {
        Box::pin(async move {
            if *session.committed_overlay() == *overlay {
                return Ok(StepOutcome::Done);
            }

            let bound = session.get_table().is_some();
            let prepared = prepare_overlay(&session, &renderer, overlay).await?;
            let committed = commit_edit(&session, &renderer, prepared);
            Ok(if bound {
                StepOutcome::Render(Box::pin(render_run(
                    session,
                    renderer,
                    RunCommit::Done(committed),
                )))
            } else {
                StepOutcome::Done
            })
        })
    });

    ApiFuture::new(ticket.settle())
}

/// Broadcast the global filter to every panel; panels whose overlay is
/// unchanged aren't touched at all.
pub fn apply_global_filters(workspace: &Workspace) {
    for panel in workspace.panels() {
        let effect = workspace.effects().guard();
        let task = broadcast_overlay(workspace, &panel);
        spawn_owned("apply-global-filters", async move {
            let _effect = effect;
            task.await
        });
    }
}

/// Clear the ORIGINATING master panels' visible selection state (row
/// highlights, pinned tooltips) after their contributed clauses are removed
/// from the `GlobalFilterBar` (chip × / "Clear") — a selection visual must
/// not outlive the filter it produced. The plugin's OPTIONAL `deselect()` is
/// SILENT (no selection events), so no `MasterSelect` echo can re-mutate the
/// filter set; plugins without one (e.g. `Debug`) no-op. Each call runs
/// under its panel's draw lock — implementations may redraw (see the
/// call-discipline contract on `js/plugin.rs`). A closed panel's id is
/// skipped.
pub fn clear_master_selections(workspace: &Workspace, origins: Vec<PanelId>) {
    for id in origins {
        if let Some(panel) = workspace.panel(&id) {
            let renderer = panel.renderer.clone();
            spawn_owned("clear-master-selection", async move {
                let r = renderer.clone();
                renderer
                    .render_task(|_guard| async move {
                        // Pure query: a never-drawn panel has no plugin and
                        // no selection to clear.
                        if let Some(plugin) = r.active_plugin() {
                            plugin.deselect().await?;
                        }

                        Ok(())
                    })
                    .await
            });
        }
    }
}
