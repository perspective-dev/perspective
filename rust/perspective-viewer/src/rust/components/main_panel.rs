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
//! - [`frame_theme`] — the `rendered` frame-background mirror (each
//!   `<regular-layout-frame>`'s panel-theme background var).
//! - [`render`] — the `view` (status bar, cells, tabs, menu).

mod frame_theme;
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
    pub on_settings: Callback<()>,

    /// Reset callback forwarded from the root component.  Fired when the user
    /// clicks the reset button; `bool` is `true` for a full reset (expressions
    /// + column configs), `false` for config-only.
    pub on_reset: Callback<bool>,

    /// Fired with a panel id when its frame titlebar is pressed, to make it the
    /// active panel.
    pub on_activate_panel: Callback<String>,

    /// Fired with a panel id when its frame's close button removes it from the
    /// layout, so the root can dispose the panel.
    pub on_close_panel: Callback<String>,

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
    }
}

impl MainPanelProps {
    fn is_title(&self) -> bool {
        self.session_props.title.is_some()
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

    /// `contextmenu` listener on the layout element (panel context menu). Kept
    /// alive here and attached alongside the others. Imperative — not a Yew
    /// `oncontextmenu` — because the plugin body is light-DOM attached by the
    /// renderer (its DOM parent is the host, not the frame), so Yew's delegated
    /// handler never matches a right-click there. A native listener catches it
    /// via composed bubbling and resolves the panel from the path.
    _layout_contextmenu_listener: Closure<dyn FnMut(web_sys::Event)>,
    listener_attached: bool,

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

    /// Open panel context menu as `(client x, client y, panel id)`; `None`
    /// when closed. Rendered as a cursor-anchored
    /// [`PanelMenu`](super::panel_menu::PanelMenu) overlay.
    context_menu: Option<(f64, f64, String)>,

    /// Id of the currently maximized panel (via `regular-layout.maximize`), or
    /// `None`. Transient (regular-layout doesn't persist it); drives the
    /// Maximize/Restore menu label. Cleared when the panel leaves the layout.
    maximized: Option<String>,

    /// Theme-name-keyed cache of backgrounds read off stamped plugin
    /// elements, the mirror source for frames whose own plugin is unreadable
    /// (see [`frame_theme`]). Cleared when the theme registry changes.
    theme_backgrounds: HashMap<String, String>,

    /// The inputs `stamp_frame_themes` last mirrored from; unchanged inputs
    /// skip the pass (and its forced style recalcs) on unrelated re-renders.
    /// `None` until the first *fully-resolved* pass — an unresolved frame
    /// leaves it unlatched so the mirror retries each render.
    stamped_frame_themes: Option<frame_theme::FrameThemeSnapshot>,
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
        // (the event is cancelable); the component then pre-sizes each panel and
        // calls `resumeResize` to release it (see `MainPanelMsg::BeforeResize`).
        let before_resize_cb = ctx.link().callback(MainPanelMsg::BeforeResize);
        let before_resize_listener = Closure::wrap(Box::new(move |event: web_sys::Event| {
            event.prevent_default();
            before_resize_cb.emit(event);
        }) as Box<dyn FnMut(web_sys::Event)>);

        // Imperative `contextmenu` listener: a right-click anywhere in a panel
        // (the plugin body included) opens the panel menu. The plugin body is
        // light-DOM attached by the renderer, so a Yew `oncontextmenu` on the
        // frame never matches it (Yew walks the vdom, not the composed path).
        // This native listener resolves the panel from the
        // `<regular-layout-frame name=…>` on the event's composed path, then
        // suppresses the browser menu and emits.
        let contextmenu_cb = ctx
            .link()
            .callback(|(id, x, y)| MainPanelMsg::ContextMenu(id, x, y));
        let contextmenu_listener = Closure::wrap(Box::new(move |event: web_sys::Event| {
            let path = event.composed_path();
            let mut panel_id = None;
            for i in 0..path.length() {
                let node = path.get(i);
                if let Some(el) = node.dyn_ref::<web_sys::Element>()
                    && el.tag_name().eq_ignore_ascii_case("regular-layout-frame")
                    && let Some(name) = el.get_attribute("name")
                {
                    panel_id = Some(name);
                    break;
                }
            }

            // Only act when the click is inside a panel; outside any frame, let
            // the native menu through.
            if let Some(id) = panel_id {
                event.prevent_default();
                let mouse = event.unchecked_ref::<web_sys::MouseEvent>();
                contextmenu_cb.emit((id, mouse.client_x() as f64, mouse.client_y() as f64));
            }
        }) as Box<dyn FnMut(web_sys::Event)>);

        Self {
            main_panel_ref: NodeRef::default(),
            layout_ref: NodeRef::default(),
            inserted: Vec::new(),
            _layout_update_listener: listener,
            _layout_select_listener: select_listener,
            _layout_before_resize_listener: before_resize_listener,
            _layout_contextmenu_listener: contextmenu_listener,
            listener_attached: false,
            panel_resize_observers: HashMap::new(),
            hidden_tabs: HashSet::new(),
            context_menu: None,
            maximized: None,
            theme_backgrounds: HashMap::new(),
            stamped_frame_themes: None,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            MainPanelMsg::PointerEvent(event) => self.on_pointer_event(ctx, event),
            MainPanelMsg::LayoutUpdated => self.on_layout_updated(ctx),
            MainPanelMsg::TabSelected(name) => self.on_tab_selected(ctx, name),
            MainPanelMsg::ContextMenu(id, x, y) => self.on_context_menu(ctx, id, x, y),
            MainPanelMsg::CloseContextMenu => self.on_close_context_menu(),
            MainPanelMsg::Command(cmd) => self.on_command(ctx, cmd),
            MainPanelMsg::BeforeResize(event) => self.on_before_resize(ctx, event),
        }
    }

    fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        true
    }

    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        self.reconcile(ctx);
        self.stamp_frame_themes(ctx);
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        self.render(ctx)
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {}
}
