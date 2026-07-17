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

use perspective_js::JsViewWindow;
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;

use crate::config::PluginStaticConfig;
use crate::renderer::ColumnConfigMap;

/// Perspective FFI
#[wasm_bindgen]
#[rustfmt::skip]
extern "C" {

    #[derive(Clone)]
    pub type JsPerspectiveViewer;

    /// A `<perspective-viewer>` plugin custom element.
    ///
    /// # Call discipline
    ///
    /// Plugin implementations assume the host NEVER overlaps calls on the
    /// same element: each of the rendering methods (`draw`, `update`,
    /// `render`, `clear`, `resize`) and `delete` must run to completion
    /// before the next begins. Every call site must therefore hold that
    /// plugin's per-`Renderer` draw lock, witnessed by
    /// [`crate::utils::RenderGuard`] — the guard-taking dispatch helpers
    /// (`Renderer::draw_fresh`/`update_bound`,
    /// `renderer::activate::activate_plugin`) and the already-locked
    /// `render_task`/`update_lazy`/`resize`/`restyle_all`/`dispose`
    /// entrypoints do not compile from an unlocked context. Synchronous
    /// calls (`restore`, `restyle`, the schema queries) are exempt, though
    /// `restyle` should ride inside a locked restyle-then-update sequence
    /// (see `Renderer::restyle_all`).
    ///
    /// # Dispatch semantics (`PLUGIN_DRAW_INVARIANT_PLAN.md`, amended
    /// 2026-07-16)
    ///
    /// The host invokes `draw` **iff there is a NEW `View` for this
    /// plugin** — `bind_view` REBUILT the engine `View`, or a
    /// freshly-selected plugin element owes its first paint of the bound
    /// one — so implementations may treat `draw` as "new data shape"
    /// (reset zoom/scroll/domain state). The witness enforcing this is
    /// [`crate::session::FreshView`], which only the rebuild and
    /// first-paint paths mint.
    ///
    /// `update` is a repaint of the SAME `View`, invoked iff a
    /// plugin-visible SOURCE changed — one of exactly six: (1) data
    /// (`View::on_update`), (2) an adopted placeholder-config delta,
    /// (3) a genuinely CHANGED `plugin_config`/`columns_config` the host
    /// just delivered via `restore` (so `update`-after-`restore` is the
    /// sanctioned delivery pairing), (4) genuinely changed CSS vars just
    /// applied via `restyle` (`Renderer::restyle_all`, or the fused
    /// stale-capture restyle immediately preceding a dispatch inside
    /// `draw_view` — gated by `Renderer::needs_restyle`), (5) a
    /// render-limits change (warning dismissed), (6) an explicit PUBLIC
    /// element-API call that reconciled as a no-op
    /// ([`crate::tasks::RunOrigin::Public`] — the documented
    /// `viewer.restore({})` refresh affordance). An INTERNAL run that
    /// changed none of these dispatches nothing.
    ///
    /// `resize` is geometry/chrome only, from retained state (and is also
    /// the activation-chrome nudge — implementations should no-op it
    /// while hidden).
    ///
    /// `restore`/`save` are state transfer, NOT rendering: plugins must
    /// not render internally from them, and must not call host APIs from
    /// inside `restore` (a `restore`-triggered `restorePanel` echo is how
    /// the initial-load double render happened — user gestures may echo,
    /// host-delivered restores must not). (The built-in `Debug` plugin's
    /// own `resize()` delegating to its `draw()` is plugin-INTERNAL and
    /// exempt.)
    ///
    /// # Render-callable contract (invariant I5,
    /// `SESSION_CONFIG_COHERENCE_PLAN.md`)
    ///
    /// From inside `draw`/`update`/`render`/`resize`, a plugin may call
    /// back into its host `<perspective-viewer>` ONLY the per-panel
    /// snapshot getters — `getViewConfigPanel`, `getTablePanel`,
    /// `getClientPanel`, `getEditPortPanel` — which answer from the run's
    /// pinned `RenderContext`, so plugin-visible state always equals the
    /// snapshot being drawn, never a fresher in-flight commit.
    /// Lock-acquiring host methods (`savePanel`, `restorePanel`, `flush`,
    /// `download`/`export`/`copy`, …) DEADLOCK on the non-reentrant draw
    /// lock if called from a render and are forbidden.
    #[derive(Clone)]
    pub type JsPerspectiveViewerPlugin;

    #[derive(Clone)]
    pub type JsPluginStaticConfig;

    /// The static configuration of the plugin which defines the basic
    /// integration with `perspective-viewer`. Called once per plugin at
    /// registration time and cached — the result must be stable for
    /// the lifetime of the application.
    #[wasm_bindgen(method)]
    pub fn get_static_config(this: &JsPerspectiveViewerPlugin) -> JsPluginStaticConfig;

    /// Returns the per-column schema describing which controls to render
    /// in the sidebar Style tab and the keys each control owns in the
    /// column's persisted config map. `column_stats` carries cached
    /// per-column numeric stats (currently `{ abs_max?: number }`);
    /// fields are populated lazily and may be missing on the first
    /// call — the view re-renders and re-queries the schema once the
    /// async fetch resolves.
    #[wasm_bindgen(method, catch, js_name = column_config_schema)]
    pub fn _column_config_schema(this: &JsPerspectiveViewerPlugin, view_type: &str, group: Option<&str>, column_name: &str, current_value: &JsValue, view_config: &JsValue, column_stats: &JsValue) -> ApiResult<JsValue>;

    #[wasm_bindgen(method, catch, js_name = plugin_config_schema)]
    pub fn _plugin_config_schema(this: &JsPerspectiveViewerPlugin, view_config: &JsValue) -> ApiResult<JsValue>;

    /// STATE TRANSFER, not rendering (dispatch semantics, rule for
    /// `restore`/`save`): deliver a `plugin_config` + `columns_config`
    /// snapshot into the plugin. Sync and lock-exempt. The host pairs a
    /// restore that genuinely CHANGED plugin state with exactly one
    /// `update` in the same locked run (update source 3) — plugins must
    /// not render from `restore()` themselves, and must not call host
    /// APIs from inside it (the echo rule: a plugin-issued `restorePanel`
    /// re-enters through the PUBLIC surface, indistinguishable from a
    /// user call — the initial-load double-render bug). Prefer the typed
    /// [`JsPerspectiveViewerPlugin::restore`] wrapper.
    #[wasm_bindgen(method, js_name=restore, catch)]
    pub fn _restore(this: &JsPerspectiveViewerPlugin, token: &JsValue, columns_config: &JsValue) -> ApiResult<()>;

    /// Free the plugin's resources. Serialized like the rendering methods —
    /// callers route through the draw lock (`Renderer::dispose`/`delete`
    /// defer teardown through it; a sync `delete` mid-`draw` violates the
    /// call discipline).
    #[wasm_bindgen(method)]
    pub fn delete(this: &JsPerspectiveViewerPlugin);

    /// Re-read the `--psp-*` CSS custom properties (sync). Dispatched ONLY
    /// when the effective theme genuinely changed, state-keyed by
    /// [`crate::renderer::Renderer::needs_restyle`] (the effective theme
    /// vs. the one recorded at this plugin's last capture — first paint or
    /// last restyle), from two sites: fused immediately BEFORE a
    /// `draw`/`update` inside the same locked dispatch
    /// (`Renderer::draw_view`, "restyle then draw" — one render pass in
    /// the new theme), or as `Renderer::restyle_all`'s locked
    /// restyle-then-`update` pair when no other dispatch is coming
    /// (theme picker, `resetThemes`, default-theme discovery, restore
    /// tails). Exception: the public `restyleElement()` API restyles
    /// unconditionally — it is the "my external CSS changed" affordance,
    /// outside what captured-theme state can know. (Plus one
    /// `mount_plugin` restyle on first light-DOM mount.)
    #[wasm_bindgen(method)]
    pub fn restyle(
        this: &JsPerspectiveViewerPlugin,
    );

    /// Offscreen export render (`copy`/`export`) — returns an image
    /// `Blob`; not a dispatch verb (does not touch the plugin's mounted
    /// DOM state), but still serialized under the draw lock.
    #[wasm_bindgen(method, catch)]
    pub async fn render(
        this: &JsPerspectiveViewerPlugin,
        view: perspective_js::View,
        viewport: Option<JsViewWindow>,
    ) -> ApiResult<web_sys::Blob>;

    /// Full render of a `View` that is NEW to this plugin — dispatched iff
    /// `bind_view` REBUILT the engine `View`, or this freshly-selected
    /// plugin owes its first paint of the bound one (see "Dispatch
    /// semantics" on [`JsPerspectiveViewerPlugin`]). Witness-gated: call
    /// through [`crate::renderer::Renderer::draw_fresh`], which requires
    /// the [`crate::session::FreshView`] token — a bare `draw` dispatch
    /// does not exist in the host. Plugins may treat this as "new data
    /// shape" and reset zoom/scroll/selection-domain state.
    #[wasm_bindgen(method, catch)]
    pub async fn draw(
        this: &JsPerspectiveViewerPlugin,
        view: perspective_js::View,
        column_limit: Option<usize>,
        row_limit: Option<usize>,
        force: bool
    ) -> ApiResult<()>;

    /// Repaint of the SAME `View` — dispatched iff one of the six
    /// plugin-visible sources changed (see "Dispatch semantics" on
    /// [`JsPerspectiveViewerPlugin`]); never defensively. Reaches the
    /// plugin via [`crate::renderer::Renderer::update_bound`] (pipeline
    /// runs — `Adopted` deltas, changed-config delivery, public no-op
    /// refresh) or [`crate::renderer::Renderer::update_lazy`]
    /// (`table_updated` data refreshes, the config-apply tasks, warning
    /// dismiss), both locked.
    #[wasm_bindgen(method, catch)]
    pub async fn update(
        this: &JsPerspectiveViewerPlugin,
        view: perspective_js::View,
        column_limit: Option<usize>,
        row_limit: Option<usize>,
        force: bool
    ) -> ApiResult<()>;

    #[wasm_bindgen(method, catch)]
    pub async fn clear(this: &JsPerspectiveViewerPlugin) -> ApiResult<JsValue>;

    /// Repaint from retained state — dispatched iff geometry or visibility
    /// changed: box resizes (resize observers, presize sweeps, settings
    /// toggles) and the panel-ACTIVATION chrome nudge
    /// ([`crate::renderer::Renderer::activation_repaint`], stamped inside
    /// one locked dispatch). Same `View`, same data, no CSS re-read —
    /// implementations should no-op while hidden (`offsetParent == null`).
    #[wasm_bindgen(method, catch)]
    pub async fn resize(this: &JsPerspectiveViewerPlugin) -> ApiResult<JsValue>;

    /// OPTIONAL — clear any visible selection state (highlighted rows,
    /// pinned tooltips) WITHOUT emitting selection events. Invoked by the
    /// host when an element-level global filter contributed by this panel's
    /// selection is removed (`GlobalFilterBar` chip × / "Clear"), so the
    /// selection visual can't outlive the filter it produced. Call through
    /// [`JsPerspectiveViewerPlugin::deselect`], which no-ops for plugins
    /// that don't implement it. Implementations may redraw, so callers must
    /// hold the plugin's per-`Renderer` draw lock (see "Call discipline").
    #[wasm_bindgen(method, catch, js_name = deselect)]
    async fn _deselect(this: &JsPerspectiveViewerPlugin) -> ApiResult<()>;

}

