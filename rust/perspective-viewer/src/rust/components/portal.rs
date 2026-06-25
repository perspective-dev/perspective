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

use crate::components::modal::ModalOrientation;
use crate::components::style::{StyleProvider, StyleSurface};
use crate::utils::*;

#[derive(Properties, PartialEq)]
pub struct PortalModalProps {
    pub children: Children,

    /// The element to position relative to. `None` means closed.
    pub target: Option<HtmlElement>,

    /// Whether the portal manages its own focus and closes on blur.
    #[prop_or(true)]
    pub own_focus: bool,

    /// Called when the portal closes (blur, etc).
    #[prop_or_default]
    pub on_close: Callback<()>,

    pub tag_name: &'static str,

    pub theme: String,

    /// Which popup CSS surface this portal's ShadowRoot adopts.
    pub surface: StyleSurface,
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
    _blur_closure: Option<Closure<dyn FnMut(FocusEvent)>>,
}

impl PortalModal {
    fn attach_to_body(&self) {
        if !self.host.is_connected() {
            let _ = global::body().append_child(&self.host);
        }
    }

    fn detach_from_body(&mut self) {
        if self.host.is_connected() {
            let _ = global::body().remove_child(&self.host);
        }

        if let Some(closure) = self._blur_closure.as_ref() {
            self.host
                .remove_event_listener_with_callback("blur", closure.as_ref().unchecked_ref())
                .unwrap()
        }

        self._blur_closure = None;
    }

    fn position_against_target(&mut self, target: &HtmlElement) {
        let target_rect = target.get_bounding_client_rect();
        let height = target_rect.height();
        let width = target_rect.width();
        let top = target_rect.top();
        let left = target_rect.left();

        if !self.visible {
            // First pass: position at default anchor, invisible
            self.top = top + height - 1.0;
            self.left = left;
            self.visible = false;
        } else {
            // Second pass: compute actual anchor and reposition
            let anchor = calc_relative_position(&self.host, top, left, height, width);
            self.anchor.set(anchor);
            let modal_rect = self.host.get_bounding_client_rect();
            let (new_top, new_left) = calc_anchor_position(anchor, &target_rect, &modal_rect);
            self.top = new_top;
            self.left = new_left;
            self.rev_vert.set(anchor.is_rev_vert());
        }
    }

    fn setup_blur_handler(&mut self, ctx: &Context<Self>) {
        let on_close = {
            let target = ctx.props().target.clone();
            ctx.props().on_close.reform(move |_| {
                if let Some(target) = &target {
                    target.class_list().remove_1("modal-target").unwrap();
                }
            })
        };

        let closure = Closure::wrap(Box::new(move |_: FocusEvent| {
            on_close.emit(());
        }) as Box<dyn FnMut(FocusEvent)>);

        let _ = self
            .host
            .add_event_listener_with_callback("blur", closure.as_ref().unchecked_ref());

        self._blur_closure = Some(closure);
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

        host.style().set_property("position", "fixed").unwrap();
        host.style().set_property("z-index", "10000").unwrap();
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
            _blur_closure: None,
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
        let new_target = &ctx.props().target;
        let old_target = &old_props.target;

        match (old_target, new_target, self._blur_closure.as_ref()) {
            (None, Some(_), Some(closure)) => {
                self.visible = false;
                self.host
                    .remove_event_listener_with_callback("blur", closure.as_ref().unchecked_ref())
                    .unwrap();

                self._blur_closure = None;
            },
            (None, Some(_), None) => {
                self.visible = false;
                self._blur_closure = None;
            },
            (Some(_), None, _) => {
                self.detach_from_body();
                return true;
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

        let opacity = if self.visible { "" } else { ";opacity:0" };
        let css = format!(
            ":host{{top:{}px;left:{}px{}}}",
            self.top, self.left, opacity
        );

        let portal_content = html! {
            <>
                <style>{ css }</style>
                <ContextProvider<ModalOrientation> context={self.rev_vert.clone()}>
                    <StyleProvider root={self.host.clone()} surface={ctx.props().surface}>
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

                // First render with a target: attach to body, position invisible
                self.position_against_target(target);
                self.attach_to_body();

                // Propagate theme from target
                if let Some(theme) = target.get_attribute("theme") {
                    let _ = self.host.set_attribute("theme", &theme);
                }

                target.class_list().add_1("modal-target").unwrap();

                if ctx.props().own_focus {
                    self.host.set_attribute("tabindex", "0").unwrap();
                    self.setup_blur_handler(ctx);
                }

                // Schedule second positioning pass
                let link = ctx.link().clone();
                wasm_bindgen_futures::spawn_local(async move {
                    request_animation_frame().await;
                    link.send_message(PortalModalMsg::Reposition);
                });
            } else if self.visible {
                // Second pass: reposition with correct anchor
                self.position_against_target(target);

                if ctx.props().own_focus && self._blur_closure.is_some() {
                    let _ = self.host.focus();
                }
            }
        }
    }

    fn destroy(&mut self, ctx: &Context<Self>) {
        if let Some(target) = &ctx.props().target {
            target.class_list().remove_1("modal-target").unwrap();
            if target.get_attribute("theme").is_some() {
                let _ = self.host.remove_attribute("theme");
            }

            let event = CustomEvent::new("-perspective-close-expression").unwrap();
            let _ = target.dispatch_event(&event);
        }

        self.detach_from_body();
    }
}
