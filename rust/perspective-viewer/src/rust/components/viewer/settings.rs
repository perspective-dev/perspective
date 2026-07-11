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

//! Settings-sidebar handlers: the open/close toggle (with its presize
//! choreography), the deferred divider's latest-wins presize pump
//! (`PRESIZE_EVERYWHERE_PLAN.md` P1/P2), and the column-settings drawer. The
//! presize sweeps themselves live in [`crate::tasks`] (`presize_panels`).

use futures::channel::oneshot::{Sender, channel};
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::PerspectiveViewerMsg::*;
use crate::components::font_loader::FontLoaderStatus;
use crate::components::settings_panel::SelectedTab;
use crate::config::*;
use crate::presentation::{ColumnLocator, ColumnSettingsTab};
use crate::tasks::*;

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

    /// Latest-wins presize pump for the (deferred) settings divider: the
    /// newest proposed pane width not yet presized, and whether a pump
    /// iteration is in flight. See `SettingsDividerMove`.
    pub divider_target: Option<i32>,
    pub divider_pumping: bool,

    /// Open-state geometry deltas `(layout_area.w − mpc.w, main_column.h −
    /// mpc.h)`, cached at settings *close* time — used to presize panels to
    /// their shrunk boxes BEFORE the pane mounts on the next *open* (P2).
    /// `None` until the first close (the first-ever open is reactive).
    pub open_deltas: Option<(f64, f64)>,

    /// User-dragged column-settings drawer width override.
    pub column_settings_width_override: Option<i32>,
}

impl PerspectiveViewer {
    pub(super) fn on_toggle_settings_init(
        &mut self,
        ctx: &Context<Self>,
        update: Option<SettingsUpdate>,
        resolve: Option<Sender<ApiResult<JsValue>>>,
    ) -> bool {
        match (update, resolve) {
            (Some(SettingsUpdate::Missing), None) => false,
            (Some(SettingsUpdate::Missing), Some(resolve)) => {
                resolve.send(Ok(JsValue::UNDEFINED)).unwrap();
                false
            },
            (Some(SettingsUpdate::SetDefault), resolve) => {
                self.init_toggle_settings_task(ctx, Some(false), resolve);
                false
            },
            (Some(SettingsUpdate::Update(force)), resolve) => {
                self.init_toggle_settings_task(ctx, Some(force), resolve);
                false
            },
            (None, resolve) => {
                self.init_toggle_settings_task(ctx, None, resolve);
                false
            },
        }
    }

