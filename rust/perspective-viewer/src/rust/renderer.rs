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

//! `Renderer` owns the JavaScript Custom Element plugin, as well as
//! associated state such as column restrictions and `plugin_config`
//! (de-)serialization.
//!
//! `Renderer` wraps a smart pointer and is meant to be shared among many
//! references throughout the application.

mod activate;
pub mod limits;
mod plugin_store;
mod props;
mod registry;
mod render_timer;

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::future::Future;
use std::ops::Deref;
use std::pin::Pin;
use std::rc::Rc;

use futures::future::{join_all, select_all};
use perspective_client::config::ViewConfig;
use perspective_client::utils::*;
use perspective_client::{View, ViewWindow};
use perspective_js::utils::{ApiResult, JsValueSerdeExt, ResultTApiErrorExt};
use serde_json::Value;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use self::activate::*;
pub use self::limits::RenderLimits;
use self::limits::*;
use self::plugin_store::*;
pub use self::props::RendererProps;
pub use self::registry::*;
use self::render_timer::*;
use crate::config::*;
use crate::js::plugin::*;
use crate::queries::resolve_abs_max;
use crate::session::Session;
use crate::utils::*;

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

/// Immutable state
pub struct RendererData {
    plugin_data: RefCell<RendererMutData>,
    draw_lock: DebounceMutex,
    pub plugin_changed: PubSub<JsPerspectiveViewerPlugin>,
    pub style_changed: PubSub<()>,
    pub reset_changed: PubSub<()>,
    pub selection_changed: PubSub<Option<ViewWindow>>,

    /// Fires after a column-style edit lands in the active plugin's
    /// bucket.
    pub column_style_changed: PubSub<ColumnConfigMap>,

    /// Fires after a plugin-level config edit lands in the active
    /// plugin's bucket.
    pub plugin_config_changed: PubSub<serde_json::Map<String, serde_json::Value>>,

    /// `true` while the active plugin's "rendering N of M" warning is
    /// dismissable.
    pub render_warning: Cell<bool>,

    /// Fires after every draw/update with the computed render limits.
    pub on_render_limits_changed: RefCell<Option<Callback<RenderLimits>>>,
}

/// Mutable state
pub struct RendererMutData {
    viewer_elem: HtmlElement,
    metadata: Rc<PluginStaticConfig>,
    plugin_store: PluginStore,
    plugins_idx: Option<usize>,
    timer: MovingWindowRenderTimer,
    selection: Option<ViewWindow>,
    pending_plugin: Option<usize>,

    /// Per-plugin config buckets, keyed by plugin name.
    plugin_states: HashMap<String, PluginScopedConfig>,
}

/// The state object responsible for the active [`JsPerspectiveViewerPlugin`].
#[derive(Clone)]
pub struct Renderer(Rc<RendererData>);

