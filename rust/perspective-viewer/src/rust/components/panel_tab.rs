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

mod element;

use std::cell::Cell;
use std::rc::Rc;

use perspective_js::utils::global;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::prelude::*;

use self::element::{TAB_TAG, adopt_sheet, ensure_custom_element};
use crate::components::rows_counter::RowsCounter;
use crate::queries::WorkspaceStatus;
use crate::session::{Session, ViewStats};
use crate::utils::Subscription;

/// A panel's titlebar tab. The host is a `<perspective-viewer-tab>` custom
/// element mounted in the viewer's **light DOM** and forwarded into its
/// `<regular-layout-frame>` titlebar via a `<slot name="tab-{id}" slot="tab">`
/// (rendered by `MainPanel`); the tab's *contents* live in the host's
/// **ShadowRoot**, whose `adoptedStyleSheets` carry the structure CSS.
#[derive(Properties, PartialEq)]
pub struct PanelTabProps {
    /// The `<perspective-viewer>` host element; the tab is attached here as a
    /// light-DOM child (mirrors `renderer::activate`'s plugin mount).
    pub viewer: HtmlElement,

    /// The panel id. The tab is assigned to `slot="tab-{panel_id}"`.
    pub panel_id: String,

    /// The panel's title; falls back to the id when `None`.
    pub title: Option<String>,

    /// This panel's own `Session`, whose `stats_changed` the tab subscribes
    /// to directly so a stats tick re-renders only this tab.
    pub session: Session,

    /// This panel's effective theme. Reflected onto the host's `theme`
    /// attribute so the document theme rules (`perspective-viewer [theme="X"]`)
    /// theme the tab per-panel via the native cascade.
    pub theme: Option<String>,

    /// `true` when this is the active panel (toolbar target / selected tab);
    /// drives the active-tab styling.
    pub active: bool,

    /// `true` when this panel is *visible* — the front (selected) tab of its
    /// stack, or a lone panel. Hidden panels are those at an unselected index
    /// of a tab stack. Independent of `active`: every stack has a visible
    /// panel, but only one panel in the whole layout is active.
    pub visible: bool,

    /// The workspace status this tab shows in place of its drag indicator.
    #[prop_or_default]
    pub status: Option<WorkspaceStatus>,

    /// `true` when this panel is errored; its caret shows an error mark unless
    /// the active indicator takes precedence.
    #[prop_or_default]
    pub errored: bool,

    /// Open the workspace panel, fired from the tab's status icon.
    #[prop_or_default]
    pub on_open_workspace: Callback<()>,

    /// `true` when this panel is a master (filter-source) panel — shows the
    /// broadcast badge to the left of the close button.
    pub is_master: bool,

    /// `true` when this is the host viewer's ONLY panel (one plugin child).
    /// Reflected on the host as a `single`/`multi` class — the same
    /// panel-count CSS hook `Renderer::stamp_active` stamps on the plugin —
    /// e.g. the caret is hidden on a lone tab (see panel-tab.css).
    pub single: bool,

    /// `false` while this panel's close is in flight — hides the close button.
    pub closable: bool,

    /// `true` when the settings sidebar is open. When closed, the tab renders
    /// an open-settings button *in place of* the close button — the only
    /// affordance for opening the settings panel (there is deliberately none
    /// at zero panels).
    pub is_settings_open: bool,

    /// `true` while this panel's close awaits its layout commit, which keeps
    /// the tab rendered but inert.
    #[prop_or_default]
    pub closing: bool,

    /// `false` for a lone panel — suppresses the tab rearrange-drag.
    /// `<regular-layout-frame>` arms a drag from any `part="tab"` pointerdown,
    /// but a lone panel has nowhere to drop, so the host `pointerdown` handler
    /// stops the event before it reaches the frame (see `create`).
    pub draggable: bool,

    /// Select this panel in the layout (brings its frame forward within a stack
    /// and activates it). Wired by `MainPanel` to `RegularLayout::select`.
    pub on_select: Callback<String>,

    /// Remove this panel from the layout. Wired by `MainPanel` to the root
    /// `ClosePanel` message (which mutates the `Workspace` model first, then
    /// syncs the slave `regular-layout` — NOT `RegularLayout::remove_panel`
    /// directly; see the app-initiated-layout-change invariant).
    pub on_close: Callback<String>,

    /// Open the settings sidebar targeting this panel. Wired by `MainPanel` to
    /// select this panel in the layout, activate it (so the sidebar binds its
    /// engines), then toggle the sidebar open.
    pub on_open_settings: Callback<String>,

