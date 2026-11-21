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

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use fixed_decimal::{Decimal, FloatPrecision, Sign};
use icu_decimal::options::{DecimalFormatterOptions, GroupingStrategy};
use icu_decimal::preferences::CompactDecimalFormatterPreferences;
use icu_decimal::provider::{DecimalDigitsV1, DecimalSymbolsV1};
use icu_decimal::{CompactDecimalFormatter, DecimalFormatter, DecimalFormatterPreferences};
use icu_experimental::dimension::currency::CurrencyType;
use icu_experimental::dimension::currency::formatter::CurrencyFormatterPreferences;
use icu_experimental::dimension::provider::currency::essentials::CurrencyEssentialsV1;
use icu_experimental::dimension::provider::currency::fractions::CurrencyFractionsV1;
use icu_experimental::dimension::provider::currency::symbols::CurrencyDecimalSymbolsV1;
use icu_experimental::dimension::provider::percent::DecimalPercentV1;
use icu_experimental::provider::Baked;
use icu_locale_core::Locale;
use icu_plurals::{PluralCategory, PluralRules};
use icu_provider::prelude::*;
use writeable::Writeable;

use super::locale_data::{CurrencySymbol, LocaleData, NameKind};
use super::spec::{self, NumberSpec};
use super::{digits, locale};

/// Decimal symbols with the per-currency overrides some locales carry.
struct CurrencySymbolsProvider(CurrencyType);

impl DataProvider<DecimalSymbolsV1> for CurrencySymbolsProvider {
    #[optimize(speed)]
    fn load(&self, request: DataRequest) -> Result<DataResponse<DecimalSymbolsV1>, DataError> {
        let mut metadata = request.metadata;
        metadata.silent = true;
        let overridden = DataProvider::<CurrencyDecimalSymbolsV1>::load(&Baked, DataRequest {
            id: DataIdentifierBorrowed::for_marker_attributes_and_locale(
                CurrencyDecimalSymbolsV1::make_attributes(
                    DecimalSymbolsV1::parse_attributes(request.id.marker_attributes),
                    self.0,
                    &mut Default::default(),
                ),
                request.id.locale,
            ),
            metadata,
        })
        .allow_identifier_not_found()?;

        match overridden {
            Some(response) => Ok(response.cast()),
            None => icu_decimal::provider::Baked.load(request),
        }
    }
}

impl DataProvider<DecimalDigitsV1> for CurrencySymbolsProvider {
    #[optimize(speed)]
    fn load(&self, request: DataRequest) -> Result<DataResponse<DecimalDigitsV1>, DataError> {
        icu_decimal::provider::Baked.load(request)
    }
}

/// What a number's digits are wrapped in.
enum Decoration {
    Plain,
    Percent(DataPayload<DecimalPercentV1>),
    Currency {
        essentials: DataPayload<CurrencyEssentialsV1>,
        symbols: DataPayload<DecimalSymbolsV1>,
        text: String,
        starts_with_letter: bool,
        ends_with_letter: bool,
        accounting: bool,
    },

    /// A currency or unit by its localized name, looked up per plural
    /// category.
    Named {
        kind: NameKind,
        plurals: PluralRules,

        /// The pattern used when no name is found, `{0}` standing for the
        /// number.
        fallback: String,
        patterns: RefCell<HashMap<PluralCategory, String>>,
    },
}

/// The symbols of units whose names are commonly missing from locale data, as
/// `(identifier, symbol, narrow symbol, spaced)`.
const UNIT_SYMBOLS: [(&str, &str, &str, bool); 15] = [
    ("bit", "bit", "bit", true),
    ("byte", "byte", "B", true),
    ("kilobit", "kb", "kb", true),
    ("kilobyte", "kB", "kB", true),
    ("megabit", "Mb", "Mb", true),
    ("megabyte", "MB", "MB", true),
    ("gigabit", "Gb", "Gb", true),
    ("gigabyte", "GB", "GB", true),
    ("terabit", "Tb", "Tb", true),
    ("terabyte", "TB", "TB", true),
    ("petabyte", "PB", "PB", true),
    ("celsius", "\u{b0}C", "\u{b0}C", false),
    ("fahrenheit", "\u{b0}F", "\u{b0}F", false),
    ("degree", "deg", "\u{b0}", true),
    ("percent", "%", "%", false),
];

