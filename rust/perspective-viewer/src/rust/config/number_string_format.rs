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

mod enums;
pub use enums::*;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumIter};
use ts_rs::TS;

/// The `style` family of a numeric column's `number_format` — serialized
/// FLATTENED into [`CustomNumberFormatConfig`]'s object, discriminated by
/// the `style` key (`"decimal"` default, `"currency"` + `currency`/
/// `currencyDisplay`/`currencySign`, `"percent"`, `"unit"` + `unit`/
/// `unitDisplay`), mirroring `Intl.NumberFormat` options.
#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, TS)]
#[serde(rename_all = "camelCase", tag = "style")]
pub enum NumberFormatStyle {
    #[default]
    Decimal,
    Currency(CurrencyNumberFormatStyle),
    Percent,
    Unit(UnitNumberFormatStyle),
}

#[derive(Default, Serialize, Deserialize, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase")]
pub enum CurrencyDisplay {
    Code,
    #[default]
    Symbol,
    NarrowSymbol,
    Name,
}

#[derive(Default, Serialize, Deserialize, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase")]
pub enum CurrencySign {
    #[default]
    Standard,
    Accounting,
}

#[derive(Default, Serialize, Deserialize, Debug, PartialEq, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyNumberFormatStyle {
    #[serde(default)]
    pub currency: CurrencyCode,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency_display: Option<CurrencyDisplay>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency_sign: Option<CurrencySign>,
}

#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase")]
pub enum UnitDisplay {
    #[default]
    Short,
    Narrow,
    Long,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct UnitNumberFormatStyle {
    #[serde(default)]
    pub unit: Unit,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit_display: Option<UnitDisplay>,
}

#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase")]
pub enum RoundingPriority {
    #[default]
    Auto,
    MorePrecision,
    LessPrecision,
}

#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase")]
pub enum RoundingMode {
    Ceil,
    Floor,
    Expand,
    Trunc,
    HalfCeil,
    HalfFloor,
    #[default]
    HalfExpand,
    HalfTrunc,
    HalfEven,
}

#[derive(Default, Debug, PartialEq, Clone, TS)]
pub enum RoundingIncrement {
    #[default]
    Auto,
    Custom(f64),
}
impl std::fmt::Display for RoundingIncrement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RoundingIncrement::Auto => f.write_str("Auto"),
            RoundingIncrement::Custom(val) => f.write_fmt(format_args!("{val}")),
        }
    }
}

pub const ROUNDING_INCREMENTS: [f64; 15] = [
    1., 2., 5., 10., 20., 25., 50., 100., 200., 250., 500., 1000., 2000., 2500., 5000.,
];

#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase")]
pub enum TrailingZeroDisplay {
    #[default]
    Auto,
    StripIfInteger,
}

/// The `notation` family of a numeric column's `number_format` —
/// serialized FLATTENED into [`CustomNumberFormatConfig`]'s object,
/// discriminated by the `notation` key (`"standard"` default,
/// `"scientific"`, `"engineering"`, `"compact"` + `compactDisplay`),
/// mirroring `Intl.NumberFormat` options.
#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, TS)]
#[serde(rename_all = "camelCase", tag = "notation")]
pub enum Notation {
    #[default]
    Standard,
    Scientific,
    Engineering,
    Compact(CompactDisplay),
}

#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase", tag = "compactDisplay")]
pub enum CompactDisplay {
    #[default]
    Short,
    Long,
}

#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "snake_case")]
pub enum UseGrouping {
    Always,

    #[default]
    Auto,
    Min2, // default if notation is compact

    #[serde(untagged)]
    False(bool),
}

#[derive(Serialize, Deserialize, Default, Debug, PartialEq, Clone, Copy, EnumIter, Display, TS)]
#[serde(rename_all = "camelCase")]
pub enum SignDisplay {
    #[default]
    Auto,
    Always,
    ExceptZero,
    Negative,
    Never,
}

