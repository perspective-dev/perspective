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

use futures::channel::oneshot::{Sender, channel};
use perspective_js::utils::*;
use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::PerspectiveViewerMsg::*;
use crate::components::settings_panel::SelectedTab;
use crate::presentation::{ColumnSettingsTab, ColumnSettingsTarget, OpenColumnSettings};
use crate::queries::get_current_column_locator;
use crate::tasks::*;

impl PerspectiveViewer {
    /// The open column settings of `target`, on the tab its column opens to.
    pub(super) fn column_settings_for(
        &self,
        target: Option<ColumnSettingsTarget>,
    ) -> OpenColumnSettings {
        let tab = match &target {
            Some(ColumnSettingsTarget::NewExpression) => Some(ColumnSettingsTab::Attributes),
            Some(ColumnSettingsTarget::Column(name)) => {
                Some(if self.session_props.is_column_active(name) {
                    ColumnSettingsTab::Style
                } else {
                    ColumnSettingsTab::Attributes
                })
            },
            None => None,
        };

        OpenColumnSettings { target, tab }
    }

    pub(super) fn on_open_settings_with_column(
        &mut self,
        ctx: &Context<Self>,
        target: ColumnSettingsTarget,
    ) -> bool {
        if self.settings_open {
            self.on_open_column_settings(ctx, Some(target), None, false)
        } else {
            self.init_toggle_settings_task(ctx, Some(true), true, None, Some(target));
            false
        }
    }

    pub(super) fn on_open_column_settings(
        &mut self,
        ctx: &Context<Self>,
        target: Option<ColumnSettingsTarget>,
        sender: Option<Sender<()>>,
        toggle: bool,
    ) -> bool {
        let open_column_settings = ctx.props().presentation.get_open_column_settings();
        if target == open_column_settings.target {
            if toggle {
                ctx.props().presentation.set_open_column_settings(None);
            }
        } else {
            let open_column_settings = self.column_settings_for(target.clone());
            ctx.props()
                .presentation
                .set_open_column_settings(Some(open_column_settings));

            if target.is_some() {
                self.settings_geometry.selected_tab = SelectedTab::Query;
            }
        }

        if let Some(sender) = sender {
            // I6: resolve on the render commit that applies this change (the
            // shared `on_rendered` queue, drained in `rendered()` once fonts
            // settle), not at message-handling time.
            self.on_rendered.push(sender);
        }

        true
    }

    pub(super) fn on_column_settings_panel_auto_width(
        &mut self,
        ctx: &Context<Self>,
        w: f64,
    ) -> bool {
        if w > self.settings_geometry.column_settings_auto_width {
            self.settings_geometry.column_settings_auto_width = w;
            if self.settings_geometry.column_settings_pinned {
                self.resize_for_ratchet(ctx);
            }

            true
        } else {
            false
        }
    }

    pub(super) fn on_toggle_column_settings_pin(&mut self, ctx: &Context<Self>) -> bool {
        let is_pinned = self.settings_geometry.column_settings_pinned;
        let delta_w = measure_column_settings_pin_delta(&ctx.props().elem, is_pinned);
        if let Some(delta_w) = delta_w {
            self.settings_geometry.column_settings_docked_width = Some(delta_w.abs());
        }

        self.presize_pane_shift(
            ctx,
            delta_w.map(|w| (w, 0.0)),
            ToggleColumnSettingsPinComplete,
            Callback::noop(),
        );
        false
    }

    pub(super) fn on_toggle_column_settings_pin_complete(&mut self, resolve: Sender<()>) -> bool {
        self.settings_geometry.column_settings_pinned =
            !self.settings_geometry.column_settings_pinned;
        self.on_rendered.push(resolve);
        true
    }

