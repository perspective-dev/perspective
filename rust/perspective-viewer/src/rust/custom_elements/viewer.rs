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

use std::cell::RefCell;
use std::rc::Rc;
use std::str::FromStr;

use ::perspective::utils::global;
use ::perspective::{JsTable, JsView};
use js_sys::*;
use perspective_client::config::ViewConfigUpdate;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::*;
use yew::prelude::*;

use crate::components::viewer::{PerspectiveViewer, PerspectiveViewerMsg, PerspectiveViewerProps};
use crate::config::*;
use crate::custom_events::*;
use crate::dragdrop::*;
use crate::js::*;
use crate::model::*;
use crate::presentation::*;
use crate::renderer::*;
use crate::session::Session;
use crate::utils::*;
use crate::*;

/// A `customElements` class which encapsulates both the `<perspective-viewer>`
/// public API, as well as the Rust component state.
///
///     ┌───────────────────────────────────────────┐
///     │ Custom Element                            │
///     │┌──────────────┐┌─────────────────────────┐│
///     ││ yew::app     ││ Model                   ││
///     ││┌────────────┐││┌─────────┐┌────────────┐││
///     │││ Components ││││ Session ││ Renderer   │││
///     ││└────────────┘│││┌───────┐││┌──────────┐│││
///     │└──────────────┘│││ Table ││││ Plugin   ││││
///     │┌──────────────┐││└───────┘││└──────────┘│││
///     ││ HtmlElement  │││┌───────┐│└────────────┘││
///     │└──────────────┘│││ View  ││┌────────────┐││
///     │                ││└───────┘││ DragDrop   │││
///     │                │└─────────┘└────────────┘││
///     │                │┌──────────────┐┌───────┐││
///     │                ││ CustomEvents ││ Theme │││
///     │                │└──────────────┘└───────┘││
///     │                └─────────────────────────┘│
///     └───────────────────────────────────────────┘
#[wasm_bindgen]
pub struct PerspectiveViewerElement {
    elem: HtmlElement,
    root: Rc<RefCell<Option<AppHandle<PerspectiveViewer>>>>,
    resize_handle: Rc<RefCell<Option<ResizeObserverHandle>>>,
    intersection_handle: Rc<RefCell<Option<IntersectionObserverHandle>>>,
    session: Session,
    renderer: Renderer,
    presentation: Presentation,
    _events: CustomEvents,
    _subscriptions: Rc<Subscription>,
}

derive_model!(Renderer, Session, Presentation for PerspectiveViewerElement);

impl CustomElementMetadata for PerspectiveViewerElement {
    const CUSTOM_ELEMENT_NAME: &'static str = "perspective-viewer";
    const STATICS: &'static [&'static str] = ["registerPlugin", "getExprTKCommands"].as_slice();
}

#[wasm_bindgen]
impl PerspectiveViewerElement {
    #[wasm_bindgen(constructor)]
    pub fn new(elem: web_sys::HtmlElement) -> Self {
        tracing::debug!("Creating <perspective-viewer>");
        let init = web_sys::ShadowRootInit::new(web_sys::ShadowRootMode::Open);
        let shadow_root = elem
            .attach_shadow(&init)
            .unwrap()
            .unchecked_into::<web_sys::Element>();

        // Application State
        let session = Session::default();
        let renderer = Renderer::new(&elem);
        let presentation = Presentation::new(&elem);
        let events = CustomEvents::new(&elem, &session, &renderer, &presentation);

        // Create Yew App
        let props = yew::props!(PerspectiveViewerProps {
            elem: elem.clone(),
            session: session.clone(),
            renderer: renderer.clone(),
            presentation: presentation.clone(),
            dragdrop: DragDrop::default(),
            custom_events: events.clone(),
            weak_link: WeakScope::default(),
        });

        let root = yew::Renderer::with_root_and_props(shadow_root, props).render();

        // Create callbacks
        let update_sub = session.table_updated.add_listener({
            clone!(renderer, session);
            move |_| {
                clone!(renderer, session);
                ApiFuture::spawn(async move { renderer.update(&session).await })
            }
        });

        let resize_handle = ResizeObserverHandle::new(&elem, &renderer, &root);
        Self {
            elem,
            root: Rc::new(RefCell::new(Some(root))),
            session,
            renderer,
            presentation,
            resize_handle: Rc::new(RefCell::new(Some(resize_handle))),
            intersection_handle: Rc::new(RefCell::new(None)),
            _events: events,
            _subscriptions: Rc::new(update_sub),
        }
    }

    #[wasm_bindgen(js_name = "connectedCallback")]
    pub fn connected_callback(&self) {
        tracing::debug!("Connected <perspective-viewer>");
    }

