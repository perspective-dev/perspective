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

use std::collections::HashSet;

use perspective::json;
use perspective::utils::global;
use perspective_client::clone;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::{props, Callback};

use crate::components::column_dropdown::*;
use crate::components::column_selector::InPlaceColumn;
use crate::config::Expression;
use crate::custom_elements::modal::*;
use crate::session::Session;
use crate::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct ColumnDropDownElement {
    modal: ModalElement<ColumnDropDown>,
    session: Session,
}

impl ImplicitClone for ColumnDropDownElement {}

impl ColumnDropDownElement {
    pub fn new(session: Session) -> Self {
        let dropdown = global::document()
            .create_element("perspective-dropdown")
            .unwrap()
            .unchecked_into::<HtmlElement>();

        let props = props!(ColumnDropDownProps {});
        let modal = ModalElement::new(dropdown, props, false, None);
        Self { modal, session }
    }

    pub fn autocomplete(
        &self,
        target: HtmlInputElement,
        exclude: HashSet<String>,
        callback: Callback<InPlaceColumn>,
    ) -> Option<()> {
        let input = target.value();
        let metadata = self.session.metadata();
        let mut values: Vec<InPlaceColumn> = vec![];
        let small_input = input.to_lowercase();
        for col in metadata.get_table_columns()? {
            if !exclude.contains(col) && col.to_lowercase().contains(&small_input) {
                values.push(InPlaceColumn::Column(col.to_owned()));
            }
        }

        for col in self.session.metadata().get_expression_columns() {
            if !exclude.contains(col) && col.to_lowercase().contains(&small_input) {
                values.push(InPlaceColumn::Column(col.to_owned()));
            }
        }

        clone!(self.modal, self.session);
        ApiFuture::spawn(async move {
            if !exclude.contains(&input) {
                let is_expr = session.validate_expr(&input).await?.is_none();

                if is_expr {
                    values.push(InPlaceColumn::Expression(Expression::new(
                        None,
                        input.into(),
                    )));
                }
            }

            let classes = modal.custom_element.class_list();
            let no_results = json!(["no-results"]);
            if values.is_empty() {
                classes.add(&no_results).unwrap();
            } else {
                classes.remove(&no_results).unwrap();
            }

            modal.send_message_batch(vec![
                ColumnDropDownMsg::SetCallback(callback),
                ColumnDropDownMsg::SetValues(values, target.get_bounding_client_rect().width()),
            ]);

            modal.open(target.unchecked_into(), None).await
        });

        Some(())
    }

    pub fn item_select(&self) {
        self.modal.send_message(ColumnDropDownMsg::ItemSelect);
    }

    pub fn item_down(&self) {
        self.modal.send_message(ColumnDropDownMsg::ItemDown);
    }

    pub fn item_up(&self) {
        self.modal.send_message(ColumnDropDownMsg::ItemUp);
    }

    pub fn hide(&self) -> ApiResult<()> {
        self.modal.hide()
    }

    pub fn connected_callback(&self) {}
}
