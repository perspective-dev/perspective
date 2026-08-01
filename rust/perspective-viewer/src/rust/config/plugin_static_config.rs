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

    /// What `group_by` MEANS visually for this plugin, e.g. `"X Axis"`
    /// for the Y-series charts or `"Hierarchy"` for treemap/sunburst.
    /// `None` where the field has no visual role of its own and is a
    /// plain aggregation key (the X/Y charts, whose axes both come from
    /// `columns`).
    ///
    /// This is the `group_by` counterpart of [`Self::config_column_names`]:
    /// the same declaration that names the positional `columns` slots
    /// should say what the other view fields draw, so that consumers —
    /// the settings UI's field labels, and the agent's `list_plugins`
    /// contract — read one source instead of restating the mapping.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub group_by_role: Option<String>,

    /// What `split_by` MEANS visually for this plugin, e.g. `"Series"`.
    /// See [`Self::group_by_role`].
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub split_by_role: Option<String>,

    /// `true` when this plugin CONNECTS its points in row order, so the
    /// `View`'s row order is visible in the drawing: an unsorted config
    /// renders the table's natural order, which reads as a tangle unless
    /// the rows already arrive ordered along the axis. Declared rather
    /// than inferred, because "unsorted" is not itself a mistake — a
    /// pre-ordered table needs no `sort`, and the point plugins
    /// (scatter, density) do not care at all.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub connects_row_order: bool,
}

impl PluginStaticConfig {
    /// The number of leading `columns` slots that are POSITIONAL: a drop
    /// there swaps with the column already present, and the slot's
    /// meaning is fixed by [`Self::config_column_names`]. Everything from
    /// this index on is the insert TAIL, which repeats the last named
    /// role — which is why a `Y Line` (named slots: `["Y Axis"]`) takes
    /// any number of columns as additional Y series, while an
    /// `X/Y Line` (`["X Axis", "Y Axis", "Tooltip"]`) pins its two axes
    /// and treats the rest as further tooltips.
    ///
    /// The single definition of that rule: [`Self::is_swap`] and the
    /// agent's `list_plugins` contract both derive from it, so the
    /// convention cannot be read two different ways.
    pub fn positional_columns(&self) -> usize {
        self.config_column_names.len().saturating_sub(1)
    }

    /// The role that `columns` past the positional slots repeat, i.e.
    /// the last named slot. `None` when the plugin names no slots.
    pub fn tail_column_role(&self) -> Option<&str> {
        self.config_column_names.last().map(|x| x.as_str())
    }

    /// `true` if dropping a column at `index` should swap with the
    /// column already there rather than insert.
    pub fn is_swap(&self, index: usize) -> bool {
        !self.config_column_names.is_empty() && index < self.positional_columns()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn plugin(names: &[&str]) -> PluginStaticConfig {
        PluginStaticConfig {
            config_column_names: names.iter().map(|x| (*x).to_owned()).collect(),
            ..Default::default()
        }
    }

    /// The tail rule has ONE definition: `is_swap` and the role a
    /// trailing column repeats must never disagree about where the
    /// positional slots end.
    #[test]
    fn positional_slots_and_tail_agree() {
        // `Y Line` — the only named slot IS the tail, so every column
        // is another Y series and none of them swap.
        let y_line = plugin(&["Y Axis"]);
        assert_eq!(y_line.positional_columns(), 0);
        assert_eq!(y_line.tail_column_role(), Some("Y Axis"));
        assert!(!y_line.is_swap(0));

        // `X/Y Line` — two pinned axes, then tooltips.
        let xy_line = plugin(&["X Axis", "Y Axis", "Tooltip"]);
        assert_eq!(xy_line.positional_columns(), 2);
        assert_eq!(xy_line.tail_column_role(), Some("Tooltip"));
        assert!(xy_line.is_swap(0));
        assert!(xy_line.is_swap(1));
        assert!(!xy_line.is_swap(2));

        for index in 0..4 {
            assert_eq!(xy_line.is_swap(index), index < xy_line.positional_columns());
        }

        let unnamed = plugin(&[]);
        assert_eq!(unnamed.positional_columns(), 0);
        assert_eq!(unnamed.tail_column_role(), None);
        assert!(!unnamed.is_swap(0));
    }
}
