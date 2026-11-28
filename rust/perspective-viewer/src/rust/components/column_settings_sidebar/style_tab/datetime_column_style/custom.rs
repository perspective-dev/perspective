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

use std::fmt::Display;
use std::rc::Rc;

use strum::IntoEnumIterator;
use yew::prelude::*;

use super::parts::{PartChoice, ShapeEdit, part_choices};
use crate::config::*;
use crate::ui::{NumberField, SelectValueField};

#[derive(Properties, PartialEq)]
pub struct DatetimeStyleCustomProps {
    pub enable_time_config: bool,

    /// The per-part shape shown.
    pub shape: DatetimeFormat,

    /// The per-part shape a field's reset restores.
    pub default_shape: DatetimeFormat,

    pub on_change: Callback<ShapeEdit>,
}

fn shown_parts(format: &DatetimeFormat) -> usize {
    [
        format.weekday.is_some(),
        format.year.is_some(),
        format.month.is_some(),
        format.day.is_some(),
        format.hour.is_some(),
        format.minute.is_some(),
        format.second.is_some(),
    ]
    .into_iter()
    .filter(|shown| *shown)
    .count()
}

fn part_field<T>(
    props: &DatetimeStyleCustomProps,
    label: &'static str,
    get: fn(&DatetimeFormat) -> Option<T>,
    set: fn(&mut DatetimeFormat, Option<T>),
) -> Html
where
    T: Copy + Display + PartialEq + IntoEnumIterator + 'static,
{
    let hideable = get(&props.shape).is_none() || shown_parts(&props.shape) > 1;
    let on_change = props.on_change.reform(move |choice| -> ShapeEdit {
        Rc::new(move |shape: &DatetimeFormat, reset: &DatetimeFormat| {
            let mut next = shape.clone();
            set(&mut next, PartChoice::resolve(choice, get(reset)));
            next
        })
    });

    html! {
        <SelectValueField<PartChoice<T>>
            {label}
            values={part_choices::<T>(hideable)}
            default_value={PartChoice::from(get(&props.default_shape))}
            current_value={PartChoice::from(get(&props.shape))}
            {on_change}
        />
    }
}

/// The per-part `Intl.DateTimeFormat` editor, the alternative to
/// [`super::simple::DatetimeStyleSimple`].
#[function_component(DatetimeStyleCustom)]
pub fn datetime_style_custom(props: &DatetimeStyleCustomProps) -> Html {
    if !props.enable_time_config {
        return html! {};
    }

    let on_fraction = props.on_change.reform(|digits: Option<f64>| -> ShapeEdit {
        Rc::new(
            move |shape: &DatetimeFormat, reset: &DatetimeFormat| DatetimeFormat {
                fractional_second_digits: digits.map_or(reset.fractional_second_digits, |x| {
                    FractionalSecondDigits::new(x as u8)
                }),
                ..shape.clone()
            },
        )
    });

    let fraction = |format: &DatetimeFormat| {
        format
            .fractional_second_digits
            .map(|x| x.get() as f64)
            .unwrap_or(0.)
    };

    html! {
        <>
            { part_field::<DatetimeNumericPart>(props, "year", |f| f.year, |f, x| f.year = x) }
            { part_field::<DatetimeMonthPart>(props, "month", |f| f.month, |f, x| f.month = x) }
            { part_field::<DatetimeNumericPart>(props, "day", |f| f.day, |f, x| f.day = x) }
            { part_field::<DatetimeTextPart>(props, "weekday", |f| f.weekday, |f, x| f.weekday = x) }
            { part_field::<DatetimeNumericPart>(props, "hour", |f| f.hour, |f, x| f.hour = x) }
            { part_field::<DatetimeNumericPart>(props, "minute", |f| f.minute, |f, x| f.minute = x) }
            { part_field::<DatetimeNumericPart>(props, "second", |f| f.second, |f, x| f.second = x) }
            <NumberField
                label="fractional-seconds"
                min=0.
                max=3.
                step=1.
                default={fraction(&props.default_shape)}
                current_value={fraction(&props.shape)}
                on_change={on_fraction}
            />
        </>
    }
}
