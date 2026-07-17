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

use std::cell::Cell;
use std::rc::Rc;

use perspective_js::utils::global;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::prelude::*;

#[wasm_bindgen(inline_js = r#"
    export function define_panel_tab(name) {
        if (!customElements.get(name)) {
            customElements.define(name, class extends HTMLElement {});
        }
    }
"#)]
extern "C" {
    #[wasm_bindgen(js_name = "define_panel_tab")]
    fn define_panel_tab(name: &str);
}

/// The tag the tab host is created as (a custom element, so it can own a
/// ShadowRoot for its contents).
const TAB_TAG: &str = "perspective-viewer-tab";

thread_local! {
    /// Whether the `<perspective-viewer-tab>` custom element has been defined
    /// (once per page; WASM is single-threaded).
    static ELEMENT_DEFINED: Cell<bool> = const { Cell::new(false) };

    /// The shared, constructed stylesheet adopted into every tab's ShadowRoot.
    /// Built once from `panel-tab.css`; a constructed `CSSStyleSheet` is cheap
    /// and safe to adopt into arbitrarily many roots.
    static TAB_SHEET: CssStyleSheet = {
        let sheet = CssStyleSheet::new().unwrap();
        sheet.replace_sync(include_str!("../../css/panel-tab.css"))
            .unwrap();
        sheet
    };
}

/// Define the `<perspective-viewer-tab>` custom element once. It needs no
/// lifecycle callbacks — it exists only to own a ShadowRoot into which each
/// tab's contents are rendered (so the tab's structure CSS is encapsulated in
/// its `adoptedStyleSheets` rather than injected into `document.head`).
///
/// The host stays a *light-DOM* child of the viewer, so the per-panel `theme`
/// attr is still matched by the document theme rules (`perspective-viewer
/// [theme="X"]`); the `--psp-*` they set are inherited across the shadow
/// boundary into the tab's contents.
fn ensure_custom_element() {
    ELEMENT_DEFINED.with(|defined| {
        if !defined.get() {
            define_panel_tab(TAB_TAG);
            defined.set(true);
        }
    });
}

/// Adopt the shared tab stylesheet into `shadow_root.adoptedStyleSheets`
/// (idempotent per root). Mirrors `StyleProvider`'s adopt-by-`Reflect`
/// approach.
fn adopt_sheet(shadow_root: &Element) {
    let sheets = js_sys::Reflect::get(shadow_root.as_ref(), &"adoptedStyleSheets".into())
        .unwrap()
        .unchecked_into::<js_sys::Array>();

    TAB_SHEET.with(|sheet| {
        let sheet_val: &JsValue = sheet.as_ref();
        if sheets.index_of(sheet_val, 0) < 0 {
            sheets.push(sheet_val);
        }
    });
}

/// A panel's titlebar tab. The host is a `<perspective-viewer-tab>` custom
/// element mounted in the viewer's **light DOM** and forwarded into its
/// `<regular-layout-frame>` titlebar via a `<slot name="tab-{id}" slot="tab">`
/// (rendered by `MainPanel`); the tab's *contents* live in the host's
/// **ShadowRoot**, whose `adoptedStyleSheets` carry the structure CSS.
///
/// Keeping the host in the light DOM — like the plugin — is what lets
/// *document* theme CSS (`perspective-viewer [theme="X"]`) reach it, so each
/// panel's chrome is themed by the native cascade instead of a runtime-inlined
/// string; the `--psp-*` those rules set are inherited across the shadow
/// boundary into the contents. The host carries `part="tab"`, which
/// `<regular-layout-frame>`'s pointer handler treats as a drag handle
/// (regular-layout@>=0.6.0's custom-tab contract); the title is
/// `pointer-events:none` so clicks fall through to the host (like the built-in
/// `<regular-layout-tab>`).
#[derive(Properties, PartialEq)]
pub struct PanelTabProps {
    /// The `<perspective-viewer>` host element; the tab is attached here as a
    /// light-DOM child (mirrors `renderer::activate`'s plugin mount).
    pub viewer: HtmlElement,

    /// The panel id. The tab is assigned to `slot="tab-{panel_id}"`.
    pub panel_id: String,

    /// The panel's title; falls back to the id when `None`.
    pub title: Option<String>,

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

    /// `false` for a lone panel (which can't be closed to zero) — hides the
    /// close button.
    pub closable: bool,

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
    /// second within [`DBLCLICK_MS`], enters title-edit mode. Carries the
    /// event `timeStamp` (ms). We synthesize the double-click from pointerdown
    /// because `<regular-layout-frame>` calls `setPointerCapture` +
    /// `preventDefault` on the tab's pointerdown (to arm a drag), which
    /// suppresses the browser's synthesized `click`/`dblclick` — so a native
    /// `dblclick` listener never fires on the tab.
    PointerDown(f64),
    Close,
    ContextMenu(f64, f64),
    /// Track the live `<input>` value while editing (drives the auto-sizer).
    EditInput(String),
    /// Commit the edited title to the panel's session (blur / Enter).
    CommitEdit,
    /// Abandon the edit, restoring the previous title (Escape).
    CancelEdit,
}

pub struct PanelTab {
    host: HtmlElement,
    /// The host's open ShadowRoot; the tab's contents are portaled here (stored
    /// as `Element` for `create_portal`, matching `PortalModal`).
    shadow_root: Element,
    /// `pointerdown` listener on the host (kept alive); selects this panel and
    /// synthesizes double-click-to-edit (see [`PanelTabMsg::PointerDown`]).
    _pointerdown: Closure<dyn FnMut(PointerEvent)>,
    /// `contextmenu` listener on the host (kept alive); opens the panel menu.
    _contextmenu: Closure<dyn FnMut(MouseEvent)>,
    /// Current `draggable` prop, shared into the `pointerdown` closure so a
    /// prop change (lone ⇄ multi panel) takes effect without re-creating it.
    draggable: Rc<Cell<bool>>,
    /// `timeStamp` (ms) of the last host pointerdown, for synthesizing
    /// double-clicks. `NEG_INFINITY` until the first pointerdown.
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
}

