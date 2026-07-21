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
use futures::future::join_all;
use js_sys::{Array, JsString};
use perspective_client::config::ViewConfigUpdate;
use perspective_client::utils::PerspectiveResultExt;
use perspective_js::{JsViewConfig, JsViewWindow, Table, View, apierror};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_derive::try_from_js_option;
use wasm_bindgen_futures::JsFuture;
use web_sys::HtmlElement;
use yew::Callback;

use crate::components::viewer::{PerspectiveViewerMsg, PerspectiveViewerProps};
use crate::config::*;
use crate::custom_events::*;
use crate::js::*;
use crate::presentation::*;
use crate::queries::*;
use crate::renderer::*;
use crate::root::Root;
use crate::session::{ResetOptions, Session};
use crate::tasks::*;
use crate::utils::*;
use crate::workspace::{Panel, PanelId, Workspace};
use crate::*;

#[wasm_bindgen]
extern "C" {
    /// `load()` argument: a [`Client`], a (deprecated) [`Table`], or a
    /// `Promise` resolving to either. Typed rather than `any` so callers get
    /// completion; the `Table` forms remain runtime-deprecated.
    #[wasm_bindgen(typescript_type = "Client | Table | Promise<Client | Table>")]
    pub type JsClientLoad;

    /// `eject()` argument dict (`{ client?: string }`).
    #[wasm_bindgen(typescript_type = "ClientOptions")]
    pub type JsClientOptions;

    /// Panel-selector dict (`{ panel?: string }`) for the active/base
    /// accessor methods.
    #[wasm_bindgen(typescript_type = "PanelOptions")]
    pub type JsPanelOptions;

    /// `download`/`export`/`copy` options dict
    /// (`{ method?: ExportMethod, panel?: string }`).
    #[wasm_bindgen(typescript_type = "ExportOptions")]
    pub type JsExportOptions;

    /// `getTable` options dict (`{ wait?: boolean, panel?: string }`).
    #[wasm_bindgen(typescript_type = "GetTableOptions")]
    pub type JsGetTableOptions;

    /// `getClient` options dict (`{ wait?: boolean, panel?: string }`).
    #[wasm_bindgen(typescript_type = "GetClientOptions")]
    pub type JsGetClientOptions;

    /// `restoreWorkspace()` argument: a whole-element config update.
    #[wasm_bindgen(typescript_type = "WorkspaceConfigUpdate")]
    pub type JsWorkspaceConfigUpdate;

    /// `saveWorkspace()` return: a whole-element config.
    #[wasm_bindgen(typescript_type = "Promise<WorkspaceConfig>")]
    pub type JsWorkspaceConfigPromise;

    /// A `Promise<void>` return, used by the `restore` family (whose
    /// `ApiFuture<()>` would otherwise erase to `Promise<any>`).
    #[wasm_bindgen(typescript_type = "Promise<void>")]
    pub type JsVoidPromise;
}

#[derive(serde::Deserialize, Default)]
struct ResizeOptions {
    dimensions: Option<ResizeDimensions>,
}

#[derive(serde::Deserialize, Clone, Copy)]
struct ResizeDimensions {
    width: f64,
    height: f64,
}

/// Leniently deserialize an optional JS options dict into a serde struct,
/// falling back to `Default` on absence or a malformed argument (matching the
/// `ResizeOptions` precedent — an options bag is a best-effort convenience,
/// not a hard-validated payload).
fn parse_options<T, U>(options: Option<T>) -> U
where
    T: Into<JsValue>,
    U: Default + for<'a> serde::Deserialize<'a>,
{
    options
        .and_then(|o| o.into_serde_ext().ok())
        .unwrap_or_default()
}

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
#[derive(Clone)]
#[wasm_bindgen]
pub struct PerspectiveViewerElement {
    pub(crate) presentation: Presentation,
    pub(crate) workspace: Workspace,
    pub(crate) elem: HtmlElement,
    pub(crate) root: Root<components::viewer::PerspectiveViewer>,
    resize_handle: Rc<RefCell<Option<ResizeObserverHandle>>>,
    intersection_handle: Rc<RefCell<Option<IntersectionObserverHandle>>>,
    _subscriptions: Rc<[Subscription; 1]>,
    _custom_event_subs: Rc<Vec<Subscription>>,
}

impl CustomElementMetadata for PerspectiveViewerElement {
    const CUSTOM_ELEMENT_NAME: &'static str = "perspective-viewer";
    const STATICS: &'static [&'static str] =
        ["registerPlugin", "get_wasm_module", "get_worker_url"].as_slice();
}