impl Deref for Renderer {
    type Target = RendererData;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq for Renderer {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

impl ImplicitClone for Renderer {}

impl Deref for RendererData {
    type Target = RefCell<RendererMutData>;

    fn deref(&self) -> &Self::Target {
        &self.plugin_data
    }
}

type TaskResult = ApiResult<JsValue>;
type TimeoutTask<'a> = Pin<Box<dyn Future<Output = Option<TaskResult>> + 'a>>;

/// How long to await a call to the plugin's `draw()` before resizing.
static PRESIZE_TIMEOUT: i32 = 500;

impl Renderer {
    pub fn new(viewer_elem: &HtmlElement) -> Self {
        Self(Rc::new(RendererData {
            plugin_data: RefCell::new(RendererMutData {
                viewer_elem: viewer_elem.clone(),
                metadata: Rc::new(PluginStaticConfig::default()),
                plugin_store: PluginStore::default(),
                plugins_idx: None,
                selection: None,
                timer: MovingWindowRenderTimer::default(),
                pending_plugin: None,
                plugin_states: HashMap::default(),
            }),
            draw_lock: Default::default(),
            plugin_changed: Default::default(),
            style_changed: Default::default(),
            reset_changed: Default::default(),
            selection_changed: Default::default(),
            column_style_changed: Default::default(),
            plugin_config_changed: Default::default(),
            render_warning: Cell::new(true),
            on_render_limits_changed: Default::default(),
        }))
    }

    pub fn delete(&self) -> ApiResult<()> {
        self.get_active_plugin().map(|x| x.delete()).unwrap_or_log();
        self.plugin_data.borrow().viewer_elem.set_inner_text("");
        let new_state = Self::new(&self.plugin_data.borrow().viewer_elem);
        std::mem::swap(
            &mut *self.plugin_data.borrow_mut(),
            &mut *new_state.plugin_data.borrow_mut(),
        );

        Ok(())
    }

    pub fn metadata(&self) -> Rc<PluginStaticConfig> {
        self.borrow().metadata.clone()
    }

    pub fn is_chart(&self) -> bool {
        self.metadata().name.as_str() != "Datagrid"
    }

    /// Whether the active plugin opts into per-column style controls.
    pub fn can_render_column_styles(&self) -> bool {
        self.metadata().can_render_column_styles
    }

    /// Name of the currently-active plugin (used as the key into
    /// `plugin_states`). Returns `None` when no plugin has been
    /// activated yet.
    fn active_plugin_name(&self) -> Option<String> {
        Some(self.borrow().metadata.name.clone()).filter(|n| !n.is_empty())
    }

    // ─── Per-column config (active plugin's bucket) ───────────────────

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
    ///
    /// The bucket itself stays minimal (user edits + `include: true`
    /// values the user *explicitly set*); this helper produces the
    /// fully-realized payload the plugin's `restore` is expected to
    /// receive. Every restore-prep site should call this rather than
    /// `all_columns_configs` directly — otherwise widgets that gate
    /// `include` fields off other fields (e.g. Datagrid's
    /// `fg_gradient` revealed when `number_fg_mode = "bar"`) will
    /// reach the plugin without their default value populated.
    ///
    /// `async` because per-column stats (e.g. `abs_max` for Datagrid's
    /// `fg_gradient`) may need to be fetched before the schema's
    /// `default` is meaningful. Pass 1 sync-scans the schema for any
    /// column whose `include: true` Number key is missing from its
    /// entry AND has no cached stats — `view_config_changed` clears the
    /// stats cache, so "missing in cache" subsumes "stale". Pass 2
    /// blocks on a parallel `resolve_abs_max` for that set, then runs
    /// the materialize loop with the now-warm cache. Columns never
    /// touched in a stats-dependent mode never trigger a fetch.
    pub async fn all_columns_configs_materialized(
        &self,
        view_config: &ViewConfig,
        session: &Session,
    ) -> ColumnConfigMap {
        let mut configs = self.all_columns_configs();

        // Pass 1: identify columns whose schema demands an `include:
        // true` Number default we don't have stats for.
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

        // Block on the (typically tiny) warm set. Clone the metadata
        // and resolve the view ref *before* the .await — `metadata()`
        // returns a live `Ref<>` guard that must not cross an await
        // boundary.
        if !to_warm.is_empty() {
            let metadata = session.metadata().clone();
            let view = session.get_view();
            let futs = to_warm
                .iter()
                .map(|c| resolve_abs_max(session, &metadata, view.as_ref(), c.as_str()));
            join_all(futs).await;
        }

        // Pass 2: materialize. With stats now in cache, the schema
        // returns a real `default` instead of the placeholder `0`.
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
    /// (e.g. from a `restore()` call). Each incoming column entry is
    /// schema-stripped before insertion — values matching the
    /// schema-declared default are dropped so the bucket converges to
    /// the "empty ⇒ reads-default" invariant, mirroring
    /// [`Self::update_plugin_config`]. `ControlSpec::Number` fields
    /// declared with `include: true` survive the strip (their default
    /// is data-dependent, so a literal default value is preserved as
    /// the user's explicit choice). Column entries that become empty
    /// after stripping are removed from the bucket entirely.
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
                // Strip per-column before borrowing the bucket mutably:
                // the schema query takes an immutable borrow via
                // `self.metadata()`, which would alias-conflict with
                // `borrow_mut` below.
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
    ///
    /// The schema-strip is defense-in-depth: widget callbacks (e.g.
    /// `NumberFieldPrimitive`) already pre-strip default values, so
    /// for live edits this strip pass is a no-op. It closes the hole
    /// for programmatic callers that construct a
    /// `ColumnConfigFieldUpdate` directly without going through the
    /// widget (where `include: true` would otherwise be ignored).
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

        // Take the schema query before the mutable borrow — same
        // RefCell aliasing reason as in `update_columns_configs`.
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

    // ─── Plugin-level config (active plugin's bucket) ─────────────────

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
    /// Inlined here (rather than calling `queries::get_plugin_config_schema`)
    /// to keep `renderer` from back-importing the `queries` module.
    fn query_plugin_config_schema(
        &self,
        view_config: &ViewConfig,
    ) -> ApiResult<ColumnConfigSchema> {
        let plugin = self.get_active_plugin()?;
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);
        let raw = plugin._plugin_config_schema(&view_config_js)?;
        serde_wasm_bindgen::from_value(raw).map_err(|e| e.into())
    }

    /// Per-column counterpart of [`query_plugin_config_schema`]. Used by
    /// the columns-config write paths (strip-on-write) and the
    /// restore-prep snapshot (materialize-on-read).
    ///
    /// Reads the cached `ColumnStats` (cleared on `view_config_changed`)
    /// so plugins emit gradient defaults against the column's current
    /// `abs_max` instead of falling back to `0`.
    /// [`Self::all_columns_configs_materialized`] warms the cache on
    /// demand before materializing `include: true` Number fields, so
    /// the restore path always observes a real default; sync callers
    /// (column-config strip-on-write) may still see a missing stats
    /// pass-through and the plugin's `?? 0` fallback, but those writes
    /// re-strip on the next render cycle.
    fn query_column_config_schema(
        &self,
        view_config: &ViewConfig,
        session: &Session,
        column_name: &str,
        current_value: Option<&serde_json::Map<String, serde_json::Value>>,
    ) -> ApiResult<ColumnConfigSchema> {
        let plugin = self.get_active_plugin()?;
        let plugin_config = self.metadata();
        let names = &plugin_config.config_column_names;
        let group = view_config
            .columns
            .iter()
            .position(|maybe_s| maybe_s.as_deref() == Some(column_name))
            .and_then(|idx| names.get(idx))
            .map(|s| s.as_str());

        let Some(view_type) = session.metadata().get_column_view_type(column_name) else {
            return Ok(ColumnConfigSchema { fields: vec![] });
        };

        let current_js = JsValue::from_serde_ext(&current_value).unwrap_or(JsValue::NULL);
        let view_config_js = JsValue::from_serde_ext(view_config).unwrap_or(JsValue::NULL);

        // Pull the column's cached stats from the session. The StyleTab
        // pre-warms this via `fetch_column_abs_max` whenever the user
        // opens column settings; the cache is invalidated on every
        // `view_config_changed`, so freshness is bounded.
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
                    // Default-valued entries in a restore payload
                    // semantically reset the key — strip from the
                    // map AND clear any existing override in the
                    // bucket so the wholesale-restore path matches
                    // the live-edit path (where the widget emits an
                    // empty value to clear).
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
    /// to the active plugin's bucket. Clear-then-insert semantics
    /// mirror [`Self::update_columns_config_field`]. Entries in
    /// `update.value` whose value equals the schema default are
    /// stripped before applying so default picks reset the key
    /// rather than store the default literally.
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

    /// Whether the active plugin's render warning is currently armed
    /// (i.e. an oversized view will be capped). Becomes `false` once
    /// the user clicks "Render all points"; resets to `true` on the
    /// next plugin change.
    pub fn is_render_warning_enabled(&self) -> bool {
        self.0.render_warning.get()
    }

    /// Return all plugin instances, whether they are active or not.  Useful
    /// for configuring all or specific plugins at application init.
    pub fn get_all_plugins(&self) -> Vec<JsPerspectiveViewerPlugin> {
        self.0.borrow_mut().plugin_store.plugins().clone()
    }

    /// Return all plugin names, whether they are active or not.
    pub fn get_all_plugin_categories(&self) -> HashMap<String, Vec<String>> {
        self.0.borrow_mut().plugin_store.plugin_records().clone()
    }

    /// Cached `PluginStaticConfig`s for every registered plugin, in
    /// registration (priority) order. Mirrors `get_all_plugins()`
    /// element-for-element.
    pub fn get_all_plugin_configs(&self) -> Vec<Rc<PluginStaticConfig>> {
        self.0.borrow_mut().plugin_store.plugin_configs().clone()
    }

    /// Gets the currently active plugin.  Calling this method before a plugin
    /// has been selected will cause the default (first) plugin to be
    /// selected, and doing so when no plugins have been registered is an
    /// error.
    pub fn get_active_plugin(&self) -> ApiResult<JsPerspectiveViewerPlugin> {
        if self.0.borrow().plugins_idx.is_none() {
            let _ = self.apply_pending_plugin()?;
        }

        let idx = self.0.borrow().plugins_idx.unwrap_or(0);
        let result = self.0.borrow_mut().plugin_store.plugins().get(idx).cloned();
        Ok(result.ok_or("No Plugin")?)
    }

    /// Gets a specific `JsPerspectiveViewerPlugin` by name.
    ///
    /// # Arguments
    /// - `name` The plugin name to lookup.
    pub fn get_plugin(&self, name: &str) -> ApiResult<JsPerspectiveViewerPlugin> {
        let idx = self.find_plugin_idx(name);
        let idx = idx.ok_or_else(|| JsValue::from(format!("No Plugin `{name}`")))?;
        let result = self.0.borrow_mut().plugin_store.plugins().get(idx).cloned();
        Ok(result.unwrap())
    }

    pub fn is_plugin_activated(&self) -> ApiResult<bool> {
        Ok(self
            .get_active_plugin()?
            .unchecked_ref::<HtmlElement>()
            .is_connected())
    }

    pub async fn restyle_all(&self, view: &perspective_client::View) -> ApiResult<JsValue> {
        let plugin = self.get_active_plugin()?;
        let meta = self.metadata();
        plugin.restyle();
        let mut limits =
            get_row_and_col_limits(view, &meta, self.is_render_warning_enabled()).await?;
        limits.is_update = false;
        plugin
            .draw(view.clone().into(), limits.max_cols, limits.max_rows, false)
            .await?;

        Ok(JsValue::UNDEFINED)
    }

    pub fn set_throttle(&self, val: Option<f64>) {
        self.0.borrow_mut().timer.set_throttle(val);
    }

    pub fn set_selection(&self, window: Option<ViewWindow>) {
        if self.borrow().selection == window {
            return;
        }

        self.borrow_mut().selection = window.clone();
        self.selection_changed.emit(window);
    }

    pub fn get_selection(&self) -> Option<ViewWindow> {
        self.borrow().selection.clone()
    }

    pub fn disable_active_plugin_render_warning(&self) {
        self.0.render_warning.set(false);
    }

    pub fn get_next_plugin_metadata(
        &self,
        update: &PluginUpdate,
    ) -> Option<Rc<PluginStaticConfig>> {
        let default_plugin_name = PLUGIN_REGISTRY.default_plugin_name();
        let name = match update {
            PluginUpdate::Missing => return None,
            PluginUpdate::SetDefault => default_plugin_name.as_str(),
            PluginUpdate::Update(plugin) => plugin,
        };

        let idx = self.find_plugin_idx(name)?;
        let changed = !matches!(
            self.0.borrow().plugins_idx,
            Some(selected_idx) if selected_idx == idx
        );

        if changed {
            self.borrow_mut().pending_plugin = Some(idx);
            self.0
                .borrow_mut()
                .plugin_store
                .plugin_configs()
                .get(idx)
                .cloned()
        } else {
            None
        }
    }

    pub fn apply_pending_plugin(&self) -> ApiResult<bool> {
        let xxx = self.borrow_mut().pending_plugin.take();
        if let Some(idx) = xxx {
            let changed = !matches!(
                self.0.borrow().plugins_idx,
                Some(selected_idx) if selected_idx == idx
            );

            if changed {
                self.commit_plugin_idx(idx)?;
            }

            Ok(changed)
        } else {
            if self.0.borrow().plugins_idx.is_none() {
                self.set_plugin(Some(&PLUGIN_REGISTRY.default_plugin_name()))?;
            }

            Ok(false)
        }
    }

    fn set_plugin(&self, name: Option<&str>) -> ApiResult<bool> {
        self.borrow_mut().pending_plugin = None;
        let default_plugin_name = PLUGIN_REGISTRY.default_plugin_name();
        let name = name.unwrap_or(default_plugin_name.as_str());
        let idx = self
            .find_plugin_idx(name)
            .ok_or_else(|| JsValue::from(format!("Unknown plugin '{name}'")))?;

        let changed = !matches!(
            self.0.borrow().plugins_idx,
            Some(selected_idx) if selected_idx == idx
        );

        if changed {
            self.commit_plugin_idx(idx)?;
        }

        Ok(changed)
    }

    /// Shared tail of `apply_pending_plugin` / `set_plugin`: switch the
    /// active plugin to `idx`, swap in its cached `PluginStaticConfig`,
    /// reset the per-plugin render-warning flag, and fire
    /// `plugin_changed`.
    fn commit_plugin_idx(&self, idx: usize) -> ApiResult<()> {
        self.borrow_mut().plugins_idx = Some(idx);
        let config = self
            .0
            .borrow_mut()
            .plugin_store
            .plugin_configs()
            .get(idx)
            .cloned()
            .ok_or("No Plugin")?;

        self.borrow_mut().metadata = config.clone();
        self.0.render_warning.set(true);
        let plugin: JsPerspectiveViewerPlugin = self.get_active_plugin()?;

        // Push the newly-activated plugin's stored bucket through
        // `plugin.restore` so the swap immediately reflects any
        // viewer-owned per-column and plugin-level config.
        let bucket = self
            .borrow()
            .plugin_states
            .get(&config.name)
            .cloned()
            .unwrap_or_default();
        let token = JsValue::from_serde_ext(&bucket.plugin).unwrap_or(JsValue::NULL);
        if let Err(e) = plugin.restore(&token, Some(&bucket.columns)) {
            tracing::warn!("plugin.restore on swap failed: {:?}", e);
        }

        self.plugin_changed.emit(plugin);
        Ok(())
    }

    pub async fn with_lock<T>(self, task: impl Future<Output = ApiResult<T>>) -> ApiResult<T> {
        let draw_mutex = self.draw_lock();
        draw_mutex.lock(task).await
    }

    pub async fn resize(&self) -> ApiResult<()> {
        let draw_mutex = self.draw_lock();
        let timer = self.render_timer();
        draw_mutex
            .debounce(async {
                set_timeout(timer.get_throttle()).await?;
                let jsplugin = self.get_active_plugin()?;
                jsplugin.resize().await?;
                Ok(())
            })
            .await
    }

    pub async fn resize_with_dimensions(&self, width: f64, height: f64) -> ApiResult<()> {
        let draw_mutex = self.draw_lock();
        let timer = self.render_timer();
        draw_mutex
            .debounce(async {
                set_timeout(timer.get_throttle()).await?;
                let plugin = self.get_active_plugin()?;
                let main_panel: &web_sys::HtmlElement = plugin.unchecked_ref();
                let rect = main_panel.get_bounding_client_rect();
                if (height - rect.height()).abs() > 0.5 || (width - rect.width()).abs() > 0.5 {
                    let new_width = format!("{}px", width);
                    let new_height = format!("{}px", height);
                    main_panel.style().set_property("width", &new_width)?;
                    main_panel.style().set_property("height", &new_height)?;
                    let result = plugin.resize().await;
                    main_panel.style().set_property("width", "")?;
                    main_panel.style().set_property("height", "")?;
                    result?;
                }

                Ok(())
            })
            .await
    }

    /// This will take a future which _should_ create a new view and then will
    /// draw it. As the `session` closure is asynchronous, it can be cancelled
    /// by returning `None`.
    pub async fn draw(
        &self,
        session: impl Future<Output = ApiResult<Option<View>>>,
    ) -> ApiResult<()> {
        self.draw_plugin(session, false).await
    }

    /// This will update an already existing view
    pub async fn update(&self, session: Option<View>) -> ApiResult<()> {
        self.draw_plugin(async { Ok(session) }, true).await
    }

    async fn draw_plugin(
        &self,
        session: impl Future<Output = ApiResult<Option<View>>>,
        is_update: bool,
    ) -> ApiResult<()> {
        let timer = self.render_timer();
        let task = async move {
            if is_update {
                set_timeout(timer.get_throttle()).await?;
            }

            if let Some(view) = session.await? {
                timer.capture_time(self.draw_view(&view, is_update)).await
            } else {
                tracing::debug!("Render skipped, no `View` attached");
                Ok(())
            }
        };

        let draw_mutex = self.draw_lock();
        if is_update {
            draw_mutex.debounce(task).await
        } else {
            draw_mutex.lock(task).await
        }
    }

    async fn draw_view(&self, view: &perspective_client::View, is_update: bool) -> ApiResult<()> {
        let plugin = self.get_active_plugin()?;
        let meta = self.metadata();
        let mut limits =
            get_row_and_col_limits(view, &meta, self.is_render_warning_enabled()).await?;
        limits.is_update = is_update;
        if let Some(cb) = self.0.on_render_limits_changed.borrow().as_ref() {
            cb.emit(limits);
        }

        let viewer_elem = &self.0.borrow().viewer_elem.clone();
        let result = if is_update {
            let task = plugin.update(view.clone().into(), limits.max_cols, limits.max_rows, false);
            activate_plugin(viewer_elem, &plugin, task).await
        } else {
            let task = plugin.draw(view.clone().into(), limits.max_cols, limits.max_rows, false);
            activate_plugin(viewer_elem, &plugin, task).await
        };

        if let Err(error) = result.ignore_view_delete() {
            tracing::warn!("{}", error);
        }

        remove_inactive_plugin(
            viewer_elem,
            &plugin,
            self.plugin_data.borrow_mut().plugin_store.plugins(),
        )
    }

    /// Decide whether to draw plugin or self first based on whether the panel
    /// is opening or closing, then draw with a timeout.  If the timeout
    /// triggers, draw self and resolve `on_toggle` but still await the
    /// completion of the draw task.
    pub async fn presize(
        &self,
        open: bool,
        panel_task: impl Future<Output = ApiResult<()>>,
    ) -> ApiResult<JsValue> {
        let render_task = self.resize_with_timeout(open);
        let result = if open {
            panel_task.await?;
            render_task.await
        } else {
            let result = render_task.await;
            panel_task.await?;
            result
        };

        match result {
            Ok(x) => x,
            Err(cont) => {
                tracing::warn!("Presize took longer than {}ms", PRESIZE_TIMEOUT);
                cont.await.unwrap()
            },
        }
    }

    /// Lock on `resize()` task, in parallel with a timeout.  In the return
    /// type, `Result::Err` contains the continuation task, which must be
    /// awaited lest the plugin draw itself never trigger.
    async fn resize_with_timeout(&self, open: bool) -> Result<TaskResult, TimeoutTask<'_>> {
        let task = async move {
            if open {
                self.get_active_plugin()?.resize().await
            } else {
                self.resize_with_explicit_dimensions().await
            }
        };

        let draw_lock = self.draw_lock();
        let tasks: [TimeoutTask<'_>; 2] = [
            Box::pin(async move { Some(draw_lock.lock(task).await) }),
            Box::pin(async {
                set_timeout(PRESIZE_TIMEOUT).await.unwrap();
                None
            }),
        ];

        let (x, _, y) = select_all(tasks.into_iter()).await;
        x.ok_or_else(|| y.into_iter().next().unwrap())
    }

    /// Resize the `<div>` offscreen, then resize the plugin
    async fn resize_with_explicit_dimensions(&self) -> TaskResult {
        let plugin = self.get_active_plugin()?;
        let main_panel: &web_sys::HtmlElement = plugin.unchecked_ref();
        let new_width = format!("{}px", &self.0.borrow().viewer_elem.client_width());
        let new_height = format!("{}px", &self.0.borrow().viewer_elem.client_height());
        main_panel.style().set_property("width", &new_width)?;
        main_panel.style().set_property("height", &new_height)?;
        let result = plugin.resize().await;
        main_panel.style().set_property("width", "")?;
        main_panel.style().set_property("height", "")?;
        result
    }

    fn draw_lock(&self) -> DebounceMutex {
        self.draw_lock.clone()
    }

    pub fn render_timer(&self) -> MovingWindowRenderTimer {
        self.0.borrow().timer.clone()
    }

    fn find_plugin_idx(&self, name: &str) -> Option<usize> {
        let short_name = make_short_name(name);
        let mut borrowed = self.0.borrow_mut();
        let configs = borrowed.plugin_store.plugin_configs();
        // Prefer an exact (normalised) match so e.g. `"Y Line"` doesn't
        // substring-resolve to `"X/Y Line"` just because it was registered
        // first. Falls back to `contains` so short/abbreviated names
        // (`restore({ plugin: "scat" })` → `"scatter"`) still work.
        let short_names: Vec<String> = configs.iter().map(|c| make_short_name(&c.name)).collect();
        if let Some(i) = short_names.iter().position(|n| n == &short_name) {
            return Some(i);
        }

        short_names
            .iter()
            .position(|n: &String| n.contains(&short_name))
    }
}

fn make_short_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|x| x.is_alphabetic())
        .collect()
}