/// A numeric column's `number_format` (`columns_config` value) —
/// `Intl.NumberFormat`-shaped options, written by the Style tab's number
/// format editor and read by `createNumberFormatter`. The `style` and
/// `notation` families ([`NumberFormatStyle`] / [`Notation`]) are serde-
/// FLATTENED into this object but `#[ts(skip)]`'d (ts-rs cannot flatten
/// `Option<enum>`) — the package's `NumberFormatConfig` re-composes the
/// full wire type as `CustomNumberFormatConfig & Partial<NumberFormatStyle>
/// & Partial<Notation>` (see `column-format.ts`).
#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct CustomNumberFormatConfig {
    #[serde(flatten)]
    #[ts(skip)]
    pub _style: Option<NumberFormatStyle>,

    // see Digit Options
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#minimumintegerdigits
    // these min/max props can all be specified but it results in possible conflicts
    // may consider making them distinct options
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub minimum_integer_digits: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub minimum_fraction_digits: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub maximum_fraction_digits: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub minimum_significant_digits: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub maximum_significant_digits: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub rounding_priority: Option<RoundingPriority>,

    // specific values https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#roundingincrement
    // Only available with automatic rounding priority
    // Cannot be mixed with sigfig rounding. (Does this mean max/min sigfig must be unset?)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub rounding_increment: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub rounding_mode: Option<RoundingMode>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub trailing_zero_display: Option<TrailingZeroDisplay>,

    #[serde(flatten)]
    #[ts(skip)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _notation: Option<Notation>,

    /// NOTE (audit 2026-08-05): serialized values are the STRINGS
    /// `"always"`/`"auto"`/`"min2"` or the untagged BOOLEAN `false` —
    /// the former hand-written TS `useGrouping?: boolean` was wrong for
    /// the string cases.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub use_grouping: Option<UseGrouping>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub sign_display: Option<SignDisplay>,
}

/// The active plugin's `NumberFormat` default overlaid on the built-in
/// `number_format` values.
#[derive(Clone, Debug, PartialEq)]
pub struct NumberFormatDefaults {
    pub is_float: bool,
    pub style: NumberFormatStyle,
    pub notation: Notation,
    pub minimum_integer_digits: f64,
    pub fraction: (f64, f64),
    pub significant: (f64, f64),
    pub rounding_priority: RoundingPriority,
    pub rounding_mode: RoundingMode,
    pub trailing_zero_display: TrailingZeroDisplay,
    pub use_grouping: UseGrouping,
    pub sign_display: SignDisplay,
}

impl NumberFormatDefaults {
    pub fn builtin(is_float: bool) -> Self {
        Self {
            is_float,
            style: NumberFormatStyle::default(),
            notation: Notation::default(),
            minimum_integer_digits: 1.,
            fraction: if is_float { (2., 2.) } else { (0., 0.) },
            significant: (1., 21.),
            rounding_priority: RoundingPriority::default(),
            rounding_mode: RoundingMode::default(),
            trailing_zero_display: TrailingZeroDisplay::default(),
            use_grouping: UseGrouping::default(),
            sign_display: SignDisplay::default(),
        }
    }

    /// Overlay a plugin-declared partial default onto [`Self::builtin`].
    pub fn resolve(spec_default: Option<&CustomNumberFormatConfig>, is_float: bool) -> Self {
        let mut out = Self::builtin(is_float);
        let Some(d) = spec_default else {
            return out;
        };

        if let Some(style) = &d._style {
            out.style = style.clone();
        }

        if let Some(notation) = &d._notation {
            out.notation = notation.clone();
        }

        if let Some(v) = d.minimum_integer_digits {
            out.minimum_integer_digits = v;
        }

        if let Some(v) = d.minimum_fraction_digits {
            out.fraction.0 = v;
        }

        if let Some(v) = d.maximum_fraction_digits {
            out.fraction.1 = v;
        }

        if let Some(v) = d.minimum_significant_digits {
            out.significant.0 = v;
        }

        if let Some(v) = d.maximum_significant_digits {
            out.significant.1 = v;
        }

        if let Some(v) = d.rounding_priority {
            out.rounding_priority = v;
        }

        if let Some(v) = d.rounding_mode {
            out.rounding_mode = v;
        }

        if let Some(v) = d.trailing_zero_display {
            out.trailing_zero_display = v;
        }

        if let Some(v) = d.use_grouping {
            out.use_grouping = v;
        }

        if let Some(v) = d.sign_display {
            out.sign_display = v;
        }

        out
    }
}

