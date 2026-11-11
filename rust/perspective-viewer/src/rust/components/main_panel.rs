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

//! `MainPanel`: the multi-panel layout host. Owns the `<regular-layout>`
//! element, the per-panel `<PanelTab>`s, the shared status bar, and the panel
//! context menu. The `Component` impl below is thin — its handlers live in the
//! submodules:
//!
//! - [`update`] — the small `MainPanelMsg` handlers (pointer, close detection,
//!   tab/active sync, context menu).
//! - [`presize`] — the `BeforeResize` pre-size-every-plugin algorithm.
//! - [`reconcile`] — the `rendered` layout reconcile + per-panel theme stamp.
//! - [`render`] — the `view` (status bar, cells, tabs, menu).

mod presize;
mod reconcile;
mod render;
mod update;

pub mod msg;

use std::collections::{HashMap, HashSet};

use perspective_js::utils::JsValueSerdeExt;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

pub use self::msg::MainPanelMsg;
use super::panel_menu::PanelCommand;
use crate::presentation::{Presentation, PresentationProps};
use crate::renderer::*;
use crate::session::{Session, SessionProps};
use crate::tasks::PanelResizeObserverHandle;
use crate::workspace::{PanelId, Workspace};

#[derive(Clone, Properties)]
pub struct MainPanelProps {
    /// Toggle the settings sidebar open. Fired by a `PanelTab`'s open-settings
    /// button (after selecting + activating that panel) — the tabs are the
    /// only open-settings affordance.
    pub on_settings: Callback<()>,

    /// Reset callback forwarded from the root component.  Fired when the user
    /// clicks the reset button; `bool` is `true` for a full reset (expressions
    /// + column configs), `false` for config-only.
    pub on_reset: Callback<bool>,

    /// Fired with a panel id when its frame titlebar is pressed, to make it the
    /// active panel.
    pub on_activate_panel: Callback<String>,

    /// Fired with a panel id from a tab × (an app-initiated close): the root
    /// removes it from the model at once and parks its engines.
    pub on_close_panel: Callback<String>,

    /// Fired with a panel id once the `regular-layout` tree no longer holds
    /// it, so the root can eject the parked panel.
    pub on_panel_closed: Callback<String>,

    /// Fired with `(panel id, command)` when the panel context menu selects a
    /// command the root executes (New/Duplicate/Reset/ToggleMaster/Close).
    /// Maximize/Restore are handled HERE (this component owns the layout
    /// element), and Export/Copy end-to-end by
    /// [`PanelMenu`](super::panel_menu::PanelMenu) itself.
    pub on_panel_command: Callback<(String, PanelCommand)>,

    /// Snapshots threaded from root.  Read for `has_table`, `title` here in
    /// the panel itself; threaded wholesale to `StatusBar`/`StatusIndicator`.
    pub session_props: SessionProps,
    pub renderer_props: RendererProps,
    pub presentation_props: PresentationProps,

    /// Derived from root: `settings_open && has_table_loaded`.
    pub is_settings_open: bool,

    /// Root-managed in-flight render counter (not engine state).
    pub update_count: u32,

    /// Ids of every layout panel, in order; one `<regular-layout>` cell is
    /// rendered per id. Drives re-render when panels are added/removed.
    pub panel_ids: Vec<PanelId>,

    /// `(panel id, session title)` for every panel. Rendered into the
    /// `<regular-layout>` `style` as `--regular-layout-<id>--title` custom
    /// properties, which regular-layout's tabs display via `::before` content.
    pub panel_titles: Vec<(String, Option<String>)>,

    /// `(panel id, per-panel theme)` for every panel. A snapshot so a
    /// per-panel theme change re-renders MainPanel — `renderer.theme()` is
    /// interior-mutable and not otherwise observed by `eq`. Each frame inlines
    /// its theme's `--psp-*` block only when it diverges from the host theme.
    pub panel_themes: Vec<(String, Option<String>)>,

    /// The master (filter-source) panel ids, sorted. A snapshot so a master
    /// toggle re-renders MainPanel — the role set is interior-mutable on
    /// `Workspace` and not otherwise observed by `eq`. Drives each tab's
    /// broadcast badge.
    pub panel_masters: Vec<PanelId>,

    /// Element-level global filters (fed by master/detail selection), threaded
    /// to the `StatusBar` where the global-filter chips are rendered.
    pub global_filters: Vec<perspective_client::config::Filter>,