    /// Loads a promise to a `JsPerspectiveTable` in this viewer.  Historically,
    /// `<perspective-viewer>` has accepted either a `Promise` or `Table` as an
    /// argument, so we preserve that behavior here with some loss of type
    /// precision.
    pub fn load(&self, table: JsValue) -> ApiFuture<()> {
        tracing::info!("Loading Table");
        let promise = table
            .clone()
            .dyn_into::<js_sys::Promise>()
            .unwrap_or_else(|_| js_sys::Promise::resolve(&table));

        let mut config = ViewConfigUpdate {
            columns: Some(self.session.get_view_config().columns.clone()),
            ..ViewConfigUpdate::default()
        };

        self.session
            .set_update_column_defaults(&mut config, &self.renderer.metadata());

        self.session.update_view_config(config);
        clone!(self.renderer, self.session);
        ApiFuture::new(async move {
            let task = async {
                #[wasm_bindgen]
                extern "C" {
                    pub type Model;

                    #[wasm_bindgen(method)]
                    pub fn unsafe_get_model(this: &Model) -> *const JsTable;
                }

                let jstable = JsFuture::from(promise).await?.unchecked_into::<Model>();

                pub fn unsafe_set_model(ptr: *const JsTable) -> JsTable {
                    (unsafe { ptr.as_ref().unwrap() }).clone()
                }

                let table = unsafe_set_model(jstable.unsafe_get_model());

                tracing::debug!(
                    "Successfully loaded {:.0} rows from Table",
                    table.size().await?
                );

                session.reset_stats();
                session.set_table(table.get_table().clone()).await?;
                session.validate().await?.create_view().await
            };

            renderer.set_throttle(None);
            renderer.draw(task).await
        })
    }

    /// Delete the `View` and all associated state, rendering this
    /// `<perspective-viewer>` unusable and freeing all associated resources.
    /// Does not delete the supplied `Table` (as this is constructed by the
    /// callee).  Allowing a `<perspective-viewer>` to be garbage-collected
    /// without calling `delete()` will leak WASM memory.
    pub fn delete(&mut self) -> ApiFuture<bool> {
        clone!(self.renderer, self.session, self.root);
        ApiFuture::new(self.renderer.clone().with_lock(async move {
            renderer.delete()?;
            let result = session.delete();
            root.borrow_mut()
                .take()
                .ok_or("Already deleted!")?
                .destroy();

            tracing::info!(table_deleted = result, "Deleted <perspective-viewer>");
            Ok(result)
        }))
    }

    /// Get the underlying `View` for thie viewer.
    #[wasm_bindgen(js_name = "getView")]
    pub fn get_view(&self) -> ApiFuture<JsView> {
        let session = self.session.clone();
        ApiFuture::new(async move { Ok(session.get_view().ok_or("No table set")?.as_jsview()) })
    }

    /// Get the underlying `Table` for this viewer.
    ///
    /// # Arguments
    /// - `wait_for_table` whether to wait for `load()` to be called, or fail
    ///   immediately if `load()` has not yet been called.
    #[wasm_bindgen(js_name = "getTable")]
    pub fn get_table(&self, wait_for_table: Option<bool>) -> ApiFuture<JsTable> {
        let session = self.session.clone();
        ApiFuture::new(async move {
            match session.get_table() {
                Some(table) => Ok(table.into()),
                None if !wait_for_table.unwrap_or_default() => Err("No table set".into()),
                None => {
                    session.table_loaded.listen_once().await?;
                    Ok(session.get_table().ok_or("No table set")?.into())
                },
            }
        })
    }

    /// Get render statistics. Some fields of the returned stats object are
    /// relative to the last time `getRenderStats()` was called, ergo calling
    /// this method resets these fields.
    #[wasm_bindgen(js_name = "getRenderStats")]
    pub fn get_render_stats(&self) -> ApiResult<JsValue> {
        Ok(JsValue::from_serde_ext(
            &self.renderer.render_timer().get_stats(),
        )?)
    }

    /// Flush any pending modifications to this `<perspective-viewer>`.  Since
    /// `<perspective-viewer>`'s API is almost entirely `async`, it may take
    /// some milliseconds before any method call such as `restore()` affects
    /// the rendered element.  If you want to make sure any invoked method which
    /// affects the rendered has had its results rendered, call and await
    /// `flush()`
    pub fn flush(&self) -> ApiFuture<()> {
        clone!(self.renderer, self.session);
        ApiFuture::new(async move {
            if session.js_get_table().is_none() {
                session.table_loaded.listen_once().await?;
                let _ = session.js_get_table().ok_or("No table set")?;
            };

            renderer.draw(async { Ok(&session) }).await
        })
    }

