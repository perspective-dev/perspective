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

use perspective_client::config::GroupRollupMode;
use serde::Deserialize;
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub enum ColumnSelectMode {
    #[default]
    Toggle,
    Select,
}

impl ColumnSelectMode {
    pub fn css(&self) -> yew::Classes {
        match self {
            Self::Toggle => yew::classes!("toggle-mode", "is_column_active"),
            Self::Select => yew::classes!("select-mode", "is_column_active"),
        }
    }
}

/// Static, immutable configuration for a plugin.
///
/// Returned once per plugin from `get_static_config()` at registration
/// time and cached in [`crate::renderer::PluginRecord`]. Consumers
/// (renderer, session, queries, components) read these fields off the
/// renderer's active-plugin metadata rather than calling back into JS.
///
/// `<perspective-viewer>` reads this exactly once per plugin (at
/// `registerPlugin` time) and caches it for the lifetime of the
/// application. The result must be stable; do not mutate any field
/// after registration.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, TS)]
pub struct PluginStaticConfig {
    /// The unique key for this plugin. Used as the `plugin` field in a
    /// `ViewerConfig` and as the display name key in the
    /// `<perspective-viewer>` UI.
    pub name: String,

    /// Category in the plugin picker menu.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub category: Option<String>,

    /// Soft limit on the number of columns the plugin will render.
    /// Triggers the "Rendering N of M" warning when the view exceeds
    /// this value (until dismissed).
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub max_columns: Option<usize>,

    /// Soft limit on the number of cells (rows × columns) the plugin
    /// will render. Triggers the "Rendering N of M" warning when the view
    /// exceeds this value (until dismissed).
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub max_cells: Option<usize>,

    /// Column add/remove behavior. `"select"` exclusively selects the
    /// added column, removing other columns. `"toggle"` toggles the
    /// column on or off based on its current state, leaving other
    /// columns alone.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub select_mode: ColumnSelectMode,

    /// Minimum number of columns the plugin requires to render. Mostly
    /// affects drag/drop and column-remove button behavior. `undefined`
    /// is treated identically to `1`.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub min_config_columns: Option<usize>,

    /// Named column slots. Named columns have replace/swap behavior in
    /// drag/drop rather than insert. The length must be at least
    /// `min_config_columns`.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub config_column_names: Vec<String>,

    /// Group-rollup modes the plugin accepts, in preference order.
    /// The first entry that matches a feature flag becomes the default.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub group_rollup_modes: Option<Vec<GroupRollupMode>>,

    /// Plugin load priority. Higher numbers win; ties resolve in
    /// registration order. The highest-priority plugin is loaded by
    /// default unless `restore({ plugin })` overrides it.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub priority: Option<i32>,

    /// Whether this plugin opts into per-column style controls in the
    /// settings sidebar. When `true`, the StyleTab is shown for active
    /// columns and the plugin's `column_config_schema` is queried for
    /// the per-column field set. When `false` or omitted, no StyleTab
    /// is shown.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub can_render_column_styles: bool,
}

impl PluginStaticConfig {
    /// `true` if dropping a column at `index` should swap with the
    /// column already there rather than insert. Only the named slots
    /// (`config_column_names[..len()-1]`) participate in swap behaviour;
    /// the trailing unnamed tail inserts.
    pub fn is_swap(&self, index: usize) -> bool {
        !self.config_column_names.is_empty() && index < self.config_column_names.len() - 1
    }

    pub fn get_group_rollups(&self, rollup_features: &[GroupRollupMode]) -> Vec<GroupRollupMode> {
        self.group_rollup_modes
            .clone()
            .map(|x| {
                x.into_iter()
                    .filter(|y| rollup_features.is_empty() || rollup_features.contains(y))
                    .collect()
            })
            .unwrap_or_default()
    }
}