impl PerspectiveViewerElement {
    fn layout_changed_notify(&self) -> Callback<()> {
        let root = self.root.clone();
        Callback::from(move |_: ()| {
            if let Some(app) = root.borrow().as_ref() {
                app.send_message(PerspectiveViewerMsg::LayoutChanged);
            }
        })
    }

    fn resolve_panel(&self, name: Option<String>) -> ApiResult<Panel> {
        let id = name.map(PanelId::from);
        self.workspace.panel_or_active(id.as_ref()).ok_or_else(|| {
            format!(
                "No panel named \"{}\"",
                id.as_ref().map(PanelId::as_str).unwrap_or_default()
            )
            .into()
        })
    }

    fn layout_element(&self) -> Option<RegularLayout> {
        self.elem
            .shadow_root()?
            .query_selector(RegularLayout::TAG_NAME)
            .ok()
            .flatten()
            .map(|el| el.unchecked_into())
    }

    async fn workspace_config(this: Self) -> ApiResult<JsValue> {
        let mut panels: std::collections::BTreeMap<String, PanelViewerConfig> = Default::default();
        for id in &this.workspace.panel_ids() {
            let panel = this.workspace.panel(id).into_apierror()?;
            let config = panel
                .renderer
                .clone()
                .with_lock(async {
                    get_viewer_config(&panel.session, &panel.renderer, &this.presentation).await
                })
                .await?;

            panels.insert(id.as_str().to_owned(), config.panel);
        }

        let active = this
            .presentation
            .is_settings_open()
            .then(|| this.workspace.active_id().as_str().to_owned());

        let layout = this
            .layout_element()
            .map(|l| l.save().into_serde_ext::<crate::js::Layout>())
            .transpose()?;

        Ok(JsValue::from_serde_ext(&WorkspaceConfig {
            version: API_VERSION.to_string(),
            active,
            layout,
            panels,
            global_filters: this.workspace.global_filters(),
            masters: this
                .workspace
                .masters()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect(),
        })?)
    }
}

fn eject_client_panels(
    workspace: &Workspace,
    root: &Root<crate::components::viewer::PerspectiveViewer>,
    target: String,
    ids: Vec<PanelId>,
) -> ApiFuture<()> {
    clone!(workspace, root);
    ApiFuture::new_throttled(async move {
        for id in ids {
            let (completion, receiver) = Completion::new();
            root.borrow()
                .as_ref()
                .into_apierror()?
                .send_message(PerspectiveViewerMsg::ClosePanel(
                    id.to_string(),
                    Some(completion),
                ));

            receiver.await.map_err(|_| ApiError::new("Cancelled"))??;
        }

        workspace.remove_client(&target);
        Ok(())
    })
}

