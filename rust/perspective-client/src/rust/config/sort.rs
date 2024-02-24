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

use serde::{Deserialize, Serialize};

use crate::proto;

#[derive(Clone, Deserialize, Debug, Eq, PartialEq, Serialize)]
#[serde()]
pub struct Sort(pub String, pub SortDir);

#[derive(Clone, Copy, Deserialize, Debug, Eq, PartialEq, Serialize)]
#[serde()]
pub enum SortDir {
    #[serde(rename = "none")]
    None,

    #[serde(rename = "desc")]
    Desc,

    #[serde(rename = "asc")]
    Asc,

    #[serde(rename = "col desc")]
    ColDesc,

    #[serde(rename = "col asc")]
    ColAsc,

    #[serde(rename = "desc abs")]
    DescAbs,

    #[serde(rename = "asc abs")]
    AscAbs,

    #[serde(rename = "col desc abs")]
    ColDescAbs,

    #[serde(rename = "col asc abs")]
    ColAscAbs,
}

impl Display for SortDir {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        write!(fmt, "{}", match self {
            Self::None => "none",
            Self::Desc => "desc",
            Self::Asc => "asc",
            Self::ColDesc => "col desc",
            Self::ColAsc => "col asc",
            Self::DescAbs => "desc abs",
            Self::AscAbs => "asc abs",
            Self::ColDescAbs => "col desc abs",
            Self::ColAscAbs => "col asc abs",
        })
    }
}

impl SortDir {
    /// Increment the `SortDir` in logical order, given an `abs()` modifier.
    pub fn cycle(&self, split_by: bool, abs: bool) -> Self {
        let order: &[Self] = match (split_by, abs) {
            (false, false) => &[Self::None, Self::Asc, Self::Desc],
            (false, true) => &[Self::None, Self::AscAbs, Self::DescAbs],
            (true, false) => &[
                Self::None,
                Self::Asc,
                Self::Desc,
                Self::ColAsc,
                Self::ColDesc,
            ],
            (true, true) => &[
                Self::None,
                Self::AscAbs,
                Self::DescAbs,
                Self::ColAscAbs,
                Self::ColDescAbs,
            ],
        };

        let index = order.iter().position(|x| x == self).unwrap_or(0);
        order[(index + 1) % order.len()]
    }
}

impl From<SortDir> for proto::SortOp {
    fn from(value: SortDir) -> Self {
        match value {
            SortDir::None => proto::SortOp::SortNone,
            SortDir::Desc => proto::SortOp::SortDesc,
            SortDir::Asc => proto::SortOp::SortAsc,
            SortDir::ColDesc => todo!(),
            SortDir::ColAsc => todo!(),
            SortDir::DescAbs => todo!(),
            SortDir::AscAbs => todo!(),
            SortDir::ColDescAbs => todo!(),
            SortDir::ColAscAbs => todo!(),
        }
    }
}

impl From<proto::SortOp> for SortDir {
    fn from(value: proto::SortOp) -> Self {
        match value {
            proto::SortOp::SortNone => SortDir::None,
            proto::SortOp::SortDesc => SortDir::Desc,
            proto::SortOp::SortAsc => SortDir::Asc,
        }
    }
}

impl From<Sort> for proto::Sort {
    fn from(value: Sort) -> Self {
        proto::Sort {
            column: value.0,
            op: proto::SortOp::from(value.1).into(),
        }
    }
}

impl From<proto::Sort> for Sort {
    fn from(value: proto::Sort) -> Self {
        Sort(
            value.column,
            proto::SortOp::try_from(value.op).unwrap().into(),
        )
    }
}
