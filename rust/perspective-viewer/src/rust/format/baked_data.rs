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

use fixed_decimal::{Decimal, FloatPrecision, SignedRoundingMode, UnsignedRoundingMode};
use icu_datetime::fieldsets::builder::{FieldSetBuilder, ZoneStyle};
use icu_datetime::fieldsets::enums::ZoneFieldSet;
use icu_datetime::input::{TimeZone, UtcOffset};
use icu_datetime::{DateTimeFormatterPreferences, NoCalendarFormatter};
use icu_decimal::DecimalFormatter;
use icu_experimental::dimension::currency::CurrencyType;
use icu_experimental::dimension::currency::formatter::{
    CurrencyFormatter, CurrencyFormatterPreferences,
};
use icu_experimental::dimension::provider::currency::symbols::{
    CurrencySymbolWidth, CurrencySymbolsV1,
};
use icu_experimental::dimension::provider::units::categorized_display_names::*;
use icu_experimental::dimension::provider::units::display_names::UnitsDisplayNames;
use icu_experimental::provider::Baked;
use icu_locale_core::Locale;
use icu_locale_core::preferences::LocalePreferences;
use icu_plurals::PluralRules;
use icu_provider::marker::ErasedMarker;
use icu_provider::prelude::*;
use icu_time::zone::ZoneNameTimestamp;
use writeable::Writeable;

use super::locale_data::{CurrencySymbol, LocaleData, NameKind, OffsetSpan};
use super::number::currency_digits;
use super::spec::UnitDisplay;

type UnitNames = DataPayload<ErasedMarker<UnitsDisplayNames<'static>>>;

/// Looks up time zone rules and localized names in the data linked into
/// this binary.
pub struct BakedData;

#[optimize(speed)]
fn load_unit_names<M>(preferences: LocalePreferences, attributes: &str) -> Option<(UnitNames, bool)>
where
    M: DataMarker<DataStruct = UnitsDisplayNames<'static>>,
    Baked: DataProvider<M>,
{
    let attributes = DataMarkerAttributes::try_from_str(attributes).ok()?;
    let locale = M::make_locale(preferences);
    let mut metadata = DataRequestMetadata::default();
    metadata.silent = true;
    let response = DataProvider::<M>::load(&Baked, DataRequest {
        id: DataIdentifierBorrowed::for_marker_attributes_and_locale(attributes, &locale),
        metadata,
    })
    .ok()?;

    let is_root = response
        .metadata
        .locale
        .as_ref()
        .is_some_and(|x| x.is_unknown());

    Some((response.payload.cast(), is_root))
}

/// The localized names of `unit`, preferring any the locale itself defines
/// over the root abbreviation.
#[optimize(speed)]
fn unit_names(
    preferences: LocalePreferences,
    unit: &str,
    display: UnitDisplay,
) -> Option<UnitNames> {
    let width = match display {
        UnitDisplay::Short => "short",
        UnitDisplay::Narrow => "narrow",
        UnitDisplay::Long => "long",
    };

    let attributes = format!("{width}-{unit}");
    let mut root = None;
    macro_rules! find {
        ($($marker:ident),*) => {$(
            match load_unit_names::<$marker>(preferences, &attributes) {
                Some((names, false)) => return Some(names),
                Some((names, true)) => root = root.or(Some(names)),
                None => {},
            }
        )*};
    }

    find!(
        UnitsNamesAreaCoreV1,
        UnitsNamesAreaExtendedV1,
        UnitsNamesAreaOutlierV1,
        UnitsNamesDurationCoreV1,
        UnitsNamesDurationExtendedV1,
        UnitsNamesDurationOutlierV1,
        UnitsNamesLengthCoreV1,
        UnitsNamesLengthExtendedV1,
        UnitsNamesLengthOutlierV1,
        UnitsNamesMassCoreV1,
        UnitsNamesMassExtendedV1,
        UnitsNamesMassOutlierV1,
        UnitsNamesVolumeCoreV1,
        UnitsNamesVolumeExtendedV1,
        UnitsNamesVolumeOutlierV1
    );

    root
}

/// `value` with exactly `fraction_digits` fraction digits.
#[optimize(speed)]
fn decimal(value: f64, fraction_digits: i16) -> Option<Decimal> {
    let mut decimal = Decimal::try_from_f64(value, FloatPrecision::RoundTrip).ok()?;
    decimal.round_with_mode(
        -fraction_digits,
        SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfExpand),
    );

    decimal.absolute.pad_end(-fraction_digits);
    Some(decimal)
}

impl LocaleData for BakedData {
    #[optimize(speed)]
    fn time_zones(&self) -> Vec<String> {
        jiff::tz::db()
            .available()
            .map(|x| x.as_str().to_owned())
            .collect()
    }

