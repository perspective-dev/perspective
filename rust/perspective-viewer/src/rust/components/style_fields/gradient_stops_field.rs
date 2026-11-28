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

use std::collections::BTreeMap;
use std::rc::Rc;

use serde_json::Value;
use yew::{Callback, Html, Properties, function_component, html, use_callback};

use super::field_update::{css_field_controls, emit, named_literal};
use crate::config::{ColumnConfigFieldUpdate, discrete_pair};
use crate::ui::MultiStopGradientSelector;
use crate::utils::{CssGradient, CssKind, GradientStopSpec, NamedValue, gradient_to_css};

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
                label={Some(props.field_key.clone())}
            />
        </div>
    }
}
