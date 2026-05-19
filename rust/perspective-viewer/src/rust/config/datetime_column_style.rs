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

mod color_mode;
mod custom;
mod custom_format;
mod simple;
mod simple_format;

pub use color_mode::*;
pub use custom::*;
pub use custom_format::*;
use serde::{Deserialize, Serialize};
pub use simple::*;
pub use simple_format::*;
use ts_rs::TS;

/// `Simple` case has all default-able keys and must be last!
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
// #[serde(tag = "format", content = "date_format")]
#[serde(untagged)]
pub enum DatetimeFormatType {
    // #[serde(rename = "custom")]
    Custom(CustomDatetimeStyleConfig),
    Simple(SimpleDatetimeStyleConfig),
}

impl Default for DatetimeFormatType {
    fn default() -> Self {
        Self::Simple(SimpleDatetimeStyleConfig::default())
    }
}

impl DatetimeFormatType {
    fn is_simple(&self) -> bool {
        self == &Self::Simple(SimpleDatetimeStyleConfig::default())
    }

    pub fn time_zone(&self) -> &Option<String> {
        match self {
            DatetimeFormatType::Custom(x) => &x.time_zone,
            DatetimeFormatType::Simple(x) => &x.time_zone,
        }
    }

    pub fn time_zone_mut(&mut self) -> &mut Option<String> {
        match self {
            DatetimeFormatType::Custom(x) => &mut x.time_zone,
            DatetimeFormatType::Simple(x) => &mut x.time_zone,
        }
    }
}

/// A model for the JSON serialized style configuration for a column of type
/// `datetime`.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
// #[derive(WasmDescribe!, FromWasmAbi!)]
pub struct DatetimeColumnStyleConfig {
    #[serde(default)]
    #[serde(skip_serializing_if = "DatetimeFormatType::is_simple")]
    pub date_format: DatetimeFormatType,

    #[serde(default)]
    #[serde(skip_serializing_if = "DatetimeColorMode::is_none")]
    pub datetime_color_mode: DatetimeColorMode,

    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(skip)]
    pub color: Option<String>,
}

impl Default for DatetimeColumnStyleConfig {
    fn default() -> Self {
        Self {
            date_format: DatetimeFormatType::Simple(SimpleDatetimeStyleConfig {
                time_zone: Default::default(),
                date_style: SimpleDatetimeFormat::Short,
                time_style: SimpleDatetimeFormat::Medium,
            }),
            datetime_color_mode: Default::default(),
            color: Default::default(),
        }
    }
}
