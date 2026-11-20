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
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::PerspectiveViewer;
use super::dividers::DividerPump;
use super::msg::PerspectiveViewerMsg::*;
use crate::components::settings_panel::SelectedTab;
use crate::config::*;
use crate::presentation::{ColumnSettingsTarget, OpenColumnSettings};
use crate::session::TableLoadState;
use crate::tasks::*;
use crate::ui::FontLoaderStatus;

/// The settings sidebar's geometry state, folded into one field on
/// [`PerspectiveViewer`]: the pane/drawer width overrides, the divider
/// presize pump, and the open-state deltas cache.
#[derive(Default)]
pub(super) struct SettingsGeometry {
    /// User-dragged settings-pane width (the deferred `SplitPanel`'s
    /// controlled `size`); `None` until first dragged / after a reset.
    pub pane_width_override: Option<i32>,

    /// The selected settings-panel tab.
    pub selected_tab: SelectedTab,

    /// High-water-mark auto width reported by the settings panel.
    pub auto_width: f64,

    pub settings_divider: DividerPump,

    pub column_settings_divider: DividerPump,

    /// Open-state geometry deltas `(layout_area.w − mpc.w, main_column.h −
    /// mpc.h)`, cached at settings *close* time — used to presize panels to
    /// their shrunk boxes BEFORE the pane mounts on the next *open* (P2).
    /// `None` until the first close (the first-ever open is reactive).
    pub open_deltas: Option<(f64, f64)>,

    /// User-dragged column-settings drawer width override.
    pub column_settings_width_override: Option<i32>,

    /// High-water-mark auto width reported by the column-settings drawer -
    /// the trap-door shared across its Style/Attributes/Window tabs, lifted
    /// here (like `auto_width`) so it survives drawer re-opens and clears
    /// on divider reset.
    pub column_settings_auto_width: f64,

    /// Whether the column-settings drawer is PINNED - laid out as a static
    /// flex sibling between the main panel and the settings panel - rather
    /// than FLOATING over the main panel (the default absolute overlay).
    /// Session UI state, not part of the saved config.
    pub column_settings_pinned: bool,

    /// Latest-wins deferred `open_column_settings` snapshot: the newest
    /// target not yet applied while a docked-drawer presize sweep is in
    /// flight. `UpdateColumnSettingsCommit` applies THIS slot (not a copy
    /// captured at spawn), so a newer target arriving mid-sweep wins and
    /// out-of-order commits are inexpressible.
    pub column_settings_target: Option<OpenColumnSettings>,
    pub column_settings_commit_pending: bool,

    /// The docked drawer's span, cached whenever it is measurable (pin
    /// toggle, docked unmount) - used to presize for a drawer that MOUNTS
    /// directly into pinned mode, when it isn't in the DOM to measure.
    pub column_settings_docked_width: Option<f64>,
}

impl PerspectiveViewer {
    pub(super) fn on_toggle_settings_init(
        &mut self,
        ctx: &Context<Self>,
        update: Option<SettingsUpdate>,
        announce: bool,
        resolve: Option<Sender<ApiResult<JsValue>>>,
    ) -> bool {
        match (update, resolve) {
            (Some(SettingsUpdate::Missing), None) => false,
            (Some(SettingsUpdate::Missing), Some(resolve)) => {
                resolve.send(Ok(JsValue::UNDEFINED)).unwrap();
                false
            },
            (Some(SettingsUpdate::SetDefault), resolve) => {
                self.init_toggle_settings_task(ctx, Some(false), announce, resolve, None);
                false
            },
            (Some(SettingsUpdate::Update(force)), resolve) => {
                self.init_toggle_settings_task(ctx, Some(force), announce, resolve, None);
                false
            },
            (None, resolve) => {
                self.init_toggle_settings_task(ctx, None, announce, resolve, None);
                false
            },
        }
    }

    pub(super) fn on_toggle_settings_complete(
        &mut self,
        ctx: &Context<Self>,
        update: SettingsUpdate,
        column: Option<ColumnSettingsTarget>,
        resolve: Sender<()>,
    ) -> bool {
        match update {
            SettingsUpdate::SetDefault if self.settings_open => {
                ctx.props().presentation.set_open_column_settings(None);
                self.settings_open = false;
                self.on_rendered.push(resolve);
                true
            },
            SettingsUpdate::Update(force) if force != self.settings_open => {
                let ocs = column
                    .filter(|_| force)
                    .map(|target| self.column_settings_for(Some(target)));

                if ocs.is_some() {
                    self.settings_geometry.selected_tab = SelectedTab::Query;
                }

                ctx.props()
                    .presentation
                    .set_open_column_settings(ocs.clone());
                if let Some(ocs) = ocs {
                    self.presentation_props.open_column_settings = ocs;
                }

                self.settings_open = force;
                self.on_rendered.push(resolve);
                true
            },
            _ if matches!(self.fonts.get_status(), FontLoaderStatus::Finished) => {
                if let Err(e) = resolve.send(()) {
                    tracing::error!("toggle settings failed {:?}", e);
                }

                false
            },
            _ => {
                ctx.props().presentation.set_open_column_settings(None);
                self.on_rendered.push(resolve);
                true
            },
        }
    }