    /// Remove the global filter at this index (a chip's × in the `StatusBar`).
    pub on_remove_global_filter: Callback<usize>,

    /// Clear all global filters (the "Clear" affordance in the `StatusBar`).
    pub on_clear_global_filters: Callback<()>,

    /// The multi-panel model, for per-panel `Renderer`/`Session` access when
    /// reconciling `insertPanel`/`removePanel`.
    pub workspace: Workspace,

    /// State (the *active* panel's handles — for the shared status bar).
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for MainPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.session_props == rhs.session_props
            && self.renderer_props == rhs.renderer_props
            && self.presentation_props == rhs.presentation_props
            && self.is_settings_open == rhs.is_settings_open
            && self.update_count == rhs.update_count
            && self.panel_ids == rhs.panel_ids
            && self.panel_titles == rhs.panel_titles
            && self.panel_themes == rhs.panel_themes
            && self.panel_masters == rhs.panel_masters
            && self.global_filters == rhs.global_filters
            && self.workspace == rhs.workspace
            && self.session == rhs.session
            && self.renderer == rhs.renderer
            && self.presentation == rhs.presentation
    }
}

impl MainPanelProps {
    fn is_title(&self) -> bool {
        self.session_props.title.is_some()
    }

    pub(super) fn effective_panel_theme(&self, id: &str) -> Option<String> {
        self.panel_themes
            .iter()
            .find(|(pid, _)| pid == id)
            .and_then(|(_, theme)| theme.clone())
            .or_else(|| self.presentation_props.available_themes.first().cloned())
    }
}

pub struct MainPanel {
    main_panel_ref: NodeRef,

    /// Ref to the `<regular-layout>` element hosting the panel cells.
    layout_ref: NodeRef,

    /// Panel slots currently placed in `layout_ref`'s grid, reconciled against
    /// `panel_ids` on each render so we `insertPanel`/`removePanel` exactly
    /// once per add/remove.
    inserted: Vec<String>,

    /// `regular-layout-update` listener (close detection); kept alive here and
    /// attached to the layout element once in `rendered`.
    _layout_update_listener: Closure<dyn FnMut(web_sys::Event)>,

    /// `regular-layout-select` listener (active-panel sync); kept alive here
    /// and attached alongside the update listener.
    _layout_select_listener: Closure<dyn FnMut(web_sys::Event)>,

    /// `regular-layout-before-resize` listener (presize hook); kept alive here
    /// and attached alongside the others.
    _layout_before_resize_listener: Closure<dyn FnMut(web_sys::Event)>,

    /// `contextmenu` listener on the viewer HOST element — one stable attach
    /// point covering every surface (panels, status bar, sidebars),
    /// independent of the layout reconcile; attached once in `rendered` and
    /// REMOVED in `destroy`, since the host outlives this component's Yew
    /// app. Imperative — not a Yew `oncontextmenu` — because the plugin body
    /// is light-DOM attached by the renderer (its DOM parent is the host,
    /// not the frame), so Yew's delegated handler never matches a
    /// right-click there; a native listener sees every surface — shadow
    /// chrome and slotted light DOM alike — on the composed path.
    _contextmenu_listener: Closure<dyn FnMut(web_sys::Event)>,

    /// The `<regular-layout>` ELEMENT the layout listeners are attached to.
    /// Compared by identity in `reconcile` — if the element is ever a
    /// different instance (it should never be: the render keys it into a
    /// fully-keyed sibling list precisely so Yew reuses it), the listeners
    /// are re-attached and `inserted` is reset so the fresh (empty) layout
    /// is repopulated instead of silently orphaning every panel. A latched
    /// `bool` here once turned an unkeyed-diff element replacement into
    /// "Duplicate commits into an EMPTY tree with no `before-resize`
    /// listener": the old element left the DOM with the committed tree and
    /// every listener, and nothing ever noticed.
    listener_target: Option<web_sys::HtmlElement>,

    /// Ids gone from the model whose `removePanel` has been issued to the
    /// layout and not yet committed.
    pending_removals: HashSet<String>,

    /// Ids observed in a committed layout tree, the only model-held panels a
    /// later commit can report closed.
    on_screen: HashSet<String>,

    /// Per-panel `ResizeObserver`s, keyed by panel id, each observing that
    /// panel's slotted plugin element and resizing only that panel's
    /// `Renderer`. Bound in `BeforeResize` for the DRAGGED panel only (it is
    /// excluded from the presize paths, and the `overlay` presize is disabled);
    /// dropped on `LayoutUpdated` (the drop).
    panel_resize_observers: HashMap<String, PanelResizeObserverHandle>,