    /// Open the panel context menu at `(client_x, client_y)`. Wired here on the
    /// tab host because the tab's content is a `create_portal` subtree, so its
    /// events don't reach the frame's main-tree `oncontextmenu` (unlike the
    /// imperatively-mounted plugin body).
    pub on_context_menu: Callback<(String, f64, f64)>,

    /// Commit a new title for this panel. Wired by `MainPanel` to this panel's
    /// own [`Session::set_title`](crate::session::Session::set_title).
    /// `(panel_id, new_title)`; `None` clears it back to the id fallback.
    pub on_rename: Callback<(String, Option<String>)>,
}

/// Max gap (ms) between two tab pointerdowns to count as a double-click.
const DBLCLICK_MS: f64 = 400.0;

/// Shown in place of the title when a panel has no explicit title (rather than
/// falling back to the table / plugin name).
const TITLE_PLACEHOLDER: &str = "untitled";

pub enum PanelTabMsg {
    /// A pointerdown on the tab host. Selects the panel; and when it's the
    /// second within [`DBLCLICK_MS`], enters title-edit mode.
    PointerDown(f64),
    Close,

    /// The tab's open-settings button (shown while the settings sidebar is
    /// closed, in the close button's place).
    OpenSettings,
    ContextMenu(f64, f64),

    /// Track the live `<input>` value while editing (drives the auto-sizer).
    EditInput(String),

    /// Commit the edited title to the panel's session (blur / Enter).
    CommitEdit,

    /// Abandon the edit, restoring the previous title (Escape).
    CancelEdit,

    /// This panel's `Session::stats_changed` fired; re-read the stats.
    StatsChanged,
}

pub struct PanelTab {
    host: HtmlElement,
    shadow_root: Element,
    _pointerdown: Closure<dyn FnMut(PointerEvent)>,
    _contextmenu: Closure<dyn FnMut(MouseEvent)>,
    draggable: Rc<Cell<bool>>,

    /// `timeStamp` (ms) of the last host pointerdown, for synthesizing
    /// double-clicks.
    last_pointerdown: f64,

    /// `true` while the title is being edited (renders an `<input>`).
    editing: bool,

    /// Live edited value; controls the `<input>` and the auto-sizer width.
    edit_value: String,

    /// The edit `<input>`, for focusing on edit entry.
    input_ref: NodeRef,

    /// Focus + select-all the input on the next render after entering edit
    /// mode.
    focus_pending: bool,

    /// The `theme` prop value last written to the host.
    stamped_theme: Option<Option<String>>,

    /// This panel's `Table`/`View` dimensions, rendered as the `RowsCounter`
    /// after the title.
    stats: Option<ViewStats>,

    /// Subscription to `session.stats_changed`, armed only while the tab is
    /// `visible`.
    _stats_sub: Option<Subscription>,
}

impl PanelTab {
    fn slot_name(panel_id: &str) -> String {
        format!("tab-{}", panel_id)
    }

    /// Arm the `session.stats_changed` subscription and take a fresh stats
    /// snapshot.
    fn arm_stats(&mut self, ctx: &Context<Self>) {
        let cb = ctx.link().callback(|_: ()| PanelTabMsg::StatsChanged);
        self._stats_sub = Some(ctx.props().session.stats_changed.add_notify_listener(&cb));
        self.stats = ctx.props().session.get_table_stats();
    }

    /// Drop the stats subscription and snapshot.
    fn disarm_stats(&mut self) {
        self._stats_sub = None;
        self.stats = None;
    }

    /// Enter title-edit mode, seeding the input with the *real* title (empty
    /// when `None`, not the id fallback shown in display mode). Ignores
    /// re-entry so a click while editing doesn't clobber the in-progress
    /// edit. Returns whether a re-render is needed.
    fn begin_edit(&mut self, ctx: &Context<Self>) -> bool {
        if self.editing {
            return false;
        }

        self.editing = true;
        self.focus_pending = true;
        self.edit_value = ctx.props().title.clone().unwrap_or_default();
        true
    }