#[rustfmt::skip]
const DEPRECATED_TABLE_MESSAGE: &str =
    "`load(table)` is deprecated - use `load(client)` followed by `restore({table: \"name\"})` instead";

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
        // Application State.
        let presentation = Presentation::new(&elem);
        let session = Session::new();
        let renderer = Renderer::new(&elem);
        if let Some(theme) = elem.get_attribute("theme") {
            renderer.set_theme(Some(theme.clone()));
            clone!(presentation, renderer);
            ApiFuture::spawn(async move {
                let themes = presentation.get_available_themes().await?;
                if !themes.contains(&theme) && renderer.theme().as_deref() == Some(theme.as_str()) {
                    renderer.set_theme(None);
                }

                Ok(())
            });
        }

        // The active panel's subscriptions (redraw + custom-event fanout)
        let seed_subs = wire_panel_subs(&elem, &presentation, &session, &renderer);
        let workspace = Workspace::new(session, renderer, seed_subs);
        let custom_event_subs = wire_element_events(&elem, &presentation, &workspace);

        // Create Yew App
        let props = yew::props!(PerspectiveViewerProps {
            elem: elem.clone(),
            presentation: presentation.clone(),
            workspace: workspace.clone(),
        });

        let state = props.clone();
        let root = Root::new(shadow_root, props);

        // Create callbacks
        let eject_sub = presentation.on_eject.add_listener({
            let root = root.clone();
            move |_| {
                clone!(state.workspace, root);
                ApiFuture::spawn(async move {
                    if let Some(target) = workspace.active_client().map(|c| c.get_name().to_owned())
                    {
                        let ids = workspace.panels_for_client(&target);
                        if ids.len() < workspace.panel_ids().len() {
                            return eject_client_panels(&workspace, &root, target, ids).await;
                        }
                    }

                    delete_all(&workspace, &root).await
                })
            }
        });

        let resize_handle = ResizeObserverHandle::new(&elem, &workspace, &presentation, &root);
        let intersect_handle = IntersectionObserverHandle::new(&elem, &presentation, &workspace);

        Self {
            elem,
            root,
            presentation,
            workspace,
            resize_handle: Rc::new(RefCell::new(Some(resize_handle))),
            intersection_handle: Rc::new(RefCell::new(Some(intersect_handle))),
            _subscriptions: Rc::new([eject_sub]),
            _custom_event_subs: Rc::new(custom_event_subs),
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
    pub fn load(&self, client: JsClientLoad) -> ApiResult<ApiFuture<()>> {
        let table: JsValue = client.into();
        let promise = table
            .clone()
            .dyn_into::<js_sys::Promise>()
            .unwrap_or_else(|_| js_sys::Promise::resolve(&table));

        // Element-level `load` targets the active panel's engines. Selection
        // here (rather than at element construction) is what keeps the
        // registry race safe — by `load()` time real plugins have registered.
        let panel = self.workspace.active_panel();
        let session = panel.session;
        let renderer = panel.renderer;

        // Open the pending-load window SYNCHRONOUSLY, at the call site — this
        // is what fixes the ordering. The payload's RESET disposition (a
        // `Table` resets the view; a `Client` does not) is unknown until the
        // promise resolves, but the window's POSITION on the config-commit
        // stream is fixed NOW. A `restore()` a caller fires immediately after
        // this unawaited `load()` (the React prop-binding pattern, which has
        // no async ordering guarantees) commits INTO this window's journal and
        // is replayed over the reset base if the payload proves to be a
        // `Table` — so a moved-async reset can no longer clobber a later
        // commit. See `SESSION_CONFIG_COHERENCE_PLAN.md`.
        let generation = session.begin_pending_load();

        clone!(self.workspace, self.presentation);
        Ok(ApiFuture::new_throttled(async move {
            renderer.set_throttle(None);
            let _run_token = session.begin_config_run();
            let result = {
                clone!(session, renderer);
                renderer
                    .clone()
                    .render_task(|guard| async move {
                        renderer.set_default_theme(presentation.get_default_theme_name().await);
                        renderer.stamp_theme(None);
                        let jstable = JsFuture::from(promise)
                            .await
                            .map_err(|x| apierror!(TableError(x)))?;

                        if let Ok(Some(table)) =
                            try_from_js_option::<perspective_js::Table>(jstable.clone())
                        {
                            tracing::warn!(DEPRECATED_TABLE_MESSAGE);
                            let Some(journal) = session.take_pending_load(generation) else {
                                return Ok(());
                            };

                            let _plugin = renderer.ensure_plugin_selected()?;
                            let _ = renderer.mount_active_plugin();
                            session
                                .reset(ResetOptions {
                                    config: true,
                                    expressions: true,
                                    stats: true,
                                    table: Some(session::TableIntermediateState::Reloaded),
                                })
                                .await
                                .unwrap_or_log();

                            let client = table.get_client().await;
                            let inner_client = client.get_client().clone();
                            session.set_client(inner_client.clone());
                            workspace.set_default_client(inner_client);
                            let name = table.get_name().await;
                            tracing::debug!(
                                "Loading {:.0} rows from `Table` {}",
                                table.size().await?,
                                name
                            );

                            session.set_table(name).await?;
                            for delta in journal {
                                session.commit_view_config(delta)?;
                            }

                            session.commit_table_defaults();
                            let (disposition, _pin) =
                                crate::tasks::bind_snapshot(&guard, &session, &renderer).await?;

                            crate::tasks::dispatch_bound(
                                &guard,
                                &renderer,
                                disposition,
                                false,
                                crate::tasks::RunOrigin::Public,
                            )
                            .await?;

                            Ok(())
                        } else if let Ok(Some(client)) = wasm_bindgen_derive::try_from_js_option::<
                            perspective_js::Client,
                        >(jstable)
                        {
                            if session.take_pending_load(generation).is_none() {
                                return Ok(());
                            }

                            let inner_client = client.get_client().clone();
                            session.set_client(inner_client.clone());
                            workspace.set_default_client(inner_client);
                            Ok(())
                        } else {
                            session.take_pending_load(generation);
                            Err(ApiError::new("Invalid argument"))
                        }
                    })
                    .await
            };

            if let Err(e) = &result {
                session.take_pending_load(generation);
                session.set_error(false, e.clone()).await?;
            }

            result
        }))
    }

    /// Delete all internal [`View`]s and all associated state, rendering this
    /// `<perspective-viewer>` unusable and freeing all associated resources.
    /// Does not delete any supplied [`Table`] (as this is constructed by the
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
        delete_all(&self.workspace, &self.root)
    }

    /// Remove a [`Client`] from this `<perspective-viewer>` and dispose every
    /// panel bound to it (each panel's `View` is deleted and its `Table`
    /// reference released).
    ///
    /// # Arguments
    ///
    /// - `options` - An optional `{client?: string}` dict naming the client to
    ///   eject; the active panel's client when omitted.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.eject();
    /// await viewer.eject({client: "remote"});
    /// ```
    pub fn eject(&mut self, options: Option<JsClientOptions>) -> ApiFuture<()> {
        let ClientOptions { client } = parse_options(options);
        let Some(target) = client.or_else(|| {
            self.workspace
                .active_client()
                .map(|c| c.get_name().to_owned())
        }) else {
            return ApiFuture::new_throttled(async move { Ok(()) });
        };

        let ids = self.workspace.panels_for_client(&target);

        // The target client backs EVERY panel — reset the element to its
        // pre-`load` state (dropping the client with it), as a `Workspace`
        // must always keep at least one panel.
        if !ids.is_empty() && ids.len() == self.workspace.panel_ids().len() {
            let mut state = Self::new_from_shadow(
                self.elem.clone(),
                self.elem.shadow_root().unwrap().unchecked_into(),
            );

            std::mem::swap(self, &mut state);
            return ApiFuture::new_throttled(state.delete());
        }

        eject_client_panels(&self.workspace, &self.root, target, ids)
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
    pub fn getView(&self, options: Option<JsPanelOptions>) -> ApiFuture<View> {
        let PanelOptions { panel: name } = parse_options(options);
        let this = self.clone();
        ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            Ok(panel.session.get_view().ok_or("No table set")?.into())
        })
    }

    /// Get a copy of the [`ViewConfig`] for the current [`View`]. This is
    /// non-blocking as it does not need to access the plugin (unlike
    /// [`PerspectiveViewerElement::save`]), and also makes no API calls to the
    /// server (unlike [`PerspectiveViewerElement::getView`] followed by
    /// [`View::get_config`])
    #[wasm_bindgen]
    pub fn getViewConfig(&self, options: Option<JsPanelOptions>) -> ApiFuture<JsViewConfig> {
        let PanelOptions { panel: name } = parse_options(options);
        let this = self.clone();
        ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            let config = if let Some(ctx) = panel.renderer.render_context() {
                (*ctx.view_config).clone()
            } else if let Some(rendered) = panel.session.get_rendered_view_config() {
                (*rendered).clone()
            } else {
                panel.session.get_view_config().clone()
            };

            Ok(JsValue::from_serde_ext(&config)?.unchecked_into())
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
    pub fn getTable(&self, options: Option<JsGetTableOptions>) -> ApiFuture<Table> {
        let GetTableOptions {
            wait: wait_for_table,
            panel: name,
        } = parse_options(options);
        let this = self.clone();
        ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            if !wait_for_table.unwrap_or_default()
                && let Some(ctx) = panel.renderer.render_context()
            {
                return Ok(ctx.table.clone().into());
            }

            let session = panel.session;
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
    pub fn getClient(
        &self,
        options: Option<JsGetClientOptions>,
    ) -> ApiFuture<perspective_js::Client> {
        let GetClientOptions {
            wait: wait_for_client,
            panel: name,
        } = parse_options(options);
        let this = self.clone();
        ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            if !wait_for_client.unwrap_or_default()
                && let Some(ctx) = panel.renderer.render_context()
            {
                return Ok(ctx.client.clone().into());
            }

            let session = panel.session;
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
    pub fn getRenderStats(&self, options: Option<JsPanelOptions>) -> ApiResult<JsValue> {
        let PanelOptions { panel: name } = parse_options(options);
        let panel = self.resolve_panel(name)?;
        Ok(JsValue::from_serde_ext(
            &panel.renderer.render_timer().get_stats(),
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
        let workspace = self.workspace.clone();
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
            for panel in workspace
                .panel_ids()
                .into_iter()
                .filter_map(|id| workspace.panel(&id))
            {
                panel.renderer.clone().with_lock(async { Ok(()) }).await?;
                panel.renderer.with_lock(async { Ok(()) }).await?;
                panel.session.settle_dispatches().await?;
            }

            Ok(())
        })
    }

    /// Restore a single panel from a full/partial
    /// [`perspective_js::JsViewConfig`] (its user-configurable state, including
    /// the `Table` name) — the active panel, or a specific panel via the
    /// optional `{panel}` selector.
    ///
    /// If `panel` names no existing panel, a NEW panel is created with that id
    /// and the config restored into it (an upsert), equivalent to
    /// [`Self::addPanel`] but with a caller-chosen id. As with a created panel,
    /// the element-level `settings`/`theme` fields are ignored in that case.
    ///
    /// This restores a SINGLE panel; a whole-element config (with a `panels`
    /// map) must be applied via [`Self::restoreWorkspace`] — its `panels` /
    /// `layout` keys are ignored here.
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
    /// - `name` - The panel to target, or `None` for the active panel.
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
    pub fn restore(
        &self,
        update: JsViewerConfigUpdate,
        options: Option<JsPanelOptions>,
    ) -> JsVoidPromise {
        let PanelOptions { panel: name } = parse_options(options);
        let this = self.clone();
        let fut = ApiFuture::new_throttled(async move {
            let id = name.map(PanelId::from);
            let update = ViewerConfigUpdate::decode(&update)?;
            match this.workspace.panel_or_active(id.as_ref()) {
                // An existing (or the active) panel — update it in place.
                Some(panel) => {
                    let active = panel.id == this.workspace.active_id();
                    restore_panel(
                        &panel.session,
                        &panel.renderer,
                        &this.presentation,
                        Some(&this.root),
                        RestoreMode::Existing { active },
                        update,
                    )
                    .await
                },
                // A `panel` that matches no panel — create it (upsert), routing
                // through the shared `create_panel` (`RestoreMode::Fresh`)
                // pipeline so the new panel's id is the requested `panel`.
                None => {
                    let notify = this.layout_changed_notify();
                    create_panel(
                        &this.elem,
                        &this.presentation,
                        &this.workspace,
                        &notify,
                        id,
                        update,
                        None,
                    )
                    .await?;
                    Ok(())
                },
            }
        });

        js_sys::Promise::from(fut).unchecked_into()
    }

    /// Restore the ENTIRE element from a whole-element
    /// [`WorkspaceConfigUpdate`] (`{version, active?, layout, panels, ...}`) —
    /// the multi-panel counterpart of [`Self::restore`]. Every existing panel
    /// is replaced by the `panels` entries, and the layout tree + master/detail
    /// cross-filter state re-applied. Unlike [`Self::restore`], this never
    /// falls back to the single-panel path.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.restoreWorkspace(await otherViewer.saveWorkspace());
    /// ```
    pub fn restoreWorkspace(&self, update: JsWorkspaceConfigUpdate) -> JsVoidPromise {
        let update: JsViewerConfigUpdate = update.unchecked_into();
        let this = self.clone();
        let fut = ApiFuture::new(async move {
            let (contents, eject_tasks) = sync_update_panels(&this, update)?;
            let results = join_all(contents.into_iter().map(|(id, session, renderer, config)| {
                let presentation = this.presentation.clone();
                let workspace = this.workspace.clone();
                async move {
                    stamp_global_overlay(&workspace, &id, &session);
                    restore_panel(
                        &session,
                        &renderer,
                        &presentation,
                        None,
                        RestoreMode::Fresh,
                        config,
                    )
                    .await?;
                    if workspace.is_master(&id) {
                        set_edit_mode(&session, &renderer, "SELECT_ROW_TREE");
                    }

                    Ok(())
                }
            }))
            .await;

            results.into_iter().collect::<ApiResult<Vec<_>>>()?;
            join_all(eject_tasks)
                .await
                .into_iter()
                .collect::<ApiResult<Vec<_>>>()?;

            Ok(())
        });

        js_sys::Promise::from(fut).unchecked_into()
    }

    /// If this element is in an _errored_ state, this method will clear it and
    /// re-render. Calling this method is equivalent to clicking the error reset
    /// button in the UI.
    pub fn resetError(&self) -> ApiFuture<()> {
        let panel = self.workspace.active_panel();
        ApiFuture::spawn(panel.session.reset(ResetOptions::default()));
        ApiFuture::new_throttled(async move {
            apply_and_render(&panel.session, &panel.renderer, ViewConfigUpdate::default())?.await?;
            Ok(())
        })
    }

    /// Save a single panel's user-configurable state as a [`ViewerConfig`], one
    /// which can be restored via [`Self::restore`] — the active panel, or a
    /// specific panel via the optional `{panel}` selector.
    ///
    /// This saves a SINGLE panel; to snapshot the ENTIRE element (every panel +
    /// layout + cross-filters) use [`Self::saveWorkspace`].
    ///
    /// # Arguments
    ///
    /// - `options` - An optional `{panel?: string}`; the panel to save, or the
    ///   active panel when omitted.
    ///
    /// # JavaScript Examples
    ///
    /// Get the current `group_by` setting:
    ///
    /// ```javascript
    /// const {group_by} = await viewer.save();
    /// ```
    ///
    /// Reset workflow attached to an external button `myResetButton`:
    ///
    /// ```javascript
    /// const token = await viewer.save();
    /// myResetButton.addEventListener("click", async () => {
    ///     await viewer.restore(token);
    /// });
    /// ```
    pub fn save(&self, options: Option<JsPanelOptions>) -> JsViewerConfigPromise {
        let PanelOptions { panel: name } = parse_options(options);
        let this = self.clone();
        let fut = ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            let viewer_config = panel
                .renderer
                .clone()
                .with_lock(async {
                    get_viewer_config(&panel.session, &panel.renderer, &this.presentation).await
                })
                .await?;

            viewer_config.encode()
        });

        js_sys::Promise::from(fut).unchecked_into()
    }

    /// Save the ENTIRE element to a whole-element [`WorkspaceConfig`]
    /// (`{version, active?, layout, panels, ...}`) — the multi-panel
    /// counterpart of [`Self::save`]. Unlike [`Self::save`] (which emits a
    /// single `ViewerConfig` for one panel), this ALWAYS emits the
    /// whole-element format, restorable via [`Self::restoreWorkspace`].
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const token = await viewer.saveWorkspace();
    /// await viewer.restoreWorkspace(token);
    /// ```
    pub fn saveWorkspace(&self) -> JsWorkspaceConfigPromise {
        let this = self.clone();
        let fut = ApiFuture::new(Self::workspace_config(this));
        js_sys::Promise::from(fut).unchecked_into()
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
    pub fn download(&self, options: Option<JsExportOptions>) -> ApiFuture<()> {
        let ExportOptions {
            method,
            panel: name,
        } = parse_options(options);
        let method = method.map(|m| JsString::from(m.as_str()));
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

            let panel = this.resolve_panel(name)?;
            let blob =
                export_method_to_blob(&panel.session, &panel.renderer, &this.presentation, method)
                    .await?;
            let is_chart = panel.renderer.is_chart();
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
    /// `@perspective-dev/viewer-charts`). Otherwise, prefer to call the
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
    pub fn export(&self, options: Option<JsExportOptions>) -> ApiFuture<JsValue> {
        let ExportOptions {
            method,
            panel: name,
        } = parse_options(options);
        let method = method.map(|m| JsString::from(m.as_str()));
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

            let panel = this.resolve_panel(name)?;
            export_method_to_jsvalue(&panel.session, &panel.renderer, &this.presentation, method)
                .await
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
    pub fn copy(&self, options: Option<JsExportOptions>) -> ApiFuture<()> {
        let ExportOptions {
            method,
            panel: name,
        } = parse_options(options);
        let method = method.map(|m| JsString::from(m.as_str()));
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

            let panel = this.resolve_panel(name)?;
            let js_task =
                export_method_to_blob(&panel.session, &panel.renderer, &this.presentation, method);
            copy_to_clipboard(js_task, MimeType::TextPlain).await
        })
    }

    /// Reset a panel's `ViewerConfig` to its data-relative default.
    ///
    /// Without a `panel`, this is ELEMENT-LEVEL: EVERY panel is reset and the
    /// cross-filter overlay cleared (symmetric with whole-element
    /// [`Self::save`] / [`Self::restore`]). With `{panel}`, only that panel is
    /// reset — the other panels and the overlay are left untouched.
    ///
    /// # Arguments
    ///
    /// - `reset_all` - If set, will clear expressions and column settings as
    ///   well.
    /// - `options` - An optional `{panel?: string}`; the panel to reset, or
    ///   every panel when omitted.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.reset();                     // every panel
    /// await viewer.reset(true, {panel: "p1"});  // just "p1", + expressions
    /// ```
    pub fn reset(&self, reset_all: Option<bool>, options: Option<JsPanelOptions>) -> ApiFuture<()> {
        let PanelOptions { panel: name } = parse_options(options);
        let this = self.clone();
        let all = reset_all.unwrap_or_default();
        ApiFuture::new_throttled(async move {
            let (completion, receiver) = Completion::new();
            {
                let root = this.root.borrow();
                let app = root.as_ref().ok_or("Already deleted")?;
                match name {
                    // Element-level: reset every panel + the cross-filter overlay.
                    None => {
                        tracing::debug!("Resetting config");
                        app.send_message(PerspectiveViewerMsg::Reset(all, Some(completion)));
                    },
                    // A single named panel; errors if the panel doesn't exist.
                    Some(name) => {
                        let panel = this.resolve_panel(Some(name))?;
                        tracing::debug!("Resetting config ({})", panel.id);
                        app.send_message(PerspectiveViewerMsg::ResetPanel(
                            Some(panel.id.to_string()),
                            all,
                            Some(completion),
                        ));
                    },
                }
            }

            receiver.await.map_err(|_| ApiError::new("Cancelled"))?
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
    /// - `options` - An optional object with the following fields:
    ///   - `dimensions` - An optional object `{width, height}` providing
    ///     explicit size hints (in pixels) for the plugin container. When
    ///     provided, the plugin element will be temporarily sized to these
    ///     dimensions during resize, then reset.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.resize()
    /// await viewer.resize({dimensions: {width: 800, height: 600}})
    /// ```
    #[wasm_bindgen]
    pub fn resize(&self, options: Option<JsValue>) -> ApiFuture<()> {
        let opts: ResizeOptions = options
            .map(|v| v.into_serde_ext())
            .transpose()
            .unwrap_or_default()
            .unwrap_or_default();

        let workspace = self.workspace.clone();
        ApiFuture::new_throttled(async move {
            let panel = workspace.active_panel();
            if !panel.renderer.is_plugin_activated()? {
                apply_and_render(&panel.session, &panel.renderer, ViewConfigUpdate::default())?
                    .await?;
            } else if let Some(dims) = opts.dimensions {
                panel
                    .renderer
                    .resize_with_dimensions(dims.width, dims.height)
                    .await?;
            } else {
                resize_visible_panels(&workspace).await;
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
                &self.workspace,
                &self.presentation,
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
    pub fn setAutoPause(&self, autopause: bool) -> ApiFuture<()> {
        if autopause {
            let handle = Some(IntersectionObserverHandle::new(
                &self.elem,
                &self.presentation,
                &self.workspace,
            ));

            *self.intersection_handle.borrow_mut() = handle;
        } else {
            *self.intersection_handle.borrow_mut() = None;
            let workspace = self.workspace.clone();
            let presentation = self.presentation.clone();
            return ApiFuture::new(async move {
                for id in workspace.panel_ids() {
                    if let Some(panel) = workspace.panel(&id)
                        && panel.session.set_pause(false)
                    {
                        let result = restore_and_render(
                            &panel.session,
                            &panel.renderer,
                            &presentation,
                            RunOrigin::Internal,
                            ViewerConfigUpdate::default(),
                            async { Ok(()) },
                        )
                        .await;

                        if let Err(e) = result {
                            panel.session.set_error(false, e).await?;
                        }
                    }
                }

                Ok(())
            });
        }

        ApiFuture::new(async move { Ok(()) })
    }

    /// Return a [`perspective_js::JsViewWindow`] for the currently selected
    /// region of the named panel, or the active panel when `panel` is omitted.
    #[wasm_bindgen]
    pub fn getSelection(&self, options: Option<JsPanelOptions>) -> ApiResult<Option<JsViewWindow>> {
        let PanelOptions { panel: name } = parse_options(options);
        let panel = self.resolve_panel(name)?;
        Ok(panel.renderer.get_selection().map(|x| x.into()))
    }

    /// Set the selection [`perspective_js::JsViewWindow`] for the named panel,
    /// or the active panel when `panel` is omitted.
    #[wasm_bindgen]
    pub fn setSelection(
        &self,
        window: Option<JsViewWindow>,
        options: Option<JsPanelOptions>,
    ) -> ApiResult<()> {
        let PanelOptions { panel: name } = parse_options(options);
        let window = window.map(|x| x.into_serde_ext()).transpose()?;
        self.resolve_panel(name)?.renderer.set_selection(window);
        Ok(())
    }

    /// Get this viewer's edit port for the named panel's [`Table`] (see
    /// [`Table::update`] for details on ports), or the active panel when
    /// `panel` is omitted.
    #[wasm_bindgen]
    pub fn getEditPort(&self, options: Option<JsPanelOptions>) -> ApiResult<f64> {
        let PanelOptions { panel: name } = parse_options(options);
        let panel = self.resolve_panel(name)?;
        let edit_port = if let Some(ctx) = panel.renderer.render_context() {
            ctx.edit_port
        } else {
            panel.session.metadata().get_edit_port()
        };

        Ok(edit_port.ok_or("No `Table` loaded")?)
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
    /// viewer.style = "--psp--color: red";
    /// await viewer.restyleElement();
    /// ```
    #[wasm_bindgen]
    pub fn restyleElement(&self) -> ApiFuture<JsValue> {
        clone!(self.workspace, self.presentation);
        ApiFuture::new(async move {
            let default = presentation.get_default_theme_name().await;
            for panel in workspace
                .panel_ids()
                .into_iter()
                .filter_map(|id| workspace.panel(&id))
            {
                panel.renderer.set_default_theme(default.clone());
                panel.renderer.restyle_all().await?;
            }

            Ok(JsValue::UNDEFINED)
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
        clone!(self.workspace, self.presentation);
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
            let new_default = presentation.get_default_theme_name().await;
            for panel in workspace
                .panel_ids()
                .into_iter()
                .filter_map(|id| workspace.panel(&id))
            {
                panel.renderer.set_default_theme(new_default.clone());
                if panel.renderer.needs_restyle() {
                    panel.renderer.restyle_all().await?;
                }
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
        for panel in self
            .workspace
            .panel_ids()
            .into_iter()
            .filter_map(|id| self.workspace.panel(&id))
        {
            panel.renderer.set_throttle(val);
        }
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
        self.workspace
            .active_renderer()
            .get_all_plugins()
            .iter()
            .collect::<Array>()
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
            None => self.workspace.active_renderer().ensure_plugin_selected(),
            Some(name) => self.workspace.active_renderer().get_plugin(&name),
        }
    }

    /// Add a new, independent panel to this viewer's layout, rendering the
    /// supplied [`ViewerConfigUpdate`] into it. The panel uses the default
    /// [`perspective_client::Client`] (the first passed to [`Self::load`]) to
    /// resolve its `table`. Returns the generated panel id.
    ///
    /// Element-level config fields (`settings`, `theme`) in the argument are
    /// ignored — those are shared across the element, not per-panel.
    #[wasm_bindgen]
    pub fn addPanel(&self, update: JsViewerConfigUpdate) -> ApiFuture<JsValue> {
        clone!(self.elem, self.presentation, self.workspace);
        let notify = self.layout_changed_notify();
        ApiFuture::new(async move {
            let update = ViewerConfigUpdate::decode(&update)?;
            let id = create_panel(
                &elem,
                &presentation,
                &workspace,
                &notify,
                None,
                update,
                None,
            )
            .await?;
            Ok(JsValue::from_str(id.as_str()))
        })
    }

    /// Get the ids of all panels in this viewer's layout, in insertion order.
    #[wasm_bindgen]
    pub fn getPanelNames(&self) -> Array {
        self.workspace
            .panel_ids()
            .iter()
            .map(|id| JsValue::from_str(id.as_str()))
            .collect()
    }

    /// The id of the active panel — the one the settings panel and status-bar
    /// toolbar target.
    #[wasm_bindgen]
    pub fn getActivePanel(&self) -> JsValue {
        JsValue::from_str(self.workspace.active_id().as_str())
    }

    /// Make the panel with id `name` the active panel, re-targeting the
    /// settings panel and status-bar toolbar (and the root's
    /// session/renderer subscriptions) to its engines. Resolves after the
    /// activation-chrome redraws on both sides of the switch have completed
    /// (invariant I6).
    #[wasm_bindgen]
    pub fn setActivePanel(&self, name: String) -> ApiFuture<()> {
        let root = self.root.clone();
        ApiFuture::new(async move {
            let (completion, receiver) = Completion::new();
            root.borrow()
                .as_ref()
                .into_apierror()?
                .send_message(PerspectiveViewerMsg::SetActivePanel(name, Some(completion)));

            receiver.await.map_err(|_| ApiError::new("Cancelled"))?
        })
    }

    /// Remove the panel with id `name` from the layout, disposing its engines
    /// (its `View` is deleted and its `Table` reference released). The last
    /// remaining panel cannot be removed (resolves as a no-op). Resolves
    /// after the panel's teardown run completes, carrying any teardown
    /// error — previously fire-and-forget and silently dropped (invariant
    /// I6). See also [`Self::addPanel`].
    #[wasm_bindgen]
    pub fn removePanel(&self, name: String) -> ApiFuture<()> {
        let root = self.root.clone();
        ApiFuture::new(async move {
            let (completion, receiver) = Completion::new();
            root.borrow()
                .as_ref()
                .into_apierror()?
                .send_message(PerspectiveViewerMsg::ClosePanel(name, Some(completion)));

            receiver.await.map_err(|_| ApiError::new("Cancelled"))?
        })
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
    pub fn toggleColumnSettings(
        &self,
        column_name: String,
        options: Option<JsPanelOptions>,
    ) -> ApiFuture<()> {
        let PanelOptions { panel: name } = parse_options(options);
        let this = self.clone();
        ApiFuture::new_throttled(async move {
            let panel = this.resolve_panel(name)?;
            let was_active = panel.id == this.workspace.active_id();
            let locator = get_column_locator(&panel.session.metadata(), Some(column_name));
            if !was_active {
                this.root.borrow().as_ref().into_apierror()?.send_message(
                    PerspectiveViewerMsg::SetActivePanel(panel.id.as_str().to_owned(), None),
                );
            }

            let (sender, receiver) = channel::<()>();
            this.root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::OpenColumnSettings {
                    locator,
                    sender: Some(sender),
                    toggle: was_active,
                },
            );

            receiver.await.map_err(|_| ApiError::from("Cancelled"))
        })
    }
}