    /// Panels currently *hidden* behind an unselected index of a tab stack,
    /// recomputed from the layout tree on every `regular-layout-update`.
    /// Drives each tab's `visible` prop (`PanelTab` marks the front tab of
    /// every stack, not just the active panel). Empty until the first layout
    /// update — every panel starts visible.
    hidden_tabs: HashSet<String>,

    /// Open context menu as `(client x, client y, target panel id)`; outer
    /// `None` when closed. A `None` *panel id* is the target-less menu (no
    /// active panel to resolve to — "New" only). Rendered as a
    /// cursor-anchored [`PanelMenu`](super::panel_menu::PanelMenu) overlay.
    context_menu: Option<(f64, f64, Option<String>)>,

    /// Id of the currently maximized panel (via `regular-layout.maximize`), or
    /// `None`. Transient (regular-layout doesn't persist it); drives the
    /// Maximize/Restore menu label. Cleared when the panel leaves the layout.
    maximized: Option<String>,

    /// `Workspace::staged_changed` → [`MainPanelMsg::StagedChanged`] on THIS
    /// component's scope (see the message doc for why not the root's).
    _staged_sub: crate::utils::Subscription,

    /// `Workspace::layout_staged` → [`MainPanelMsg::LayoutStaged`].
    _layout_staged_sub: crate::utils::Subscription,
}

impl Component for MainPanel {
    type Message = MainPanelMsg;
    type Properties = MainPanelProps;

