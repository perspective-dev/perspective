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

use perspective_js::utils::*;
use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::PerspectiveViewerMsg::*;
use super::msg::{Divider, PaneTarget};
use crate::tasks::*;

#[derive(Default)]
pub(super) struct DividerPump {
    pub target: Option<PaneTarget>,
    pub pumping: bool,
    pub finish_pending: bool,
}

impl PerspectiveViewer {
    fn pump_mut(&mut self, divider: Divider) -> &mut DividerPump {
        match divider {
            Divider::Settings => &mut self.settings_geometry.settings_divider,
            Divider::ColumnSettings => &mut self.settings_geometry.column_settings_divider,
            Divider::Workspace => &mut self.workspace_drawer.divider,
        }
    }

    fn is_divider_deferred(&self, divider: Divider) -> bool {
        match divider {
            Divider::Settings => true,
            Divider::ColumnSettings => self.settings_geometry.column_settings_pinned,
            Divider::Workspace => self.workspace_drawer.shown.pinned,
        }
    }

    fn apply_pane_target(&mut self, divider: Divider, target: PaneTarget) -> bool {
        let deferred = self.is_divider_deferred(divider);
        match (divider, target) {
            (Divider::Settings, PaneTarget::Width(w)) => {
                self.settings_geometry.pane_width_override = Some(w);
                true
            },
            (Divider::Settings, PaneTarget::Natural) => {
                self.settings_geometry.pane_width_override = None;
                self.settings_geometry.auto_width = 0.0;
                self.on_settings_panel_dimensions_reset.emit(());
                true
            },
            (Divider::ColumnSettings, PaneTarget::Width(w)) => {
                self.settings_geometry.column_settings_width_override = Some(w);
                deferred
            },
            (Divider::ColumnSettings, PaneTarget::Natural) => {
                self.settings_geometry.column_settings_width_override = None;
                self.settings_geometry.column_settings_auto_width = 0.0;
                true
            },
            (Divider::Workspace, PaneTarget::Width(w)) => {
                self.workspace_drawer.width_override = Some(w);
                deferred
            },
            (Divider::Workspace, PaneTarget::Natural) => {
                self.workspace_drawer.width_override = None;
                true
            },
        }
    }

    pub(super) fn on_divider_move(
        &mut self,
        ctx: &Context<Self>,
        divider: Divider,
        target: PaneTarget,
    ) -> bool {
        if !self.is_divider_deferred(divider) {
            return self.apply_pane_target(divider, target);
        }

        // Latest-wins: overwrite the pending target; start the pump if
        // idle. Intermediate targets that arrive while a presize is in
        // flight are dropped (mirrors `PresizeQueue`'s single queued
        // slot) — the pane tracks the pointer at content-render rate.
        let pump = self.pump_mut(divider);
        pump.target = Some(target);
        if !pump.pumping {
            pump.pumping = true;
            ctx.link().send_message(DividerPump(divider));
        }

        false
    }

    pub(super) fn on_divider_pump(&mut self, ctx: &Context<Self>, divider: Divider) -> bool {
        let workspace = ctx.props().workspace.clone();
        let pump = self.pump_mut(divider);
        let Some(target) = pump.target.take() else {
            pump.pumping = false;
            if std::mem::take(&mut pump.finish_pending) {
                ApiFuture::spawn(async move {
                    resize_visible_panels(&workspace).await;
                    Ok(())
                });
            }

            return false;
        };

        let elem = ctx.props().elem.clone();
        let pane_width = match target {
            PaneTarget::Width(w) => Some(w as f64),
            PaneTarget::Natural => measure_pane_natural_width(&elem, divider.pane_selector()),
        };

        let link = ctx.link().clone();
        ApiFuture::spawn(async move {
            let presents = match pane_width {
                Some(pane_width) => {
                    presize_visible_panels_pane_width(
                        &workspace,
                        &elem,
                        divider.pane_selector(),
                        pane_width,
                    )
                    .await
                },
                None => StagedPresents::default(),
            };

            link.send_message(DividerCommit(divider, target));
            presents.reveal();
            Ok(())
        });

        false
    }

    pub(super) fn on_divider_commit(
        &mut self,
        ctx: &Context<Self>,
        divider: Divider,
        target: PaneTarget,
    ) -> bool {
        // Every visible panel has rendered at (approximately) its
        // target box — NOW move the geometry: the re-render below
        // applies this target to the deferred `SplitPanel`'s controlled
        // `size`, in the same task as the presizes' inline clears.
        self.apply_pane_target(divider, target);
        if target == PaneTarget::Natural {
            self.pump_mut(divider).finish_pending = true;
        }

        ctx.link().send_message(DividerPump(divider));
        true
    }

    pub(super) fn on_divider_finish(&mut self, ctx: &Context<Self>, divider: Divider) -> bool {
        if !self.is_divider_deferred(divider) {
            return false;
        }

        let pump = self.pump_mut(divider);
        if pump.pumping {
            pump.finish_pending = true;
        } else {
            let workspace = ctx.props().workspace.clone();
            ApiFuture::spawn(async move {
                resize_visible_panels(&workspace).await;
                Ok(())
            });
        }

        false
    }
}
