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
//! the existing form components ([`crate::ui::Select`],
//! [`crate::ui::OptionalField`], [`crate::ui::ColorSelector`]) so that they
//! visually match the rich Yew widgets in the same sidebar.

mod bool_field;
mod color_field;
mod enum_field;
mod gradient_stops_field;
mod number_field;
mod palette_field;

use std::collections::BTreeMap;
use std::rc::Rc;

use serde_json::Value;
use yew::{Callback, Html, html};

pub use self::bool_field::BoolField;
pub use self::color_field::ColorField;
pub use self::enum_field::EnumField;
pub use self::gradient_stops_field::GradientStopsField;
pub use self::number_field::NumberFieldPrimitive;
pub use self::palette_field::PaletteField;
use crate::config::ColumnConfigFieldUpdate;
use crate::ui::NamedValuePicker;
use crate::utils::{CssKind, NamedValue, palette_name_for};

pub(super) fn emit(on_change: &Callback<ColumnConfigFieldUpdate>, key: &str, value: Option<Value>) {
    let mut map = serde_json::Map::new();
    if let Some(v) = value {
        map.insert(key.to_owned(), v);
    }

    on_change.emit(ColumnConfigFieldUpdate {
        keys: vec![key.to_owned()],
        value: map,
    });
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
