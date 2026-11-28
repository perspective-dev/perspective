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

//! Helpers the style field widgets share to emit and pick values.

use std::collections::BTreeMap;
use std::rc::Rc;

use serde_json::Value;
use yew::{Callback, Html, html};

use crate::config::ColumnConfigFieldUpdate;
use crate::ui::NamedValuePicker;
use crate::utils::{CssKind, NamedValue, palette_name_for};

pub fn emit(on_change: &Callback<ColumnConfigFieldUpdate>, key: &str, value: Option<Value>) {
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
pub fn css_field_controls(
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

pub fn named_literal(named: &[NamedValue], name: &str) -> Option<String> {
    named
        .iter()
        .find(|entry| entry.name == name)
        .map(|entry| entry.value.clone())
}
