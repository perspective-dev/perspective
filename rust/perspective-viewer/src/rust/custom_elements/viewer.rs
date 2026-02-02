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

#![allow(non_snake_case)]

use std::cell::RefCell;
use std::rc::Rc;

use futures::channel::oneshot::channel;
use js_sys::{Array, JsString};
use perspective_client::config::ViewConfigUpdate;
use perspective_client::utils::PerspectiveResultExt;
use perspective_js::{JsViewConfig, JsViewWindow, Table, View, apierror};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_derive::try_from_js_option;
use wasm_bindgen_futures::JsFuture;
use web_sys::HtmlElement;

use crate::components::viewer::{PerspectiveViewerMsg, PerspectiveViewerProps};
use crate::config::*;
use crate::custom_events::*;
use crate::dragdrop::*;
use crate::js::*;
use crate::model::*;
use crate::presentation::*;
use crate::renderer::*;
use crate::root::Root;
use crate::session::{ResetOptions, Session};
use crate::utils::*;
use crate::*;

/// The `<perspective-viewer>` custom element.
///
/// # JavaScript Examples
///
/// Create a new `<perspective-viewer>`:
///
/// ```javascript
/// const viewer = document.createElement("perspective-viewer");
/// window.body.appendChild(viewer);
/// ```
///
/// Complete example including loading and restoring the [`Table`]:
///
/// ```javascript
/// import perspective from "@perspective-dev/viewer";
/// import perspective from "@perspective-dev/client";
///
/// const viewer = document.createElement("perspective-viewer");
/// const worker = await perspective.worker();
///
/// await worker.table("x\n1", {name: "table_one"});
/// await viewer.load(worker);
/// await viewer.restore({table: "table_one"});
/// ```
#[derive(Clone, PerspectiveProperties!)]
#[wasm_bindgen]
pub struct PerspectiveViewerElement {
    elem: HtmlElement,
    root: Root<components::viewer::PerspectiveViewer>,
    resize_handle: Rc<RefCell<Option<ResizeObserverHandle>>>,
    intersection_handle: Rc<RefCell<Option<IntersectionObserverHandle>>>,
    session: Session,
    renderer: Renderer,
    presentation: Presentation,
    custom_events: CustomEvents,
    _subscriptions: Rc<[Subscription; 2]>,
}

// derive_model!( Renderer, Root, Session, Presentation for
// PerspectiveViewerElement);

impl CustomElementMetadata for PerspectiveViewerElement {
    const CUSTOM_ELEMENT_NAME: &'static str = "perspective-viewer";
    const STATICS: &'static [&'static str] = ["registerPlugin", "getExprTKCommands"].as_slice();
}

#[wasm_bindgen]
impl PerspectiveViewerElement {
    #[doc(hidden)]
    #[wasm_bindgen(constructor)]
    pub fn new(elem: web_sys::HtmlElement) -> Self {
        let init = web_sys::ShadowRootInit::new(web_sys::ShadowRootMode::Open);
        let shadow_root = elem
            .attach_shadow(&init)
            .unwrap()
            .unchecked_into::<web_sys::Element>();

        Self::new_from_shadow(elem, shadow_root)
    }

    fn new_from_shadow(elem: web_sys::HtmlElement, shadow_root: web_sys::Element) -> Self {
        // Application State
        let session = Session::new();
        let renderer = Renderer::new(&elem);
        let presentation = Presentation::new(&elem);
        let custom_events = CustomEvents::new(&elem, &session, &renderer, &presentation);

        // Create Yew App
        let props = yew::props!(PerspectiveViewerProps {
            elem: elem.clone(),
            session: session.clone(),
            renderer: renderer.clone(),
            presentation: presentation.clone(),
            dragdrop: DragDrop::default(),
            custom_events: custom_events.clone(),
        });

        let state = props.clone_state();
        let root = Root::new(shadow_root, props);

        // Create callbacks
        let update_sub = session.table_updated.add_listener({
            clone!(renderer, session);
            move |_| {
                clone!(renderer, session);
                ApiFuture::spawn(async move {
                    renderer
                        .update(session.get_view())
                        .await
                        .ignore_view_delete()
                        .map(|_| ())
                })
            }
        });

        let eject_sub = presentation.on_eject.add_listener({
            let root = root.clone();
            move |_| ApiFuture::spawn(state.delete_all(&root))
        });

        let resize_handle = ResizeObserverHandle::new(&elem, &renderer, &session, &root);
        let intersect_handle =
            IntersectionObserverHandle::new(&elem, &presentation, &session, &renderer);

        Self {
            elem,
            root,
            session,
            renderer,
            presentation,
            resize_handle: Rc::new(RefCell::new(Some(resize_handle))),
            intersection_handle: Rc::new(RefCell::new(Some(intersect_handle))),
            custom_events,
            _subscriptions: Rc::new([update_sub, eject_sub]),
        }
    }

