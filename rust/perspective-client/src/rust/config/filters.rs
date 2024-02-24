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

use itertools::Itertools;
use serde::{Deserialize, Serialize};

use crate::proto;
use crate::proto::scalar;

#[derive(Clone, Deserialize, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Scalar {
    Float(f64),
    String(String),
    Bool(bool),
    DateTime(f64),
    Null,
    // // Can only have one u64 representation ...
    // Date(u64)
    // Int(u32)
}

impl Display for Scalar {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        match self {
            Self::Float(x) => write!(fmt, "{}", x),
            Self::String(x) => write!(fmt, "{}", x),
            Self::Bool(x) => write!(fmt, "{}", x),
            Self::DateTime(x) => write!(fmt, "{}", x),
            Self::Null => write!(fmt, ""),
        }
    }
}

#[allow(clippy::upper_case_acronyms)]
#[derive(Clone, Copy, Deserialize, Debug, Eq, PartialEq, Serialize)]
#[serde()]
pub enum FilterOp {
    #[serde(rename = "contains")]
    Contains,

    #[serde(rename = "not in")]
    NotIn,

    #[serde(rename = "in")]
    In,

    #[serde(rename = "begins with")]
    BeginsWith,

    #[serde(rename = "ends with")]
    EndsWith,

    #[serde(rename = "is null")]
    IsNull,

    #[serde(rename = "is not null")]
    IsNotNull,

    #[serde(rename = ">")]
    GT,

    #[serde(rename = "<")]
    LT,

    #[serde(rename = "==")]
    EQ,

    #[serde(rename = ">=")]
    GTE,

    #[serde(rename = "<=")]
    LTE,

    #[serde(rename = "!=")]
    NE,
}

impl From<FilterOp> for proto::FilterOp {
    fn from(value: FilterOp) -> Self {
        match value {
            FilterOp::Contains => proto::FilterOp::FilterContains,
            FilterOp::NotIn => proto::FilterOp::FilterNotIn,
            FilterOp::In => proto::FilterOp::FilterIn,
            FilterOp::BeginsWith => proto::FilterOp::FilterBeginsWith,
            FilterOp::EndsWith => proto::FilterOp::FilterEndsWith,
            FilterOp::IsNull => proto::FilterOp::FilterIsNull,
            FilterOp::IsNotNull => proto::FilterOp::FilterIsNotNull,
            FilterOp::GT => proto::FilterOp::FilterGt,
            FilterOp::LT => proto::FilterOp::FilterLt,
            FilterOp::EQ => proto::FilterOp::FilterEq,
            FilterOp::GTE => proto::FilterOp::FilterGteq,
            FilterOp::LTE => proto::FilterOp::FilterLteq,
            FilterOp::NE => proto::FilterOp::FilterNe,
        }
    }
}

impl From<proto::FilterOp> for FilterOp {
    fn from(value: proto::FilterOp) -> Self {
        match value {
            proto::FilterOp::FilterContains => FilterOp::Contains,
            proto::FilterOp::FilterNotIn => FilterOp::NotIn,
            proto::FilterOp::FilterIn => FilterOp::In,
            proto::FilterOp::FilterBeginsWith => FilterOp::BeginsWith,
            proto::FilterOp::FilterEndsWith => FilterOp::EndsWith,
            proto::FilterOp::FilterIsNull => FilterOp::IsNull,
            proto::FilterOp::FilterIsNotNull => FilterOp::IsNotNull,
            proto::FilterOp::FilterGt => FilterOp::GT,
            proto::FilterOp::FilterLt => FilterOp::LT,
            proto::FilterOp::FilterEq => FilterOp::EQ,
            proto::FilterOp::FilterGteq => FilterOp::GTE,
            proto::FilterOp::FilterLteq => FilterOp::LTE,
            proto::FilterOp::FilterNe => FilterOp::NE,
            proto::FilterOp::FilterUnknown => todo!(),
            proto::FilterOp::FilterAnd => todo!(),
            proto::FilterOp::FilterOr => todo!(),
        }
    }
}

impl Display for FilterOp {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        let op = match self {
            Self::Contains => "contains",
            Self::In => "in",
            Self::NotIn => "not in",
            Self::BeginsWith => "begins with",
            Self::EndsWith => "ends with",
            Self::IsNull => "is null",
            Self::IsNotNull => "is not null",
            Self::GT => ">",
            Self::LT => "<",
            Self::EQ => "==",
            Self::GTE => ">=",
            Self::LTE => "<=",
            Self::NE => "!=",
        };

