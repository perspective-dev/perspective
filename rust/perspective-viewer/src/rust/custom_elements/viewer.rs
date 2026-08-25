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
use perspective_js::utils::global;
use perspective_js::{JsViewConfig, JsViewWindow, Table, View, apierror};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_derive::try_from_js_option;
use wasm_bindgen_futures::JsFuture;
use web_sys::HtmlElement;
use yew::Callback;

#[cfg(feature = "llm-agent")]
use crate::agent::AgentRuntime;
use crate::components::viewer::{PerspectiveViewerMsg, PerspectiveViewerProps};
use crate::config::*;
use crate::custom_events::*;
use crate::js::*;
use crate::presentation::*;
use crate::queries::*;
use crate::root::Root;
use crate::session::{ResetOptions, TableLoadState};
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

    /// `restore()` options dict
    /// (`{ panel?: string, suppress_errors?: boolean }`).
    #[wasm_bindgen(typescript_type = "RestoreOptions")]
    pub type JsRestoreOptions;

    /// `addPanel()` argument: a new panel's initial config — `table`
    /// REQUIRED.
    #[wasm_bindgen(typescript_type = "ViewerConfigInitial")]
    pub type JsViewerConfigInitial;

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

    /// `restoreWorkspace()` argument: a workspace config update.
    #[wasm_bindgen(typescript_type = "WorkspaceConfigUpdate")]
    pub type JsWorkspaceConfigUpdate;

    /// `saveWorkspace()` options dict (`{ full_palette?: boolean }`).
    #[wasm_bindgen(typescript_type = "SaveWorkspaceOptions")]
    pub type JsSaveWorkspaceOptions;

    /// `saveWorkspace()` return: a workspace config.
    #[wasm_bindgen(typescript_type = "Promise<WorkspaceConfig>")]
    pub type JsWorkspaceConfigPromise;

    /// A `Promise<void>` return, used by the `restore` family (whose
    /// `ApiFuture<()>` would otherwise erase to `Promise<any>`).
    #[wasm_bindgen(typescript_type = "Promise<void>")]
    pub type JsVoidPromise;

    /// `save()` return: a single-panel config.
    #[wasm_bindgen(typescript_type = "Promise<ViewerConfig>")]
    pub type JsViewerConfigPromise;
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
    intersection_handle: Rc<RefCell<Option<AutoPauseHandle>>>,
    hosted_table_subs: HostedTableSubs,
    _subscriptions: Rc<[Subscription; 2]>,
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

    async fn workspace_config(this: Self, full_palette: bool) -> ApiResult<JsValue> {
        this.workspace.effects().settle().await;
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

        let mut palette = palette_set(&this.workspace, &this.presentation);
        let mut referenced = std::collections::BTreeSet::new();
        for (id, item) in styles_in_use(&this.workspace) {
            let Some(name) = palette_name_for(&palette, item.kind, &item.literal) else {
                continue;
            };

            if let Some(entry) = panels
                .get_mut(id.as_str())
                .and_then(|panel| panel.columns_config.get_mut(&item.column))
            {
                entry.insert(item.key, serde_json::Value::String(format_var_ref(&name)));
                referenced.insert(name);
            }
        }

        if !full_palette {
            palette.retain(|name, _| referenced.contains(name));
        }

        let active = this
            .presentation
            .is_settings_open()
            .then(|| this.workspace.active_id())
            .flatten()
            .map(|id| id.as_str().to_owned());

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
            palette,
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
    let effect = workspace.effects().guard();
    ApiFuture::new_throttled(async move {
        let _effect = effect;
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

        // Boot with ZERO panels — an unconfigured element is a blank stage. The
        // first `load`/`restore`/`addPanel` creates the first panel, which
        // adopts the element's `theme` attribute when set (see
        // `create_panel_model`'s authored-theme boot).
        let workspace = Workspace::new();
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
        let intersect_handle = AutoPauseHandle::new(&elem, &presentation, &workspace);
        let (lifecycle_sub, hosted_table_subs) = wire_table_lifecycle(&workspace, &presentation);

        Self {
            elem,
            root,
            presentation,
            workspace,
            resize_handle: Rc::new(RefCell::new(Some(resize_handle))),
            intersection_handle: Rc::new(RefCell::new(Some(intersect_handle))),
            hosted_table_subs,
            _subscriptions: Rc::new([eject_sub, lifecycle_sub]),
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
        let effect = self.workspace.effects().guard();
        let table: JsValue = client.into();
        let promise = table
            .clone()
            .dyn_into::<js_sys::Promise>()
            .unwrap_or_else(|_| js_sys::Promise::resolve(&table));

        // Resolve the target panel. On an EMPTY element (zero panels):
        //  - a synchronously-detectable `Client` registers inertly with NO panel (the
        //    common `load(client)` — no phantom panel is left behind);
        //  - otherwise (a resolved `Table`, or a `Promise` whose type isn't yet known)
        //    the first panel is RESERVED synchronously here — a full panel model held
        //    in the workspace's reservation slot, NOT placed — so its ordering position
        //    is fixed at the call site: a `restore()` fired right after an unawaited
        //    `load()` CLAIMS the reservation (placing it) and targets THIS panel, not a
        //    second one. The reservation is likewise placed when the payload proves to
        //    be a `Table` (or the load fails, surfacing its error), and discarded —
        //    only while still unclaimed — for an inert `Client` payload. Placement and
        //    discard are both atomic slot transfers (`Workspace::claim_reserved` /
        //    `Workspace::take_reserved`), so an inert payload disposing a panel a
        //    racing `restore` claimed is unrepresentable.
        // A pre-existing active panel is used as-is (a `Client` registers
        // inertly against it, never clearing its table).
        let (panel, notify) = match self.workspace.active_panel() {
            Some(panel) => (panel, None),
            None => {
                // Empty element — classify the payload synchronously where possible.
                if let Ok(Some(client)) =
                    try_from_js_option::<perspective_js::Client>(table.clone())
                {
                    // A resolved `Client` registers SYNCHRONOUSLY (so an unawaited
                    // `load(client)` is visible to a `restore()` fired right after,
                    // which creates the first panel and federates against loaded
                    // clients) and creates NO panel — inert.
                    self.workspace
                        .set_default_client(client.get_client().clone());
                    return Ok(ApiFuture::new(async { Ok(()) }));
                }

                // A resolved `Table` (or a `Promise` whose type isn't yet known)
                // adopts the pending reservation (a second `load()` on a
                // still-empty element), else reserves a fresh panel model.
                let panel = self.workspace.reserved_panel().unwrap_or_else(|| {
                    create_panel_model(
                        &self.elem,
                        &self.presentation,
                        &self.workspace,
                        None,
                        ViewerConfigUpdate::default(),
                        None,
                        Placement::Reserved,
                    );
                    self.workspace
                        .reserved_panel()
                        .expect("just-reserved panel is present")
                });

                // Carrying `Some(notify)` marks this load as the reservation's
                // owner — the only call that may place or discard it below.
                (panel, Some(self.layout_changed_notify()))
            },
        };

        // A `Table` payload targets this panel's engines; a `Client` registers
        // inertly against it. Selecting the panel here (not at construction)
        // keeps the registry race safe — by `load()` time real plugins have
        // registered.
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
            let _effect = effect;
            renderer.set_throttle(None);
            let _run_token = session.begin_config_run();
            let result = {
                clone!(session, renderer, workspace, notify);
                renderer
                    .clone()
                    .render_task(|guard| async move {
                        seed_panel_theme(&presentation, &renderer).await;
                        renderer.stamp_theme(None);
                        let jstable = JsFuture::from(promise)
                            .await
                            .map_err(|x| apierror!(TableError(x)))?;

                        if let Ok(Some(table)) =
                            try_from_js_option::<perspective_js::Table>(jstable.clone())
                        {
                            tracing::warn!("{}", DEPRECATED_TABLE_MESSAGE);
                            let Some(journal) = session.take_pending_load(generation) else {
                                return Ok(None);
                            };

                            if let Some(notify) = &notify {
                                place_reserved(&workspace, notify, true);
                            }

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

                            Ok(None)
                        } else if let Ok(Some(client)) = wasm_bindgen_derive::try_from_js_option::<
                            perspective_js::Client,
                        >(jstable)
                        {
                            // INERT: register the client only — never rebind or
                            // reset the active panel (its table is preserved).
                            // Panels bind their client lazily at table-resolution
                            // time (`Workspace::resolve_client_for_table`). The
                            // window is discarded (not replayed): a `Client`
                            // performs no reset, and any racing `restore`'s
                            // commits already applied live (`commit_view_config`).
                            let owned_window = session.take_pending_load(generation).is_some();
                            let discard = if owned_window && notify.is_some() {
                                match workspace.take_reserved() {
                                    Some(panel) => Some((panel, None)),
                                    // The one-shot claim read: a table-less
                                    // `restore` claimed the reservation, and no
                                    // table has bound nor is pending — evict the
                                    // panel `CREATE_REQUIRES_TABLE` forbids.
                                    None if workspace
                                        .resolve_claim()
                                        .is_some_and(|has_table| !has_table)
                                        && session.get_table().is_none()
                                        && session.pending_table().is_none() =>
                                    {
                                        let evicted = renderer
                                            .slot_name()
                                            .map(PanelId::from)
                                            .and_then(|id| workspace.remove_panel(&id));

                                        if evicted.is_some()
                                            && let Some(notify) = &notify
                                        {
                                            notify.emit(());
                                        }

                                        evicted.map(|panel| {
                                            (panel, Some(ApiError::new(CREATE_REQUIRES_TABLE)))
                                        })
                                    },
                                    None => None,
                                }
                            } else {
                                None
                            };

                            workspace.set_default_client(client.get_client().clone());
                            Ok(discard)
                        } else {
                            session.take_pending_load(generation);
                            Err(ApiError::new("Invalid argument"))
                        }
                    })
                    .await
            };

            match result {
                Err(e) => {
                    session.take_pending_load(generation);
                    if let Some(notify) = &notify {
                        place_reserved(&workspace, notify, true);
                    }

                    session.set_error(false, e.clone()).await?;
                    Err(e)
                },
                Ok(Some((panel, error))) => {
                    eject_panel(panel).await?;
                    match error {
                        Some(e) => Err(e),
                        None => Ok(()),
                    }
                },
                Ok(None) => Ok(()),
            }
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
        let subs = std::mem::take(&mut *self.hosted_table_subs.borrow_mut());
        let teardown = delete_all(&self.workspace, &self.root);
        ApiFuture::new(async move {
            for (client, id) in subs {
                let _ = client.remove_hosted_tables_update(id).await;
            }

            teardown.await
        })
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
        // Default target: the active panel's client, or — when the active panel
        // is unbound (`load(Client)` is now inert) — the default client.
        let Some(target) = client
            .or_else(|| {
                self.workspace
                    .active_client()
                    .map(|c| c.get_name().to_owned())
            })
            .or_else(|| {
                self.workspace
                    .default_client()
                    .map(|c| c.get_name().to_owned())
            })
        else {
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
        let presentation = self.presentation.clone();
        ApiFuture::new_throttled(async move {
            loop {
                workspace.effects().settle().await;
                let panels = workspace
                    .reserved_panel()
                    .into_iter()
                    .chain(workspace.panels())
                    .collect::<Vec<_>>();

                let mut fulfilled = false;
                for panel in &panels {
                    panel.renderer.clone().with_lock(async { Ok(()) }).await?;
                    panel.renderer.clone().with_lock(async { Ok(()) }).await?;
                    panel.session.settle_dispatches().await?;
                    if !global::document().hidden()
                        && presentation.is_visible()
                        && !panel.renderer.is_plugin_activated()?
                        && panel.session.get_error().is_none()
                        && matches!(panel.session.has_table(), Some(TableLoadState::Loaded))
                    {
                        set_panel_paused(&panel.session, &panel.renderer, &presentation, true)
                            .await?;
                        if !panel.renderer.is_plugin_activated()? {
                            just_render(&panel.session, &panel.renderer)?.await?;
                        }

                        fulfilled = true;
                    }
                }

                if !fulfilled && workspace.effects().is_empty() {
                    return Ok(());
                }
            }
        })
    }

    /// Restore a single panel from a full/partial
    /// [`perspective_js::JsViewConfig`] (its user-configurable state, including
    /// the `Table` name) — the active panel, or a specific panel via the
    /// optional `{panel}` selector.
    ///
    /// If `panel` names no existing panel, a NEW panel is created with that id
    /// and the config restored into it (an upsert). Creation REQUIRES a
    /// `table` — the same rule [`Self::addPanel`] enforces in its argument
    /// type — and a would-create call without one REJECTS before any state
    /// (including `settings`) is applied: with no panel to target and no
    /// `table`, the patch has no data arrival path. In particular, on an
    /// element with zero panels every `restore` must carry a `table`.
    ///
    /// On an empty element with a pending [`Self::load`] whose payload is not
    /// yet classified, the active-target form (no `panel`) instead claims and
    /// restores into that load's reserved first panel — see [`Self::load`].
    ///
    /// This restores a SINGLE panel; a workspace config (with a `panels`
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
    /// - `options.panel` - The panel to target, or the active panel when
    ///   omitted.
    /// - `options.suppress_errors` - when `true`, a failed restore only rejects
    ///   the returned `Promise`; the error is NOT committed to the viewer's
    ///   visible error state and the session remains usable. The view config is
    ///   rolled back to its pre-call value, so a rejected patch cannot re-merge
    ///   into a later restore. Element-level state the call already applied
    ///   (theme, title, a plugin swap) is NOT undone — restore a known-good
    ///   config to recover those exactly.
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
        options: Option<JsRestoreOptions>,
    ) -> JsVoidPromise {
        let RestoreOptions {
            panel: name,
            suppress_errors,
        } = parse_options(options);

        let errors = if suppress_errors.unwrap_or_default() {
            RestoreErrors::Suppress
        } else {
            RestoreErrors::Publish
        };

        let effect = self.workspace.effects().guard();
        let this = self.clone();
        let fut = ApiFuture::new_throttled(async move {
            let _effect = effect;
            let id = name.map(PanelId::from);
            let mut update = ViewerConfigUpdate::decode(&update)?;
            let settings = std::mem::replace(&mut update.settings, OptionalUpdate::Missing);
            enum Target {
                Existing { panel: Panel, active: bool },
                Claimed(Panel),
                Create(Box<ViewerConfigInitial>),
            }

            let notify = this.layout_changed_notify();
            let target = match this.workspace.panel_or_active(id.as_ref()) {
                // An existing (or the active) panel — update it in place.
                Some(panel) => {
                    let active = this.workspace.active_id().as_ref() == Some(&panel.id);
                    Target::Existing { panel, active }
                },
                None => {
                    let has_table = matches!(&update.table, OptionalUpdate::Update(_));
                    match id
                        .is_none()
                        .then(|| place_reserved(&this.workspace, &notify, has_table))
                        .flatten()
                    {
                        Some(panel) => Target::Claimed(panel),
                        None => Target::Create(Box::new(ViewerConfigInitial::try_from(
                            std::mem::take(&mut update),
                        )?)),
                    }
                },
            };

            if !matches!(settings, OptionalUpdate::Missing) {
                // Through `ToggleSettingsInit` — the SAME full choreography
                // the toolbar toggle drives (presize every visible plugin
                // to its post-toggle box, then the exactness-finalizer
                // resize) — NOT the bare `ToggleSettingsComplete` leaf,
                // which only re-renders the pane. The pane is the outer
                // `SplitPanel` (no `before-resize` event) and the host box
                // is unchanged, so a leaf-only toggle left every canvas
                // plugin CSS-stretched at its old backing size.
                //
                // No `set_settings_before_open` here: `is_settings_open` is
                // Init's toggle-vs-no-op DISPATCH state, so pre-writing the
                // target makes every call resolve as a no-op. Init owns the
                // write, as it does for the toolbar and `toggleConfig`.
                let (sender, receiver) = channel::<ApiResult<JsValue>>();
                this.root.borrow().as_ref().into_apierror()?.send_message(
                    PerspectiveViewerMsg::ToggleSettingsInit(Some(settings), false, Some(sender)),
                );

                receiver.await.map_err(|_| ApiError::new("Cancelled"))??;
            }

            match target {
                Target::Existing { panel, active } => {
                    restore_panel(
                        &panel.session,
                        &panel.renderer,
                        &this.presentation,
                        &this.workspace,
                        RestoreMode::Existing { active },
                        update,
                        errors,
                    )
                    .await
                },
                Target::Claimed(panel) => {
                    restore_panel(
                        &panel.session,
                        &panel.renderer,
                        &this.presentation,
                        &this.workspace,
                        RestoreMode::Existing { active: true },
                        update,
                        errors,
                    )
                    .await
                },
                Target::Create(config) => {
                    create_panel(
                        &this.elem,
                        &this.presentation,
                        &this.workspace,
                        &notify,
                        id,
                        *config,
                        None,
                    )
                    .await?;
                    Ok(())
                },
            }
        });

        js_sys::Promise::from(fut).unchecked_into()
    }

    /// Restore the ENTIRE element from a [`WorkspaceConfigUpdate`]
    /// (`{version, active?, layout, panels, ...}`) —
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
        let effect = self.workspace.effects().guard();
        let this = self.clone();
        let fut = ApiFuture::new(async move {
            let _effect = effect;
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
                        &workspace,
                        RestoreMode::Fresh,
                        config,
                        crate::tasks::RestoreErrors::Publish,
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
        let Some(panel) = self.workspace.active_panel() else {
            return ApiFuture::new_throttled(async move { Ok(()) });
        };

        let reset_effect = self.workspace.effects().guard();
        let reset_task = panel.session.reset(ResetOptions::default());
        ApiFuture::spawn(async move {
            let _effect = reset_effect;
            reset_task.await
        });

        let effect = self.workspace.effects().guard();
        ApiFuture::new_throttled(async move {
            let _effect = effect;
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
            this.workspace.effects().settle().await;
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

    /// Save the ENTIRE element to a [`WorkspaceConfig`]
    /// (`{version, active?, layout, panels, palette?, ...}`) — the
    /// multi-panel counterpart of [`Self::save`]. Unlike [`Self::save`]
    /// (which emits a single `ViewerConfig` for one panel), this ALWAYS
    /// emits the workspace format, restorable via
    /// [`Self::restoreWorkspace`].
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const token = await viewer.saveWorkspace();
    /// await viewer.restoreWorkspace(token);
    /// ```
    pub fn saveWorkspace(
        &self,
        options: Option<JsSaveWorkspaceOptions>,
    ) -> JsWorkspaceConfigPromise {
        let SaveWorkspaceOptions { full_palette } = parse_options(options);
        let this = self.clone();
        let fut = ApiFuture::new(Self::workspace_config(this, full_palette.unwrap_or(false)));
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
    /// cross-filter overlay cleared (symmetric with
    /// [`Self::saveWorkspace`] / [`Self::restoreWorkspace`]). With `{panel}`,
    /// only that panel is reset — the other panels and the overlay are left
    /// untouched.
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
        let effect = self.workspace.effects().guard();
        let this = self.clone();
        let all = reset_all.unwrap_or_default();
        ApiFuture::new_throttled(async move {
            let _effect = effect;
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

        let effect = self.workspace.effects().guard();
        let workspace = self.workspace.clone();
        ApiFuture::new_throttled(async move {
            let _effect = effect;
            // With zero panels there is nothing to resize; fan out to whatever
            // panels exist otherwise.
            let Some(panel) = workspace.active_panel() else {
                resize_visible_panels(&workspace).await;
                return Ok(());
            };

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
    /// When `true`, this `<perspective-viewer>` will skip rendering
    /// whenever it cannot be seen — tracked via an `IntersectionObserver`
    /// on itself (scrolled out of the viewport, `display: none`) combined
    /// with the document's page visibility (backgrounded browser tab,
    /// minimized window). Auto-pause is enabled by default.
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
            let handle = Some(AutoPauseHandle::new(
                &self.elem,
                &self.presentation,
                &self.workspace,
            ));

            *self.intersection_handle.borrow_mut() = handle;
        } else {
            *self.intersection_handle.borrow_mut() = None;
            let effect = self.workspace.effects().guard();
            let workspace = self.workspace.clone();
            let presentation = self.presentation.clone();
            return ApiFuture::new(async move {
                let _effect = effect;
                for id in workspace.panel_ids() {
                    if let Some(panel) = workspace.panel(&id) {
                        // A failed resume is already surfaced as that
                        // panel's error state — don't let it abort the
                        // remaining panels' resumes.
                        let _ =
                            set_panel_paused(&panel.session, &panel.renderer, &presentation, true)
                                .await;
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
        clone!(self.workspace);
        let effect = workspace.effects().guard();
        ApiFuture::new(async move {
            let _effect = effect;
            for panel in workspace
                .panel_ids()
                .into_iter()
                .filter_map(|id| workspace.panel(&id))
            {
                panel.renderer.restyle_all().await?;
            }

            Ok(JsValue::UNDEFINED)
        })
    }

    #[wasm_bindgen]
    pub fn getThemes(&self) -> ApiFuture<JsValue> {
        clone!(self.presentation);
        ApiFuture::new(async move {
            let x = presentation
                .get_available_themes()
                .await?
                .iter()
                .cloned()
                .collect::<Vec<_>>();

            Ok(JsValue::from(x))
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
        let effect = workspace.effects().guard();
        ApiFuture::new(async move {
            let _effect = effect;
            // `None` (re-parse the document) must survive the conversion —
            // mapping BEFORE defaulting is what keeps that branch reachable
            // from JavaScript at all.
            let themes: Option<Vec<String>> = match themes {
                None => None,
                Some(themes) => themes.iter().map(|x| x.as_string()).collect(),
            };

            let previous = presentation.active_theme_name_sync();
            let active = presentation.reset_themes(themes).await?;
            let available = presentation.get_available_themes().await?;
            for panel in workspace
                .panel_ids()
                .into_iter()
                .filter_map(|id| workspace.panel(&id))
            {
                let theme = panel.renderer.theme();

                // A panel follows the host only when it was TRACKING it (it
                // holds the host's previous theme, which is how every panel
                // born without an explicit one starts — and what keeps the
                // active panel and the host in agreement), or when its own
                // theme has left the registry. A panel explicitly set to a
                // different, still-available theme is untouched: re-ordering
                // alone must repaint nothing.
                let stale = theme.as_ref().is_none_or(|x| !available.contains(x));
                if (stale || theme == previous) && theme != active {
                    panel.renderer.set_theme(active.clone());
                    if panel.renderer.needs_restyle() {
                        panel.renderer.restyle_all().await?;
                    }
                }
            }

            presentation.publish_theme_config().await?;
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
        let effect = self.workspace.effects().guard();
        let root = self.root.clone();
        ApiFuture::new(async move {
            let _effect = effect;
            let force = force.map(SettingsUpdate::Update);
            let (sender, receiver) = channel::<ApiResult<wasm_bindgen::JsValue>>();
            root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::ToggleSettingsInit(force, true, Some(sender)),
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
            .map(|r| r.get_all_plugins().iter().collect::<Array>())
            .unwrap_or_default()
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
        let renderer = self
            .workspace
            .active_renderer()
            .ok_or_else(|| ApiError::new("No active panel"))?;
        match name {
            None => renderer.ensure_plugin_selected(),
            Some(name) => renderer.get_plugin(&name),
        }
    }

    /// Add a new, independent panel to this viewer's layout, rendering the
    /// supplied [`ViewerConfigInitial`] into it. Unlike [`Self::restore`]'s
    /// update-shaped argument, a new panel has no prior state, so `table`
    /// is REQUIRED — a table-less call rejects before the layout is
    /// touched. The panel uses the default [`perspective_client::Client`]
    /// (the first passed to [`Self::load`]) to resolve its `table`. Returns
    /// the generated panel id.
    ///
    /// The element-level `settings` field does not exist on the argument
    /// type (it is shared across the element, not per-panel).
    #[wasm_bindgen]
    pub fn addPanel(&self, config: JsViewerConfigInitial) -> ApiFuture<JsValue> {
        clone!(self.elem, self.presentation, self.workspace);
        let effect = workspace.effects().guard();
        let notify = self.layout_changed_notify();
        ApiFuture::new(async move {
            let _effect = effect;
            let config = ViewerConfigInitial::decode(&config)?;
            let id = create_panel(
                &elem,
                &presentation,
                &workspace,
                &notify,
                None,
                config,
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
    /// toolbar target — or `null` when the element has zero panels.
    #[wasm_bindgen]
    pub fn getActivePanel(&self) -> JsValue {
        self.workspace
            .active_id()
            .map(|id| JsValue::from_str(id.as_str()))
            .unwrap_or(JsValue::NULL)
    }

    /// Make the panel with id `name` the active panel, re-targeting the
    /// settings panel and status-bar toolbar (and the root's
    /// session/renderer subscriptions) to its engines. Resolves after the
    /// activation-chrome redraws on both sides of the switch have completed
    /// (invariant I6).
    #[wasm_bindgen]
    pub fn setActivePanel(&self, name: String) -> ApiFuture<()> {
        let effect = self.workspace.effects().guard();
        let root = self.root.clone();
        ApiFuture::new(async move {
            let _effect = effect;
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
        let effect = self.workspace.effects().guard();
        let root = self.root.clone();
        ApiFuture::new(async move {
            let _effect = effect;
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
        let effect = self.workspace.effects().guard();
        let this = self.clone();
        ApiFuture::new_throttled(async move {
            let _effect = effect;
            let panel = this.resolve_panel(name)?;
            let was_active = this.workspace.active_id().as_ref() == Some(&panel.id);
            let target = {
                let config = panel.session.get_view_config();
                let metadata = panel.session.metadata();
                classify_column(&column_name, &config, &metadata)
                    .map(|_| crate::presentation::ColumnSettingsTarget::Column(column_name))
            };
            if !was_active {
                this.root.borrow().as_ref().into_apierror()?.send_message(
                    PerspectiveViewerMsg::SetActivePanel(panel.id.as_str().to_owned(), None),
                );
            }

            let (sender, receiver) = channel::<()>();
            this.root.borrow().as_ref().into_apierror()?.send_message(
                PerspectiveViewerMsg::OpenColumnSettings {
                    target,
                    sender: Some(sender),
                    toggle: was_active,
                },
            );

            receiver.await.map_err(|_| ApiError::from("Cancelled"))
        })
    }
}

#[cfg(feature = "llm-agent")]
#[wasm_bindgen]
impl PerspectiveViewerElement {
    /// Configure the embedded LLM agent (see `prompt()`), replacing any prior
    /// configuration and conversation.
    ///
    /// The agent core is provider-agnostic: one OpenAI-chat-completions
    /// protocol over primitive connection fields. Exactly one of
    /// `config.url` or `config.engine` is required; the `providers` presets
    /// exported by this package are plain spreadable collections of these
    /// fields (`{...providers.anthropic, apiKey}`).
    ///
    /// - `config.url` - a full chat-completions endpoint URL (any
    ///   OpenAI-compatible service: Anthropic/Gemini compatibility endpoints,
    ///   LM Studio, Ollama, OpenRouter, a proxy...).
    /// - `config.engine` - an in-page engine object with an OpenAI-compatible
    ///   `chat.completions.create(request)` method (e.g. WebLLM's `MLCEngine`);
    ///   mutually exclusive with `url`.
    /// - `config.headers` - extra request headers, sent verbatim.
    /// - `config.apiKey` - sugar for the `Authorization: Bearer` header.
    /// - `config.model` - model id sent with each request; local servers and
    ///   engines generally answer with whatever model is loaded.
    /// - `config.name` - cosmetic label for the chat badge (presets set this).
    /// - `config.systemPrompt` - extra system-prompt context appended to the
    ///   agent's built-in instructions.
    /// - `config.maxTurns` - max model turns (tool-call rounds + the final
    ///   answer) per `prompt()` call. Defaults to 16.
    /// - `config.docs` - the agent metadata bundle, which supplies the
    ///   `search_docs` corpus and the rich tool parameter schemas: the packaged
    ///   `dist/docs/perspective-docs.json` asset as a parsed object (`import
    ///   docs from "…json" with { type: "json" }`), a `fetch()` `Response`, an
    ///   `ArrayBuffer`, a JSON string, or a `Promise` of any of those — and/or
    ///   an inline array of `{title?, text}` entries for host data definitions.
    ///   Omitted, `search_docs` searches an empty corpus and the parameter
    ///   schemas degrade to permissive objects.
    /// - `config.systemRole` - where the preamble (plus `systemPrompt`) is
    ///   placed: `"system"` (default) or `"user"`. Some engines refuse a system
    ///   message alongside `tools` because they substitute their own — WebLLM's
    ///   Hermes function calling throws `CustomSystemPromptError` on ANY system
    ///   message — and those need `"user"`, which folds the same text into the
    ///   opening user turn.
    /// - `config.entitlements` - access grants limiting which tools the agent
    ///   is offered (and may call): any of `"read_view"`, `"configure_view"`,
    ///   `"manage_layout"`, `"read_docs"`, `"read_data"`. Omitted, all but
    ///   `"read_data"` are granted; `["read_view", "read_docs"]` yields a
    ///   read-only agent.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// import { providers } from "@perspective-dev/viewer";
    ///
    /// viewer.agentConfig({
    ///     ...providers.anthropic,
    ///     apiKey: "sk-ant-...",
    ///     docs: fetch(
    ///         "node_modules/@perspective-dev/viewer/dist/docs/perspective-docs.json",
    ///     ),
    /// });
    /// ```
    #[wasm_bindgen(js_name = "agentConfig")]
    pub fn agent_config(&self, config: JsValue) -> ApiResult<()> {
        let runtime = AgentRuntime::new(&config, self.clone())?;
        self.presentation.agent.configure(runtime);
        Ok(())
    }

    /// Run one conversational turn of the embedded LLM agent (configured via
    /// `agentConfig()`), resolving with the agent's final text response after
    /// any tool calls have been applied to this element. Turns share a
    /// conversation history (and the chat sidebar's transcript) until
    /// `agentReset()`; a call made while a turn is already running rejects.
    /// Tool activity is emitted as `perspective-agent-tool` CustomEvents on
    /// this element.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.agentPrompt("Show me sales by region as a bar chart");
    /// ```
    #[wasm_bindgen(js_name = "agentPrompt")]
    pub fn agent_prompt(&self, prompt: String) -> js_sys::Promise {
        let presentation = self.presentation.clone();
        let fut = ApiFuture::new(async move {
            Ok(JsValue::from(presentation.agent.run_prompt(prompt).await?))
        });

        js_sys::Promise::from(fut)
    }

    /// Clear the agent's conversation (history and chat transcript), keeping
    /// its configuration. Cancels any in-flight turn.
    #[wasm_bindgen(js_name = "agentReset")]
    pub fn agent_reset(&self) -> js_sys::Promise {
        let presentation = self.presentation.clone();
        let fut = ApiFuture::new(async move {
            presentation.agent.reset().await;
            Ok(JsValue::UNDEFINED)
        });

        js_sys::Promise::from(fut)
    }
}
