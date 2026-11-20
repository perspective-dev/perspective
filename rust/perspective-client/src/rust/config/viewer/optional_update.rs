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

use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use ts_rs::TS;

use super::{ColumnConfigMap, TableRef};

/// One field of a field-wise update: absent leaves the field unchanged,
/// `null` resets it to its default and a value replaces it.
#[derive(Clone, Debug, Default, Serialize, PartialEq, TS)]
#[serde(untagged)]
pub enum OptionalUpdate<T: Clone> {
    /// The field was `null`: reset it to its default.
    #[ts(skip)]
    SetDefault,

    /// The field was absent: leave it unchanged.
    #[default]
    Missing,

    /// The field was present: replace it with this value.
    Update(T),
}

/// A `plugin` update.
pub type PluginUpdate = OptionalUpdate<String>;

/// A `settings` update.
pub type SettingsUpdate = OptionalUpdate<bool>;

/// A `theme` update.
pub type ThemeUpdate = OptionalUpdate<String>;

/// A `title` update.
pub type TitleUpdate = OptionalUpdate<String>;

/// A `table` update.
pub type TableUpdate = OptionalUpdate<TableRef>;

/// A `version` update.
pub type VersionUpdate = OptionalUpdate<String>;

/// A `columns_config` update.
pub type ColumnConfigUpdate = OptionalUpdate<ColumnConfigMap>;

/// A `plugin_config` update.
pub type PluginConfigUpdate = OptionalUpdate<serde_json::Map<String, Value>>;

impl<T: Clone> From<Option<T>> for OptionalUpdate<T> {
    fn from(opt: Option<T>) -> Self {
        match opt {
            Some(v) => Self::Update(v),
            None => Self::SetDefault,
        }
    }
}

/// Hand-written because the derived (untagged) schema would list both unit
/// variants. On the wire this is exactly `Option<T>` — `null` resets, a value
/// replaces — and "absent" is the containing field's `#[serde(default)]`,
/// which already makes the property optional.
impl<T: Clone + JsonSchema> JsonSchema for OptionalUpdate<T> {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> Cow<'static, str> {
        format!("OptionalUpdate_{}", T::schema_name()).into()
    }

    fn schema_id() -> Cow<'static, str> {
        format!("OptionalUpdate<{}>", T::schema_id()).into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        <Option<T> as JsonSchema>::json_schema(generator)
    }
}

impl<'a, T> Deserialize<'a> for OptionalUpdate<T>
where
    T: Deserialize<'a> + Clone,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'a>,
    {
        Option::deserialize(deserializer).map(Into::into)
    }
}
