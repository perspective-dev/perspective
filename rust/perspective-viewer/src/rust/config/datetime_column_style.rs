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

mod part_format;
mod simple_format;

pub use part_format::*;
use serde::{Deserialize, Serialize};
pub use simple_format::*;
use ts_rs::TS;

/// A datetime column's `date_format`, a subset of `Intl.DateTimeFormatOptions`
/// whose display fields inherit as one group and whose `timeZone` and `hour12`
/// inherit individually.
#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DatetimeFormat {
    /// An IANA time zone name such as `"America/New_York"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub time_zone: Option<String>,

    /// Whether hours use a 12-hour clock.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hour12: Option<bool>,

    /// The date preset, which excludes every per-part field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub date_style: Option<SimpleDatetimeFormat>,

    /// The time preset, which excludes every per-part field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub time_style: Option<SimpleDatetimeFormat>,

    /// The weekday's form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub weekday: Option<DatetimeTextPart>,

    /// The year's form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub year: Option<DatetimeNumericPart>,

    /// The month's form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub month: Option<DatetimeMonthPart>,

    /// The day's form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub day: Option<DatetimeNumericPart>,

    /// The hour's form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hour: Option<DatetimeNumericPart>,

    /// The minute's form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub minute: Option<DatetimeNumericPart>,

    /// The second's form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub second: Option<DatetimeNumericPart>,

    /// Sub-second digits shown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fractional_second_digits: Option<FractionalSecondDigits>,
}

impl DatetimeFormat {
    /// The viewer's own default, below every plugin and override layer.
    pub fn base(with_time: bool) -> Self {
        Self {
            date_style: Some(SimpleDatetimeFormat::Short),
            time_style: with_time.then_some(SimpleDatetimeFormat::Medium),
            ..Self::default()
        }
    }

    /// The per-part shape a switch from preset to per-part display starts from.
    pub fn parts_base(with_time: bool) -> Self {
        let time = with_time.then_some(DatetimeNumericPart::Numeric);
        Self {
            year: Some(DatetimeNumericPart::TwoDigit),
            month: Some(DatetimeMonthPart::Numeric),
            day: Some(DatetimeNumericPart::Numeric),
            hour: time,
            minute: time,
            second: time,
            ..Self::default()
        }
    }

    /// Whether this format sets `dateStyle` or `timeStyle`.
    pub fn has_preset(&self) -> bool {
        self.date_style.is_some() || self.time_style.is_some()
    }

    /// Whether this format sets any per-part display field.
    pub fn has_parts(&self) -> bool {
        self.weekday.is_some()
            || self.year.is_some()
            || self.month.is_some()
            || self.day.is_some()
            || self.hour.is_some()
            || self.minute.is_some()
            || self.second.is_some()
            || self.fractional_second_digits.is_some()
    }

    /// Whether this format sets any display field.
    pub fn has_shape(&self) -> bool {
        self.has_preset() || self.has_parts()
    }

    /// Whether this format sets nothing.
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// This format's display fields alone.
    pub fn shape(&self) -> Self {
        Self {
            time_zone: None,
            hour12: None,
            ..self.clone()
        }
    }

    /// This format with its display fields replaced by `shape`'s.
    pub fn with_shape(&self, shape: &Self) -> Self {
        Self {
            time_zone: self.time_zone.clone(),
            hour12: self.hour12,
            ..shape.shape()
        }
    }

    /// `upper` layered over this format: the display fields of whichever sets
    /// any, `upper` first, and each of `timeZone` and `hour12` from whichever
    /// sets it.
    pub fn overlay(&self, upper: &Self) -> Self {
        let shape = if upper.has_shape() { upper } else { self };
        Self {
            time_zone: upper.time_zone.clone().or_else(|| self.time_zone.clone()),
            hour12: upper.hour12.or(self.hour12),
            ..shape.shape()
        }
    }

    /// The fields of this format that differ from `inherited`, keeping or
    /// dropping the display fields as one group.
    pub fn diff(&self, inherited: &Self) -> Self {
        let shape = if self.has_shape() && self.shape() != inherited.shape() {
            self.shape()
        } else {
            Self::default()
        };

        Self {
            time_zone: self
                .time_zone
                .clone()
                .filter(|tz| Some(tz) != inherited.time_zone.as_ref()),
            hour12: self.hour12.filter(|h| Some(*h) != inherited.hour12),
            ..shape
        }
    }

    /// `Err` when this format sets both preset and per-part display fields,
    /// which `Intl` rejects.
    pub fn validate(&self) -> Result<(), String> {
        if self.has_preset() && self.has_parts() {
            Err(
                "`dateStyle`/`timeStyle` cannot be combined with `weekday`, `year`, `month`, \
                 `day`, `hour`, `minute`, `second` or `fractionalSecondDigits`"
                    .to_owned(),
            )
        } else {
            Ok(())
        }
    }
}

/// The `date_format` key of a datetime column's config entry.
#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct DatetimeColumnStyleConfig {
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, as = "Option<_>")]
    pub date_format: Option<DatetimeFormat>,
}
