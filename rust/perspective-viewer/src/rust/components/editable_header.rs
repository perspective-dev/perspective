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

use std::rc::Rc;

use itertools::Itertools;
use web_sys::{FocusEvent, HtmlInputElement, KeyboardEvent};
use yew::prelude::*;

use super::type_icon::TypeIconType;
use crate::components::type_icon::TypeIcon;
use crate::session::SessionMetadataRc;

#[derive(Clone, PartialEq, Properties)]
pub struct EditableHeaderProps {
    pub icon_type: Option<TypeIconType>,
    pub on_change: Callback<(Option<String>, bool)>,
    pub editable: bool,

    /// The owner's draft.
    pub value: Option<String>,

    /// The saved name the draft is measured against.
    pub initial_value: Option<String>,
    pub placeholder: Rc<String>,

    #[prop_or_default]
    pub update_on_input: bool,

    /// Session metadata snapshot — threaded from `SessionProps`.
    pub metadata: SessionMetadataRc,
}

impl EditableHeaderProps {
    fn split_placeholder(&self) -> String {
        let split = self
            .placeholder
            .split_once('\n')
            .map(|(a, _)| a)
            .unwrap_or(&*self.placeholder);

        match split.char_indices().nth(25) {
            None => split.to_string(),
            Some((idx, _)) => split[..idx].to_owned(),
        }
    }

    fn is_valid(&self, value: &Option<String>, placeholder: &str) -> bool {
        let Some(value) = value else {
            return true;
        };

        if value == placeholder || Some(value) == self.initial_value.as_ref() {
            return true;
        }

        let metadata = &self.metadata;
        let Some(table_columns) = metadata.get_table_columns() else {
            return true;
        };

        !table_columns
            .iter()
            .chain(metadata.get_expression_columns())
            .chain(metadata.get_window_columns())
            .contains(value)
    }
}

#[function_component(EditableHeader)]
pub fn editable_header(props: &EditableHeaderProps) -> Html {
    let noderef = use_node_ref();
    let placeholder = props.split_placeholder();
    let edited = props.value != props.initial_value;
    let valid = props.is_valid(&props.value, &placeholder);
    let mut classes = classes!("sidebar_header_contents");
    if props.editable {
        classes.push("editable");
    }

    if !valid {
        classes.push("invalid");
    }

    if edited {
        classes.push("edited");
    }

    let on_value = {
        let props = props.clone();
        let placeholder = placeholder.clone();
        Callback::from(move |value: String| {
            let value = (!value.is_empty()).then_some(value);
            let valid = props.is_valid(&value, &placeholder);
            props.on_change.emit((value, valid));
        })
    };

    let onkeyup =
        on_value.reform(|e: KeyboardEvent| e.target_unchecked_into::<HtmlInputElement>().value());
    let onblur =
        on_value.reform(|e: FocusEvent| e.target_unchecked_into::<HtmlInputElement>().value());
    let oninput = {
        let update_on_input = props.update_on_input;
        let on_value = on_value.clone();
        Callback::from(move |e: InputEvent| {
            if update_on_input {
                on_value.emit(e.target_unchecked_into::<HtmlInputElement>().value());
            }
        })
    };

    let onclick = {
        let noderef = noderef.clone();
        Callback::from(move |_: MouseEvent| {
            if let Some(input) = noderef.cast::<HtmlInputElement>() {
                let _ = input.focus();
            }
        })
    };

    html! {
        <div class={classes} {onclick}>
            if let Some(icon) = props.icon_type { <TypeIcon ty={icon} /> }
            <input
                ref={noderef}
                type="search"
                class="sidebar_header_title"
                disabled={!props.editable}
                {onblur}
                {onkeyup}
                {oninput}
                value={props.value.clone()}
                {placeholder}
            />
        </div>
    }
}
