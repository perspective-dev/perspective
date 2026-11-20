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

#[cfg(feature = "baked-locale-data")]
mod baked_data;
mod datetime;
mod digits;
mod locale_data;
mod number;
pub mod spec;

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::{Rc, Weak};

#[cfg(feature = "baked-locale-data")]
pub use baked_data::BakedData;
pub use datetime::prefers_hour12;
use icu_locale_core::Locale;
pub use locale_data::{CurrencySymbol, LocaleData, NameKind, OffsetSpan};
pub use number::currency_digits;
use spec::FormatSpec;

/// The first of `locales` that is a well-formed language tag, else the root
/// locale.
#[optimize(speed)]
fn locale(locales: &[String]) -> Locale {
    locales
        .iter()
        .find_map(|x| Locale::try_from_str(x).ok())
        .unwrap_or(Locale::UNKNOWN)
}

/// A column of formatted values: the texts concatenated, and the end of each
/// one as an offset in UTF-16 code units.
pub struct FormattedColumn {
    pub text: String,
    pub ends: Vec<u32>,
}

enum Renderer {
    Number(Box<number::NumberRenderer>),
    Datetime(Box<datetime::DatetimeRenderer>),
    Boolean,
}

type Key = (FormatSpec, Vec<String>);

struct Shared {
    key: Key,
    renderer: Renderer,
}

thread_local! {
    static FORMATTERS: RefCell<HashMap<Key, Weak<Shared>>> = RefCell::default();
}

/// Formats values by one [`FormatSpec`] for one locale list, sharing its
/// renderer with every other `Formatter` built from the same two, which
/// should therefore always be given the same [`LocaleData`].
pub struct Formatter(Rc<Shared>);

impl Drop for Formatter {
    #[optimize(speed)]
    fn drop(&mut self) {
        if Rc::strong_count(&self.0) == 1 {
            let _ = FORMATTERS.try_with(|x| x.borrow_mut().remove(&self.0.key));
        }
    }
}

impl Formatter {
    /// A formatter for `spec` in the first of `locales` with data, or an
    /// error naming what `spec` asks for that cannot be rendered.
    #[optimize(speed)]
    pub fn new(
        spec: &FormatSpec,
        locales: &[String],
        names: &Rc<dyn LocaleData>,
    ) -> Result<Self, String> {
        let key = (spec.clone(), locales.to_vec());
        let shared = FORMATTERS.with_borrow(|x| x.get(&key).and_then(Weak::upgrade));
        if let Some(shared) = shared {
            return Ok(Self(shared));
        }

        let renderer =
            match spec {
                FormatSpec::Number(spec) => Renderer::Number(Box::new(
                    number::NumberRenderer::new(spec, locales, names.clone())?,
                )),
                FormatSpec::Datetime(spec) => Renderer::Datetime(Box::new(
                    datetime::DatetimeRenderer::new(spec, locales, names.clone())?,
                )),
                FormatSpec::Boolean => Renderer::Boolean,
            };

        let shared = Rc::new(Shared {
            key: key.clone(),
            renderer,
        });

        FORMATTERS.with_borrow_mut(|x| x.insert(key, Rc::downgrade(&shared)));
        Ok(Self(shared))
    }

    /// Append the text of `value` to `out`.
    #[optimize(speed)]
    pub fn write(&self, value: f64, out: &mut String) {
        match &self.0.renderer {
            Renderer::Number(x) => x.write(value, out),
            Renderer::Datetime(x) => x.write(value, out),
            Renderer::Boolean => out.push_str(if value != 0. && !value.is_nan() {
                "true"
            } else {
                "false"
            }),
        }
    }

    /// The text of `value`.
    #[optimize(speed)]
    pub fn format(&self, value: f64) -> String {
        let mut out = String::new();
        self.write(value, &mut out);
        out
    }

    /// The text of every one of `values`.
    #[optimize(speed)]
    pub fn format_column(&self, values: &[f64]) -> FormattedColumn {
        let mut text = String::new();
        let mut ends = Vec::with_capacity(values.len());
        let mut end = 0;
        for value in values {
            let start = text.len();
            self.write(*value, &mut text);
            let written = &text[start..];
            end += if written.is_ascii() {
                written.len() as u32
            } else {
                written.encode_utf16().count() as u32
            };

            ends.push(end);
        }

        FormattedColumn { text, ends }
    }
}
