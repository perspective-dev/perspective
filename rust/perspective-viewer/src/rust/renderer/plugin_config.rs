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
//! per-column buckets (`PanelState::buckets`), their schema-aware strip/merge
//! write paths, and the restore-prep materialized snapshot.

use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use futures::future::join_all;
use perspective_client::config::ViewConfig;
use perspective_client::proto::ColumnType;
use perspective_js::utils::{ApiError, ApiResult, JsValueSerdeExt};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use super::Renderer;
use crate::config::*;
use crate::js::plugin::JsPerspectiveViewerPlugin;
use crate::queries::resolve_abs_max;
use crate::session::Session;
use crate::utils::{CssKind, CssLiteralUse, parse_var_ref, resolve_css_refs};

type ConfigMap = serde_json::Map<String, serde_json::Value>;

/// A schema query's answer: `Ok(None)` when the plugin declares no schema.
pub type SchemaResult = Result<Option<ColumnConfigSchema>, ValidationError>;

/// Everything a column's schema is a function of, besides the column itself.
struct ColumnSchemaEnv<'a> {
    view_config: &'a ViewConfig,
    session: &'a Session,

    /// The view types of a config not yet bound to a `View`; `None` reads the
    /// bound `View`'s schema.
    view_schema: Option<&'a HashMap<String, ColumnType>>,

    /// Whether the session's column stats describe this config's table (`false`
    /// for a restore that replaces it).
    column_stats: bool,

    /// The plugin-level config the column will live under.
    plugin_config: &'a ConfigMap,
}

/// A per-column config map. Each inner [`serde_json::Map`] is a flat collection
/// of plugin-defined JSON keys whose shape is dictated by the active plugin's
/// [`crate::config::ColumnConfigSchema`].
pub type ColumnConfigMap = HashMap<String, serde_json::Map<String, serde_json::Value>>;

/// Per-plugin config bucket. Holds the per-column style map and the
/// plugin-level config map for one plugin. Buckets are keyed by plugin
/// name in [`crate::session::PanelState::buckets`], so foreign keys from a
/// different plugin physically cannot appear in the active plugin's
/// bucket.
#[derive(Clone, Debug, Default)]
pub struct PluginScopedConfig {
    pub columns: ColumnConfigMap,
    pub plugin: serde_json::Map<String, serde_json::Value>,
}

/// The plugin a bucket update is validated against and written to — named
/// EXPLICITLY, so a validation that precedes a plugin swap can name the swap
/// target rather than whichever plugin happens to be active.
pub struct PluginTarget {
    pub element: JsPerspectiveViewerPlugin,
    pub static_config: Rc<PluginStaticConfig>,
}

/// What [`Renderer::apply_plugin_config`] writes for a validated
/// [`PluginConfigUpdate`] — every fallible check already done.
#[derive(Clone, Debug, PartialEq)]
pub enum ValidatedPluginConfig {
    Missing,
    Clear,
    Set {
        /// Keys to insert, already normalized and filtered to the schema's
        /// active keys.
        map: ConfigMap,

        /// Keys the update set to their declared default: removed from the
        /// bucket rather than stored.
        remove: Vec<String>,

        /// The schema's active keys, when a schema was available; the bucket is
        /// pruned to them after the write.
        active: Option<HashSet<String>>,
    },
}

/// What [`Renderer::apply_columns_config`] writes for a validated
/// [`ColumnConfigUpdate`]: per column, the normalized entry (an EMPTY entry
/// removes the column).
#[derive(Debug, PartialEq)]
pub enum ValidatedColumnsConfig {
    Missing,
    Clear,
    Set(Vec<(String, ConfigMap)>),
}

/// A bucket value the schema rejects.
#[derive(Debug, PartialEq)]
pub struct ValidationError(pub String);

impl From<ValidationError> for ApiError {
    fn from(err: ValidationError) -> Self {
        ApiError::from(JsValue::from_str(&err.0))
    }
}

