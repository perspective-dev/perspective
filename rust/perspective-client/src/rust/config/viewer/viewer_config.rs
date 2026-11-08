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

use std::collections::HashMap;
use std::ops::Deref;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use super::{
    ColumnConfigUpdate, OptionalUpdate, PluginConfigUpdate, PluginUpdate, SettingsUpdate, TableRef,
    TableUpdate, ThemeUpdate, TitleUpdate, UnknownKeys, VersionUpdate,
};
use crate::config::{ViewConfig, ViewConfigUpdate};

/// Per-column plugin styling keyed by column name, each value opaque to the
/// viewer and shaped by the active plugin.
pub type ColumnConfigMap = HashMap<String, serde_json::Map<String, Value>>;

/// The message of the error raised when a panel is created without a `table`.
pub const CREATE_REQUIRES_TABLE: &str = "Cannot create a panel without a `table` — `load()` a \
                                         `Client` and include `table` in the config, or use \
                                         `addPanel()`";

/// Why a [`ViewerConfigUpdate`] could not become a panel's
/// [`ViewerConfigInitial`].
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum ViewerConfigError {
    /// The update names no `table`.
    #[error("{}", CREATE_REQUIRES_TABLE)]
    CreateRequiresTable,

    /// The `table` is an inline derived-table definition which no restore
    /// boundary has resolved to a name.
    #[error("Unresolved inline derived table")]
    UnresolvedTableRef,
}

/// The state of an entire `<perspective-viewer>` element and its plugin: the
/// element-level `settings` flag plus the per-panel [`PanelViewerConfig`].
/// The split exists so the workspace config format can serialize panel
/// entries *without* a `settings` key (it is element-level state there,
/// carried by the top-level `active` field instead), while the single-panel
/// format flattens back to the legacy shape.
#[derive(Debug, Default, Deserialize, Serialize, PartialEq, TS)]
pub struct ViewerConfig<V: TS = String, T: TS = TableRef> {
    /// Whether the settings sidebar is open.
    pub settings: bool,

    /// The panel state.
    #[serde(flatten)]
    pub panel: PanelViewerConfig<V, T>,
}

/// The per-panel state of a [`ViewerConfig`] — everything except the
/// element-level `settings` flag. This is the `panels` entry type of the
/// workspace config format.
#[derive(Debug, Default, Deserialize, Serialize, PartialEq, TS)]
pub struct PanelViewerConfig<V: TS = String, T: TS = TableRef> {
    /// The `@perspective-dev/viewer` version that wrote this config,
    /// stamped on save and named in the error when such a config is rejected.
    /// Callers do not set it.
    pub version: V,

    /// Per-column styling, keyed by column name. The viewer treats the
    /// values as opaque — their shape is defined by the ACTIVE plugin,
    /// so a config written for one plugin may carry keys another
    /// ignores. Query the live shape with the `get_style_schema` agent
    /// tool, or the plugin's `column_config_schema()`.
    pub columns_config: ColumnConfigMap,

    /// Name of the visualization plugin, from the set registered on the
    /// page (the `list_plugins` agent tool, or the plugin picker). This
    /// also decides what the view fields MEAN visually: `columns` is
    /// positional and each plugin reads the positions differently, and
    /// `group_by`/`split_by` draw different things per plugin.
    pub plugin: String,

    /// Plugin-wide settings (as opposed to the per-column
    /// [`Self::columns_config`]). Opaque to the viewer and defined by
    /// the active plugin; see `get_style_schema`.
    pub plugin_config: serde_json::Map<String, Value>,

    /// The `Table` this panel renders: its hosted name in a
    /// [`WorkspaceConfig`](super::WorkspaceConfig) `panels` entry
    /// (`T = String`), and a [`TableRef`] — a name, or a recursively inlined
    /// derived-table definition — in the single-panel `save()` format.
    pub table: T,

    /// Selected theme NAME (e.g. `"Pro Dark"`) — not a CSS value. Valid
    /// names are the Perspective themes loaded on the page, which
    /// `resetThemes()` re-scans. `None` selects the first available.
    pub theme: Option<String>,

    /// Panel title, shown in its tab. `None` renders the default title.
    pub title: Option<String>,

    /// The engine view config.
    #[serde(flatten)]
    pub view_config: ViewConfig,

    /// Rejects keys no field above consumed.
    #[serde(flatten, skip_serializing)]
    #[ts(skip)]
    pub unknown: UnknownKeys,
}