    /// Shared presize choreography for a drawer geometry shift:
    /// pre-size every visible panel by `delta` (`None` = no sweep, commit
    /// only), send `commit_msg` to apply the deferred state on the render
    /// commit, reveal the staged frames in that same paint, then reactively
    /// finalize at the exact settled cells (I6) and emit `on_settled`.
    pub(super) fn presize_pane_shift(
        &self,
        ctx: &Context<Self>,
        delta: Option<(f64, f64)>,
        commit_msg: impl Fn(Sender<()>) -> super::msg::PerspectiveViewerMsg + 'static,
        on_settled: Callback<()>,
    ) {
        let workspace = ctx.props().workspace.clone();
        let elem = ctx.props().elem.clone();
        let callback = ctx.link().callback(commit_msg);
        ApiFuture::spawn(async move {
            let presents = match delta {
                Some((delta_w, delta_h)) => {
                    presize_visible_panels_open(&workspace, &elem, delta_w, delta_h).await
                },
                None => StagedPresents::default(),
            };

            let (notify, rendered) = channel::<()>();
            callback.emit(notify);
            rendered.await?;
            presents.reveal();
            resize_visible_panels(&workspace).await;
            on_settled.emit(());
            Ok(())
        });
    }

    /// Whether the drawer renders for this `open_column_settings` snapshot
    /// (the `render()` mount predicate). Sensitive to the session snapshot
    /// too — `snapshots.rs` re-evaluates it across an `UpdateSession` apply,
    /// which can invalidate the open column's locator (e.g. a drag
    /// replacing it in `columns`) and unmount the drawer without any
    /// `UpdateColumnSettings` traffic.
    pub(super) fn is_column_settings_mounted(&self, ocs: &OpenColumnSettings) -> bool {
        get_current_column_locator(
            ocs,
            &self.active_renderer,
            &self.session_props.config,
            &self.session_props.metadata,
        )
        .is_some()
    }

    /// The `open_column_settings` snapshot handler: mount/unmount of the
    /// DOCKED drawer moves `#main_panel_container`'s flex box just like the
    /// pin toggle — and no `before-resize` fires for it — so those
    /// transitions defer the snapshot behind the presize choreography.
    /// Floating transitions and in-place locator changes apply synchronously
    /// as before, unless a deferred commit is in flight (they queue into the
    /// latest-wins slot to preserve commit order).
    pub(super) fn on_update_column_settings(
        &mut self,
        ctx: &Context<Self>,
        ocs: OpenColumnSettings,
    ) -> bool {
        self.refresh_session_snapshot(ctx);
        let effective = self
            .settings_geometry
            .column_settings_target
            .as_ref()
            .unwrap_or(&self.presentation_props.open_column_settings);
        if ocs == *effective {
            return false;
        }

        let was_mounted =
            self.is_column_settings_mounted(&self.presentation_props.open_column_settings);
        let will_mount = self.is_column_settings_mounted(&ocs);
        let needs_presize =
            self.settings_geometry.column_settings_pinned && was_mounted != will_mount;
        if !needs_presize && !self.settings_geometry.column_settings_commit_pending {
            self.presentation_props.open_column_settings = ocs;
            return true;
        }

        self.settings_geometry.column_settings_target = Some(ocs);
        if self.settings_geometry.column_settings_commit_pending {
            return false;
        }

        self.settings_geometry.column_settings_commit_pending = true;
        let delta_w = if !needs_presize {
            None
        } else if was_mounted {
            // Unmounting - the docked drawer is still in the DOM, and its
            // freed span is the same measurement as an unpin.
            let delta = measure_column_settings_pin_delta(&ctx.props().elem, true);
            if let Some(delta) = delta {
                self.settings_geometry.column_settings_docked_width = Some(delta.abs());
            }

            delta
        } else {
            // Mounting directly into pinned mode - not yet in the DOM; the
            // span cached at the last dock/unmount predicts the shrink.
            self.settings_geometry.column_settings_docked_width
        };

        self.presize_pane_shift(
            ctx,
            delta_w.map(|w| (w, 0.0)),
            UpdateColumnSettingsCommit,
            Callback::noop(),
        );
        false
    }

    pub(super) fn on_update_column_settings_commit(&mut self, resolve: Sender<()>) -> bool {
        self.settings_geometry.column_settings_commit_pending = false;
        self.on_rendered.push(resolve);
        if let Some(ocs) = self.settings_geometry.column_settings_target.take() {
            self.presentation_props.open_column_settings = ocs;
        }

        true
    }

    pub(super) fn on_column_settings_tab_changed(
        &mut self,
        ctx: &Context<Self>,
        tab: ColumnSettingsTab,
    ) -> bool {
        let mut open_column_settings = ctx.props().presentation.get_open_column_settings();
        open_column_settings.tab.clone_from(&Some(tab));
        ctx.props()
            .presentation
            .set_open_column_settings(Some(open_column_settings));
        true
    }
}
