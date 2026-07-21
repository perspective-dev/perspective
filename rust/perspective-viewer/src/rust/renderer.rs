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
use std::rc::Rc;

use futures::future::join_all;
use perspective_client::config::ViewConfig;
use perspective_client::{View, ViewWindow};
use perspective_js::utils::{ApiFuture, ApiResult, JsValueSerdeExt, ResultTApiErrorExt};
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
use crate::session::{FreshView, Session};
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

/// Everything a plugin may read back during its render, all belonging to
/// one snapshot (invariant I5). Built once per bound `View` by the render
/// pipeline and CACHED on the `Renderer`; pinning it for a run is an `Rc`
/// clone (cheap enough for resize-tick-rate runs). While pinned, the
/// per-panel element getters (`getViewConfigPanel`, `getTablePanel`,
/// `getClientPanel`, `getEditPortPanel`) answer from it — the plugin ABI is
/// inside the snapshot boundary.
pub struct RenderContext {
    pub view_config: Rc<perspective_client::config::ViewConfig>,
    pub view: perspective_client::View,
    pub table: perspective_client::Table,
    pub client: perspective_client::Client,
    pub edit_port: Option<f64>,
    pub theme: Option<String>,
}

/// RAII pin for a [`RenderContext`] — cleared on drop, INCLUDING error
/// exits, so a failed run can't leak a stale context.
pub struct ContextPin(Renderer);

impl Drop for ContextPin {
    fn drop(&mut self) {
        self.0.0.active_context.borrow_mut().take();
    }
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

    /// Count of in-flight [`Renderer::resize_with_dimensions`] /
    /// [`Renderer::presize_with_box`] presize calls.
    presize_pending: Cell<u32>,

    /// Fires after every draw/update with the computed render limits.
    pub on_render_limits_changed: RefCell<Option<Callback<RenderLimits>>>,

    /// The layout slot name (panel id) under which this renderer mounts its
    /// plugin in the viewer's light DOM, so multiple panels' plugins can
    /// coexist there.
    slot_name: RefCell<Option<String>>,

    /// This panel's selected theme name (per-panel theming), or `None` to
    /// inherit the element-level (active) theme.
    theme: RefCell<Option<String>>,

    /// The registry default theme name (first registered), cached here so
    /// LOCKED draw paths can resolve this panel's EFFECTIVE theme
    /// synchronously (`Presentation::get_default_theme_name` is async — it
    /// awaits theme discovery). Seeded by every content-load path before its
    /// first locked draw (`restore_and_render`, `load()`, the
    /// resize-observer's deferred first render) and kept fresh by the root's
    /// `UpdatePresentation` default-theme fan-out and `resetThemes`.
    default_theme: RefCell<Option<String>>,

    /// Whether the active plugin has completed a draw. An EXPLICIT flag —
    /// not inferred from DOM connectedness — because plugin elements may be
    /// mounted eagerly (at panel creation / draw start, before the view
    /// query resolves), so "in the DOM" no longer implies "has rendered".
    /// Set by a successful `draw_view`; cleared on plugin swap
    /// (`commit_plugin_idx`), `dispose` and `delete`.
    has_drawn: Cell<bool>,

    /// The effective theme stamped at the active plugin's last `--psp-*`
    /// CSS CAPTURE — its first paint ([`Renderer::draw_view`]) or last
    /// [`Renderer::restyle_all`]. `None` = no capture has happened. The
    /// state behind [`Renderer::needs_restyle`]: restyle necessity is a
    /// comparison against what the plugin actually captured, never
    /// inferred from which call site mutated a theme record (the
    /// raycasting boot double render — see
    /// `PLUGIN_DRAW_INVARIANT_PLAN.md`, captured-theme revision). Same
    /// lifecycle as [`Self::has_drawn`]: cleared on plugin swap,
    /// `dispose` and `delete`; written only inside locked dispatches.
    captured_theme: RefCell<Option<Option<String>>>,

    /// The [`RenderContext`] of the currently-bound `View` (built at bind
    /// time by the pipeline). Cleared on `dispose`/`delete`.
    cached_context: RefCell<Option<Rc<RenderContext>>>,

    /// The [`RenderContext`] pinned by the run currently holding the draw
    /// lock, if any (invariant I5). Managed by [`ContextPin`].
    active_context: RefCell<Option<Rc<RenderContext>>>,

    /// Whether this renderer's panel is the workspace's ACTIVE panel. Pure
    /// DATA, written synchronously by `Workspace::set_active`/`insert_panel`;
    /// the `active` CSS class it drives is applied ONLY inside locked plugin
    /// dispatches ([`Renderer::stamp_active`], "stamp before draw" — like the
    /// theme), so activation-dependent chrome and the DOM it styles always
    /// land in one paint commit.
    is_active_panel: Cell<bool>,

