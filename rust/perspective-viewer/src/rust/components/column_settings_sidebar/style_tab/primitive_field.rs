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

use std::collections::BTreeMap;
use std::rc::Rc;

use itertools::Itertools;
use serde_json::Value;
use wasm_bindgen::JsCast;
use web_sys::{HtmlInputElement, MouseEvent};
use yew::{Callback, Html, Properties, function_component, html, use_callback};

use crate::components::containers::select::{Select, SelectItem};
use crate::components::form::color_selector::ColorSelector;
use crate::components::form::multi_stop_gradient_selector::MultiStopGradientSelector;
use crate::components::form::named_value_picker::NamedValuePicker;
use crate::components::form::number_field::NumberField;
use crate::components::form::optional_field::OptionalField;
use crate::components::form::palette_selector::PaletteSelector;
use crate::config::{
    ColumnConfigFieldUpdate, CssColor, CssGradient, CssKind, CssPalette, EnumVariant,
    GradientStopSpec, NamedValue, canonicalize_css_color, discrete_pair, gradient_to_css,
    palette_name_for,
};

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

#[allow(clippy::too_many_arguments)]
fn css_field_controls(
    kind: CssKind,
    named: &Rc<Vec<NamedValue>>,
    restored: &BTreeMap<String, String>,
    current: &str,
    is_modified: bool,
    on_select: Callback<String>,
    on_pin: Callback<()>,
) -> Html {
    let can_pin = is_modified && palette_name_for(restored, kind, current).is_none();
    if named.is_empty() && !can_pin {
        return html! {};
    }

    html! { <NamedValuePicker {kind} entries={named.clone()} {on_select} {can_pin} {on_pin} /> }
}

fn named_literal(named: &[NamedValue], name: &str) -> Option<String> {
    named
        .iter()
        .find(|entry| entry.name == name)
        .map(|entry| entry.value.clone())
}

#[derive(Properties, PartialEq)]
pub struct PaletteFieldProps {
    pub field_key: String,
    /// Canonical palette string.
    pub default: String,
    pub max: Option<usize>,
    /// Canonical palette string.
    pub current: Option<String>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,

    /// Named palettes (workspace set ∪ theme), for the loader.
    #[prop_or_default]
    pub named: Rc<Vec<NamedValue>>,

    /// The restored palette — the set Pin adds to.
    #[prop_or_default]
    pub restored: Rc<BTreeMap<String, String>>,

    /// Pin the field's `(kind, literal)` into the restored palette.
    #[prop_or_default]
    pub on_pin: Callback<(CssKind, String)>,
}

fn palette_colors(src: &str, default: &str) -> Vec<String> {
    let literal = |css: &str| match CssPalette::parse(css) {
        Ok(CssPalette::Literal(colors)) => Some(colors),
        _ => None,
    };

    literal(src)
        .or_else(|| literal(default))
        .unwrap_or_default()
}

