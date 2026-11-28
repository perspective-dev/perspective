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

use perspective_js::utils::global;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::prelude::*;

use crate::ui::modal::ModalOrientation;
use crate::ui::style::StyleProvider;
use crate::utils::*;

/// The `slot` every modal host is assigned in the viewer's light DOM, so it
/// is in the flat tree.
pub const MODAL_SLOT: &str = "modal";

/// Find the `<perspective-viewer>` that `target` lives in — as a light-DOM
/// descendant, or through any number of shadow roots.
fn nearest_viewer(target: &HtmlElement) -> Option<HtmlElement> {
    let is_viewer = |el: &Element| el.tag_name().eq_ignore_ascii_case("perspective-viewer");
    if let Ok(Some(viewer)) = target.closest("perspective-viewer") {
        return Some(viewer.unchecked_into());
    }

    let mut node: Node = target.clone().into();
    loop {
        let root = node.get_root_node();
        let host = root.dyn_ref::<ShadowRoot>()?.host();
        if is_viewer(&host) {
            return Some(host.unchecked_into());
        }

        if let Ok(Some(viewer)) = host.closest("perspective-viewer") {
            return Some(viewer.unchecked_into());
        }

        node = host.into();
    }
}

/// A modal (menu / completion dropdown) anchored to a `target` element,
/// hosted as a light-DOM child of the `<perspective-viewer>` in the top layer.
#[derive(Properties, PartialEq)]
pub struct PortalModalProps {
    pub children: Children,
    pub target: Option<HtmlElement>,
    pub tag_name: &'static str,
    pub theme: String,
    pub sheet: web_sys::CssStyleSheet,

    /// Adds this component's own light-dismiss (an outside `pointerdown` or
    /// Escape → `on_close`) instead of `popover="auto"`, whose platform
    /// dismissal fires on the opening click's own pointerup.
    #[prop_or(true)]
    pub own_focus: bool,

    #[prop_or_default]
    pub on_close: Callback<()>,

    /// The `<perspective-viewer>` to mount under, defaulting to the nearest
    /// viewer around `target`.
    #[prop_or_default]
    pub mount: Option<HtmlElement>,
}

pub enum PortalModalMsg {
    Reposition,
}

pub struct PortalModal {
    host: HtmlElement,
    shadow_root: Element,
    visible: bool,
    rev_vert: ModalOrientation,
    /// The `own_focus` light-dismiss listeners (document-level, capture),
    /// present only while the modal is open.
    _dismiss: Option<DismissHandlers>,

    /// The scroll, wheel and resize listeners that close any open modal.
    _viewport: Option<ViewportHandlers>,
}

/// The dismiss closures of an open `own_focus` modal: outside `pointerdown`
/// and Escape `keydown` on the document (capture), `blur` on the host.
struct DismissHandlers {
    pointerdown: Closure<dyn FnMut(PointerEvent)>,
    keydown: Closure<dyn FnMut(KeyboardEvent)>,
    blur: Closure<dyn FnMut(FocusEvent)>,
}

/// The closures that close an open modal when its surroundings scroll or the
/// window resizes, and the viewer shadow root the second scroll listener is on.
struct ViewportHandlers {
    scroll: Closure<dyn FnMut(Event)>,
    wheel: Closure<dyn FnMut(Event)>,
    resize: Closure<dyn FnMut(Event)>,
    viewer_root: Option<ShadowRoot>,
}

fn is_same_node(event: &Event, elem: &HtmlElement) -> bool {
    event
        .target()
        .and_then(|target| target.dyn_into::<Node>().ok())
        .is_some_and(|node| elem.is_same_node(Some(&node)))
}

/// Whether the scrolled element is one a user can scroll, which excludes the
/// `overflow: hidden` boxes a browser nudges to keep a caret in view.
fn is_user_scroll(event: &Event) -> bool {
    let Some(elem) = event
        .target()
        .and_then(|target| target.dyn_into::<Element>().ok())
    else {
        return true;
    };

    let Ok(Some(style)) = global::window().get_computed_style(&elem) else {
        return true;
    };

    let is_fixed = |axis: &str| {
        matches!(
            style.get_property_value(axis).as_deref(),
            Ok("hidden") | Ok("clip")
        )
    };

    !(is_fixed("overflow-x") && is_fixed("overflow-y"))
}

impl PortalModal {
    fn attach(&self, ctx: &Context<Self>, target: &HtmlElement) {
        if self.host.is_connected() {
            return;
        }

        let parent = ctx
            .props()
            .mount
            .clone()
            .or_else(|| nearest_viewer(target))
            .unwrap_or_else(|| {
                tracing::warn!(
                    "`{}` target is outside any <perspective-viewer>; mounting on <body> unthemed",
                    ctx.props().tag_name
                );

                global::body()
            });

        let _ = parent.append_child(&self.host);
        let _ = self.host.show_popover();
    }

    fn detach(&mut self) {
        self.remove_dismiss_handlers();
        self.remove_viewport_handlers();
        if self.host.is_connected() {
            let _ = self.host.hide_popover();
            self.host.remove();
        }
    }