    /// Restores this element from a full/partial `JsPerspectiveViewConfig`.
    ///
    /// # Arguments
    /// - `update` The config to restore to, as returned by `.save()` in either
    ///   "json", "string" or "arraybuffer" format.
    pub fn restore(&self, update: JsValue) -> ApiFuture<()> {
        tracing::info!("Restoring ViewerConfig");
        global::document().blur_active_element();
        clone!(self.session, self.renderer, self.root, self.presentation);
        ApiFuture::new(async move {
            let decoded_update = ViewerConfigUpdate::decode(&update)?;

            let ViewerConfigUpdate {
                plugin,
                plugin_config,
                columns_config,
                settings,
                theme: theme_name,
                title,
                mut view_config,
                ..//version
            } = decoded_update;

            if !session.has_table() {
                if let OptionalUpdate::Update(x) = settings {
                    presentation.set_settings_attribute(x);
                }
            }

            if let OptionalUpdate::Update(title) = title {
                presentation.set_title(Some(title));
            } else if matches!(title, OptionalUpdate::SetDefault) {
                presentation.set_title(None);
            }

            let needs_restyle = match theme_name {
                OptionalUpdate::SetDefault => {
                    let current_name = presentation.get_selected_theme_name().await;
                    if current_name.is_some() {
                        presentation.set_theme_name(None).await?;
                        true
                    } else {
                        false
                    }
                },
                OptionalUpdate::Update(x) => {
                    let current_name = presentation.get_selected_theme_name().await;
                    if current_name.is_some() && current_name.as_ref().unwrap() != &x {
                        presentation.set_theme_name(Some(&x)).await?;
                        true
                    } else {
                        false
                    }
                },
                _ => false,
            };

            let plugin_changed = renderer.update_plugin(&plugin)?;
            if plugin_changed {
                session.set_update_column_defaults(&mut view_config, &renderer.metadata());
            }

            session.update_view_config(view_config);
            let draw_task = renderer.draw(async {
                let task = root
                    .borrow()
                    .as_ref()
                    .ok_or("Already deleted")?
                    .send_message_async(move |x| {
                        PerspectiveViewerMsg::ToggleSettingsComplete(settings, x)
                    });

                let internal_task = async {
                    let plugin = renderer.get_active_plugin()?;
                    let plugin_update = if let Some(x) = plugin_config {
                        JsValue::from_serde_ext(&x).unwrap()
                    } else {
                        plugin.save()
                    };
                    presentation.update_columns_configs(columns_config);
                    let columns_config = presentation.all_columns_configs();
                    plugin.restore(&plugin_update, Some(&columns_config));
                    session.validate().await?.create_view().await
                }
                .await;

                task.await?;
                internal_task
            });

            draw_task.await?;

            // TODO this should be part of the API for `draw()` above, such that
            // the plugin need not render twice when a theme is provided.
            if needs_restyle {
                let view = session.get_view().into_apierror()?;
                renderer.restyle_all(&view).await?;
            }

            Ok(())
        })
    }

    /// Save this element to serialized state object, one which can be restored
    /// via the `.restore()` method.
    ///
    /// # Arguments
    /// - `format` Supports "json" (default), "arraybuffer" or "string".
    pub fn save(&self, format: Option<String>) -> ApiFuture<JsValue> {
        let viewer_config_task = self.get_viewer_config();
        ApiFuture::new(async move {
            let format = format
                .as_ref()
                .map(|x| ViewerConfigEncoding::from_str(x))
                .transpose()?;

            let viewer_config = viewer_config_task.await?;
            viewer_config.encode(&format)
        })
    }

    /// Download this viewer's `View` or `Table` data as a `.csv` file.
    ///
    /// # Arguments
    /// - `flat` Whether to use the current `ViewConfig` to generate this data,
    ///   or use the default.
    pub fn download(&self, flat: Option<bool>) -> ApiFuture<()> {
        let session = self.session.clone();
        ApiFuture::new(async move {
            let val = session
                .csv_as_jsvalue(flat.unwrap_or_default())
                .await?
                .as_blob()?;
            download("untitled.csv", &val)
        })
    }

    /// Copy this viewer's `View` or `Table` data as CSV to the system
    /// clipboard.
    ///
    /// # Arguments
    /// - `flat` Whether to use the current `ViewConfig` to generate this data,
    ///   or use the default.
    pub fn copy(&self, flat: Option<bool>) -> ApiFuture<()> {
        let method = if flat.unwrap_or_default() {
            ExportMethod::CsvAll
        } else {
            ExportMethod::Csv
        };

        let js_task = self.export_method_to_jsvalue(method);
        let copy_task = copy_to_clipboard(js_task, MimeType::TextPlain);
        ApiFuture::new(copy_task)
    }

