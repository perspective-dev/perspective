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
use yew::*;

use super::viewer::PerspectiveViewerElement;
use crate::components::export_dropdown::*;
use crate::custom_elements::modal::*;
use crate::tasks::*;
use crate::utils::*;
use crate::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct ExportDropDownMenuElement {
    elem: HtmlElement,
    modal: Rc<RefCell<Option<ModalElement<ExportDropDownMenu>>>>,
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
            modal: Default::default(),
        }
    }

    pub fn open(&self, target: HtmlElement) {
        if let Some(x) = &*self.modal.borrow() {
            ApiFuture::spawn(x.clone().open(target, None));
        }
    }

    pub fn hide(&self) -> ApiResult<()> {
        let borrowed = self.modal.borrow();
        borrowed.as_ref().into_apierror()?.hide()
    }

    /// Internal Only.
    ///
    /// Set this custom element model's raw pointer.
    pub fn __set_model(&self, parent: &PerspectiveViewerElement) {
        self.set_config_model(parent)
    }

    pub fn connected_callback(&self) {}
}

impl ExportDropDownMenuElement {
    pub fn new_from_model<A>(model: &A) -> Self
    where
        A: GetViewerConfigModel + StateProvider,
        <A as StateProvider>::State: HasPresentation + HasRenderer + HasSession,
    {
        let dropdown = global::document()
            .create_element("perspective-export-menu")
            .unwrap()
            .unchecked_into::<HtmlElement>();

        let elem = Self::new(dropdown);
        elem.set_config_model(model);
        elem
    }

    fn set_config_model<A>(&self, model: &A)
    where
        A: GetViewerConfigModel + StateProvider,
        <A as StateProvider>::State: HasPresentation + HasRenderer + HasSession,
    {
        let callback = Callback::from({
            let model = model.clone_state();
            let modal_rc = self.modal.clone();
            move |x: ExportFile| {
                if !x.name.is_empty() {
                    clone!(modal_rc, model);
                    spawn_local(async move {
                        let val = model.export_method_to_blob(x.method).await.unwrap();
                        let is_chart = model.renderer().is_chart();
                        download(&x.as_filename(is_chart), &val).unwrap();
                        modal_rc.borrow().clone().unwrap().hide().unwrap();
                    })
                }
            }
        });

        let renderer = model.renderer().clone();
        let session = model.session().clone();
        let props = props!(ExportDropDownMenuProps {
            renderer,
            session,
            callback,
            root: self.elem.clone()
        });

        let modal = ModalElement::new(self.elem.clone(), props, true, None);
        *self.modal.borrow_mut() = Some(modal);
    }
}
