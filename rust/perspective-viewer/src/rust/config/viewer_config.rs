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

use std::sync::LazyLock;

use perspective_client::config::viewer::{ViewerConfig, ViewerConfigInitial, ViewerConfigUpdate};
use perspective_js::utils::*;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use wasm_bindgen::prelude::*;

/// The `@perspective-dev/viewer` package version, stamped on every saved
/// config.
pub static API_VERSION: LazyLock<&'static str> = LazyLock::new(|| {
    #[derive(Deserialize)]
    struct Package {
        version: &'static str,
    }
    let pkg: &'static str = include_str!("../../../package.json");
    let pkg: Package = serde_json::from_str(pkg).unwrap();
    pkg.version
});

/// The `version` a raw config, or else one of its workspace panels, was saved
/// by.
pub fn saved_version(config: &JsValue) -> Option<String> {
    let version = |value: &JsValue| {
        js_sys::Reflect::get(value, &JsValue::from_str("version"))
            .ok()?
            .as_string()
    };

    version(config).or_else(|| {
        ["panels", "viewers"].into_iter().find_map(|key| {
            let panels = js_sys::Reflect::get(config, &JsValue::from_str(key)).ok()?;
            let panels = panels.dyn_into::<js_sys::Object>().ok()?;
            js_sys::Object::values(&panels)
                .iter()
                .find_map(|panel| version(&panel))
        })
    })
}

/// Await `result`, naming the release a config was `saved` by in its error
/// when that is not this release.
pub async fn noting_saved_version<T>(
    saved: Option<String>,
    result: impl std::future::Future<Output = ApiResult<T>>,
) -> ApiResult<T> {
    result.await.map_err(|error| match saved {
        Some(version) if version != *API_VERSION => ApiError::new(format!(
            "{error} (this config was saved by {version}, and this is {}; configs from older \
             releases can be upgraded with `perspective-migrate`)",
            *API_VERSION
        )),
        _ => error,
    })
}

/// Encode a config to a `JsValue`.
pub trait EncodeConfig {
    /// Encode this config to a `JsValue` in a supported type.
    fn encode(&self) -> ApiResult<JsValue>;
}

impl<V: TS + Serialize, T: TS + Serialize> EncodeConfig for ViewerConfig<V, T> {
    fn encode(&self) -> ApiResult<JsValue> {
        Ok(JsValue::from_serde_ext(self)?)
    }
}

/// Decode a config from a `JsValue`, rejecting unknown keys.
pub trait DecodeConfig: Sized {
    /// Decode `value` into this config type.
    fn decode(value: &JsValue) -> ApiResult<Self>;
}

impl DecodeConfig for ViewerConfigUpdate {
    fn decode(value: &JsValue) -> ApiResult<Self> {
        Ok(value.into_serde_ext()?)
    }
}

impl DecodeConfig for ViewerConfigInitial {
    fn decode(value: &JsValue) -> ApiResult<Self> {
        Ok(value.into_serde_ext()?)
    }
}