    /// Reflect `active`/`visible`/`single` onto the host (not a vnode — so
    /// its class is set imperatively). `visible` marks the front (selected)
    /// tab of every stack, not just the single active panel; `single`/`multi`
    /// reflect the host viewer's panel count. The shadow CSS keys off
    /// `:host(.active)` / `:host(.visible)` / `:host(.single)` /
    /// `:host(.settings-closed)`.
    fn sync_class(
        &self,
        active: bool,
        visible: bool,
        single: bool,
        closing: bool,
        is_settings_open: bool,
    ) {
        let mut class = Vec::with_capacity(5);
        if active {
            class.push("active");
        }

        if !is_settings_open {
            class.push("settings-closed");
        }

        if visible {
            class.push("visible");
        }

        if closing {
            class.push("closing");
        }

        class.push(if single { "single" } else { "multi" });
        let _ = self.host.set_attribute("class", &class.join(" "));
    }
}

impl Component for PanelTab {
    type Message = PanelTabMsg;
    type Properties = PanelTabProps;

    fn create(ctx: &Context<Self>) -> Self {
        ensure_custom_element();

        let host: HtmlElement = global::document()
            .create_element(TAB_TAG)
            .unwrap()
            .unchecked_into();

        host.set_attribute("part", "tab").unwrap();
        host.set_attribute("slot", &Self::slot_name(&ctx.props().panel_id))
            .unwrap();

        let init = ShadowRootInit::new(ShadowRootMode::Open);
        let shadow_root = host
            .shadow_root()
            .unwrap_or_else(|| host.attach_shadow(&init).unwrap())
            .unchecked_into::<Element>();

        adopt_sheet(&shadow_root);
        let link = ctx.link().clone();
        let draggable = Rc::new(Cell::new(ctx.props().draggable));
        let drag_flag = draggable.clone();
        let pointerdown = Closure::wrap(Box::new(move |event: PointerEvent| {
            if !drag_flag.get() {
                event.stop_propagation();
                event.prevent_default();
            }

            let ts = event.unchecked_ref::<Event>().time_stamp();
            link.send_message(PanelTabMsg::PointerDown(ts));
        }) as Box<dyn FnMut(PointerEvent)>);
        let _ = host
            .add_event_listener_with_callback("pointerdown", pointerdown.as_ref().unchecked_ref());

        let link = ctx.link().clone();
        let contextmenu = Closure::wrap(Box::new(move |event: MouseEvent| {
            // Shift+right-click passes through to the native browser menu.
            if event.shift_key() {
                return;
            }

            event.prevent_default();
            event.stop_propagation();
            link.send_message(PanelTabMsg::ContextMenu(
                event.client_x() as f64,
                event.client_y() as f64,
            ));
        }) as Box<dyn FnMut(MouseEvent)>);
        let _ = host
            .add_event_listener_with_callback("contextmenu", contextmenu.as_ref().unchecked_ref());

        let mut tab = Self {
            host,
            shadow_root,
            _pointerdown: pointerdown,
            _contextmenu: contextmenu,
            draggable,
            last_pointerdown: f64::NEG_INFINITY,
            editing: false,
            edit_value: String::new(),
            input_ref: NodeRef::default(),
            focus_pending: false,
            stamped_theme: None,
            stats: None,
            _stats_sub: None,
        };

        if ctx.props().visible {
            tab.arm_stats(ctx);
        }

        tab
    }

