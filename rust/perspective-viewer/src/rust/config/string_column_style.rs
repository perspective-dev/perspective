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

use std::fmt::Display;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use strum::EnumIter;
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, EnumIter, PartialEq, Serialize, TS)]
pub enum StringColorMode {
    #[default]
    #[serde(rename = "none")]
    None,

    #[serde(rename = "foreground")]
    Foreground,

    #[serde(rename = "background")]
    Background,

    #[serde(rename = "series")]
    Series,
}

impl Display for StringColorMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let text = match self {
            Self::None => "none",
            Self::Foreground => "foreground",
            Self::Background => "background",
            Self::Series => "series",
        };

        write!(f, "{text}")
    }
}

impl FromStr for StringColorMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "none" => Ok(Self::None),
            "foreground" => Ok(Self::Foreground),
            "background" => Ok(Self::Background),
            "series" => Ok(Self::Series),
            x => Err(format!("Unknown StringColorMode::{x}")),
        }
    }
}

impl StringColorMode {
    pub fn is_none(&self) -> bool {
        self == &Self::None
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, EnumIter, Eq, PartialEq, Serialize, TS)]
pub enum FormatMode {
    #[default]
    #[serde(rename = "none")]
    None,

    #[serde(rename = "link")]
    Link,

    // #[serde(rename = "image")]
    // Image,
    #[serde(rename = "bold")]
    Bold,

    #[serde(rename = "italics")]
    Italics,
}

impl Display for FormatMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let text = match self {
            Self::None => "none",
            Self::Link => "link",
            // Self::Image => "image",
            Self::Bold => "bold",
            Self::Italics => "italics",
        };

        write!(f, "{text}")
    }
}

impl FromStr for FormatMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "none" => Ok(Self::None),
            "link" => Ok(Self::Link),
            // "image" => Ok(Self::Image),
            "bold" => Ok(Self::Bold),
            "italics" => Ok(Self::Italics),
            x => Err(format!("Unknown format mode {x}")),
        }
    }
}

impl FormatMode {
    fn is_none(&self) -> bool {
        self == &Self::None
    }
}

#[derive(Debug, Clone, Default, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct StringColumnStyleConfig {
    #[serde(skip_serializing_if = "FormatMode::is_none")]
    #[serde(default)]
    pub format: FormatMode,

    #[serde(skip_serializing_if = "StringColorMode::is_none")]
    #[serde(default)]
    pub string_color_mode: StringColorMode,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub color: Option<String>,
}
