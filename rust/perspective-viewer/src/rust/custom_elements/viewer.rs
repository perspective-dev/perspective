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
use std::collections::HashMap;
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
use crate::session::{ResetOptions, Session, TableLoadState};
use crate::tasks::*;
use crate::utils::*;
use crate::workspace::{Panel, PanelId, Workspace};
use crate::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Promise<ViewerConfig>")]
    pub type JsViewerConfigPromise;

    #[wasm_bindgen(typescript_type = "ViewerConfigUpdate")]
    pub type JsViewerConfigUpdate;
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
    elem: HtmlElement,
    root: Root<components::viewer::PerspectiveViewer>,
    resize_handle: Rc<RefCell<Option<ResizeObserverHandle>>>,
    intersection_handle: Rc<RefCell<Option<IntersectionObserverHandle>>>,
    pub(crate) presentation: Presentation,

    /// The multi-panel model — the single source of truth for engine state.
    /// The active panel's [`Session`]/[`Renderer`] are reached via
    /// `workspace.active_*()`; the element caches none, so no method can act on
    /// a stale seed panel.
    pub(crate) workspace: Workspace,
    _subscriptions: Rc<[Subscription; 1]>,
    _custom_event_subs: Rc<Vec<Subscription>>,
}

impl CustomElementMetadata for PerspectiveViewerElement {
    const CUSTOM_ELEMENT_NAME: &'static str = "perspective-viewer";
    const STATICS: &'static [&'static str] =
        ["registerPlugin", "get_wasm_module", "get_worker_url"].as_slice();
}

/// Wire a panel's data-refresh subscription: when its [`Session`]'s table emits
/// an update, redraw its [`Renderer`]. The returned [`Subscription`] must be
/// owned for the panel's lifetime (see [`Panel`]).
///
/// Every panel needs its own — historically this was created once, for the seed
/// panel, in the element constructor, so panels added later (`addPanel`,
/// duplicate) never redrew on `Table.update()`.
fn wire_panel_render_sub(session: &Session, renderer: &Renderer) -> Subscription {
    session.table_updated.add_listener({
        clone!(renderer, session);
        move |_| {
            clone!(renderer, session);
            // Resolve the `View` LAZILY, inside the render lock at draw time,
            // rather than capturing it eagerly here. A config-change rebuild on
            // this session can replace (and delete) the bound `View` between this
            // `table_updated` firing and the debounced redraw actually running; an
            // eager capture would then draw a stale/deleted `View` (the
            // duplicate-panel "old view" glitch). `update_lazy` re-reads
            // `get_view()` under the same lock a concurrent rebuild draw acquires,
            // so it always renders the current bound `View`.
            ApiFuture::spawn(async move {
                renderer
                    .update_lazy(async move { Ok(session.get_view()) })
                    .await
                    .ignore_view_delete()
                    .map(|_| ())
            })
        }
    })
}

/// Build the full set of subscriptions a [`Panel`] owns for its lifetime: its
/// redraw subscription plus its custom-event fanout ([`wire_panel_events`]).
/// Shared by the seed (element constructor) and every [`create_panel_model`]
/// panel, so all panels wire identically and every panel — not just the seed —
/// dispatches its own `perspective-*` events (see C6).
fn wire_panel_subs(
    elem: &HtmlElement,
    presentation: &Presentation,
    session: &Session,
    renderer: &Renderer,
) -> Vec<Subscription> {
    let mut subs = vec![wire_panel_render_sub(session, renderer)];
    subs.extend(wire_panel_events(elem, session, renderer, presentation));
    subs
}

/// Create a new independent panel (own `Session` + `Renderer` + id) from a
/// `ViewerConfigUpdate`, mount and draw it, and return its generated id. Shared
/// by `addPanel` and whole-element `restore`. `settings`/`theme` are stripped
/// (element-level, not per-panel) and `client` — or the element's default
/// client when `None` — is bound so the config's `table` resolves against it.
///
/// A free function (not a method) so it stays clear of the `#[wasm_bindgen]`
/// impl's exported surface, and `pub(crate)` + `Root`-agnostic (it signals a
/// layout change through `notify` rather than a `Root` handle) so the root Yew
/// component can also drive it (e.g. the context-menu "Duplicate" command).
pub(crate) async fn create_panel(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
    notify: &Callback<()>,
    update: ViewerConfigUpdate,
    client: Option<perspective_client::Client>,
) -> ApiResult<PanelId> {
    let (id, session, renderer, update) =
        create_panel_model(elem, presentation, workspace, update, client);

    // A panel born into a workspace with active global filters must FIRST
    // paint filtered: sync-stamp its overlay (a fresh panel is always a
    // detail) before the content restore's locked bind reads it.
    stamp_global_overlay(workspace, &id, &session);
    notify.emit(());
    restore_panel_content(&session, &renderer, presentation, update).await?;
    Ok(id)
}