    /// Reset the viewer's `ViewerConfig` to the default.
    ///
    /// # Arguments
    /// - `all` If set, will clear expressions and column settings as well.
    // TODO: We should replace the boolean value here with an options object.
    pub fn reset(&self, reset_expressions: Option<bool>) -> ApiFuture<()> {
        tracing::info!("Resetting config");
        let root = self.root.clone();
        let all = reset_expressions.unwrap_or_default();
        ApiFuture::new(async move {
            let task = root
                .borrow()
                .as_ref()
                .ok_or("Already deleted")?
                .send_message_async(move |x| PerspectiveViewerMsg::Reset(all, Some(x)));

            Ok(task.await?)
        })
    }

    /// Recalculate the viewer's dimensions and redraw.
    #[wasm_bindgen(js_name = "notifyResize")]
    pub fn resize(&self, force: Option<bool>) -> ApiFuture<()> {
        if !force.unwrap_or_default() && self.resize_handle.borrow().is_some() {
            let msg: JsValue = "`notifyResize(false)` called, disabling auto-size.  It can be \
                                re-enabled with `setAutoSize(true)`."
                .into();
            web_sys::console::warn_1(&msg);
            *self.resize_handle.borrow_mut() = None;
        }

        let renderer = self.renderer.clone();
        ApiFuture::new(async move { renderer.resize().await })
    }

    /// Sets the auto-size behavior of this component. When `true`, this
    /// `<perspective-viewer>` will register a `ResizeObserver` on itself and
    /// call `resize()` whenever its own dimensions change.
    ///
    /// # Arguments
    /// - `autosize` Whether to enable `auto-size` behavior or not.
    #[wasm_bindgen(js_name = "setAutoSize")]
    pub fn set_auto_size(&mut self, autosize: bool) {
        if autosize {
            let handle = Some(ResizeObserverHandle::new(
                &self.elem,
                &self.renderer,
                self.root.borrow().as_ref().unwrap(),
            ));
            *self.resize_handle.borrow_mut() = handle;
        } else {
            *self.resize_handle.borrow_mut() = None;
        }
    }

    /// Sets the auto-pause behavior of this component. When `true`, this
    /// `<perspective-viewer>` will register an `IntersectionObserver` on
    /// itself and call `pause()` whenever its viewport visibility changes.
    ///
    /// # Arguments
    /// - `autopause` Whether to enable `auto-pause` behavior or not.
    #[wasm_bindgen(js_name = "setAutoPause")]
    pub fn set_auto_pause(&mut self, autopause: bool) {
        if autopause {
            let handle = Some(IntersectionObserverHandle::new(
                &self.elem,
                &self.session,
                &self.renderer,
            ));
            *self.intersection_handle.borrow_mut() = handle;
        } else {
            *self.intersection_handle.borrow_mut() = None;
        }
    }

    /// Get this viewer's edit port for the currently loaded `Table`.
    #[wasm_bindgen(js_name = "getEditPort")]
    pub fn get_edit_port(&self) -> Result<f64, JsValue> {
        self.session
            .metadata()
            .get_edit_port()
            .ok_or_else(|| "No `Table` loaded".into())
    }

    /// Restyle all plugins from current document.
    #[wasm_bindgen(js_name = "restyleElement")]
    pub fn restyle_element(&self) -> ApiFuture<JsValue> {
        clone!(self.renderer, self.session);
        ApiFuture::new(async move {
            let view = session.get_view().into_apierror()?;
            renderer.restyle_all(&view).await
        })
    }

    /// Set the available theme names available in the status bar UI.
    #[wasm_bindgen(js_name = "resetThemes")]
    pub fn reset_themes(&self, themes: Option<Box<[JsValue]>>) -> ApiFuture<JsValue> {
        clone!(self.renderer, self.session, self.presentation);
        ApiFuture::new(async move {
            let themes: Option<Vec<String>> = themes
                .unwrap_or_default()
                .iter()
                .map(|x| x.as_string())
                .collect();

            let theme_name = presentation.get_selected_theme_name().await;
            presentation.reset_available_themes(themes).await;
            let reset_theme = presentation
                .get_available_themes()
                .await?
                .iter()
                .find(|y| theme_name.as_ref() == Some(y))
                .cloned();

            presentation.set_theme_name(reset_theme.as_deref()).await?;
            let view = session.get_view().into_apierror()?;
            renderer.restyle_all(&view).await
        })
    }

