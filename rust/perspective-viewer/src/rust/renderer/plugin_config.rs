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

//! The [`Renderer`]'s per-plugin config state: the plugin-level and
//! per-column buckets (`plugin_states`), their schema-aware strip/merge
//! write paths, and the restore-prep materialized snapshot.

use std::collections::HashMap;

use futures::future::join_all;
use perspective_client::config::ViewConfig;
use perspective_js::utils::{ApiResult, JsValueSerdeExt};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use super::Renderer;
use crate::config::*;
use crate::queries::resolve_abs_max;
use crate::session::Session;

/// A per-column config map. Each inner [`serde_json::Map`] is a flat collection
/// of plugin-defined JSON keys whose shape is dictated by the active plugin's
/// [`crate::config::ColumnConfigSchema`].
pub type ColumnConfigMap = HashMap<String, serde_json::Map<String, serde_json::Value>>;

/// Per-plugin config bucket. Holds the per-column style map and the
/// plugin-level config map for one plugin. Buckets are keyed by plugin
/// name in [`RendererMutData::plugin_states`], so foreign keys from a
/// different plugin physically cannot appear in the active plugin's
/// bucket.
#[derive(Clone, Debug, Default)]
pub struct PluginScopedConfig {
    pub columns: ColumnConfigMap,
    pub plugin: serde_json::Map<String, serde_json::Value>,
}

impl Renderer {
    /// Name of the currently-active plugin (used as the key into
    /// `plugin_states`). Returns `None` when no plugin has been
    /// activated yet.
    fn active_plugin_name(&self) -> Option<String> {
        Some(self.borrow().metadata.name.clone()).filter(|n| !n.is_empty())
    }

    /// Snapshot of the active plugin's per-column config map.
    pub fn all_columns_configs(&self) -> ColumnConfigMap {
        self.active_plugin_name()
            .and_then(|n| {
                self.borrow()
                    .plugin_states
                    .get(&n)
                    .map(|b| b.columns.clone())
            })
            .unwrap_or_default()
    }

    /// Restore-prep snapshot: like [`Self::all_columns_configs`], but
    /// for each column also materializes any `ControlSpec::Number`
    /// fields the schema declares with `include: true` that aren't
    /// already in the bucket entry. The materialized value is the
    /// schema's `default`, which the schema computes from cached
    /// column stats (via [`Self::query_column_config_schema`]).
    pub async fn all_columns_configs_materialized(
        &self,
        view_config: &ViewConfig,
        session: &Session,
    ) -> ColumnConfigMap {
        let mut configs = self.all_columns_configs();
        let mut to_warm: Vec<String> = vec![];
        for (col, entry) in &configs {
            if session
                .get_column_stats(col)
                .and_then(|s| s.abs_max)
                .is_some()
            {
                continue;
            }
            let Ok(schema) =
                self.query_column_config_schema(view_config, session, col, Some(entry))
            else {
                continue;
            };
            let needs_warm = schema.fields.iter().any(|f| {
                matches!(
                    f,
                    ControlSpec::Number {
                        key,
                        include: Some(true),
                        ..
                    } if !entry.contains_key(key)
                )
            });
            if needs_warm {
                to_warm.push(col.clone());
            }
        }

        if !to_warm.is_empty() {
            let metadata = session.metadata().clone();
            let view = session.get_view();
            let futs = to_warm
                .iter()
                .map(|c| resolve_abs_max(session, &metadata, view.as_ref(), c.as_str()));
            join_all(futs).await;
        }

        for (col, entry) in &mut configs {
            let Ok(schema) =
                self.query_column_config_schema(view_config, session, col, Some(entry))
            else {
                continue;
            };

            for field in &schema.fields {
                let ControlSpec::Number {
                    key,
                    default,
                    include: Some(true),
                    ..
                } = field
                else {
                    continue;
                };

                if entry.contains_key(key) {
                    continue;
                }

                let Some(num) = serde_json::Number::from_f64(*default) else {
                    continue;
                };

                entry.insert(key.clone(), serde_json::Value::Number(num));
            }
        }

        configs
    }

    /// Clear the active plugin's per-column config map.
    pub fn reset_columns_configs(&self) {
        if let Some(n) = self.active_plugin_name() {
            self.borrow_mut()
                .plugin_states
                .entry(n)
                .or_default()
                .columns
                .clear();
        }
    }

    /// Clone of the active plugin's per-column entry for `column_name`,
    /// or `None` if no value is stored.
    pub fn get_columns_config(
        &self,
        column_name: &str,
    ) -> Option<serde_json::Map<String, serde_json::Value>> {
        let n = self.active_plugin_name()?;
        self.borrow()
            .plugin_states
            .get(&n)?
            .columns
            .get(column_name)
            .cloned()
    }

