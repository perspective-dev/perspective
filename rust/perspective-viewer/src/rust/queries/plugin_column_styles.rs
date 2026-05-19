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

use itertools::Itertools;
use perspective_client::config::ViewConfig;
use perspective_js::utils::{ApiResult, JsValueSerdeExt};
use serde::Serialize;

use crate::config::ColumnConfigSchema;
use crate::renderer::Renderer;
use crate::session::SessionMetadata;

/// Stats payload passed to `plugin.column_config_schema` as the
/// `column_stats` arg. The caller (e.g. the StyleTab) owns the value —
/// typically populated by `fetch_column_abs_max` resolving into a
/// component-local `use_state`. Missing when no fetch has resolved yet.
#[derive(Default, Serialize)]
struct ColumnStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    abs_max: Option<f64>,
}

/// Queries the active plugin for its plugin-scoped
/// [`ColumnConfigSchema`]. Mirrors [`get_column_config_schema`] but
/// drops the column-specific args — the schema describes the shape
/// of the plugin's own config bucket on the renderer.
pub fn get_plugin_config_schema(
    renderer: &Renderer,
    view_config: &ViewConfig,
) -> ApiResult<ColumnConfigSchema> {
    let plugin = renderer.get_active_plugin()?;
    let view_config_js =
        wasm_bindgen::JsValue::from_serde_ext(view_config).unwrap_or(wasm_bindgen::JsValue::NULL);
    let raw = plugin._plugin_config_schema(&view_config_js)?;
    serde_wasm_bindgen::from_value(raw).map_err(|e| e.into())
}

/// Queries the active plugin for the per-column [`ColumnConfigSchema`].
///
/// `current_value` is the column's existing flat JSON config (if any);
/// plugins use it to dynamically gate fields based on prior state.
/// `abs_max` is the caller-owned numeric stat (typically a Yew
/// `use_state` populated by an in-flight `fetch_column_abs_max` task);
/// `None` means the fetch has not yet resolved and gradient defaults
/// fall back to 0.
pub fn get_column_config_schema(
    renderer: &Renderer,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
    column_name: &str,
    current_value: Option<&serde_json::Map<String, serde_json::Value>>,
    abs_max: Option<f64>,
) -> ApiResult<ColumnConfigSchema> {
    let plugin = renderer.get_active_plugin()?;
    let plugin_config = renderer.metadata();
    let names = &plugin_config.config_column_names;
    let group = view_config
        .columns
        .iter()
        .find_position(|maybe_s| maybe_s.as_deref() == Some(column_name))
        .and_then(|(idx, _)| names.get(idx))
        .map(|s| s.as_str());

    let view_type = if let Some(x) = metadata.get_column_view_type(column_name) {
        x
    } else {
        return Ok(ColumnConfigSchema { fields: vec![] });
    };

    // Route through serde_json so maps serialize as plain JS objects
    // rather than `Map` instances — plugin code accesses these with
    // property syntax, not `.get()`.
    let current_js = wasm_bindgen::JsValue::from_serde_ext(&current_value)
        .unwrap_or(wasm_bindgen::JsValue::NULL);
    let view_config_js =
        wasm_bindgen::JsValue::from_serde_ext(view_config).unwrap_or(wasm_bindgen::JsValue::NULL);

    let stats = ColumnStats { abs_max };
    let stats_js =
        wasm_bindgen::JsValue::from_serde_ext(&stats).unwrap_or(wasm_bindgen::JsValue::NULL);

    let raw = plugin._column_config_schema(
        &view_type.to_string(),
        group,
        column_name,
        &current_js,
        &view_config_js,
        &stats_js,
    )?;

    serde_wasm_bindgen::from_value(raw).map_err(|e| e.into())
}
