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
use std::collections::{BTreeMap, HashMap};
use std::ops::Bound;
use std::rc::Rc;

use icu_calendar::Gregorian;
use icu_datetime::fieldsets::builder::{DateFields, FieldSetBuilder};
use icu_datetime::fieldsets::enums::{CompositeDateTimeFieldSet, TimeFieldSet};
use icu_datetime::input::{DateTime, UtcOffset, ZonedDateTime};
use icu_datetime::options::{Length, SubsecondDigits, TimePrecision};
use icu_datetime::pattern::{DateTimePattern, FixedCalendarDateTimeNames};
use icu_datetime::preferences::HourCycle;
use icu_datetime::provider::fields::{self, FieldLength, FieldSymbol};
use icu_datetime::provider::pattern::{GenericPatternItem, PatternItem, runtime};
use icu_datetime::provider::semantic_skeletons::DatetimePatternsGlueV1;
use icu_datetime::{DateTimeFormatterPreferences, FixedCalendarDateTimeFormatter};
use icu_locale_core::Locale;
use icu_provider::prelude::*;
use writeable::{TryWriteable, Writeable};

use super::locale;
use super::locale_data::{LocaleData, OffsetSpan};
use super::spec::{DatetimeSpec, MonthWidth, NumericWidth, PresetLength, TextWidth};

/// The latest and earliest instants a JavaScript `Date` can hold, in
/// milliseconds.
const MAX_EPOCH_MS: f64 = 8.64e15;

/// What a value that is not an instant renders as.
const INVALID: &str = "-";

/// The space CLDR puts before a day period, which browsers show as a plain
/// space.
const NARROW_NO_BREAK_SPACE: char = '\u{202f}';

/// The names of every time zone that has only ever been UTC.
const UTC_ZONES: [&str; 18] = [
    "UTC",
    "Etc/UTC",
    "Etc/UCT",
    "UCT",
    "Etc/Universal",
    "Universal",
    "Etc/Zulu",
    "Zulu",
    "GMT",
    "Etc/GMT",
    "Etc/GMT0",
    "Etc/GMT+0",
    "Etc/GMT-0",
    "GMT0",
    "GMT+0",
    "GMT-0",
    "Etc/Greenwich",
    "Greenwich",
];

type Formatter = FixedCalendarDateTimeFormatter<Gregorian, CompositeDateTimeFieldSet>;

type Names = FixedCalendarDateTimeNames<Gregorian, CompositeDateTimeFieldSet>;

/// A pattern a part's formatter resolves to, with the names and pattern it
/// is rewritten to when the widths change it.
struct Rewrite {
    source: DateTimePattern,
    rewritten: Option<(Names, DateTimePattern)>,
}

/// An instant, its time zone's UTC offset at it, and its local date and
/// time there.
struct Moment {
    epoch_ms: f64,
    offset: i32,
    local: DateTime<Gregorian>,
}

/// The UTC offsets of a time zone, by instant.
enum Offsets {
    /// A zone that has only ever had this offset.
    Fixed(i32),

    /// Disjoint spans with their offsets, keyed by their starts.
    Spans(RefCell<BTreeMap<i64, OffsetSpan>>),
}

/// Per-field widths a field set cannot carry, applied by rewriting the
/// pattern it resolves to.
#[derive(Clone, Copy, Default, PartialEq, Eq)]
struct Widths {
    weekday: Option<TextWidth>,
    year: Option<NumericWidth>,
    month: Option<MonthWidth>,
    day: Option<NumericWidth>,
    hour: Option<NumericWidth>,
}

/// Which name of the time zone follows the time.
#[derive(Clone, Copy, PartialEq, Eq)]
enum ZoneName {
    Short,
    Long,
}

