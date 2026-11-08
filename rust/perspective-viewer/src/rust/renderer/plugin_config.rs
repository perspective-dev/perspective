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
use super::config_defaults::{CONFIG_DEFAULTS, ConfigDefaults};
use super::state::PluginRef;
use crate::config::*;
use crate::js::plugin::JsPerspectiveViewerPlugin;
use crate::queries::{is_pivot_only_column, resolve_abs_max};
use crate::session::Session;
use crate::utils::{CssKind, CssLiteralUse, parse_var_ref, resolve_css_refs};

type ConfigMap = serde_json::Map<String, serde_json::Value>;

/// A schema query's answer: `Ok(None)` when the plugin declares no schema.
pub type SchemaResult = Result<Option<ColumnConfigSchema>, ValidationError>;

/// Where in the `ViewConfig` a column being configured appears, which is a
/// different axis from its plugin column slot.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ColumnRole {
    Column,
    GroupBy,
    SplitBy,
}

impl ColumnRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Column => "column",
            Self::GroupBy => "group_by",
            Self::SplitBy => "split_by",
        }
    }
}

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
pub use crate::config::ColumnConfigMap;

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

/// The renderer's part of a restore that has passed every check.
pub struct PreparedRenderer {
    /// The plugin selection to commit, when the restore ends on another plugin.
    pub plugin: Option<PluginRef>,

    /// The plugin whose bucket the validated updates belong to.
    pub target_name: String,
    pub plugin_config: ValidatedPluginConfig,
    pub columns_config: ValidatedColumnsConfig,
    pub theme: Option<Option<String>>,
}

/// Which of the target plugin's buckets a [`Renderer::commit`] changed.
pub struct RendererChanges {
    pub plugin_config: bool,
    pub columns_config: bool,
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
                    strip_default_values(&schema, &mut cfg, view_type_of(&col));
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
        let state = self.state();
        let mut bucket = state.bucket(name);
        let result = f(&mut bucket);
        self.swap(state.with_bucket(name, bucket));
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

        if let Some(plugin) = self.state().plugin.as_ref() {
            return Ok((self.target_at(plugin.idx)?, None));
        }

        let (idx, _) = self
            .resolve_plugin_update(&OptionalUpdate::SetDefault)
            .ok_or("No Plugin")?;

