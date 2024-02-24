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

use perspective::utils::global;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::*;

use crate::components::function_dropdown::*;
use crate::custom_elements::modal::*;
use crate::exprtk::{CompletionItemSuggestion, COMPLETIONS};
use crate::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct FunctionDropDownElement {
    modal: ModalElement<FunctionDropDown>,
    target: Rc<RefCell<Option<HtmlElement>>>,
}

impl PartialEq for FunctionDropDownElement {
    fn eq(&self, _other: &Self) -> bool {
        true
    }
}

impl ImplicitClone for FunctionDropDownElement {}

impl FunctionDropDownElement {
    pub fn reautocomplete(&self) {
        ApiFuture::spawn(
            self.modal
                .clone()
                .open(self.target.borrow().clone().unwrap(), None),
        );
    }

    pub fn autocomplete(
        &self,
        input: String,
        target: HtmlElement,
        callback: Callback<CompletionItemSuggestion>,
    ) -> ApiResult<()> {
        let values = filter_values(&input);
        if values.is_empty() {
            self.modal.hide()?;
        } else {
            self.modal.send_message_batch(vec![
                FunctionDropDownMsg::SetCallback(callback),
                FunctionDropDownMsg::SetValues(values),
            ]);

            ApiFuture::spawn(self.modal.clone().open(target, None));
        }

        Ok(())
    }

    pub fn item_select(&self) {
        self.modal.send_message(FunctionDropDownMsg::ItemSelect);
    }

    pub fn item_down(&self) {
        self.modal.send_message(FunctionDropDownMsg::ItemDown);
    }

    pub fn item_up(&self) {
        self.modal.send_message(FunctionDropDownMsg::ItemUp);
    }

    pub fn hide(&self) -> ApiResult<()> {
        self.modal.hide()
    }

    pub fn connected_callback(&self) {}
}

impl Default for FunctionDropDownElement {
    fn default() -> Self {
        let dropdown = global::document()
            .create_element("perspective-dropdown")
            .unwrap()
            .unchecked_into::<HtmlElement>();

        let props = props!(FunctionDropDownProps {});
        let modal = ModalElement::new(dropdown, props, false, None);
        Self {
            modal,
            target: Default::default(),
        }
    }
}

fn filter_values(input: &str) -> Vec<CompletionItemSuggestion> {
    let input = input.to_lowercase();
    COMPLETIONS.with(|x| {
        x.iter()
            .filter(|x| x.label.to_lowercase().starts_with(&input))
            .cloned()
            .collect::<Vec<_>>()
    })
}
