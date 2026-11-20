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
use yew::{Callback, Html, Properties, function_component, html, use_callback};

use super::emit;
use crate::config::ColumnConfigFieldUpdate;
use crate::ui::NumberField;

#[derive(Properties, PartialEq)]
pub struct NumberFieldPrimitiveProps {
    pub field_key: String,
    pub default: f64,
    pub current: Option<f64>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,

    #[prop_or_default]
    pub include: Option<bool>,

    #[prop_or_default]
    pub min: Option<f64>,

    #[prop_or_default]
    pub max: Option<f64>,

    #[prop_or_default]
    pub step: Option<f64>,
}

#[function_component]
pub fn NumberFieldPrimitive(props: &NumberFieldPrimitiveProps) -> Html {
    let on_change_inner = use_callback(
        (
            props.field_key.clone(),
            props.default,
            props.on_change.clone(),
            props.include,
        ),
        |value: Option<f64>, (key, default, on_change, include)| match value {
            Some(v) if include.unwrap_or_default() || v != *default => emit(
                on_change,
                key,
                Some(
                    serde_json::Number::from_f64(v)
                        .map(Value::Number)
                        .unwrap_or(Value::Null),
                ),
            ),
            None if include.unwrap_or_default() => emit(
                on_change,
                key,
                Some(
                    serde_json::Number::from_f64(*default)
                        .map(Value::Number)
                        .unwrap_or(Value::Null),
                ),
            ),
            _ => emit(on_change, key, None),
        },
    );

    html! {
        <NumberField
            label={props.field_key.clone()}
            current_value={props.current}
            default={props.default}
            min={props.min}
            max={props.max}
            step={props.step}
            on_change={on_change_inner}
        />
    }
}
