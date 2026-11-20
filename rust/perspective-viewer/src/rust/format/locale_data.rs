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

/// What a number is measured in, when it is shown with a localized name.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum NameKind {
    /// A currency by its ISO 4217 code, by its long name.
    Currency(String),

    /// A unit by its `Intl.NumberFormat` identifier.
    Unit {
        unit: String,
        display: super::spec::UnitDisplay,
    },
}

/// A currency's symbol, and whether each of its ends counts as a letter,
/// which sets it apart by a space from a number written beside that end.
pub struct CurrencySymbol {
    pub text: String,
    pub starts_with_letter: bool,
    pub ends_with_letter: bool,
}

/// A UTC offset in seconds and the instants from `start` up to but not
/// including `end`, in milliseconds since the epoch, that share it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OffsetSpan {
    pub offset: i32,
    pub start: i64,
    pub end: i64,
}

/// Time zone rules and localized names a formatter looks up from outside
/// itself, so that the data behind them need not be linked into it.
pub trait LocaleData {
    /// The IANA name of every time zone a formatter may be given.
    fn time_zones(&self) -> Vec<String>;

    /// The UTC offset of the time zone `zone` at the instant `epoch_ms` and
    /// the span around it that shares it, or `None` when `zone` is not a
    /// known time zone.
    fn utc_offset(&self, zone: &str, epoch_ms: i64) -> Option<OffsetSpan>;

    /// The name of the time zone `zone` at the instant `epoch_ms`, long or
    /// short, in `locale`.
    fn zone_name(&self, locale: &str, zone: &str, epoch_ms: f64, long: bool) -> Option<String>;

    /// The symbol of the currency `code` in `locale`, narrow or not.
    fn currency_symbol(&self, locale: &str, code: &str, narrow: bool) -> Option<CurrencySymbol>;

    /// The text of `value` shown with `fraction_digits` fraction digits as
    /// `kind` in `locale`, with the number replaced by `{0}`.
    fn pattern(
        &self,
        locale: &str,
        kind: &NameKind,
        value: f64,
        fraction_digits: u8,
    ) -> Option<String>;
}