/// Validate a plugin-level config update against the schema the merged result
/// would have.
pub fn validate_plugin_config(
    current: &ConfigMap,
    update: PluginConfigUpdate,
    schema_of: &dyn Fn(&ConfigMap) -> SchemaResult,
) -> Result<ValidatedPluginConfig, ValidationError> {
    match update {
        OptionalUpdate::SetDefault => Ok(ValidatedPluginConfig::Clear),
        OptionalUpdate::Missing => Ok(ValidatedPluginConfig::Missing),
        OptionalUpdate::Update(mut map) => {
            let mut merged = current.clone();
            for (k, v) in &map {
                merged.insert(k.clone(), v.clone());
            }

            let schema = schema_of(&merged)?;
            let mut active = None;
            let mut remove = vec![];
            if let Some(s) = &schema {
                let keys = s.active_keys();
                map.retain(|k, _| keys.contains(k));
                active = Some(keys);
                let errors = normalize_values(s, &mut map);
                if let Some((key, error)) = errors.first() {
                    return Err(ValidationError(format!(
                        "Invalid `plugin_config.{key}`: {error}"
                    )));
                }

                let leaves = s.leaf_fields();
                map.retain(|key, value| {
                    let is_default = leaves
                        .iter()
                        .any(|spec| matches_declared_default(spec, key, value));
                    if is_default {
                        remove.push(key.clone());
                    }

                    !is_default
                });
            }

            Ok(ValidatedPluginConfig::Set {
                map,
                remove,
                active,
            })
        },
    }
}

/// Validate a per-column config update, column by column, against the schema
/// each column's entry would have.
pub fn validate_columns_config(
    update: ColumnConfigUpdate,
    schema_of: &dyn Fn(&str, &ConfigMap) -> SchemaResult,
    view_type_of: &dyn Fn(&str) -> Option<ColumnType>,
    resolve_css: &dyn Fn(&str, &mut ConfigMap),
) -> Result<ValidatedColumnsConfig, ValidationError> {
    match update {
        OptionalUpdate::SetDefault => Ok(ValidatedColumnsConfig::Clear),
        OptionalUpdate::Missing => Ok(ValidatedColumnsConfig::Missing),
        OptionalUpdate::Update(map) => {
            let mut stripped = Vec::with_capacity(map.len());
            for (col, mut cfg) in map {
                if let Some(schema) = schema_of(&col, &cfg)? {
                    let active = schema.active_keys();
                    cfg.retain(|k, _| active.contains(k));
                    let errors = normalize_values(&schema, &mut cfg);
                    if let Some((key, error)) = errors.first() {
                        let ty = view_type_of(&col)
                            .map(|t| format!(" for a {t} column"))
                            .unwrap_or_default();

                        return Err(ValidationError(format!(
                            "Invalid `columns_config[\"{col}\"].{key}`{ty}: {error}"
                        )));
                    }

                    resolve_css(&col, &mut cfg);
                    strip_default_values(&schema, &mut cfg);
                }

                stripped.push((col, cfg));
            }

            Ok(ValidatedColumnsConfig::Set(stripped))
        },
    }
}

/// Whether `target`'s plugin element declares the schema method `name`.
fn declares(target: &PluginTarget, name: &str) -> bool {
    js_sys::Reflect::get(&target.element, &JsValue::from_str(name))
        .map(|f| f.is_function())
        .unwrap_or(false)
}

/// Write a validated plugin-level update into `bucket`.
pub fn apply_plugin_config_to(
    bucket: &mut PluginScopedConfig,
    validated: ValidatedPluginConfig,
) -> bool {
    match validated {
        ValidatedPluginConfig::Missing => false,
        ValidatedPluginConfig::Clear => {
            let changed = !bucket.plugin.is_empty();
            bucket.plugin.clear();
            changed
        },
        ValidatedPluginConfig::Set {
            map,
            remove,
            active,
        } => {
            let mut changed = false;
            for key in remove {
                if bucket.plugin.remove(&key).is_some() {
                    changed = true;
                }
            }

            for (k, v) in map {
                let prev = bucket.plugin.insert(k, v.clone());
                if prev.as_ref() != Some(&v) {
                    changed = true;
                }
            }

            if let Some(active) = active {
                let before = bucket.plugin.len();
                bucket.plugin.retain(|k, _| active.contains(k));
                changed |= bucket.plugin.len() != before;
            }

            changed
        },
    }
}

