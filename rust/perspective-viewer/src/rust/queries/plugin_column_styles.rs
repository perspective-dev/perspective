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

use futures::future::join_all;
use itertools::Itertools;
use perspective_client::config::ViewConfig;
use perspective_js::utils::{ApiResult, JsValueSerdeExt};
use serde::Serialize;

use super::resolve_abs_max;
use crate::config::{ColumnConfigSchema, ControlSpec, filter_to_schema};
use crate::presentation::ColumnConfigMap;
use crate::renderer::Renderer;
use crate::session::{Session, SessionMetadata};

/// Stats payload passed to `plugin.column_config_schema` as the
/// `column_stats` arg. The caller (e.g. the StyleTab) owns the value —
/// typically populated by `fetch_column_abs_max` resolving into a
/// component-local `use_state`. Missing when no fetch has resolved yet.
#[derive(Default, Serialize)]
struct ColumnStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    abs_max: Option<f64>,
}

/// Queries the plugin to see if a given column can render column styles.
pub fn can_render_column_styles(
    renderer: &Renderer,
    view_config: &ViewConfig,
    metadata: &SessionMetadata,
    column_name: &str,
) -> ApiResult<bool> {
    let plugin = renderer.get_active_plugin()?;
    let names: Vec<String> = plugin
        .config_column_names()
        .and_then(|jsarr| serde_wasm_bindgen::from_value(jsarr.into()).ok())
        .unwrap_or_default();

    let group = view_config
        .columns
        .iter()
        .find_position(|maybe_s| maybe_s.as_deref() == Some(column_name))
        .and_then(|(idx, _)| names.get(idx))
        .map(|s| s.as_str());

    let view_type = metadata
        .get_column_view_type(column_name)
        .ok_or("Invalid column")?;

    plugin.can_render_column_styles(&view_type.to_string(), group)
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
    let names: Vec<String> = plugin
        .config_column_names()
        .and_then(|jsarr| serde_wasm_bindgen::from_value(jsarr.into()).ok())
        .unwrap_or_default();
    let group = view_config
        .columns
        .iter()
        .find_position(|maybe_s| maybe_s.as_deref() == Some(column_name))
        .and_then(|(idx, _)| names.get(idx))
        .map(|s| s.as_str());
    let view_type = metadata
        .get_column_view_type(column_name)
        .ok_or("Invalid column")?;
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

/// Schema-filter the full column-config map down to only the keys the
/// active plugin's schema declares for each column. Foreign keys remain
/// in presentation state but are stripped here so they never reach
/// `plugin.restore()`. Columns with no active keys (e.g. ghost data from
/// a previous plugin) are dropped entirely from the filtered view.
pub async fn filter_columns_for_active_plugin(
    columns_configs: &ColumnConfigMap,
    renderer: &Renderer,
    session: &Session,
) -> ColumnConfigMap {
    // Take owned snapshots once. Holding `Ref<>` across the per-column
    // awaits below would either re-enter and panic or require
    // dropping/re-acquiring on every iteration.
    let view_config = session.get_view_config().clone();
    let metadata = session.metadata().clone();
    let view = session.get_view();

    // Phase 1: resolve `abs_max` for every column concurrently.
    // `resolve_abs_max` is a sync hit on cache, an awaited
    // `View::get_min_max` on miss for numeric columns, and `None` for
    // non-numeric. Driving this through `join_all` collapses N
    // serialized round trips into 1× max.
    let resolved = join_all(columns_configs.iter().map(|(col_name, raw_map)| {
        let metadata = &metadata;
        let view = view.as_ref();
        async move {
            let abs_max = resolve_abs_max(session, metadata, view, col_name).await;
            (col_name, raw_map, abs_max)
        }
    }))
    .await;

    // Phase 2: schema query + filter (sync; the JS plugin call inside
    // `get_column_config_schema` isn't safe to interleave with awaits
    // anyway).
    let mut filtered = ColumnConfigMap::new();
    for (col_name, raw_map, abs_max) in resolved {
        let schema = match get_column_config_schema(
            renderer,
            &view_config,
            &metadata,
            col_name,
            Some(raw_map),
            abs_max,
        ) {
            Ok(s) => s,
            Err(_) => {
                // Schema query failed — typically because metadata
                // hasn't caught up to the new view config (e.g. the
                // first call inside `restore_and_render` runs before
                // `create_view` has populated column types). Without
                // a schema we can't safely strip ghost keys, so pass
                // the user-supplied entry through unchanged so it
                // reaches `plugin.restore`. A subsequent restore (with
                // metadata in place) will filter correctly.
                if !raw_map.is_empty() {
                    filtered.insert(col_name.clone(), raw_map.clone());
                }
                continue;
            },
        };

        let active_keys = schema.active_keys();
        let mut kept = filter_to_schema(raw_map, &active_keys);

        // Honor `include = true` on schema fields: when the field's key
        // isn't already stored, inject the schema-declared default into
        // the filtered map so `plugin.restore` always sees a value.
        for spec in &schema.fields {
            inject_include_default(&mut kept, spec);
        }

        if !kept.is_empty() {
            filtered.insert(col_name.clone(), kept);
        }
    }

    filtered
}

/// If `spec` is a primitive whose `include` flag is set, write the
/// schema's declared default into `map` under the field's key when no
/// value is already stored. Currently only [`ControlSpec::Number`]
/// participates; other primitives can opt in later if the use case
/// surfaces.
fn inject_include_default(
    map: &mut serde_json::Map<String, serde_json::Value>,
    spec: &ControlSpec,
) {
    if let ControlSpec::Number {
        key,
        default,
        include: Some(true),
        ..
    } = spec
        && !map.contains_key(key)
        && let Some(n) = serde_json::Number::from_f64(*default)
    {
        map.insert(key.clone(), serde_json::Value::Number(n));
    }
}
