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

use serde_json::Value;
use wasm_bindgen::JsCast;
use web_sys::{HtmlInputElement, MouseEvent};
use yew::{Callback, Html, Properties, function_component, html, use_callback};

use super::field_update::emit;
use crate::config::ColumnConfigFieldUpdate;
use crate::ui::OptionalField;

#[derive(Properties, PartialEq)]
pub struct BoolFieldProps {
    pub field_key: String,
    pub default: bool,
    pub current: Option<bool>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
}

#[function_component]
pub fn BoolField(props: &BoolFieldProps) -> Html {
    let current = props.current.unwrap_or(props.default);
    let oninput = use_callback(
        (
            props.field_key.clone(),
            props.default,
            props.on_change.clone(),
        ),
        |e: yew::events::InputEvent, (key, default, on_change)| {
            let target: HtmlInputElement = e.target().unwrap().unchecked_into();
            let next = target.checked();
            if next == *default {
                emit(on_change, key, None);
            } else {
                emit(on_change, key, Some(Value::Bool(next)));
            }
        },
    );

    let checked = current != props.default;
    let on_reset = use_callback(
        (props.field_key.clone(), props.on_change.clone()),
        |_: MouseEvent, (key, on_change)| emit(on_change, key, None),
    );

    html! {
        <div class="row">
            <OptionalField label={props.field_key.clone()} on_check={on_reset} {checked}>
                <div class="bool-field-container">
                    <input
                        type="checkbox"
                        class="alternate"
                        id={format!("{}-checkbox", props.field_key)}
                        checked={current}
                        {oninput}
                    />
                    <label
                        for={format!("{}-checkbox", props.field_key)}
                        class={if current { "bool-field-desc enabled" } else { "bool-field-desc disabled" }}
                    />
                </div>
            </OptionalField>
        </div>
    }
}