enum Plan {
    /// A date part and/or a time part, joined by the locale's pattern for
    /// doing so, the time followed by its zone's name.
    Parts {
        date: Option<Box<Formatter>>,
        time: Option<Box<Formatter>>,
        zone: Option<ZoneName>,
        glue: DataPayload<DatetimePatternsGlueV1>,
        widths: Widths,
    },

    /// A minute and/or second with no hour, which no field set covers.
    TimePattern {
        names: FixedCalendarDateTimeNames<(), TimeFieldSet>,
        pattern: DateTimePattern,
    },
}

#[optimize(speed)]
fn error(err: impl core::fmt::Display) -> String {
    err.to_string()
}

#[optimize(speed)]
fn formatter(
    preferences: DateTimeFormatterPreferences,
    builder: FieldSetBuilder,
) -> Result<Formatter, String> {
    let field_set = builder.build_composite_datetime().map_err(error)?;
    Formatter::try_new(preferences, field_set).map_err(error)
}

#[optimize(speed)]
fn time_formatter(
    preferences: DateTimeFormatterPreferences,
    precision: TimePrecision,
) -> Result<Formatter, String> {
    let mut builder = FieldSetBuilder::new();
    builder.time_precision = Some(precision);
    formatter(preferences, builder)
}

#[optimize(speed)]
fn is_numeric(length: FieldLength) -> bool {
    matches!(length, FieldLength::One | FieldLength::Two)
}

/// Whether the month of `pattern` is spelled out rather than numeric, if it
/// has one.
#[optimize(speed)]
fn month_is_text(pattern: &runtime::Pattern) -> Option<bool> {
    pattern.items.iter().find_map(|item| match item {
        PatternItem::Field(field) if matches!(field.symbol, FieldSymbol::Month(_)) => {
            Some(!is_numeric(field.length))
        },
        _ => None,
    })
}

/// `pattern` with the widths of `widths` applied to its fields, or `None`
/// when it has them already.
#[optimize(speed)]
fn rewrite_widths(pattern: &runtime::Pattern, widths: &Widths) -> Option<DateTimePattern> {
    use FieldLength::{Five, Four, One, Six, Three, Two};
    let numeric_length = |x: NumericWidth| match x {
        NumericWidth::TwoDigit => Two,
        NumericWidth::Numeric => One,
    };

    let mut changed = false;
    let items = pattern
        .items
        .iter()
        .map(|item| {
            let PatternItem::Field(mut field) = item else {
                return item;
            };

            let numeric = is_numeric(field.length);
            let length = match field.symbol {
                FieldSymbol::Year(fields::Year::Calendar) if numeric => {
                    widths.year.map(numeric_length)
                },
                FieldSymbol::Day(fields::Day::DayOfMonth) if numeric => {
                    widths.day.map(numeric_length)
                },
                FieldSymbol::Hour(_) if numeric => widths.hour.map(numeric_length),
                FieldSymbol::Month(_) => match (widths.month, numeric) {
                    (Some(MonthWidth::Numeric), true) => Some(One),
                    (Some(MonthWidth::TwoDigit), true) => Some(Two),
                    (Some(MonthWidth::Short), false) => Some(Three),
                    (Some(MonthWidth::Long), false) => Some(Four),
                    (Some(MonthWidth::Narrow), false) => Some(Five),
                    _ => None,
                },
                FieldSymbol::Weekday(kind) if !numeric || kind == fields::Weekday::Format => {
                    match widths.weekday {
                        Some(TextWidth::Short) if matches!(field.length, Four | Five | Six) => {
                            Some(Three)
                        },
                        Some(TextWidth::Long) => Some(Four),
                        Some(TextWidth::Narrow) => Some(Five),
                        _ => None,
                    }
                },
                _ => None,
            };

            if let Some(length) = length {
                changed |= length != field.length;
                field.length = length;
            }

            PatternItem::Field(field)
        })
        .collect::<Vec<_>>();

    changed.then(|| DateTimePattern::from(runtime::Pattern::from(items)))
}

