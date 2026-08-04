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
use ts_rs::TS;

use crate::config::GroupRollupMode;
use crate::proto::get_features_resp::{AggregateArgs, AggregateOptions, ColumnTypeOptions};
use crate::proto::{ColumnType, GetFeaturesResp};

/// Describes the capabilities supported by a virtual server handler.
///
/// This struct is returned by
/// [`VirtualServerHandler::get_features`](super::VirtualServerHandler::get_features)
/// to inform clients about which operations are available.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct Features<'a> {
    /// Whether group-by aggregation is supported.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub group_by: bool,

    /// Which `group_by_rollup_mode` options are supported
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub group_rollup_mode: Vec<GroupRollupMode>,

    /// Whether split-by (pivot) operations are supported.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub split_by: bool,

    /// Available filter operators per column type.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub filter_ops: IndexMap<ColumnType, Vec<Cow<'a, str>>>,

    /// Available aggregate functions per column type.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub aggregates: IndexMap<ColumnType, Vec<AggSpec<'a>>>,

    /// Whether sorting is supported.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub sort: bool,

    /// Whether computed expressions are supported.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub expressions: bool,

    /// Available window aggregates.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub window_aggregates: IndexMap<ColumnType, Vec<crate::config::WindowAggregate>>,

    /// Whether update callbacks are supported.
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub on_update: bool,

    /// The data store has no reliable natural row order
    #[serde(default)]
    #[ts(optional, as = "Option<_>")]
    pub unordered: bool,
}

/// Specification for an aggregate function.
///
/// Aggregates can either take no additional arguments ([`AggSpec::Single`])
/// or require column type arguments ([`AggSpec::Multiple`]).
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
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
            group_rollup_mode: value
                .group_rollup_mode
                .iter()
                .map(|x| crate::proto::GroupRollupMode::from(*x) as i32)
                .collect(),
            split_by: value.split_by,
            expressions: value.expressions,
            on_update: value.on_update,
            sort: value.sort,
            unordered: value.unordered,
            window_aggregates: value
                .window_aggregates
                .iter()
                .map(|(ty, aggs)| {
                    (
                        *ty as u32,
                        crate::proto::get_features_resp::WindowAggregateOptions {
                            options: aggs
                                .iter()
                                .map(|x| crate::proto::WindowAggregate::from(*x) as i32)
                                .collect(),
                        },
                    )
                })
                .collect(),
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