#[optimize(speed)]
fn data_error(err: DataError) -> String {
    err.to_string()
}

impl Decoration {
    #[optimize(speed)]
    fn new(spec: &NumberSpec, locale: &Locale, names: &dyn LocaleData) -> Result<Self, String> {
        match &spec.style {
            spec::NumberStyle::Decimal => Ok(Self::Plain),
            spec::NumberStyle::Percent => {
                let data_locale = DecimalPercentV1::make_locale(locale.into());
                let response: DataResponse<DecimalPercentV1> = Baked
                    .load(DataRequest {
                        id: DataIdentifierBorrowed::for_locale(&data_locale),
                        ..Default::default()
                    })
                    .map_err(data_error)?;

                Ok(Self::Percent(response.payload))
            },
            spec::NumberStyle::Currency {
                code,
                display,
                sign,
            } => {
                let currency: CurrencyType = code
                    .parse()
                    .map_err(|_| format!("Unknown currency `{code}`"))?;

                let preferences: CurrencyFormatterPreferences = locale.into();
                let narrow = match display {
                    spec::CurrencyDisplay::Symbol => Some(false),
                    spec::CurrencyDisplay::NarrowSymbol => Some(true),
                    spec::CurrencyDisplay::Code => None,
                    spec::CurrencyDisplay::Name => {
                        return Self::named(
                            NameKind::Currency(code.clone()),
                            locale,
                            format!("{{0}} {}", currency.iso_code()),
                        );
                    },
                };

                let data_locale = CurrencyEssentialsV1::make_locale(preferences.locale_preferences);
                let essentials: DataResponse<CurrencyEssentialsV1> = Baked
                    .load(DataRequest {
                        id: DataIdentifierBorrowed::for_locale(&data_locale),
                        ..Default::default()
                    })
                    .map_err(data_error)?;

                let decimal_preferences: DecimalFormatterPreferences = (&preferences).into();
                let symbols: DataResponse<DecimalSymbolsV1> = CurrencySymbolsProvider(currency)
                    .load(DataRequest {
                        id: DataIdentifierBorrowed::for_locale(&DecimalSymbolsV1::make_locale(
                            decimal_preferences.locale_preferences,
                        )),
                        ..Default::default()
                    })
                    .map_err(data_error)?;

                let symbol = narrow
                    .and_then(|narrow| names.currency_symbol(&locale.to_string(), code, narrow))
                    .unwrap_or_else(|| CurrencySymbol {
                        text: currency.iso_code().to_string(),
                        starts_with_letter: true,
                        ends_with_letter: true,
                    });

                Ok(Self::Currency {
                    essentials: essentials.payload,
                    symbols: symbols.payload,
                    text: symbol.text,
                    starts_with_letter: symbol.starts_with_letter,
                    ends_with_letter: symbol.ends_with_letter,
                    accounting: *sign == spec::CurrencySign::Accounting,
                })
            },
            spec::NumberStyle::Unit { unit, display } => {
                let fallback = match UNIT_SYMBOLS.iter().find(|x| x.0 == unit) {
                    Some((_, _, narrow, _)) if *display == spec::UnitDisplay::Narrow => {
                        format!("{{0}}{narrow}")
                    },
                    Some((_, symbol, _, true)) => format!("{{0}} {symbol}"),
                    Some((_, symbol, _, false)) => format!("{{0}}{symbol}"),
                    None => format!("{{0}} {unit}"),
                };

                Self::named(
                    NameKind::Unit {
                        unit: unit.clone(),
                        display: *display,
                    },
                    locale,
                    fallback,
                )
            },
        }
    }

    #[optimize(speed)]
    fn named(kind: NameKind, locale: &Locale, fallback: String) -> Result<Self, String> {
        Ok(Self::Named {
            kind,
            plurals: PluralRules::try_new_cardinal(locale.into()).map_err(data_error)?,
            fallback,
            patterns: RefCell::default(),
        })
    }
}

/// Renders numbers by one [`NumberSpec`] in one locale.
pub struct NumberRenderer {
    spec: NumberSpec,
    number: DecimalFormatter,
    compact: Option<CompactDecimalFormatter>,
    decoration: Decoration,
    locale: String,
    names: Rc<dyn LocaleData>,
}