    #[doc(hidden)]
    #[wasm_bindgen(js_name = "connectedCallback")]
    pub fn connected_callback(&self) -> ApiResult<()> {
        tracing::debug!("Connected <perspective-viewer>");
        Ok(())
    }

    /// Loads a [`Client`], or optionally [`Table`], or optionally a Javascript
    /// `Promise` which returns a [`Client`] or [`Table`], in this viewer.
    ///
    /// Loading a [`Client`] does not render, but subsequent calls to
    /// [`PerspectiveViewerElement::restore`] will use this [`Client`] to look
    /// up the proviced `table` name field for the provided
    /// [`ViewerConfigUpdate`].
    ///
    /// Loading a [`Table`] is equivalent to subsequently calling
    /// [`Self::restore`] with the `table` field set to [`Table::get_name`], and
    /// will render the UI in its default state when [`Self::load`] resolves.
    /// If you plan to call [`Self::restore`] anyway, prefer passing a
    /// [`Client`] argument to [`Self::load`] as it will conserve one render.
    ///
    /// When [`PerspectiveViewerElement::load`] resolves, the first frame of the
    /// UI + visualization is guaranteed to have been drawn. Awaiting the result
    /// of this method in a `try`/`catch` block will capture any errors
    /// thrown during the loading process, or from the [`Client`] `Promise`
    /// itself.
    ///
    /// [`PerspectiveViewerElement::load`] may also be called with a [`Table`],
    /// which is equivalent to:
    ///
    /// ```javascript
    /// await viewer.load(await table.get_client());
    /// await viewer.restore({name: await table.get_name()})
    /// ```
    ///
    /// If you plan to call [`PerspectiveViewerElement::restore`] immediately
    /// after [`PerspectiveViewerElement::load`] yourself, as is commonly
    /// done when loading and configuring a new `<perspective-viewer>`, you
    /// should use a [`Client`] as an argument and set the `table` field in the
    /// restore call as
    ///
    /// A [`Table`] can be created using the
    /// [`@perspective-dev/client`](https://www.npmjs.com/package/@perspective-dev/client)
    /// library from NPM (see [`perspective_js`] documentation for details).
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// import perspective from "@perspective-dev/client";
    ///
    /// const worker = await perspective.worker();
    /// viewer.load(worker);
    /// ```
    ///
    /// ... or
    ///
    /// ```javascript
    /// const table = await worker.table(data, {name: "superstore"});
    /// viewer.load(table);
    /// ```
    ///
    /// Complete example:
    ///
    /// ```javascript
    /// const viewer = document.createElement("perspective-viewer");
    /// const worker = await perspective.worker();
    ///
    /// await worker.table("x\n1", {name: "table_one"});
    /// await viewer.load(worker);
    /// await viewer.restore({table: "table_one", columns: ["x"]});
    /// ```
    ///
    /// ... or, if you don't want to pass your own arguments to `restore`:
    ///
    /// ```javascript
    /// const viewer = document.createElement("perspective-viewer");
    /// const worker = await perspective.worker();
    ///
    /// const table = await worker.table("x\n1", {name: "table_one"});
    /// await viewer.load(table);
    /// ```
    pub fn load(&self, table: JsValue) -> ApiResult<ApiFuture<()>> {
        let promise = table
            .clone()
            .dyn_into::<js_sys::Promise>()
            .unwrap_or_else(|_| js_sys::Promise::resolve(&table));

        let _plugin = self.renderer.get_active_plugin()?;
        let task = self.session.reset(ResetOptions {
            config: true,
            expressions: true,
            stats: true,
            ..ResetOptions::default()
        });

        let mut config = ViewConfigUpdate {
            columns: Some(self.session.get_view_config().columns.clone()),
            ..ViewConfigUpdate::default()
        };

        let metadata = self.renderer.metadata();
        self.session
            .set_update_column_defaults(&mut config, &metadata);
        self.session.update_view_config(config)?;

        clone!(self.renderer, self.session);
        Ok(ApiFuture::new_throttled(async move {
            let task = async {
                // Ignore this error, which is blown away by the table anyway.
                let _ = task.await;
                let jstable = JsFuture::from(promise)
                    .await
                    .map_err(|x| apierror!(TableError(x)))?;

                if let Ok(Some(table)) =
                    try_from_js_option::<perspective_js::Table>(jstable.clone())
                {
                    let client = table.get_client().await;
                    session.set_client(client.get_client().clone());
                    let name = table.get_name().await;
                    tracing::debug!(
                        "Loading {:.0} rows from `Table` {}",
                        table.size().await?,
                        name
                    );

                    if session.set_table(name).await? {
                        session.validate().await?.create_view().await?;
                    }

                    Ok(session.get_view())
                } else if let Ok(Some(client)) =
                    wasm_bindgen_derive::try_from_js_option::<perspective_js::Client>(jstable)
                {
                    session.set_client(client.get_client().clone());
                    Ok(session.get_view())
                } else {
                    Err(ApiError::new("Invalid argument"))
                }
            };

            renderer.set_throttle(None);
            let result = renderer.draw(task).await;
            if let Err(e) = &result {
                session.set_error(false, e.clone()).await?;
            }

            result
        }))
    }

