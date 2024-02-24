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

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use derivative::Derivative;
use futures::Future;
use perspective::utils::{global, *};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::html::SendAsMessage;
use yew::prelude::*;

use crate::components::modal::*;
use crate::utils::*;

type BlurHandlerType = Rc<RefCell<Option<Closure<dyn FnMut(FocusEvent)>>>>;

/// A `ModalElement` wraps the parameterized yew `Component` in a Custom
/// Element. Via the `open()` and `close()` methods, a `ModalElement` can be
/// positioned next to any existing on-page elements, accounting for viewport,
/// scroll position, etc.
///
/// `#[derive(Clone)]` generates the trait bound `T: Clone`, which is not
/// required because `Scope<T>` implements Clone without this bound;  thus
/// `Clone` must be implemented by the `derivative` crate's
/// [custom bounds](https://mcarton.github.io/rust-derivative/latest/Debug.html#custom-bound)
/// support.
#[derive(Derivative)]
#[derivative(Clone(bound = ""))]
pub struct ModalElement<T>
where
    T: Component,
    T::Properties: ModalLink<T>,
{
    root: Rc<RefCell<Option<AppHandle<Modal<T>>>>>,
    pub custom_element: HtmlElement,
    target: Rc<RefCell<Option<HtmlElement>>>,
    blurhandler: BlurHandlerType,
    own_focus: bool,
    resize_sub: Rc<RefCell<Option<Subscription>>>,
    anchor: Rc<Cell<ModalAnchor>>,
    on_blur: Option<Callback<()>>,
}

/// Anchor point enum, `ModalCornerTargetCorner`
#[derive(Clone, Copy, Debug, Default)]
enum ModalAnchor {
    BottomRightTopLeft,
    BottomRightBottomLeft,
    BottomRightTopRight,
    BottomLeftTopLeft,
    TopRightTopLeft,
    TopRightBottomRight,

    #[default]
    TopLeftBottomLeft,
}

impl ModalAnchor {
    const fn is_rev_vert(&self) -> bool {
        matches!(
            self,
            Self::BottomLeftTopLeft
                | Self::BottomRightBottomLeft
                | Self::BottomRightTopLeft
                | Self::BottomRightTopRight
        )
    }
}

/// Given the bounds of the target element as previous computed, as well as the
/// browser's viewport and the bounds of the already-connected
/// `<perspectuve-style-menu>` element itself, determine a new (top, left)
/// coordinates that keeps the element on-screen.
fn calc_relative_position(
    elem: &HtmlElement,
    _top: f64,
    left: f64,
    height: f64,
    width: f64,
) -> ModalAnchor {
    let window = global::window();
    let rect = elem.get_bounding_client_rect();
    let inner_width = window.inner_width().unwrap().as_f64().unwrap();
    let inner_height = window.inner_height().unwrap().as_f64().unwrap();
    let rect_top = rect.top();
    let rect_height = rect.height();
    let rect_width = rect.width();
    let rect_left = rect.left();

    let elem_over_y = inner_height < rect_top + rect_height;
    let elem_over_x = inner_width < rect_left + rect_width;
    let target_over_x = inner_width < rect_left + width;
    let target_over_y = inner_height < rect_top + height;

    // modal/target
    match (elem_over_y, elem_over_x, target_over_x, target_over_y) {
        (true, _, true, true) => ModalAnchor::BottomRightTopLeft,
        (true, _, true, false) => ModalAnchor::BottomRightBottomLeft,
        (true, true, false, _) => {
            if left + width - rect_width > 0.0 {
                ModalAnchor::BottomRightTopRight
            } else {
                ModalAnchor::BottomLeftTopLeft
            }
        },
        (true, false, false, _) => ModalAnchor::BottomLeftTopLeft,
        (false, true, true, _) => ModalAnchor::TopRightTopLeft,
        (false, true, false, _) => {
            if left + width - rect_width > 0.0 {
                ModalAnchor::TopRightBottomRight
            } else {
                ModalAnchor::TopLeftBottomLeft
            }
        },
        _ => ModalAnchor::TopLeftBottomLeft,
    }
}

