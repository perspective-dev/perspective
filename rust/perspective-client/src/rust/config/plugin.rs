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

use web_sys::{HtmlInputElement, InputEvent};
use yew::{function_component, html, Callback, Properties, TargetCast};

use crate::components::form::optional_field::OptionalField;

#[derive(Properties, Debug, PartialEq, Clone)]
pub struct NumberFieldProps {
    pub label: String,
    pub current_value: Option<f64>,
    pub default: f64,
    pub on_change: Callback<Option<f64>>,

    #[prop_or_default]
    pub disabled: bool,

    #[prop_or_default]
    pub min: Option<f64>,

    #[prop_or_default]
    pub max: Option<f64>,

    #[prop_or_default]
    pub step: Option<f64>,
}

#[function_component(NumberField)]
pub fn number_field(props: &NumberFieldProps) -> yew::Html {
    let parse_number_input = |event: InputEvent| {
        Some(
            event
                .target_unchecked_into::<HtmlInputElement>()
                .value_as_number(),
        )
    };

    let number_input = html! {
        <input
            type="number"
            class="parameter"
            min={props.min.map(|val| val.to_string())}
            max={props.max.map(|val| val.to_string())}
            step={props.step.map(|val| val.to_string())}
            value={props.current_value.unwrap_or(props.default).to_string()}
            oninput={props.on_change.reform(parse_number_input)}
        />
    };

    html! {
        <div class="row">
            <OptionalField
                label={props.label.clone()}
                on_check={props.on_change.reform(|_| None)}
                checked={props.current_value.map(|val| val != props.default).unwrap_or_default()}
                disabled={props.disabled}
            >
                { number_input }
            </OptionalField>
        </div>
    }
}
