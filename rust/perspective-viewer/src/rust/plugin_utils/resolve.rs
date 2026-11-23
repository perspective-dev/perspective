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

use crate::config::*;
use crate::format::spec;

const MAX_FRACTION_DIGITS: f64 = 100.;
const MAX_SIGNIFICANT_DIGITS: f64 = 21.;
const ROUNDING_INCREMENTS: [u16; 15] = [
    1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000,
];

/// The `number_format` a float or integer column renders with when neither it
/// nor its plugin declares one.
fn legacy_number_format(is_float: bool) -> CustomNumberFormatConfig {
    if is_float {
        CustomNumberFormatConfig {
            _style: Some(NumberFormatStyle::Decimal),
            minimum_fraction_digits: Some(2.),
            maximum_fraction_digits: Some(2.),
            ..CustomNumberFormatConfig::default()
        }
    } else {
        CustomNumberFormatConfig::default()
    }
}

/// `upper` layered over `base`, where `style`, `notation`, the fraction digit
/// pair and the significant digit pair are each taken whole from whichever
/// sets any part of them.
fn merge_number_format(
    base: &CustomNumberFormatConfig,
    upper: &CustomNumberFormatConfig,
) -> CustomNumberFormatConfig {
    let fraction =
        if upper.minimum_fraction_digits.is_some() || upper.maximum_fraction_digits.is_some() {
            upper
        } else {
            base
        };

    let significant = if upper.minimum_significant_digits.is_some()
        || upper.maximum_significant_digits.is_some()
    {
        upper
    } else {
        base
    };

    CustomNumberFormatConfig {
        _style: upper._style.clone().or_else(|| base._style.clone()),
        minimum_integer_digits: upper.minimum_integer_digits.or(base.minimum_integer_digits),
        minimum_fraction_digits: fraction.minimum_fraction_digits,
        maximum_fraction_digits: fraction.maximum_fraction_digits,
        minimum_significant_digits: significant.minimum_significant_digits,
        maximum_significant_digits: significant.maximum_significant_digits,
        rounding_priority: upper.rounding_priority.or(base.rounding_priority),
        rounding_increment: upper.rounding_increment.or(base.rounding_increment),
        rounding_mode: upper.rounding_mode.or(base.rounding_mode),
        trailing_zero_display: upper.trailing_zero_display.or(base.trailing_zero_display),
        _notation: upper._notation.clone().or_else(|| base._notation.clone()),
        use_grouping: upper.use_grouping.or(base.use_grouping),
        sign_display: upper.sign_display.or(base.sign_display),
    }
}

/// `value` as a whole digit count within `min..=max`.
fn digits(name: &str, value: f64, min: f64, max: f64) -> Result<u8, String> {
    let value = value.floor();
    if value.is_nan() || value < min || value > max {
        Err(format!("`{name}` must be between {min} and {max}"))
    } else {
        Ok(value as u8)
    }
}

fn number_style(style: NumberFormatStyle) -> spec::NumberStyle {
    match style {
        NumberFormatStyle::Decimal => spec::NumberStyle::Decimal,
        NumberFormatStyle::Percent => spec::NumberStyle::Percent,
        NumberFormatStyle::Currency(currency) => spec::NumberStyle::Currency {
            code: currency.currency.to_string(),
            display: match currency.currency_display.unwrap_or_default() {
                CurrencyDisplay::Code => spec::CurrencyDisplay::Code,
                CurrencyDisplay::Symbol => spec::CurrencyDisplay::Symbol,
                CurrencyDisplay::NarrowSymbol => spec::CurrencyDisplay::NarrowSymbol,
                CurrencyDisplay::Name => spec::CurrencyDisplay::Name,
            },
            sign: match currency.currency_sign.unwrap_or_default() {
                CurrencySign::Standard => spec::CurrencySign::Standard,
                CurrencySign::Accounting => spec::CurrencySign::Accounting,
            },
        },
        NumberFormatStyle::Unit(unit) => spec::NumberStyle::Unit {
            unit: serde_json::to_value(unit.unit)
                .ok()
                .and_then(|x| x.as_str().map(str::to_owned))
                .unwrap_or_default(),
            display: match unit.unit_display.unwrap_or_default() {
                UnitDisplay::Short => spec::UnitDisplay::Short,
                UnitDisplay::Narrow => spec::UnitDisplay::Narrow,
                UnitDisplay::Long => spec::UnitDisplay::Long,
            },
        },
    }
}

