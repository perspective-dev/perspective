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

//! Master/detail cross-filtering handlers. The filter set itself is OWNED BY
//! THE [`Workspace`] model (fed by master-panel selections via the
//! `perspective-global-filter` listener in [`super::wiring`], surfaced as
//! chips in the `StatusBar`); these handlers mutate it and run the
//! [`apply_global_filters`] task. Re-renders flow through the workspace's
//! `filters_changed` PubSub → `UpdateGlobalFilters` snapshot refresh.
//!
//! [`Workspace`]: crate::workspace::Workspace

use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::MasterSelection;
use crate::tasks::*;
use crate::workspace::PanelId;

impl PerspectiveViewer {
    pub(super) fn on_toggle_master(&mut self, ctx: &Context<Self>, id: String) -> bool {
        let id = PanelId::from(id);
        let is_master = ctx.props().workspace.toggle_master(&id);
        // Drive the panel's plugin into (out of) a selection mode so a
        // master emits `perspective-global-filter` selections via the
        // plugin's built-in select mechanism. No-op for plugins without
        // an `edit_mode` (e.g. charts, which select intrinsically).
        if let Some(panel) = ctx.props().workspace.panel(&id) {
            let mode = if is_master {
                "SELECT_ROW_TREE"
            } else {
                "READ_ONLY"
            };
            set_edit_mode(&panel.session, &panel.renderer, mode);
        }
        // Demoting a master back to detail retracts (only) its own
        // contribution — other masters' clauses and any restored bucket
        // survive. Promotion needs no filter mutation: the re-stamp below
        // grants the new master immunity (and details keep filtering).
        if !is_master {
            ctx.props().workspace.clear_contribution(&id);
        }
        apply_global_filters(&ctx.props().workspace);
        // Re-render regardless of a filter change — the context menu's
        // "Master"/"Detail" label reads the toggled state.
        true
    }

    pub(super) fn on_master_contribution(
        &mut self,
        ctx: &Context<Self>,
        panel_id: String,
        selection: Option<MasterSelection>,
    ) -> bool {
        // A master's selection state REPLACES its per-panel contribution to
        // the element-level global filter set (`None` = deselected = clears
        // it) — then surfaces in the bar and applies to the details. The
        // re-render arrives via `filters_changed` → `UpdateGlobalFilters`.
        // Contributions are keyed by the ORIGINATING panel, so removing them
        // from the bar can clear its selection state. Non-master events
        // (plain detail-panel selections/clicks) don't broadcast.
        let workspace = &ctx.props().workspace;
        let id = PanelId::from(panel_id);
        if !workspace.is_master(&id) {
            return false;
        }

        let filters = match selection {
            None => Vec::new(),
            Some(selection) => {
                // Broadcast only the selection-DERIVED clauses: the event's
                // filters embed the master's own stored `filter` field (a
                // select detail's configs extend the panel config), which
                // must not leak into the details — subtract it. (Live `Ref`
                // guard — scope it to this statement.)
                let own = workspace
                    .panel(&id)
                    .map(|p| p.session.get_view_config().filter.clone())
                    .unwrap_or_default();

                let derived = selection
                    .filters
                    .into_iter()
                    .filter(|x| !own.contains(x))
                    .collect::<Vec<_>>();

                if !derived.is_empty() {
                    derived
                } else {
                    // Nothing derivable from the event's configs — fall back
                    // to the clicked-cell clause if the detail carried one,
                    // else leave the current contribution untouched.
                    match selection.cell_fallback {
                        Some(x) => vec![x],
                        None => return false,
                    }
                }
            },
        };

        workspace.set_contribution(&id, filters);
        apply_global_filters(workspace);
        false
    }

    pub(super) fn on_remove_global_filter(&mut self, ctx: &Context<Self>, index: usize) -> bool {
        let workspace = &ctx.props().workspace;
        let origins = workspace.remove_global_filter(index);
        apply_global_filters(workspace);
        // The chip's clause is gone — the master selection(s) that produced
        // it must not stay highlighted, implying a filter that no longer
        // exists. (Restored/unattributed clauses have no origin — no-op.)
        clear_master_selections(workspace, origins);
        false
    }

    pub(super) fn on_clear_global_filters(&mut self, ctx: &Context<Self>) -> bool {
        let workspace = &ctx.props().workspace;
        let origins = workspace.clear_global_filters();
        apply_global_filters(workspace);
        clear_master_selections(workspace, origins);
        false
    }
}
