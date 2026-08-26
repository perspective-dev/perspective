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

//! The [`Renderer`]'s LOCKED dispatch tier: everything that touches the
//! active plugin element under the per-renderer draw lock — the
//! `render_task` pipeline entry, the `draw_fresh`/`update_bound` dispatches,
//! restyle, resize and the presize protocol.

use std::future::Future;
use std::rc::Rc;

use perspective_client::View;
use perspective_js::utils::{ApiResult, ResultTApiErrorExt};
use wasm_bindgen::prelude::*;
use web_sys::*;

use super::activate::*;
use super::limits::*;
use super::{ContextPin, GeometryCmd, RenderContext, Renderer, SUBPIXEL_EPSILON};
use crate::js::plugin::*;
use crate::session::FreshView;
use crate::utils::*;

impl Renderer {
    /// Toggle the `active` and panel-count (`single`/`multi`) classes on
    /// `plugin`.
    fn stamp_active(&self, plugin: &JsPerspectiveViewerPlugin) {
        let el = plugin.unchecked_ref::<HtmlElement>();
        let _ = el
            .class_list()
            .toggle_with_force("active", self.0.is_active_panel.get());

        let is_solo = self.0.is_solo_panel.get();
        let _ = el.class_list().toggle_with_force("single", is_solo);
        let _ = el.class_list().toggle_with_force("multi", !is_solo);
    }

    /// Stamp this panel's effective `theme` attribute.
    pub fn stamp_theme(&self, plugin: Option<&JsPerspectiveViewerPlugin>) {
        let active_plugin = self.active_plugin();
        if let Some(plugin) = plugin.or(active_plugin.as_ref()) {
            let theme_elem = plugin.unchecked_ref::<HtmlElement>();
            match self.theme() {
                Some(theme)
                    if theme_elem.get_attribute("theme").as_deref() != Some(theme.as_str()) =>
                {
                    let _ = theme_elem.set_attribute("theme", &theme);
                },
                Some(_) => {},
                None => {
                    let _ = theme_elem.remove_attribute("theme");
                },
            }
        }
    }

    /// Restyle the active plugin and re-draw.
    pub async fn restyle_all(&self) -> ApiResult<JsValue> {
        self.render_task(|guard| async move {
            let Some(ctx) = self.cached_context() else {
                return Ok(JsValue::UNDEFINED);
            };

            let _pin = self.pin_context(&guard, ctx.clone());
            let plugin = self.ensure_plugin_selected()?;
            let meta = self.metadata();
            let stamped_theme = self.theme();
            self.stamp_theme(Some(&plugin));
            self.stamp_active(&plugin);
            plugin.restyle();
            *self.0.captured_theme.borrow_mut() = Some(stamped_theme);
            let mut limits =
                get_row_and_col_limits(&ctx.view, &meta, self.is_render_warning_enabled()).await?;

            limits.is_update = true;
            plugin
                .update(
                    ctx.view.clone().into(),
                    limits.max_cols,
                    limits.max_rows,
                    false,
                )
                .await?;

            Ok(JsValue::UNDEFINED)
        })
        .await
    }

    pub async fn with_lock<T>(self, task: impl Future<Output = ApiResult<T>>) -> ApiResult<T> {
        let draw_mutex = self.draw_lock();
        draw_mutex.lock(task).await
    }

    /// The [`RenderContext`] pinned by the run currently holding this
    /// renderer's draw lock, if any. The per-panel element getters answer
    /// from this when present (invariant I5).
    pub fn render_context(&self) -> Option<Rc<RenderContext>> {
        self.0.active_context.borrow().clone()
    }

    /// The cached [`RenderContext`] of the currently-bound `View` (set by
    /// the pipeline at bind time).
    pub fn cached_context(&self) -> Option<Rc<RenderContext>> {
        self.0.cached_context.borrow().clone()
    }

    /// Cache `ctx` as the bound view's context (pipeline, at bind time).
    pub fn set_cached_context(&self, ctx: Rc<RenderContext>) {
        *self.0.cached_context.borrow_mut() = Some(ctx);
    }

