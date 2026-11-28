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

use crate::config::DatetimeFormat;

/// A display-field edit, applied to the shown shape given the shape a reset
/// restores.
pub type ShapeEdit = Rc<dyn Fn(&DatetimeFormat, &DatetimeFormat) -> DatetimeFormat>;

/// A display field's select value: one of its forms, or not shown.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PartChoice<T> {
    Shown(T),
    Hidden,
}

impl<T: Display> Display for PartChoice<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Shown(x) => x.fmt(f),
            Self::Hidden => f.write_str("disabled"),
        }
    }
}

impl<T> From<Option<T>> for PartChoice<T> {
    fn from(value: Option<T>) -> Self {
        value.map_or(Self::Hidden, Self::Shown)
    }
}

impl<T> PartChoice<T> {
    /// The field value this choice stores, given the value a reset restores.
    pub fn resolve(choice: Option<Self>, reset: Option<T>) -> Option<T> {
        match choice {
            None => reset,
            Some(Self::Hidden) => None,
            Some(Self::Shown(x)) => Some(x),
        }
    }
}

/// Every form of `T`, then [`PartChoice::Hidden`] when `hideable`.
pub fn part_choices<T: strum::IntoEnumIterator>(hideable: bool) -> Rc<Vec<PartChoice<T>>> {
    let mut values: Vec<_> = T::iter().map(PartChoice::Shown).collect();
    if hideable {
        values.push(PartChoice::Hidden);
    }

    Rc::new(values)
}
