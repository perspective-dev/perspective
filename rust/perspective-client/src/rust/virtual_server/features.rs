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

use std::borrow::Cow;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::proto::get_features_resp::{AggregateArgs, AggregateOptions, ColumnTypeOptions};
use crate::proto::{ColumnType, GetFeaturesResp};

/// Describes the capabilities supported by a virtual server handler.
///
/// This struct is returned by
/// [`VirtualServerHandler::get_features`](super::VirtualServerHandler::get_features)
/// to inform clients about which operations are available.
#[derive(Debug, Default, Deserialize, Serialize)]
pub struct Features<'a> {
    /// Whether group-by aggregation is supported.
    #[serde(default)]
    pub group_by: bool,

    /// Whether split-by (pivot) operations are supported.
    #[serde(default)]
    pub split_by: bool,

    /// Available filter operators per column type.
    #[serde(default)]
    pub filter_ops: IndexMap<ColumnType, Vec<Cow<'a, str>>>,

    /// Available aggregate functions per column type.
    #[serde(default)]
    pub aggregates: IndexMap<ColumnType, Vec<AggSpec<'a>>>,

    /// Whether sorting is supported.
    #[serde(default)]
    pub sort: bool,

    /// Whether computed expressions are supported.
    #[serde(default)]
    pub expressions: bool,

    /// Whether update callbacks are supported.
    #[serde(default)]
    pub on_update: bool,
}

/// Specification for an aggregate function.
///
/// Aggregates can either take no additional arguments ([`AggSpec::Single`])
/// or require column type arguments ([`AggSpec::Multiple`]).
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum AggSpec<'a> {
    /// An aggregate function with no additional arguments.
    Single(Cow<'a, str>),
    /// An aggregate function that requires column type arguments.
    Multiple(Cow<'a, str>, Vec<ColumnType>),
}

impl<'a> From<Features<'a>> for GetFeaturesResp {
    fn from(value: Features<'a>) -> GetFeaturesResp {
        GetFeaturesResp {
            group_by: value.group_by,
            split_by: value.split_by,
            expressions: value.expressions,
            on_update: value.on_update,
            sort: value.sort,
            aggregates: value
                .aggregates
                .iter()
                .map(|(dtype, aggs)| {
                    (*dtype as u32, AggregateOptions {
                        aggregates: aggs
                            .iter()
                            .map(|agg| match agg {
                                AggSpec::Single(cow) => AggregateArgs {
                                    name: cow.to_string(),
                                    args: vec![],
                                },
                                AggSpec::Multiple(cow, column_types) => AggregateArgs {
                                    name: cow.to_string(),
                                    args: column_types.iter().map(|x| *x as i32).collect(),
                                },
                            })
                            .collect(),
                    })
                })
                .collect(),
            filter_ops: value
                .filter_ops
                .iter()
                .map(|(ty, options)| {
                    (*ty as u32, ColumnTypeOptions {
                        options: options.iter().map(|x| (*x).to_string()).collect(),
                    })
                })
                .collect(),
        }
    }
}