    /// Determines the render throttling behavior. Can be an integer, for
    /// millisecond window to throttle render event; or, if `None`, adaptive
    /// throttling will be calculated from the measured render time of the
    /// last 5 frames.
    ///
    /// # Examples
    /// // Only draws at most 1 frame/sec.
    /// viewer.js_set_throttle(Some(1000_f64));
    ///
    /// # Arguments
    /// - `throttle` The throttle rate - milliseconds (f64), or `None` for
    ///   adaptive throttling.
    #[wasm_bindgen(js_name = "setThrottle")]
    pub fn set_throttle(&mut self, val: Option<f64>) {
        self.renderer.set_throttle(val);
    }

    /// Toggle (or force) the config panel open/closed.
    ///
    /// # Arguments
    /// - `force` Force the state of the panel open or closed, or `None` to
    ///   toggle.
    #[wasm_bindgen(js_name = "toggleConfig")]
    pub fn toggle_config(&self, force: Option<bool>) -> ApiFuture<JsValue> {
        global::document().blur_active_element();
        let root = self.root.clone();
        ApiFuture::new(async move {
            let force = force.map(SettingsUpdate::Update);
            let task = root
                .borrow()
                .as_ref()
                .into_apierror()?
                .send_message_async(|x| PerspectiveViewerMsg::ToggleSettingsInit(force, Some(x)));

            task.await.map_err(|_| JsValue::from("Cancelled"))?
        })
    }

    /// Get an `Array` of all of the plugin custom elements registered for this
    /// element. This may not include plugins which called
    /// `registerPlugin()` after the host has rendered for the first time.
    #[wasm_bindgen(js_name = "getAllPlugins")]
    pub fn get_all_plugins(&self) -> Array {
        self.renderer.get_all_plugins().iter().collect::<Array>()
    }

    /// Gets a plugin Custom Element with the `name` field, or get the active
    /// plugin if no `name` is provided.
    ///
    /// # Arguments
    /// - `name` The `name` property of a perspective plugin Custom Element, or
    ///   `None` for the active plugin's Custom Element.
    #[wasm_bindgen(js_name = "getPlugin")]
    pub fn get_plugin(&self, name: Option<String>) -> ApiResult<JsPerspectiveViewerPlugin> {
        match name {
            None => self.renderer.get_active_plugin(),
            Some(name) => self.renderer.get_plugin(&name),
        }
    }

    /// Internal Only.
    ///
    /// Get this custom element model's raw pointer.
    #[allow(clippy::use_self)]
    #[wasm_bindgen(js_name = "unsafeGetModel")]
    pub fn unsafe_get_model(&self) -> *const PerspectiveViewerElement {
        std::ptr::addr_of!(*self)
    }

    /// Asynchronously opens the column settings for a specific column.
    /// When finished, the `<perspective-viewer>` element will emit a
    /// "perspective-toggle-column-settings" CustomEvent.
    /// The event's details property has two fields: `{open: bool, column_name?:
    /// string}`. The CustomEvent is also fired whenever the user toggles the
    /// sidebar manually.
    #[wasm_bindgen(js_name = "toggleColumnSettings")]
    pub fn toggle_column_settings(&self, column_name: String) -> ApiFuture<()> {
        clone!(self.session, self.root);
        ApiFuture::new(async move {
            let locator = session.metadata().get_column_locator(Some(column_name));
            let task = root
                .borrow()
                .as_ref()
                .into_apierror()?
                .send_message_async(|sender| PerspectiveViewerMsg::OpenColumnSettings {
                    locator,
                    sender: Some(sender),
                    toggle: true,
                });
            task.await.map_err(|_| ApiError::from("Cancelled"))
        })
    }

    /// Force open the settings for a particular column. Pass `null` to close
    /// the column settings panel. See `toggleColumnSettings` for more.
    #[wasm_bindgen(js_name = "openColumnSettings")]
    pub fn open_column_settings(
        &self,
        column_name: Option<String>,
        toggle: Option<bool>,
    ) -> ApiFuture<()> {
        clone!(self.session, self.root);
        ApiFuture::new(async move {
            let locator = session.metadata().get_column_locator(column_name);
            let task = root
                .borrow()
                .as_ref()
                .into_apierror()?
                .send_message_async(|sender| PerspectiveViewerMsg::OpenColumnSettings {
                    locator,
                    sender: Some(sender),
                    toggle: toggle.unwrap_or_default(),
                });
            task.await.map_err(|_| ApiError::from("Cancelled"))
        })
    }
}
