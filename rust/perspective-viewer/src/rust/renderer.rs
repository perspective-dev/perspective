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

//! `Renderer` owns the JavaScript Custom Element plugin, as well as
//! associated state such as column restrictions and `plugin_config`
//! (de-)serialization.
//!
//! `Renderer` wraps a smart pointer and is meant to be shared among many
//! references throughout the application.

mod activate;
mod limits;
mod plugin_store;
mod registry;
mod render_timer;

use std::cell::{Ref, RefCell};
use std::collections::HashMap;
use std::future::Future;
use std::ops::Deref;
use std::pin::Pin;
use std::rc::Rc;

use futures::future::{join_all, select_all};
use perspective::json;
use perspective::utils::{ApiError, ApiResult};
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;

use self::activate::*;
use self::limits::*;
use self::plugin_store::*;
pub use self::registry::*;
use self::render_timer::*;
use crate::config::*;
use crate::js::plugin::*;
use crate::presentation::ColumnConfigMap;
use crate::session::*;
use crate::utils::*;

#[derive(Clone)]
pub struct Renderer(Rc<RendererData>);

/// Immutable state
pub struct RendererData {
    plugin_data: RefCell<RendererMutData>,
    draw_lock: DebounceMutex,
    pub plugin_changed: PubSub<JsPerspectiveViewerPlugin>,
    pub session_changed: PubSub<(bool, RenderLimits)>,
}

/// Mutable state
pub struct RendererMutData {
    viewer_elem: HtmlElement,
    metadata: ViewConfigRequirements,
    plugin_store: PluginStore,
    plugins_idx: Option<usize>,
    timer: MovingWindowRenderTimer,
}

type RenderLimits = (usize, usize, Option<usize>, Option<usize>);