    /// Pin `ctx` as the active [`RenderContext`] for the duration of the
    /// returned RAII guard. Requires the lock witness — a context can only
    /// be pinned by a locked run.
    pub fn pin_context(&self, _guard: &RenderGuard, ctx: Rc<RenderContext>) -> ContextPin {
        *self.0.active_context.borrow_mut() = Some(ctx);
        ContextPin(self.clone())
    }

    /// `true` while a run is executing on this renderer's draw lock.
    pub fn is_locked(&self) -> bool {
        self.draw_lock.is_held()
    }

    pub async fn resize(&self) -> ApiResult<()> {
        self.0.geometry_cmd.set(Some(GeometryCmd::Measure));

        // This caller queued a `Measure`, but the parked run it resolves
        // through executes the LATEST `geometry_cmd` — which a concurrent
        // presize sweep may have swapped to a `Presize` whose sweep
        // coalesced (and so received `None`). Any present closure returned
        // here is therefore held by no one else: invoke it, or the
        // transport's present-hold leaks and the plot freezes on its
        // last-blitted frame.
        if let Some(present) = self.geometry_task().await? {
            present.call0(&JsValue::NULL)?;
        }

        Ok(())
    }

    /// Public one-shot resize to explicit dimensions (`viewer.resize({
    /// dimensions })`).
    pub async fn resize_with_dimensions(&self, width: f64, height: f64) -> ApiResult<()> {
        if let Some(present) = self.presize_with_dimensions(width, height).await? {
            present.call0(&JsValue::NULL)?;
        }

        Ok(())
    }

    /// Render every changed pixel of a pending `(width, height)` box.
    pub async fn presize_with_dimensions(
        &self,
        width: f64,
        height: f64,
    ) -> ApiResult<Option<js_sys::Function>> {
        let _pending = PresizePendingGuard::increment(self);
        self.presize_inner(None, width, height).await
    }

    /// Pre-size AND pre-position the plugin to its target layout bo.
    pub async fn presize_with_box(
        &self,
        dx: f64,
        dy: f64,
        width: f64,
        height: f64,
    ) -> ApiResult<Option<js_sys::Function>> {
        let _pending = PresizePendingGuard::increment(self);
        self.presize_inner(Some((dx, dy)), width, height).await
    }

    async fn presize_inner(
        &self,
        translate: Option<(f64, f64)>,
        width: f64,
        height: f64,
    ) -> ApiResult<Option<js_sys::Function>> {
        self.0.geometry_cmd.set(Some(GeometryCmd::Presize {
            translate,
            width,
            height,
        }));

        self.geometry_task().await
    }

    /// Run the LATEST queued [`GeometryCmd`] on the geometry debounce slot.
    async fn geometry_task(&self) -> ApiResult<Option<js_sys::Function>> {
        let timer = self.render_timer();
        self.0
            .geometry_slot
            .clone()
            .debounce_with(|_guard| async move {
                let Some(cmd) = self.0.geometry_cmd.take() else {
                    return Ok(None);
                };

                match cmd {
                    GeometryCmd::Measure => {
                        set_timeout(timer.get_throttle()).await?;
                        let Some(jsplugin) = self.active_plugin() else {
                            return Ok(None);
                        };

                        self.stamp_active(&jsplugin);
                        jsplugin.resize().await?;
                        Ok(None)
                    },
                    GeometryCmd::Presize {
                        translate,
                        width,
                        height,
                    } => self.run_presize(translate, width, height).await,
                }
            })
            .await
    }