        write!(fmt, "{}", op)
    }
}

impl FromStr for FilterOp {
    type Err = String;

    fn from_str(input: &str) -> std::result::Result<Self, <Self as std::str::FromStr>::Err> {
        match input {
            "contains" => Ok(Self::Contains),
            "in" => Ok(Self::In),
            "not in" => Ok(Self::NotIn),
            "begins with" => Ok(Self::BeginsWith),
            "ends with" => Ok(Self::EndsWith),
            "is null" => Ok(Self::IsNull),
            "is not null" => Ok(Self::IsNotNull),
            ">" => Ok(Self::GT),
            "<" => Ok(Self::LT),
            "==" => Ok(Self::EQ),
            ">=" => Ok(Self::GTE),
            "<=" => Ok(Self::LTE),
            "!=" => Ok(Self::NE),
            x => Err(format!("Unknown filter operator {}", x)),
        }
    }
}

#[derive(Clone, Deserialize, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum FilterTerm {
    Scalar(Scalar),
    Array(Vec<Scalar>),
}

impl Display for FilterTerm {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        match self {
            Self::Scalar(x) => {
                write!(fmt, "{}", x)?;
            },
            Self::Array(xs) => write!(
                fmt,
                "{}",
                Itertools::intersperse(xs.iter().map(|x| format!("{}", x)), ",".to_owned())
                    .collect::<String>()
            )?,
        }

        Ok(())
    }
}

#[derive(Clone, Deserialize, Debug, PartialEq, Serialize)]
#[serde()]
pub struct Filter(pub String, pub FilterOp, pub FilterTerm);

impl From<Scalar> for proto::Scalar {
    fn from(value: Scalar) -> Self {
        match value {
            Scalar::Float(x) => proto::Scalar {
                scalar: Some(scalar::Scalar::FloatScalar(x)),
            },
            Scalar::String(x) => proto::Scalar {
                scalar: Some(scalar::Scalar::StringScalar(x)),
            },
            Scalar::Bool(x) => proto::Scalar {
                scalar: Some(scalar::Scalar::BoolScalar(x)),
            },
            // Scalar::Date(_) => todo!(),
            Scalar::DateTime(x) => proto::Scalar {
                scalar: Some(scalar::Scalar::DatetimeScalar(x as i64)),
            },
            Scalar::Null => proto::Scalar { scalar: None },
        }
    }
}

impl From<proto::Scalar> for Scalar {
    fn from(value: proto::Scalar) -> Self {
        match value.scalar {
            Some(scalar::Scalar::BoolScalar(x)) => Scalar::Bool(x),
            Some(scalar::Scalar::StringScalar(x)) => Scalar::String(x),
            Some(scalar::Scalar::IntScalar(x)) => Scalar::Float(x as f64),
            Some(scalar::Scalar::DateScalar(x)) => Scalar::DateTime(x as f64),
            Some(scalar::Scalar::FloatScalar(x)) => Scalar::Float(x),
            Some(scalar::Scalar::DatetimeScalar(x)) => Scalar::DateTime(x as f64),
            None => todo!(),
        }
    }
}

impl From<Filter> for proto::Filter {
    fn from(value: Filter) -> Self {
        proto::Filter {
            column: value.0,
            op: proto::FilterOp::from(value.1) as i32,
            value: match value.2 {
                // FilterTerm::Scalar(Scalar::String(x)) => vec![x,
                FilterTerm::Scalar(x) => vec![x.into()],
                FilterTerm::Array(x) if x.len() == 1 => x.into_iter().map(|x| x.into()).collect(),
                _ => {
                    todo!("Multi arguments filters")
                },
            },
        }
    }
}

impl From<proto::Filter> for Filter {
    fn from(value: proto::Filter) -> Self {
        Filter(
            value.column,
            FilterOp::from(proto::FilterOp::try_from(value.op).unwrap()),
            if value.value.len() == 1 {
                FilterTerm::Scalar(value.value.into_iter().next().unwrap().into())
            } else {
                FilterTerm::Array(value.value.into_iter().map(|x| x.into()).collect())
            },
        )
    }
}