impl Deref for Renderer {
    type Target = RendererData;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq for Renderer {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

impl ImplicitClone for Renderer {}

impl Deref for RendererData {
    type Target = RefCell<RendererMutData>;

    fn deref(&self) -> &Self::Target {
        &self.plugin_data
    }
}

type TaskResult = ApiResult<JsValue>;
type TimeoutTask<'a> = Pin<Box<dyn Future<Output = Option<TaskResult>> + 'a>>;

/// How long to await a call to the plugin's `draw()` before resizing.
static PRESIZE_TIMEOUT: i32 = 500;

impl Renderer {
    pub fn new(viewer_elem: &HtmlElement) -> Self {
        Self(Rc::new(RendererData {
            plugin_data: RefCell::new(RendererMutData {
                viewer_elem: viewer_elem.clone(),
                metadata: ViewConfigRequirements::default(),
                plugin_store: PluginStore::default(),
                plugins_idx: None,
                timer: MovingWindowRenderTimer::default(),
            }),
            draw_lock: Default::default(),
            plugin_changed: Default::default(),
            session_changed: Default::default(),
        }))
    }

    pub async fn reset(&self, columns_config: Option<&ColumnConfigMap>) {
        self.0.borrow_mut().plugins_idx = None;
        if let Ok(plugin) = self.get_active_plugin() {
            plugin.restore(&json!({}), columns_config);
        }
    }

    pub fn delete(&self) -> ApiResult<()> {
        self.get_active_plugin()?.delete();
        Ok(())
    }

    pub fn metadata(&self) -> Ref<'_, ViewConfigRequirements> {
        Ref::map(self.borrow(), |x| &x.metadata)
    }

    /// Return all plugin instances, whether they are active or not.  Useful
    /// for configuring all or specific plugins at application init.
    pub fn get_all_plugins(&self) -> Vec<JsPerspectiveViewerPlugin> {
        self.0.borrow_mut().plugin_store.plugins().clone()
    }

    /// Return all plugin names, whether they are active or not.
    pub fn get_all_plugin_categories(&self) -> HashMap<String, Vec<String>> {
        self.0.borrow_mut().plugin_store.plugin_records().clone()
    }

    /// Gets the currently active plugin.  Calling this method before a plugin
    /// has been selected will cause the default (first) plugin to be
    /// selected, and doing so when no plugins have been registered is an
    /// error.
    pub fn get_active_plugin(&self) -> ApiResult<JsPerspectiveViewerPlugin> {
        if self.0.borrow().plugins_idx.is_none() {
            self.set_plugin(Some(&PLUGIN_REGISTRY.default_plugin_name()))?;
        }

        let idx = self.0.borrow().plugins_idx.unwrap_or(0);
        let result = self.0.borrow_mut().plugin_store.plugins().get(idx).cloned();
        Ok(result.ok_or("No Plugin")?)
    }

    /// Gets a specific `JsPerspectiveViewerPlugin` by name.
    ///
    /// # Arguments
    /// - `name` The plugin name to lookup.
    pub fn get_plugin(&self, name: &str) -> ApiResult<JsPerspectiveViewerPlugin> {
        let idx = self.find_plugin_idx(name);
        let idx = idx.ok_or_else(|| JsValue::from(format!("No Plugin `{}`", name)))?;
        let result = self.0.borrow_mut().plugin_store.plugins().get(idx).cloned();
        Ok(result.unwrap())
    }

    pub async fn restyle_all(&self, view: &perspective_client::View) -> ApiResult<JsValue> {
        let plugins = self.get_all_plugins();
        let tasks = plugins
            .iter()
            .map(|plugin| plugin.restyle(view.clone().into()));

        join_all(tasks)
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .map(|_| JsValue::UNDEFINED)
    }

    pub fn set_throttle(&self, val: Option<f64>) {
        self.0.borrow_mut().timer.set_throttle(val);
    }

    pub fn disable_active_plugin_render_warning(&self) {
        self.borrow_mut().metadata.render_warning = false;
        self.get_active_plugin().unwrap().set_render_warning(false);
    }

    /// Set the active plugin to the plugin registerd as `name`, or the default
    /// plugin if `None` is provided.
    ///
    /// # Arguments
    /// - `update` The `PluginUpdate` behavior to set.
    pub fn update_plugin(&self, update: &PluginUpdate) -> ApiResult<bool> {
        match update {
            PluginUpdate::Missing => Ok(false),
            PluginUpdate::SetDefault => self.set_plugin(None),
            PluginUpdate::Update(plugin) => self.set_plugin(Some(plugin)),
        }
    }

    fn set_plugin(&self, name: Option<&str>) -> ApiResult<bool> {
        let default_plugin_name = PLUGIN_REGISTRY.default_plugin_name();
        let name = name.unwrap_or(default_plugin_name.as_str());
        let idx = self
            .find_plugin_idx(name)
            .ok_or_else(|| JsValue::from(format!("Unknown plugin '{}'", name)))?;

        let changed = !matches!(
            self.0.borrow().plugins_idx,
            Some(selected_idx) if selected_idx == idx
        );

        if changed {
            self.borrow_mut().plugins_idx = Some(idx);
            let plugin: JsPerspectiveViewerPlugin = self.get_active_plugin()?;
            self.borrow_mut().metadata = plugin.get_requirements()?;
            self.plugin_changed.emit(plugin);
        }

        Ok(changed)
    }

    pub async fn with_lock<T>(self, task: impl Future<Output = ApiResult<T>>) -> ApiResult<T> {
        let draw_mutex = self.draw_lock();
        draw_mutex.lock(task).await
    }

    pub async fn resize(&self) -> ApiResult<()> {
        let draw_mutex = self.draw_lock();
        let timer = self.render_timer();
        draw_mutex
            .debounce(async {
                set_timeout(timer.get_throttle()).await?;
                let jsplugin = self.get_active_plugin()?;
                jsplugin.resize().await?;
                Ok(())
            })
            .await
    }

    /// This will take a future which _should_ create a new view and then will
    /// draw it.
    pub async fn draw(
        &self,
        session: impl Future<Output = Result<&Session, ApiError>>,
    ) -> ApiResult<()> {
        self.draw_plugin(session, false).await
    }

    /// This will update an already existing view
    pub async fn update(&self, session: &Session) -> ApiResult<()> {
        self.draw_plugin(async { Ok(session) }, true).await
    }

    async fn draw_plugin(
        &self,
        session: impl Future<Output = Result<&Session, ApiError>>,
        is_update: bool,
    ) -> ApiResult<()> {
        let timer = self.render_timer();
        let task = async move {
            if is_update {
                set_timeout(timer.get_throttle()).await?;
            }

            if let Some(view) = session.await?.get_view() {
                timer.capture_time(self.draw_view(&view, is_update)).await
            } else {
                Ok(())
            }
        };

        let draw_mutex = self.draw_lock();
        if is_update {
            draw_mutex.debounce(task).await
        } else {
            draw_mutex.lock(task).await
        }
    }

    async fn draw_view(&self, view: &perspective_client::View, is_update: bool) -> ApiResult<()> {
        let plugin = self.get_active_plugin()?;
        let meta = self.metadata().clone();
        let limits = get_row_and_col_limits(view, &meta).await?;
        self.session_changed.emit((is_update, limits));
        let viewer_elem = &self.0.borrow().viewer_elem.clone();
        if is_update {
            let task = plugin.update(view.clone().into(), limits.2, limits.3, false);
            activate_plugin(viewer_elem, &plugin, task).await
        } else {
            let task = plugin.draw(view.clone().into(), limits.2, limits.3, false);
            activate_plugin(viewer_elem, &plugin, task).await
        }
    }

    /// Decide whether to draw plugin or self first based on whether the panel
    /// is opening or closing, then draw with a timeout.  If the timeout
    /// triggers, draw self and resolve `on_toggle` but still await the
    /// completion of the draw task
    pub async fn presize(
        &self,
        open: bool,
        on_toggle: impl Future<Output = ApiResult<()>>,
    ) -> ApiResult<JsValue> {
        let task = self.resize_with_timeout(open);
        let result = if open {
            on_toggle.await?;
            task.await
        } else {
            let result = task.await;
            on_toggle.await?;
            result
        };

        match result {
            Ok(x) => x,
            Err(cont) => {
                tracing::warn!("Presize took longer than {}ms", PRESIZE_TIMEOUT);
                cont.await.unwrap()
            },
        }
    }

    /// Lock on `resize()` task, in parallel with a timeout.  In the return
    /// type, `Result::Err` contains the continuation task, which must be
    /// awaited lest the plugin draw itself never trigger.
    async fn resize_with_timeout(&self, open: bool) -> Result<TaskResult, TimeoutTask<'_>> {
        let task = async move {
            if open {
                self.get_active_plugin()?.resize().await
            } else {
                self.resize_with_explicit_dimensions().await
            }
        };

        let draw_lock = self.draw_lock();
        let tasks: [TimeoutTask<'_>; 2] = [
            Box::pin(async move { Some(draw_lock.lock(task).await) }),
            Box::pin(async {
                set_timeout(PRESIZE_TIMEOUT).await.unwrap();
                None
            }),
        ];

        let (x, _, y) = select_all(tasks.into_iter()).await;
        x.ok_or_else(|| y.into_iter().next().unwrap())
    }

    /// Resize the `<div>` offscreen, then resize the plugin
    async fn resize_with_explicit_dimensions(&self) -> TaskResult {
        let plugin = self.get_active_plugin()?;
        let main_panel: &web_sys::HtmlElement = plugin.unchecked_ref();
        let new_width = format!("{}px", &self.0.borrow().viewer_elem.client_width());
        let new_height = format!("{}px", &self.0.borrow().viewer_elem.client_height());
        main_panel.style().set_property("width", &new_width)?;
        main_panel.style().set_property("height", &new_height)?;
        let result = plugin.resize().await;
        main_panel.style().set_property("width", "")?;
        main_panel.style().set_property("height", "")?;
        result
    }

    fn draw_lock(&self) -> DebounceMutex {
        self.draw_lock.clone()
    }

    pub fn render_timer(&self) -> MovingWindowRenderTimer {
        self.0.borrow().timer.clone()
    }

    fn find_plugin_idx(&self, name: &str) -> Option<usize> {
        let short_name = make_short_name(name);
        self.0
            .borrow_mut()
            .plugin_store
            .plugins()
            .iter()
            .position(|elem| make_short_name(&elem.name()).contains(&short_name))
    }
}

fn make_short_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|x| x.is_alphabetic())
        .collect()
}
