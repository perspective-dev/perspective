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
use ts_rs::TS;

use super::{
    CustomNumberFormatConfig, DatetimeColumnStyleConfig, DatetimeColumnStyleDefaultConfig,
    NumberColumnStyleConfig, NumberColumnStyleDefaultConfig, NumberSeriesStyleConfig,
    NumberSeriesStyleDefaultConfig, StringColumnStyleConfig, StringColumnStyleDefaultConfig,
};

fn is_zero(x: &u32) -> bool {
    x == &0
}

/// The value de/serialized and stored in the viewer config.
/// Also passed to the plugin via `plugin.save()`.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct ColumnConfigValues {
    #[serde(default)]
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub symbols: HashMap<String, String>,

    #[serde(flatten)]
    pub datagrid_number_style: NumberColumnStyleConfig,

    #[serde(flatten)]
    pub datagrid_string_style: StringColumnStyleConfig,

    #[serde(flatten)]
    pub datagrid_datetime_style: DatetimeColumnStyleConfig,

    /// Per-column render-glyph config consumed by the Y Bar plugin's
    /// `columns_config["<agg>"].chart_type` router. Flattened at the
    /// JSON boundary; default `{ chart_type: Bar }` serializes empty.
    #[serde(flatten)]
    pub number_series_style: NumberSeriesStyleConfig,

    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number_format: Option<CustomNumberFormatConfig>,

    #[serde(default)]
    #[serde(skip_serializing_if = "is_zero")]
    pub aggregate_depth: u32,
}

#[derive(Debug)]
pub enum ColumnConfigValueUpdate {
    DatagridNumberStyle(Option<NumberColumnStyleConfig>),
    DatagridStringStyle(Option<StringColumnStyleConfig>),
    DatagridDatetimeStyle(Option<DatetimeColumnStyleConfig>),
    Symbols(Option<HashMap<String, String>>),
    CustomNumberStringFormat(Option<CustomNumberFormatConfig>),
    AggregateDepth(u32),
    NumberSeriesStyle(Option<NumberSeriesStyleConfig>),
}

impl ColumnConfigValues {
    pub fn update(self, update: ColumnConfigValueUpdate) -> Self {
        match update {
            ColumnConfigValueUpdate::DatagridNumberStyle(update) => Self {
                datagrid_number_style: update.unwrap_or_default(),
                ..self
            },
            ColumnConfigValueUpdate::DatagridStringStyle(update) => Self {
                datagrid_string_style: update.unwrap_or_default(),
                ..self
            },
            ColumnConfigValueUpdate::DatagridDatetimeStyle(update) => Self {
                datagrid_datetime_style: update.unwrap_or_default(),
                ..self
            },
            ColumnConfigValueUpdate::Symbols(update) => Self {
                symbols: update.unwrap_or_default(),
                ..self
            },
            ColumnConfigValueUpdate::CustomNumberStringFormat(update) => Self {
                number_format: update.filter(|x| x != &CustomNumberFormatConfig::default()),
                ..self
            },
            ColumnConfigValueUpdate::AggregateDepth(aggregate_depth) => Self {
                aggregate_depth,
                ..self
            },
            ColumnConfigValueUpdate::NumberSeriesStyle(update) => Self {
                number_series_style: update.unwrap_or_default(),
                ..self
            },
        }
    }

    pub fn is_empty(&self) -> bool {
        self == &Self::default()
    }
}

/// The controls returned by plugin.column_style_controls.
///
/// This is a way to fill out default values for the given controls.
/// If a control is not given, it will not be rendered. I would like to
/// eventually show these as inactive values.
#[derive(Serialize, Deserialize, PartialEq, Debug, Default)]
pub struct ColumnStyleOpts {
    pub datagrid_number_style: Option<NumberColumnStyleDefaultConfig>,
    pub datagrid_string_style: Option<StringColumnStyleDefaultConfig>,
    pub datagrid_datetime_style: Option<DatetimeColumnStyleDefaultConfig>,
    pub symbols: Option<KeyValueOpts>,
    pub number_string_format: Option<bool>,

    /// Y-series render-glyph picker (Chart Type). Populated by the Y Bar
    /// plugin for numeric aggregate columns.
    pub number_series_style: Option<NumberSeriesStyleDefaultConfig>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum KvPairKeyValue {
    Row,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(untagged)]
pub enum KvPairKeys {
    String(KvPairKeyValue),
    Vec(Vec<String>),
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct KeyValueOpts {
    pub keys: KvPairKeys,
    pub values: Vec<String>,
}

pub type SymbolKVPair = super::kvpair::KVPair<Option<String>, String>;