    /// Toggle the settings, or force the settings panel either open (true) or
    /// closed (false) explicitly.  In order to reduce apparent
    /// screen-shear, `toggle_settings()` uses a somewhat complex render
    /// order:  it first resize the plugin's `<div>` without moving it,
    /// using `overflow: hidden` to hide the extra draw area;  then,
    /// after the _async_ drawing of the plugin is complete, it will send a
    /// message to complete the toggle action and re-render the element with
    /// the settings removed.
    ///
    /// # Arguments
    /// * `force` - Whether to explicitly set the settings panel state to
    ///   Open/Close (`Some(true)`/`Some(false)`), or to just toggle the current
    ///   state (`None`).
    pub(super) fn init_toggle_settings_task(
        &mut self,
        ctx: &Context<Self>,
        force: Option<bool>,
        announce: bool,
        sender: Option<Sender<ApiResult<JsValue>>>,
        column: Option<ColumnSettingsTarget>,
    ) {
        let is_open = ctx.props().presentation.is_settings_open();
        match force {
            Some(force) if is_open == force => {
                if let Some(sender) = sender {
                    sender.send(Ok(JsValue::UNDEFINED)).unwrap();
                }
            },
            Some(_) | None => {
                ctx.props().presentation.set_settings_before_open(!is_open);
                let force = !is_open;
                let callback = ctx.link().callback(move |resolve| {
                    let update = SettingsUpdate::Update(force);
                    ToggleSettingsComplete(update, column.clone(), resolve)
                });

                if is_open {
                    self.settings_geometry.open_deltas =
                        measure_settings_open_deltas(&ctx.props().elem);
                }

                let drawer_open = self.workspace_drawer.shown.open;
                let bar_stays_docked = self.is_status_bar_docked(ctx, false, drawer_open);
                let open_deltas = self
                    .settings_geometry
                    .open_deltas
                    .map(|(w, h)| (w, if bar_stays_docked { 0.0 } else { h }));

                let workspace = ctx.props().workspace.clone();
                let presentation = ctx.props().presentation.clone();
                let elem = ctx.props().elem.clone();

                ApiFuture::spawn(async move {
                    let result: ApiResult<JsValue> = async {
                        if is_open {
                            let presents =
                                presize_visible_panels_grown(&workspace, &elem, bar_stays_docked)
                                    .await;
                            let (notify, rendered) = channel::<()>();
                            callback.emit(notify);
                            presentation.set_settings_open(false, announce);
                            rendered.await?;
                            presents.reveal();
                            resize_visible_panels(&workspace).await;
                        } else {
                            let presents = if let Some((delta_w, delta_h)) = open_deltas {
                                presize_visible_panels_open(&workspace, &elem, delta_w, delta_h)
                                    .await
                            } else {
                                StagedPresents::default()
                            };

                            let (notify, rendered) = channel::<()>();
                            callback.emit(notify);
                            presentation.set_settings_open(true, announce);
                            rendered.await?;
                            presents.reveal();
                            resize_visible_panels(&workspace).await;
                        }
                        Ok(JsValue::UNDEFINED)
                    }
                    .await;

                    if let Some(sender) = sender {
                        let msg = result.ignore_view_delete();
                        sender
                            .send(msg.map(|x| x.unwrap_or(JsValue::UNDEFINED)))
                            .into_apierror()?;
                    };

                    Ok(JsValue::undefined())
                });
            },
        };
    }

    /// Whether the status bar docks for these settings and workspace drawer
    /// states, mirroring `StatusBar`'s docked branch.
    pub(super) fn is_status_bar_docked(
        &self,
        ctx: &Context<Self>,
        settings_open: bool,
        drawer_open: bool,
    ) -> bool {
        settings_open
            || drawer_open
            || ctx.props().workspace.is_empty_stage()
            || !matches!(self.session_props.has_table, Some(TableLoadState::Loaded))
            || self.session_props.is_errored()
            || self.renderer_props.render_error.is_some()
    }

    pub(super) fn resize_for_ratchet(&self, ctx: &Context<Self>) {
        let workspace = ctx.props().workspace.clone();
        ApiFuture::spawn(async move {
            resize_visible_panels(&workspace).await;
            Ok(())
        });
    }

    pub(super) fn on_settings_panel_tab_changed(&mut self, tab: SelectedTab) -> bool {
        let changed = tab != self.settings_geometry.selected_tab;
        self.settings_geometry.selected_tab = tab;
        changed
    }

    pub(super) fn on_settings_panel_auto_width(&mut self, ctx: &Context<Self>, w: f64) -> bool {
        if w > self.settings_geometry.auto_width {
            self.settings_geometry.auto_width = w;
            self.resize_for_ratchet(ctx);
            true
        } else {
            false
        }
    }

    pub(super) fn on_toggle_debug(&mut self, _ctx: &Context<Self>) -> bool {
        self.debug_open = !self.debug_open;
        true
    }
}