    /// Delete the internal [`View`] and all associated state, rendering this
    /// `<perspective-viewer>` unusable and freeing all associated resources.
    /// Does not delete the supplied [`Table`] (as this is constructed by the
    /// callee).
    ///
    /// Calling _any_ method on a `<perspective-viewer>` after [`Self::delete`]
    /// will throw.
    ///
    /// <div class="warning">
    ///
    /// Allowing a `<perspective-viewer>` to be garbage-collected
    /// without calling [`PerspectiveViewerElement::delete`] will leak WASM
    /// memory!
    ///
    /// </div>
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.delete();
    /// ```
    pub fn delete(self) -> ApiFuture<()> {
        self.delete_all(self.root())
    }

    /// Restart this `<perspective-viewer>` to its initial state, before
    /// `load()`.
    ///
    /// Use `Self::restart` if you plan to call `Self::load` on this viewer
    /// again, or alternatively `Self::delete` if this viewer is no longer
    /// needed.
    pub fn eject(&mut self) -> ApiFuture<()> {
        if self.session.has_table() {
            let mut state = Self::new_from_shadow(
                self.elem.clone(),
                self.elem.shadow_root().unwrap().unchecked_into(),
            );

            std::mem::swap(self, &mut state);
            ApiFuture::new_throttled(state.delete())
        } else {
            ApiFuture::new_throttled(async move { Ok(()) })
        }
    }

    /// Get the underlying [`View`] for this viewer.
    ///
    /// Use this method to get promgrammatic access to the [`View`] as currently
    /// configured by the user, for e.g. serializing as an
    /// [Apache Arrow](https://arrow.apache.org/) before passing to another
    /// library.
    ///
    /// The [`View`] returned by this method is owned by the
    /// [`PerspectiveViewerElement`] and may be _invalidated_ by
    /// [`View::delete`] at any time. Plugins which rely on this [`View`] for
    /// their [`HTMLPerspectiveViewerPluginElement::draw`] implementations
    /// should treat this condition as a _cancellation_ by silently aborting on
    /// "View already deleted" errors from method calls.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const view = await viewer.getView();
    /// ```
    #[wasm_bindgen]
    pub fn getView(&self) -> ApiFuture<View> {
        let session = self.session.clone();
        ApiFuture::new(async move { Ok(session.get_view().ok_or("No table set")?.into()) })
    }

    /// Get a copy of the [`ViewConfig`] for the current [`View`]. This is
    /// non-blocking as it does not need to access the plugin (unlike
    /// [`PerspectiveViewerElement::save`]), and also makes no API calls to the
    /// server (unlike [`PerspectiveViewerElement::getView`] followed by
    /// [`View::get_config`])
    #[wasm_bindgen]
    pub fn getViewConfig(&self) -> ApiFuture<JsViewConfig> {
        let session = self.session.clone();
        ApiFuture::new(async move {
            let config = session.get_view_config();
            Ok(JsValue::from_serde_ext(&*config)?.unchecked_into())
        })
    }

