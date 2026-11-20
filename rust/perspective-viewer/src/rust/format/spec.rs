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

/// How a number is presented: plain, as a percentage, as money or with a
/// unit of measure.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum NumberStyle {
    Decimal,
    Percent,
    Currency {
        code: String,
        display: CurrencyDisplay,
        sign: CurrencySign,
    },
    Unit {
        unit: String,
        display: UnitDisplay,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CurrencyDisplay {
    Code,
    Symbol,
    NarrowSymbol,
    Name,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CurrencySign {
    Standard,
    Accounting,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UnitDisplay {
    Short,
    Narrow,
    Long,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Notation {
    Standard,
    Scientific,
    Engineering,
    Compact(CompactDisplay),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CompactDisplay {
    Short,
    Long,
}

/// A `(minimum, maximum)` digit count.
pub type Digits = (u8, u8);

/// Which digits of a number survive rounding.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Rounding {
    FractionDigits(Digits),
    SignificantDigits(Digits),

    /// Whichever of the two keeps more digits.
    MorePrecision {
        fraction: Digits,
        significant: Digits,
    },

    /// Whichever of the two keeps fewer digits.
    LessPrecision {
        fraction: Digits,
        significant: Digits,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum RoundingMode {
    Ceil,
    Floor,
    Expand,
    Trunc,
    HalfCeil,
    HalfFloor,
    HalfExpand,
    HalfTrunc,
    HalfEven,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TrailingZeroDisplay {
    Auto,
    StripIfInteger,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Grouping {
    Always,
    Auto,
    Min2,
    Never,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SignDisplay {
    Auto,
    Always,
    ExceptZero,
    Negative,
    Never,
}

/// A fully resolved number format, with no defaults left to apply.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct NumberSpec {
    pub style: NumberStyle,
    pub notation: Notation,
    pub minimum_integer_digits: u8,
    pub rounding: Rounding,

    /// The multiple of the last fraction digit to round to, `1` for none.
    pub rounding_increment: u16,
    pub rounding_mode: RoundingMode,
    pub trailing_zero_display: TrailingZeroDisplay,
    pub grouping: Grouping,
    pub sign_display: SignDisplay,
}

/// The length of a date or time preset.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PresetLength {
    Full,
    Long,
    Medium,
    Short,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextWidth {
    Narrow,
    Short,
    Long,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum NumericWidth {
    Numeric,
    TwoDigit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MonthWidth {
    Numeric,
    TwoDigit,
    Narrow,
    Short,
    Long,
}

/// A fully resolved datetime format: either presets or per-part fields, in a
/// named time zone.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DatetimeSpec {
    pub date_style: Option<PresetLength>,
    pub time_style: Option<PresetLength>,
    pub weekday: Option<TextWidth>,
    pub year: Option<NumericWidth>,
    pub month: Option<MonthWidth>,
    pub day: Option<NumericWidth>,
    pub hour: Option<NumericWidth>,
    pub minute: Option<NumericWidth>,
    pub second: Option<NumericWidth>,
    pub fractional_second_digits: Option<u8>,
    pub hour12: Option<bool>,

    /// An IANA time zone name.
    pub time_zone: String,
}

/// What a [`super::Formatter`] renders.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum FormatSpec {
    Number(NumberSpec),
    Datetime(DatetimeSpec),
    Boolean,
}
