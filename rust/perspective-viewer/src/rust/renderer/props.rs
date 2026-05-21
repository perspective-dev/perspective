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

use std::rc::Rc;

use crate::config::PluginStaticConfig;
use crate::renderer::limits::RenderLimits;
use crate::utils::PtrEqRc;

/// Value-semantic snapshot of the renderer state read by components.
///
/// The actual plugin JS objects, draw lock, and render timer live in
/// `RendererEngine` and are not passed as props.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct RendererProps {
    /// Name of the currently active plugin (e.g. `"Datagrid"`).
    pub plugin_name: Option<String>,

    /// Cached static config of the active plugin (column requirements,
    /// rollup modes, render caps, etc.). Shared with the renderer's
    /// internal `metadata` — `Rc::ptr_eq` works.
    pub config: Rc<PluginStaticConfig>,

    /// Most recently emitted render limits, if any.
    pub render_limits: Option<RenderLimits>,

    /// Names of all registered plugins, in registration order.
    pub available_plugins: PtrEqRc<Vec<String>>,

    /// `true` when the active plugin is anything other than the
    /// `Datagrid`. Changes only when the active plugin swaps, so reading
    /// from this prop avoids a per-render `Renderer::is_chart()` call.
    pub is_chart: bool,

    /// Snapshot of the active plugin's `plugin_config` bucket. Re-read
    /// by `Renderer::to_props` on `plugin_config_changed` /
    /// `plugin_changed` (the active bucket changes on plugin switch).
    /// Consumed by `PluginTab` so the tab is a pure function of its
    /// props — no direct `Renderer::get_plugin_config()` reads against
    /// the interior-mutable handle, no manual PubSub subscription, no
    /// race window between `plugins_idx` swap and the schema query.
    pub plugin_config: PtrEqRc<serde_json::Map<String, serde_json::Value>>,
}

impl RendererProps {
    /// Whether the active plugin opts into per-column style controls.
    pub fn can_render_column_styles(&self) -> bool {
        self.config.can_render_column_styles
    }
}