#[function_component]
pub fn PaletteField(props: &PaletteFieldProps) -> Html {
    let current = props.current.as_deref().unwrap_or(&props.default);
    let values = palette_colors(current, &props.default);
    let is_modified = props.current.is_some() && props.current.as_ref() != Some(&props.default);
    let emit_css = {
        let key = props.field_key.clone();
        let default = props.default.clone();
        let on_change = props.on_change.clone();
        move |css: String| {
            if css == default {
                emit(&on_change, &key, None);
            } else {
                emit(&on_change, &key, Some(Value::String(css)));
            }
        }
    };

    let on_change_palette = {
        let emit_css = emit_css.clone();
        Callback::from(move |values: Vec<String>| {
            emit_css(CssPalette::Literal(values).to_css());
        })
    };

    let on_select = {
        let emit_css = emit_css.clone();
        let named = props.named.clone();
        Callback::from(move |name: String| {
            if let Some(literal) = named_literal(&named, &name) {
                emit_css(literal);
            }
        })
    };

    let on_reset = use_callback(
        (props.field_key.clone(), props.on_change.clone()),
        |_: (), (key, on_change)| emit(on_change, key, None),
    );

    let on_pin = {
        let on_pin = props.on_pin.clone();
        let literal = current.to_owned();
        Callback::from(move |()| on_pin.emit((CssKind::Palette, literal.clone())))
    };

    html! {
        <div class="row">
            { css_field_controls(
                CssKind::Palette,
                &props.named,
                &props.restored,
                current,
                is_modified,
                on_select,
                on_pin,
            ) }
            <PaletteSelector
                {values}
                max={props.max}
                on_change={on_change_palette}
                {on_reset}
                {is_modified}
                title={Some(format!("{}-label", props.field_key))}
            />
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct GradientStopsFieldProps {
    pub field_key: String,
    /// Canonical gradient string.
    pub default: String,
    pub discrete: bool,
    /// Canonical gradient string.
    pub current: Option<String>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,

    /// Named gradients (workspace set ∪ theme), for the loader.
    #[prop_or_default]
    pub named: Rc<Vec<NamedValue>>,

    /// The restored palette — the set Pin adds to.
    #[prop_or_default]
    pub restored: Rc<BTreeMap<String, String>>,

    /// Pin the field's `(kind, literal)` into the restored palette.
    #[prop_or_default]
    pub on_pin: Callback<(CssKind, String)>,
}

fn gradient_stops(src: &str, default: &str) -> Vec<GradientStopSpec> {
    let literal = |css: &str| match CssGradient::parse(css) {
        Ok(CssGradient::Literal(stops)) => Some(stops),
        _ => None,
    };

    literal(src)
        .or_else(|| literal(default))
        .unwrap_or_default()
}

#[function_component]
pub fn GradientStopsField(props: &GradientStopsFieldProps) -> Html {
    let current = props.current.as_deref().unwrap_or(&props.default);
    let stops = gradient_stops(current, &props.default);
    let is_modified = props.current.is_some() && props.current.as_ref() != Some(&props.default);
    let emit_css = {
        let key = props.field_key.clone();
        let default = props.default.clone();
        let on_change = props.on_change.clone();
        move |css: String| {
            if css == default {
                emit(&on_change, &key, None);
            } else {
                emit(&on_change, &key, Some(Value::String(css)));
            }
        }
    };

    let on_change_stops = {
        let emit_css = emit_css.clone();
        Callback::from(move |stops: Vec<GradientStopSpec>| {
            emit_css(gradient_to_css(&stops));
        })
    };

    let on_select = {
        let emit_css = emit_css.clone();
        let named = props.named.clone();
        let discrete = props.discrete;
        Callback::from(move |name: String| {
            let Some(literal) = named_literal(&named, &name) else {
                return;
            };

            let literal = match CssGradient::parse(&literal) {
                Ok(CssGradient::Literal(stops)) if discrete && stops.len() > 2 => {
                    gradient_to_css(&discrete_pair(stops))
                },
                _ => literal,
            };

            emit_css(literal);
        })
    };

    let on_reset = use_callback(
        (props.field_key.clone(), props.on_change.clone()),
        |_: (), (key, on_change)| emit(on_change, key, None),
    );

    let on_pin = {
        let on_pin = props.on_pin.clone();
        let literal = current.to_owned();
        Callback::from(move |()| on_pin.emit((CssKind::Gradient, literal.clone())))
    };

    html! {
        <div class="row">
            { css_field_controls(
                CssKind::Gradient,
                &props.named,
                &props.restored,
                current,
                is_modified,
                on_select,
                on_pin,
            ) }
            <MultiStopGradientSelector
                {stops}
                discrete={props.discrete}
                on_change={on_change_stops}
                {on_reset}
                {is_modified}
                title={Some(format!("{}-label", props.field_key))}
            />
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct ColorFieldProps {
    pub field_key: String,
    /// Canonical `#rrggbb`.
    pub default: String,
    /// Canonical `#rrggbb`.
    pub current: Option<String>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,

    /// Named colors (workspace set ∪ theme), for the loader.
    #[prop_or_default]
    pub named: Rc<Vec<NamedValue>>,

    /// The restored palette — the set Pin adds to.
    #[prop_or_default]
    pub restored: Rc<BTreeMap<String, String>>,

    /// Pin the field's `(kind, literal)` into the restored palette.
    #[prop_or_default]
    pub on_pin: Callback<(CssKind, String)>,
}

#[function_component]
pub fn ColorField(props: &ColorFieldProps) -> Html {
    let current = props.current.as_deref().unwrap_or(&props.default);
    let color = match CssColor::parse(current) {
        Ok(CssColor::Literal(color)) => color,
        _ => props.default.clone(),
    };

    let is_modified =
        props.current.as_deref() != Some(props.default.as_str()) && props.current.is_some();

    let emit_css = {
        let key = props.field_key.clone();
        let default = props.default.clone();
        let on_change = props.on_change.clone();
        move |css: String| {
            if css == default {
                emit(&on_change, &key, None);
            } else {
                emit(&on_change, &key, Some(Value::String(css)));
            }
        }
    };

    let on_color = {
        let emit_css = emit_css.clone();
        Callback::from(move |value: String| {
            emit_css(canonicalize_css_color(&value).unwrap_or(value));
        })
    };

    let on_select = {
        let emit_css = emit_css.clone();
        let named = props.named.clone();
        Callback::from(move |name: String| {
            if let Some(literal) = named_literal(&named, &name) {
                emit_css(literal);
            }
        })
    };

    let on_reset = use_callback(
        (props.field_key.clone(), props.on_change.clone()),
        |_: (), (key, on_change)| emit(on_change, key, None),
    );

    let on_pin = {
        let on_pin = props.on_pin.clone();
        let literal = current.to_owned();
        Callback::from(move |()| on_pin.emit((CssKind::Color, literal.clone())))
    };

    html! {
        <div class="row">
            { css_field_controls(
                CssKind::Color,
                &props.named,
                &props.restored,
                current,
                is_modified,
                on_select,
                on_pin,
            ) }
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