    async fn run_presize(
        &self,
        translate: Option<(f64, f64)>,
        width: f64,
        height: f64,
    ) -> ApiResult<Option<js_sys::Function>> {
        let Some(plugin) = self.active_plugin() else {
            return Ok(None);
        };

        self.stamp_active(&plugin);
        self.clear_presize()?;
        if plugin.capabilities().presize {
            return plugin.presize(width, height).await;
        }

        let main_panel: &web_sys::HtmlElement = plugin.unchecked_ref();
        let rect = main_panel.get_bounding_client_rect();
        let size_changed = (height - rect.height()).abs() > SUBPIXEL_EPSILON
            || (width - rect.width()).abs() > SUBPIXEL_EPSILON;

        let (dx, dy) = translate.unwrap_or((0.0, 0.0));
        let moved = dx.abs() > SUBPIXEL_EPSILON || dy.abs() > SUBPIXEL_EPSILON;
        if !size_changed && !moved {
            return Ok(None);
        }

        if size_changed {
            main_panel
                .style()
                .set_property("width", &format!("{width}px"))?;
            main_panel
                .style()
                .set_property("height", &format!("{height}px"))?;
        }

        if moved {
            main_panel
                .style()
                .set_property("transform", &format!("translate({dx}px, {dy}px)"))?;
        }

        if size_changed {
            let result = plugin.resize().await;
            if translate.is_none() {
                main_panel.style().set_property("width", "")?;
                main_panel.style().set_property("height", "")?;
            }

            result?;
        }

        Ok(None)
    }

    /// Remove the inline presize styles applied by [`Self::presize_with_box`].
    pub fn clear_presize(&self) -> ApiResult<()> {
        if let Some(plugin) = self.active_plugin() {
            let el = plugin.unchecked_ref::<web_sys::HtmlElement>();
            el.style().set_property("width", "")?;
            el.style().set_property("height", "")?;
            el.style().set_property("transform", "")?;
        }

        Ok(())
    }

    pub async fn render_task<T, F, Fut>(&self, f: F) -> ApiResult<T>
    where
        F: FnOnce(RenderGuard) -> Fut,
        Fut: Future<Output = ApiResult<T>>,
    {
        self.draw_lock().lock_with(f).await
    }

    /// FULL-draw a NEW `View` on the active plugin (`plugin.draw`).
    pub async fn draw_fresh(&self, guard: &RenderGuard, view: FreshView) -> ApiResult<()> {
        let timer = self.render_timer();
        timer
            .capture_time(self.draw_view(guard, view.view(), false))
            .await
    }

    /// Repaint the ALREADY-BOUND `view` on the active plugin.
    pub async fn update_bound(&self, guard: &RenderGuard, view: &View) -> ApiResult<()> {
        let timer = self.render_timer();
        timer.capture_time(self.draw_view(guard, view, true)).await
    }

    /// Mint the [`FreshView`] full-draw witness for a plugin that has never
    /// painted the bound `View`.
    pub fn promote_first_paint(&self, view: &View) -> Option<FreshView> {
        if !self.0.has_drawn.get() {
            Some(FreshView::assert_fresh(view.clone()))
        } else {
            None
        }
    }

    /// Whether the active plugin's element is currently hidden.
    pub fn is_plugin_hidden(&self) -> bool {
        match self.active_plugin() {
            Some(plugin) => plugin
                .unchecked_ref::<web_sys::HtmlElement>()
                .offset_parent()
                .is_none(),
            None => false,
        }
    }

    /// Record a `table_updated` redraw dropped while hidden (see
    /// [`RendererData::data_stale`]).
    pub fn set_data_stale(&self) {
        self.0.data_stale.set(true);
    }

    /// Consume the dropped-update marker; the caller owes a full
    /// `plugin.update` dispatch when `true`.
    pub fn take_data_stale(&self) -> bool {
        self.0.data_stale.replace(false)
    }

    pub async fn activation_repaint(&self, _guard: &RenderGuard) -> ApiResult<()> {
        if let Some(plugin) = self.active_plugin() {
            self.stamp_active(&plugin);
            self.stamp_theme(Some(&plugin));
            let _ = plugin.resize().await?;
        }

        Ok(())
    }

