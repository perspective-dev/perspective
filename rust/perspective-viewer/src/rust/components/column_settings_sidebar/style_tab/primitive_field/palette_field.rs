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

use super::{css_field_controls, emit, named_literal};
use crate::config::ColumnConfigFieldUpdate;
use crate::ui::PaletteSelector;
use crate::utils::{CssKind, CssPalette, NamedValue};

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
                label={Some(props.field_key.clone())}
            />
        </div>
    }
}