    pub(super) fn on_toggle_settings_complete(
        &mut self,
        ctx: &Context<Self>,
        update: SettingsUpdate,
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
                ctx.props().presentation.set_open_column_settings(None);
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
    fn init_toggle_settings_task(
        &mut self,
        ctx: &Context<Self>,
        force: Option<bool>,
        sender: Option<Sender<ApiResult<JsValue>>>,
    ) {
        let is_open = ctx.props().presentation.is_settings_open();
        ctx.props().presentation.set_settings_before_open(!is_open);
        match force {
            Some(force) if is_open == force => {
                if let Some(sender) = sender {
                    sender.send(Ok(JsValue::UNDEFINED)).unwrap();
                }
            },
            Some(_) | None => {
                let force = !is_open;
                let callback = ctx.link().callback(move |resolve| {
                    let update = SettingsUpdate::Update(force);
                    ToggleSettingsComplete(update, resolve)
                });

                // P2: at CLOSE time the open-state geometry is measurable —
                // cache the deltas the next OPEN needs to presize with.
                if is_open {
                    self.settings_geometry.open_deltas =
                        measure_settings_open_deltas(&ctx.props().elem);
                }

                let open_deltas = self.settings_geometry.open_deltas;
                let workspace = ctx.props().workspace.clone();
                let presentation = ctx.props().presentation.clone();
                let elem = ctx.props().elem.clone();

                ApiFuture::spawn(async move {
                    // Resize every visible plugin (not just the active one) to its
                    // new cell as the settings pane toggles. The pane is the outer
                    // SplitPanel, which emits no `before-resize`, so this is driven
                    // explicitly here. CLOSING grows the cells, so pre-size each
                    // plugin to its grown box BEFORE collapsing the pane; OPENING
                    // shrinks them, so pre-size to the shrunk box (from the deltas
                    // cached at the last close; the first-ever open has none and
                    // stays reactive) BEFORE the pane mounts — either way, one
                    // clean resize with the reactive pass after as the exactness
                    // finalizer.
                    let result: ApiResult<JsValue> = async {
                        if is_open {
                            presize_visible_panels_grown(&workspace, &elem).await;
                            let (notify, rendered) = channel::<()>();
                            callback.emit(notify);
                            presentation.set_settings_open(false);
                            rendered.await?;
                            // I6: the exactness-finalizer resize is part of
                            // what this toggle caused — await it here rather
                            // than leaving it to the ResizeObserver (whose
                            // continuous pass remains as the reactive
                            // backstop).
                            resize_visible_panels(&workspace).await;
                        } else {
                            if let Some((delta_w, delta_h)) = open_deltas {
                                presize_visible_panels_open(&workspace, &elem, delta_w, delta_h)
                                    .await;
                            }

                            let (notify, rendered) = channel::<()>();
                            callback.emit(notify);
                            presentation.set_settings_open(true);
                            rendered.await?;
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

    pub(super) fn on_settings_panel_size_update(&mut self, x: Option<i32>) -> bool {
        match x {
            Some(x) => {
                self.settings_geometry.pane_width_override = Some(x);
                false
            },
            None => {
                self.settings_geometry.pane_width_override = None;
                self.settings_geometry.auto_width = 0.0;
                self.on_settings_panel_dimensions_reset.emit(());
                true
            },
        }
    }

    pub(super) fn on_settings_divider_move(
        &mut self,
        ctx: &Context<Self>,
        pane_width: i32,
    ) -> bool {
        // Latest-wins: overwrite the pending target; start the pump if
        // idle. Intermediate targets that arrive while a presize is in
        // flight are dropped (mirrors `PresizeQueue`'s single queued
        // slot) — the pane tracks the pointer at content-render rate.
        self.settings_geometry.divider_target = Some(pane_width);
        if !self.settings_geometry.divider_pumping {
            self.settings_geometry.divider_pumping = true;
            ctx.link().send_message(SettingsDividerPump);
        }

        false
    }

    pub(super) fn on_settings_divider_pump(&mut self, ctx: &Context<Self>) -> bool {
        if let Some(pane_width) = self.settings_geometry.divider_target.take() {
            let workspace = ctx.props().workspace.clone();
            let elem = ctx.props().elem.clone();
            let link = ctx.link().clone();
            ApiFuture::spawn(async move {
                presize_visible_panels_pane_width(&workspace, &elem, pane_width as f64).await;
                link.send_message(SettingsDividerCommit(pane_width));
                Ok(())
            });
        } else {
            self.settings_geometry.divider_pumping = false;
        }

        false
    }

    pub(super) fn on_settings_divider_commit(
        &mut self,
        ctx: &Context<Self>,
        pane_width: i32,
    ) -> bool {
        // Every visible panel has rendered at (approximately) its
        // target box — NOW move the geometry: the re-render below
        // applies this width to the deferred `SplitPanel`'s controlled
        // `size`, in the same task as the presizes' inline clears.
        self.settings_geometry.pane_width_override = Some(pane_width);
        ctx.link().send_message(SettingsDividerPump);
        true
    }

    pub(super) fn on_settings_divider_finish(&mut self, ctx: &Context<Self>) -> bool {
        let workspace = ctx.props().workspace.clone();
        ApiFuture::spawn(async move {
            resize_visible_panels(&workspace).await;
            Ok(())
        });

        false
    }

    pub(super) fn on_settings_panel_tab_changed(&mut self, tab: SelectedTab) -> bool {
        let changed = tab != self.settings_geometry.selected_tab;
        self.settings_geometry.selected_tab = tab;
        changed
    }

    pub(super) fn on_settings_panel_auto_width(&mut self, w: f64) -> bool {
        if w > self.settings_geometry.auto_width {
            self.settings_geometry.auto_width = w;
            true
        } else {
            false
        }
    }

    pub(super) fn on_open_column_settings(
        &mut self,
        ctx: &Context<Self>,
        locator: Option<ColumnLocator>,
        sender: Option<Sender<()>>,
        toggle: bool,
    ) -> bool {
        let mut open_column_settings = ctx.props().presentation.get_open_column_settings();
        if locator == open_column_settings.locator {
            if toggle {
                ctx.props().presentation.set_open_column_settings(None);
            }
        } else {
            open_column_settings.locator.clone_from(&locator);
            open_column_settings.tab = if matches!(locator, Some(ColumnLocator::NewExpression)) {
                Some(ColumnSettingsTab::Attributes)
            } else {
                locator.as_ref().and_then(|x| {
                    x.name().map(|x| {
                        if self.session_props.is_column_active(x) {
                            ColumnSettingsTab::Style
                        } else {
                            ColumnSettingsTab::Attributes
                        }
                    })
                })
            };

            ctx.props()
                .presentation
                .set_open_column_settings(Some(open_column_settings));

            if locator.is_some() {
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

    pub(super) fn on_column_settings_panel_size_update(&mut self, x: Option<i32>) -> bool {
        self.settings_geometry.column_settings_width_override = x;
        false
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

    /// Toggling the debug tab re-renders the settings panel only — the
    /// `DebugPanel` populates itself (`get_viewer_config` on mount +
    /// change subscriptions), so no plugin dispatch is owed. The old
    /// `just_render` here relied on the pre-amendment unconditional
    /// `Unchanged → update` arm and repainted the plugin as a side effect
    /// (`PLUGIN_DRAW_INVARIANT_PLAN.md` amendment, migration 2).
    pub(super) fn on_toggle_debug(&mut self, _ctx: &Context<Self>) -> bool {
        self.debug_open = !self.debug_open;
        true
    }
}
