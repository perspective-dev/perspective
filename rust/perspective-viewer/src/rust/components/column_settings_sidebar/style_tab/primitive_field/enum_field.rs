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
use serde_json::Value;
use web_sys::MouseEvent;
use yew::{Callback, Html, Properties, function_component, html, use_callback};

use super::emit;
use crate::config::{ColumnConfigFieldUpdate, EnumVariant};
use crate::ui::{OptionalField, Select, SelectItem};

#[derive(Properties, PartialEq)]
pub struct EnumFieldProps {
    pub field_key: String,
    pub variants: Vec<EnumVariant>,
    pub default: String,
    pub current: Option<String>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
}

#[function_component]
pub fn EnumField(props: &EnumFieldProps) -> Html {
    let selected = props
        .current
        .clone()
        .unwrap_or_else(|| props.default.clone());

    let checked = selected != props.default;
    let values: Rc<Vec<SelectItem<String>>> = Rc::new(
        props
            .variants
            .iter()
            .map(|v| SelectItem::Option(v.value.clone()))
            .collect_vec(),
    );

    let on_select = use_callback(
        (
            props.field_key.clone(),
            props.default.clone(),
            props.on_change.clone(),
        ),
        |value: String, (key, default, on_change)| {
            if value == *default {
                emit(on_change, key, None);
            } else {
                emit(on_change, key, Some(Value::String(value)));
            }
        },
    );

    let on_reset = use_callback(
        (props.field_key.clone(), props.on_change.clone()),
        |_: MouseEvent, (key, on_change)| emit(on_change, key, None),
    );

    html! {
        <div class="row">
            <OptionalField label={props.field_key.clone()} on_check={on_reset} {checked}>
                <Select<String> {values} {selected} {on_select} />
            </OptionalField>
        </div>
    }
}