    fn create(ctx: &Context<Self>) -> Self {
        let cb = ctx.link().callback(|_: ()| MainPanelMsg::LayoutUpdated);
        let listener = Closure::wrap(
            Box::new(move |_: web_sys::Event| cb.emit(())) as Box<dyn FnMut(web_sys::Event)>
        );

        let select_cb = ctx.link().callback(MainPanelMsg::TabSelected);
        let select_listener = Closure::wrap(Box::new(move |event: web_sys::Event| {
            #[derive(serde::Deserialize)]
            struct SelectDetail {
                name: String,
            }

            if let Some(custom) = event.dyn_ref::<web_sys::CustomEvent>()
                && let Ok(SelectDetail { name }) = custom.detail().into_serde_ext()
            {
                select_cb.emit(name);
            }
        }) as Box<dyn FnMut(web_sys::Event)>);

        // `preventDefault()` synchronously suspends the layout's resize commit
        // (the event is cancelable); the component then pre-sizes each panel
        // and calls `resumeResize` to release it (see
        // `MainPanelMsg::BeforeResize`).
        let before_resize_cb = ctx.link().callback(MainPanelMsg::BeforeResize);
        let before_resize_listener = Closure::wrap(Box::new(move |event: web_sys::Event| {
            event.prevent_default();
            before_resize_cb.emit(event);
        }) as Box<dyn FnMut(web_sys::Event)>);

        // Imperative `contextmenu` listener: a right-click anywhere in the
        // element opens the panel menu — targeting the frame on the event's
        // composed path, or `None` (resolved to the ACTIVE panel, else the
        // stage menu, in `on_context_menu`, where props live) from any
        // other surface. Two pass-throughs keep the NATIVE menu: editable
        // targets (inputs, textareas, contenteditable — cut/copy/paste),
        // and anything inside an open `PortalModal` (every modal host is a
        // light-DOM viewer child in the modal slot — this menu included, so
        // without the carve-out a right-click in any open dropdown would
        // re-open the menu underneath it).
        let contextmenu_cb = ctx
            .link()
            .callback(|(id, x, y)| MainPanelMsg::ContextMenu(id, x, y));
        let viewer_elem = ctx.props().presentation.viewer_elem().clone();
        let contextmenu_listener = Closure::wrap(Box::new(move |event: web_sys::Event| {
            // Shift+right-click passes through to the native browser menu.
            if event.unchecked_ref::<web_sys::MouseEvent>().shift_key() {
                return;
            }

            let path = event.composed_path();
            let is_editable = path.get(0).dyn_ref::<web_sys::HtmlElement>().is_some_and(
                |el: &web_sys::HtmlElement| {
                    el.tag_name().eq_ignore_ascii_case("input")
                        || el.tag_name().eq_ignore_ascii_case("textarea")
                        || el.is_content_editable()
                },
            );

            if is_editable {
                return;
            }

            let mut panel_id = None;
            for i in 0..path.length() {
                let node = path.get(i);
                let Some(el) = node.dyn_ref::<web_sys::Element>() else {
                    continue;
                };

                if el == viewer_elem.unchecked_ref::<web_sys::Element>() {
                    break;
                }

                if el.slot() == crate::ui::MODAL_SLOT {
                    return;
                }

                if el.tag_name().eq_ignore_ascii_case("regular-layout-frame")
                    && let Some(name) = el.get_attribute("name")
                {
                    panel_id = Some(name);
                    break;
                }
            }

            event.prevent_default();
            let mouse = event.unchecked_ref::<web_sys::MouseEvent>();
            contextmenu_cb.emit((panel_id, mouse.client_x() as f64, mouse.client_y() as f64));
        }) as Box<dyn FnMut(web_sys::Event)>);

        let staged_sub = {
            use crate::utils::AddListener;
            let cb = ctx.link().callback(|_: ()| MainPanelMsg::StagedChanged);
            ctx.props()
                .workspace
                .staged_changed()
                .add_listener(move |()| cb.emit(()))
        };

        let layout_staged_sub = {
            use crate::utils::AddListener;
            let cb = ctx.link().callback(|_: ()| MainPanelMsg::LayoutStaged);
            ctx.props()
                .workspace
                .layout_staged()
                .add_listener(move |()| cb.emit(()))
        };

        Self {
            main_panel_ref: NodeRef::default(),
            layout_ref: NodeRef::default(),
            inserted: Vec::new(),
            pending_removals: HashSet::new(),
            on_screen: HashSet::new(),
            _layout_update_listener: listener,
            _layout_select_listener: select_listener,
            _layout_before_resize_listener: before_resize_listener,
            _contextmenu_listener: contextmenu_listener,
            listener_target: None,
            panel_resize_observers: HashMap::new(),
            hidden_tabs: HashSet::new(),
            context_menu: None,
            maximized: None,
            _staged_sub: staged_sub,
            _layout_staged_sub: layout_staged_sub,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            MainPanelMsg::PointerEvent(event) => self.on_pointer_event(ctx, event),
            MainPanelMsg::StagedChanged => true,
            MainPanelMsg::LayoutStaged => true,
            MainPanelMsg::LayoutUpdated => self.on_layout_updated(ctx),
            MainPanelMsg::TabSelected(name) => self.on_tab_selected(ctx, name),
            MainPanelMsg::ContextMenu(id, x, y) => self.on_context_menu(ctx, id, x, y),
            MainPanelMsg::CloseContextMenu => self.on_close_context_menu(),
            MainPanelMsg::Command(cmd) => self.on_command(ctx, cmd),
            MainPanelMsg::BeforeResize(event) => self.on_before_resize(ctx, event),
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old: &Self::Properties) -> bool {
        self.close_unstaged_panels(ctx, old);
        ctx.props() != old
    }

    fn rendered(&mut self, ctx: &Context<Self>, first_render: bool) {
        // The `contextmenu` listener attaches to the viewer HOST element —
        // one stable attach point covering every surface (panels, status
        // bar, sidebars), decoupled from the layout reconcile. Panel
        // right-clicks reach it through their frames on the composed path;
        // everything else resolves to the active panel (or the stage menu).
        if first_render {
            let _ = ctx
                .props()
                .presentation
                .viewer_elem()
                .add_event_listener_with_callback(
                    "contextmenu",
                    self._contextmenu_listener.as_ref().unchecked_ref(),
                );
        }

        self.size_staging_wrappers(ctx);
        self.reconcile(ctx);
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        self.render(ctx)
    }

    fn destroy(&mut self, ctx: &Context<Self>) {
        // The host element outlives this component (`delete()` tears down
        // the Yew app, not the custom element), so the listener must not
        // dangle into a dropped `Closure`.
        let _ = ctx
            .props()
            .presentation
            .viewer_elem()
            .remove_event_listener_with_callback(
                "contextmenu",
                self._contextmenu_listener.as_ref().unchecked_ref(),
            );
    }
}

impl MainPanel {
    /// Report closed every panel gone from the model that the layout never
    /// held, since it has no commit to wait for.
    fn close_unstaged_panels(&self, ctx: &Context<Self>, old: &MainPanelProps) {
        for id in &old.panel_ids {
            if !ctx.props().panel_ids.contains(id)
                && !self.inserted.iter().any(|n| n == id.as_str())
            {
                ctx.props().on_panel_closed.emit(id.as_str().to_owned());
            }
        }
    }
}
