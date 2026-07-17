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

use perspective_client::config::ViewConfigUpdate;

use super::apply_and_render;
use crate::session::Session;
use crate::utils::spawn_owned;
use crate::workspace::{PanelId, Workspace};

/// Stamp `session`'s transient global-filter overlay from the
/// [`Workspace`]'s current set — EMPTY for master (filter-source) panels,
/// the full set for details. Master immunity is enforced here and only
/// here. Returns whether the overlay changed.
///
/// Synchronous, so panel-creation paths can stamp BEFORE the panel's first
/// locked bind — the initial render then picks the overlay up via its
/// `ConfigSnapshot.effective`, with no second render and no unfiltered
/// first paint.
pub fn stamp_global_overlay(workspace: &Workspace, id: &PanelId, session: &Session) -> bool {
    let filters = if workspace.is_master(id) {
        Vec::new()
    } else {
        workspace.global_filters()
    };

    session.set_global_filter(filters)
}

/// Re-stamp every panel's overlay and re-render those whose overlay CHANGED
/// (details are usually non-active, so they need an explicit re-render
/// rather than relying on a subscription; unchanged panels aren't touched
/// at all).
pub fn apply_global_filters(workspace: &Workspace) {
    for pid in workspace.panel_ids() {
        if let Some(panel) = workspace.panel(&pid)
            && stamp_global_overlay(workspace, &pid, &panel.session)
        {
            let session = panel.session.clone();
            let renderer = panel.renderer.clone();
            spawn_owned("apply-global-filters", async move {
                apply_and_render(&session, &renderer, ViewConfigUpdate::default())?.await?;
                Ok(())
            });
        }
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