/// The format a column of the given numeric type renders with: `format`
/// layered over `defaults`, then completed by the `Intl.NumberFormat`
/// defaulting rules.
pub fn number_spec(
    is_float: bool,
    format: Option<&CustomNumberFormatConfig>,
    defaults: Option<&CustomNumberFormatConfig>,
    currency_digits: impl Fn(&str) -> u8,
) -> Result<spec::NumberSpec, String> {
    let base = defaults
        .cloned()
        .unwrap_or_else(|| legacy_number_format(is_float));

    let merged = match format {
        Some(format) => merge_number_format(&base, format),
        None => base,
    };

    let style = number_style(merged._style.clone().unwrap_or_default());
    let notation = match merged._notation.clone().unwrap_or_default() {
        Notation::Standard => spec::Notation::Standard,
        Notation::Scientific => spec::Notation::Scientific,
        Notation::Engineering => spec::Notation::Engineering,
        Notation::Compact(CompactDisplay::Short) => {
            spec::Notation::Compact(spec::CompactDisplay::Short)
        },
        Notation::Compact(CompactDisplay::Long) => {
            spec::Notation::Compact(spec::CompactDisplay::Long)
        },
    };

    let rounding_increment = match merged.rounding_increment {
        None => 1,
        Some(x) => ROUNDING_INCREMENTS
            .into_iter()
            .find(|y| f64::from(*y) == x)
            .ok_or_else(|| format!("`roundingIncrement` {x} is not supported"))?,
    };

    let (default_min_fraction, default_max_fraction) = match (&style, notation) {
        (spec::NumberStyle::Currency { code, .. }, spec::Notation::Standard) => {
            let digits = currency_digits(code);
            (digits, digits)
        },
        (spec::NumberStyle::Percent, _) => (0, 0),
        _ if rounding_increment != 1 => (0, 0),
        _ => (0, 3),
    };

    let minimum_integer_digits = match merged.minimum_integer_digits {
        None => 1,
        Some(x) => digits("minimumIntegerDigits", x, 1., MAX_SIGNIFICANT_DIGITS)?,
    };

    let priority = merged.rounding_priority.unwrap_or_default();
    let has_significant =
        merged.minimum_significant_digits.is_some() || merged.maximum_significant_digits.is_some();

    let has_fraction =
        merged.minimum_fraction_digits.is_some() || merged.maximum_fraction_digits.is_some();

    let is_compact = matches!(notation, spec::Notation::Compact(_));
    let (need_significant, need_fraction) = match priority {
        RoundingPriority::Auto => (
            has_significant,
            !(has_significant || !has_fraction && is_compact),
        ),
        _ => (true, true),
    };

    let significant = if has_significant {
        let min = match merged.minimum_significant_digits {
            None => 1,
            Some(x) => digits("minimumSignificantDigits", x, 1., MAX_SIGNIFICANT_DIGITS)?,
        };

        let max = match merged.maximum_significant_digits {
            None => MAX_SIGNIFICANT_DIGITS as u8,
            Some(x) => digits(
                "maximumSignificantDigits",
                x,
                f64::from(min),
                MAX_SIGNIFICANT_DIGITS,
            )?,
        };

        (min, max)
    } else {
        (1, MAX_SIGNIFICANT_DIGITS as u8)
    };

    let fraction = if has_fraction {
        let min = merged
            .minimum_fraction_digits
            .map(|x| digits("minimumFractionDigits", x, 0., MAX_FRACTION_DIGITS))
            .transpose()?;

        let max = merged
            .maximum_fraction_digits
            .map(|x| digits("maximumFractionDigits", x, 0., MAX_FRACTION_DIGITS))
            .transpose()?;

        match (min, max) {
            (Some(min), Some(max)) if min > max => {
                return Err(format!(
                    "`minimumFractionDigits` {min} exceeds `maximumFractionDigits` {max}"
                ));
            },
            (Some(min), Some(max)) => (min, max),
            (Some(min), None) => (min, default_max_fraction.max(min)),
            (None, Some(max)) => (default_min_fraction.min(max), max),
            (None, None) => (default_min_fraction, default_max_fraction),
        }
    } else {
        (default_min_fraction, default_max_fraction)
    };

    let rounding = if !need_significant && !need_fraction {
        spec::Rounding::MorePrecision {
            fraction: (0, 0),
            significant: (1, 2),
        }
    } else {
        match priority {
            RoundingPriority::MorePrecision => spec::Rounding::MorePrecision {
                fraction,
                significant,
            },
            RoundingPriority::LessPrecision => spec::Rounding::LessPrecision {
                fraction,
                significant,
            },
            RoundingPriority::Auto if has_significant => {
                spec::Rounding::SignificantDigits(significant)
            },
            RoundingPriority::Auto => spec::Rounding::FractionDigits(fraction),
        }
    };

    if rounding_increment != 1 {
        match rounding {
            spec::Rounding::FractionDigits((min, max)) if min == max => {},
            spec::Rounding::FractionDigits(_) => {
                return Err(
                    "`roundingIncrement` needs equal `minimumFractionDigits` and \
                     `maximumFractionDigits`"
                        .to_owned(),
                );
            },
            _ => {
                return Err(
                    "`roundingIncrement` cannot be combined with significant digits or a \
                     `roundingPriority`"
                        .to_owned(),
                );
            },
        }
    }

    Ok(spec::NumberSpec {
        style,
        notation,
        minimum_integer_digits,
        rounding,
        rounding_increment,
        rounding_mode: match merged.rounding_mode.unwrap_or_default() {
            RoundingMode::Ceil => spec::RoundingMode::Ceil,
            RoundingMode::Floor => spec::RoundingMode::Floor,
            RoundingMode::Expand => spec::RoundingMode::Expand,
            RoundingMode::Trunc => spec::RoundingMode::Trunc,
            RoundingMode::HalfCeil => spec::RoundingMode::HalfCeil,
            RoundingMode::HalfFloor => spec::RoundingMode::HalfFloor,
            RoundingMode::HalfExpand => spec::RoundingMode::HalfExpand,
            RoundingMode::HalfTrunc => spec::RoundingMode::HalfTrunc,
            RoundingMode::HalfEven => spec::RoundingMode::HalfEven,
        },
        trailing_zero_display: match merged.trailing_zero_display.unwrap_or_default() {
            TrailingZeroDisplay::Auto => spec::TrailingZeroDisplay::Auto,
            TrailingZeroDisplay::StripIfInteger => spec::TrailingZeroDisplay::StripIfInteger,
        },
        grouping: match merged.use_grouping {
            None if is_compact => spec::Grouping::Min2,
            None | Some(UseGrouping::Auto) => spec::Grouping::Auto,
            Some(UseGrouping::Always | UseGrouping::False(true)) => spec::Grouping::Always,
            Some(UseGrouping::Min2) => spec::Grouping::Min2,
            Some(UseGrouping::False(false)) => spec::Grouping::Never,
        },
        sign_display: match merged.sign_display.unwrap_or_default() {
            SignDisplay::Auto => spec::SignDisplay::Auto,
            SignDisplay::Always => spec::SignDisplay::Always,
            SignDisplay::ExceptZero => spec::SignDisplay::ExceptZero,
            SignDisplay::Negative => spec::SignDisplay::Negative,
            SignDisplay::Never => spec::SignDisplay::Never,
        },
    })
}