    /// Wholesale update the active plugin's per-column config map
    pub fn update_columns_configs(
        &self,
        view_config: &ViewConfig,
        session: &Session,
        update: ColumnConfigUpdate,
    ) -> bool {
        let Some(n) = self.active_plugin_name() else {
            return false;
        };

        match update {
            OptionalUpdate::SetDefault => {
                let mut st = self.borrow_mut();
                let bucket = st.plugin_states.entry(n).or_default();
                let was_nonempty = !bucket.columns.is_empty();
                bucket.columns.clear();
                was_nonempty
            },
            OptionalUpdate::Missing => false,
            OptionalUpdate::Update(map) => {
                let stripped: Vec<(String, serde_json::Map<String, serde_json::Value>)> = map
                    .into_iter()
                    .map(|(col, mut cfg)| {
                        if let Ok(schema) =
                            self.query_column_config_schema(view_config, session, &col, Some(&cfg))
                        {
                            let active = schema.active_keys();
                            cfg.retain(|k, _| active.contains(k));
                            strip_default_values(&schema, &mut cfg);
                        }

                        (col, cfg)
                    })
                    .collect();

                let mut st = self.borrow_mut();
                let bucket = st.plugin_states.entry(n).or_default();
                let mut changed = false;
                for (col, cfg) in stripped {
                    if cfg.is_empty() {
                        if bucket.columns.remove(&col).is_some() {
                            changed = true;
                        }
                    } else {
                        match bucket.columns.insert(col, cfg.clone()) {
                            None => changed = true,
                            Some(old) if old != cfg => changed = true,
                            _ => {},
                        }
                    }
                }

                changed
            },
        }
    }

    /// Apply a single schema-field update from the column-style UI to
    /// the active plugin's bucket. Clears the keys the field owns,
    /// then splices in the partial new sub-state. Drops empty
    /// entries.
    pub fn update_columns_config_field(
        &self,
        view_config: &ViewConfig,
        session: &Session,
        column_name: String,
        mut update: ColumnConfigFieldUpdate,
    ) {
        let Some(n) = self.active_plugin_name() else {
            return;
        };

        let current_value = self.get_columns_config(&column_name);
        if let Ok(schema) = self.query_column_config_schema(
            view_config,
            session,
            &column_name,
            current_value.as_ref(),
        ) {
            strip_default_values(&schema, &mut update.value);
        }

        let mut st = self.borrow_mut();
        let bucket = st.plugin_states.entry(n).or_default();
        let entry = bucket.columns.entry(column_name.clone()).or_default();
        for k in &update.keys {
            entry.remove(k);
        }
        for (k, v) in update.value {
            if update.keys.contains(&k) {
                entry.insert(k, v);
            }
        }
        if entry.is_empty() {
            bucket.columns.remove(&column_name);
        }
    }

    /// Snapshot of the active plugin's plugin-level config map.
    pub fn get_plugin_config(&self) -> serde_json::Map<String, serde_json::Value> {
        self.active_plugin_name()
            .and_then(|n| {
                self.borrow()
                    .plugin_states
                    .get(&n)
                    .map(|b| b.plugin.clone())
            })
            .unwrap_or_default()
    }

    /// Clear the active plugin's plugin-level config map.
    pub fn reset_plugin_config(&self) {
        if let Some(n) = self.active_plugin_name() {
            self.borrow_mut()
                .plugin_states
                .entry(n)
                .or_default()
                .plugin
                .clear();
        }
    }

