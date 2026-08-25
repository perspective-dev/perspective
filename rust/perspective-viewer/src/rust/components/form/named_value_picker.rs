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

use std::rc::Rc;

use wasm_bindgen::JsCast;
use web_sys::{Event, HtmlSelectElement, MouseEvent};
use yew::prelude::*;

use crate::config::{CssKind, NamedValue};

/// The named-value controls above a CSS-valued style field: a stateless
/// quick-action `<select>` over every named value of the field's kind,
/// and a Pin button that force-adds the field's value to the workspace
/// palette.
#[derive(Properties, PartialEq)]
pub struct NamedValuePickerProps {
    pub kind: CssKind,
    pub entries: Rc<Vec<NamedValue>>,

    /// Loads the named entry's value into the field.
    pub on_select: Callback<String>,

    #[prop_or_default]
    pub can_pin: bool,

    #[prop_or_default]
    pub on_pin: Callback<()>,
}

const PROMPT: &str = "";

#[function_component(NamedValuePicker)]
pub fn named_value_picker(props: &NamedValuePickerProps) -> Html {
    let kind = props.kind;
    let onchange = use_callback(props.on_select.clone(), |event: Event, on_select| {
        let Some(select) = event
            .target()
            .and_then(|x| x.dyn_into::<HtmlSelectElement>().ok())
        else {
            return;
        };

        let name = select.value();
        select.set_value(PROMPT);
        if !name.is_empty() {
            on_select.emit(name);
        }
    });

    let on_pin = use_callback(props.on_pin.clone(), |event: MouseEvent, on_pin| {
        event.prevent_default();
        on_pin.emit(());
    });

    html! {
        <div class="named-value-controls">
            if !props.entries.is_empty() {
                <select class="named-value-select" title="Load a named value" {onchange}>
                    <option value={PROMPT} selected=true disabled=true>{ "Load" }</option>
                    { for props.entries.iter().map(|entry| html! {
                        <option key={entry.name.clone()} value={entry.name.clone()}>
                            { kind.short_name(&entry.name) }
                        </option>
                    }) }
                </select>
            }
            if props.can_pin {
                <span
                    class="named-value-pin"
                    title="Pin this value to the workspace palette"
                    onmousedown={on_pin}
                />
            }
        </div>
    }
}