impl<V: TS, T: TS> Deref for ViewerConfig<V, T> {
    type Target = PanelViewerConfig<V, T>;

    fn deref(&self) -> &Self::Target {
        &self.panel
    }
}

impl<V: TS, T: TS> PanelViewerConfig<V, T> {
    /// The same config with the `table` slot mapped, which is how the
    /// single-panel emitters convert a bound name to its inline form.
    pub fn map_table<U: TS>(self, f: impl FnOnce(T) -> U) -> PanelViewerConfig<V, U> {
        PanelViewerConfig {
            version: self.version,
            columns_config: self.columns_config,
            plugin: self.plugin,
            plugin_config: self.plugin_config,
            table: f(self.table),
            theme: self.theme,
            title: self.title,
            view_config: self.view_config,
            unknown: self.unknown,
        }
    }
}

impl<V: TS, T: TS> ViewerConfig<V, T> {
    /// The same config with the `table` slot mapped.
    pub fn map_table<U: TS>(self, f: impl FnOnce(T) -> U) -> ViewerConfig<V, U> {
        ViewerConfig {
            settings: self.settings,
            panel: self.panel.map_table(f),
        }
    }
}

/// An opaque plugin-defined settings value.
#[derive(Clone, Debug, TS, Deserialize, PartialEq, Serialize)]
#[serde(transparent)]
pub struct PluginConfig(serde_json::Value);

impl Deref for PluginConfig {
    type Target = Value;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// The `restore()` argument: a field-wise update of a panel's state, where an
/// absent key is unchanged, `null` resets and a value replaces.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct ViewerConfigUpdate {
    /// The `@perspective-dev/viewer` version a saved config was written
    /// by, named in the error when such a config is rejected. Omit it — the
    /// viewer stamps the current version on save.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub version: VersionUpdate,

    /// Name of the visualization plugin to switch to, from the set
    /// registered on the page (the `list_plugins` agent tool, or the
    /// plugin picker). Changing it changes what the view fields MEAN:
    /// `columns` is positional and every plugin reads the positions
    /// differently, and `group_by`/`split_by` draw different things per
    /// plugin — so read the new plugin's roles before writing `columns`
    /// for it.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub plugin: PluginUpdate,

    /// Panel title, shown in its tab. `null` restores the default
    /// title; omitting the field leaves the current one.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub title: TitleUpdate,

    /// The `Table` to render: a name as hosted on this panel's `Client`,
    /// or an inline derived-table definition to materialize (reusing a
    /// structurally identical derived `Table` when one exists). Rebinding
    /// an existing panel keeps the rest of the config, so column names
    /// that do not exist in the new table will fail validation.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub table: TableUpdate,

    /// Theme NAME (e.g. `"Pro Dark"`) — not a CSS value. Valid names are
    /// the Perspective themes loaded on the page, re-scanned by
    /// `resetThemes()`. `null` selects the default.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub theme: ThemeUpdate,

    /// Whether the settings sidebar is OPEN. Purely cosmetic chrome —
    /// it does not affect what the viewer renders, and it is
    /// element-level rather than per-panel.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub settings: SettingsUpdate,

    /// Plugin-wide settings (as opposed to the per-column
    /// [`Self::columns_config`]). The viewer passes these through
    /// opaquely — their valid keys are defined by the ACTIVE plugin and
    /// vary by plugin and by state, so query them with the
    /// `get_style_schema` agent tool rather than guessing.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub plugin_config: PluginConfigUpdate,

    /// Per-column styling — formatting, colors, and other per-column
    /// controls — keyed by column name. Opaque to the viewer and
    /// plugin-defined like [`Self::plugin_config`]; `get_style_schema`
    /// reports the valid keys for a given column under the active
    /// plugin.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub columns_config: ColumnConfigUpdate,

    /// The engine view config update.
    #[serde(flatten)]
    pub view_config: ViewConfigUpdate,

    /// Rejects keys no field above consumed.
    #[serde(flatten, skip_serializing)]
    #[ts(skip)]
    pub unknown: UnknownKeys,
}

/// The initial configuration of a NEW panel (`addPanel`, `restore`'s
/// panel-creating upsert, `restoreWorkspace` `panels` entries). Unlike
/// [`ViewerConfigUpdate`] — a patch against existing state — creation has
/// no prior state: `table` is REQUIRED (a placed panel without a table
/// binding would be permanently blank), absent fields mean "default"
/// rather than "leave unchanged" (so no [`OptionalUpdate`] tri-state), and
/// there is no `settings` field (element-level, not per-panel).
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
pub struct ViewerConfigInitial {
    /// Name of the `Table` the new panel renders, as hosted on the
    /// `Client`. REQUIRED: a placed panel with no table binding would be
    /// permanently blank.
    pub table: String,

