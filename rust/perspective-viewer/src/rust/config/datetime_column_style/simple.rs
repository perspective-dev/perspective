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

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::simple_format::*;

const fn date_style_default() -> SimpleDatetimeFormat {
    SimpleDatetimeFormat::Short
}

const fn time_style_default() -> SimpleDatetimeFormat {
    SimpleDatetimeFormat::Medium
}

/// A datetime column's `date_format` in its `Simple` preset form:
/// `Intl.DateTimeFormatOptions`' `dateStyle`/`timeStyle` presets. This is
/// the default form (no `format` key); setting `format: "custom"` selects
/// the per-part `CustomDatetimeStyleConfig` instead.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct SimpleDatetimeStyleConfig {
    /// An IANA time zone name (e.g. `"America/New_York"`); defaults to the
    /// browser's local time zone.
    #[serde(default)]
    #[serde(rename = "timeZone", skip_serializing_if = "Option::is_none")]
    pub time_zone: Option<String>,

    /// Date preset breadth, or `"disabled"` to omit the date entirely;
    /// defaults to `"short"`.
    #[serde(
        default = "date_style_default",
        rename = "dateStyle",
        skip_serializing_if = "SimpleDatetimeFormat::is_short"
    )]
    pub date_style: SimpleDatetimeFormat,

    /// Time preset breadth, or `"disabled"` to omit the time entirely;
    /// defaults to `"medium"`.
    #[serde(
        default = "time_style_default",
        rename = "timeStyle",
        skip_serializing_if = "SimpleDatetimeFormat::is_medium"
    )]
    pub time_style: SimpleDatetimeFormat,
}

impl Default for SimpleDatetimeStyleConfig {
    fn default() -> Self {
        Self {
            time_zone: None,
            date_style: SimpleDatetimeFormat::Short,
            time_style: SimpleDatetimeFormat::Medium,
        }
    }
}