    /// Get the underlying [`Table`] for this viewer (as passed to
    /// [`PerspectiveViewerElement::load`] or as the `table` field to
    /// [`PerspectiveViewerElement::restore`]).
    ///
    /// # Arguments
    ///
    /// - `wait_for_table` - whether to wait for
    ///   [`PerspectiveViewerElement::load`] to be called, or fail immediately
    ///   if [`PerspectiveViewerElement::load`] has not yet been called.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const table = await viewer.getTable();
    /// ```
    #[wasm_bindgen]
    pub fn getTable(&self, wait_for_table: Option<bool>) -> ApiFuture<Table> {
        let session = self.session.clone();
        ApiFuture::new(async move {
            match session.get_table() {
                Some(table) => Ok(table.into()),
                None if !wait_for_table.unwrap_or_default() => Err("No `Table` set".into()),
                None => {
                    session.table_loaded.read_next().await?;
                    Ok(session.get_table().ok_or("No `Table` set")?.into())
                },
            }
        })
    }

    /// Get the underlying [`Client`] for this viewer (as passed to, or
    /// associated with the [`Table`] passed to,
    /// [`PerspectiveViewerElement::load`]).
    ///
    /// # Arguments
    ///
    /// - `wait_for_client` - whether to wait for
    ///   [`PerspectiveViewerElement::load`] to be called, or fail immediately
    ///   if [`PerspectiveViewerElement::load`] has not yet been called.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const client = await viewer.getClient();
    /// ```
    #[wasm_bindgen]
    pub fn getClient(&self, wait_for_client: Option<bool>) -> ApiFuture<perspective_js::Client> {
        let session = self.session.clone();
        ApiFuture::new(async move {
            match session.get_client() {
                Some(client) => Ok(client.into()),
                None if !wait_for_client.unwrap_or_default() => Err("No `Client` set".into()),
                None => {
                    session.table_loaded.read_next().await?;
                    Ok(session.get_client().ok_or("No `Client` set")?.into())
                },
            }
        })
    }

    /// Get render statistics. Some fields of the returned stats object are
    /// relative to the last time [`PerspectiveViewerElement::getRenderStats`]
    /// was called, ergo calling this method resets these fields.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const {virtual_fps, actual_fps} = await viewer.getRenderStats();
    /// ```
    #[wasm_bindgen]
    pub fn getRenderStats(&self) -> ApiResult<JsValue> {
        Ok(JsValue::from_serde_ext(
            &self.renderer.render_timer().get_stats(),
        )?)
    }

    /// Flush any pending modifications to this `<perspective-viewer>`.  Since
    /// `<perspective-viewer>`'s API is almost entirely `async`, it may take
    /// some milliseconds before any user-initiated changes to the [`View`]
    /// affects the rendered element.  If you want to make sure all pending
    /// actions have been rendered, call and await [`Self::flush`].
    ///
    /// [`Self::flush`] will resolve immediately if there is no [`Table`] set.
    ///
    /// # JavaScript Examples
    ///
    /// In this example, [`Self::restore`] is called without `await`, but the
    /// eventual render which results from this call can still be awaited by
    /// immediately awaiting [`Self::flush`] instead.
    ///
    /// ```javascript
    /// viewer.restore(config);
    /// await viewer.flush();
    /// ```
    pub fn flush(&self) -> ApiFuture<()> {
        clone!(self.renderer);
        ApiFuture::new_throttled(async move {
            // We must let two AFs pass to guarantee listeners to the DOM state
            // have themselves triggered, or else `request_animation_frame`
            // may finish before a `ResizeObserver` triggered before is
            // notifiedd.
            //
            // https://github.com/w3c/csswg-drafts/issues/9560
            // https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering
            request_animation_frame().await;
            request_animation_frame().await;
            renderer.clone().with_lock(async { Ok(()) }).await?;
            renderer.with_lock(async { Ok(()) }).await
        })
    }