    #[optimize(speed)]
    fn utc_offset(&self, zone: &str, epoch_ms: i64) -> Option<OffsetSpan> {
        let zone = jiff::tz::TimeZone::get(zone).ok()?;
        let instant = jiff::Timestamp::from_millisecond(epoch_ms).ok()?;
        let after = instant
            .checked_add(jiff::SignedDuration::from_nanos(1))
            .unwrap_or(instant);

        Some(OffsetSpan {
            offset: zone.to_offset(instant).seconds(),
            start: zone
                .preceding(after)
                .next()
                .map_or(i64::MIN, |x| x.timestamp().as_millisecond()),
            end: zone
                .following(instant)
                .next()
                .map_or(i64::MAX, |x| x.timestamp().as_millisecond()),
        })
    }

    #[optimize(speed)]
    fn currency_symbol(&self, locale: &str, code: &str, narrow: bool) -> Option<CurrencySymbol> {
        let locale = Locale::try_from_str(locale).ok()?;
        let currency: CurrencyType = code.parse().ok()?;
        let preferences: CurrencyFormatterPreferences = (&locale).into();
        let data_locale = CurrencySymbolsV1::make_locale(preferences.locale_preferences);
        let width = if narrow {
            CurrencySymbolWidth::Narrow
        } else {
            CurrencySymbolWidth::Short
        };

        let mut metadata = DataRequestMetadata::default();
        metadata.silent = true;
        let response = DataProvider::<CurrencySymbolsV1>::load(&Baked, DataRequest {
            id: DataIdentifierBorrowed::for_marker_attributes_and_locale(
                CurrencySymbolsV1::make_attributes(currency, width, &mut Default::default()),
                &data_locale,
            ),
            metadata,
        })
        .ok()?;

        let symbol = response.payload.get();
        Some(CurrencySymbol {
            text: symbol.as_str().to_owned(),
            starts_with_letter: symbol.starts_with_letter(),
            ends_with_letter: symbol.ends_with_letter(),
        })
    }

    #[optimize(speed)]
    fn zone_name(&self, locale: &str, zone: &str, epoch_ms: f64, long: bool) -> Option<String> {
        let locale = Locale::try_from_str(locale).ok()?;
        let instant = jiff::Timestamp::from_millisecond(epoch_ms.trunc() as i64).ok()?;
        let offset = jiff::tz::TimeZone::get(zone)
            .ok()?
            .to_offset(instant)
            .seconds();
        let info = TimeZone::from_iana_id(zone)
            .with_offset(UtcOffset::try_from_seconds(offset).ok())
            .with_zone_name_timestamp(ZoneNameTimestamp::from_epoch_seconds(instant.as_second()));

        let mut builder = FieldSetBuilder::new();
        builder.zone_style = Some(if long {
            ZoneStyle::SpecificLong
        } else {
            ZoneStyle::SpecificShort
        });

        let field_set: ZoneFieldSet = builder.build_zone().ok()?;
        let formatter =
            NoCalendarFormatter::try_new(DateTimeFormatterPreferences::from(&locale), field_set)
                .ok()?;

        Some(formatter.format(&info).to_string())
    }

    #[optimize(speed)]
    fn pattern(
        &self,
        locale: &str,
        kind: &NameKind,
        value: f64,
        fraction_digits: u8,
    ) -> Option<String> {
        let locale = Locale::try_from_str(locale).ok()?;
        match kind {
            NameKind::Unit { unit, display } => {
                let names = unit_names((&locale).into(), unit, *display)?;
                let plurals = PluralRules::try_new_cardinal((&locale).into()).ok()?;
                let decimal = decimal(value, i16::from(fraction_digits))?;
                Some(
                    names
                        .get()
                        .get((&decimal).into(), &plurals)
                        .interpolate(("{0}",))
                        .write_to_string()
                        .into_owned(),
                )
            },
            NameKind::Currency(code) => {
                let currency: CurrencyType = code.parse().ok()?;
                let preferences: CurrencyFormatterPreferences = (&locale).into();
                let named = CurrencyFormatter::try_new_name(preferences, currency).ok()?;
                let number =
                    DecimalFormatter::try_new((&preferences).into(), Default::default()).ok()?;
                let decimal = decimal(value, i16::from(currency_digits(code)))?;
                let text = named
                    .format_fixed_decimal(&decimal)
                    .write_to_string()
                    .into_owned();
                let digits = number.format(&decimal).write_to_string().into_owned();
                text.contains(&digits)
                    .then(|| text.replacen(&digits, "{0}", 1))
            },
        }
    }
}
