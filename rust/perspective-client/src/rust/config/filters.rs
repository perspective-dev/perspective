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

use itertools::Itertools;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::proto;
use crate::proto::scalar;

/// This type represents the ViewConfig serializable type, which must be JSON
/// safe.
#[derive(Clone, Default, Deserialize, Debug, JsonSchema, PartialEq, Serialize, TS)]
#[serde(untagged)]
pub enum Scalar {
    Float(f64),
    String(String),
    Bool(bool),
    // DateTime(i64),
    // Date(String),
    // Int(i32),
    #[default]
    Null,
}

impl From<&str> for Scalar {
    fn from(value: &str) -> Self {
        Self::String(value.into())
    }
}

impl Display for Scalar {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> Result<(), std::fmt::Error> {
        match self {
            Self::Float(x) => write!(fmt, "{x}"),
            Self::String(x) => write!(fmt, "{x}"),
            Self::Bool(x) => write!(fmt, "{x}"),
            Self::Null => write!(fmt, ""),
        }
    }
}

#[derive(Clone, Deserialize, Debug, JsonSchema, PartialEq, Serialize, TS)]
#[serde(untagged)]
pub enum FilterTerm {
    Array(Vec<Scalar>),
    Scalar(#[serde(default)] Scalar),
}

impl<'a, T> From<T> for FilterTerm
where
    T: AsRef<[&'a str]>,
{
    fn from(value: T) -> Self {
        Self::Array(value.as_ref().iter().map(|x| (*x).into()).collect())
    }
}

impl Default for FilterTerm {
    fn default() -> Self {
        Self::Scalar(Scalar::Null)
    }
}

impl Display for FilterTerm {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> Result<(), std::fmt::Error> {
        match self {
            Self::Scalar(x) => {
                write!(fmt, "{x}")?;
            },
            Self::Array(xs) => write!(
                fmt,
                "{}",
                Itertools::intersperse(xs.iter().map(|x| format!("{x}")), ",".to_owned())
                    .collect::<String>()
            )?,
        }

        Ok(())
    }
}

impl FilterTerm {
    pub fn is_null(&self) -> bool {
        matches!(self, FilterTerm::Scalar(Scalar::Null))
    }
}

#[derive(Clone, Deserialize, Debug, JsonSchema, PartialEq, Serialize, TS)]
#[serde()]
pub struct Filter(String, String, #[serde(default)] FilterTerm);

impl Filter {
    pub fn new<T>(column: &str, op: &str, term: T) -> Self
    where
        FilterTerm: From<T>,
    {
        Filter(column.to_string(), op.to_string(), term.into())
    }

    /// A filter whose term is the single scalar `value`.
    pub fn scalar(column: &str, op: &str, value: Scalar) -> Self {
        Filter(
            column.to_string(),
            op.to_string(),
            FilterTerm::Scalar(value),
        )
    }

    pub fn column(&self) -> &str {
        self.0.as_str()
    }

    pub fn op(&self) -> &str {
        self.1.as_str()
    }

    pub fn term(&self) -> &FilterTerm {
        &self.2
    }

    pub fn column_mut(&mut self) -> &mut String {
        &mut self.0
    }

    pub fn op_mut(&mut self) -> &mut String {
        &mut self.1
    }

    pub fn term_mut(&mut self) -> &mut FilterTerm {
        &mut self.2
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq, JsonSchema, TS)]
pub enum FilterReducer {
    #[default]
    #[serde(rename = "and")]
    And,
    #[serde(rename = "or")]
    Or,
}

impl From<Scalar> for proto::Scalar {
    fn from(value: Scalar) -> Self {
        match value {
            Scalar::Float(x) => proto::Scalar {
                scalar: Some(scalar::Scalar::Float(x)),
            },
            Scalar::String(x) => proto::Scalar {
                scalar: Some(scalar::Scalar::String(x)),
            },
            Scalar::Bool(x) => proto::Scalar {
                scalar: Some(scalar::Scalar::Bool(x)),
            },
            Scalar::Null => proto::Scalar {
                scalar: Some(scalar::Scalar::Null(0)),
            },
        }
    }
}

impl From<proto::Scalar> for Scalar {
    fn from(value: proto::Scalar) -> Self {
        match value.scalar {
            Some(scalar::Scalar::Bool(x)) => Scalar::Bool(x),
            Some(scalar::Scalar::String(x)) => Scalar::String(x),
            Some(scalar::Scalar::Float(x)) => Scalar::Float(x),
            Some(scalar::Scalar::Null(_)) => Scalar::Null,
            None => Scalar::Null,
        }
    }
}

impl From<Filter> for proto::view_config::Filter {
    fn from(value: Filter) -> Self {
        proto::view_config::Filter {
            column: value.0,
            op: value.1,
            value: match value.2 {
                FilterTerm::Scalar(x) => vec![x.into()],
                FilterTerm::Array(x) => x.into_iter().map(|x| x.into()).collect(),
            },
        }
    }
}

impl From<proto::view_config::Filter> for Filter {
    fn from(value: proto::view_config::Filter) -> Self {
        Filter(
            value.column,
            value.op,
            if value.value.len() == 1 {
                FilterTerm::Scalar(value.value.into_iter().next().unwrap().into())
            } else {
                FilterTerm::Array(value.value.into_iter().map(|x| x.into()).collect())
            },
        )
    }
}
