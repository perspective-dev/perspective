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

//! The workspace drawer's state and its open/close and pin/unpin transitions.

use futures::channel::oneshot::Sender;
use perspective_client::clone;
use yew::prelude::*;

use super::PerspectiveViewer;
use super::dividers::DividerPump;
use super::msg::DrawerWaiters;
use super::msg::PerspectiveViewerMsg::*;
use crate::components::workspace_panel::WorkspaceTab;
use crate::queries::StatusState;
use crate::tasks::{measure_drawer_span, measure_status_bar_height};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct DrawerState {
    pub open: bool,
    pub pinned: bool,
}

impl DrawerState {
    fn is_docked(self) -> bool {
        self.open && self.pinned
    }
}

#[derive(Default)]
pub(super) struct WorkspaceDrawer {
    /// The state `render()` reads.
    pub shown: DrawerState,

    target: Option<DrawerState>,
    commit_pending: bool,
    waiters: Vec<Sender<()>>,
    pub selected_tab: WorkspaceTab,
    pub width_override: Option<i32>,
    docked_width: Option<f64>,
    pub divider: DividerPump,
}

impl WorkspaceDrawer {
    fn effective(&self) -> DrawerState {
        self.target.unwrap_or(self.shown)
    }
}

impl PerspectiveViewer {
    pub(super) fn on_toggle_workspace_drawer(
        &mut self,
        ctx: &Context<Self>,
        force: Option<bool>,
        resolve: Option<Sender<()>>,
    ) -> bool {
        let effective = self.workspace_drawer.effective();
        let next = DrawerState {
            open: force.unwrap_or(!effective.open),
            ..effective
        };

        self.request_workspace_drawer(ctx, next, resolve)
    }

    pub(super) fn on_toggle_workspace_drawer_pin(&mut self, ctx: &Context<Self>) -> bool {
        let effective = self.workspace_drawer.effective();
        let next = DrawerState {
            pinned: !effective.pinned,
            ..effective
        };

        self.request_workspace_drawer(ctx, next, None)
    }

    pub(super) fn on_status_indicator_clicked(&mut self, ctx: &Context<Self>) -> bool {
        // Empty stage: the indicator shows the element-level stage error, and
        // clicking DISMISSES it (there is no panel to reconnect).
        let workspace = &ctx.props().workspace;
        if workspace.is_empty_stage() && workspace.stage_error().is_some() {
            workspace.set_stage_error(None);
            return false;
        }

        let state = self.workspace_status.state;
        if state == StatusState::Normal {
            self.active_session.status_indicator_clicked.emit(());
        }

        if self.workspace_drawer.effective().open {
            return false;
        }

        if state == StatusState::Errored {
            self.workspace_drawer.selected_tab = WorkspaceTab::Tables;
        }

        self.on_toggle_workspace_drawer(ctx, Some(true), None)
    }

    fn request_workspace_drawer(
        &mut self,
        ctx: &Context<Self>,
        next: DrawerState,
        resolve: Option<Sender<()>>,
    ) -> bool {
        let pending = self.workspace_drawer.commit_pending;
        if !pending && next == self.workspace_drawer.shown {
            if let Some(resolve) = resolve {
                let _ = resolve.send(());
            }

            return false;
        }

        let shown = self.workspace_drawer.shown;
        let delta_h = self.workspace_drawer_bar_delta(ctx, shown, next);
        if !pending && next.is_docked() == shown.is_docked() && delta_h == 0.0 {
            self.apply_workspace_drawer(ctx, next);
            self.on_rendered.extend(resolve);
            return true;
        }

        self.workspace_drawer.target = Some(next);
        self.workspace_drawer.waiters.extend(resolve);
        if pending {
            return false;
        }

        self.workspace_drawer.commit_pending = true;
        let delta_w = if next.is_docked() == shown.is_docked() {
            Some(0.0)
        } else {
            self.workspace_drawer_delta(ctx, next)
        };

        let waiters = DrawerWaiters::default();
        let on_settled = Callback::from({
            clone!(waiters);
            move |()| {
                for waiter in waiters.borrow_mut().drain(..) {
                    let _ = waiter.send(());
                }
            }
        });

        self.presize_pane_shift(
            ctx,
            delta_w.map(|w| (w, delta_h)),
            move |resolve| WorkspaceDrawerCommit(resolve, waiters.clone()),
            on_settled,
        );

        false
    }

    fn workspace_drawer_delta(&mut self, ctx: &Context<Self>, next: DrawerState) -> Option<f64> {
        if !self.workspace_drawer.shown.open {
            return self.workspace_drawer.docked_width;
        }

        let span = measure_drawer_span(&ctx.props().elem, "#workspace_drawer")?;
        self.workspace_drawer.docked_width = Some(span);
        Some(if next.is_docked() { span } else { -span })
    }

    /// The signed `#main_column` height delta of the status bar docking or
    /// floating as the drawer goes from `shown` to `next`.
    fn workspace_drawer_bar_delta(
        &self,
        ctx: &Context<Self>,
        shown: DrawerState,
        next: DrawerState,
    ) -> f64 {
        let was = self.is_status_bar_docked(ctx, self.settings_open, shown.open);
        let will = self.is_status_bar_docked(ctx, self.settings_open, next.open);
        match (was, will) {
            (false, true) => measure_status_bar_height(&ctx.props().elem),
            (true, false) => -measure_status_bar_height(&ctx.props().elem),
            _ => 0.0,
        }
    }

    fn apply_workspace_drawer(&mut self, ctx: &Context<Self>, next: DrawerState) {
        let was_open = self.workspace_drawer.shown.open;
        self.workspace_drawer.shown = next;
        if was_open != next.open {
            ctx.props()
                .presentation
                .workspace_drawer_open_changed
                .emit(next.open);
        }
    }

    pub(super) fn on_workspace_drawer_commit(
        &mut self,
        ctx: &Context<Self>,
        resolve: Sender<()>,
        waiters: DrawerWaiters,
    ) -> bool {
        self.workspace_drawer.commit_pending = false;
        self.on_rendered.push(resolve);
        waiters
            .borrow_mut()
            .extend(self.workspace_drawer.waiters.drain(..));

        if let Some(next) = self.workspace_drawer.target.take() {
            self.apply_workspace_drawer(ctx, next);
        }

        true
    }

    pub(super) fn on_workspace_tab_changed(&mut self, tab: WorkspaceTab) -> bool {
        let changed = tab != self.workspace_drawer.selected_tab;
        self.workspace_drawer.selected_tab = tab;
        changed
    }
}