fn preset(length: SimpleDatetimeFormat) -> spec::PresetLength {
    match length {
        SimpleDatetimeFormat::Full => spec::PresetLength::Full,
        SimpleDatetimeFormat::Long => spec::PresetLength::Long,
        SimpleDatetimeFormat::Medium => spec::PresetLength::Medium,
        SimpleDatetimeFormat::Short => spec::PresetLength::Short,
    }
}

fn numeric(part: DatetimeNumericPart) -> spec::NumericWidth {
    match part {
        DatetimeNumericPart::Numeric => spec::NumericWidth::Numeric,
        DatetimeNumericPart::TwoDigit => spec::NumericWidth::TwoDigit,
    }
}

/// `format` layered over `defaults` and then `base` by the `date_format`
/// group rule.
fn layer_date_format(
    base: DatetimeFormat,
    format: Option<&DatetimeFormat>,
    defaults: Option<&DatetimeFormat>,
) -> Result<DatetimeFormat, String> {
    let mut resolved = base;
    for layer in [defaults, format].into_iter().flatten() {
        layer.validate()?;
        resolved = resolved.overlay(layer);
    }

    Ok(resolved)
}

/// The format a `datetime` column renders with, in `local_zone` unless the
/// format names a time zone.
pub fn datetime_spec(
    format: Option<&DatetimeFormat>,
    defaults: Option<&DatetimeFormat>,
    local_zone: &str,
) -> Result<spec::DatetimeSpec, String> {
    let resolved = layer_date_format(DatetimeFormat::base(true), format, defaults)?;
    Ok(spec::DatetimeSpec {
        date_style: resolved.date_style.map(preset),
        time_style: resolved.time_style.map(preset),
        weekday: resolved.weekday.map(|x| match x {
            DatetimeTextPart::Long => spec::TextWidth::Long,
            DatetimeTextPart::Short => spec::TextWidth::Short,
            DatetimeTextPart::Narrow => spec::TextWidth::Narrow,
        }),
        year: resolved.year.map(numeric),
        month: resolved.month.map(|x| match x {
            DatetimeMonthPart::Numeric => spec::MonthWidth::Numeric,
            DatetimeMonthPart::TwoDigit => spec::MonthWidth::TwoDigit,
            DatetimeMonthPart::Long => spec::MonthWidth::Long,
            DatetimeMonthPart::Short => spec::MonthWidth::Short,
            DatetimeMonthPart::Narrow => spec::MonthWidth::Narrow,
        }),
        day: resolved.day.map(numeric),
        hour: resolved.hour.map(numeric),
        minute: resolved.minute.map(numeric),
        second: resolved.second.map(numeric),
        fractional_second_digits: resolved.fractional_second_digits.map(|x| x.get()),
        hour12: resolved.hour12,
        time_zone: resolved.time_zone.unwrap_or_else(|| local_zone.to_owned()),
    })
}

/// The format a `date` column renders with: a date preset alone, in UTC.
pub fn date_spec(
    format: Option<&DatetimeFormat>,
    defaults: Option<&DatetimeFormat>,
) -> Result<spec::DatetimeSpec, String> {
    let resolved = layer_date_format(DatetimeFormat::base(false), format, defaults)?;
    Ok(spec::DatetimeSpec {
        date_style: Some(preset(
            resolved.date_style.unwrap_or(SimpleDatetimeFormat::Short),
        )),
        time_style: None,
        weekday: None,
        year: None,
        month: None,
        day: None,
        hour: None,
        minute: None,
        second: None,
        fractional_second_digits: None,
        hour12: None,
        time_zone: "UTC".to_owned(),
    })
}
