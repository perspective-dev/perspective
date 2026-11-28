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

use yew::prelude::*;

use super::parts::{PartChoice, ShapeEdit, part_choices};
use crate::config::*;
use crate::ui::SelectValueField;

#[derive(Properties, PartialEq)]
pub struct DatetimeStyleSimpleProps {
    pub enable_time_config: bool,

    /// The preset shown.
    pub shape: DatetimeFormat,

    /// The preset a field's reset restores.
    pub default_shape: DatetimeFormat,

    pub on_change: Callback<ShapeEdit>,
}

/// The `dateStyle`/`timeStyle` editor.
#[function_component(DatetimeStyleSimple)]
pub fn datetime_style_simple(props: &DatetimeStyleSimpleProps) -> Html {
    type PresetField = SelectValueField<PartChoice<SimpleDatetimeFormat>>;
    let date_values = part_choices::<SimpleDatetimeFormat>(
        props.enable_time_config && props.shape.time_style.is_some(),
    );

    let time_values = part_choices::<SimpleDatetimeFormat>(props.shape.date_style.is_some());
    let on_date = props.on_change.reform(|choice| -> ShapeEdit {
        Rc::new(
            move |shape: &DatetimeFormat, reset: &DatetimeFormat| DatetimeFormat {
                date_style: PartChoice::resolve(choice, reset.date_style),
                ..shape.clone()
            },
        )
    });

    let on_time = props.on_change.reform(|choice| -> ShapeEdit {
        Rc::new(
            move |shape: &DatetimeFormat, reset: &DatetimeFormat| DatetimeFormat {
                time_style: PartChoice::resolve(choice, reset.time_style),
                ..shape.clone()
            },
        )
    });

    html! {
        <>
            <PresetField
                label="date-style"
                values={date_values}
                default_value={PartChoice::from(props.default_shape.date_style)}
                current_value={PartChoice::from(props.shape.date_style)}
                on_change={on_date}
            />
            if props.enable_time_config {
                <PresetField
                    label="time-style"
                    values={time_values}
                    default_value={PartChoice::from(props.default_shape.time_style)}
                    current_value={PartChoice::from(props.shape.time_style)}
                    on_change={on_time}
                />
            }
        </>
    }
}
