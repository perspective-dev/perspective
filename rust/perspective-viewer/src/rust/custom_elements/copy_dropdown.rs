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

use std::cell::RefCell;
use std::rc::Rc;

use perspective_js::utils::global;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use web_sys::*;
use yew::prelude::*;

use super::viewer::PerspectiveViewerElement;
use crate::components::copy_dropdown::CopyDropDownMenu;
use crate::components::portal::PortalModal;
use crate::components::style::StyleProvider;
use crate::config::*;
use crate::js::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::Session;
use crate::tasks::*;
use crate::utils::*;
use crate::*;

type TargetState = Rc<RefCell<Option<HtmlElement>>>;

#[derive(Properties, PartialEq)]
struct CopyDropDownWrapperProps {
    renderer: Renderer,
    callback: Callback<ExportFile>,
    target: TargetState,
    custom_element: HtmlElement,
    #[prop_or_default]
    theme: String,
}

enum CopyDropDownWrapperMsg {
    Open,
    Close,
}

struct CopyDropDownWrapper {
    target: Option<HtmlElement>,
}

impl Component for CopyDropDownWrapper {
    type Message = CopyDropDownWrapperMsg;
    type Properties = CopyDropDownWrapperProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self { target: None }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            CopyDropDownWrapperMsg::Open => {
                self.target = ctx.props().target.borrow().clone();
                true
            },
            CopyDropDownWrapperMsg::Close => {
                self.target = None;
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|_| CopyDropDownWrapperMsg::Close);
        html! {
            <StyleProvider root={ctx.props().custom_element.clone()}>
                <PortalModal
                    tag_name="perspective-copy-menu"
                    target={self.target.clone()}
                    own_focus=true
                    {on_close}
                    theme={ctx.props().theme.clone()}
                >
                    <CopyDropDownMenu
                        renderer={ctx.props().renderer.clone()}
                        callback={ctx.props().callback.clone()}
                    />
                </PortalModal>
            </StyleProvider>
        }
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct CopyDropDownMenuElement {
    elem: HtmlElement,
    target: TargetState,
    root: Rc<RefCell<Option<AppHandle<CopyDropDownWrapper>>>>,
}

impl CustomElementMetadata for CopyDropDownMenuElement {
    const CUSTOM_ELEMENT_NAME: &'static str = "perspective-copy-menu";
}

#[wasm_bindgen]
impl CopyDropDownMenuElement {
    #[wasm_bindgen(constructor)]
    pub fn new(elem: HtmlElement) -> Self {
        Self {
            elem,
            target: Default::default(),
            root: Default::default(),
        }
    }

    pub fn open(&self, target: HtmlElement) {
        *self.target.borrow_mut() = Some(target);
        if let Some(root) = self.root.borrow().as_ref() {
            root.send_message(CopyDropDownWrapperMsg::Open);
        }
    }

    pub fn hide(&self) -> ApiResult<()> {
        if let Some(root) = self.root.borrow().as_ref() {
            root.send_message(CopyDropDownWrapperMsg::Close);
        }
        Ok(())
    }

    pub fn __set_model(&self, parent: &PerspectiveViewerElement) {
        self.set_config_model(&parent.session, &parent.renderer, &parent.presentation)
    }

    pub fn connected_callback(&self) {}
}

impl CopyDropDownMenuElement {
    pub fn new_from_model(
        session: &Session,
        renderer: &Renderer,
        presentation: &Presentation,
    ) -> Self {
        let dropdown = global::document()
            .create_element("perspective-copy-menu")
            .unwrap()
            .unchecked_into::<HtmlElement>();

        let elem = Self::new(dropdown);
        elem.set_config_model(session, renderer, presentation);
        elem
    }

    pub fn set_config_model(
        &self,
        session: &Session,
        renderer: &Renderer,
        presentation: &Presentation,
    ) {
        let callback = Callback::from({
            let session = session.clone();
            let renderer = renderer.clone();
            let presentation = presentation.clone();
            let target = self.target.clone();
            let root = self.root.clone();
            move |x: ExportFile| {
                let session = session.clone();
                let renderer = renderer.clone();
                let presentation = presentation.clone();
                let target = target.clone();
                let root = root.clone();
                spawn_local(async move {
                    let mime = x.method.mimetype(x.is_chart);
                    let task = export_method_to_blob(&session, &renderer, &presentation, x.method);
                    let result = copy_to_clipboard(task, mime).await;
                    let r = (|| -> ApiResult<()> {
                        result?;
                        *target.borrow_mut() = None;
                        if let Some(root) = root.borrow().as_ref() {
                            root.send_message(CopyDropDownWrapperMsg::Close);
                        }
                        Ok(())
                    })();
                    if let Err(e) = r {
                        web_sys::console::warn_1(&e.into());
                    }
                })
            }
        });

        let renderer = renderer.clone();
        let init = ShadowRootInit::new(ShadowRootMode::Open);
        let shadow_root = self
            .elem
            .attach_shadow(&init)
            .unwrap()
            .unchecked_into::<Element>();

        let props = yew::props!(CopyDropDownWrapperProps {
            renderer,
            callback,
            target: self.target.clone(),
            custom_element: self.elem.clone()
        });

        let handle = yew::Renderer::with_root_and_props(shadow_root, props).render();
        *self.root.borrow_mut() = Some(handle);
    }
}