    fn changed(&mut self, ctx: &Context<Self>, old: &Self::Properties) -> bool {
        if ctx.props().panel_id != old.panel_id {
            let _ = self
                .host
                .set_attribute("slot", &Self::slot_name(&ctx.props().panel_id));
        }

        if !ctx.props().visible {
            self.disarm_stats();
        } else if self._stats_sub.is_none() || ctx.props().session != old.session {
            self.arm_stats(ctx);
        }

        self.draggable.set(ctx.props().draggable);
        true
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        let id = ctx.props().panel_id.clone();
        match msg {
            PanelTabMsg::PointerDown(ts) => {
                ctx.props().on_select.emit(id);
                let is_double = ts - self.last_pointerdown <= DBLCLICK_MS;
                self.last_pointerdown = ts;
                is_double && self.begin_edit(ctx)
            },
            PanelTabMsg::Close => {
                ctx.props().on_close.emit(id);
                false
            },
            PanelTabMsg::OpenSettings => {
                ctx.props().on_open_settings.emit(id);
                false
            },
            PanelTabMsg::ContextMenu(x, y) => {
                ctx.props().on_context_menu.emit((id, x, y));
                false
            },
            PanelTabMsg::EditInput(value) => {
                self.edit_value = value;
                true
            },
            PanelTabMsg::CommitEdit => {
                if !self.editing {
                    return false;
                }

                self.editing = false;
                let value = self.edit_value.trim();
                let title = (!value.is_empty()).then(|| value.to_owned());
                ctx.props().on_rename.emit((id, title));
                true
            },
            PanelTabMsg::CancelEdit => {
                if !self.editing {
                    return false;
                }

                self.editing = false;
                true
            },
            PanelTabMsg::StatsChanged => {
                let stats = ctx.props().session.get_table_stats();
                let changed = stats != self.stats;
                self.stats = stats;
                changed
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|e: PointerEvent| {
            e.stop_propagation();
            PanelTabMsg::Close
        });

        let on_open_settings = ctx.link().callback(|e: PointerEvent| {
            e.stop_propagation();
            PanelTabMsg::OpenSettings
        });

        let on_open_workspace = ctx.props().on_open_workspace.reform(|e: PointerEvent| {
            e.stop_propagation();
        });

        let title_html = if self.editing {
            let oninput = ctx.link().callback(|e: InputEvent| {
                let value = e
                    .target()
                    .map(|t| t.unchecked_into::<HtmlInputElement>().value())
                    .unwrap_or_default();
                PanelTabMsg::EditInput(value)
            });
            let onblur = ctx.link().callback(|_: FocusEvent| PanelTabMsg::CommitEdit);
            let onkeydown = ctx
                .link()
                .batch_callback(|e: KeyboardEvent| match e.key().as_str() {
                    "Enter" => vec![PanelTabMsg::CommitEdit],
                    "Escape" => vec![PanelTabMsg::CancelEdit],
                    _ => vec![],
                });

            let onpointerdown = ctx.link().batch_callback(|e: PointerEvent| {
                e.stop_propagation();
                Vec::<PanelTabMsg>::new()
            });

            html! {
                <label class="psp-tab-title input-sizer" data-value={self.edit_value.clone()}>
                    <input
                        ref={self.input_ref.clone()}
                        value={self.edit_value.clone()}
                        {oninput}
                        {onblur}
                        {onkeydown}
                        {onpointerdown}
                    />
                </label>
            }
        } else {
            // The panel's explicit title, else a placeholder (NOT the table /
            // plugin name) rendered in the inactive color (see panel-tab.css
            // `.psp-tab-title.placeholder`).
            match ctx.props().title.clone().filter(|t| !t.is_empty()) {
                Some(title) => html! { <span class="psp-tab-title">{ title }</span> },
                None => html! {
                    <span class="psp-tab-title placeholder">{ TITLE_PLACEHOLDER }</span>
                },
            }
        };

        let content = html! {
            <>
                if let Some(status) = &ctx.props().status {
                    <span
                        class={classes!("psp-tab-status", status.state.class_name())}
                        onpointerdown={on_open_workspace}
                    />
                } else {
                    <span
                        class={classes!("psp-tab-caret", ctx.props().errored.then_some("errored"))}
                    />
                }
                // <span class="psp-tab-grip" />
                { title_html }
                if ctx.props().visible { <RowsCounter stats={self.stats.clone()} /> }
                if ctx.props().is_master { <span class="psp-tab-master" /> }
                if !ctx.props().is_settings_open {
                    <button class="psp-tab-settings" onpointerdown={on_open_settings} />
                } else if ctx.props().closable {
                    <button class="psp-tab-close" onpointerdown={on_close} />
                }
            </>
        };

        yew::create_portal(content, self.shadow_root.clone())
    }

    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        self.sync_class(
            ctx.props().active,
            ctx.props().visible,
            ctx.props().single,
            ctx.props().closing,
            ctx.props().is_settings_open,
        );
        let theme = &ctx.props().theme;
        if self.stamped_theme.as_ref() != Some(theme) {
            match theme {
                Some(theme) => {
                    let _ = self.host.set_attribute("theme", theme);
                },
                None => {
                    let _ = self.host.remove_attribute("theme");
                },
            }

            self.stamped_theme = Some(theme.clone());
        }

        if !self.host.is_connected() {
            let _ = ctx.props().viewer.append_child(&self.host);
        }

        // Focus + select-all once, on entry to edit mode.
        if self.focus_pending {
            self.focus_pending = false;
            if let Some(input) = self.input_ref.cast::<HtmlInputElement>() {
                let _ = input.focus();
                input.select();
            }
        }
    }

    fn destroy(&mut self, ctx: &Context<Self>) {
        if self.host.is_connected() {
            let _ = ctx.props().viewer.remove_child(&self.host);
        }
    }
}
