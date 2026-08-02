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
mod dispatch;
pub mod limits;
mod plugin_config;
mod plugin_store;
mod props;
mod registry;
mod render_timer;

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ops::Deref;
use std::rc::Rc;

use perspective_client::ViewWindow;
use perspective_js::utils::{ApiFuture, ApiResult, JsValueSerdeExt};
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use self::activate::*;
pub use self::limits::RenderLimits;
pub use self::plugin_config::{ColumnConfigMap, PluginScopedConfig};
use self::plugin_store::*;
pub use self::props::RendererProps;
pub use self::registry::*;
use self::render_timer::*;
use crate::config::*;
use crate::js::plugin::*;
use crate::utils::*;

/// Minimum geometry delta (px) considered a real size/position change by the
/// presize paths.
pub(crate) const SUBPIXEL_EPSILON: f64 = 0.5;

/// One queued geometry task for the [`RendererData::geometry_slot`] runner.
/// `Measure` re-measures the plugin's live box (reactive resize); `Presize`
/// renders an anticipated box ahead of a layout commit. A later command
/// subsumes an earlier unconsumed one: `Measure` reflects whatever geometry
/// has committed by run time, and `Presize` anticipates the NEXT commit —
/// callers issue them in commit order.
#[derive(Clone, Copy)]
pub(crate) enum GeometryCmd {
    Measure,
    Presize {
        translate: Option<(f64, f64)>,
        width: f64,
        height: f64,
    },
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

    /// Debounce slot for geometry tasks (`resize` / presize), separate from
    /// the default slot data-update redraws coalesce on. Invariant: a
    /// geometry request must never resolve via a parked DATA task — a
    /// pending update's redraw renders at the worker's current dimensions
    /// and cannot subsume a size change (the drag-during-updates permanent
    /// skew).
    geometry_slot: DebounceSlot,

    /// Latest-wins parameter cell for the geometry slot, consumed by the
    /// runner AT RUN TIME under the lock. Parameters live here rather than
    /// in runner captures so a parked runner can never act on a stale
    /// target when later calls coalesced onto it.
    geometry_cmd: Cell<Option<GeometryCmd>>,

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

    /// A `table_updated` redraw was DROPPED because this panel's plugin was
    /// hidden (an unslotted tab-stack panel — see
    /// `tasks::create_panel::wire_panel_render_sub`), so the plugin's
    /// retained frame no longer reflects the bound `View`'s data. The
    /// activation nudge consumes it to dispatch a full `plugin.update`
    /// instead of the usual chrome-only `resize` repaint. Cleared at every
    /// `draw_view` dispatch — set BEFORE the plugin's data fetch, so an
    /// update landing mid-draw re-marks it and can never be lost.
    data_stale: Cell<bool>,
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
        let draw_lock = DebounceMutex::default();
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
            geometry_slot: draw_lock.slot(),
            geometry_cmd: Cell::new(None),
            draw_lock,
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
            data_stale: Cell::new(false),
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

    /// [`Self::set_theme`] plus a synchronous [`Self::stamp_theme`] when the
    /// effective theme is resolvable now (a named theme needs no registry; a
    /// reset stamps only from a warm default cache — a cold one would stamp
    /// attribute-removal). The shared "stamp-with-commit" head of every
    /// per-panel theme mutation site.
    pub fn set_theme_stamped(&self, theme: Option<String>) {
        let stamp = theme.is_some() || self.default_theme().is_some();
        self.set_theme(theme);
        if stamp {
            self.stamp_theme(None);
        }
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

    // ─── Per-column config (active plugin's bucket) ───────────────────

    // ─── Plugin-level config (active plugin's bucket) ─────────────────

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
