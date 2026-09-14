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
    top: f64,
    left: f64,
    visible: bool,
    rev_vert: ModalOrientation,
    anchor: Rc<Cell<ModalAnchor>>,
    /// The `own_focus` light-dismiss listeners (document-level, capture),
    /// present only while the modal is open.
    _dismiss: Option<DismissHandlers>,
}

/// The dismiss closures of an open `own_focus` modal: outside `pointerdown`
/// and Escape `keydown` on the document (capture), `blur` on the host.
struct DismissHandlers {
    pointerdown: Closure<dyn FnMut(PointerEvent)>,
    keydown: Closure<dyn FnMut(KeyboardEvent)>,
    blur: Closure<dyn FnMut(FocusEvent)>,
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
        if self.host.is_connected() {
            let _ = self.host.hide_popover();
            self.host.remove();
        }
    }

    fn position_against_target(&mut self, target: &HtmlElement) {
        let target_rect = target.get_bounding_client_rect();
        let height = target_rect.height();
        let width = target_rect.width();
        let top = target_rect.top();
        let left = target_rect.left();

        if !self.visible {
            self.top = top + height - 1.0;
            self.left = left;
            self.visible = false;
        } else {
            let anchor = calc_relative_position(&self.host, top, left, height, width);
            self.anchor.set(anchor);
            let modal_rect = self.host.get_bounding_client_rect();
            let (new_top, new_left) = calc_anchor_position(anchor, &target_rect, &modal_rect);
            self.top = new_top;
            self.left = new_left;
            self.rev_vert.set(anchor.is_rev_vert());
        }

        let style = self.host.style();
        let _ = style.set_property("top", &format!("{}px", self.top));
        let _ = style.set_property("left", &format!("{}px", self.left));
    }

    /// This component's light-dismiss for `own_focus` modals: an outside
    /// `pointerdown` (document capture) or Escape.
    fn setup_dismiss_handlers(&mut self, ctx: &Context<Self>) {
        let on_close = {
            let target = ctx.props().target.clone();
            ctx.props().on_close.reform(move |_| {
                if let Some(target) = &target {
                    target.class_list().remove_1("modal-target").unwrap();
                }
            })
        };

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
            top: 0.0,
            left: 0.0,
            visible: false,
            rev_vert: Default::default(),
            anchor: Default::default(),
            _dismiss: None,
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
