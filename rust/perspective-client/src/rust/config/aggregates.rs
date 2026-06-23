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
use ts_rs::TS;

use crate::proto::view_config;

#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize, TS)]
#[serde(untagged)]
pub enum Aggregate {
    SingleAggregate(String),
    MultiAggregate(String, Vec<String>),
}

impl From<&'static str> for Aggregate {
    fn from(value: &'static str) -> Self {
        if value.contains(" by ") {
            let mut parts = value.split(" by ");
            Aggregate::MultiAggregate(
                parts.next().unwrap().into(),
                parts.map(|x| x.into()).collect(),
            )
        } else {
            Aggregate::SingleAggregate(value.into())
        }
    }
}

impl Display for Aggregate {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        match self {
            Self::SingleAggregate(x) => write!(fmt, "{x}")?,
            Self::MultiAggregate(agg, x) => write!(fmt, "{} by {}", agg, x.join(", "))?,
        };
        Ok(())
    }
}

impl From<Aggregate> for view_config::AggList {
    fn from(value: Aggregate) -> Self {
        view_config::AggList {
            aggregations: match value {
                Aggregate::SingleAggregate(x) => vec![x],
                Aggregate::MultiAggregate(x, y) => {
                    vec![x, y.join(",")]
                },
            },
        }
    }
}

impl From<view_config::AggList> for Aggregate {
    fn from(value: view_config::AggList) -> Self {
        if value.aggregations.len() == 1 {
            Aggregate::SingleAggregate(value.aggregations.first().unwrap().clone())
        } else {
            Aggregate::MultiAggregate(
                value.aggregations.first().unwrap().clone(),
                value
                    .aggregations
                    .get(1)
                    .unwrap()
                    .split(",")
                    .map(|x| x.to_owned())
                    .collect(),
            )
        }
    }
}