#[optimize(speed)]
fn try_write<T: TryWriteable>(value: T, out: &mut String) -> Result<(), String> {
    match value.try_write_to(out) {
        Ok(_) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

/// The UTC offset in seconds of `zone` when it names a time zone that has
/// only ever had one.
#[optimize(speed)]
fn fixed_offset(zone: &str) -> Option<i32> {
    if UTC_ZONES.iter().any(|x| x.eq_ignore_ascii_case(zone)) {
        return Some(0);
    }

    const PREFIX: &str = "Etc/GMT";
    let rest = zone
        .get(..PREFIX.len())
        .filter(|x| x.eq_ignore_ascii_case(PREFIX))
        .map(|_| &zone[PREFIX.len()..])?;

    let (sign, hours) = match rest.split_at_checked(1)? {
        ("+", hours) => (-1, hours),
        ("-", hours) => (1, hours),
        _ => return None,
    };

    let canonical = matches!(hours.len(), 1 | 2)
        && hours.bytes().all(|x| x.is_ascii_digit())
        && !hours.starts_with('0');

    let hours: i32 = hours.parse().ok().filter(|_| canonical)?;
    (hours <= if sign < 0 { 12 } else { 14 }).then_some(sign * hours * 3600)
}

/// Add `span`, found for `instant`, to `spans`, trimmed to the gap around
/// `instant` and merged with a neighbour it touches at the same offset.
#[optimize(speed)]
fn insert_span(spans: &mut BTreeMap<i64, OffsetSpan>, span: OffsetSpan, instant: i64) {
    let previous = spans.range(..=instant).next_back().map(|(_, x)| *x);
    let next = spans
        .range((Bound::Excluded(instant), Bound::Unbounded))
        .next()
        .map(|(_, x)| *x);

    let mut span = OffsetSpan {
        offset: span.offset,
        start: span
            .start
            .min(instant)
            .max(previous.map_or(i64::MIN, |x| x.end)),
        end: span
            .end
            .max(instant + 1)
            .min(next.map_or(i64::MAX, |x| x.start)),
    };

    if let Some(previous) = previous.filter(|x| x.end == span.start && x.offset == span.offset) {
        spans.remove(&previous.start);
        span.start = previous.start;
    }

    if let Some(next) = next.filter(|x| x.start == span.end && x.offset == span.offset) {
        spans.remove(&next.start);
        span.end = next.end;
    }

    spans.insert(span.start, span);
}

/// The local date and time of the instant `epoch_ms` at `offset` seconds
/// from UTC.
#[optimize(speed)]
fn local(epoch_ms: i64, offset: i32) -> Result<DateTime<Gregorian>, String> {
    let offset =
        UtcOffset::try_from_seconds(offset).map_err(|_| "UTC offset out of range".to_owned())?;

    let local = ZonedDateTime::from_epoch_milliseconds_and_utc_offset(epoch_ms, offset);
    Ok(DateTime {
        date: local.date.to_calendar(Gregorian),
        time: local.time,
    })
}

/// `offset` seconds from UTC as `GMT`, `GMT-5` or `GMT+5:30`.
#[optimize(speed)]
fn offset_name(offset: i32) -> String {
    if offset == 0 {
        return "GMT".to_owned();
    }

    let sign = if offset < 0 { '-' } else { '+' };
    let minutes = offset.unsigned_abs() / 60;
    match minutes % 60 {
        0 => format!("GMT{sign}{}", minutes / 60),
        rest => format!("GMT{sign}{}:{rest:02}", minutes / 60),
    }
}

/// The smallest field set with every date field `spec` asks for, if it asks
/// for any.
#[optimize(speed)]
fn date_fields(spec: &DatetimeSpec) -> Option<DateFields> {
    Some(
        match (
            spec.weekday.is_some(),
            spec.year.is_some(),
            spec.month.is_some(),
            spec.day.is_some(),
        ) {
            (false, false, false, false) => return None,
            (false, true, false, false) => DateFields::Y,
            (false, false, true, false) => DateFields::M,
            (false, true, true, false) => DateFields::YM,
            (false, false, false, true) => DateFields::D,
            (false, false, true, true) => DateFields::MD,
            (false, true, _, true) => DateFields::YMD,
            (true, false, false, false) => DateFields::E,
            (true, false, false, true) => DateFields::DE,
            (true, false, true, _) => DateFields::MDE,
            (true, true, ..) => DateFields::YMDE,
        },
    )
}

/// The formatter for the date `fields`, of whichever length resolves to a
/// month in the form `widths` asks for.
#[optimize(speed)]
fn date_formatter(
    preferences: DateTimeFormatterPreferences,
    fields: DateFields,
    widths: &Widths,
    sample: &DateTime<Gregorian>,
) -> Result<Formatter, String> {
    let lengths: &[Length] = match (widths.month, widths.weekday) {
        (Some(MonthWidth::Numeric | MonthWidth::TwoDigit), _) => &[Length::Short],
        (_, Some(TextWidth::Long)) | (Some(MonthWidth::Long), None) => {
            &[Length::Long, Length::Medium]
        },
        _ => &[Length::Medium, Length::Long],
    };

    let wants_text = widths
        .month
        .map(|x| !matches!(x, MonthWidth::Numeric | MonthWidth::TwoDigit));

    let mut fallback = None;
    for (index, length) in lengths.iter().enumerate() {
        let mut builder = FieldSetBuilder::new();
        builder.date_fields = Some(fields);
        builder.length = Some(*length);
        let formatter = formatter(preferences, builder)?;
        let pattern: runtime::Pattern = formatter.format(sample).pattern().into();
        let matches = match (wants_text, month_is_text(&pattern)) {
            (Some(want), Some(have)) => want == have,
            _ => true,
        };

        if matches || lengths.len() == 1 {
            return Ok(formatter);
        }

        if index == 0 || *length == Length::Long {
            fallback = Some(formatter);
        }
    }

    fallback.ok_or_else(|| "No date format".to_owned())
}

#[optimize(speed)]
fn glue(
    preferences: DateTimeFormatterPreferences,
    attributes: &str,
) -> Result<DataPayload<DatetimePatternsGlueV1>, String> {
    let locale = DatetimePatternsGlueV1::INFO.make_locale(preferences.locale_preferences);
    let response: DataResponse<DatetimePatternsGlueV1> = icu_datetime::provider::Baked
        .load(DataRequest {
            id: DataIdentifierBorrowed::for_marker_attributes_and_locale(
                DataMarkerAttributes::try_from_str(attributes)
                    .map_err(|_| "Unknown date and time joiner".to_owned())?,
                &locale,
            ),
            ..Default::default()
        })
        .map_err(error)?;

    Ok(response.payload)
}

/// The plan for a `dateStyle` and/or `timeStyle`.
#[optimize(speed)]
fn preset_plan(
    preferences: DateTimeFormatterPreferences,
    date_style: Option<PresetLength>,
    time_style: Option<PresetLength>,
) -> Result<Plan, String> {
    let date = date_style
        .map(|style| {
            let (fields, length) = match style {
                PresetLength::Full => (DateFields::YMDE, Length::Long),
                PresetLength::Long => (DateFields::YMD, Length::Long),
                PresetLength::Medium => (DateFields::YMD, Length::Medium),
                PresetLength::Short => (DateFields::YMD, Length::Short),
            };

            let mut builder = FieldSetBuilder::new();
            builder.date_fields = Some(fields);
            builder.length = Some(length);
            formatter(preferences, builder).map(Box::new)
        })
        .transpose()?;

    let time = time_style
        .map(|style| {
            let precision = match style {
                PresetLength::Short => TimePrecision::Minute,
                _ => TimePrecision::Second,
            };

            time_formatter(preferences, precision).map(Box::new)
        })
        .transpose()?;

    let zone = match time_style {
        Some(PresetLength::Full) => Some(ZoneName::Long),
        Some(PresetLength::Long) => Some(ZoneName::Short),
        _ => None,
    };

    let attributes = match date_style {
        Some(PresetLength::Full | PresetLength::Long) => "ldt",
        Some(PresetLength::Medium) => "mdt",
        _ => "sdt",
    };

    Ok(Plan::Parts {
        date,
        time,
        zone,
        glue: glue(preferences, attributes)?,
        widths: Widths::default(),
    })
}

#[optimize(speed)]
fn plan(
    spec: &DatetimeSpec,
    preferences: DateTimeFormatterPreferences,
    sample: &DateTime<Gregorian>,
) -> Result<Plan, String> {
    if spec.date_style.is_some() || spec.time_style.is_some() {
        return preset_plan(preferences, spec.date_style, spec.time_style);
    }

    let subsecond = match spec.fractional_second_digits {
        None => None,
        Some(1) => Some(SubsecondDigits::S1),
        Some(2) => Some(SubsecondDigits::S2),
        Some(_) => Some(SubsecondDigits::S3),
    };

    let has_time = spec.hour.is_some()
        || spec.minute.is_some()
        || spec.second.is_some()
        || subsecond.is_some();

    let precision =
        spec.hour.map(
            |_| match (subsecond, spec.second.is_some(), spec.minute.is_some()) {
                (Some(digits), ..) => TimePrecision::Subsecond(digits),
                (None, true, _) => TimePrecision::Second,
                (None, false, true) => TimePrecision::Minute,
                (None, false, false) => TimePrecision::Hour,
            },
        );

    let (fields, widths) = match date_fields(spec) {
        None if !has_time => (Some(DateFields::YMD), Widths {
            year: Some(NumericWidth::Numeric),
            month: Some(MonthWidth::Numeric),
            day: Some(NumericWidth::Numeric),
            ..Widths::default()
        }),
        fields => (fields, Widths {
            weekday: spec.weekday,
            year: spec.year,
            month: spec.month,
            day: spec.day,
            hour: match (spec.hour, precision) {
                (Some(NumericWidth::Numeric), Some(TimePrecision::Hour)) => None,
                (hour, _) => hour,
            },
        }),
    };

    let time = if let Some(precision) = precision {
        Some(Box::new(time_formatter(preferences, precision)?))
    } else if !has_time {
        None
    } else if fields.is_some() {
        return Err("`minute` and `second` need an `hour` beside date fields".to_owned());
    } else {
        let mut pattern = match (
            spec.minute.is_some(),
            spec.second.is_some() || subsecond.is_some(),
        ) {
            (true, true) => "mm:ss",
            (true, false) => "m",
            (false, _) => "s",
        }
        .to_owned();

        if let Some(digits) = spec.fractional_second_digits {
            pattern.push('.');
            pattern.push_str(&"S".repeat(usize::from(digits.clamp(1, 3))));
        }

        let pattern = DateTimePattern::try_from_pattern_str(&pattern).map_err(error)?;
        let mut names = FixedCalendarDateTimeNames::try_new(preferences).map_err(error)?;
        names.include_for_pattern(&pattern).map_err(error)?;
        return Ok(Plan::TimePattern { names, pattern });
    };

    let date = fields
        .map(|fields| date_formatter(preferences, fields, &widths, sample).map(Box::new))
        .transpose()?;

    let attributes = match widths.month {
        Some(MonthWidth::Long) => "ldt",
        Some(MonthWidth::Short) => "mdt",
        _ => "sdt",
    };

    Ok(Plan::Parts {
        date,
        time,
        zone: None,
        glue: glue(preferences, attributes)?,
        widths,
    })
}

/// Renders instants by one [`DatetimeSpec`] in one locale, in the Gregorian
/// calendar.
pub struct DatetimeRenderer {
    zone_id: String,
    locale: String,
    preferences: DateTimeFormatterPreferences,
    plan: Plan,
    names: Rc<dyn LocaleData>,
    offsets: Offsets,

    /// Every pattern the plan's formatters have resolved to.
    rewrites: RefCell<Vec<Rewrite>>,

    /// The zone's name at each UTC offset it has been shown at.
    zone_names: RefCell<HashMap<i32, String>>,
}

impl DatetimeRenderer {
    #[optimize(speed)]
    pub fn new(
        spec: &DatetimeSpec,
        locales: &[String],
        names: Rc<dyn LocaleData>,
    ) -> Result<Self, String> {
        let locale: Locale = locale(locales);
        let mut preferences = DateTimeFormatterPreferences::from(&locale);
        match spec.hour12 {
            Some(true) => preferences.hour_cycle = Some(HourCycle::Clock12),
            Some(false) => preferences.hour_cycle = Some(HourCycle::Clock24),
            None => {},
        }

        let offsets = match fixed_offset(&spec.time_zone) {
            Some(offset) => Offsets::Fixed(offset),
            None => {
                let span = names
                    .utc_offset(&spec.time_zone, 0)
                    .ok_or_else(|| format!("Unknown time zone `{}`", spec.time_zone))?;

                let mut spans = BTreeMap::new();
                insert_span(&mut spans, span, 0);
                Offsets::Spans(RefCell::new(spans))
            },
        };

        Ok(Self {
            plan: plan(spec, preferences, &local(0, 0)?)?,
            zone_id: spec.time_zone.clone(),
            locale: locale.to_string(),
            preferences,
            names,
            offsets,
            rewrites: RefCell::default(),
            zone_names: RefCell::default(),
        })
    }

    /// The zone's UTC offset in seconds at the instant `epoch_ms`.
    #[optimize(speed)]
    fn offset(&self, epoch_ms: i64) -> Result<i32, String> {
        let spans = match &self.offsets {
            Offsets::Fixed(offset) => return Ok(*offset),
            Offsets::Spans(spans) => spans,
        };

        let found = spans
            .borrow()
            .range(..=epoch_ms)
            .next_back()
            .map(|(_, x)| *x)
            .filter(|x| epoch_ms < x.end);

        if let Some(span) = found {
            return Ok(span.offset);
        }

        let span = self
            .names
            .utc_offset(&self.zone_id, epoch_ms)
            .ok_or_else(|| format!("Unknown time zone `{}`", self.zone_id))?;

        insert_span(&mut spans.borrow_mut(), span, epoch_ms);
        Ok(span.offset)
    }

    /// Append `input` rendered by `formatter` with `widths` applied.
    #[optimize(speed)]
    fn write_part(
        &self,
        formatter: &Formatter,
        widths: &Widths,
        input: &DateTime<Gregorian>,
        out: &mut String,
    ) -> Result<(), String> {
        let formatted = formatter.format(input);
        if *widths == Widths::default() {
            return formatted.write_to(out).map_err(error);
        }

        let source = formatted.pattern();
        let mut rewrites = self.rewrites.borrow_mut();
        let index = match rewrites.iter().position(|x| x.source == source) {
            Some(index) => index,
            None => {
                let pattern: runtime::Pattern = formatted.pattern().into();
                let rewritten = match rewrite_widths(&pattern, widths) {
                    None => None,
                    Some(pattern) => {
                        let mut names = Names::try_new(self.preferences).map_err(error)?;
                        names.include_for_pattern(&pattern).map_err(error)?;
                        Some((names, pattern))
                    },
                };

                rewrites.push(Rewrite { source, rewritten });
                rewrites.len() - 1
            },
        };

        match &rewrites[index].rewritten {
            None => formatted.write_to(out).map_err(error),
            Some((names, pattern)) => {
                try_write(names.with_pattern_unchecked(pattern).format(input), out)
            },
        }
    }

    /// Append the time part of `input`, followed by the zone's name when
    /// `zone` asks for one.
    #[optimize(speed)]
    fn write_time(
        &self,
        time: &Formatter,
        zone: Option<ZoneName>,
        widths: &Widths,
        moment: &Moment,
        out: &mut String,
    ) -> Result<(), String> {
        self.write_part(time, widths, &moment.local, out)?;
        if let Some(zone) = zone {
            out.push(' ');
            self.write_zone_name(moment, zone == ZoneName::Long, out);
        }

        Ok(())
    }

    #[optimize(speed)]
    fn write_zone_name(&self, moment: &Moment, long: bool, out: &mut String) {
        let mut cache = self.zone_names.borrow_mut();
        let name = cache.entry(moment.offset).or_insert_with(|| {
            self.names
                .zone_name(&self.locale, &self.zone_id, moment.epoch_ms, long)
                .unwrap_or_else(|| offset_name(moment.offset))
        });

        out.push_str(name);
    }

    #[optimize(speed)]
    fn try_write(&self, epoch_ms: f64, out: &mut String) -> Result<(), String> {
        let instant = epoch_ms.trunc() as i64;
        let offset = self.offset(instant)?;
        let moment = Moment {
            epoch_ms,
            offset,
            local: local(instant, offset)?,
        };

        match &self.plan {
            Plan::Parts {
                date,
                time,
                zone,
                glue,
                widths,
            } => match (date, time) {
                (Some(date), Some(time)) => {
                    for item in glue.get().pattern.items.iter() {
                        match item {
                            GenericPatternItem::Placeholder(0) => {
                                self.write_time(time, *zone, widths, &moment, out)?
                            },
                            GenericPatternItem::Placeholder(1) => {
                                self.write_part(date, widths, &moment.local, out)?
                            },
                            GenericPatternItem::Placeholder(_) => {},
                            GenericPatternItem::Literal(x) => out.push(x),
                        }
                    }

                    Ok(())
                },
                (Some(date), None) => self.write_part(date, widths, &moment.local, out),
                (None, Some(time)) => self.write_time(time, *zone, widths, &moment, out),
                (None, None) => Ok(()),
            },
            Plan::TimePattern { names, pattern } => try_write(
                names
                    .with_pattern_unchecked(pattern)
                    .format(&moment.local.time),
                out,
            ),
        }
    }

    /// Append the text of the instant `epoch_ms` to `out`.
    #[optimize(speed)]
    pub fn write(&self, epoch_ms: f64, out: &mut String) {
        let start = out.len();
        let written = if epoch_ms.is_finite() && epoch_ms.abs() <= MAX_EPOCH_MS {
            self.try_write(epoch_ms, out)
        } else {
            Err(String::new())
        };

        if written.is_err() {
            out.truncate(start);
            out.push_str(INVALID);
            return;
        }

        let mut from = start;
        while let Some(found) = out[from..].find(NARROW_NO_BREAK_SPACE) {
            let at = from + found;
            out.replace_range(at..at + NARROW_NO_BREAK_SPACE.len_utf8(), " ");
            from = at + 1;
        }
    }
}

/// Whether the first of `locales` shows hours on a 12-hour clock by default.
#[optimize(speed)]
pub fn prefers_hour12(locales: &[String]) -> bool {
    let preferences = DateTimeFormatterPreferences::from(&locale(locales));
    let (Ok(formatter), Ok(sample)) = (
        time_formatter(preferences, TimePrecision::Hour),
        local(0, 0),
    ) else {
        return false;
    };

    let pattern: runtime::Pattern = formatter.format(&sample).pattern().into();
    pattern.items.iter().any(|item| {
        matches!(
            item,
            PatternItem::Field(field) if matches!(
                field.symbol,
                FieldSymbol::Hour(fields::Hour::H11 | fields::Hour::H12)
            )
        )
    })
}
