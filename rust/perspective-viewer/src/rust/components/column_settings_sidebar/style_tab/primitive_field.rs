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
use web_sys::{HtmlInputElement, MouseEvent};
use yew::{Callback, Html, Properties, classes, function_component, html, use_callback};

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

fn emit_color_range(
    on_change: &Callback<ColumnConfigFieldUpdate>,
    key_pos: &str,
    key_neg: &str,
    default_pos: &str,
    default_neg: &str,
    new_pos: &str,
    new_neg: &str,
) {
    let mut value = serde_json::Map::new();
    if new_pos != default_pos {
        value.insert(key_pos.to_owned(), Value::String(new_pos.to_owned()));
    }
    if new_neg != default_neg {
        value.insert(key_neg.to_owned(), Value::String(new_neg.to_owned()));
    }
    on_change.emit(ColumnConfigFieldUpdate {
        keys: vec![key_pos.to_owned(), key_neg.to_owned()],
        value,
    });
}

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
                    <label for={format!("{}-checkbox", props.field_key)} class="bool-field-desc">
                        { if current { "Enabled" } else { "Disabled" } }
                    </label>
                </div>
            </OptionalField>
        </div>
    }
}

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

#[derive(Properties, PartialEq)]
pub struct ColorRangeFieldProps {
    pub field_key_pos: String,
    pub field_key_neg: String,
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
    let on_pos_color = use_callback(
        (
            props.field_key_pos.clone(),
            props.field_key_neg.clone(),
            props.default_pos.clone(),
            props.default_neg.clone(),
            props.on_change.clone(),
            neg.clone(),
        ),
        |new_pos: String, (key_pos, key_neg, default_pos, default_neg, on_change, neg)| {
            emit_color_range(
                on_change,
                key_pos,
                key_neg,
                default_pos,
                default_neg,
                &new_pos,
                neg,
            );
        },
    );

    let on_neg_color = use_callback(
        (
            props.field_key_pos.clone(),
            props.field_key_neg.clone(),
            props.default_pos.clone(),
            props.default_neg.clone(),
            props.on_change.clone(),
            pos.clone(),
        ),
        |new_neg: String, (key_pos, key_neg, default_pos, default_neg, on_change, pos)| {
            emit_color_range(
                on_change,
                key_pos,
                key_neg,
                default_pos,
                default_neg,
                pos,
                &new_neg,
            );
        },
    );

    let on_reset = use_callback(
        (
            props.field_key_pos.clone(),
            props.field_key_neg.clone(),
            props.on_change.clone(),
        ),
        |_: (), (key_pos, key_neg, on_change)| {
            on_change.emit(ColumnConfigFieldUpdate {
                keys: vec![key_pos.clone(), key_neg.clone()],
                value: serde_json::Map::new(),
            });
        },
    );

    html! {
        <div class="row">
            <ColorRangeSelector
                pos_class={classes!(props.field_key_pos.clone())}
                neg_class={classes!(props.field_key_neg.clone())}
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

    let on_color = use_callback(
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
        |_: (), (key, on_change)| emit(on_change, key, None),
    );

    html! {
        <div class="row">
            <ColorSelector
                {color}
                {on_color}
                {on_reset}
                {is_modified}
                title={Some(format!("{}-label", props.field_key))}
            />
        </div>
    }
}
