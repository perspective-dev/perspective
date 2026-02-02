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
use std::collections::HashSet;
use std::rc::Rc;

use perspective_client::clone;
use perspective_js::utils::global;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::*;

use crate::components::filter_dropdown::*;
use crate::custom_elements::modal::*;
use crate::session::Session;
use crate::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct FilterDropDownElement {
    modal: ModalElement<FilterDropDown>,
    session: Session,
    column: Rc<RefCell<Option<(usize, String)>>>,
    values: Rc<RefCell<Option<Vec<String>>>>,
    target: Rc<RefCell<Option<HtmlElement>>>,
}

impl PartialEq for FilterDropDownElement {
    fn eq(&self, other: &Self) -> bool {
        self.column == other.column && self.values == other.values && self.target == other.target
    }
}

impl ImplicitClone for FilterDropDownElement {}

impl FilterDropDownElement {
    pub fn new(session: Session) -> Self {
        let dropdown = global::document()
            .create_element("perspective-dropdown")
            .unwrap()
            .unchecked_into::<HtmlElement>();

        let column: Rc<RefCell<Option<(usize, String)>>> = Rc::new(RefCell::new(None));
        let props = props!(FilterDropDownProps {});
        let modal = ModalElement::new(dropdown, props, false, None);
        let values = Rc::new(RefCell::new(None));
        Self {
            modal,
            session,
            column,
            values,
            target: Default::default(),
        }
    }

    pub fn reautocomplete(&self) {
        ApiFuture::spawn(
            self.modal
                .clone()
                .open(self.target.borrow().clone().unwrap(), None),
        );
    }

    pub fn autocomplete(
        &self,
        column: (usize, String),
        input: String,
        exclude: HashSet<String>,
        target: HtmlElement,
        callback: Callback<String>,
    ) {
        let current_column = self.column.borrow().clone();
        match current_column {
            Some(filter_col) if filter_col == column => {
                let values = filter_values(&input, &self.values, &exclude);
                if values.len() == 1 && values[0] == input {
                    self.hide().unwrap();
                } else {
                    self.modal.send_message_batch(vec![
                        FilterDropDownMsg::SetCallback(callback),
                        FilterDropDownMsg::SetValues(values),
                    ]);

                    if let Some(x) = self.target.borrow().clone()
                        && !self.modal.is_open()
                    {
                        ApiFuture::spawn(self.modal.clone().open(x, None))
                    }
                }
            },
            _ => {
                ApiFuture::spawn({
                    clone!(
                        self.modal,
                        self.session,
                        self.values,
                        old_column = self.column,
                        old_target = self.target
                    );
                    async move {
                        let all_values = session.get_column_values(column.1.clone()).await?;
                        *values.borrow_mut() = Some(all_values);
                        let filter_values = filter_values(&input, &values, &exclude);
                        if filter_values.len() == 1 && filter_values[0] == input {
                            *old_column.borrow_mut() = Some(column);
                            *old_target.borrow_mut() = Some(target.clone());
                            let filter_values = self::filter_values("", &values, &exclude);
                            modal.send_message_batch(vec![
                                FilterDropDownMsg::SetCallback(callback),
                                FilterDropDownMsg::SetValues(filter_values),
                            ]);

                            modal.hide()
                        } else {
                            *old_column.borrow_mut() = Some(column);
                            *old_target.borrow_mut() = Some(target.clone());
                            modal.send_message_batch(vec![
                                FilterDropDownMsg::SetCallback(callback),
                                FilterDropDownMsg::SetValues(filter_values),
                            ]);

                            modal.open(target, None).await
                        }
                    }
                });
            },
        }
    }

    pub fn item_select(&self) {
        self.modal.send_message(FilterDropDownMsg::ItemSelect);
    }

    pub fn item_down(&self) {
        self.modal.send_message(FilterDropDownMsg::ItemDown);
    }

    pub fn item_up(&self) {
        self.modal.send_message(FilterDropDownMsg::ItemUp);
    }

    pub fn hide(&self) -> ApiResult<()> {
        let result = self.modal.hide();
        drop(self.column.borrow_mut().take());
        result
    }

    pub fn connected_callback(&self) {}
}

fn filter_values(
    input: &str,
    values: &Rc<RefCell<Option<Vec<String>>>>,
    exclude: &HashSet<String>,
) -> Vec<String> {
    let input = input.to_lowercase();
    if let Some(values) = &*values.borrow() {
        values
            .iter()
            .filter(|x| x.to_lowercase().contains(&input) && !exclude.contains(x.as_str()))
            .take(10)
            .cloned()
            .collect::<Vec<String>>()
    } else {
        vec![]
    }
}