impl CustomNumberFormatConfig {
    pub fn filter_default(self, defaults: &NumberFormatDefaults) -> Self {
        let (frac_min, frac_max) = defaults.fraction;
        let rounding_increment = self.rounding_increment;
        let use_grouping = self
            .use_grouping
            .filter(|val| *val != defaults.use_grouping);

        let mut minimum_fraction_digits =
            self.minimum_fraction_digits.filter(|val| *val != frac_min);

        let mut maximum_fraction_digits =
            self.maximum_fraction_digits.filter(|val| *val != frac_max);

        let mut show_frac = defaults.is_float
            && (minimum_fraction_digits.is_some()
                || maximum_fraction_digits.is_some()
                || use_grouping.is_some()
                || matches!(
                    self._style,
                    Some(NumberFormatStyle::Percent | NumberFormatStyle::Unit(_))
                ))
            || !defaults.is_float && matches!(self._style, Some(NumberFormatStyle::Currency(_)));

        // Rounding increment does not work unless `minimum_fraction_digits`
        // and `maximum_fraction_digits` are set to 0.
        if rounding_increment.is_some() {
            show_frac = true;
            minimum_fraction_digits = Some(0.);
            maximum_fraction_digits = Some(0.);
        }

        let minimum_significant_digits = self
            .minimum_significant_digits
            .filter(|val| *val != defaults.significant.0);

        let maximum_significant_digits = self
            .maximum_significant_digits
            .filter(|val| *val != defaults.significant.1);

        let show_sig = minimum_significant_digits.is_some() || maximum_significant_digits.is_some();
        Self {
            _style: self._style.filter(|style| *style != defaults.style),
            minimum_integer_digits: self
                .minimum_integer_digits
                .filter(|val| *val != defaults.minimum_integer_digits),
            minimum_fraction_digits: show_frac
                .then_some(minimum_fraction_digits.unwrap_or(frac_min)),
            maximum_fraction_digits: show_frac
                .then_some(maximum_fraction_digits.unwrap_or(frac_max)),
            minimum_significant_digits: show_sig
                .then_some(minimum_significant_digits.unwrap_or(defaults.significant.0)),
            maximum_significant_digits: show_sig
                .then_some(maximum_significant_digits.unwrap_or(defaults.significant.1)),
            rounding_priority: self
                .rounding_priority
                .filter(|val| *val != defaults.rounding_priority),
            rounding_increment,
            rounding_mode: self
                .rounding_mode
                .filter(|val| *val != defaults.rounding_mode),
            trailing_zero_display: self
                .trailing_zero_display
                .filter(|val| *val != defaults.trailing_zero_display),
            _notation: self
                ._notation
                .filter(|notation| *notation != defaults.notation),
            use_grouping,
            sign_display: self
                .sign_display
                .filter(|val| *val != defaults.sign_display),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig(min: f64, max: f64) -> CustomNumberFormatConfig {
        CustomNumberFormatConfig {
            minimum_significant_digits: Some(min),
            maximum_significant_digits: Some(max),
            ..Default::default()
        }
    }

    #[test]
    fn resolve_overlays_partial_default_on_builtin() {
        let spec = CustomNumberFormatConfig {
            _notation: Some(Notation::Compact(CompactDisplay::Short)),
            minimum_fraction_digits: Some(0.),
            maximum_fraction_digits: Some(1.),
            ..Default::default()
        };

        let defaults = NumberFormatDefaults::resolve(Some(&spec), true);
        assert_eq!(defaults.notation, Notation::Compact(CompactDisplay::Short));
        assert_eq!(defaults.fraction, (0., 1.));
        assert_eq!(defaults.style, NumberFormatStyle::Decimal);
        assert_eq!(defaults.significant, (1., 21.));
        assert_eq!(
            NumberFormatDefaults::resolve(None, true),
            NumberFormatDefaults::builtin(true)
        );
    }

    #[test]
    fn filter_preserves_max_significant_digits() {
        let filtered = sig(1., 5.).filter_default(&NumberFormatDefaults::builtin(true));
        assert_eq!(filtered.minimum_significant_digits, Some(1.));
        assert_eq!(filtered.maximum_significant_digits, Some(5.));

        let filtered = sig(3., 21.).filter_default(&NumberFormatDefaults::builtin(true));
        assert_eq!(filtered.minimum_significant_digits, Some(3.));
        assert_eq!(filtered.maximum_significant_digits, Some(21.));
    }

    #[test]
    fn filter_elides_values_equal_to_resolved_defaults() {
        let defaults = NumberFormatDefaults {
            fraction: (0., 1.),
            notation: Notation::Compact(CompactDisplay::Short),
            ..NumberFormatDefaults::builtin(true)
        };

        let config = CustomNumberFormatConfig {
            _notation: Some(Notation::Compact(CompactDisplay::Short)),
            minimum_fraction_digits: Some(0.),
            maximum_fraction_digits: Some(1.),
            ..Default::default()
        };

        assert_eq!(
            config.filter_default(&defaults),
            CustomNumberFormatConfig::default()
        );
    }

    #[test]
    fn filter_serializes_builtin_values_under_override() {
        let defaults = NumberFormatDefaults {
            notation: Notation::Compact(CompactDisplay::Short),
            ..NumberFormatDefaults::builtin(true)
        };

        let config = CustomNumberFormatConfig {
            _notation: Some(Notation::Standard),
            ..Default::default()
        };

        let filtered = config.filter_default(&defaults);
        assert_eq!(filtered._notation, Some(Notation::Standard));
    }

    #[test]
    fn filter_bakes_fraction_digits_for_percent_style() {
        let config = CustomNumberFormatConfig {
            _style: Some(NumberFormatStyle::Percent),
            ..Default::default()
        };

        let filtered = config.filter_default(&NumberFormatDefaults::builtin(true));
        assert_eq!(filtered._style, Some(NumberFormatStyle::Percent));
        assert_eq!(filtered.minimum_fraction_digits, Some(2.));
        assert_eq!(filtered.maximum_fraction_digits, Some(2.));
    }
}
