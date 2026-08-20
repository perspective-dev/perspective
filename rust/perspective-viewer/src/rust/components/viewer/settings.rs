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
use crate::presentation::{ColumnSettingsTab, ColumnSettingsTarget, OpenColumnSettings};
use crate::queries::get_current_column_locator;
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
                self.init_toggle_settings_task(ctx, Some(false), announce, resolve);
                false
            },
            (Some(SettingsUpdate::Update(force)), resolve) => {
                self.init_toggle_settings_task(ctx, Some(force), announce, resolve);
                false
            },
            (None, resolve) => {
                self.init_toggle_settings_task(ctx, None, announce, resolve);
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
        announce: bool,
        sender: Option<Sender<ApiResult<JsValue>>>,
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
                            let presents = presize_visible_panels_grown(&workspace, &elem).await;
                            let (notify, rendered) = channel::<()>();
                            callback.emit(notify);
                            presentation.set_settings_open(false, announce);
                            rendered.await?;
                            // `notify` fires in `rendered()` (same task as the
                            // Yew DOM patch) and this future resumes as one of
                            // its microtasks — so the staged reveal below and
                            // the pane's geometry change reach the screen in a
                            // single paint.
                            presents.reveal();
                            // I6: the exactness-finalizer resize is part of
                            // what this toggle caused — await it here rather
                            // than leaving it to the ResizeObserver (whose
                            // continuous pass remains as the reactive
                            // backstop).
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
                let presents =
                    presize_visible_panels_pane_width(&workspace, &elem, pane_width as f64).await;
                link.send_message(SettingsDividerCommit(pane_width));
                // Same task as the commit's re-render (whether Yew drained it
                // synchronously inside `send_message` or deferred it to a
                // microtask): the staged reveal and the pane-width geometry
                // land in one paint.
                presents.reveal();
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
        target: Option<ColumnSettingsTarget>,
        sender: Option<Sender<()>>,
        toggle: bool,
    ) -> bool {
        let mut open_column_settings = ctx.props().presentation.get_open_column_settings();
        if target == open_column_settings.target {
            if toggle {
                ctx.props().presentation.set_open_column_settings(None);
            }
        } else {
            open_column_settings.target.clone_from(&target);
            open_column_settings.tab = match &target {
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

    pub(super) fn on_column_settings_panel_size_update(&mut self, x: Option<i32>) -> bool {
        self.settings_geometry.column_settings_width_override = x;
        if x.is_none() {
            self.settings_geometry.column_settings_auto_width = 0.0;
            true
        } else {
            false
        }
    }

    pub(super) fn on_column_settings_panel_auto_width(&mut self, w: f64) -> bool {
        if w > self.settings_geometry.column_settings_auto_width {
            self.settings_geometry.column_settings_auto_width = w;
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

        self.presize_column_settings_shift(ctx, delta_w, ToggleColumnSettingsPinComplete);
        false
    }

    pub(super) fn on_toggle_column_settings_pin_complete(&mut self, resolve: Sender<()>) -> bool {
        self.settings_geometry.column_settings_pinned =
            !self.settings_geometry.column_settings_pinned;
        self.on_rendered.push(resolve);
        true
    }

    /// Shared presize choreography for a column-settings geometry shift:
    /// pre-size every visible panel by `delta_w` (`None` = no sweep, commit
    /// only), send `commit_msg` to apply the deferred state on the render
    /// commit, reveal the staged frames in that same paint, then reactively
    /// finalize at the exact settled cells (I6).
    fn presize_column_settings_shift(
        &self,
        ctx: &Context<Self>,
        delta_w: Option<f64>,
        commit_msg: fn(Sender<()>) -> super::msg::PerspectiveViewerMsg,
    ) {
        let workspace = ctx.props().workspace.clone();
        let elem = ctx.props().elem.clone();
        let callback = ctx.link().callback(commit_msg);
        ApiFuture::spawn(async move {
            let presents = match delta_w {
                Some(delta_w) => presize_visible_panels_open(&workspace, &elem, delta_w, 0.0).await,
                None => StagedPresents::default(),
            };

            let (notify, rendered) = channel::<()>();
            callback.emit(notify);
            rendered.await?;
            presents.reveal();
            resize_visible_panels(&workspace).await;
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

        self.presize_column_settings_shift(ctx, delta_w, UpdateColumnSettingsCommit);
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
