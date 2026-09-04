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
use perspective_js::utils::{ApiError, ApiResult, JsValueSerdeExt};
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

    fn resolve_css_refs_in(&self, column: &str, entry: &mut serde_json::Map<String, Value>) {
        let host = self.borrow().viewer_elem.clone();
        let lookup = |name: &str| crate::utils::read_custom_property(&host, name);
        for (key, name) in resolve_css_refs(entry, &lookup) {
            tracing::warn!(
                "Dropping `columns_config[\"{column}\"].{key}`: `var({name})` is undefined or not \
                 a valid value of its kind"
            );
        }
    }

    /// Every CSS literal stored in the active plugin's per-column bucket
    /// with its schema kind, sorted by `(column, key)`.
    pub fn css_literals_in_use(
        &self,
        view_config: &ViewConfig,
        session: &Session,
    ) -> Vec<CssLiteralUse> {
        let mut out = vec![];
        for (column, entry) in self.all_columns_configs() {
            let Ok(schema) =
                self.query_column_config_schema(view_config, session, &column, Some(&entry))
            else {
                continue;
            };

            for (key, value) in &entry {
                if let (Some(kind), Some(literal)) = (schema.css_kind_of(key), value.as_str())
                    && parse_var_ref(literal).is_none()
                {
                    out.push(CssLiteralUse {
                        column: column.clone(),
                        key: key.clone(),
                        kind,
                        literal: literal.to_owned(),
                    });
                }
            }
        }

        out.sort_by(|a, b| (&a.column, &a.key).cmp(&(&b.column, &b.key)));
        out
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
            let needs_warm = schema.leaf_fields().into_iter().any(|f| {
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

            for field in schema.leaf_fields() {
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

    /// Wholesale update the active plugin's per-column config map.
    pub fn update_columns_configs(
        &self,
        view_config: &ViewConfig,
        session: &Session,
        update: ColumnConfigUpdate,
    ) -> ApiResult<bool> {
        let Some(n) = self.active_plugin_name() else {
            return Ok(false);
        };

        match update {
            OptionalUpdate::SetDefault => {
                let mut st = self.borrow_mut();
                let bucket = st.plugin_states.entry(n).or_default();
                let was_nonempty = !bucket.columns.is_empty();
                bucket.columns.clear();
                Ok(was_nonempty)
            },
            OptionalUpdate::Missing => Ok(false),
            OptionalUpdate::Update(map) => {
                let mut stripped: Vec<(String, serde_json::Map<String, serde_json::Value>)> =
                    Vec::with_capacity(map.len());
                for (col, mut cfg) in map {
                    if let Ok(schema) =
                        self.query_column_config_schema(view_config, session, &col, Some(&cfg))
                    {
                        let active = schema.active_keys();
                        cfg.retain(|k, _| active.contains(k));
                        let errors = normalize_css_values(&schema, &mut cfg);
                        if let Some((key, error)) = errors.first() {
                            return Err(ApiError::from(JsValue::from_str(&format!(
                                "Invalid `columns_config[\"{col}\"].{key}`: {error}"
                            ))));
                        }

                        self.resolve_css_refs_in(&col, &mut cfg);
                        strip_default_values(&schema, &mut cfg);
                    }

                    stripped.push((col, cfg));
                }

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

                Ok(changed)
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
            for (key, error) in normalize_css_values(&schema, &mut update.value) {
                tracing::error!("Dropping `{column_name}`.`{key}`: {error}");
            }

            self.resolve_css_refs_in(&column_name, &mut update.value);
            strip_default_values(&schema, &mut update.value);
        }

        let next = {
            let mut st = self.borrow_mut();
            let bucket = st.plugin_states.entry(n.clone()).or_default();
            let entry = bucket.columns.entry(column_name.clone()).or_default();
            for k in &update.keys {
                entry.remove(k);
            }
            for (k, v) in update.value {
                if update.keys.contains(&k) {
                    entry.insert(k, v);
                }
            }

            entry.clone()
        };

        let active = self
            .query_column_config_schema(view_config, session, &column_name, Some(&next))
            .ok()
            .map(|schema| schema.active_keys());

        let mut st = self.borrow_mut();
        let bucket = st.plugin_states.entry(n).or_default();
        if let Some(entry) = bucket.columns.get_mut(&column_name) {
            if let Some(active) = &active {
                entry.retain(|k, _| active.contains(k));
            }

            if entry.is_empty() {
                bucket.columns.remove(&column_name);
            }
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
        serde_wasm_bindgen::from_value::<ColumnConfigSchema>(raw)
            .map(|schema| schema.canonicalize())
            .map_err(|e| e.into())
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

        serde_wasm_bindgen::from_value::<ColumnConfigSchema>(raw)
            .map(|schema| schema.canonicalize())
            .map_err(|e| e.into())
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
    ) -> ApiResult<bool> {
        let Some(n) = self.active_plugin_name() else {
            return Ok(false);
        };

        let schema = self.query_plugin_config_schema(view_config).ok();
        let mut st = self.borrow_mut();
        let bucket = st.plugin_states.entry(n).or_default();
        match update {
            OptionalUpdate::SetDefault => {
                let changed = !bucket.plugin.is_empty();
                bucket.plugin.clear();
                Ok(changed)
            },
            OptionalUpdate::Missing => Ok(false),
            OptionalUpdate::Update(mut map) => {
                let mut changed = false;
                if let Some(s) = &schema {
                    let active = s.active_keys();
                    map.retain(|k, _| active.contains(k));
                    let errors = normalize_css_values(s, &mut map);
                    if let Some((key, error)) = errors.first() {
                        return Err(ApiError::from(JsValue::from_str(&format!(
                            "Invalid `plugin_config.{key}`: {error}"
                        ))));
                    }

                    let leaves = s.leaf_fields();
                    map.retain(|key, value| {
                        let is_default = leaves
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

                Ok(changed)
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
            for (key, error) in normalize_css_values(&schema, &mut update.value) {
                tracing::error!("Dropping `plugin_config`.`{key}`: {error}");
            }

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

fn normalize_css_values(
    schema: &ColumnConfigSchema,
    map: &mut serde_json::Map<String, serde_json::Value>,
) -> Vec<(String, String)> {
    let mut errors = vec![];
    for (key, value) in map.iter_mut() {
        let Some(kind) = schema.css_kind_of(key) else {
            continue;
        };

        let canonical = match value.as_str() {
            Some(src) => kind.canonicalize(src),
            None => Err(format!("expected a CSS string, got `{value}`")),
        };

        match canonical {
            Ok(canonical) => *value = Value::String(canonical),
            Err(error) => errors.push((key.clone(), error)),
        }
    }

    for (key, _) in &errors {
        map.remove(key);
    }

    errors
}

fn strip_default_values(
    schema: &ColumnConfigSchema,
    map: &mut serde_json::Map<String, serde_json::Value>,
) {
    let leaves = schema.leaf_fields();
    map.retain(|key, value| {
        !leaves
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
        } if k == key => css_matches(CssKind::Color, value, default),
        ControlSpec::Palette {
            key: k, default, ..
        } if k == key => css_matches(CssKind::Palette, value, default),
        ControlSpec::GradientStops {
            key: k, default, ..
        } if k == key => css_matches(CssKind::Gradient, value, default),
        _ => false,
    }
}

fn css_matches(kind: CssKind, value: &Value, default: &str) -> bool {
    value
        .as_str()
        .and_then(|src| kind.canonicalize(src).ok())
        .is_some_and(|canonical| canonical == default)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn palette_default_matches_canonically() {
        let spec = ControlSpec::Palette {
            key: "palette".to_owned(),
            default: "linear-gradient(to right, #0366d6, #ff7f0e)".to_owned(),
            max: None,
        };

        assert!(matches_declared_default(
            &spec,
            "palette",
            &json!("linear-gradient(to right, #0366d6, #ff7f0e)")
        ));

        assert!(matches_declared_default(
            &spec,
            "palette",
            &json!("linear-gradient(90deg, RGB(3,102,214), #FF7F0E)")
        ));

        assert!(!matches_declared_default(
            &spec,
            "palette",
            &json!("linear-gradient(to right, #ff7f0e, #0366d6)")
        ));

        assert!(!matches_declared_default(
            &spec,
            "palette",
            &json!("var(--psp-user--palette-1)")
        ));

        assert!(!matches_declared_default(
            &spec,
            "palette",
            &json!(["#0366d6"])
        ));
        assert!(!matches_declared_default(
            &spec,
            "other",
            &json!("linear-gradient(to right, #0366d6, #ff7f0e)")
        ));
    }

    #[test]
    fn gradient_default_matches_canonical_values() {
        let spec = ControlSpec::GradientStops {
            key: "gradient".to_owned(),
            default: "linear-gradient(to right, #0366d6 0%, #ff7f0e 33.3%)".to_owned(),
            discrete: false,
        };

        assert!(matches_declared_default(
            &spec,
            "gradient",
            &json!("linear-gradient(#0366d6, #ff7f0e 33.3%)")
        ));

        assert!(!matches_declared_default(
            &spec,
            "gradient",
            &json!("linear-gradient(to right, #0366d6 0%, #ff7f0e 33.4%)")
        ));

        let color = ControlSpec::Color {
            key: "color".to_owned(),
            default: "#ff7f0e".to_owned(),
        };

        assert!(matches_declared_default(&color, "color", &json!("#FF7F0E")));
        assert!(matches_declared_default(
            &color,
            "color",
            &json!("rgb(255, 127, 14)")
        ));
        assert!(!matches_declared_default(
            &color,
            "color",
            &json!("var(--psp-user--color-1)")
        ));
    }

    #[test]
    fn strip_default_values_sees_through_groups() {
        let leaves = vec![
            ControlSpec::Bool {
                key: "flag".to_owned(),
                default: false,
            },
            ControlSpec::Number {
                key: "size".to_owned(),
                default: 3.0,
                include: None,
                min: None,
                max: None,
                step: None,
            },
        ];

        let flat = ColumnConfigSchema {
            fields: leaves.clone(),
        };

        let grouped = ColumnConfigSchema {
            fields: vec![ControlSpec::Group {
                key: "section".to_owned(),
                fields: leaves,
            }],
        };

        let src = json!({ "flag": false, "size": 4.0, "foreign": 1 })
            .as_object()
            .unwrap()
            .clone();

        let mut a = src.clone();
        let mut b = src;
        strip_default_values(&flat, &mut a);
        strip_default_values(&grouped, &mut b);
        assert_eq!(a, b);
        assert_eq!(
            a,
            json!({ "size": 4.0, "foreign": 1 })
                .as_object()
                .unwrap()
                .clone()
        );
    }

    #[test]
    fn normalize_css_values_canonicalizes_and_reports() {
        let schema = ColumnConfigSchema {
            fields: vec![
                ControlSpec::Color {
                    key: "color".to_owned(),
                    default: "#000000".to_owned(),
                },
                ControlSpec::Palette {
                    key: "palette".to_owned(),
                    default: "linear-gradient(to right, #000000)".to_owned(),
                    max: None,
                },
                ControlSpec::GradientStops {
                    key: "gradient".to_owned(),
                    default: "linear-gradient(to right, #000000 0%, #ffffff 100%)".to_owned(),
                    discrete: false,
                },
                ControlSpec::Bool {
                    key: "flag".to_owned(),
                    default: false,
                },
            ],
        };

        let mut map = json!({
            "color": "RGB(255,0,0)",
            "palette": "var(--psp-user--palette-warm)",
            "gradient": [{ "color": "#000000", "offset": 0 }],
            "flag": true,
            "foreign": "linear-gradient(red, blue)",
        })
        .as_object()
        .unwrap()
        .clone();

        let errors = normalize_css_values(&schema, &mut map);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].0, "gradient");
        assert_eq!(
            map,
            json!({
                "color": "#ff0000",
                "palette": "var(--psp-user--palette-warm)",
                "flag": true,
                "foreign": "linear-gradient(red, blue)",
            })
            .as_object()
            .unwrap()
            .clone()
        );
    }
}
