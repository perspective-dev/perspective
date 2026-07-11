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

//! Value-semantic snapshot plumbing: the mechanical `Update*` handlers that
//! copy fresh engine-state snapshots (dispatched by the [`super::wiring`]
//! subscriptions/callbacks) into the root's props fields, re-rendering only
//! on an actual change.

use yew::prelude::*;

use super::PerspectiveViewer;
use crate::presentation::{DragDropProps, OpenColumnSettings, PresentationProps};
use crate::renderer::RendererProps;
use crate::session::{SessionProps, TableLoadState, ViewStats};

impl PerspectiveViewer {
    pub(super) fn on_update_session(&mut self, props: SessionProps) -> bool {
        let changed = props != self.session_props;
        self.session_props = props;
        changed
    }

    pub(super) fn on_update_session_stats(
        &mut self,
        stats: Option<ViewStats>,
        has_table: Option<TableLoadState>,
    ) -> bool {
        let changed =
            stats != self.session_props.stats || has_table != self.session_props.has_table;
        self.session_props.stats = stats;
        self.session_props.has_table = has_table;
        changed
    }

    pub(super) fn on_update_renderer(&mut self, props: RendererProps) -> bool {
        let changed = props != self.renderer_props;
        self.renderer_props = props;
        changed
    }

    pub(super) fn on_update_presentation(
        &mut self,
        ctx: &Context<Self>,
        props: PresentationProps,
    ) -> bool {
        // Default-theme fan-out: when the registry default (first available
        // theme) changes — the async theme discovery resolving at boot, or a
        // `resetThemes` — push the new default into every panel's renderer
        // cache (locked draws stamp the effective theme from it), and
        // restyle the panels whose captured `--psp-*` CSS is STALE against
        // the new effective value (`Renderer::needs_restyle` — the plugin's
        // captured theme is the baseline; plugins only re-read CSS at
        // `restyle()`/first-draw, so a plain redraw would not repaint a
        // panel that first drew before discovery resolved, while a panel
        // that captured post-discovery — or owes its first paint — restyles
        // nothing). The outer default-diff scopes the scan; the per-panel
        // gate is state, never call history or DOM state.
        let old_default = self.presentation_props.available_themes.first().cloned();
        let new_default = props.available_themes.first().cloned();
        if old_default != new_default {
            for panel in ctx
                .props()
                .workspace
                .panel_ids()
                .into_iter()
                .filter_map(|id| ctx.props().workspace.panel(&id))
            {
                panel.renderer.set_default_theme(new_default.clone());
                if panel.renderer.needs_restyle() {
                    let renderer = panel.renderer.clone();
                    crate::utils::spawn_owned("default-theme-restyle", async move {
                        renderer.restyle_all().await?;
                        Ok(())
                    });
                }
            }
        }

        let changed = props != self.presentation_props;
        self.presentation_props = props;
        changed
    }

    pub(super) fn on_update_settings_open(&mut self, open: bool) -> bool {
        let changed = open != self.presentation_props.is_settings_open;
        self.presentation_props.is_settings_open = open;
        changed
    }

    pub(super) fn on_update_is_workspace(&mut self, is_workspace: bool) -> bool {
        let changed = is_workspace != self.presentation_props.is_workspace;
        self.presentation_props.is_workspace = is_workspace;
        changed
    }

    pub(super) fn on_update_column_settings(&mut self, ocs: OpenColumnSettings) -> bool {
        let changed = ocs != self.presentation_props.open_column_settings;
        self.presentation_props.open_column_settings = ocs;
        changed
    }

    pub(super) fn on_update_dragdrop(&mut self, props: DragDropProps) -> bool {
        let changed = props != self.dragdrop_props;
        self.dragdrop_props = props;
        changed
    }

    pub(super) fn on_update_global_filters(&mut self, ctx: &Context<Self>) -> bool {
        let filters = ctx.props().workspace.global_filters();
        let changed = filters != self.global_filters;
        self.global_filters = filters;
        changed
    }

    /// LEVEL-triggered spinner count: ASSIGN the absolute in-flight
    /// config-run count from the session's RAII accounting — any missed or
    /// reordered notification is corrected by the next one, unlike the
    /// edge-counted increment/decrement pair this replaces (see
    /// `UPDATE_COUNT_REGRESSION_PLAN.md`).
    pub(super) fn on_update_in_flight(&mut self, count: u32) -> bool {
        let changed = count != self.update_count;
        self.update_count = count;
        changed
    }
}