/// The synchronous *model* half of [`create_panel`]: build and register a new
/// panel's engine handles (own `Session` + `Renderer` + generated id) in the
/// [`Workspace`], apply-and-strip the element-level config fields
/// (`settings`/`theme`), and bind `client` (falling back to the default
/// client). Causes NO re-render and NO draw — whole-element `restore` batches
/// N of these before its single commit render, so no intermediate panel set is
/// ever visible.
pub(crate) fn create_panel_model(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
    mut update: ViewerConfigUpdate,
    client: Option<perspective_client::Client>,
) -> (PanelId, Session, Renderer, ViewerConfigUpdate) {
    let session = Session::new();
    let renderer = Renderer::new(elem);
    let id = workspace.generate_id();
    renderer.set_slot_name(id.as_str());

    // Seed the registry-default theme cache SYNCHRONOUSLY from the
    // presentation's mirror (filled once the theme registry first
    // resolves — element init kicks that off), so a panel with no own
    // theme can stamp its effective theme without awaiting registry
    // init inside a locked run. `None` on an ultra-cold start is fine:
    // the async seeding in `restore_and_render` / `load` still runs.
    renderer.set_default_theme(presentation.default_theme_name_cached());
    let subs = wire_panel_subs(elem, presentation, &session, &renderer);
    workspace.insert_panel(Panel::new(
        id.clone(),
        session.clone(),
        renderer.clone(),
        subs,
    ));

    update.settings = OptionalUpdate::Missing;
    if let OptionalUpdate::Update(theme) = &update.theme {
        renderer.set_theme(Some(theme.clone()));
    }

    update.theme = OptionalUpdate::Missing;
    if let Some(client) = client.or_else(|| workspace.default_client()) {
        workspace.register_client(client.clone());
        session.set_client(client);
    }

    // Eagerly select + mount the config's plugin (when named and already
    // registered), so the panel's frame is populated synchronously with its
    // creation — a slow first view query would otherwise leave an empty
    // frame until `draw_view` mounts post-query. Committing outside a locked
    // draw is safe ONLY here: a brand-new `Renderer` provably has no queued
    // draws, so the atomic-swap rule (which protects LIVE panels) is
    // vacuous. An unresolvable name (its plugin not yet registered) stays
    // lazy rather than falling back — pinning the registry default this
    // early is the `Debug` init-order race. The `theme` attribute lands via
    // `MainPanel`'s reconcile stamp in the same commit that mounts the
    // frame, before any content draws.
    if let Some((idx, _)) = renderer.resolve_plugin_update(&update.plugin) {
        let _ = renderer.commit_plugin(Some(idx));
        let _ = renderer.mount_active_plugin();
    }

    (id, session, renderer, update)
}

/// The async *content* half of [`create_panel`]: bind the config's table and
/// draw the panel's plugin. Callers must already have rendered (or scheduled
/// the render that mounts) the panel's cell — whole-element `restore` runs N
/// of these CONCURRENTLY after its single commit render.
pub(crate) async fn restore_panel_content(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    update: ViewerConfigUpdate,
) -> ApiResult<()> {
    let table = update.table.clone();
    // `Public`: every caller is a public-API panel creation (`addPanel`,
    // whole-element `restore`, duplicate) — and a fresh panel's first paint
    // routes through the `!has_drawn` promotion regardless.
    let result = restore_and_render(
        session,
        renderer,
        presentation,
        RunOrigin::Public,
        update,
        {
            clone!(session);
            async move {
                if let OptionalUpdate::Update(name) = table {
                    session.set_table(name).await?;
                    session.commit_table_defaults();
                }

                Ok(())
            }
        },
    )
    .await;

    // Surface a failed content restore (including a propagated first-draw
    // failure — see `draw_view`) as a PANEL error, so the panel renders the
    // error overlay instead of staying permanently blank. Same convention as
    // `restorePanel` / `load`.
    if let Err(e) = &result {
        session.set_error(false, e.clone()).await?;
    }

    result?;
    renderer.resize().await.unwrap_or_log();
    Ok(())
}