    /// Whether this renderer's panel is the workspace's ONLY panel. Pure DATA
    /// like [`Self::is_active_panel`], written synchronously by the
    /// `Workspace` panel-count mutation sites (`new`/`insert_panel`/
    /// `remove_panel`); the `single`/`multi` CSS classes it drives are
    /// applied ONLY inside locked plugin dispatches
    /// ([`Renderer::stamp_active`]), for the same one-paint-commit reason.
    is_solo_panel: Cell<bool>,
}

/// Mutable state
pub struct RendererMutData {
    viewer_elem: HtmlElement,
    metadata: Rc<PluginStaticConfig>,
    plugin_store: PluginStore,
    plugins_idx: Option<usize>,
    timer: MovingWindowRenderTimer,
    selection: Option<ViewWindow>,
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
            presize_pending: Cell::new(0),
            on_render_limits_changed: Default::default(),
            slot_name: Default::default(),
            theme: Default::default(),
            default_theme: Default::default(),
            has_drawn: Cell::new(false),
            captured_theme: Default::default(),
            cached_context: Default::default(),
            active_context: Default::default(),
            is_active_panel: Cell::new(false),
            is_solo_panel: Cell::new(true),
        }))
    }

    /// Set the layout slot name (panel id) under which this renderer mounts its
    /// plugin in the viewer's light DOM, routed through the matching
    /// `<regular-layout>` forwarding slot.
    pub fn set_slot_name(&self, name: &str) {
        *self.0.slot_name.borrow_mut() = Some(name.to_owned());
    }

    /// The layout slot name (panel id) for this renderer's plugin, if assigned.
    pub fn slot_name(&self) -> Option<String> {
        self.0.slot_name.borrow().clone()
    }

    /// Set this panel's theme name (`None` = inherit the element-level theme).
    pub fn set_theme(&self, name: Option<String>) {
        *self.0.theme.borrow_mut() = name;
    }

    /// This panel's selected theme name, if any (per-panel theming).
    pub fn theme(&self) -> Option<String> {
        self.0.theme.borrow().clone()
    }

    /// Set the cached registry default theme name (see the field docs on
    /// [`RendererData`]).
    pub fn set_default_theme(&self, name: Option<String>) {
        *self.0.default_theme.borrow_mut() = name;
    }

    /// The cached registry default theme name.
    pub fn default_theme(&self) -> Option<String> {
        self.0.default_theme.borrow().clone()
    }

    /// This panel's EFFECTIVE theme: its own ([`Self::theme`]), else the
    /// cached registry default ([`Self::default_theme`]) — the value
    /// [`Self::stamp_theme`] stamps.
    pub fn effective_theme(&self) -> Option<String> {
        self.theme().or_else(|| self.default_theme())
    }

    /// Whether the active plugin's captured `--psp-*` CSS is STALE — the
    /// effective theme differs from the one stamped at the plugin's last
    /// CSS capture (first paint / last restyle). The state-keyed gate for
    /// every theme-driven `restyle_all` (the `has_drawn` analog for
    /// `restyle` — `PLUGIN_DRAW_INVARIANT_PLAN.md`, captured-theme
    /// revision): a caller that just mutated a theme RECORD may not need a
    /// restyle at all if the plugin's capture already reflects the new
    /// value (e.g. the same restore also performed the first paint,
    /// post-stamp). `false` when no capture exists yet — the owed first
    /// paint captures fresh by construction ("stamp before draw").
    pub fn needs_restyle(&self) -> bool {
        match &*self.0.captured_theme.borrow() {
            Some(captured) => *captured != self.effective_theme(),
            None => false,
        }
    }

    /// Dispose a single panel's renderer: delete its active plugin and remove
    /// this panel's element(s) from the viewer's light DOM, scoped by
    /// `slot_name` so sibling panels are untouched (unlike
    /// [`Self::delete`], which clears the entire light DOM). Removes the
    /// plugin (`slot=<id>`) and any panel-scoped aux element it mounted
    /// (e.g. the datagrid toolbar, `slot=statusbar-extra-<id>`).
    ///
    /// The teardown is DEFERRED through this renderer's draw lock: spawned
    /// draws are uncancellable, so a synchronous `plugin.delete()` here could
    /// land mid-`plugin.draw()`, which the serialized-call contract forbids
    /// (see [`crate::js::plugin`]). Deferral is invisible — the caller
    /// (`eject_panel`) has already removed the panel from the `Workspace`, so
    /// the same commit unmounts its frame and the plugin element sits
    /// unslotted (unrendered) until teardown lands; panel ids are never
    /// reused, so it can't collide with a replacement panel's slot. Draws
    /// still queued behind the lock no-op via the synchronous session reset
    /// (`get_view()` → `None`).
    pub fn dispose(&self) -> ApiFuture<()> {
        self.0.has_drawn.set(false);
        self.0.captured_theme.borrow_mut().take();
        self.0.cached_context.borrow_mut().take();
        let this = self.clone();
        ApiFuture::new(async move {
            let renderer = this.clone();
            this.with_lock(async move {
                if let Some(plugin) = renderer.active_plugin() {
                    plugin.delete();
                }

                let Some(slot) = renderer.slot_name() else {
                    return Ok(());
                };

                let viewer = renderer.plugin_data.borrow().viewer_elem.clone();
                let slots = [slot.clone(), format!("statusbar-extra-{slot}")];
                let children = viewer.children();
                let mut idx = children.length();
                while idx > 0 {
                    idx -= 1;
                    if let Some(el) = children.item(idx)
                        && el.get_attribute("slot").is_some_and(|s| slots.contains(&s))
                    {
                        let _ = viewer.remove_child(&el);
                    }
                }

                Ok(())
            })
            .await
        })
    }

    pub fn delete(&self) -> ApiResult<()> {
        self.0.has_drawn.set(false);
        self.0.captured_theme.borrow_mut().take();
        self.0.cached_context.borrow_mut().take();
        if let Some(plugin) = self.active_plugin() {
            plugin.delete();
        }
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
        let plugin = self.ensure_plugin_selected()?;
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
        let plugin = self.ensure_plugin_selected()?;
        let plugin_config = self.metadata();
        let names = &plugin_config.config_column_names;
        let group = view_config
            .columns
            .iter()
            .position(|maybe_s| maybe_s.as_deref() == Some(column_name))
            .and_then(|idx| names.get(idx))
            .map(|s| s.as_str());

        // If the view schema itself hasn't been built yet (e.g. restore
        // landed before `create_view` populated `view_schema`), refuse
        // to answer rather than returning an empty schema. The strip
        // pass in `update_columns_configs` treats `Err` as "leave the
        // incoming cfg untouched"; an empty schema, by contrast, would
        // cause `cfg.retain(|k, _| active.contains(k))` to drop every
        // key and zero out user-supplied column config.
        if !session.metadata().has_view_schema() {
            return Err(JsValue::from("view_schema not initialized").into());
        }
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

    /// The currently-selected plugin, or `None` if none has been selected yet.
    ///
    /// This is a PURE QUERY (command-query separation): unlike
    /// [`Self::ensure_plugin_selected`] it never selects a default plugin and
    /// never triggers the lazy `PluginStore` snapshot before a plugin exists.
    /// Pre-draw / render-path code MUST use this and handle `None` — selecting
    /// a plugin on the first render, before the real plugins register,
    /// permanently pins the per-renderer store to the built-in `Debug`
    /// (init-order race, surfaces on Safari).
    pub fn active_plugin(&self) -> Option<JsPerspectiveViewerPlugin> {
        // Bail on `plugins_idx` BEFORE touching `plugin_store`, so an unselected
        // renderer never snapshots the registry.
        let idx = self.0.borrow().plugins_idx?;
        self.0.borrow_mut().plugin_store.plugins().get(idx).cloned()
    }

    /// Ensure a plugin is selected — the registry default when nothing has
    /// ever been selected — and return it. The COMMAND half of
    /// [`Self::active_plugin`]: this is the only path that selects a default and
    /// snapshots the store, so it must run only when actually drawing (by which
    /// point real plugins have registered). Errors if no plugins are
    /// registered.
    pub fn ensure_plugin_selected(&self) -> ApiResult<JsPerspectiveViewerPlugin> {
        self.commit_plugin(None)?;
        Ok(self.active_plugin().ok_or("No Plugin")?)
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

    /// Whether the active plugin has completed a draw. A query, not a
    /// command — and an explicit flag rather than the old `is_connected()`
    /// inference, which eager plugin mounting (an element in the DOM before
    /// its first draw) would falsify.
    pub fn is_plugin_activated(&self) -> ApiResult<bool> {
        Ok(self.0.has_drawn.get())
    }

    /// Mount the selected plugin element into the viewer's light DOM without
    /// drawing it (see [`activate::mount_plugin`] — idempotent). Pure query:
    /// a renderer with no selection is a no-op, deferring to the draw path's
    /// `ensure_plugin_selected`. Used to mount eagerly — at panel creation
    /// and at locked-draw start — so a slow first view query never leaves an
    /// empty panel frame. NOTE eager mounting is exactly why
    /// [`Self::is_plugin_activated`] must be an explicit has-drawn flag, not
    /// DOM-connectedness.
    pub fn mount_active_plugin(&self) -> ApiResult<()> {
        if let Some(plugin) = self.active_plugin() {
            let viewer_elem = self.0.borrow().viewer_elem.clone();
            mount_plugin(&viewer_elem, &plugin, self.slot_name().as_deref())?;
        }

        Ok(())
    }

    /// Record whether this panel is the active panel (data only — see the
    /// field doc; the CSS class lands at the next locked plugin dispatch).
    pub fn set_active_flag(&self, is_active: bool) {
        self.0.is_active_panel.set(is_active);
    }

    /// Record whether this panel is the workspace's only panel (data only —
    /// see the field doc; the CSS class lands at the next locked plugin
    /// dispatch).
    pub fn set_solo_flag(&self, is_solo: bool) {
        self.0.is_solo_panel.set(is_solo);
    }

    /// Toggle the `active` and panel-count (`single`/`multi`) classes on
    /// `plugin` from the recorded flags — called ONLY from locked
    /// plugin-dispatch sites, immediately before the dispatch. The classes
    /// are pure CSS hooks (`:host(.active)` chrome, e.g. the datagrid's edit
    /// column-header labels); plugins read activation state through
    /// `getActivePanel()`, never these classes. Stamping at
    /// dispatch bounds any class/DOM disagreement to the one locked draw
    /// that reconciles them — never applied from an async render pass
    /// (that left the split unbounded — the activation "wrong-row EDIT"
    /// artifact).
    fn stamp_active(&self, plugin: &JsPerspectiveViewerPlugin) {
        let el = plugin.unchecked_ref::<HtmlElement>();
        let _ = el
            .class_list()
            .toggle_with_force("active", self.0.is_active_panel.get());

        // `single`/`multi` reflect whether the host viewer holds one plugin
        // child or more than one — the same pure-CSS-hook contract as
        // `active`.
        let is_solo = self.0.is_solo_panel.get();
        let _ = el.class_list().toggle_with_force("single", is_solo);
        let _ = el.class_list().toggle_with_force("multi", !is_solo);
    }

    /// Stamp this panel's effective `theme` attribute — its own
    /// ([`Self::theme`]), else the cached registry default
    /// ([`Self::default_theme`]) — onto the active plugin element. The
    /// plugin reads its `--psp-*` CSS at
    /// `restyle()`/first-`draw()` time, driven by this attribute (the
    /// `perspective-viewer [theme="X"]` document rules), so it must be
    /// stamped BEFORE any plugin style read — the "stamp before restyle"
    /// invariant. A pure query — no-op when no plugin has been selected yet.
    pub fn stamp_theme(&self, plugin: Option<&JsPerspectiveViewerPlugin>) {
        let active_plugin = self.active_plugin();
        if let Some(plugin) = plugin.or(active_plugin.as_ref()) {
            let theme_elem = plugin.unchecked_ref::<HtmlElement>();
            match self.effective_theme() {
                // Same-value writes are skipped: this now runs on EVERY
                // locked dispatch (including streaming `update`s), and an
                // unconditional `setAttribute` would churn attribute-selector
                // invalidation per frame.
                Some(theme)
                    if theme_elem.get_attribute("theme").as_deref() != Some(theme.as_str()) =>
                {
                    let _ = theme_elem.set_attribute("theme", &theme);
                },
                Some(_) => {},
                None => {
                    let _ = theme_elem.remove_attribute("theme");
                },
            }
        }
    }

    /// Restyle the active plugin and re-draw it from the currently-bound
    /// `View`, resolved INSIDE the locked section from the cached
    /// [`RenderContext`] — NEVER from a handle captured at call time, which
    /// would race a concurrent rebuild (e.g. a plugin switch's column-default
    /// commit) and restyle a stale, already-deleted `View` (the same rule as
    /// [`Self::update_lazy`]; the cache is only ever replaced under this same
    /// lock). A no-op when nothing is bound (never drawn, or disposed).
    ///
    /// The whole sequence (theme stamp, `restyle()`, `draw()`) runs under
    /// this renderer's draw lock so it can never interleave with an in-flight
    /// `draw`/`update`/`render` on the same plugin element (see
    /// [`crate::js::plugin`] for the serialized-call contract). Full `lock`
    /// (not `debounce`) semantics on purpose: a superseding data draw does
    /// not re-read CSS, so a skipped restyle would strand stale style state.
    /// No caller may already hold the lock (today: `restyleElement`,
    /// `resetThemes`, the theme-picker task, `restorePanel`'s own-theme
    /// tail, and the root's default-theme fan-out).
    pub async fn restyle_all(&self) -> ApiResult<JsValue> {
        self.render_task(|guard| async move {
            let Some(ctx) = self.cached_context() else {
                return Ok(JsValue::UNDEFINED);
            };

            // Pin (I5): plugin read-backs during this restyle's draw answer
            // from the bound view's own state bundle.
            let _pin = self.pin_context(&guard, ctx.clone());
            let plugin = self.ensure_plugin_selected()?;
            let meta = self.metadata();
            let stamped_theme = self.effective_theme();
            self.stamp_theme(Some(&plugin));
            self.stamp_active(&plugin);
            plugin.restyle();
            // The CSS re-read just happened (sync) — record the capture
            // even if the repaint below fails.
            *self.0.captured_theme.borrow_mut() = Some(stamped_theme);
            let mut limits =
                get_row_and_col_limits(&ctx.view, &meta, self.is_render_warning_enabled()).await?;
            limits.is_update = true;
            // `update`, NOT `draw`: the `View` is unchanged — only the CSS
            // its render reads did (`plugin.draw` ⇔ new `View`, see
            // `PLUGIN_DRAW_INVARIANT_PLAN.md`).
            plugin
                .update(
                    ctx.view.clone().into(),
                    limits.max_cols,
                    limits.max_rows,
                    false,
                )
                .await?;

            Ok(JsValue::UNDEFINED)
        })
        .await
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

    /// Resolve a [`PluginUpdate`] against the current selection. Returns the
    /// target plugin's index + static config when the update names a plugin
    /// (or the registry default, for `SetDefault`) that differs from the
    /// current selection; `None` when the update is `Missing`, names an
    /// unknown plugin, or resolves to the already-active one.
    ///
    /// PURE query — nothing is staged on the `Renderer`. Thread the returned
    /// index *into* a locked draw task and commit it there with
    /// [`Self::commit_plugin`]: plugin-swap intent must never exist outside a
    /// running draw transaction, or an unrelated draw that wins the lock first
    /// (e.g. a `table_updated` redraw during a `restore()`) could observe or
    /// commit a half-applied swap.
    pub fn resolve_plugin_update(
        &self,
        update: &PluginUpdate,
    ) -> Option<(usize, Rc<PluginStaticConfig>)> {
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
            let config = self
                .0
                .borrow_mut()
                .plugin_store
                .plugin_configs()
                .get(idx)
                .cloned()?;
            Some((idx, config))
        } else {
            None
        }
    }

    /// Commit a plugin selection previously resolved by
    /// [`Self::resolve_plugin_update`]. COMMAND — call only from inside a
    /// locked draw task, so the swap lands atomically with the view rebuild
    /// and draw it belongs to. `None` ensures *some* plugin is selected (the
    /// registry default) without changing an existing selection. Returns
    /// whether the active plugin changed (`None`'s default-selection case
    /// reports `false`, preserving first-selection semantics for the
    /// swap-restore pass in the draw tasks).
    pub fn commit_plugin(&self, idx: Option<usize>) -> ApiResult<bool> {
        let idx = match idx {
            Some(idx) => idx,
            None => {
                if self.0.borrow().plugins_idx.is_none() {
                    let name = PLUGIN_REGISTRY.default_plugin_name();
                    let idx = self
                        .find_plugin_idx(&name)
                        .ok_or_else(|| JsValue::from(format!("Unknown plugin '{name}'")))?;

                    self.commit_plugin_idx(idx)?;
                }

                return Ok(false);
            },
        };

        let changed = !matches!(
            self.0.borrow().plugins_idx,
            Some(selected_idx) if selected_idx == idx
        );

        if changed {
            self.commit_plugin_idx(idx)?;
        }

        Ok(changed)
    }

    /// Shared tail of [`Self::commit_plugin`]: switch the
    /// active plugin to `idx`, swap in its cached `PluginStaticConfig`,
    /// reset the per-plugin render-warning flag, and fire
    /// `plugin_changed`.
    fn commit_plugin_idx(&self, idx: usize) -> ApiResult<()> {
        // The newly-selected plugin element has not drawn (a swap keeps the
        // OLD plugin mounted until the new one's draw lands) — and has
        // captured no CSS.
        self.0.has_drawn.set(false);
        self.0.captured_theme.borrow_mut().take();
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
        // `commit_plugin_idx` is called *by* the selection path, so it must use
        // the pure query (never `ensure_plugin_selected`, which would recurse
        // through `commit_plugin`). `plugins_idx` was just set above.
        let plugin: JsPerspectiveViewerPlugin = self.active_plugin().ok_or("No Plugin")?;

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

    /// The [`RenderContext`] pinned by the run currently holding this
    /// renderer's draw lock, if any. The per-panel element getters answer
    /// from this when present (invariant I5).
    pub fn render_context(&self) -> Option<Rc<RenderContext>> {
        self.0.active_context.borrow().clone()
    }

    /// The cached [`RenderContext`] of the currently-bound `View` (set by
    /// the pipeline at bind time).
    pub fn cached_context(&self) -> Option<Rc<RenderContext>> {
        self.0.cached_context.borrow().clone()
    }

    /// Cache `ctx` as the bound view's context (pipeline, at bind time).
    pub fn set_cached_context(&self, ctx: Rc<RenderContext>) {
        *self.0.cached_context.borrow_mut() = Some(ctx);
    }

    /// Pin `ctx` as the active [`RenderContext`] for the duration of the
    /// returned RAII guard. Requires the lock witness — a context can only
    /// be pinned by a locked run.
    pub fn pin_context(&self, _guard: &RenderGuard, ctx: Rc<RenderContext>) -> ContextPin {
        *self.0.active_context.borrow_mut() = Some(ctx);
        ContextPin(self.clone())
    }

    /// `true` while a run is executing on this renderer's draw lock. Used
    /// by lock-acquiring public API methods for a debug-build warning (a
    /// plugin calling one from its render deadlocks — see the
    /// render-callable contract on [`crate::js::plugin`]).
    pub fn is_locked(&self) -> bool {
        self.draw_lock.is_held()
    }

    pub async fn resize(&self) -> ApiResult<()> {
        let draw_mutex = self.draw_lock();
        let timer = self.render_timer();
        draw_mutex
            .debounce_with(|_guard| async move {
                set_timeout(timer.get_throttle()).await?;
                // Pure query: nothing drawn yet ⇒ nothing to resize (don't force
                // selection just to service a resize).
                let Some(jsplugin) = self.active_plugin() else {
                    return Ok(());
                };
                self.stamp_active(&jsplugin);
                jsplugin.resize().await?;
                Ok(())
            })
            .await
    }

    pub async fn resize_with_dimensions(&self, width: f64, height: f64) -> ApiResult<()> {
        // Signal in-flight presize for the whole call (including time spent
        // waiting on the draw lock) so `table_updated` update-redraws yield to
        // it (see `presize_pending`). Callers must not drop this future
        // mid-await (all await it to completion) or the counter would stick.
        self.0.presize_pending.set(self.0.presize_pending.get() + 1);
        let result = self.resize_with_dimensions_inner(width, height).await;
        self.0.presize_pending.set(self.0.presize_pending.get() - 1);
        result
    }

    async fn resize_with_dimensions_inner(&self, width: f64, height: f64) -> ApiResult<()> {
        let draw_mutex = self.draw_lock();
        draw_mutex
            .debounce_with(|_guard| async move {
                let Some(plugin) = self.active_plugin() else {
                    return Ok(());
                };

                self.stamp_active(&plugin);
                let main_panel: &web_sys::HtmlElement = plugin.unchecked_ref();
                let rect = main_panel.get_bounding_client_rect();
                let changed =
                    (height - rect.height()).abs() > 0.5 || (width - rect.width()).abs() > 0.5;
                if changed {
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

    /// Pre-size AND pre-position the plugin to its target layout box, so it
    /// paints at the exact screen rect it will occupy after the pending layout
    /// commit. `(dx, dy)` is the target grid-track origin minus the current
    /// one, applied as a `transform: translate` (the plugin's offset within
    /// its track is constant across a layout transition, so the track delta IS
    /// the plugin delta).
    pub async fn presize_with_box(
        &self,
        dx: f64,
        dy: f64,
        width: f64,
        height: f64,
    ) -> ApiResult<()> {
        self.0.presize_pending.set(self.0.presize_pending.get() + 1);
        let result = self.presize_with_box_inner(dx, dy, width, height).await;
        self.0.presize_pending.set(self.0.presize_pending.get() - 1);
        result
    }

    async fn presize_with_box_inner(
        &self,
        dx: f64,
        dy: f64,
        width: f64,
        height: f64,
    ) -> ApiResult<()> {
        let draw_mutex = self.draw_lock();
        draw_mutex
            .debounce_with(|_guard| async move {
                let Some(plugin) = self.active_plugin() else {
                    return Ok(());
                };

                self.stamp_active(&plugin);
                self.clear_presize()?;
                let main_panel: &web_sys::HtmlElement = plugin.unchecked_ref();
                let rect = main_panel.get_bounding_client_rect();
                let size_changed =
                    (height - rect.height()).abs() > 0.5 || (width - rect.width()).abs() > 0.5;

                let moved = dx.abs() > 0.5 || dy.abs() > 0.5;
                if size_changed {
                    main_panel
                        .style()
                        .set_property("width", &format!("{width}px"))?;
                    main_panel
                        .style()
                        .set_property("height", &format!("{height}px"))?;
                }

                if moved {
                    main_panel
                        .style()
                        .set_property("transform", &format!("translate({dx}px, {dy}px)"))?;
                }

                if size_changed {
                    plugin.resize().await?;
                }

                Ok(())
            })
            .await
    }

    /// Remove the inline presize styles applied by [`Self::presize_with_box`].
    /// Callers run this synchronously in the same task as the layout release
    /// (`resumeResize` — whose held commit callback runs as a microtask of the
    /// same task), so no frame can paint between the clear and the new grid
    /// landing.
    pub fn clear_presize(&self) -> ApiResult<()> {
        if let Some(plugin) = self.active_plugin() {
            let el = plugin.unchecked_ref::<web_sys::HtmlElement>();
            el.style().set_property("width", "")?;
            el.style().set_property("height", "")?;
            el.style().set_property("transform", "")?;
        }

        Ok(())
    }

    /// The SINGLE pipeline render entry (invariants I2/I3): run `f` under
    /// this renderer's draw lock with the [`RenderGuard`] witness. `f`
    /// composes the run — snapshot, validate, bind, pin context, dispatch
    /// via [`Self::draw_fresh`]/[`Self::update_bound`] — and everything it
    /// touches is witnessed.
    pub async fn render_task<T, F, Fut>(&self, f: F) -> ApiResult<T>
    where
        F: FnOnce(RenderGuard) -> Fut,
        Fut: Future<Output = ApiResult<T>>,
    {
        self.draw_lock().lock_with(f).await
    }

    /// FULL-draw a NEW `View` on the active plugin (`plugin.draw`) — the
    /// ONLY `plugin.draw` dispatch in the crate, witnessed by both the
    /// caller's held lock AND the [`FreshView`] token, which only
    /// `bind_view`'s REBUILD arm and [`Self::promote_first_paint`] mint.
    /// "Full draw without a new `View`" therefore does not compile (see
    /// `PLUGIN_DRAW_INVARIANT_PLAN.md`); every other repaint is
    /// [`Self::update_bound`] (same `View`, re-render) or `resize`
    /// (geometry/chrome).
    pub async fn draw_fresh(&self, guard: &RenderGuard, view: FreshView) -> ApiResult<()> {
        let timer = self.render_timer();
        timer
            .capture_time(self.draw_view(guard, view.view(), false))
            .await
    }

    /// Repaint the ALREADY-BOUND `view` on the active plugin
    /// (`plugin.update`): the dispatch for runs that reconciled without
    /// constructing a `View` (`BindDisposition::Adopted`/`Unchanged`) —
    /// adopted placeholder configs, no-op-commit repaint idioms (status
    /// indicator click, toggle-debug, render-warning dismiss). A no-op when
    /// no plugin has been selected yet (nothing has painted, so nothing
    /// needs repainting — first paints go through the
    /// [`Self::promote_first_paint`] → [`Self::draw_fresh`] path).
    pub async fn update_bound(&self, guard: &RenderGuard, view: &View) -> ApiResult<()> {
        let timer = self.render_timer();
        timer.capture_time(self.draw_view(guard, view, true)).await
    }

    /// Mint the [`FreshView`] full-draw witness for a plugin that has never
    /// painted the bound `View` — a freshly-selected/swapped plugin element
    /// (`commit_plugin_idx` clears `has_drawn`) or a first paint deferred by
    /// visibility gating. `plugin.draw`'s "new `View`" contract is from THIS
    /// plugin's perspective, so its first paint qualifies even when
    /// `bind_view` reconciled without a rebuild. `None` when the plugin has
    /// already drawn it — callers fall back to [`Self::update_bound`].
    pub fn promote_first_paint(&self, view: &View) -> Option<FreshView> {
        if !self.0.has_drawn.get() {
            Some(FreshView::assert_fresh(view.clone()))
        } else {
            None
        }
    }

    /// The activation nudge's repaint: stamp the activation class + theme
    /// and `plugin.resize()` — same `View`, same data, CHROME only (e.g.
    /// the datagrid's edit column-header row) — in ONE locked dispatch, so
    /// the class and the DOM it styles land in a single paint commit (the
    /// two-frame-artifact fix's atomicity requirement). Deliberately NOT
    /// `plugin.draw`/`update`: activation creates no new `View` and changes
    /// no data, and for charts a full dispatch is a fetch + multi-blit
    /// repaint (the stacked-tab regression). Each plugin's `resize()` is
    /// its cheap repaint-from-retained-state path, and both built-ins skip
    /// it while hidden — so the OUTGOING (unslotted) panel's nudge is free.
    pub async fn activation_repaint(&self, _guard: &RenderGuard) -> ApiResult<()> {
        if let Some(plugin) = self.active_plugin() {
            self.stamp_active(&plugin);
            self.stamp_theme(Some(&plugin));
            let _ = plugin.resize().await?;
        }

        Ok(())
    }

    /// Redraw an already-bound view, debounced. The `View` future is
    /// resolved *lazily*, inside the debounce/draw lock at actual draw time
    /// rather than captured at call time. Used by the per-panel data-refresh
    /// subscription so a redraw always renders the `View` currently bound on
    /// the `Session`, even if a concurrent config rebuild replaced (and
    /// deleted) the previous `View` after this redraw was scheduled.
    /// Capturing the `View` eagerly at schedule time instead races that
    /// rebuild and draws a stale/deleted `View`.
    pub async fn update_lazy(
        &self,
        view: impl Future<Output = ApiResult<Option<View>>>,
    ) -> ApiResult<()> {
        let timer = self.render_timer();
        self.draw_lock()
            .debounce_with(|guard| async move {
                set_timeout(timer.get_throttle()).await?;
                if self.0.presize_pending.get() > 0 {
                    tracing::debug!("Update skipped, presize pending");
                    return Ok(());
                }

                // Mount the plugin element eagerly — BEFORE awaiting the
                // (possibly slow) view query — so the panel's frame is never
                // empty while the query runs. Pure query + idempotent.
                self.mount_active_plugin()?;
                if let Some(view) = view.await? {
                    // Update runs pin the bound view's cached context so
                    // plugin read-backs stay snapshot-consistent (I5).
                    let _pin = self
                        .cached_context()
                        .map(|ctx| self.pin_context(&guard, ctx));

                    let timer = self.render_timer();
                    timer
                        .capture_time(self.draw_view(&guard, &view, true))
                        .await
                } else {
                    tracing::debug!("Render skipped, no `View` attached");
                    Ok(())
                }
            })
            .await
    }

    /// This will update an already existing view.
    pub async fn update(&self, session: Option<View>) -> ApiResult<()> {
        self.update_lazy(async { Ok(session) }).await
    }

    async fn draw_view(
        &self,
        _guard: &RenderGuard,
        view: &perspective_client::View,
        is_update: bool,
    ) -> ApiResult<()> {
        debug_assert!(
            !is_update || self.cached_context().is_none() || self.render_context().is_some(),
            "I5: RenderContext not pinned at plugin dispatch"
        );

        let plugin = if is_update {
            match self.active_plugin() {
                Some(plugin) => plugin,
                None => return Ok(()),
            }
        } else {
            self.ensure_plugin_selected()?
        };

        let meta = self.metadata();
        let mut limits =
            get_row_and_col_limits(view, &meta, self.is_render_warning_enabled()).await?;

        limits.is_update = is_update;
        if let Some(cb) = self.0.on_render_limits_changed.borrow().as_ref() {
            cb.emit(limits);
        }

        let viewer_elem = self.0.borrow().viewer_elem.clone();
        let slot = self.slot_name();
        // "Stamp before draw": activation class + effective theme attribute
        // atomic with this dispatch, so a plugin style read (its first
        // `draw()` captures the `--psp-*` vars) can never precede them —
        // including a plugin switch's first draw, whose freshly-created
        // element no async pass has seen yet.
        let first_paint = !self.0.has_drawn.get();
        let stamped_theme = self.effective_theme();
        self.stamp_active(&plugin);
        self.stamp_theme(Some(&plugin));

        // Fused stale-CSS restyle ("restyle then draw", captured-theme
        // revision): when the plugin's captured `--psp-*` vars predate the
        // theme just stamped, re-read them NOW — sync, inside this locked
        // dispatch, between the stamp and the render — so the dispatch
        // below paints new data in the NEW theme in one pass. Without
        // this, a rebuild bundled with a theme change drew in the OLD
        // colors (plugins re-read CSS only at `restyle()`/first paint) and
        // the mutation-site restyle tail then re-rendered everything.
        // State-keyed, so streaming updates with a fresh capture pay
        // nothing; recorded immediately (the re-read has happened even if
        // the render below fails), which also no-ops the tail
        // (`needs_restyle` → false). A first paint never enters (no
        // capture exists) — it captures fresh by construction.
        if self.needs_restyle() {
            plugin.restyle();
            *self.0.captured_theme.borrow_mut() = Some(stamped_theme.clone());
        }

        let result = if is_update {
            let task = plugin.update(view.clone().into(), limits.max_cols, limits.max_rows, false);
            activate_plugin(_guard, &viewer_elem, &plugin, slot.as_deref(), task).await
        } else {
            let task = plugin.draw(view.clone().into(), limits.max_cols, limits.max_rows, false);
            activate_plugin(_guard, &viewer_elem, &plugin, slot.as_deref(), task).await
        };

        // Record a genuinely-completed draw (a view-delete cancellation does
        // NOT count — the plugin may hold no content, and the deferred-render
        // resume paths key off this flag to know a redraw is still owed).
        if result.is_ok() {
            self.0.has_drawn.set(true);
            // A FIRST paint is a CSS capture — record the theme it was
            // stamped with (`needs_restyle`'s baseline). The value stamped,
            // not `effective_theme()` at completion: a theme committed
            // mid-draw must read as STALE against this capture.
            // Subsequent draws are NOT captures (charts cache theme vars
            // until `restyle()`), so only the restyle path may overwrite
            // this record afterwards.
            if first_paint {
                *self.0.captured_theme.borrow_mut() = Some(stamped_theme);
            }
        }

        let cleanup = remove_inactive_plugin(
            &viewer_elem,
            &plugin,
            slot.as_deref(),
            self.plugin_data.borrow_mut().plugin_store.plugins(),
        );

        match result.ignore_view_delete() {
            // A FIRST draw failed — this plugin has never successfully
            // painted, so the warn-and-continue below would leave the panel
            // permanently blank with a console warning as its only signal.
            // Propagate instead: the enclosing restore task surfaces it as a
            // panel error (`session.set_error` → error overlay), presenting
            // like a table error. Subsequent-draw failures keep
            // warn-and-continue — the panel still shows its last good
            // content, and failing the whole restore transaction for a
            // repaint hiccup would be worse than the stale frame.
            Err(error) if !self.0.has_drawn.get() => Err(error),
            Err(error) => {
                tracing::warn!("{}", error);
                cleanup
            },
            // `Ok(None)` is a view-delete cancellation — not a failure
            // (`has_drawn` stays false; the deferred-resume paths owe a
            // redraw).
            Ok(_) => cleanup,
        }
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
        let has_plugin = self.active_plugin().is_some();
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
