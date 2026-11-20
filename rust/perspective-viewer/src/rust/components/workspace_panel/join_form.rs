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

use perspective_client::JoinType;
use wasm_bindgen::JsCast;
use web_sys::{HtmlInputElement, HtmlSelectElement};
use yew::prelude::*;

use crate::tasks::JoinSpec;

#[derive(Clone, Copy, PartialEq)]
pub enum JoinField {
    Left,
    Right,
    On,
    RightOn,
    Type,
    Name,
}

/// An in-progress join of two of one `Client`'s `Table`s.
pub struct JoinForm {
    pub client: String,
    pub left: String,
    pub right: String,
    pub on: String,
    pub right_on: String,
    pub join_type: JoinType,
    pub name: String,
    pub columns: Vec<String>,
    pub error: Option<String>,
    pub submitting: bool,
}

impl JoinForm {
    /// A form joining the first of `tables` with the second, or with itself.
    pub fn new(client: String, tables: &[String]) -> Self {
        let left = tables.first().cloned().unwrap_or_default();
        let right = tables.get(1).cloned().unwrap_or_else(|| left.clone());
        Self {
            client,
            left,
            right,
            on: String::new(),
            right_on: String::new(),
            join_type: JoinType::Inner,
            name: String::new(),
            columns: vec![],
            error: None,
            submitting: false,
        }
    }

    /// Whether both `Table`s and the join column are chosen.
    pub fn is_valid(&self) -> bool {
        !self.left.is_empty() && !self.right.is_empty() && !self.on.is_empty()
    }

    /// Set `field` to `value`, returning the new left `Table` whose columns
    /// must be fetched.
    pub fn input(&mut self, field: JoinField, value: String) -> Option<String> {
        self.error = None;
        match field {
            JoinField::Left => {
                self.left = value.clone();
                self.on = String::new();
                self.columns = vec![];
                return Some(value);
            },
            JoinField::Right => self.right = value,
            JoinField::On => self.on = value,
            JoinField::RightOn => self.right_on = value,
            JoinField::Name => self.name = value,
            JoinField::Type => {
                self.join_type = match value.as_str() {
                    "left" => JoinType::Left,
                    "outer" => JoinType::Outer,
                    _ => JoinType::Inner,
                }
            },
        }

        None
    }

    /// Take `columns` if they belong to the current left `Table`, returning
    /// whether they were taken.
    pub fn set_columns(&mut self, table: &str, columns: Vec<String>) -> bool {
        if self.left != table {
            return false;
        }

        self.on = columns.first().cloned().unwrap_or_default();
        self.columns = columns;
        true
    }

    /// Mark the form as submitting and build its [`JoinSpec`].
    pub fn submit(&mut self) -> JoinSpec {
        self.submitting = true;
        self.error = None;
        let non_empty = |x: &str| (!x.trim().is_empty()).then(|| x.trim().to_owned());
        JoinSpec {
            left: self.left.clone(),
            right: self.right.clone(),
            on: self.on.clone(),
            right_on: non_empty(&self.right_on),
            join_type: Some(self.join_type),
            name: non_empty(&self.name),
        }
    }

    /// Return the form to editing with a submission's `error`.
    pub fn fail(&mut self, error: String) {
        self.submitting = false;
        self.error = Some(error);
    }
}

pub fn join_type_name(join_type: JoinType) -> &'static str {
    match join_type {
        JoinType::Inner => "inner",
        JoinType::Left => "left",
        JoinType::Outer => "outer",
    }
}

/// The value of the `<select>` or `<input>` that fired `event`.
pub fn input_value(event: &Event) -> String {
    let target = event.target();
    target
        .as_ref()
        .and_then(|x| x.dyn_ref::<HtmlSelectElement>())
        .map(|x| x.value())
        .or_else(|| {
            target
                .as_ref()
                .and_then(|x| x.dyn_ref::<HtmlInputElement>())
                .map(|x| x.value())
        })
        .unwrap_or_default()
}