        Ok((self.target_at(idx)?, Some(idx)))
    }

    /// The COMMIT half of a restore, as one swap of this renderer's state.
    pub fn commit(&self, prepared: PreparedRenderer) -> RendererChanges {
        let PreparedRenderer {
            plugin,
            target_name,
            plugin_config,
            columns_config,
            theme,
        } = prepared;

        let mut next = (*self.state()).clone();
        if let Some(plugin) = plugin {
            next = next.with_plugin(plugin);
        }

        let mut bucket = next.bucket(&target_name);
        let changes = RendererChanges {
            plugin_config: apply_plugin_config_to(&mut bucket, plugin_config),
            columns_config: apply_columns_config_to(&mut bucket, columns_config),
        };

        if changes.plugin_config || changes.columns_config {
            next = next.with_bucket(&target_name, bucket);
        }

        if let Some(theme) = theme {
            next = next.with_theme(theme);
        }

        self.swap(next);
        changes
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
        let current = self.state().bucket(&target.static_config.name);
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
            .map(|n| self.projected_bucket(&n).columns)
            .unwrap_or_default()
    }

    /// The active plugin's COMMITTED per-column config map — what a running
    /// op's step reads, since the edits queued behind it have not happened.
    pub fn committed_columns_configs(&self) -> ColumnConfigMap {
        self.active_plugin_name()
            .map(|n| self.state().bucket(&n).columns)
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

    /// The active plugin's committed per-column configs as delivered to it:
    /// stored values plus default overrides and `include: true` numbers it does
    /// not store.
    pub async fn all_columns_configs_materialized(
        &self,
        view_config: &ViewConfig,
        session: &Session,
    ) -> ColumnConfigMap {
        let mut configs = self.committed_columns_configs();
        let plugin = self.metadata().name.clone();
        if CONFIG_DEFAULTS.with(|d| d.slots().has_column_layers(&plugin)) {
            for column in configurable_columns(view_config) {
                configs.entry(column).or_default();
            }
        }

        let mut to_warm: Vec<String> = vec![];
        for (col, entry) in &configs {
            if session
                .get_column_stats(col)
                .and_then(|s| s.abs_max)
                .is_some()
            {
                continue;
            }

            let current = Some(entry).filter(|e| !e.is_empty());
            let Ok(schema) = self.query_column_config_schema(view_config, session, col, current)
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

        let Ok(target) = self.active_target() else {
            return configs;
        };

        let plugin_config = self.committed_plugin_config();
        let env = ColumnSchemaEnv {
            view_config,
            session,
            view_schema: None,
            column_stats: true,
            plugin_config: &plugin_config,
        };

        for (col, entry) in &mut configs {
            let current = Some(&*entry).filter(|e| !e.is_empty()).cloned();
            let Ok(resolved) =
                self.query_column_config_schema_resolved(&target, &env, col, current.as_ref())
            else {
                continue;
            };

            for field in resolved.schema.leaf_fields() {
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

            materialize_overrides(entry, &resolved);
        }

        configs.retain(|_, entry| !entry.is_empty());
        configs
    }

    /// The active plugin's committed `plugin_config` as delivered to it: stored
    /// values plus the default overrides it does not store.
    pub fn plugin_config_materialized(&self, view_config: &ViewConfig) -> ConfigMap {
        let mut config = self.committed_plugin_config();
        let plugin = self.metadata().name.clone();
        let has_layers = CONFIG_DEFAULTS.with(|d| !d.slots().plugin_layers(&plugin).is_empty());

        if has_layers
            && let Ok(target) = self.active_target()
            && let Ok(resolved) =
                self.query_plugin_config_schema_resolved(&target, view_config, Some(&config))
        {
            materialize_overrides(&mut config, &resolved);
        }

        config
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
        self.projected_bucket(&n).columns.get(column_name).cloned()
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

        let current_value = self.state().bucket(&n).columns.get(&column_name).cloned();

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
            let view_type = session.metadata().get_column_view_type(&column_name);
            strip_default_values(&schema, &mut update.value, view_type);
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
            .map(|n| self.projected_bucket(&n).plugin)
            .unwrap_or_default()
    }

    /// The active plugin's COMMITTED plugin-level config map — what a running
    /// op's step reads.
    pub fn committed_plugin_config(&self) -> serde_json::Map<String, serde_json::Value> {
        self.active_plugin_name()
            .map(|n| self.state().bucket(&n).plugin)
            .unwrap_or_default()
    }

    /// Clear the active plugin's plugin-level config map.
    pub fn reset_plugin_config(&self) {
        if let Some(n) = self.active_plugin_name() {
            self.edit_bucket(&n, |bucket| bucket.plugin.clear());
        }
    }

    /// The active plugin's plugin-level [`ColumnConfigSchema`] for
    /// `current_value`, the plugin-config state it should describe, with
    /// default overrides applied.
    pub(crate) fn query_plugin_config_schema(
        &self,
        view_config: &ViewConfig,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ColumnConfigSchema> {
        let target = self.active_target()?;
        self.query_plugin_config_schema_for(&target, view_config, current_value)
    }

    fn query_plugin_config_schema_for(
        &self,
        target: &PluginTarget,
        view_config: &ViewConfig,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ColumnConfigSchema> {
        self.query_plugin_config_schema_resolved(target, view_config, current_value)
            .map(|resolved| resolved.schema)
    }

    fn query_plugin_config_schema_resolved(
        &self,
        target: &PluginTarget,
        view_config: &ViewConfig,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ResolvedSchema> {
        let defaults = CONFIG_DEFAULTS.with(ConfigDefaults::slots);
        let plugin = &target.static_config.name;
        let layers = defaults.plugin_layers(plugin);
        let current = with_plain_overrides(current_value, &layers);
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);
        let current_js = JsValue::from_serde_ext(&current).unwrap_or(JsValue::NULL);
        let raw = target
            .element
            ._plugin_config_schema(&view_config_js, &current_js)?;

        let schema = serde_wasm_bindgen::from_value::<ColumnConfigSchema>(raw)?.canonicalize();
        Ok(ResolvedSchema::apply(schema, &layers, None, plugin, None))
    }

    /// The active plugin's [`ColumnConfigSchema`] for `column_name` under
    /// `plugin_config`, with default overrides applied; empty until the view's
    /// schema is known.
    pub(crate) fn query_column_config_schema_with(
        &self,
        view_config: &ViewConfig,
        session: &Session,
        column_name: &str,
        current_value: Option<&ConfigMap>,
        plugin_config: &ConfigMap,
    ) -> ApiResult<ColumnConfigSchema> {
        if !session.metadata().has_view_schema() {
            return Ok(ColumnConfigSchema::default());
        }

        let target = self.active_target()?;
        let env = ColumnSchemaEnv {
            view_config,
            session,
            view_schema: None,
            column_stats: true,
            plugin_config,
        };

        self.query_column_config_schema_for(&target, &env, column_name, current_value)
    }

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

    fn query_column_config_schema_for(
        &self,
        target: &PluginTarget,
        env: &ColumnSchemaEnv<'_>,
        column_name: &str,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ColumnConfigSchema> {
        self.query_column_config_schema_resolved(target, env, column_name, current_value)
            .map(|resolved| resolved.schema)
    }

    fn query_column_config_schema_resolved(
        &self,
        target: &PluginTarget,
        env: &ColumnSchemaEnv<'_>,
        column_name: &str,
        current_value: Option<&ConfigMap>,
    ) -> ApiResult<ResolvedSchema> {
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

        let role = if !is_pivot_only_column(column_name, view_config) {
            ColumnRole::Column
        } else if view_config.split_by.iter().any(|x| x == column_name) {
            ColumnRole::SplitBy
        } else {
            ColumnRole::GroupBy
        };

        let view_type = match view_schema {
            Some(view_schema) => view_schema.get(column_name).copied(),
            None => {
                if !session.metadata().has_view_schema() {
                    return Err(JsValue::from("view_schema not initialized").into());
                }

                session.metadata().get_column_view_type(column_name)
            },
        };

        let view_type = match role {
            ColumnRole::Column => view_type,
            _ => session
                .metadata()
                .get_column_table_type(column_name)
                .or(view_type),
        };

        let Some(view_type) = view_type else {
            return Ok(ResolvedSchema::default());
        };

        let defaults = CONFIG_DEFAULTS.with(ConfigDefaults::slots);
        let plugin = &target.static_config.name;
        let layers = defaults.column_layers(plugin, view_type);
        let current = with_plain_overrides(current_value, &layers);
        let current_js = JsValue::from_serde_ext(&current).unwrap_or(JsValue::NULL);
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);
        let plugin_config_js = JsValue::from_serde_ext(plugin_config).unwrap_or(JsValue::NULL);
        let raw = target.element._column_config_schema(
            &view_type.to_string(),
            group,
            column_name,
            &current_js,
            &view_config_js,
            &plugin_config_js,
            role.as_str(),
        )?;

        let abs_max = column_stats
            .then(|| {
                session
                    .get_column_stats(column_name)
                    .and_then(|s| s.abs_max)
            })
            .flatten();

        let schema = serde_wasm_bindgen::from_value::<ColumnConfigSchema>(raw)?
            .canonicalize()
            .resolve_stat_defaults(abs_max);

        Ok(ResolvedSchema::apply(
            schema,
            &layers,
            Some(view_type),
            plugin,
            Some(column_name),
        ))
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

            strip_default_values(schema, &mut update.value, None);
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

/// A schema with default overrides applied, and the override-only value of
/// every key they set.
#[derive(Default)]
struct ResolvedSchema {
    schema: ColumnConfigSchema,
    overrides: OverrideValues,
    view_type: Option<ColumnType>,
}

impl ResolvedSchema {
    fn apply(
        mut schema: ColumnConfigSchema,
        layers: &[&ConfigMap],
        view_type: Option<ColumnType>,
        plugin: &str,
        column: Option<&str>,
    ) -> Self {
        if layers.is_empty() {
            return Self {
                schema,
                overrides: OverrideValues::new(),
                view_type,
            };
        }

        let (overrides, errors) =
            schema.apply_defaults(layers, view_type == Some(ColumnType::Float));

        let column = column
            .map(|column| format!(" column `{column}`"))
            .unwrap_or_default();

        for (key, error) in errors {
            CONFIG_DEFAULTS.with(|d| {
                d.report(format!(
                    "Ignoring default override `{key}` for plugin `{plugin}`{column}: {error}"
                ))
            });
        }

        Self {
            schema,
            overrides,
            view_type,
        }
    }

    /// The `number_format` default this schema resolves to, overrides included.
    fn number_format_default(&self) -> Option<CustomNumberFormatConfig> {
        self.schema
            .leaf_fields()
            .into_iter()
            .find_map(|spec| match spec {
                ControlSpec::NumberFormat { default } => Some(default.clone().unwrap_or_default()),
                _ => None,
            })
    }
}

/// `current` with every non-object value of `layers` it lacks, the highest
/// layer winning.
fn with_plain_overrides(current: Option<&ConfigMap>, layers: &[&ConfigMap]) -> Option<ConfigMap> {
    if layers.is_empty() {
        return current.cloned();
    }

    let mut out = current.cloned().unwrap_or_default();
    for layer in layers.iter().rev() {
        for (key, value) in layer.iter() {
            if !value.is_object() && !out.contains_key(key) {
                out.insert(key.clone(), value.clone());
            }
        }
    }

    Some(out)
}

/// Every column a plugin may configure under `view_config`.
fn configurable_columns(view_config: &ViewConfig) -> Vec<String> {
    view_config
        .columns
        .iter()
        .flatten()
        .chain(view_config.group_by.iter())
        .chain(view_config.split_by.iter())
        .cloned()
        .collect()
}

/// Write the overrides `resolved` applied into `entry`, a stored config being
/// delivered: plain keys it lacks, and each format layered under its stored
/// value.
fn materialize_overrides(entry: &mut ConfigMap, resolved: &ResolvedSchema) {
    for (key, value) in &resolved.overrides {
        match key.as_str() {
            "date_format" => {
                let Ok(overrides) = serde_json::from_value::<DatetimeFormat>(value.clone()) else {
                    continue;
                };

                let stored = stored_format::<DatetimeFormat>(entry, key);
                if let Ok(delivered) = serde_json::to_value(overrides.overlay(&stored)) {
                    entry.insert(key.clone(), delivered);
                }
            },
            "number_format" => {
                let Ok(overrides) =
                    serde_json::from_value::<CustomNumberFormatConfig>(value.clone())
                else {
                    continue;
                };

                let stored = stored_format::<CustomNumberFormatConfig>(entry, key);
                let mut delivered = overrides.overlay(&stored);
                let full = NumberFormatDefaults::resolve(
                    Some(
                        &resolved
                            .number_format_default()
                            .unwrap_or_default()
                            .overlay(&stored),
                    ),
                    resolved.view_type == Some(ColumnType::Float),
                );

                if delivered.minimum_fraction_digits.is_some()
                    != delivered.maximum_fraction_digits.is_some()
                {
                    delivered.minimum_fraction_digits = Some(full.fraction.0);
                    delivered.maximum_fraction_digits = Some(full.fraction.1);
                }

                if delivered.minimum_significant_digits.is_some()
                    != delivered.maximum_significant_digits.is_some()
                {
                    delivered.minimum_significant_digits = Some(full.significant.0);
                    delivered.maximum_significant_digits = Some(full.significant.1);
                }

                if let Ok(delivered) = serde_json::to_value(delivered) {
                    entry.insert(key.clone(), delivered);
                }
            },
            _ => {
                entry.entry(key.clone()).or_insert_with(|| value.clone());
            },
        }
    }
}

fn stored_format<T: serde::de::DeserializeOwned + Default>(entry: &ConfigMap, key: &str) -> T {
    entry
        .get(key)
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default()
}

/// Canonicalize every CSS-valued key of `map`, check every `Enum`-valued key
/// against its variants and every format against its type, removing and
/// reporting the keys that fail.
fn normalize_values(
    schema: &ColumnConfigSchema,
    map: &mut serde_json::Map<String, serde_json::Value>,
) -> Vec<(String, String)> {
    let leaves = schema.leaf_fields();
    let owns = |key: &str, matches: fn(&ControlSpec) -> bool| {
        leaves
            .iter()
            .any(|spec| matches(spec) && spec.serialized_keys().contains(&key))
    };

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
        } else if owns(key, |spec| {
            matches!(spec, ControlSpec::DatetimeFormat { .. })
        }) {
            let checked = serde_json::from_value::<DatetimeFormat>(value.clone())
                .map_err(|e| e.to_string())
                .and_then(|format| format.validate());

            if let Err(error) = checked {
                errors.push((key.clone(), error));
            }
        } else if owns(key, |spec| matches!(spec, ControlSpec::NumberFormat { .. }))
            && let Err(error) = serde_json::from_value::<CustomNumberFormatConfig>(value.clone())
        {
            errors.push((key.clone(), error.to_string()));
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
    view_type: Option<ColumnType>,
) {
    let leaves = schema.leaf_fields();
    map.retain(|key, value| {
        !leaves
            .iter()
            .any(|spec| matches_declared_default(spec, key, value))
    });

    for spec in leaves {
        match spec {
            ControlSpec::DatetimeFormat { default } => {
                let Some(Ok(stored)) = map
                    .get("date_format")
                    .map(|v| serde_json::from_value::<DatetimeFormat>(v.clone()))
                else {
                    continue;
                };

                let inherited = DatetimeFormat::base(view_type == Some(ColumnType::Datetime))
                    .overlay(&default.clone().unwrap_or_default());

                let diff = stored.diff(&inherited);
                match serde_json::to_value(&diff) {
                    Ok(value) if !diff.is_empty() => map.insert("date_format".to_owned(), value),
                    _ => map.remove("date_format"),
                };
            },
            ControlSpec::NumberFormat { default } => {
                let Some(Ok(stored)) = map
                    .get("number_format")
                    .map(|v| serde_json::from_value::<CustomNumberFormatConfig>(v.clone()))
                else {
                    continue;
                };

                let defaults = NumberFormatDefaults::resolve(
                    default.as_ref(),
                    view_type == Some(ColumnType::Float),
                );

                let filtered = stored.filter_default(&defaults);
                match serde_json::to_value(&filtered) {
                    Ok(value) if filtered != CustomNumberFormatConfig::default() => {
                        map.insert("number_format".to_owned(), value)
                    },
                    _ => map.remove("number_format"),
                };
            },
            _ => {},
        }
    }
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
