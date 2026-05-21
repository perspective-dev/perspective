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

use std::ops::Deref;
use std::sync::LazyLock;

use perspective_client::config::*;
use perspective_js::utils::*;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use ts_rs::TS;
use wasm_bindgen::prelude::*;

use crate::renderer::ColumnConfigMap;

/// The state of an entire `custom_elements::PerspectiveViewerElement` component
/// and its `Plugin`.
#[derive(Debug, Default, Serialize, PartialEq, TS)]
#[serde(deny_unknown_fields)]
pub struct ViewerConfig<V: TS = String> {
    pub version: V,
    pub columns_config: ColumnConfigMap,
    pub plugin: String,
    pub plugin_config: serde_json::Map<String, Value>,
    pub settings: bool,
    pub table: Option<String>,
    pub theme: Option<String>,
    pub title: Option<String>,

    #[serde(flatten)]
    pub view_config: ViewConfig,
}

pub static API_VERSION: LazyLock<&'static str> = LazyLock::new(|| {
    #[derive(Deserialize)]
    struct Package {
        version: &'static str,
    }
    let pkg: &'static str = include_str!("../../../package.json");
    let pkg: Package = serde_json::from_str(pkg).unwrap();
    pkg.version
});

impl ViewerConfig {
    /// Encode a `ViewerConfig` to a `JsValue` in a supported type.
    pub fn encode(&self) -> ApiResult<JsValue> {
        Ok(JsValue::from_serde_ext(self)?)
    }
}

#[derive(Clone, Debug, TS, Deserialize, PartialEq, Serialize)]
#[serde(transparent)]
pub struct PluginConfig(serde_json::Value);

impl Deref for PluginConfig {
    type Target = Value;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct ViewerConfigUpdate {
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub version: VersionUpdate,

    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub plugin: PluginUpdate,

    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub title: TitleUpdate,

    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub table: TableUpdate,

    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub theme: ThemeUpdate,

    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub settings: SettingsUpdate,

    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub plugin_config: PluginConfigUpdate,

    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub columns_config: ColumnConfigUpdate,

    #[serde(flatten)]
    pub view_config: ViewConfigUpdate,
}

impl ViewerConfigUpdate {
    /// Decode a `JsValue` into a `ViewerConfigUpdate` by auto-detecting format
    /// from JavaScript type.
    pub fn decode(update: &JsValue) -> ApiResult<Self> {
        Ok(update.into_serde_ext()?)
    }

    pub fn migrate(&self) -> ApiResult<Self> {
        // TODO: Call the migrate script from js
        Ok(self.clone())
    }
}

impl std::fmt::Display for ViewerConfigUpdate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(self).map_err(|_| std::fmt::Error)?
        )
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, TS)]
#[serde(untagged)]
// #[ts(untagged)]
pub enum OptionalUpdate<T: Clone> {
    #[ts(skip)]
    SetDefault,

    // #[ts(skip)]
    // #[ts(type = "undefined")]
    Missing,

    // #[ts(type = "_")]
    // #[ts(untagged)]
    Update(T),
}

pub type PluginUpdate = OptionalUpdate<String>;
pub type SettingsUpdate = OptionalUpdate<bool>;
pub type ThemeUpdate = OptionalUpdate<String>;
pub type TitleUpdate = OptionalUpdate<String>;
pub type TableUpdate = OptionalUpdate<String>;
pub type VersionUpdate = OptionalUpdate<String>;
pub type ColumnConfigUpdate = OptionalUpdate<ColumnConfigMap>;
pub type PluginConfigUpdate = OptionalUpdate<serde_json::Map<String, Value>>;

/// Handles `{}` when included as a field with `#[serde(default)]`.
impl<T: Clone> Default for OptionalUpdate<T> {
    fn default() -> Self {
        Self::Missing
    }
}

/// Handles `{plugin: null}` and `{plugin: val}` by treating this type as an
/// option.
impl<T: Clone> From<Option<T>> for OptionalUpdate<T> {
    fn from(opt: Option<T>) -> Self {
        match opt {
            Some(v) => Self::Update(v),
            None => Self::SetDefault,
        }
    }
}

/// Treats `PluginUpdate` enum as an `Option<T>` when present during
/// deserialization.
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