    /// The `@perspective-dev/viewer` version a saved config was written
    /// by. Omit it when creating a panel.
    #[ts(optional)]
    pub version: Option<String>,

    /// Name of the visualization plugin, from the set registered on the
    /// page (the `list_plugins` agent tool, or the plugin picker).
    /// Decides what the view fields MEAN: `columns` is positional and
    /// every plugin reads the positions differently, and
    /// `group_by`/`split_by` draw different things per plugin. Absent
    /// uses the default plugin.
    #[ts(optional)]
    pub plugin: Option<String>,

    /// Panel title, shown in its tab. Absent renders the default title.
    #[ts(optional = nullable)]
    pub title: Option<String>,

    /// Theme NAME (e.g. `"Pro Dark"`) — not a CSS value. Valid names are
    /// the Perspective themes loaded on the page. Absent uses the
    /// default.
    #[ts(optional = nullable)]
    pub theme: Option<String>,

    /// Plugin-wide settings (as opposed to the per-column
    /// [`Self::columns_config`]). Opaque to the viewer and defined by
    /// the ACTIVE plugin; query the valid keys with `get_style_schema`
    /// rather than guessing.
    #[ts(optional)]
    pub plugin_config: Option<serde_json::Map<String, Value>>,

    /// Per-column styling — formatting, colors, and other per-column
    /// controls — keyed by column name. Plugin-defined like
    /// [`Self::plugin_config`]; see `get_style_schema`.
    #[ts(optional)]
    pub columns_config: Option<ColumnConfigMap>,

    /// The engine view config update.
    #[serde(flatten)]
    pub view_config: ViewConfigUpdate,

    /// Rejects keys no field above consumed.
    #[serde(flatten, skip_serializing)]
    #[ts(skip)]
    pub unknown: UnknownKeys,
}

impl ViewerConfigInitial {
    /// A default panel bound to `table`.
    pub fn new(table: impl Into<String>) -> Self {
        Self {
            table: table.into(),
            version: None,
            plugin: None,
            title: None,
            theme: None,
            plugin_config: None,
            columns_config: None,
            view_config: ViewConfigUpdate::default(),
            unknown: UnknownKeys,
        }
    }
}

fn up<T: Clone>(value: Option<T>) -> OptionalUpdate<T> {
    match value {
        Some(value) => OptionalUpdate::Update(value),
        None => OptionalUpdate::Missing,
    }
}

impl From<ViewerConfigInitial> for ViewerConfigUpdate {
    fn from(value: ViewerConfigInitial) -> Self {
        ViewerConfigUpdate {
            version: up(value.version),
            plugin: up(value.plugin),
            title: up(value.title),
            table: OptionalUpdate::Update(value.table.into()),
            theme: up(value.theme),
            settings: OptionalUpdate::Missing,
            plugin_config: up(value.plugin_config),
            columns_config: up(value.columns_config),
            view_config: value.view_config,
            unknown: value.unknown,
        }
    }
}

fn down<T: Clone>(value: OptionalUpdate<T>) -> Option<T> {
    match value {
        OptionalUpdate::Update(value) => Some(value),
        OptionalUpdate::Missing | OptionalUpdate::SetDefault => None,
    }
}

impl TryFrom<ViewerConfigUpdate> for ViewerConfigInitial {
    type Error = ViewerConfigError;

    fn try_from(value: ViewerConfigUpdate) -> Result<Self, Self::Error> {
        let ViewerConfigUpdate {
            version,
            plugin,
            title,
            table,
            theme,
            settings: _settings,
            plugin_config,
            columns_config,
            view_config,
            unknown,
        } = value;

        let OptionalUpdate::Update(table) = table else {
            return Err(ViewerConfigError::CreateRequiresTable);
        };

        let table = table.name()?.to_owned();

        Ok(Self {
            table,
            version: down(version),
            plugin: down(plugin),
            title: down(title),
            theme: down(theme),
            plugin_config: down(plugin_config),
            columns_config: down(columns_config),
            view_config,
            unknown,
        })
    }
}

impl std::fmt::Display for ViewerConfigUpdate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(self).map_err(|_| std::fmt::Error)?
        )
    }
}
