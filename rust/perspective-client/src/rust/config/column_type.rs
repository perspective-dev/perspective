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
// use yew::{html, ToHtml};

// #[derive(Serialize, Deserialize, Clone, Copy, PartialEq, PartialOrd, Eq, Ord, Debug, Hash)]
// pub enum Type {
//     #[serde(rename = "string")]
//     String,

//     #[serde(rename = "datetime")]
//     Datetime,

//     #[serde(rename = "date")]
//     Date,

//     #[serde(rename = "integer")]
//     Integer,

//     #[serde(rename = "float")]
//     Float,

//     #[serde(rename = "boolean")]
//     Bool,
// }

// impl ToHtml for ColumnType {
//     fn to_html(&self) -> yew::Html {
//         html! { <span class="type-name">{ self.to_string() }</span> }
//     }
// }

use crate::proto::ColumnType;

impl Display for ColumnType {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        write!(fmt, "{}", match self {
            Self::String => "string",
            Self::Integer => "integer",
            Self::Float => "float",
            Self::Boolean => "boolean",
            Self::Date => "date",
            Self::Datetime => "datetime",
        })
    }
}

impl FromStr for ColumnType {
    type Err = ();

    fn from_str(val: &str) -> Result<Self, Self::Err> {
        Ok(val.into())
    }
}

impl From<&str> for ColumnType {
    fn from(val: &str) -> Self {
        if val == "string" {
            Self::String
        } else if val == "integer" {
            Self::Integer
        } else if val == "float" {
            Self::Float
        } else if val == "boolean" {
            Self::Boolean
        } else if val == "date" {
            Self::Date
        } else if val == "datetime" {
            Self::Datetime
        } else {
            panic!("Unknown type {}", val);
        }
    }
}

impl ColumnType {
    pub fn to_capitalized(&self) -> String {
        match self {
            ColumnType::String => "String",
            ColumnType::Datetime => "Datetime",
            ColumnType::Date => "Date",
            ColumnType::Integer => "Integer",
            ColumnType::Float => "Float",
            ColumnType::Boolean => "Boolean",
        }
        .into()
    }
}