    /// Restores this element from a full/partial
    /// [`perspective_js::JsViewConfig`] (this element's user-configurable
    /// state, including the `Table` name).
    ///
    /// One of the best ways to use [`Self::restore`] is by first configuring
    /// a `<perspective-viewer>` as you wish, then using either the `Debug`
    /// panel or "Copy" -> "config.json" from the toolbar menu to snapshot
    /// the [`Self::restore`] argument as JSON.
    ///
    /// # Arguments
    ///
    /// - `update` - The config to restore to, as returned by [`Self::save`] in
    ///   either "json", "string" or "arraybuffer" format.
    ///
    /// # JavaScript Examples
    ///
    /// Loads a default plugin for the table named `"superstore"`:
    ///
    /// ```javascript
    /// await viewer.restore({table: "superstore"});
    /// ```
    ///
    /// Apply a `group_by` to the same `viewer` element, without
    /// modifying/resetting other fields - you can omit the `table` field,
    /// this has already been set once and is not modified:
    ///
    /// ```javascript
    /// await viewer.restore({group_by: ["State"]});
    /// ```
    pub fn restore(&self, update: JsValue) -> ApiFuture<()> {
        let this = self.clone();
        ApiFuture::new_throttled(async move {
            let decoded_update = ViewerConfigUpdate::decode(&update)?;
            tracing::info!("Restoring {}", decoded_update);
            let root = this.root.clone();
            let settings = decoded_update.settings.clone();
            let (sender, receiver) = channel::<()>();
            root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::ToggleSettingsComplete(settings, sender),
            );

            let result = this
                .restore_and_render(decoded_update.clone(), {
                    clone!(this, decoded_update.table);
                    async move {
                        if let OptionalUpdate::Update(name) = table {
                            this.session.set_table(name).await?;
                            this.session
                                .update_column_defaults(&this.renderer.metadata());
                        };

                        // Something abnormal in the DOM happened, e.g. the
                        // element was disconnected while rendering.
                        receiver.await.unwrap_or_log();
                        Ok(())
                    }
                })
                .await;

            if let Err(e) = &result {
                this.session().set_error(false, e.clone()).await?;
            }
            result
        })
    }

    /// If this element is in an _errored_ state, this method will clear it and
    /// re-render. Calling this method is equivalent to clicking the error reset
    /// button in the UI.
    pub fn resetError(&self) -> ApiFuture<()> {
        ApiFuture::spawn(self.session.reset(ResetOptions::default()));
        let this = self.clone();
        ApiFuture::new_throttled(async move {
            this.update_and_render(ViewConfigUpdate::default())?.await?;
            Ok(())
        })
    }

    /// Save this element's user-configurable state to a serialized state
    /// object, one which can be restored via the [`Self::restore`] method.
    ///
    /// # JavaScript Examples
    ///
    /// Get the current `group_by` setting:
    ///
    /// ```javascript
    /// const {group_by} = await viewer.restore();
    /// ```
    ///
    /// Reset workflow attached to an external button `myResetButton`:
    ///
    /// ```javascript
    /// const token = await viewer.save();
    /// myResetButton.addEventListener("clien", async () => {
    ///     await viewer.restore(token);
    /// });
    /// ```
    pub fn save(&self) -> ApiFuture<JsValue> {
        let this = self.clone();
        ApiFuture::new(async move {
            let viewer_config = this
                .renderer
                .clone()
                .with_lock(async { this.get_viewer_config().await })
                .await?;

            viewer_config.encode()
        })
    }

    /// Download this viewer's internal [`View`] data via a browser download
    /// event.
    ///
    /// # Arguments
    ///
    /// - `method` - The `ExportMethod` to use to render the data to download.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// myDownloadButton.addEventListener("click", async () => {
    ///     await viewer.download();
    /// })
    /// ```
    pub fn download(&self, method: Option<JsString>) -> ApiFuture<()> {
        let this = self.clone();
        ApiFuture::new_throttled(async move {
            let method = if let Some(method) = method
                .map(|x| x.unchecked_into())
                .map(serde_wasm_bindgen::from_value)
            {
                method?
            } else {
                ExportMethod::Csv
            };

            let blob = this.export_method_to_blob(method).await?;
            let is_chart = this.renderer.is_chart();
            download(
                format!("untitled{}", method.as_filename(is_chart)).as_ref(),
                &blob,
            )
        })
    }

    /// Exports this viewer's internal [`View`] as a JavaSript data, the
    /// exact type of which depends on the `method` but defaults to `String`
    /// in CSV format.
    ///
    /// This method is only really useful for the `"plugin"` method, which
    /// will use the configured plugin's export (e.g. PNG for
    /// `@perspective-dev/viewer-d3fc`). Otherwise, prefer to call the
    /// equivalent method on the underlying [`View`] directly.
    ///
    /// # Arguments
    ///
    /// - `method` - The `ExportMethod` to use to render the data to download.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const data = await viewer.export("plugin");
    /// ```
    pub fn export(&self, method: Option<JsString>) -> ApiFuture<JsValue> {
        let this = self.clone();
        ApiFuture::new(async move {
            let method = if let Some(method) = method
                .map(|x| x.unchecked_into())
                .map(serde_wasm_bindgen::from_value)
            {
                method?
            } else {
                ExportMethod::Csv
            };

            this.export_method_to_jsvalue(method).await
        })
    }

    /// Copy this viewer's `View` or `Table` data as CSV to the system
    /// clipboard.
    ///
    /// # Arguments
    ///
    /// - `method` - The `ExportMethod` (serialized as a `String`) to use to
    ///   render the data to the Clipboard.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// myDownloadButton.addEventListener("click", async () => {
    ///     await viewer.copy();
    /// })
    /// ```
    pub fn copy(&self, method: Option<JsString>) -> ApiFuture<()> {
        let this = self.clone();
        ApiFuture::new_throttled(async move {
            let method = if let Some(method) = method
                .map(|x| x.unchecked_into())
                .map(serde_wasm_bindgen::from_value)
            {
                method?
            } else {
                ExportMethod::Csv
            };

            let js_task = this.export_method_to_blob(method);
            copy_to_clipboard(js_task, MimeType::TextPlain).await
        })
    }

    /// Reset the viewer's `ViewerConfig` to the default.
    ///
    /// # Arguments
    ///
    /// - `reset_all` - If set, will clear expressions and column settings as
    ///   well.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.reset();
    /// ```
    pub fn reset(&self, reset_all: Option<bool>) -> ApiFuture<()> {
        tracing::debug!("Resetting config");
        let root = self.root.clone();
        let all = reset_all.unwrap_or_default();
        ApiFuture::new_throttled(async move {
            let (sender, receiver) = channel::<()>();
            root.borrow()
                .as_ref()
                .ok_or("Already deleted")?
                .send_message(PerspectiveViewerMsg::Reset(all, Some(sender)));

            Ok(receiver.await?)
        })
    }

    /// Recalculate the viewer's dimensions and redraw.
    ///
    /// Use this method to tell `<perspective-viewer>` its dimensions have
    /// changed when auto-size mode has been disabled via [`Self::setAutoSize`].
    /// [`Self::resize`] resolves when the resize-initiated redraw of this
    /// element has completed.
    ///
    /// # Arguments
    ///
    /// - `force` - If [`Self::resize`] is called with `false` or without an
    ///   argument, and _auto-size_ mode is enabled via [`Self::setAutoSize`],
    ///   [`Self::resize`] will log a warning and auto-disable auto-size mode.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.resize(true)
    /// ```
    #[wasm_bindgen]
    pub fn resize(&self, force: Option<bool>) -> ApiFuture<()> {
        if !force.unwrap_or_default() && self.resize_handle.borrow().is_some() {
            let msg: JsValue = "`resize(false)` called, disabling auto-size.  It can be \
                                re-enabled with `setAutoSize(true)`."
                .into();
            web_sys::console::warn_1(&msg);
            *self.resize_handle.borrow_mut() = None;
        }

        let state = self.clone_state();
        ApiFuture::new_throttled(async move {
            if !state.renderer().is_plugin_activated()? {
                state
                    .update_and_render(ViewConfigUpdate::default())?
                    .await?;
            } else {
                state.renderer().resize().await?;
            }

            Ok(())
        })
    }

    /// Sets the auto-size behavior of this component.
    ///
    /// When `true`, this `<perspective-viewer>` will register a
    /// `ResizeObserver` on itself and call [`Self::resize`] whenever its own
    /// dimensions change. However, when embedded in a larger application
    /// context, you may want to call [`Self::resize`] manually to avoid
    /// over-rendering; in this case auto-sizing can be disabled via this
    /// method. Auto-size behavior is enabled by default.
    ///
    /// # Arguments
    ///
    /// - `autosize` - Whether to enable `auto-size` behavior or not.
    ///
    /// # JavaScript Examples
    ///
    /// Disable auto-size behavior:
    ///
    /// ```javascript
    /// viewer.setAutoSize(false);
    /// ```
    #[wasm_bindgen]
    pub fn setAutoSize(&self, autosize: bool) {
        if autosize {
            let handle = Some(ResizeObserverHandle::new(
                &self.elem,
                &self.renderer,
                &self.session,
                &self.root,
            ));
            *self.resize_handle.borrow_mut() = handle;
        } else {
            *self.resize_handle.borrow_mut() = None;
        }
    }

    /// Sets the auto-pause behavior of this component.
    ///
    /// When `true`, this `<perspective-viewer>` will register an
    /// `IntersectionObserver` on itself and subsequently skip rendering
    /// whenever its viewport visibility changes. Auto-pause is enabled by
    /// default.
    ///
    /// # Arguments
    ///
    /// - `autopause` Whether to enable `auto-pause` behavior or not.
    ///
    /// # JavaScript Examples
    ///
    /// Disable auto-size behavior:
    ///
    /// ```javascript
    /// viewer.setAutoPause(false);
    /// ```
    #[wasm_bindgen]
    pub fn setAutoPause(&self, autopause: bool) {
        if autopause {
            let handle = Some(IntersectionObserverHandle::new(
                &self.elem,
                &self.presentation,
                &self.session,
                &self.renderer,
            ));

            *self.intersection_handle.borrow_mut() = handle;
        } else {
            *self.intersection_handle.borrow_mut() = None;
        }
    }

    /// Return a [`perspective_js::JsViewWindow`] for the currently selected
    /// region.
    #[wasm_bindgen]
    pub fn getSelection(&self) -> Option<JsViewWindow> {
        self.renderer.get_selection().map(|x| x.into())
    }

    /// Set the selection [`perspective_js::JsViewWindow`] for this element.
    #[wasm_bindgen]
    pub fn setSelection(&self, window: Option<JsViewWindow>) -> ApiResult<()> {
        let window = window.map(|x| x.into_serde_ext()).transpose()?;
        if self.renderer.get_selection() != window {
            self.custom_events.dispatch_select(window.as_ref())?;
        }

        self.renderer.set_selection(window);
        Ok(())
    }

    /// Get this viewer's edit port for the currently loaded [`Table`] (see
    /// [`Table::update`] for details on ports).
    #[wasm_bindgen]
    pub fn getEditPort(&self) -> Result<f64, JsValue> {
        self.session
            .metadata()
            .get_edit_port()
            .ok_or_else(|| "No `Table` loaded".into())
    }

    /// Restyle all plugins from current document.
    ///
    /// <div class="warning">
    ///
    /// [`Self::restyleElement`] _must_ be called for many runtime changes to
    /// CSS properties to be reflected in an already-rendered
    /// `<perspective-viewer>`.
    ///
    /// </div>
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// viewer.style = "--icon--color: red";
    /// await viewer.restyleElement();
    /// ```
    #[wasm_bindgen]
    pub fn restyleElement(&self) -> ApiFuture<JsValue> {
        clone!(self.renderer, self.session);
        ApiFuture::new(async move {
            let view = session.get_view().into_apierror()?;
            renderer.restyle_all(&view).await
        })
    }

    /// Set the available theme names available in the status bar UI.
    ///
    /// Calling [`Self::resetThemes`] may cause the current theme to switch,
    /// if e.g. the new theme set does not contain the current theme.
    ///
    /// # JavaScript Examples
    ///
    /// Restrict `<perspective-viewer>` theme options to _only_ default light
    /// and dark themes, regardless of what is auto-detected from the page's
    /// CSS:
    ///
    /// ```javascript
    /// viewer.resetThemes(["Pro Light", "Pro Dark"])
    /// ```
    #[wasm_bindgen]
    pub fn resetThemes(&self, themes: Option<Box<[JsValue]>>) -> ApiFuture<JsValue> {
        clone!(self.renderer, self.session, self.presentation);
        ApiFuture::new(async move {
            let themes: Option<Vec<String>> = themes
                .unwrap_or_default()
                .iter()
                .map(|x| x.as_string())
                .collect();

            let theme_name = presentation.get_selected_theme_name().await;
            let mut changed = presentation.reset_available_themes(themes).await;
            let reset_theme = presentation
                .get_available_themes()
                .await?
                .iter()
                .find(|y| theme_name.as_ref() == Some(y))
                .cloned();

            changed = presentation.set_theme_name(reset_theme.as_deref()).await? || changed;
            if changed && let Some(view) = session.get_view() {
                return renderer.restyle_all(&view).await;
            }

            Ok(JsValue::UNDEFINED)
        })
    }

    /// Determines the render throttling behavior. Can be an integer, for
    /// millisecond window to throttle render event; or, if `None`, adaptive
    /// throttling will be calculated from the measured render time of the
    /// last 5 frames.
    ///
    /// # Arguments
    ///
    /// - `throttle` - The throttle rate in milliseconds (f64), or `None` for
    ///   adaptive throttling.
    ///
    /// # JavaScript Examples
    ///
    /// Only draws at most 1 frame/sec:
    ///
    /// ```rust
    /// viewer.setThrottle(1000);
    /// ```
    #[wasm_bindgen]
    pub fn setThrottle(&self, val: Option<f64>) {
        self.renderer.set_throttle(val);
    }

    /// Toggle (or force) the config panel open/closed.
    ///
    /// # Arguments
    ///
    /// - `force` - Force the state of the panel open or closed, or `None` to
    ///   toggle.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.toggleConfig();
    /// ```
    #[wasm_bindgen]
    pub fn toggleConfig(&self, force: Option<bool>) -> ApiFuture<JsValue> {
        let root = self.root.clone();
        ApiFuture::new(async move {
            let force = force.map(SettingsUpdate::Update);
            let (sender, receiver) = channel::<ApiResult<wasm_bindgen::JsValue>>();
            root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::ToggleSettingsInit(force, Some(sender)),
            );

            receiver.await.map_err(|_| JsValue::from("Cancelled"))?
        })
    }

    /// Get an `Array` of all of the plugin custom elements registered for this
    /// element. This may not include plugins which called
    /// [`registerPlugin`] after the host has rendered for the first time.
    #[wasm_bindgen]
    pub fn getAllPlugins(&self) -> Array {
        self.renderer.get_all_plugins().iter().collect::<Array>()
    }

    /// Gets a plugin Custom Element with the `name` field, or get the active
    /// plugin if no `name` is provided.
    ///
    /// # Arguments
    ///
    /// - `name` - The `name` property of a perspective plugin Custom Element,
    ///   or `None` for the active plugin's Custom Element.
    #[wasm_bindgen]
    pub fn getPlugin(&self, name: Option<String>) -> ApiResult<JsPerspectiveViewerPlugin> {
        match name {
            None => self.renderer.get_active_plugin(),
            Some(name) => self.renderer.get_plugin(&name),
        }
    }

    /// Create a new JavaScript Heap reference for this model instance.
    #[doc(hidden)]
    #[allow(clippy::use_self)]
    #[wasm_bindgen]
    pub fn __get_model(&self) -> PerspectiveViewerElement {
        self.clone()
    }

    /// Asynchronously opens the column settings for a specific column.
    /// When finished, the `<perspective-viewer>` element will emit a
    /// "perspective-toggle-column-settings" CustomEvent.
    /// The event's details property has two fields: `{open: bool, column_name?:
    /// string}`. The CustomEvent is also fired whenever the user toggles the
    /// sidebar manually.
    #[wasm_bindgen]
    pub fn toggleColumnSettings(&self, column_name: String) -> ApiFuture<()> {
        clone!(self.session, self.root);
        ApiFuture::new_throttled(async move {
            let locator = session.get_column_locator(Some(column_name));
            let (sender, receiver) = channel::<()>();
            root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::OpenColumnSettings {
                    locator,
                    sender: Some(sender),
                    toggle: true,
                },
            );

            receiver.await.map_err(|_| ApiError::from("Cancelled"))
        })
    }

    /// Force open the settings for a particular column. Pass `null` to close
    /// the column settings panel. See [`Self::toggleColumnSettings`] for more.
    #[wasm_bindgen]
    pub fn openColumnSettings(
        &self,
        column_name: Option<String>,
        toggle: Option<bool>,
    ) -> ApiFuture<()> {
        let locator = self.get_column_locator(column_name);
        clone!(self.root);
        ApiFuture::new_throttled(async move {
            let (sender, receiver) = channel::<()>();
            root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::OpenColumnSettings {
                    locator,
                    sender: Some(sender),
                    toggle: toggle.unwrap_or_default(),
                },
            );

            receiver.await.map_err(|_| ApiError::from("Cancelled"))
        })
    }
}