    /// Synchronously query the active plugin's
    /// [`ColumnConfigSchema`] used to gate plugin-config strip logic.
    fn query_plugin_config_schema(
        &self,
        view_config: &ViewConfig,
    ) -> ApiResult<ColumnConfigSchema> {
        let plugin = self.ensure_plugin_selected()?;
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);
        let raw = plugin._plugin_config_schema(&view_config_js)?;
        serde_wasm_bindgen::from_value(raw).map_err(|e| e.into())
    }

    /// Per-column counterpart of [`query_plugin_config_schema`]. Used by
    /// the columns-config write paths (strip-on-write) and the
    /// restore-prep snapshot (materialize-on-read).
    fn query_column_config_schema(
        &self,
        view_config: &ViewConfig,
        session: &Session,
        column_name: &str,
        current_value: Option<&serde_json::Map<String, serde_json::Value>>,
    ) -> ApiResult<ColumnConfigSchema> {
        let plugin = self.ensure_plugin_selected()?;
        let plugin_config = self.metadata();
        let names = &plugin_config.config_column_names;
        let group = view_config
            .columns
            .iter()
            .position(|maybe_s| maybe_s.as_deref() == Some(column_name))
            .and_then(|idx| names.get(idx))
            .map(|s| s.as_str());

        if !session.metadata().has_view_schema() {
            return Err(JsValue::from("view_schema not initialized").into());
        }
        let Some(view_type) = session.metadata().get_column_view_type(column_name) else {
            return Ok(ColumnConfigSchema { fields: vec![] });
        };

        let current_js = JsValue::from_serde_ext(&current_value).unwrap_or(JsValue::NULL);
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);
        let stats = session.get_column_stats(column_name).unwrap_or_default();
        let stats_json = serde_json::json!({
            "abs_max": stats.abs_max,
        });
        let stats_js = JsValue::from_serde_ext(&stats_json).unwrap_or(JsValue::NULL);

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

    /// Wholesale update the active plugin's plugin-level config map.
    /// Entries whose value equals the schema-declared default are
    /// treated as "reset this key" — the corresponding bucket entry
    /// is cleared rather than the default being stored literally.
    /// Keys absent from the incoming map are left alone (merge
    /// semantics for the non-default subset).
    pub fn update_plugin_config(
        &self,
        view_config: &ViewConfig,
        update: PluginConfigUpdate,
    ) -> bool {
        let Some(n) = self.active_plugin_name() else {
            return false;
        };

        let schema = self.query_plugin_config_schema(view_config).ok();
        let mut st = self.borrow_mut();
        let bucket = st.plugin_states.entry(n).or_default();
        match update {
            OptionalUpdate::SetDefault => {
                let changed = !bucket.plugin.is_empty();
                bucket.plugin.clear();
                changed
            },
            OptionalUpdate::Missing => false,
            OptionalUpdate::Update(mut map) => {
                let mut changed = false;
                if let Some(s) = &schema {
                    let active = s.active_keys();
                    map.retain(|k, _| active.contains(k));
                    map.retain(|key, value| {
                        let is_default = s
                            .fields
                            .iter()
                            .any(|spec| matches_declared_default(spec, key, value));
                        if is_default {
                            if bucket.plugin.remove(key).is_some() {
                                changed = true;
                            }
                            false
                        } else {
                            true
                        }
                    });
                }

                for (k, v) in map {
                    let prev = bucket.plugin.insert(k, v.clone());
                    if prev.as_ref() != Some(&v) {
                        changed = true;
                    }
                }

                changed
            },
        }
    }

    /// Apply a single schema-field update from the plugin-settings UI
    pub fn update_plugin_config_field(
        &self,
        view_config: &ViewConfig,
        mut update: ColumnConfigFieldUpdate,
    ) -> bool {
        let Some(n) = self.active_plugin_name() else {
            return false;
        };

        if let Ok(schema) = self.query_plugin_config_schema(view_config) {
            strip_default_values(&schema, &mut update.value);
        }

        let mut st = self.borrow_mut();
        let bucket = st.plugin_states.entry(n).or_default();
        let mut changed = false;

        for k in &update.keys {
            if let Some(v) = update.value.get(k) {
                let prev = bucket.plugin.insert(k.to_string(), v.clone());
                if prev.as_ref() != Some(v) {
                    changed = true;
                }
            } else if bucket.plugin.remove(k).is_some() {
                changed = true;
            }
        }

        changed
    }
}

fn strip_default_values(
    schema: &ColumnConfigSchema,
    map: &mut serde_json::Map<String, serde_json::Value>,
) {
    map.retain(|key, value| {
        !schema
            .fields
            .iter()
            .any(|spec| matches_declared_default(spec, key, value))
    });
}

fn matches_declared_default(spec: &ControlSpec, key: &str, value: &Value) -> bool {
    match spec {
        ControlSpec::Enum {
            key: k, default, ..
        } if k == key => value.as_str() == Some(default.as_str()),
        ControlSpec::Bool {
            key: k, default, ..
        } if k == key => value.as_bool() == Some(*default),
        ControlSpec::Number {
            key: k,
            include: Some(true),
            ..
        } if k == key => false,
        ControlSpec::Number {
            key: k, default, ..
        } if k == key => value.as_f64() == Some(*default),
        ControlSpec::String {
            key: k, default, ..
        } if k == key => value.as_str() == Some(default.as_str()),
        ControlSpec::Color {
            key: k, default, ..
        } if k == key => value.as_str() == Some(default.as_str()),
        ControlSpec::ColorRange {
            key_pos,
            default_pos,
            ..
        } if key_pos == key => value.as_str() == Some(default_pos.as_str()),
        ControlSpec::ColorRange {
            key_neg,
            default_neg,
            ..
        } if key_neg == key => value.as_str() == Some(default_neg.as_str()),
        _ => false,
    }
}