    fn position_against_target(&mut self, target: &HtmlElement) {
        let anchor = Bounds::from(&target.get_bounding_client_rect());
        if self.visible {
            let placement = apply_placement(&self.host, &anchor, ModalSide::Below);
            self.rev_vert.set(placement.flipped_vertical);
        } else {
            let style = self.host.style();
            let _ = style.set_property("top", &format!("{}px", anchor.bottom - 1.0));
            let _ = style.set_property("left", &format!("{}px", anchor.left));
        }
    }

    fn close_callback(ctx: &Context<Self>) -> Callback<()> {
        let target = ctx.props().target.clone();
        ctx.props().on_close.reform(move |_| {
            if let Some(target) = &target {
                target.class_list().remove_1("modal-target").unwrap();
            }
        })
    }

    /// Close on a window resize, on a user-scrollable element other than the
    /// modal or its invoker scrolling, and on a wheel outside the modal.
    fn setup_viewport_handlers(&mut self, ctx: &Context<Self>, target: &HtmlElement) {
        let on_close = Self::close_callback(ctx);
        let scroll = Closure::wrap(Box::new({
            clone!(on_close, self.host, target);
            move |event: Event| {
                if !is_same_node(&event, &host)
                    && !is_same_node(&event, &target)
                    && is_user_scroll(&event)
                {
                    on_close.emit(());
                }
            }
        }) as Box<dyn FnMut(Event)>);

        let wheel = Closure::wrap(Box::new({
            clone!(on_close, self.host);
            move |event: Event| {
                if !event.composed_path().includes(host.as_ref(), 0) {
                    on_close.emit(());
                }
            }
        }) as Box<dyn FnMut(Event)>);

        let resize = Closure::wrap(Box::new(move |_: Event| {
            on_close.emit(());
        }) as Box<dyn FnMut(Event)>);

        let window = global::window();
        let _ = window.add_event_listener_with_callback_and_bool(
            "scroll",
            scroll.as_ref().unchecked_ref(),
            true,
        );

        let _ = window.add_event_listener_with_callback_and_bool(
            "wheel",
            wheel.as_ref().unchecked_ref(),
            true,
        );

        let _ = window.add_event_listener_with_callback("resize", resize.as_ref().unchecked_ref());
        let viewer_root = self
            .host
            .parent_element()
            .and_then(|viewer| viewer.shadow_root());

        if let Some(root) = &viewer_root {
            let _ = root.add_event_listener_with_callback_and_bool(
                "scroll",
                scroll.as_ref().unchecked_ref(),
                true,
            );
        }

        self._viewport = Some(ViewportHandlers {
            scroll,
            wheel,
            resize,
            viewer_root,
        });
    }

    fn remove_viewport_handlers(&mut self) {
        if let Some(ViewportHandlers {
            scroll,
            wheel,
            resize,
            viewer_root,
        }) = self._viewport.take()
        {
            let window = global::window();
            let _ = window.remove_event_listener_with_callback_and_bool(
                "scroll",
                scroll.as_ref().unchecked_ref(),
                true,
            );

            let _ = window.remove_event_listener_with_callback_and_bool(
                "wheel",
                wheel.as_ref().unchecked_ref(),
                true,
            );

            let _ = window
                .remove_event_listener_with_callback("resize", resize.as_ref().unchecked_ref());

            if let Some(root) = viewer_root {
                let _ = root.remove_event_listener_with_callback_and_bool(
                    "scroll",
                    scroll.as_ref().unchecked_ref(),
                    true,
                );
            }
        }
    }

    /// This component's light-dismiss for `own_focus` modals: an outside
    /// `pointerdown` (document capture) or Escape.
    fn setup_dismiss_handlers(&mut self, ctx: &Context<Self>) {
        let on_close = Self::close_callback(ctx);

        let host = self.host.clone();
        let pointerdown = Closure::wrap(Box::new({
            let on_close = on_close.clone();
            move |event: PointerEvent| {
                if !event.composed_path().includes(host.as_ref(), 0) {
                    on_close.emit(());
                }
            }
        }) as Box<dyn FnMut(PointerEvent)>);

        let keydown = Closure::wrap(Box::new({
            let on_close = on_close.clone();
            move |event: KeyboardEvent| {
                if event.key() == "Escape" {
                    on_close.emit(());
                }
            }
        }) as Box<dyn FnMut(KeyboardEvent)>);

        let blur = Closure::wrap(Box::new(move |_: FocusEvent| {
            on_close.emit(());
        }) as Box<dyn FnMut(FocusEvent)>);

        let _ = self
            .host
            .add_event_listener_with_callback("blur", blur.as_ref().unchecked_ref());

        let document = global::document();
        let _ = document.add_event_listener_with_callback_and_bool(
            "pointerdown",
            pointerdown.as_ref().unchecked_ref(),
            true,
        );

        let _ = document.add_event_listener_with_callback_and_bool(
            "keydown",
            keydown.as_ref().unchecked_ref(),
            true,
        );

        self._dismiss = Some(DismissHandlers {
            pointerdown,
            keydown,
            blur,
        });
    }