impl NumberRenderer {
    #[optimize(speed)]
    pub fn new(
        spec: &NumberSpec,
        locales: &[String],
        names: Rc<dyn LocaleData>,
    ) -> Result<Self, String> {
        let locale = locale(locales);
        let grouping = match spec.grouping {
            spec::Grouping::Always => GroupingStrategy::Always,
            spec::Grouping::Auto => GroupingStrategy::Auto,
            spec::Grouping::Min2 => GroupingStrategy::Min2,
            spec::Grouping::Never => GroupingStrategy::Never,
        };

        let options: DecimalFormatterOptions = grouping.into();
        let decoration = Decoration::new(spec, &locale, &*names)?;
        let number = match (&decoration, &spec.style) {
            (Decoration::Currency { .. }, spec::NumberStyle::Currency { code, .. }) => {
                let currency: CurrencyType = code
                    .parse()
                    .map_err(|_| format!("Unknown currency `{code}`"))?;

                let preferences: CurrencyFormatterPreferences = (&locale).into();
                DecimalFormatter::try_new_unstable(
                    &CurrencySymbolsProvider(currency),
                    (&preferences).into(),
                    options,
                )
            },
            _ => DecimalFormatter::try_new((&locale).into(), options),
        }
        .map_err(data_error)?;

        let compact = match spec.notation {
            spec::Notation::Compact(display) => {
                let preferences: CompactDecimalFormatterPreferences = (&locale).into();
                let options = grouping.into();
                Some(
                    match display {
                        spec::CompactDisplay::Short => {
                            CompactDecimalFormatter::try_new_short(preferences, options)
                        },
                        spec::CompactDisplay::Long => {
                            CompactDecimalFormatter::try_new_long(preferences, options)
                        },
                    }
                    .map_err(data_error)?,
                )
            },
            _ => None,
        };

        Ok(Self {
            spec: spec.clone(),
            number,
            compact,
            decoration,
            locale: locale.to_string(),
            names,
        })
    }

    /// The power of ten a number whose leading digit has `magnitude` is
    /// divided by before its digits are shown.
    #[optimize(speed)]
    fn exponent_for(&self, magnitude: i16) -> i16 {
        match (&self.spec.notation, &self.compact) {
            (spec::Notation::Scientific, _) => magnitude,
            (spec::Notation::Engineering, _) => magnitude.div_euclid(3) * 3,
            (spec::Notation::Compact(_), Some(compact)) => {
                i16::from(compact.compact_exponent_for_magnitude(magnitude))
            },
            _ => 0,
        }
    }

    /// Round `decimal` in place, first dividing it by the power of ten its
    /// notation calls for, and return that power.
    #[optimize(speed)]
    fn scale(&self, decimal: &mut Decimal) -> i16 {
        if self.spec.notation == spec::Notation::Standard || decimal.absolute.is_zero() {
            digits::round(decimal, &self.spec);
            return 0;
        }

        let magnitude = decimal.absolute.nonzero_magnitude_start();
        let scaled = |exponent: i16| {
            let mut scaled = decimal.clone();
            scaled.multiply_pow10(-exponent);
            digits::round(&mut scaled, &self.spec);
            scaled
        };

        let mut exponent = self.exponent_for(magnitude);
        let mut rounded = scaled(exponent);
        if !rounded.absolute.is_zero()
            && rounded.absolute.nonzero_magnitude_start() != magnitude - exponent
        {
            exponent = self.exponent_for(magnitude + 1);
            rounded = scaled(exponent);
        }

        *decimal = rounded;
        exponent
    }

    /// Append the digits of `decimal` in this renderer's notation.
    #[optimize(speed)]
    fn write_number(&self, decimal: &Decimal, exponent: i16, out: &mut String) {
        let _ = match (&self.spec.notation, &self.compact) {
            (spec::Notation::Scientific | spec::Notation::Engineering, _) => self
                .number
                .format(decimal)
                .write_to(out)
                .map(|_| out.push('E'))
                .and_then(|_| self.number.format(&Decimal::from(exponent)).write_to(out)),
            (spec::Notation::Compact(_), Some(compact)) => {
                match compact.format_with_exponent(decimal, exponent.clamp(0, 255) as u8) {
                    Ok(formatted) => formatted.write_to(out),
                    Err(_) => self.number.format(decimal).write_to(out),
                }
            },
            _ => self.number.format(decimal).write_to(out),
        };
    }

