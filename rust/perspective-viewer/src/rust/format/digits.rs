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

use fixed_decimal::{
    Decimal, RoundingIncrement, SignDisplay, SignedRoundingMode, UnsignedRoundingMode,
};

use super::spec;

#[optimize(speed)]
fn rounding_mode(mode: spec::RoundingMode) -> SignedRoundingMode {
    match mode {
        spec::RoundingMode::Ceil => SignedRoundingMode::Ceil,
        spec::RoundingMode::Floor => SignedRoundingMode::Floor,
        spec::RoundingMode::Expand => SignedRoundingMode::Unsigned(UnsignedRoundingMode::Expand),
        spec::RoundingMode::Trunc => SignedRoundingMode::Unsigned(UnsignedRoundingMode::Trunc),
        spec::RoundingMode::HalfCeil => SignedRoundingMode::HalfCeil,
        spec::RoundingMode::HalfFloor => SignedRoundingMode::HalfFloor,
        spec::RoundingMode::HalfExpand => {
            SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfExpand)
        },
        spec::RoundingMode::HalfTrunc => {
            SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfTrunc)
        },
        spec::RoundingMode::HalfEven => {
            SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfEven)
        },
    }
}

/// `increment` as a power of ten to shift the rounding position by and the
/// multiple left over.
#[optimize(speed)]
fn split_increment(increment: u16) -> (i16, RoundingIncrement) {
    let mut multiple = increment;
    let mut shift = 0;
    while multiple >= 10 && multiple % 10 == 0 {
        multiple /= 10;
        shift += 1;
    }

    let multiple = match multiple {
        2 => RoundingIncrement::MultiplesOf2,
        5 => RoundingIncrement::MultiplesOf5,
        25 => RoundingIncrement::MultiplesOf25,
        _ => RoundingIncrement::MultiplesOf1,
    };

    (shift, multiple)
}

/// Round `decimal` to `max` fraction digits, keeping at least `min`, and
/// return the magnitude it was rounded at.
#[optimize(speed)]
fn round_fraction(decimal: &mut Decimal, (min, max): spec::Digits, spec: &spec::NumberSpec) -> i16 {
    let (shift, increment) = split_increment(spec.rounding_increment);
    let position = shift - i16::from(max);
    decimal.round_with_mode_and_increment(position, rounding_mode(spec.rounding_mode), increment);
    decimal.absolute.trim_end();
    decimal.absolute.pad_end(-i16::from(min));
    position
}

/// Round `decimal` to `max` significant digits, keeping at least `min`, and
/// return the magnitude it was rounded at.
#[optimize(speed)]
fn round_significant(
    decimal: &mut Decimal,
    (min, max): spec::Digits,
    spec: &spec::NumberSpec,
) -> i16 {
    let position = decimal.absolute.nonzero_magnitude_start() - i16::from(max) + 1;
    decimal.round_with_mode(position, rounding_mode(spec.rounding_mode));
    decimal.absolute.trim_end();
    decimal
        .absolute
        .pad_end(decimal.absolute.nonzero_magnitude_start() - i16::from(min) + 1);

    position
}

/// Round `decimal` as `spec.rounding` describes.
#[optimize(speed)]
pub fn round(decimal: &mut Decimal, spec: &spec::NumberSpec) {
    match spec.rounding {
        spec::Rounding::FractionDigits(fraction) => {
            round_fraction(decimal, fraction, spec);
        },
        spec::Rounding::SignificantDigits(significant) => {
            round_significant(decimal, significant, spec);
        },
        spec::Rounding::MorePrecision {
            fraction,
            significant,
        }
        | spec::Rounding::LessPrecision {
            fraction,
            significant,
        } => {
            let mut by_fraction = decimal.clone();
            let fraction_position = round_fraction(&mut by_fraction, fraction, spec);
            let significant_position = round_significant(decimal, significant, spec);
            let more = matches!(spec.rounding, spec::Rounding::MorePrecision { .. });
            if more != (significant_position <= fraction_position) {
                *decimal = by_fraction;
            }
        },
    }
}

/// Apply the digit padding, trailing zero and sign rules of `spec` to an
/// already rounded `decimal`.
#[optimize(speed)]
pub fn finish(decimal: &mut Decimal, spec: &spec::NumberSpec) {
    decimal.absolute.trim_start();
    decimal
        .absolute
        .pad_start(i16::from(spec.minimum_integer_digits));

    if spec.trailing_zero_display == spec::TrailingZeroDisplay::StripIfInteger {
        decimal.absolute.trim_end_if_integer();
    }

    decimal.apply_sign_display(match spec.sign_display {
        spec::SignDisplay::Auto => SignDisplay::Auto,
        spec::SignDisplay::Always => SignDisplay::Always,
        spec::SignDisplay::ExceptZero => SignDisplay::ExceptZero,
        spec::SignDisplay::Negative => SignDisplay::Negative,
        spec::SignDisplay::Never => SignDisplay::Never,
    });
}