impl PanelTab {
    fn slot_name(panel_id: &str) -> String {
        format!("tab-{panel_id}")
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

    /// Reflect `active`/`visible` onto the host (not a vnode — so its class is
    /// set imperatively). `visible` marks the front (selected) tab of every
    /// stack, not just the single active panel; the shadow CSS keys off
    /// `:host(.active)` / `:host(.visible)`.
    fn sync_class(&self, active: bool, visible: bool) {
        let class = match (active, visible) {
            (true, true) => "active visible",
            // Active implies front-of-stack, but guard the transient anyway.
            (true, false) => "active",
            (false, true) => "visible",
            (false, false) => "",
        };

        let _ = self.host.set_attribute("class", class);
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

        let _ = host.set_attribute("part", "tab");
        let _ = host.set_attribute("slot", &Self::slot_name(&ctx.props().panel_id));

        // Encapsulate the tab's contents in an open ShadowRoot, and adopt the
        // shared structure stylesheet into it. The host itself stays in the
        // light DOM (see `ensure_custom_element`).
        let init = ShadowRootInit::new(ShadowRootMode::Open);
        let shadow_root = host
            .shadow_root()
            .unwrap_or_else(|| host.attach_shadow(&init).unwrap())
            .unchecked_into::<Element>();

        adopt_sheet(&shadow_root);

        // A pointerdown anywhere on the tab selects the panel (the title is
        // `pointer-events:none`, so its clicks fall through to this host), and a
        // second within the double-click window enters title-edit mode (see
        // `PanelTabMsg::PointerDown`). The close button stops propagation so it
        // doesn't also select; the frame's own handler reads `part="tab"` off
        // this host to start a drag.
        let link = ctx.link().clone();
        let draggable = Rc::new(Cell::new(ctx.props().draggable));
        let drag_flag = draggable.clone();
        let pointerdown = Closure::wrap(Box::new(move |event: PointerEvent| {
            // A lone panel can't be rearranged — stop the pointerdown before it
            // reaches `<regular-layout-frame>`'s titlebar handler so it never
            // arms a drag (our own select / double-click logic still runs).
            // ALSO cancel the compat mouse events (the frame's drag-arm
            // `preventDefault` normally does this): the synthesized
            // double-click renders + focuses the title editor `<input>`
            // between the second `pointerdown` and its compat `mousedown`,
            // whose default focus action would land on the non-focusable host
            // and instantly blur (→ commit away) the editor.
            if !drag_flag.get() {
                event.stop_propagation();
                event.prevent_default();
            }

            let ts = event.unchecked_ref::<Event>().time_stamp();
            link.send_message(PanelTabMsg::PointerDown(ts));
        }) as Box<dyn FnMut(PointerEvent)>);
        let _ = host
            .add_event_listener_with_callback("pointerdown", pointerdown.as_ref().unchecked_ref());

        // Right-click → panel context menu (suppressing the native menu). Stops
        // propagation so it doesn't also bubble to the frame.
        let link = ctx.link().clone();
        let contextmenu = Closure::wrap(Box::new(move |event: MouseEvent| {
            event.prevent_default();
            event.stop_propagation();
            link.send_message(PanelTabMsg::ContextMenu(
                event.client_x() as f64,
                event.client_y() as f64,
            ));
        }) as Box<dyn FnMut(MouseEvent)>);
        let _ = host
            .add_event_listener_with_callback("contextmenu", contextmenu.as_ref().unchecked_ref());

        Self {
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
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old: &Self::Properties) -> bool {
        if ctx.props().panel_id != old.panel_id {
            let _ = self
                .host
                .set_attribute("slot", &Self::slot_name(&ctx.props().panel_id));
        }

        // Keep the pointerdown closure's drag gate in sync with the prop.
        self.draggable.set(ctx.props().draggable);

        true
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        let id = ctx.props().panel_id.clone();
        match msg {
            PanelTabMsg::PointerDown(ts) => {
                // Every pointerdown selects the panel (single-click behavior).
                ctx.props().on_select.emit(id);
                // A second pointerdown within the double-click window enters
                // title-edit mode. `begin_edit` only runs (and forces a render)
                // on an actual double-click that isn't already editing.
                let is_double = ts - self.last_pointerdown <= DBLCLICK_MS;
                self.last_pointerdown = ts;
                is_double && self.begin_edit(ctx)
            },
            PanelTabMsg::Close => {
                ctx.props().on_close.emit(id);
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
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|e: PointerEvent| {
            e.stop_propagation();
            PanelTabMsg::Close
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
            // Cursor-positioning clicks in the input must not fall through to the
            // host's select / the frame's drag while editing.
            let onpointerdown = ctx.link().batch_callback(|e: PointerEvent| {
                e.stop_propagation();
                Vec::<PanelTabMsg>::new()
            });

            // `input-sizer` (ported from the status bar) auto-grows to the value.
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
                <span class="psp-tab-grip" />
                { title_html }
                if ctx.props().closable { <button class="psp-tab-close" onpointerdown={on_close} /> }
            </>
        };

        yew::create_portal(content, self.shadow_root.clone())
    }

    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        self.sync_class(ctx.props().active, ctx.props().visible);
        match &ctx.props().theme {
            Some(theme) => {
                let _ = self.host.set_attribute("theme", theme);
            },
            None => {
                let _ = self.host.remove_attribute("theme");
            },
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
