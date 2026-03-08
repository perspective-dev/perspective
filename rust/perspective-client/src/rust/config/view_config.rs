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

use std::collections::HashMap;
use std::fmt::Display;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::aggregates::*;
use super::expressions::*;
use super::filters::*;
use super::sort::*;
use crate::proto;
use crate::proto::columns_update;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, TS)]
pub enum GroupRollupMode {
    #[default]
    #[serde(rename = "rollup")]
    Rollup,

    #[serde(rename = "flat")]
    Flat,

    #[serde(rename = "total")]
    Total,
}

impl Display for GroupRollupMode {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        write!(fmt, "{}", match self {
            Self::Rollup => "Rollup",
            Self::Flat => "Flat",
            Self::Total => "Total",
        })
    }
}

impl From<proto::view_config::GroupRollupMode> for GroupRollupMode {
    fn from(value: proto::view_config::GroupRollupMode) -> Self {
        match value {
            proto::view_config::GroupRollupMode::Rollup => Self::Rollup,
            proto::view_config::GroupRollupMode::Flat => Self::Flat,
            proto::view_config::GroupRollupMode::Total => Self::Total,
        }
    }
}

impl From<GroupRollupMode> for proto::view_config::GroupRollupMode {
    fn from(value: GroupRollupMode) -> Self {
        match value {
            GroupRollupMode::Rollup => proto::view_config::GroupRollupMode::Rollup,
            GroupRollupMode::Flat => proto::view_config::GroupRollupMode::Flat,
            GroupRollupMode::Total => proto::view_config::GroupRollupMode::Total,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Default, PartialEq, Serialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ViewConfig {
    #[serde(default)]
    pub group_by: Vec<String>,

    #[serde(default)]
    pub split_by: Vec<String>,

    #[serde(default)]
    pub sort: Vec<Sort>,

    #[serde(default)]
    pub filter: Vec<Filter>,

    // #[serde(skip_serializing_if = "is_default_value")]
    #[serde(default)]
    pub group_rollup_mode: GroupRollupMode,

    #[serde(skip_serializing_if = "is_default_value")]
    #[serde(default)]
    pub filter_op: FilterReducer,

    #[serde(default)]
    pub expressions: Expressions,

    #[serde(default)]
    pub columns: Vec<Option<String>>,

    #[serde(default)]
    pub aggregates: HashMap<String, Aggregate>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub group_by_depth: Option<u32>,
}

fn is_default_value<A: Default + PartialEq>(value: &A) -> bool {
    value == &A::default()
}

#[derive(Clone, Debug, Deserialize, Default, PartialEq, Serialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ViewConfigUpdate {
    /// A group by _groups_ the dataset by the unique values of each column used
    /// as a group by - a close analogue in SQL to the `GROUP BY` statement.
    /// The underlying dataset is aggregated to show the values belonging to
    /// each group, and a total row is calculated for each group, showing
    /// the currently selected aggregated value (e.g. `sum`) of the column.
    /// Group by are useful for hierarchies, categorizing data and
    /// attributing values, i.e. showing the number of units sold based on
    /// State and City. In Perspective, group by are represented as an array
    /// of string column names to pivot, are applied in the order provided;
    /// For example, a group by of `["State", "City", "Postal Code"]` shows
    /// the values for each Postal Code, which are grouped by City,
    /// which are in turn grouped by State.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub group_by: Option<Vec<String>>,

    /// A split by _splits_ the dataset by the unique values of each column used
    /// as a split by. The underlying dataset is not aggregated, and a new
    /// column is created for each unique value of the split by. Each newly
    /// created column contains the parts of the dataset that correspond to
    /// the column header, i.e. a `View` that has `["State"]` as its split
    /// by will have a new column for each state. In Perspective, Split By
    /// are represented as an array of string column names to pivot.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub split_by: Option<Vec<String>>,

    /// The `columns` property specifies which columns should be included in the
    /// [`crate::View`]'s output. This allows users to show or hide a specific
    /// subset of columns, as well as control the order in which columns
    /// appear to the user. This is represented in Perspective as an array
    /// of string column names.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub columns: Option<Vec<Option<String>>>,

    /// The `filter` property specifies columns on which the query can be
    /// filtered, returning rows that pass the specified filter condition.
    /// This is analogous to the `WHERE` clause in SQL. There is no limit on
    /// the number of columns where `filter` is applied, but the resulting
    /// dataset is one that passes all the filter conditions, i.e. the
    /// filters are joined with an `AND` condition.
    ///
    /// Perspective represents `filter` as an array of arrays, with the values
    /// of each inner array being a string column name, a string filter
    /// operator, and a filter operand in the type of the column.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub filter: Option<Vec<Filter>>,

    /// The `sort` property specifies columns on which the query should be
    /// sorted, analogous to `ORDER BY` in SQL. A column can be sorted
    /// regardless of its data type, and sorts can be applied in ascending
    /// or descending order. Perspective represents `sort` as an array of
    /// arrays, with the values of each inner array being a string column
    /// name and a string sort direction. When `column-pivots` are applied,
    /// the additional sort directions `"col asc"` and `"col desc"` will
    /// determine the order of pivot columns groups.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub sort: Option<Vec<Sort>>,

    /// The `expressions` property specifies _new_ columns in Perspective that
    /// are created using existing column values or arbitary scalar values
    /// defined within the expression. In `<perspective-viewer>`,
    /// expressions are added using the "New Column" button in the side
    /// panel.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub expressions: Option<Expressions>,

    /// Aggregates perform a calculation over an entire column, and are
    /// displayed when one or more [Group By](#group-by) are applied to the
    /// `View`. Aggregates can be specified by the user, or Perspective will
    /// use the following sensible default aggregates based on column type:
    ///
    /// - "sum" for `integer` and `float` columns
    /// - "count" for all other columns
    ///
    /// Perspective provides a selection of aggregate functions that can be
    /// applied to columns in the `View` constructor using a dictionary of
    /// column name to aggregate function name.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub aggregates: Option<HashMap<String, Aggregate>>,

    #[serde(skip_serializing)]
    #[serde(default)]
    #[ts(optional)]
    pub group_by_depth: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub filter_op: Option<FilterReducer>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    #[ts(optional)]
    pub group_rollup_mode: Option<GroupRollupMode>,
}

impl From<ViewConfigUpdate> for proto::ViewConfig {
    fn from(value: ViewConfigUpdate) -> Self {
        proto::ViewConfig {
            group_by: value.group_by.unwrap_or_default(),
            split_by: value.split_by.unwrap_or_default(),
            columns: value.columns.map(|x| proto::ColumnsUpdate {
                opt_columns: Some(columns_update::OptColumns::Columns(
                    proto::columns_update::Columns {
                        columns: x.into_iter().flatten().collect(),
                    },
                )),
            }),
            filter: value
                .filter
                .unwrap_or_default()
                .into_iter()
                .map(|x| x.into())
                .collect(),
            filter_op: value
                .filter_op
                .map(proto::view_config::FilterReducer::from)
                .unwrap_or_default() as i32,
            sort: value
                .sort
                .unwrap_or_default()
                .into_iter()
                .map(|x| x.into())
                .collect(),
            expressions: value.expressions.unwrap_or_default().0,
            aggregates: value
                .aggregates
                .unwrap_or_default()
                .into_iter()
                .map(|(x, y)| (x, y.into()))
                .collect(),
            group_by_depth: value.group_by_depth,
            group_rollup_mode: value
                .group_rollup_mode
                .map(|x| proto::view_config::GroupRollupMode::from(x).into()),
        }
    }
}

impl From<FilterReducer> for proto::view_config::FilterReducer {
    fn from(value: FilterReducer) -> Self {
        match value {
            FilterReducer::And => proto::view_config::FilterReducer::And,
            FilterReducer::Or => proto::view_config::FilterReducer::Or,
        }
    }
}

impl From<proto::view_config::FilterReducer> for FilterReducer {
    fn from(value: proto::view_config::FilterReducer) -> Self {
        match value {
            proto::view_config::FilterReducer::And => FilterReducer::And,
            proto::view_config::FilterReducer::Or => FilterReducer::Or,
        }
    }
}

impl From<ViewConfig> for ViewConfigUpdate {
    fn from(value: ViewConfig) -> Self {
        ViewConfigUpdate {
            group_by: Some(value.group_by),
            split_by: Some(value.split_by),
            columns: Some(value.columns),
            filter: Some(value.filter),
            filter_op: Some(value.filter_op),
            sort: Some(value.sort),
            expressions: Some(value.expressions),
            aggregates: Some(value.aggregates),
            group_by_depth: value.group_by_depth,
            group_rollup_mode: Some(value.group_rollup_mode),
        }
    }
}

impl From<proto::ViewConfig> for ViewConfig {
    fn from(value: proto::ViewConfig) -> Self {
        ViewConfig {
            group_by: value.group_by,
            split_by: value.split_by,
            columns: match value.columns.unwrap_or_default().opt_columns {
                Some(columns_update::OptColumns::Columns(x)) => {
                    x.columns.into_iter().map(Some).collect()
                },
                _ => {
                    vec![]
                },
            },
            filter: value.filter.into_iter().map(|x| x.into()).collect(),
            filter_op: proto::view_config::FilterReducer::try_from(value.filter_op)
                .unwrap_or_default()
                .into(),
            sort: value.sort.into_iter().map(|x| x.into()).collect(),
            expressions: Expressions(value.expressions),
            aggregates: value
                .aggregates
                .into_iter()
                .map(|(x, y)| (x, y.into()))
                .collect(),
            group_by_depth: value.group_by_depth,
            group_rollup_mode: value
                .group_rollup_mode
                .map(proto::view_config::GroupRollupMode::try_from)
                .and_then(|x| x.ok())
                .map(|x| x.into())
                .unwrap_or_default(),
        }
    }
}

impl From<ViewConfigUpdate> for ViewConfig {
    fn from(value: ViewConfigUpdate) -> Self {
        ViewConfig {
            group_by: value.group_by.unwrap_or_default(),
            split_by: value.split_by.unwrap_or_default(),
            columns: value.columns.unwrap_or_default(),
            filter: value.filter.unwrap_or_default(),
            filter_op: value.filter_op.unwrap_or_default(),
            sort: value.sort.unwrap_or_default(),
            expressions: value.expressions.unwrap_or_default(),
            aggregates: value.aggregates.unwrap_or_default(),
            group_by_depth: value.group_by_depth,
            group_rollup_mode: value.group_rollup_mode.unwrap_or_default(),
        }
    }
}

impl From<proto::ViewConfig> for ViewConfigUpdate {
    fn from(value: proto::ViewConfig) -> Self {
        ViewConfigUpdate {
            group_by: Some(value.group_by),
            split_by: Some(value.split_by),
            columns: match value.columns.unwrap_or_default().opt_columns {
                Some(columns_update::OptColumns::Columns(x)) => {
                    Some(x.columns.into_iter().map(Some).collect())
                },
                _ => None,
            },
            filter: Some(value.filter.into_iter().map(|x| x.into()).collect()),
            filter_op: Some(
                proto::view_config::FilterReducer::try_from(value.filter_op)
                    .unwrap_or_default()
                    .into(),
            ),
            sort: Some(value.sort.into_iter().map(|x| x.into()).collect()),
            expressions: Some(Expressions(value.expressions)),
            aggregates: Some(
                value
                    .aggregates
                    .into_iter()
                    .map(|(x, y)| (x, y.into()))
                    .collect(),
            ),
            group_by_depth: value.group_by_depth,
            group_rollup_mode: value
                .group_rollup_mode
                .and_then(|x| proto::view_config::GroupRollupMode::try_from(x).ok())
                .map(|x| x.into()),
        }
    }
}

impl ViewConfig {
    fn _apply<T>(field: &mut T, update: Option<T>) -> bool {
        match update {
            None => false,
            Some(update) => {
                *field = update;
                true
            },
        }
    }

    pub fn reset(&mut self, reset_expressions: bool) {
        let mut config = Self::default();
        if !reset_expressions {
            config.expressions = self.expressions.clone();
        }
        std::mem::swap(self, &mut config);
    }

    /// Apply `ViewConfigUpdate` to a `ViewConfig`, ignoring any fields in
    /// `update` which were unset.
    pub fn apply_update(&mut self, mut update: ViewConfigUpdate) -> bool {
        let mut changed = false;
        if ((self.group_rollup_mode == GroupRollupMode::Total
            && update.group_rollup_mode.is_none())
            || update.group_rollup_mode == Some(GroupRollupMode::Total))
            && update
                .group_by
                .as_ref()
                .map(|x| !x.is_empty())
                .unwrap_or_default()
        {
            tracing::warn!("`total` incompatible with `group_by`");
            changed = true;
            update.group_rollup_mode = Some(GroupRollupMode::Rollup);
        }

        if update.group_rollup_mode == Some(GroupRollupMode::Total) && !self.group_by.is_empty() {
            tracing::warn!("`group_by` incompatible with `total`");
            changed = true;
            update.group_by = Some(vec![]);
        }

        changed = Self::_apply(&mut self.group_by, update.group_by) || changed;
        changed = Self::_apply(&mut self.split_by, update.split_by) || changed;
        changed = Self::_apply(&mut self.columns, update.columns) || changed;
        changed = Self::_apply(&mut self.filter, update.filter) || changed;
        changed = Self::_apply(&mut self.sort, update.sort) || changed;
        changed = Self::_apply(&mut self.aggregates, update.aggregates) || changed;
        changed = Self::_apply(&mut self.expressions, update.expressions) || changed;
        changed = Self::_apply(&mut self.group_rollup_mode, update.group_rollup_mode) || changed;
        if self.group_rollup_mode == GroupRollupMode::Total && !self.group_by.is_empty() {
            tracing::warn!("`total` incompatible with `group_by`");
            changed = true;
            self.group_by = vec![];
        }

        changed
    }

    pub fn is_aggregated(&self) -> bool {
        !self.group_by.is_empty() || self.group_rollup_mode == GroupRollupMode::Total
    }

    pub fn is_column_expression_in_use(&self, name: &str) -> bool {
        let name = name.to_owned();
        self.group_by.contains(&name)
            || self.split_by.contains(&name)
            || self.sort.iter().any(|x| x.0 == name)
            || self.filter.iter().any(|x| x.column() == name)
            || self.columns.contains(&Some(name))
    }

    /// `ViewConfig` carries additional metadata in the form of `None` columns
    /// which are filtered befor ebeing passed to the engine, but whose position
    /// is a placeholder for Viewer functionality. `is_equivalent` tests
    /// equivalency from the perspective of the engine.
    pub fn is_equivalent(&self, other: &Self) -> bool {
        let _self = self.clone();
        let _self = ViewConfig {
            columns: _self.columns.into_iter().filter(|x| x.is_some()).collect(),
            .._self
        };

        let _other = other.clone();
        let _other = ViewConfig {
            columns: _other.columns.into_iter().filter(|x| x.is_some()).collect(),
            ..other.clone()
        };

        _self == _other
    }
}