impl<T> ModalElement<T>
where
    T: Component,
    T::Properties: ModalLink<T>,
{
    pub fn new(
        custom_element: web_sys::HtmlElement,
        props: T::Properties,
        own_focus: bool,
        on_blur: Option<Callback<()>>,
    ) -> Self {
        custom_element.set_attribute("tabindex", "0").unwrap();
        let init = web_sys::ShadowRootInit::new(web_sys::ShadowRootMode::Open);
        let shadow_root = custom_element
            .attach_shadow(&init)
            .unwrap()
            .unchecked_into::<web_sys::Element>();

        let cprops = yew::props!(ModalProps<T> {
            child: Some(html_nested! {
                <T ..props />
            }),
        });

        let root = Rc::new(RefCell::new(Some(
            yew::Renderer::with_root_and_props(shadow_root, cprops).render(),
        )));

        let blurhandler = Rc::new(RefCell::new(None));
        Self {
            root,
            custom_element,
            target: Rc::new(RefCell::new(None)),
            own_focus,
            blurhandler,
            resize_sub: Rc::new(RefCell::new(None)),
            anchor: Default::default(),
            on_blur,
        }
    }

    fn calc_anchor_position(&self, target: &HtmlElement) -> (f64, f64) {
        let elem = target.unchecked_ref::<HtmlElement>();
        let rect = elem.get_bounding_client_rect();
        let height = rect.height();
        let width = rect.width();
        let top = rect.top();
        let left = rect.left();

        let self_rect = self.custom_element.get_bounding_client_rect();
        let rect_height = self_rect.height();
        let rect_width = self_rect.width();

        match self.anchor.get() {
            ModalAnchor::BottomRightTopLeft => (top - rect_height, left - rect_width + 1.0),
            ModalAnchor::BottomRightBottomLeft => {
                (top - rect_height + height, left - rect_width + 1.0)
            },
            ModalAnchor::BottomRightTopRight => {
                (top - rect_height + 1.0, left + width - rect_width)
            },
            ModalAnchor::BottomLeftTopLeft => (top - rect_height + 1.0, left),
            ModalAnchor::TopRightTopLeft => (top, left - rect_width + 1.0),
            ModalAnchor::TopRightBottomRight => (top + height - 1.0, left + width - rect_width),
            ModalAnchor::TopLeftBottomLeft => ((top + height - 1.0), left),
        }
    }

    async fn open_within_viewport(&self, target: HtmlElement) -> ApiResult<()> {
        let elem = target.unchecked_ref::<HtmlElement>();
        let rect = elem.get_bounding_client_rect();
        let width = rect.width();
        let height = rect.height();
        let top = rect.top();
        let left = rect.left();
        *self.target.borrow_mut() = Some(target.clone());

        // Default, top left/bottom left
        let msg = ModalMsg::SetPos {
            top: top + height - 1.0,
            left,
            visible: false,
            rev_vert: false,
        };

        self.root.borrow().as_ref().unwrap().send_message(msg);
        global::body().append_child(&self.custom_element)?;
        request_animation_frame().await;

        // Check if the modal has been positioned off-screen and re-locate if necessary
        self.anchor.set(calc_relative_position(
            &self.custom_element,
            top,
            left,
            height,
            width,
        ));

        let (top, left) = self.calc_anchor_position(&target);
        let msg = ModalMsg::SetPos {
            top,
            left,
            visible: true,
            rev_vert: self.anchor.get().is_rev_vert(),
        };

        self.root.borrow().as_ref().unwrap().send_message(msg);

        if self.own_focus {
            let mut this = Some(self.clone());
            *self.blurhandler.borrow_mut() = Some(Closure::new(move |_| {
                this.take().and_then(|x| x.hide().ok()).unwrap_or(())
            }));

            self.custom_element
                .dataset()
                .set("poscorrected", "true")
                .unwrap();

            self.custom_element.add_event_listener_with_callback(
                "blur",
                self.blurhandler
                    .borrow()
                    .as_ref()
                    .unwrap()
                    .as_ref()
                    .unchecked_ref(),
            )?;

            Ok(self.custom_element.focus()?)
        } else {
            Ok(())
        }
    }

    pub fn send_message(&self, msg: T::Message) {
        self.root
            .borrow()
            .as_ref()
            .unwrap()
            .send_message(ModalMsg::SubMsg(msg))
    }

    pub fn send_message_batch(&self, msgs: Vec<T::Message>) {
        self.root
            .borrow()
            .as_ref()
            .unwrap()
            .send_message_batch(msgs.into_iter().map(ModalMsg::SubMsg).collect())
    }

    pub fn send_future_batch<Fut>(&self, future: Fut)
    where
        Fut: Future + 'static,
        Fut::Output: SendAsMessage<Modal<T>>,
    {
        self.root
            .borrow()
            .as_ref()
            .unwrap()
            .send_future_batch(future)
    }

    /// Open this modal by attaching directly to `document.body` with position
    /// absolutely positioned relative to an alread-connected `target`
    /// element.
    ///
    /// Because the Custom Element has a `blur` handler, we must invoke this
    /// before attempting to re-parent the element.
    pub async fn open(
        self,
        target: web_sys::HtmlElement,
        resize_pubsub: Option<&PubSub<()>>,
    ) -> ApiResult<()> {
        if let Some(resize) = resize_pubsub {
            let this = self.clone();
            let target = target.clone();
            let anchor = self.anchor.clone();
            *self.resize_sub.borrow_mut() = Some(resize.add_listener(move |()| {
                let (top, left) = this.calc_anchor_position(&target);
                let msg = ModalMsg::SetPos {
                    top,
                    left,
                    visible: true,
                    rev_vert: anchor.get().is_rev_vert(),
                };

                this.root.borrow().as_ref().unwrap().send_message(msg);
            }));
        };

        target.class_list().add_1("modal-target").unwrap();
        let theme = get_theme(&target);
        self.open_within_viewport(target).await.unwrap();
        if let Some(theme) = theme {
            self.custom_element.set_attribute("theme", &theme).unwrap();
        }

        Ok(())
    }

    pub fn is_open(&self) -> bool {
        self.custom_element.is_connected()
    }

    /// Remove from document.
    pub fn hide(&self) -> ApiResult<()> {
        if self.is_open() {
            if self.own_focus {
                self.custom_element.remove_event_listener_with_callback(
                    "blur",
                    self.blurhandler
                        .borrow()
                        .as_ref()
                        .unwrap()
                        .as_ref()
                        .unchecked_ref(),
                )?;

                *self.blurhandler.borrow_mut() = None;
            }

            global::body().remove_child(&self.custom_element)?;
            if let Some(blur) = &self.on_blur {
                blur.emit(());
            }

            let target = self.target.borrow_mut().take().unwrap();
            let event = web_sys::CustomEvent::new("-perspective-close-expression")?;
            target.class_list().remove_1("modal-target").unwrap();
            if get_theme(&target).is_some() {
                self.custom_element.remove_attribute("theme")?;
            }

            target.dispatch_event(&event)?;
        }

        Ok(())
    }

    /// Remove from document and cleanup.
    pub fn destroy(self) -> ApiResult<()> {
        self.hide()?;
        self.root.borrow_mut().take().unwrap().destroy();
        Ok(())
    }
}

fn get_theme(elem: &HtmlElement) -> Option<String> {
    let styles = global::window().get_computed_style(elem).unwrap().unwrap();
    styles
        .get_property_value("--theme-name")
        .ok()
        .and_then(|x| {
            let trimmed = x.trim();
            if !trimmed.is_empty() {
                Some(trimmed[1..trimmed.len() - 1].to_owned())
            } else {
                None
            }
        })
}