    /// Redraw an already-bound view, debounced.
    pub async fn update_lazy(
        &self,
        view: impl Future<Output = ApiResult<Option<View>>>,
    ) -> ApiResult<()> {
        let timer = self.render_timer();
        self.draw_lock()
            .debounce_with(|guard| async move {
                set_timeout(timer.get_throttle()).await?;
                if self.0.presize_pending.get() > 0 {
                    // Record the drop like the hidden-panel path
                    // (`wire_panel_render_sub`) does — a silently
                    // discarded update otherwise leaves the plugin's
                    // retained frame stale until the NEXT data tick,
                    // or forever if none comes. `draw_view` /
                    // `activation_render` consume the marker.
                    tracing::debug!("Update skipped, presize pending");
                    self.set_data_stale();
                    return Ok(());
                }

                self.mount_active_plugin()?;
                if let Some(view) = view.await? {
                    let _pin = self
                        .cached_context()
                        .map(|ctx| self.pin_context(&guard, ctx));

                    let timer = self.render_timer();
                    timer
                        .capture_time(self.draw_view(&guard, &view, true))
                        .await
                } else {
                    tracing::debug!("Render skipped, no `View` attached");
                    Ok(())
                }
            })
            .await
    }

    async fn draw_view(
        &self,
        _guard: &RenderGuard,
        view: &perspective_client::View,
        is_update: bool,
    ) -> ApiResult<()> {
        debug_assert!(
            !is_update || self.cached_context().is_none() || self.render_context().is_some(),
            "I5: RenderContext not pinned at plugin dispatch"
        );

        let plugin = if is_update {
            match self.active_plugin() {
                Some(plugin) => plugin,
                None => return Ok(()),
            }
        } else {
            self.ensure_plugin_selected()?
        };

        let meta = self.metadata();
        let mut limits =
            get_row_and_col_limits(view, &meta, self.is_render_warning_enabled()).await?;

        limits.is_update = is_update;
        if let Some(cb) = self.0.on_render_limits_changed.borrow().as_ref() {
            cb.emit(limits);
        }

        let viewer_elem = self.0.borrow().viewer_elem.clone();
        let slot = self.slot_name();
        let first_paint = !self.0.has_drawn.get();
        let stamped_theme = self.theme();
        self.stamp_active(&plugin);
        self.stamp_theme(Some(&plugin));
        if self.needs_restyle() {
            plugin.restyle();
            *self.0.captured_theme.borrow_mut() = Some(stamped_theme.clone());
        }

        self.0.data_stale.set(false);
        let result = if is_update {
            let task = plugin.update(view.clone().into(), limits.max_cols, limits.max_rows, false);
            activate_plugin(_guard, &viewer_elem, &plugin, slot.as_deref(), task).await
        } else {
            let task = plugin.draw(view.clone().into(), limits.max_cols, limits.max_rows, false);
            activate_plugin(_guard, &viewer_elem, &plugin, slot.as_deref(), task).await
        };

        if result.is_ok() {
            self.0.has_drawn.set(true);
            if first_paint {
                *self.0.captured_theme.borrow_mut() = Some(stamped_theme);
            }
        }

        let cleanup = remove_inactive_plugin(
            &viewer_elem,
            &plugin,
            slot.as_deref(),
            self.plugin_data.borrow_mut().plugin_store.plugins(),
        );

        match result.ignore_view_delete() {
            Err(error) if !self.0.has_drawn.get() => Err(error),
            Err(error) => {
                tracing::warn!("{}", error);
                cleanup
            },
            Ok(_) => cleanup,
        }
    }

    fn draw_lock(&self) -> DebounceMutex {
        self.draw_lock.clone()
    }
}

/// RAII increment of [`RendererData::presize_pending`], the counter that
/// gates [`Renderer::update_lazy`] dispatches. Decrementing on `Drop`
/// (not on the happy path) makes the release unconditional — a presize
/// future cancelled mid-await can never strand the counter above zero,
/// which would silently discard every subsequent debounced update for
/// the panel's lifetime.
struct PresizePendingGuard(Renderer);

impl PresizePendingGuard {
    fn increment(renderer: &Renderer) -> Self {
        let cell = &renderer.0.presize_pending;
        cell.set(cell.get() + 1);
        Self(renderer.clone())
    }
}

impl Drop for PresizePendingGuard {
    fn drop(&mut self) {
        let cell = &self.0.0.presize_pending;
        cell.set(cell.get() - 1);
    }
}