/// Tear down a [`Panel`] already removed from the [`Workspace`]: dispose its
/// renderer (slot-scoped plugin + light-DOM cleanup) and eject its table.
/// Shared by the root's `ClosePanel` handler and whole-element `restore`'s
/// batch replacement of the pre-existing panel set.
pub(crate) fn eject_panel(panel: Panel) -> ApiFuture<()> {
    let was_errored = panel.session.is_errored();
    let dispose_task = panel.renderer.dispose();
    let reset_task = panel.session.reset(ResetOptions {
        config: true,
        expressions: true,
        table: Some(session::TableIntermediateState::Ejected),
        ..ResetOptions::default()
    });

    ApiFuture::new(async move {
        dispose_task.await?;
        match reset_task.await.ignore_view_delete() {
            Err(_) if was_errored => Ok(()),
            Err(e) => Err(e),
            Ok(_) => Ok(()),
        }
    })
}

/// Build a [`create_panel`] `notify` callback that requests a Yew re-render (so
/// a new panel's cell mounts) through a [`Root`] app handle — the element-side
/// equivalent of `ctx.link().callback(|_| LayoutChanged)`.
fn layout_changed_callback(root: Root<components::viewer::PerspectiveViewer>) -> Callback<()> {
    Callback::from(move |_: ()| {
        if let Some(app) = root.borrow().as_ref() {
            app.send_message(PerspectiveViewerMsg::LayoutChanged);
        }
    })
}

impl PerspectiveViewerElement {
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
        // Application State.
        let presentation = Presentation::new(&elem);
        let session = Session::new();
        let renderer = Renderer::new(&elem);