/// Write a validated per-column update into `bucket`.
pub fn apply_columns_config_to(
    bucket: &mut PluginScopedConfig,
    validated: ValidatedColumnsConfig,
) -> bool {
    match validated {
        ValidatedColumnsConfig::Missing => false,
        ValidatedColumnsConfig::Clear => {
            let was_nonempty = !bucket.columns.is_empty();
            bucket.columns.clear();
            was_nonempty
        },
        ValidatedColumnsConfig::Set(entries) => {
            let mut changed = false;
            for (col, cfg) in entries {
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

impl Renderer {
    /// Name of the currently-active plugin (used as the key into
    /// `PanelState::buckets`). Returns `None` when no plugin has been
    /// activated yet.
    fn active_plugin_name(&self) -> Option<String> {
        Some(self.metadata().name.clone()).filter(|n| !n.is_empty())
    }

    /// Rewrite the named plugin's bucket: `f` edits a COPY, which is then
    /// swapped in as one new [`crate::session::PanelState`].
    fn edit_bucket<R>(&self, name: &str, f: impl FnOnce(&mut PluginScopedConfig) -> R) -> R {
        let state = self.cell.state();
        let mut bucket = state.bucket(name);
        let result = f(&mut bucket);
        self.cell.swap(state.with_bucket(name, bucket));
        result
    }

    /// The active plugin as a [`PluginTarget`], selecting the registry default
    /// when none is selected yet (the command half, like
    /// [`Renderer::ensure_plugin_selected`]).
    pub fn active_target(&self) -> ApiResult<PluginTarget> {
        let element = self.ensure_plugin_selected()?;
        Ok(PluginTarget {
            element,
            static_config: self.metadata(),
        })
    }

    /// The plugin at registry index `idx` as a [`PluginTarget`], WITHOUT
    /// selecting it — for validating against a swap target before the swap.
    pub fn target_at(&self, idx: usize) -> ApiResult<PluginTarget> {
        let mut st = self.borrow_mut();
        let element = st.plugin_store.plugins().get(idx).cloned();
        let static_config = st.plugin_store.plugin_configs().get(idx).cloned();
        Ok(PluginTarget {
            element: element.ok_or("No Plugin")?,
            static_config: static_config.ok_or("No Plugin")?,
        })
    }

    /// Write a validated plugin-level update into `target`'s bucket.
    pub fn apply_plugin_config(
        &self,
        target: &PluginTarget,
        validated: ValidatedPluginConfig,
    ) -> bool {
        self.edit_bucket(&target.static_config.name, |bucket| {
            apply_plugin_config_to(bucket, validated)
        })
    }

    /// Write a validated per-column update into `target`'s bucket.
    pub fn apply_columns_config(
        &self,
        target: &PluginTarget,
        validated: ValidatedColumnsConfig,
    ) -> bool {
        self.edit_bucket(&target.static_config.name, |bucket| {
            apply_columns_config_to(bucket, validated)
        })
    }

    /// The plugin a [`PluginUpdate`] would END on, resolved WITHOUT selecting
    /// anything: the swap target when the update names a different plugin (with
    /// its store index, to commit), else the selected plugin, else the registry
    /// default a first run would select.
    pub fn resolve_target(
        &self,
        update: &PluginUpdate,
    ) -> ApiResult<(PluginTarget, Option<usize>)> {
        if let Some((idx, _)) = self.resolve_plugin_update(update) {
            return Ok((self.target_at(idx)?, Some(idx)));
        }

        if let Some(plugin) = self.cell.state().plugin.as_ref() {
            return Ok((self.target_at(plugin.idx)?, None));
        }

        let (idx, _) = self
            .resolve_plugin_update(&OptionalUpdate::SetDefault)
            .ok_or("No Plugin")?;

        Ok((self.target_at(idx)?, Some(idx)))
    }

    /// Validate BOTH bucket updates of a restore against `target` and the view
    /// the restore would build (`view_config`, whose columns have the types in
    /// `view_schema`) — before either is written, and without a `View`.
    #[allow(clippy::too_many_arguments)]
    pub fn prepare_buckets(
        &self,
        target: &PluginTarget,
        session: &Session,
        view_config: &ViewConfig,
        view_schema: Option<&HashMap<String, ColumnType>>,
        rebinds: bool,
        plugin_config: PluginConfigUpdate,
        columns_config: ColumnConfigUpdate,
    ) -> ApiResult<(ValidatedPluginConfig, ValidatedColumnsConfig)> {
        let current = self.cell.state().bucket(&target.static_config.name);
        let plugin = validate_plugin_config(&current.plugin, plugin_config, &|merged| {
            if !declares(target, "plugin_config_schema") {
                return Ok(None);
            }

            self.query_plugin_config_schema_for(target, view_config, Some(merged))
                .map(Some)
                .map_err(|e| ValidationError(format!("`plugin_config` schema failed: {e}")))
        })?;

        let mut ends_with = current.clone();
        apply_plugin_config_to(&mut ends_with, plugin.clone());
        let columns = validate_columns_config(
            columns_config,
            &|col, cfg| {
                let Some(view_schema) = view_schema else {
                    return Ok(None);
                };

                if !declares(target, "column_config_schema") {
                    return Ok(None);
                }

                let env = ColumnSchemaEnv {
                    view_config,
                    session,
                    view_schema: Some(view_schema),
                    column_stats: !rebinds,
                    plugin_config: &ends_with.plugin,
                };

                self.query_column_config_schema_for(target, &env, col, Some(cfg))
                    .map(Some)
                    .map_err(|e| {
                        ValidationError(format!("`columns_config[\"{col}\"]` schema failed: {e}"))
                    })
            },
            &|col| view_schema.and_then(|x| x.get(col).copied()),
            &|col, cfg| self.resolve_css_refs_in(col, cfg),
        )?;

        Ok((plugin, columns))
    }

    /// The active plugin's per-column config map as the UI and `save()` see it
    /// — pending style edits included.
    pub fn all_columns_configs(&self) -> ColumnConfigMap {
        self.active_plugin_name()
            .map(|n| self.cell.projected_bucket(&n).columns)
            .unwrap_or_default()
    }

    /// The active plugin's COMMITTED per-column config map — what a running
    /// op's step reads, since the edits queued behind it have not happened.
    pub fn committed_columns_configs(&self) -> ColumnConfigMap {
        self.active_plugin_name()
            .map(|n| self.cell.state().bucket(&n).columns)
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
        let mut configs = self.committed_columns_configs();
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
                        default_stat: Some(_),
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
            self.edit_bucket(&n, |bucket| bucket.columns.clear());
        }
    }

    /// Clone of the active plugin's per-column entry for `column_name`,
    /// or `None` if no value is stored.
    pub fn get_columns_config(
        &self,
        column_name: &str,
    ) -> Option<serde_json::Map<String, serde_json::Value>> {
        let n = self.active_plugin_name()?;
        self.cell
            .projected_bucket(&n)
            .columns
            .get(column_name)
            .cloned()
    }

    /// Wholesale update the active plugin's per-column config map:
    /// [`validate_columns_config`] against the active target, then
    /// [`Renderer::apply_columns_config`].
    pub fn update_columns_configs(
        &self,
        view_config: &ViewConfig,
        session: &Session,
        update: ColumnConfigUpdate,
    ) -> ApiResult<bool> {
        if self.active_plugin_name().is_none() {
            return Ok(false);
        }

        let target = self.active_target()?;
        let validated = validate_columns_config(
            update,
            &|col, cfg| {
                let env = ColumnSchemaEnv {
                    view_config,
                    session,
                    view_schema: None,
                    column_stats: true,
                    plugin_config: &self.committed_plugin_config(),
                };

                Ok(self
                    .query_column_config_schema_for(&target, &env, col, Some(cfg))
                    .ok())
            },
            &|col| session.metadata().get_column_view_type(col),
            &|col, cfg| self.resolve_css_refs_in(col, cfg),
        )?;

        Ok(self.apply_columns_config(&target, validated))
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

        let current_value = self
            .cell
            .state()
            .bucket(&n)
            .columns
            .get(&column_name)
            .cloned();

        if let Ok(schema) = self.query_column_config_schema(
            view_config,
            session,
            &column_name,
            current_value.as_ref(),
        ) {
            for (key, error) in normalize_values(&schema, &mut update.value) {
                tracing::error!("Dropping `{column_name}`.`{key}`: {error}");
            }

            self.resolve_css_refs_in(&column_name, &mut update.value);
            strip_default_values(&schema, &mut update.value);
        }

        let next = self.edit_bucket(&n, |bucket| {
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
        });

        // The schema AFTER the update decides which keys survive and, for a
        // key whose control kind follows another key (`fg_color` reads as a
        // color, gradient or palette depending on `fg_mode`), whether the
        // value still parses under its new kind. A value that no longer
        // does is dropped here, so `save()` never emits a config that
        // `restore()` would reject.
        let after = self
            .query_column_config_schema(view_config, session, &column_name, Some(&next))
            .ok();

        self.edit_bucket(&n, |bucket| {
            if let Some(entry) = bucket.columns.get_mut(&column_name) {
                if let Some(schema) = &after {
                    let active = schema.active_keys();
                    entry.retain(|k, _| active.contains(k));
                    for (key, error) in normalize_values(schema, entry) {
                        tracing::warn!(
                            "Dropping `{column_name}`.`{key}` after a mode change: {error}"
                        );
                    }
                }

                if entry.is_empty() {
                    bucket.columns.remove(&column_name);
                }
            }
        })
    }

    /// The active plugin's plugin-level config map as the UI and `save()` see
    /// it — pending settings edits included.
    pub fn get_plugin_config(&self) -> serde_json::Map<String, serde_json::Value> {
        self.active_plugin_name()
            .map(|n| self.cell.projected_bucket(&n).plugin)
            .unwrap_or_default()
    }

    /// The active plugin's COMMITTED plugin-level config map — what a running
    /// op's step reads.
    pub fn committed_plugin_config(&self) -> serde_json::Map<String, serde_json::Value> {
        self.active_plugin_name()
            .map(|n| self.cell.state().bucket(&n).plugin)
            .unwrap_or_default()
    }

    /// Clear the active plugin's plugin-level config map.
    pub fn reset_plugin_config(&self) {
        if let Some(n) = self.active_plugin_name() {
            self.edit_bucket(&n, |bucket| bucket.plugin.clear());
        }
    }

    /// Synchronously query the active plugin's [`ColumnConfigSchema`] as it
    /// applies to `current_value`, the plugin-config state the schema should
    /// describe.
    fn query_plugin_config_schema(
        &self,
        view_config: &ViewConfig,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ColumnConfigSchema> {
        let target = self.active_target()?;
        self.query_plugin_config_schema_for(&target, view_config, current_value)
    }

    /// [`Self::query_plugin_config_schema`] against an explicit target.
    fn query_plugin_config_schema_for(
        &self,
        target: &PluginTarget,
        view_config: &ViewConfig,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ColumnConfigSchema> {
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);
        let current_js = JsValue::from_serde_ext(&current_value).unwrap_or(JsValue::NULL);
        let raw = target
            .element
            ._plugin_config_schema(&view_config_js, &current_js)?;

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
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ColumnConfigSchema> {
        let target = self.active_target()?;
        let env = ColumnSchemaEnv {
            view_config,
            session,
            view_schema: None,
            column_stats: true,
            plugin_config: &self.committed_plugin_config(),
        };

        self.query_column_config_schema_for(&target, &env, column_name, current_value)
    }

    /// [`Self::query_column_config_schema`] against an explicit target: the
    /// column's group comes from the TARGET's static config, and its view type
    /// from `view_schema` when given (a config not yet bound to a `View`), else
    /// from the bound `View`'s schema.
    fn query_column_config_schema_for(
        &self,
        target: &PluginTarget,
        env: &ColumnSchemaEnv<'_>,
        column_name: &str,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ColumnConfigSchema> {
        let ColumnSchemaEnv {
            view_config,
            session,
            view_schema,
            column_stats,
            plugin_config,
        } = *env;

        let names = &target.static_config.config_column_names;
        let group = view_config
            .columns
            .iter()
            .position(|maybe_s| maybe_s.as_deref() == Some(column_name))
            .and_then(|idx| names.get(idx))
            .map(|s| s.as_str());

        let view_type = match view_schema {
            Some(view_schema) => view_schema.get(column_name).copied(),
            None => {
                if !session.metadata().has_view_schema() {
                    return Err(JsValue::from("view_schema not initialized").into());
                }

                session.metadata().get_column_view_type(column_name)
            },
        };

        let Some(view_type) = view_type else {
            return Ok(ColumnConfigSchema { fields: vec![] });
        };

        let current_js = JsValue::from_serde_ext(&current_value).unwrap_or(JsValue::NULL);
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);
        let plugin_config_js = JsValue::from_serde_ext(plugin_config).unwrap_or(JsValue::NULL);
        let raw = target.element._column_config_schema(
            &view_type.to_string(),
            group,
            column_name,
            &current_js,
            &view_config_js,
            &plugin_config_js,
        )?;

        let abs_max = column_stats
            .then(|| {
                session
                    .get_column_stats(column_name)
                    .and_then(|s| s.abs_max)
            })
            .flatten();

        serde_wasm_bindgen::from_value::<ColumnConfigSchema>(raw)
            .map(|schema| schema.canonicalize().resolve_stat_defaults(abs_max))
            .map_err(|e| e.into())
    }

    /// Merge an update into the active plugin's plugin-level config map:
    /// [`validate_plugin_config`] against the active target, then
    /// [`Renderer::apply_plugin_config`].
    pub fn update_plugin_config(
        &self,
        view_config: &ViewConfig,
        update: PluginConfigUpdate,
    ) -> ApiResult<bool> {
        if self.active_plugin_name().is_none() {
            return Ok(false);
        }

        let target = self.active_target()?;
        let current = self.committed_plugin_config();
        let validated = validate_plugin_config(&current, update, &|merged| {
            Ok(self
                .query_plugin_config_schema_for(&target, view_config, Some(merged))
                .ok())
        })?;

        Ok(self.apply_plugin_config(&target, validated))
    }

    /// Apply a single schema-field update from the plugin-settings UI,
    /// dropping keys the resulting schema no longer advertises.
    pub fn update_plugin_config_field(
        &self,
        view_config: &ViewConfig,
        mut update: ColumnConfigFieldUpdate,
    ) -> bool {
        let Some(n) = self.active_plugin_name() else {
            return false;
        };

        let mut next = self.committed_plugin_config();
        for k in &update.keys {
            match update.value.get(k) {
                Some(v) => {
                    next.insert(k.clone(), v.clone());
                },
                None => {
                    next.remove(k);
                },
            }
        }

        let schema = self
            .query_plugin_config_schema(view_config, Some(&next))
            .ok();

        if let Some(schema) = &schema {
            for (key, error) in normalize_values(schema, &mut update.value) {
                tracing::error!("Dropping `plugin_config`.`{key}`: {error}");
            }

            strip_default_values(schema, &mut update.value);
        }

        self.edit_bucket(&n, |bucket| {
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

            if let Some(schema) = &schema {
                let active = schema.active_keys();
                let before = bucket.plugin.len();
                bucket.plugin.retain(|k, _| active.contains(k));
                changed |= bucket.plugin.len() != before;
            }

            changed
        })
    }
}

/// Canonicalize every CSS-valued key of `map` and check every `Enum`-valued
/// key against its variants, removing and reporting the keys that fail.
/// The schema is the one queried for `map`'s own values, so an `Enum`'s
/// variants are exactly the values the column's type accepts.
fn normalize_values(
    schema: &ColumnConfigSchema,
    map: &mut serde_json::Map<String, serde_json::Value>,
) -> Vec<(String, String)> {
    let mut errors = vec![];
    for (key, value) in map.iter_mut() {
        if let Some(kind) = schema.css_kind_of(key) {
            let canonical = match value.as_str() {
                Some(src) => kind.canonicalize(src),
                None => Err(format!("expected a CSS string, got `{value}`")),
            };

            match canonical {
                Ok(canonical) => *value = Value::String(canonical),
                Err(error) => errors.push((key.clone(), error)),
            }
        } else if let Some(variants) = schema.enum_variants_of(key) {
            let accepted = variants.iter().any(|v| value.as_str() == Some(&v.value));
            if !accepted {
                let expected = variants
                    .iter()
                    .map(|v| format!("`{}`", v.value))
                    .collect::<Vec<_>>()
                    .join(", ");

                errors.push((key.clone(), format!("{value} is not one of {expected}")));
            }
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
        }
        | ControlSpec::Font {
            key: k, default, ..
        } if k == key => value.as_str() == Some(default.as_str()),
        ControlSpec::Font {
            size: Some(size), ..
        } if size.key == key => value.as_f64() == Some(size.default),
        ControlSpec::Font { bold, italic, .. } => [bold, italic]
            .into_iter()
            .flatten()
            .any(|toggle| toggle.key == key && value.as_bool() == Some(toggle.default)),
        ControlSpec::Alignment {
            key: k,
            default: Some(default),
            ..
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
    fn alignment_strips_only_a_declared_default() {
        let schema = ColumnConfigSchema {
            fields: vec![
                ControlSpec::Alignment {
                    key: "align".to_owned(),
                    default: None,
                    corners: false,
                },
                ControlSpec::Alignment {
                    key: "legend_anchor".to_owned(),
                    default: Some(Alignment::TopRight),
                    corners: true,
                },
            ],
        };

        let mut map = json!({ "align": "center", "legend_anchor": "top-right" })
            .as_object()
            .unwrap()
            .clone();

        strip_default_values(&schema, &mut map);
        assert_eq!(
            map,
            json!({ "align": "center" }).as_object().unwrap().clone()
        );
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
                default_stat: None,
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
    fn normalize_values_rejects_enum_values_outside_the_variants() {
        let schema = ColumnConfigSchema {
            fields: vec![ControlSpec::Group {
                key: "color".to_owned(),
                fields: vec![ControlSpec::Enum {
                    key: "fg_mode".to_owned(),
                    default: "color".to_owned(),
                    variants: vec![
                        EnumVariant {
                            value: "disabled".to_owned(),
                            label: None,
                        },
                        EnumVariant {
                            value: "color".to_owned(),
                            label: None,
                        },
                    ],
                }],
            }],
        };

        let mut map = json!({ "fg_mode": "color", "other": "series" })
            .as_object()
            .unwrap()
            .clone();

        assert!(normalize_values(&schema, &mut map).is_empty());
        assert_eq!(map.len(), 2);

        let mut map = json!({ "fg_mode": "series" }).as_object().unwrap().clone();
        let errors = normalize_values(&schema, &mut map);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].0, "fg_mode");
        assert_eq!(errors[0].1, "\"series\" is not one of `disabled`, `color`");
        assert!(map.is_empty());

        let mut map = json!({ "fg_mode": 3 }).as_object().unwrap().clone();
        let errors = normalize_values(&schema, &mut map);
        assert_eq!(errors.len(), 1);
        assert!(map.is_empty());
    }

    fn enum_schema() -> ColumnConfigSchema {
        ColumnConfigSchema {
            fields: vec![
                ControlSpec::Enum {
                    key: "fg_mode".to_owned(),
                    default: "color".to_owned(),
                    variants: vec![
                        EnumVariant {
                            value: "disabled".to_owned(),
                            label: None,
                        },
                        EnumVariant {
                            value: "color".to_owned(),
                            label: None,
                        },
                    ],
                },
                ControlSpec::Bool {
                    key: "flag".to_owned(),
                    default: false,
                },
            ],
        }
    }

    fn obj(value: serde_json::Value) -> ConfigMap {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn validate_plugin_config_rejects_enum_values_outside_the_variants() {
        let err = validate_plugin_config(
            &ConfigMap::new(),
            OptionalUpdate::Update(obj(json!({ "fg_mode": "series" }))),
            &|_| Ok(Some(enum_schema())),
        )
        .err()
        .expect("rejected");

        assert!(
            err.0
                .contains("Invalid `plugin_config.fg_mode`: \"series\" is not one of"),
            "{}",
            err.0
        );
    }

    #[test]
    fn validate_plugin_config_splits_defaults_and_prunes_to_active_keys() {
        let validated = validate_plugin_config(
            &obj(json!({ "fg_mode": "disabled" })),
            OptionalUpdate::Update(obj(json!({ "fg_mode": "color", "flag": true, "ghost": 1 }))),
            &|merged| {
                assert_eq!(merged["fg_mode"], "color");
                assert_eq!(merged["flag"], true);
                Ok(Some(enum_schema()))
            },
        )
        .unwrap();

        let ValidatedPluginConfig::Set {
            map,
            remove,
            active,
        } = validated
        else {
            panic!("expected Set");
        };

        assert_eq!(map, obj(json!({ "flag": true })));
        assert_eq!(remove, vec!["fg_mode".to_owned()]);
        assert_eq!(
            active.unwrap(),
            HashSet::from(["fg_mode".to_owned(), "flag".to_owned()])
        );
    }

    #[test]
    fn validate_plugin_config_passes_through_without_a_schema() {
        let update = obj(json!({ "fg_mode": "series", "ghost": 1 }));
        let validated = validate_plugin_config(
            &ConfigMap::new(),
            OptionalUpdate::Update(update.clone()),
            &|_| Ok(None),
        )
        .unwrap();

        assert_eq!(validated, ValidatedPluginConfig::Set {
            map: update,
            remove: vec![],
            active: None,
        });
        assert_eq!(
            validate_plugin_config(&ConfigMap::new(), OptionalUpdate::SetDefault, &|_| {
                Ok(Some(enum_schema()))
            })
            .unwrap(),
            ValidatedPluginConfig::Clear
        );
    }

    #[test]
    fn validate_columns_config_rejects_and_names_the_column() {
        let err = validate_columns_config(
            OptionalUpdate::Update(HashMap::from([(
                "a".to_owned(),
                obj(json!({ "fg_mode": "series" })),
            )])),
            &|_, _| Ok(Some(enum_schema())),
            &|_| Some(ColumnType::Integer),
            &|_, _| {},
        )
        .err()
        .expect("rejected");

        let msg = err.0;
        assert!(
            msg.contains("Invalid `columns_config[\"a\"].fg_mode`"),
            "{msg}"
        );
        assert!(msg.contains("for a integer column"), "{msg}");
    }

    #[test]
    fn validate_columns_config_strips_defaults_and_keeps_unschematized_columns() {
        let validated = validate_columns_config(
            OptionalUpdate::Update(HashMap::from([
                (
                    "a".to_owned(),
                    obj(json!({ "fg_mode": "color", "flag": true, "ghost": 1 })),
                ),
                ("b".to_owned(), obj(json!({ "anything": "goes" }))),
            ])),
            &|col, _| Ok((col == "a").then(enum_schema)),
            &|_| None,
            &|_, _| {},
        )
        .unwrap();

        let ValidatedColumnsConfig::Set(mut entries) = validated else {
            panic!("expected Set");
        };

        entries.sort_by(|x, y| x.0.cmp(&y.0));
        assert_eq!(entries, vec![
            ("a".to_owned(), obj(json!({ "flag": true }))),
            ("b".to_owned(), obj(json!({ "anything": "goes" }))),
        ]);
    }

    #[test]
    fn normalize_values_canonicalizes_and_reports() {
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

        let errors = normalize_values(&schema, &mut map);
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