impl Renderer {
    /// Snapshot the current renderer state as a [`RendererProps`] value
    /// suitable for passing as a Yew prop.  Called by the root component
    /// whenever a renderer-related PubSub event fires.
    pub fn to_props(&self, render_limits: Option<RenderLimits>) -> RendererProps {
        // Guard: don't touch the PluginStore if no plugin has been explicitly
        // selected yet.  Calling `get_active_plugin()` or `get_all_plugins()`
        // triggers `PluginStore::init_lazy()`, which snapshots the
        // PLUGIN_REGISTRY.  If this happens during component `create()` —
        // before JavaScript has called `registerPlugin()` — the cache will
        // only contain the default Debug plugin and custom plugins registered
        // later will never be found.
        let has_plugin = self.0.borrow().plugins_idx.is_some();
        if has_plugin {
            let config = self.metadata();
            let plugin_name = Some(config.name.clone());
            let is_chart = config.name.as_str() != "Datagrid";
            let available_plugins = self
                .get_all_plugin_configs()
                .into_iter()
                .map(|c| c.name.clone())
                .collect::<Vec<_>>()
                .into();
            let plugin_config = PtrEqRc::new(self.get_plugin_config());

            RendererProps {
                plugin_name,
                config,
                render_limits,
                available_plugins,
                is_chart,
                plugin_config,
            }
        } else {
            RendererProps {
                plugin_name: None,
                config: Rc::new(PluginStaticConfig::default()),
                render_limits,
                available_plugins: PtrEqRc::new(vec![]),
                is_chart: false,
                plugin_config: PtrEqRc::default(),
            }
        }
    }
}

/// Drop entries from `map` whose value matches the schema-declared
/// default for that key. Used by both the plugin-config and
/// columns-config write paths to converge buckets to the
/// "empty ⇒ reads-default" invariant. For `ControlSpec::Number`
/// entries marked `include: Some(true)`,
/// [`matches_declared_default`] short-circuits so the value survives
/// (used when the declared default is data-dependent and unreliable —
/// e.g. Datagrid's `fg_gradient`, whose default is the column's
/// `abs_max`).
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

/// Does `value` for `key` match the `default` declared by `spec`?
/// Composite variants (`NumberSeriesStyle`, `DatetimeFormat`, etc.) own
/// nested defaults that don't have a single comparable scalar — the
/// widget is responsible for emitting empty values when the user
/// resets composite controls, so this helper returns `false` for them.
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
