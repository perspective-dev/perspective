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
use web_sys::MouseEvent;
use yew::prelude::*;

use super::primitive_field::emit;
use crate::config::{Alignment, ColumnConfigFieldUpdate};
use crate::ui::OptionalField;

#[derive(Properties, PartialEq)]
pub struct AlignmentFieldProps {
    pub field_key: String,
    pub default: Option<Alignment>,
    pub corners: bool,
    pub current: Option<Alignment>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
}

/// The `ControlSpec::Alignment` widget: a 3×3 grid of cells whose dot sits
/// where the cell's token anchors.
#[function_component]
pub fn AlignmentField(props: &AlignmentFieldProps) -> Html {
    let selected = props.current.or(props.default);
    let checked = props.current.is_some() && props.current != props.default;
    let on_reset = use_callback(
        (props.field_key.clone(), props.on_change.clone()),
        |_: MouseEvent, (key, on_change)| emit(on_change, key, None),
    );

    let cells = Alignment::ALL.into_iter().map(|align| {
        let onclick = {
            let key = props.field_key.clone();
            let default = props.default;
            let on_change = props.on_change.clone();
            Callback::from(move |_: MouseEvent| {
                if Some(align) == default {
                    emit(&on_change, &key, None);
                } else {
                    emit(
                        &on_change,
                        &key,
                        Some(Value::String(align.as_str().to_owned())),
                    );
                }
            })
        };

        let is_selected = selected == Some(align);
        html! {
            <button
                type="button"
                role="radio"
                class={classes!(
                    "alignment-cell",
                    (is_selected && props.current.is_none()).then_some("is-default")
                )}
                data-align={align.as_str()}
                aria-checked={is_selected.to_string()}
                aria-label={align.humanized()}
                disabled={props.corners && !align.is_corner()}
                {onclick}
            />
        }
    });

    html! {
        <div class="row">
            <OptionalField label={props.field_key.clone()} on_check={on_reset} {checked}>
                <div
                    class="alignment-grid"
                    role="radiogroup"
                    id={format!("{}-alignment", props.field_key)}
                >
                    { for cells }
                </div>
            </OptionalField>
        </div>
    }
}
