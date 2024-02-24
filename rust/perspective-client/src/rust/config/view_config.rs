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

use serde::{Deserialize, Serialize};

use super::aggregates::*;
use super::expressions::*;
use super::filters::*;
use super::sort::*;
use crate::proto;
use crate::proto::columns_update;

#[derive(Clone, Debug, Deserialize, Default, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ViewConfig {
    #[serde(default)]
    pub group_by: Vec<String>,

    #[serde(default)]
    pub split_by: Vec<String>,

    #[serde(default)]
    pub columns: Vec<Option<String>>,

    #[serde(default)]
    pub filter: Vec<Filter>,

    #[serde(default)]
    pub sort: Vec<Sort>,

    #[serde(default)]
    pub expressions: Expressions,

    #[serde(default)]
    pub aggregates: HashMap<String, Aggregate>,
}

#[derive(Clone, Debug, Deserialize, Default, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ViewConfigUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub group_by: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub split_by: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub columns: Option<Vec<Option<String>>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub filter: Option<Vec<Filter>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub sort: Option<Vec<Sort>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub expressions: Option<Expressions>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub aggregates: Option<HashMap<String, Aggregate>>,
}

impl From<ViewConfigUpdate> for proto::ViewConfig {
    fn from(value: ViewConfigUpdate) -> Self {
        proto::ViewConfig {
            group_by: value.group_by.unwrap_or_default(),
            split_by: value.split_by.unwrap_or_default(),
            columns: value.columns.map(|x| proto::ColumnsUpdate {
                opt_columns: Some(columns_update::OptColumns::Columns(proto::Columns {
                    columns: x.into_iter().flatten().collect(),
                })),
            }),
            filter: value
                .filter
                .unwrap_or_default()
                .into_iter()
                .map(|x| x.into())
                .collect(),
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
            sort: Some(value.sort),
            expressions: Some(value.expressions),
            aggregates: Some(value.aggregates),
        }
    }
}

impl From<proto::ViewConfig> for ViewConfig {
    fn from(value: proto::ViewConfig) -> Self {
        ViewConfig {
            group_by: value.group_by,
            split_by: value.split_by,
            columns: match value.columns.unwrap().opt_columns {
                Some(columns_update::OptColumns::Columns(x)) => {
                    x.columns.into_iter().map(Some).collect()
                },
                _ => todo!(),
            },
            filter: value.filter.into_iter().map(|x| x.into()).collect(),
            sort: value.sort.into_iter().map(|x| x.into()).collect(),
            expressions: Expressions(value.expressions),
            aggregates: value
                .aggregates
                .into_iter()
                .map(|(x, y)| (x, y.into()))
                .collect(),
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
    pub fn apply_update(&mut self, update: ViewConfigUpdate) -> bool {
        let mut changed = false;
        changed = Self::_apply(&mut self.group_by, update.group_by) || changed;
        changed = Self::_apply(&mut self.split_by, update.split_by) || changed;
        changed = Self::_apply(&mut self.columns, update.columns) || changed;
        changed = Self::_apply(&mut self.filter, update.filter) || changed;
        changed = Self::_apply(&mut self.sort, update.sort) || changed;
        changed = Self::_apply(&mut self.aggregates, update.aggregates) || changed;
        changed = Self::_apply(&mut self.expressions, update.expressions) || changed;
        changed
    }

    pub fn is_aggregated(&self) -> bool {
        !self.group_by.is_empty()
    }

    pub fn is_column_expression_in_use(&self, name: &str) -> bool {
        let name = name.to_owned();
        self.group_by.contains(&name)
            || self.split_by.contains(&name)
            || self.sort.iter().any(|x| x.0 == name)
            || self.filter.iter().any(|x| x.0 == name)
            || self.columns.contains(&Some(name))
    }
}