        // The seed panel's subscriptions (redraw + custom-event fanout)
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
            move |_| ApiFuture::spawn(delete_all(&state.workspace, &root))
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
    pub fn load(&self, table: JsValue) -> ApiResult<ApiFuture<()>> {
        let promise = table
            .clone()
            .dyn_into::<js_sys::Promise>()
            .unwrap_or_else(|_| js_sys::Promise::resolve(&table));

        // Element-level `load` targets the active panel's engines. Selection
        // here (rather than at element construction) is what keeps the
        // registry race safe — by `load()` time real plugins have registered
        // — and the eager mount populates the panel's frame immediately,
        // before the (possibly slow) load + first view query resolves.
        let panel = self.workspace.active_panel();
        let _plugin = panel.renderer.ensure_plugin_selected()?;
        let _ = panel.renderer.mount_active_plugin();
        let reset_task = panel.session.reset(ResetOptions {
            config: true,
            expressions: true,
            stats: true,
            table: Some(session::TableIntermediateState::Reloaded),
        });

        let session = panel.session;
        let renderer = panel.renderer;
        clone!(self.workspace, self.presentation);
        Ok(ApiFuture::new_throttled(async move {
            renderer.set_throttle(None);
            // Spinner accounting (RAII): the bind run below commits
            // (`commit_table_defaults`) and draws — a config-driven run.
            let _run_token = session.begin_config_run();
            let result = {
                clone!(session, renderer);
                renderer
                    .clone()
                    .render_task(|guard| async move {
                        // Seed the renderer's default-theme cache (awaits
                        // theme-registry init), then stamp — before any
                        // plugin style read below.
                        renderer.set_default_theme(presentation.get_default_theme_name().await);
                        renderer.stamp_theme(None);

                        // Ignore this error, which is blown away by the table
                        // anyway.
                        let _ = reset_task.await;
                        let jstable = JsFuture::from(promise)
                            .await
                            .map_err(|x| apierror!(TableError(x)))?;

                        if let Ok(Some(table)) =
                            try_from_js_option::<perspective_js::Table>(jstable.clone())
                        {
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

                            // Table-bind commit: default-view materialization
                            // (empty `columns` → the table's columns), SYNC and
                            // ordered inside this locked run like any other
                            // commit (I1). A `restore()` racing this `load()`
                            // commits either before this run's snapshot below
                            // (absorbed) or after (its own queued run renders
                            // it) — both orders terminate at the restore
                            // config (I3).
                            session.commit_table_defaults();
                            let (disposition, _pin) =
                                crate::tasks::bind_snapshot(&guard, &session, &renderer).await?;
                            // `load()` is a public API entry; its table bind
                            // rebuilds in practice, so `Public` is inert
                            // insurance for behavior preservation.
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
                            let inner_client = client.get_client().clone();
                            session.set_client(inner_client.clone());
                            workspace.set_default_client(inner_client);
                            Ok(())
                        } else {
                            Err(ApiError::new("Invalid argument"))
                        }
                    })
                    .await
            };

            if let Err(e) = &result {
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

    /// Restart this `<perspective-viewer>` to its initial state, before
    /// `load()`.
    ///
    /// Use `Self::restart` if you plan to call `Self::load` on this viewer
    /// again, or alternatively `Self::delete` if this viewer is no longer
    /// needed.
    pub fn eject(&mut self) -> ApiFuture<()> {
        if matches!(
            self.workspace.active_session().has_table(),
            Some(TableLoadState::Loaded)
        ) {
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
    pub fn getView(&self, panel: Option<String>) -> ApiFuture<View> {
        self.getViewPanel(panel)
    }

    /// Get a copy of the [`ViewConfig`] for the current [`View`]. This is
    /// non-blocking as it does not need to access the plugin (unlike
    /// [`PerspectiveViewerElement::save`]), and also makes no API calls to the
    /// server (unlike [`PerspectiveViewerElement::getView`] followed by
    /// [`View::get_config`])
    #[wasm_bindgen]
    pub fn getViewConfig(&self, panel: Option<String>) -> ApiFuture<JsViewConfig> {
        self.getViewConfigPanel(panel)
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
        self.getTablePanel(wait_for_table, None)
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
        self.getClientPanel(wait_for_client, None)
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
        self.getRenderStatsPanel(None)
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

                // Join the panel's in-flight `perspective-config-update`
                // dispatch tasks: "the load/restore's config-update has fired
                // by the time `flush()` resolves" is a contract (see
                // flush.spec), and the dispatcher is async — without this
                // join it beat `flush()` only by microtask luck.
                panel.session.settle_dispatches().await?;
            }

            Ok(())
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
    pub fn restore(&self, update: JsViewerConfigUpdate) -> ApiFuture<()> {
        // Format detection is synchronous: a whole-element config carries a
        // `panels` map. A legacy single `ViewerConfig` is routed to the active
        // panel — exactly today's behavior, so existing callers are unaffected.
        // The probe only tests for the key's *presence*; a whole-element
        // config which then fails the full typed parse below REPORTS its
        // error, rather than falling through to the legacy path.
        #[derive(serde::Deserialize)]
        struct Probe {
            #[serde(default)]
            panels: Option<serde::de::IgnoredAny>,
        }

        let is_whole = update
            .clone()
            .into_serde_ext::<Probe>()
            .map(|probe| probe.panels.is_some())
            .unwrap_or(false);

        if !is_whole {
            return self.restorePanel(update, None);
        }

        let this = self.clone();
        ApiFuture::new(async move {
            this.workspace
                .active_renderer()
                .with_lock(async { Ok(()) })
                .await?;

            let WorkspaceConfigUpdate {
                active,
                layout,
                panels,
                global_filters,
                masters,
            } = update.into_serde_ext()?;

            let old_ids = this.workspace.panel_ids();

            // Phase 1 — models only, NO renders and NO draws
            let mut id_map: HashMap<String, String> = Default::default();
            let mut fallback_fresh: Option<String> = None;
            let mut active_fresh: Option<String> = None;
            let mut contents = Vec::new();
            for (saved_id, config) in panels {
                if !matches!(config.settings, OptionalUpdate::Missing) {
                    tracing::warn!(
                        "`settings` on panel \"{saved_id}\" is ignored in a whole-element config; \
                         use the top-level `active` field"
                    );
                }

                let (fresh, session, renderer, config) = create_panel_model(
                    &this.elem,
                    &this.presentation,
                    &this.workspace,
                    config,
                    None,
                );

                if active.as_deref() == Some(saved_id.as_str()) {
                    active_fresh = Some(fresh.as_str().to_owned());
                }

                fallback_fresh.get_or_insert_with(|| fresh.as_str().to_owned());
                id_map.insert(saved_id, fresh.as_str().to_owned());
                contents.push((fresh, session, renderer, config));
            }

            if contents.is_empty() {
                let (fresh, session, renderer, config) = create_panel_model(
                    &this.elem,
                    &this.presentation,
                    &this.workspace,
                    ViewerConfigUpdate::default(),
                    None,
                );

                fallback_fresh = Some(fresh.as_str().to_owned());
                contents.push((fresh, session, renderer, config));
            }

            // Phase 2 — remove + eject the pre-existing panels. The sync
            // halves run here; the deferred teardown futures are joined into
            // this restore's own promise below (I6 — a failed old-panel
            // teardown is no longer an unowned rejection).
            let mut eject_tasks = Vec::new();
            for old in old_ids {
                if let Some(panel) = this.workspace.remove_panel(&old) {
                    eject_tasks.push(eject_panel(panel));
                }
            }

            // Phase 3 — stage the remapped layout tree on the Workspace
            if let Some(layout) = layout {
                this.workspace
                    .set_pending_layout(layout.remap(&|name| id_map.get(name).cloned()));
            }

            // Phase 4 — the single visible commit
            if let Some(saved) = &active
                && active_fresh.is_none()
            {
                tracing::warn!("`active` names unknown panel \"{saved}\"");
            }

            let sidebar_open = active_fresh.is_some();
            if let Some(target) = active_fresh.or(fallback_fresh)
                && let Some(app) = this.root.borrow().as_ref()
            {
                app.send_message(PerspectiveViewerMsg::CommitWorkspaceRestore(target));
            }

            if let Some(app) = this.root.borrow().as_ref() {
                app.send_message(PerspectiveViewerMsg::ToggleSettingsInit(
                    Some(SettingsUpdate::Update(sidebar_open)),
                    None,
                ));
            }

            // Master/detail roles + the (unattributed) restored filter bucket
            // land in the model BEFORE any panel content restores, so every
            // panel's first paint sees its final role and filters.
            let masters = masters
                .into_iter()
                .filter_map(|saved| match id_map.get(&saved) {
                    Some(fresh) => Some(PanelId::from(fresh.as_str())),
                    None => {
                        tracing::warn!("`masters` names unknown panel \"{saved}\"");
                        None
                    },
                })
                .collect::<Vec<_>>();

            this.workspace.set_masters(masters);
            this.workspace.set_global_filters(global_filters);
            let results = join_all(contents.into_iter().map(|(id, session, renderer, config)| {
                let presentation = this.presentation.clone();
                let workspace = this.workspace.clone();
                async move {
                    // Sync-stamp the panel's overlay (immunity for masters,
                    // the restored bucket for details) before its locked bind
                    // reads it — the config itself stays clean.
                    stamp_global_overlay(&workspace, &id, &session);
                    restore_panel_content(&session, &renderer, &presentation, config).await?;

                    // A restored master enters its plugin's selection mode
                    // (no-op if the saved plugin_config already carries it,
                    // or the plugin has no modes).
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
        })
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
    pub fn save(&self) -> JsViewerConfigPromise {
        let this = self.clone();
        let fut = ApiFuture::new(async move {
            let ids = this.workspace.panel_ids();

            // Single panel → emit the legacy `ViewerConfig` verbatim, so existing
            // single-viewer `save`/`restore` round-trips are byte-compatible.
            if ids.len() <= 1 {
                let panel = this.workspace.active_panel();
                let config = panel
                    .renderer
                    .clone()
                    .with_lock(async {
                        get_viewer_config(&panel.session, &panel.renderer, &this.presentation).await
                    })
                    .await?;

                return config.encode();
            }

            // Multi panel → whole-element format `{version, active?, layout,
            // panels}`. Panel entries serialize the per-panel
            // `PanelViewerConfig` only — the element-level `settings` flag is
            // carried by `active` (present ⟺ sidebar open, naming the panel
            // it targets).
            let mut panels: std::collections::BTreeMap<String, PanelViewerConfig> =
                Default::default();
            for id in &ids {
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
        });

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
    pub fn download(&self, method: Option<JsString>) -> ApiFuture<()> {
        self.downloadPanel(method, None)
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
    pub fn export(&self, method: Option<JsString>) -> ApiFuture<JsValue> {
        self.exportPanel(method, None)
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
        self.copyPanel(method, None)
    }

    /// Per-panel companion to [`Self::save`]: serialize a single panel's
    /// user-configurable state (today's `ViewerConfig` shape) for the named
    /// panel, or the active panel when `name` is omitted.
    pub fn savePanel(&self, name: Option<String>) -> JsViewerConfigPromise {
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

    /// Per-panel companion to [`Self::restore`]: restore a single panel from a
    /// `ViewerConfig`, targeting the named panel, or the active panel when
    /// `name` is omitted. When the target is not the active panel, the shared
    /// (active-targeting) settings UI is left untouched.
    pub fn restorePanel(
        &self,
        update: JsViewerConfigUpdate,
        name: Option<String>,
    ) -> ApiFuture<()> {
        let this = self.clone();
        ApiFuture::new_throttled(async move {
            let panel = this.resolve_panel(name)?;
            let is_active = panel.id == this.workspace.active_id();
            let session = panel.session;
            let renderer = panel.renderer;

            let mut decoded_update = ViewerConfigUpdate::decode(&update)?;
            tracing::info!("Restoring {} ({})", decoded_update, panel.id);
            let settings = decoded_update.settings.clone();

            // Per-panel theme: record it on THIS panel's renderer so it persists
            // per panel (and `savePanel` reads it back — C1). For a NON-active
            // panel, strip it from the shared restore so `restore_and_render`
            // can't flip the host (active) theme; the active panel keeps it so
            // the host mirrors it (chrome), matching `update_theme`.
            match &decoded_update.theme {
                OptionalUpdate::Update(theme) => {
                    renderer.set_theme(Some(theme.clone()));
                    // Stamp-with-commit: flip the panel plugin's `theme`
                    // attribute in the SAME synchronous section as the
                    // own-theme record — the own theme needs no registry,
                    // so neither theme-registry init nor the locked run's
                    // slow view bind can hold the panel on the former
                    // theme. The locked dispatch re-asserts this stamp
                    // idempotently ("stamp before draw" is unchanged;
                    // this is strictly earlier).
                    renderer.stamp_theme(None);
                },
                OptionalUpdate::SetDefault => {
                    renderer.set_theme(None);
                    // Default resolution needs the registry — stamp sync
                    // only from a warm cache. A cold cache would stamp
                    // attribute-REMOVAL (a base-styling flash); leave
                    // that case to the locked dispatch, as before.
                    if renderer.default_theme().is_some() {
                        renderer.stamp_theme(None);
                    }
                },
                OptionalUpdate::Missing => {},
            }

            if !is_active {
                decoded_update.theme = OptionalUpdate::Missing;
            }

            let (sender, receiver) = channel::<()>();
            if is_active {
                this.root.borrow().as_ref().into_apierror()?.send_message(
                    PerspectiveViewerMsg::ToggleSettingsComplete(settings, sender),
                );
            } else {
                // A non-active panel's config must not toggle the shared
                // settings panel; just unblock the render below.
                let _ = sender.send(());
            }

            // TODO(texodus): qualify table names across clients.
            let table_changed = match &decoded_update.table {
                OptionalUpdate::Update(name) => session
                    .get_table()
                    .map(|t| t.get_name() != name.as_str())
                    .unwrap_or(true),
                _ => false,
            };

            // An ERRORED panel must still reset on any table-carrying
            // restore even when the table is unchanged (the pre-gate
            // behavior): both `commit_view_config` and the locked run
            // refuse an errored session, so without this reset a
            // same-table restore could never clear the error.
            let errored_recovery =
                session.is_errored() && matches!(&decoded_update.table, OptionalUpdate::Update(_));

            let task = if table_changed || errored_recovery {
                Some(session.reset(ResetOptions {
                    config: true,
                    expressions: true,
                    stats: true,
                    ..ResetOptions::default()
                }))
            } else {
                None
            };

            let result = restore_and_render(
                &session,
                &renderer,
                &this.presentation,
                // The public element API: an explicit external request, so
                // a no-op restore keeps its repaint affordance (`update`
                // source 6). NOTE this includes the datagrid's
                // `toggle_edit_mode` echo path (toolbar clicks), which
                // arrives here carrying a genuinely-changed `plugin_config`.
                RunOrigin::Public,
                decoded_update.clone(),
                {
                    clone!(session, decoded_update.table);
                    async move {
                        if let OptionalUpdate::Update(name) = table {
                            if let Some(task) = task {
                                task.await?;
                            }

                            session.set_table(name).await?;
                            // Table-bind commit (I1): default-view
                            // materialization, sync, inside this locked run.
                            session.commit_table_defaults();
                        };

                        receiver.await.unwrap_or_log();
                        Ok(())
                    }
                },
            )
            .await;

            if let Err(e) = &result {
                session.set_error(false, e.clone()).await?;
            }

            // Theme restyle tail: a plugin re-reads its `--psp-*` CSS only
            // at `restyle()`/first-draw (charts cache theme vars), so a
            // theme change on an ALREADY-CAPTURED panel needs one explicit
            // restyle. STATE-KEYED (`needs_restyle`: the effective theme
            // vs. the one stamped at the plugin's last capture) — NOT
            // diffed on the own-theme record this call mutated, whose
            // baseline is wrong exactly when this same restore performed
            // the first paint post-stamp: the capture is already fresh and
            // the record-diff tail re-rendered the whole chart for nothing
            // (the raycasting boot double render —
            // `PLUGIN_DRAW_INVARIANT_PLAN.md`, captured-theme revision).
            result?;
            if renderer.needs_restyle() {
                renderer.restyle_all().await?;
            }

            Ok(())
        })
    }

    /// Per-panel companion to [`Self::getView`].
    pub fn getViewPanel(&self, name: Option<String>) -> ApiFuture<View> {
        let this = self.clone();
        ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            Ok(panel.session.get_view().ok_or("No table set")?.into())
        })
    }

    /// Per-panel companion to [`Self::getViewConfig`]. Render-callable
    /// (invariant I5): while a run is in flight on this panel, answers from
    /// its pinned [`RenderContext`] — the config of the `view` the plugin is
    /// drawing, never the in-flight commit's.
    pub fn getViewConfigPanel(&self, name: Option<String>) -> ApiFuture<JsViewConfig> {
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

    /// Per-panel companion to [`Self::getTable`].
    pub fn getTablePanel(
        &self,
        wait_for_table: Option<bool>,
        name: Option<String>,
    ) -> ApiFuture<Table> {
        let this = self.clone();
        ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            // Render-callable (I5): answer from the pinned RenderContext when
            // a run is in flight — EXCEPT `wait_for_table: true`, which
            // explicitly requests a FUTURE table (reload flows) and must not
            // be satisfied by the outgoing one.
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

    /// Per-panel companion to [`Self::getClient`] — the named/active panel's
    /// own client (vs the element-level default client).
    pub fn getClientPanel(
        &self,
        wait_for_client: Option<bool>,
        name: Option<String>,
    ) -> ApiFuture<perspective_js::Client> {
        let this = self.clone();
        ApiFuture::new(async move {
            let panel = this.resolve_panel(name)?;
            // Render-callable (I5): see `getTablePanel`.
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

    /// Per-panel companion to [`Self::getRenderStats`].
    pub fn getRenderStatsPanel(&self, name: Option<String>) -> ApiResult<JsValue> {
        let panel = self.resolve_panel(name)?;
        Ok(JsValue::from_serde_ext(
            &panel.renderer.render_timer().get_stats(),
        )?)
    }

    /// Per-panel companion to [`Self::getEditPort`] — the named/active panel's
    /// own edit port. Plugins must use this (with their `slot` as `name`) so
    /// cell edits target their own panel's [`Table`], not the active panel's.
    #[wasm_bindgen]
    pub fn getEditPortPanel(&self, name: Option<String>) -> ApiResult<f64> {
        let panel = self.resolve_panel(name)?;
        // Render-callable (I5): answer from the pinned RenderContext when a
        // run is in flight.
        let edit_port = if let Some(ctx) = panel.renderer.render_context() {
            ctx.edit_port
        } else {
            panel.session.metadata().get_edit_port()
        };

        Ok(edit_port.ok_or("No `Table` loaded")?)
    }

    /// Per-panel companion to [`Self::getSelection`].
    #[wasm_bindgen]
    pub fn getSelectionPanel(&self, name: Option<String>) -> ApiResult<Option<JsViewWindow>> {
        let panel = self.resolve_panel(name)?;
        Ok(panel.renderer.get_selection().map(|x| x.into()))
    }

    /// Per-panel companion to [`Self::setSelection`]. Selection is
    /// per-`Renderer` state, so recording it on the source panel (rather than
    /// whichever panel is active) is what attributes master/detail and
    /// toolbar selection actions to the panel the user actually selected in.
    #[wasm_bindgen]
    pub fn setSelectionPanel(
        &self,
        window: Option<JsViewWindow>,
        name: Option<String>,
    ) -> ApiResult<()> {
        let window = window.map(|x| x.into_serde_ext()).transpose()?;
        self.resolve_panel(name)?.renderer.set_selection(window);
        Ok(())
    }

    /// Per-panel companion to [`Self::download`]: download the named panel's
    /// [`View`] data, or the active panel's when `name` is omitted.
    pub fn downloadPanel(&self, method: Option<JsString>, name: Option<String>) -> ApiFuture<()> {
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

    /// Per-panel companion to [`Self::export`]: export the named panel's
    /// [`View`] data, or the active panel's when `name` is omitted.
    pub fn exportPanel(
        &self,
        method: Option<JsString>,
        name: Option<String>,
    ) -> ApiFuture<JsValue> {
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

    /// Per-panel companion to [`Self::copy`]: copy the named panel's [`View`]
    /// data to the system clipboard, or the active panel's when `name` is
    /// omitted.
    pub fn copyPanel(&self, method: Option<JsString>, name: Option<String>) -> ApiFuture<()> {
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

    /// Reset the viewer's `ViewerConfig` to the default. This is
    /// element-level: EVERY panel is reset and the cross-filter overlay is
    /// cleared (symmetric with whole-element [`Self::save`] /
    /// [`Self::restore`]); use [`Self::resetPanel`] to reset a single panel.
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
            let (completion, receiver) = Completion::new();
            root.borrow()
                .as_ref()
                .ok_or("Already deleted")?
                .send_message(PerspectiveViewerMsg::Reset(all, Some(completion)));

            receiver.await.map_err(|_| ApiError::new("Cancelled"))?
        })
    }

    /// Per-panel companion to [`Self::reset`]: reset a single panel's
    /// `ViewerConfig` to the default — the named panel, or the active panel
    /// when `name` is omitted. Other panels (and the element-level
    /// cross-filter overlay) are unaffected.
    ///
    /// # Arguments
    ///
    /// - `reset_all` - If set, will clear the panel's expressions and column
    ///   settings as well.
    /// - `name` - The panel to reset, or `None` for the active panel.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await viewer.resetPanel();
    /// ```
    pub fn resetPanel(&self, reset_all: Option<bool>, name: Option<String>) -> ApiFuture<()> {
        let this = self.clone();
        let all = reset_all.unwrap_or_default();
        ApiFuture::new_throttled(async move {
            let panel = this.resolve_panel(name)?;
            tracing::debug!("Resetting config ({})", panel.id);
            let (completion, receiver) = Completion::new();
            this.root
                .borrow()
                .as_ref()
                .ok_or("Already deleted")?
                .send_message(PerspectiveViewerMsg::ResetPanel(
                    Some(panel.id.to_string()),
                    all,
                    Some(completion),
                ));

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
                // Explicit size hint is inherently single-plugin → active panel.
                panel
                    .renderer
                    .resize_with_dimensions(dims.width, dims.height)
                    .await?;
            } else {
                // Element-level: resize every visible panel (each owns its
                // `Renderer`); hidden stacked-tab cells resize when revealed.
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
                            // A resume, not a config request: a paused-era
                            // commit renders; a clean resume dispatches
                            // nothing.
                            RunOrigin::Internal,
                            ViewerConfigUpdate::default(),
                            async { Ok(()) },
                        )
                        .await;

                        // A failing resume (e.g. a propagated first-draw
                        // failure) marks THIS panel errored but must not
                        // strand the remaining panels paused.
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
    /// region.
    #[wasm_bindgen]
    pub fn getSelection(&self) -> Option<JsViewWindow> {
        self.workspace
            .active_renderer()
            .get_selection()
            .map(|x| x.into())
    }

    /// Set the selection [`perspective_js::JsViewWindow`] for this element.
    #[wasm_bindgen]
    pub fn setSelection(&self, window: Option<JsViewWindow>) -> ApiResult<()> {
        let window = window.map(|x| x.into_serde_ext()).transpose()?;
        self.workspace.active_renderer().set_selection(window);
        Ok(())
    }

    /// Get this viewer's edit port for the active [`Table`] (see
    /// [`Table::update`] for details on ports).
    #[wasm_bindgen]
    pub fn getEditPort(&self) -> Result<f64, JsValue> {
        self.workspace
            .active_session()
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
                // Re-seed + restyle unconditionally — this API's contract is
                // "re-read the CSS vars". `restyle_all` resolves the bound
                // `View` itself, inside the draw lock (no-op if none).
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

            // Restyle exactly the panels whose captured CSS is stale
            // (`Renderer::needs_restyle` — the plugin's captured theme vs.
            // the new effective value; a default change only affects panels
            // without their own theme, and `restyle_all` is expensive: full
            // restyle + redraw). See `update_theme` for the per-panel theme
            // isolation model. This loop stays HERE (not only in the root's
            // default-theme fan-out) because `set_theme_name` above emits no
            // `theme_config_updated` when the host attribute is unchanged —
            // a default change under an unchanged selection would otherwise
            // never restyle. Every renderer's default cache is re-seeded
            // FIRST so `needs_restyle`'s effective side (and any subsequent
            // draw's stamp) reads the new default.
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
        // Element-wide: throttle is per-`Renderer`, so set it on every panel.
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
            // No name → the ACTIVE panel's selected plugin. A named lookup is
            // registry-global, so the active renderer works there too.
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
        clone!(self.elem, self.presentation, self.workspace, self.root);
        ApiFuture::new(async move {
            let notify = layout_changed_callback(root);
            let update = ViewerConfigUpdate::decode(&update)?;
            let id = create_panel(&elem, &presentation, &workspace, &notify, update, None).await?;
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
    pub fn toggleColumnSettings(&self, column_name: String) -> ApiFuture<()> {
        clone!(self.workspace, self.root);
        ApiFuture::new_throttled(async move {
            let session = workspace.active_session();
            let locator = get_column_locator(&session.metadata(), Some(column_name));
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

    /// Per-panel companion to [`Self::toggleColumnSettings`]. The column
    /// settings sidebar is bound to the *active* panel, so opening a
    /// non-active panel's column first activates that panel (exactly like
    /// clicking its tab), then opens the column — resolved against *that*
    /// panel's schema. Toggle semantics (close when already open) apply only
    /// when the panel was already active; activating a different panel always
    /// opens, even if a same-named column of the previously-active panel was
    /// showing.
    #[wasm_bindgen]
    pub fn toggleColumnSettingsPanel(
        &self,
        column_name: String,
        name: Option<String>,
    ) -> ApiFuture<()> {
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