    fn remove_dismiss_handlers(&mut self) {
        if let Some(DismissHandlers {
            pointerdown,
            keydown,
            blur,
        }) = self._dismiss.take()
        {
            let _ = self
                .host
                .remove_event_listener_with_callback("blur", blur.as_ref().unchecked_ref());

            let document = global::document();
            let _ = document.remove_event_listener_with_callback_and_bool(
                "pointerdown",
                pointerdown.as_ref().unchecked_ref(),
                true,
            );

            let _ = document.remove_event_listener_with_callback_and_bool(
                "keydown",
                keydown.as_ref().unchecked_ref(),
                true,
            );
        }
    }
}

impl Component for PortalModal {
    type Message = PortalModalMsg;
    type Properties = PortalModalProps;

    fn create(ctx: &Context<Self>) -> Self {
        let host: HtmlElement = global::document()
            .create_element(ctx.props().tag_name)
            .unwrap()
            .unchecked_into();

        host.set_attribute("popover", "manual").unwrap();
        host.set_attribute("slot", MODAL_SLOT).unwrap();

        let style = host.style();
        style.set_property("position", "fixed").unwrap();
        style.set_property("right", "auto").unwrap();
        style.set_property("bottom", "auto").unwrap();
        style.set_property("margin", "0").unwrap();
        let init = ShadowRootInit::new(ShadowRootMode::Open);
        let shadow_root = if let Some(elem) = host.shadow_root() {
            elem
        } else {
            host.attach_shadow(&init).unwrap()
        }
        .unchecked_into::<Element>();

        Self {
            host,
            shadow_root,
            visible: false,
            rev_vert: Default::default(),
            _dismiss: None,
            _viewport: None,
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            PortalModalMsg::Reposition => {
                self.visible = true;
                true
            },
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old_props: &Self::Properties) -> bool {
        debug_assert_eq!(ctx.props().tag_name, old_props.tag_name);
        debug_assert_eq!(ctx.props().sheet, old_props.sheet);

        match (&old_props.target, &ctx.props().target) {
            (None, Some(_)) => {
                self.visible = false;
                self.remove_dismiss_handlers();
                self.remove_viewport_handlers();
            },
            (Some(old), None) => {
                let _ = old.class_list().remove_1("modal-target");
                self.detach();
            },
            (Some(old), Some(new)) if old != new => {
                let _ = old.class_list().remove_1("modal-target");
            },
            _ => {},
        }

        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let target = &ctx.props().target;
        if target.is_none() {
            return html! {};
        }

        let css = if self.visible { "" } else { ":host{opacity:0}" };

        let portal_content = html! {
            <>
                <style>{ css }</style>
                <ContextProvider<ModalOrientation> context={self.rev_vert.clone()}>
                    <StyleProvider root={self.host.clone()} sheet={ctx.props().sheet.clone()}>
                        { for ctx.props().children.iter() }
                    </StyleProvider>
                </ContextProvider<ModalOrientation>>
            </>
        };

        yew::create_portal(portal_content, self.shadow_root.clone())
    }

    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        if let Some(target) = &ctx.props().target {
            if !self.host.is_connected() {
                let theme = ctx.props().theme.as_str();
                self.host.set_attribute("theme", theme).unwrap();
                if let Some(theme) = target.get_attribute("theme") {
                    let _ = self.host.set_attribute("theme", &theme);
                }

                self.position_against_target(target);
                self.attach(ctx, target);
                self.setup_viewport_handlers(ctx, target);
                target.class_list().add_1("modal-target").unwrap();
                if ctx.props().own_focus {
                    self.host.set_attribute("tabindex", "0").unwrap();
                    self.setup_dismiss_handlers(ctx);
                    let _ = self.host.focus();
                }

                let link = ctx.link().clone();
                wasm_bindgen_futures::spawn_local(async move {
                    request_animation_frame().await;
                    link.send_message(PortalModalMsg::Reposition);
                });
            } else if self.visible {
                self.position_against_target(target);
                if ctx.props().own_focus && self._dismiss.is_some() {
                    let _ = self.host.focus();
                }
            }
        }
    }

    fn destroy(&mut self, ctx: &Context<Self>) {
        if let Some(target) = &ctx.props().target {
            target.class_list().remove_1("modal-target").unwrap();
            let event = CustomEvent::new("-perspective-close-expression").unwrap();
            let _ = target.dispatch_event(&event);
        }

        self.detach();
    }
}

/// Create the session-long 0×0 cursor anchor at viewport `(x, y)` as a
/// light-DOM child of `viewer` in the modal slot.
pub fn session_anchor(viewer: &HtmlElement, x: f64, y: f64) -> HtmlElement {
    let anchor: HtmlElement = global::document()
        .create_element("div")
        .unwrap()
        .unchecked_into();

    let _ = anchor.set_attribute("slot", MODAL_SLOT);
    let style = anchor.style();
    let _ = style.set_property("position", "fixed");
    let _ = style.set_property("left", &format!("{x}px"));
    let _ = style.set_property("top", &format!("{y}px"));
    let _ = style.set_property("width", "0px");
    let _ = style.set_property("height", "0px");
    let _ = viewer.append_child(&anchor);
    anchor
}