impl From<JsPluginStaticConfig> for PluginStaticConfig {
    fn from(value: JsPluginStaticConfig) -> Self {
        value.into_serde_ext().expect("Invalid plugin config")
    }
}

impl JsPerspectiveViewerPlugin {
    /// Read and deserialize the plugin's static config. Should only
    /// be called once per plugin (at registration time); cache the
    /// result and read fields off the cached value rather than
    /// reaching back through the FFI.
    pub fn read_static_config(&self) -> PluginStaticConfig {
        self.get_static_config().into()
    }

    pub fn restore(
        &self,
        token: &JsValue,
        columns_config: Option<&ColumnConfigMap>,
    ) -> ApiResult<()> {
        let columns_config = JsValue::from_serde_ext(&columns_config).unwrap();
        self._restore(token, &columns_config)
    }

    /// Invoke the plugin's OPTIONAL `deselect()` (see `_deselect`) — a no-op
    /// for plugins that don't implement it (e.g. the built-in `Debug`
    /// plugin), rather than the `TypeError` a bare FFI call would raise.
    pub async fn deselect(&self) -> ApiResult<()> {
        let has_deselect = js_sys::Reflect::get(self, &JsValue::from_str("deselect"))
            .map(|x| x.is_function())
            .unwrap_or_default();

        if has_deselect {
            self._deselect().await
        } else {
            Ok(())
        }
    }
}
