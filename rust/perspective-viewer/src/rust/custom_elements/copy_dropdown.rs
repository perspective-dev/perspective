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

use ::perspective::utils::{global, *};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use web_sys::*;
use yew::*;

use super::modal::*;
use super::viewer::PerspectiveViewerElement;
use crate::components::copy_dropdown::{CopyDropDownMenu, CopyDropDownMenuProps};
use crate::js::*;
use crate::model::*;
use crate::utils::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct CopyDropDownMenuElement {
    elem: HtmlElement,
    modal: Rc<RefCell<Option<ModalElement<CopyDropDownMenu>>>>,
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
    #[allow(clippy::not_unsafe_ptr_arg_deref)]
    pub fn unsafe_set_model(&self, ptr: *const PerspectiveViewerElement) {
        let model = unsafe { ptr.as_ref().unwrap() };
        self.set_model(model);
    }

    pub fn connected_callback(&self) {}
}

impl CopyDropDownMenuElement {
    pub fn new_from_model<A: GetViewerConfigModel>(model: &A) -> Self {
        let dropdown = global::document()
            .create_element("perspective-copy-menu")
            .unwrap()
            .unchecked_into::<HtmlElement>();

        let elem = Self::new(dropdown);
        elem.set_model(model);
        elem
    }

    pub fn set_model<A: GetViewerConfigModel>(&self, model: &A) {
        let callback = Callback::from({
            let model = model.cloned();
            let modal_rc = self.modal.clone();
            move |x: ExportMethod| {
                let js_task = model.export_method_to_jsvalue(x);
                let copy_task = copy_to_clipboard(js_task, x.mimetype());
                let modal = modal_rc.borrow().clone().unwrap();
                spawn_local(async move {
                    let result = copy_task.await;
                    crate::js_log_maybe!({
                        result?;
                        modal.hide()?;
                    })
                })
            }
        });

        let renderer = model.renderer().clone();
        let props = props!(CopyDropDownMenuProps { renderer, callback });
        let modal = ModalElement::new(self.elem.clone(), props, true, None);
        *self.modal.borrow_mut() = Some(modal);
    }
}
