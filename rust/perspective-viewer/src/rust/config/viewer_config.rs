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
use std::io::{Read, Write};
use std::str::FromStr;
use std::sync::LazyLock;

use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use perspective::utils::*;
use perspective_client::config::*;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use super::view_config::*;
use super::ColumnConfigValues;
use crate::presentation::ColumnConfigMap;
use crate::utils::*;

pub enum ViewerConfigEncoding {
    Json,
    String,
    ArrayBuffer,
    JSONString,
}

impl FromStr for ViewerConfigEncoding {
    type Err = JsValue;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "json" => Ok(Self::Json),
            "string" => Ok(Self::String),
            "arraybuffer" => Ok(Self::ArrayBuffer),
            x => Err(format!("Unknown format \"{}\"", x).into()),
        }
    }
}

/// The state of an entire `custom_elements::PerspectiveViewerElement` component
/// and its `Plugin`.
#[derive(Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ViewerConfig {
    pub version: String,
    pub plugin: String,
    pub plugin_config: Value,
    pub columns_config: ColumnConfigMap,
    pub settings: bool,
    pub theme: Option<String>,
    pub title: Option<String>,

    #[serde(flatten)]
    pub view_config: ViewConfig,
}

// `#[serde(flatten)]` makes messagepack 2x as big as they can no longer be
// struct fields, so make a tuple alternative for serialization in binary.
type ViewerConfigBinarySerialFormat<'a> = (
    &'a String,
    &'a ColumnConfigMap,
    &'a String,
    &'a Value,
    bool,
    &'a Option<String>,
    &'a Option<String>,
    &'a ViewConfig,
);

type ViewerConfigBinaryDeserialFormat = (
    VersionUpdate,
    ColumnConfigUpdate,
    PluginUpdate,
    Option<Value>,
    SettingsUpdate,
    ThemeUpdate,
    TitleUpdate,
    ViewConfigUpdate,
);

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
    fn token(&self) -> ViewerConfigBinarySerialFormat<'_> {
        (
            &self.version,
            &self.columns_config,
            &self.plugin,
            &self.plugin_config,
            self.settings,
            &self.theme,
            &self.title,
            &self.view_config,
        )
    }

    /// Encode a `ViewerConfig` to a `JsValue` in a supported type.
    pub fn encode(&self, format: &Option<ViewerConfigEncoding>) -> ApiResult<JsValue> {
        match format {
            Some(ViewerConfigEncoding::String) => {
                let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
                let bytes = rmp_serde::to_vec(&self.token())?;
                encoder.write_all(&bytes)?;
                let encoded = encoder.finish()?;
                Ok(JsValue::from(base64::encode(encoded)))
            },
            Some(ViewerConfigEncoding::ArrayBuffer) => {
                let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
                let bytes = rmp_serde::to_vec(&self.token())?;
                encoder.write_all(&bytes)?;
                let encoded = encoder.finish()?;
                let array = js_sys::Uint8Array::from(&encoded[..]);
                let start = array.byte_offset();
                let len = array.byte_length();
                Ok(array
                    .buffer()
                    .slice_with_end(start, start + len)
                    .unchecked_into())
            },
            Some(ViewerConfigEncoding::JSONString) => {
                Ok(JsValue::from(serde_json::to_string(self)?))
            },
            None | Some(ViewerConfigEncoding::Json) => Ok(JsValue::from_serde_ext(self)?),
        }
    }
}

#[derive(Clone, Deserialize)]
// #[serde(deny_unknown_fields)]
pub struct ViewerConfigUpdate {
    #[serde(default)]
    pub version: VersionUpdate,

    #[serde(default)]
    pub plugin: PluginUpdate,

    #[serde(default)]
    pub title: TitleUpdate,

    #[serde(default)]
    pub theme: ThemeUpdate,

    #[serde(default)]
    pub settings: SettingsUpdate,

    #[serde(default)]
    pub plugin_config: Option<Value>,

    #[serde(default)]
    pub columns_config: ColumnConfigUpdate,

    #[serde(flatten)]
    pub view_config: ViewConfigUpdate,
}

impl ViewerConfigUpdate {
    fn from_token(
        (version, columns_config, plugin, plugin_config, settings, theme, title, view_config): ViewerConfigBinaryDeserialFormat,
    ) -> ViewerConfigUpdate {
        ViewerConfigUpdate {
            version,
            columns_config,
            plugin,
            plugin_config,
            settings,
            theme,
            title,
            view_config,
        }
    }

    /// Decode a `JsValue` into a `ViewerConfigUpdate` by auto-detecting format
    /// from JavaScript type.
    pub fn decode(update: &JsValue) -> ApiResult<Self> {
        if update.is_string() {
            let js_str = update.as_string().into_apierror()?;
            let bytes = base64::decode(js_str)?;
            let mut decoder = ZlibDecoder::new(&*bytes);
            let mut decoded = vec![];
            decoder.read_to_end(&mut decoded)?;
            let token = rmp_serde::from_slice(&decoded[..])?;
            Ok(ViewerConfigUpdate::from_token(token))
        } else if update.is_instance_of::<js_sys::ArrayBuffer>() {
            let uint8array = js_sys::Uint8Array::new(update);
            let mut slice = vec![0; uint8array.length() as usize];
            uint8array.copy_to(&mut slice[..]);
            let mut decoder = ZlibDecoder::new(&*slice);
            let mut decoded = vec![];
            decoder.read_to_end(&mut decoded)?;
            let token = rmp_serde::from_slice(&decoded[..])?;
            Ok(ViewerConfigUpdate::from_token(token))
        } else {
            Ok(update.into_serde_ext()?)
        }
    }

    pub fn migrate(&self) -> ApiResult<Self> {
        // TODO: Call the migrate script from js
        Ok(self.clone())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum OptionalUpdate<T: Clone> {
    SetDefault,
    Missing,
    Update(T),
}

pub type PluginUpdate = OptionalUpdate<String>;
pub type SettingsUpdate = OptionalUpdate<bool>;
pub type ThemeUpdate = OptionalUpdate<String>;
pub type TitleUpdate = OptionalUpdate<String>;
pub type VersionUpdate = OptionalUpdate<String>;
pub type ColumnConfigUpdate = OptionalUpdate<HashMap<String, ColumnConfigValues>>;

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
