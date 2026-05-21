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
use crate::components::export_dropdown::ExportDropDownMenu;
use crate::components::portal::PortalModal;
use crate::components::style::StyleProvider;
use crate::config::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
use crate::tasks::*;
use crate::utils::*;
use crate::*;

type TargetState = Rc<RefCell<Option<HtmlElement>>>;

#[derive(Properties, PartialEq)]
struct ExportDropDownWrapperProps {
    renderer: Renderer,
    session: Session,
    callback: Callback<ExportFile>,
    target: TargetState,
    custom_element: HtmlElement,
    #[prop_or_default]
    theme: String,
}

enum ExportDropDownWrapperMsg {
    Open,
    Close,
}

struct ExportDropDownWrapper {
    target: Option<HtmlElement>,
}

impl Component for ExportDropDownWrapper {
    type Message = ExportDropDownWrapperMsg;
    type Properties = ExportDropDownWrapperProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self { target: None }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ExportDropDownWrapperMsg::Open => {
                self.target = ctx.props().target.borrow().clone();
                true
            },
            ExportDropDownWrapperMsg::Close => {
                self.target = None;
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let on_close = ctx.link().callback(|_| ExportDropDownWrapperMsg::Close);
        html! {
            <StyleProvider root={ctx.props().custom_element.clone()}>
                <PortalModal
                    tag_name="perspective-export-menu"
                    target={self.target.clone()}
                    own_focus=true
                    {on_close}
                    theme={ctx.props().theme.clone()}
                >
                    <ExportDropDownMenu
                        renderer={ctx.props().renderer.clone()}
                        session={ctx.props().session.clone()}
                        callback={ctx.props().callback.clone()}
                    />
                </PortalModal>
            </StyleProvider>
        }
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct ExportDropDownMenuElement {
    elem: HtmlElement,
    target: TargetState,
    root: Rc<RefCell<Option<AppHandle<ExportDropDownWrapper>>>>,
}

impl CustomElementMetadata for ExportDropDownMenuElement {
    const CUSTOM_ELEMENT_NAME: &'static str = "perspective-export-menu";
}

#[wasm_bindgen]
impl ExportDropDownMenuElement {
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
            root.send_message(ExportDropDownWrapperMsg::Open);
        }
    }

    pub fn hide(&self) -> ApiResult<()> {
        if let Some(root) = self.root.borrow().as_ref() {
            root.send_message(ExportDropDownWrapperMsg::Close);
        }
        Ok(())
    }

    pub fn __set_model(&self, parent: &PerspectiveViewerElement) {
        self.set_config_model(&parent.session, &parent.renderer, &parent.presentation)
    }

    pub fn connected_callback(&self) {}
}

impl ExportDropDownMenuElement {
    pub fn new_from_model(
        session: &Session,
        renderer: &Renderer,
        presentation: &Presentation,
    ) -> Self {
        let dropdown = global::document()
            .create_element("perspective-export-menu")
            .unwrap()
            .unchecked_into::<HtmlElement>();

        let elem = Self::new(dropdown);
        elem.set_config_model(session, renderer, presentation);
        elem
    }

    fn set_config_model(
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
                if !x.name.is_empty() {
                    clone!(target, root, session, renderer, presentation);
                    spawn_local(async move {
                        let val =
                            export_method_to_blob(&session, &renderer, &presentation, x.method)
                                .await
                                .unwrap();
                        let is_chart = renderer.is_chart();
                        download(&x.as_filename(is_chart), &val).unwrap();
                        *target.borrow_mut() = None;
                        if let Some(root) = root.borrow().as_ref() {
                            root.send_message(ExportDropDownWrapperMsg::Close);
                        }
                    })
                }
            }
        });

        let renderer = renderer.clone();
        let session = session.clone();
        let init = ShadowRootInit::new(ShadowRootMode::Open);
        let shadow_root = self
            .elem
            .attach_shadow(&init)
            .unwrap()
            .unchecked_into::<Element>();

        let props = yew::props!(ExportDropDownWrapperProps {
            renderer,
            session,
            callback,
            target: self.target.clone(),
            custom_element: self.elem.clone(),
        });

        let handle = yew::Renderer::with_root_and_props(shadow_root, props).render();
        *self.root.borrow_mut() = Some(handle);
    }
}
