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

//! Schema-driven generic widgets for the Style tab. Each widget renders a
//! single primitive [`crate::config::ControlSpec`] variant and emits a
//! [`crate::config::ColumnConfigFieldUpdate`] on change. Built on top of
//! the existing form components ([`Select`], [`OptionalField`],
//! [`ColorSelector`]) so that they visually match the rich Yew widgets in
//! the same sidebar.

use std::rc::Rc;

use itertools::Itertools;
use serde_json::Value;
use wasm_bindgen::JsCast;
use web_sys::HtmlInputElement;
use yew::{Callback, Html, Properties, function_component, html, use_callback};

use crate::components::containers::select::{Select, SelectItem};
use crate::components::form::color_range_selector::ColorRangeSelector;
use crate::components::form::color_selector::ColorSelector;
use crate::components::form::number_field::NumberField;
use crate::components::form::optional_field::OptionalField;
use crate::config::{ColumnConfigFieldUpdate, EnumVariant};

fn emit(on_change: &Callback<ColumnConfigFieldUpdate>, key: &str, value: Option<Value>) {
    let mut map = serde_json::Map::new();
    if let Some(v) = value {
        map.insert(key.to_owned(), v);
    }

    on_change.emit(ColumnConfigFieldUpdate {
        keys: vec![key.to_owned()],
        value: map,
    });
}

#[derive(Properties, PartialEq)]
pub struct EnumFieldProps {
    pub field_key: String,
    pub label: String,
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

    let on_select = {
        let key = props.field_key.clone();
        let default = props.default.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |value: String| {
            if value == default {
                emit(&on_change, &key, None);
            } else {
                emit(&on_change, &key, Some(Value::String(value)));
            }
        })
    };

    let on_reset = {
        let key = props.field_key.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |_| emit(&on_change, &key, None))
    };

    html! {
        <div class="row">
            <OptionalField label={props.label.clone()} on_check={on_reset} {checked}>
                <Select<String> {values} {selected} {on_select} />
            </OptionalField>
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct BoolFieldProps {
    pub field_key: String,
    pub label: String,
    pub default: bool,
    pub current: Option<bool>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
}

#[function_component]
pub fn BoolField(props: &BoolFieldProps) -> Html {
    let current = props.current.unwrap_or(props.default);
    let oninput = {
        let key = props.field_key.clone();
        let default = props.default;
        let on_change = props.on_change.clone();
        use_callback((), move |e: yew::events::InputEvent, _| {
            let target: HtmlInputElement = e.target().unwrap().unchecked_into();
            let next = target.checked();
            if next == default {
                emit(&on_change, &key, None);
            } else {
                emit(&on_change, &key, Some(Value::Bool(next)));
            }
        })
    };

    html! {
        <div class="row">
            <label id={format!("{}-label", props.label)} />
            <input
                type="checkbox"
                id={format!("{}-checkbox", props.field_key)}
                checked={current}
                {oninput}
            />
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct NumberFieldPrimitiveProps {
    pub field_key: String,
    pub label: String,
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
    let on_change_inner = {
        let key = props.field_key.clone();
        let default = props.default;
        let on_change = props.on_change.clone();
        let include = props.include;
        Callback::from(move |value: Option<f64>| match value {
            Some(v) if include.unwrap_or_default() || v != default => emit(
                &on_change,
                &key,
                Some(
                    serde_json::Number::from_f64(v)
                        .map(Value::Number)
                        .unwrap_or(Value::Null),
                ),
            ),
            _ => emit(&on_change, &key, None),
        })
    };

    html! {
        <NumberField
            label={props.label.clone()}
            current_value={props.current}
            default={props.default}
            min={props.min}
            max={props.max}
            step={props.step}
            on_change={on_change_inner}
        />
    }
}

#[derive(Properties, PartialEq)]
pub struct ColorRangeFieldProps {
    pub field_key_pos: String,
    pub field_key_neg: String,
    pub label: String,
    pub default_pos: String,
    pub default_neg: String,
    pub current_pos: Option<String>,
    pub current_neg: Option<String>,
    pub is_gradient: bool,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
}

#[function_component]
pub fn ColorRangeField(props: &ColorRangeFieldProps) -> Html {
    let pos = props
        .current_pos
        .clone()
        .unwrap_or_else(|| props.default_pos.clone());
    let neg = props
        .current_neg
        .clone()
        .unwrap_or_else(|| props.default_neg.clone());
    let is_modified = (props.current_pos.is_some()
        && props.current_pos.as_deref() != Some(props.default_pos.as_str()))
        || (props.current_neg.is_some()
            && props.current_neg.as_deref() != Some(props.default_neg.as_str()));

    // Multi-key emit: write whichever side(s) differ from default,
    // clear the others. Mirrors the apply semantics of
    // `ColumnConfigFieldUpdate { keys, value }` with both keys owned.
    let emit_pair = {
        let key_pos = props.field_key_pos.clone();
        let key_neg = props.field_key_neg.clone();
        let default_pos = props.default_pos.clone();
        let default_neg = props.default_neg.clone();
        let on_change = props.on_change.clone();
        move |new_pos: String, new_neg: String| {
            let mut value = serde_json::Map::new();
            if new_pos != default_pos {
                value.insert(key_pos.clone(), Value::String(new_pos));
            }
            if new_neg != default_neg {
                value.insert(key_neg.clone(), Value::String(new_neg));
            }
            on_change.emit(ColumnConfigFieldUpdate {
                keys: vec![key_pos.clone(), key_neg.clone()],
                value,
            });
        }
    };

    let on_pos_color = {
        let neg = neg.clone();
        let emit_pair = emit_pair.clone();
        Callback::from(move |new_pos: String| emit_pair(new_pos, neg.clone()))
    };

    let on_neg_color = {
        let pos = pos.clone();
        let emit_pair = emit_pair.clone();
        Callback::from(move |new_neg: String| emit_pair(pos.clone(), new_neg))
    };

    let on_reset = {
        let key_pos = props.field_key_pos.clone();
        let key_neg = props.field_key_neg.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |_| {
            on_change.emit(ColumnConfigFieldUpdate {
                keys: vec![key_pos.clone(), key_neg.clone()],
                value: serde_json::Map::new(),
            });
        })
    };

    html! {
        <div class="row">
            <ColorRangeSelector
                id={props.label.clone()}
                pos_color={pos}
                neg_color={neg}
                is_gradient={props.is_gradient}
                {on_pos_color}
                {on_neg_color}
                {on_reset}
                {is_modified}
            />
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct ColorFieldProps {
    pub field_key: String,
    pub label: String,
    pub default: String,
    pub current: Option<String>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
}

#[function_component]
pub fn ColorField(props: &ColorFieldProps) -> Html {
    let color = props
        .current
        .clone()
        .unwrap_or_else(|| props.default.clone());
    let is_modified =
        props.current.as_deref() != Some(props.default.as_str()) && props.current.is_some();

    let on_color = {
        let key = props.field_key.clone();
        let default = props.default.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |value: String| {
            if value == default {
                emit(&on_change, &key, None);
            } else {
                emit(&on_change, &key, Some(Value::String(value)));
            }
        })
    };

    let on_reset = {
        let key = props.field_key.clone();
        let on_change = props.on_change.clone();
        Callback::from(move |_| emit(&on_change, &key, None))
    };

    html! {
        <div class="row">
            <ColorSelector
                {color}
                {on_color}
                {on_reset}
                {is_modified}
                title={Some(format!("{}-label", props.label))}
            />
        </div>
    }
}