    /// Append the text of `value` to `out`.
    #[optimize(speed)]
    pub fn write(&self, value: f64, out: &mut String) {
        let Ok(mut decimal) = Decimal::try_from_f64(value, FloatPrecision::RoundTrip) else {
            out.push_str(if value.is_nan() {
                "NaN"
            } else if value > 0. {
                "\u{221e}"
            } else {
                "-\u{221e}"
            });

            return;
        };

        if self.spec.style == spec::NumberStyle::Percent {
            decimal.multiply_pow10(2);
        }

        let exponent = self.scale(&mut decimal);
        digits::finish(&mut decimal, &self.spec);
        let unsigned = || {
            let mut number = String::new();
            let absolute = decimal.clone().with_sign(Sign::None);
            self.write_number(&absolute, exponent, &mut number);
            number
        };

        let _ = match &self.decoration {
            Decoration::Plain => {
                self.write_number(&decimal, exponent, out);
                Ok(())
            },
            Decoration::Percent(essentials) => {
                let essentials = essentials.get();
                let number = unsigned();
                match decimal.sign() {
                    Sign::Negative => essentials
                        .signed_pattern
                        .interpolate((number.as_str(), &*essentials.minus_sign))
                        .write_to(out),
                    Sign::Positive => essentials
                        .signed_pattern
                        .interpolate((number.as_str(), &*essentials.plus_sign))
                        .write_to(out),
                    Sign::None => essentials
                        .unsigned_pattern
                        .interpolate([number.as_str()])
                        .write_to(out),
                }
            },
            Decoration::Currency {
                essentials,
                symbols,
                text,
                starts_with_letter,
                ends_with_letter,
                accounting,
            } => {
                let essentials = essentials.get();
                let (starts, ends) = (*starts_with_letter, *ends_with_letter);
                let number = unsigned();
                let negative = match (decimal.sign(), accounting) {
                    (Sign::Negative, true) => essentials.get_negative_accounting(starts, ends),
                    (Sign::Negative, false) => essentials.get_negative(starts, ends),
                    _ => None,
                };

                match negative {
                    Some(pattern) => pattern
                        .interpolate((number.as_str(), text.as_str()))
                        .write_to(out),
                    None => {
                        let strings = &symbols.get().strings;
                        let (prefix, suffix) = match decimal.sign() {
                            Sign::None => ("", ""),
                            Sign::Negative => {
                                (strings.minus_sign_prefix(), strings.minus_sign_suffix())
                            },
                            Sign::Positive => {
                                (strings.plus_sign_prefix(), strings.plus_sign_suffix())
                            },
                        };

                        let pattern = if *accounting {
                            essentials.get_positive_accounting(starts, ends)
                        } else {
                            essentials.get_positive(starts, ends)
                        };

                        out.push_str(prefix);
                        let written = pattern
                            .interpolate((number.as_str(), text.as_str()))
                            .write_to(out);

                        out.push_str(suffix);
                        written
                    },
                }
            },
            Decoration::Named {
                kind,
                plurals,
                fallback,
                patterns,
            } => {
                let mut number = String::new();
                self.write_number(&decimal, exponent, &mut number);
                let mut patterns = patterns.borrow_mut();
                let pattern = patterns
                    .entry(plurals.category_for(&decimal))
                    .or_insert_with(|| {
                        let absolute = decimal.absolute.to_string().parse().unwrap_or(0.);
                        let fraction_digits =
                            (-decimal.absolute.magnitude_range().start()).clamp(0, 255) as u8;

                        self.names
                            .pattern(&self.locale, kind, absolute, fraction_digits)
                            .unwrap_or_else(|| fallback.clone())
                    });

                out.push_str(&pattern.replacen("{0}", &number, 1));
                Ok(())
            },
        };
    }
}

/// The number of fraction digits amounts in the currency `code` are shown
/// with, `2` when it is not known.
#[optimize(speed)]
pub fn currency_digits(code: &str) -> u8 {
    let Ok(currency) = code.parse::<CurrencyType>() else {
        return 2;
    };

    let fractions: Result<DataResponse<CurrencyFractionsV1>, DataError> =
        Baked.load(Default::default());

    fractions
        .map(|x| x.payload.get().resolve(currency).digits)
        .unwrap_or(2)
}
