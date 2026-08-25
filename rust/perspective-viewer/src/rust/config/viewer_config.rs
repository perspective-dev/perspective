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

use std::ops::Deref;
use std::sync::LazyLock;

use perspective_client::config::*;
use perspective_js::utils::*;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use ts_rs::TS;
use wasm_bindgen::prelude::*;

use crate::renderer::ColumnConfigMap;

/// The state of an entire `custom_elements::PerspectiveViewerElement` component
/// and its `Plugin`: the element-level `settings` flag plus the per-panel
/// [`PanelViewerConfig`]. The split exists so the workspace config format
/// can serialize panel entries *without* a `settings` key (it is element-level
/// state there, carried by the top-level `active` field instead), while the
/// single-panel format flattens back to the legacy shape.
#[derive(Debug, Default, Serialize, PartialEq, TS)]
#[serde(deny_unknown_fields)]
pub struct ViewerConfig<V: TS = String> {
    pub settings: bool,

    #[serde(flatten)]
    pub panel: PanelViewerConfig<V>,
}

/// The per-panel state of a [`ViewerConfig`] — everything except the
/// element-level `settings` flag. This is the `panels` entry type of the
/// workspace config format.
#[derive(Debug, Default, Serialize, PartialEq, TS)]
pub struct PanelViewerConfig<V: TS = String> {
    /// The `@perspective-dev/viewer` version that wrote this config,
    /// stamped on save and used to migrate older tokens. Callers do not
    /// set it.
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

    /// Name of the `Table` this panel renders, as hosted on the panel's
    /// `Client`. Every placed panel has a table binding (creation
    /// requires one by type — [`ViewerConfigInitial`]), so the saved
    /// config carries it unconditionally.
    pub table: String,

    /// Selected theme NAME (e.g. `"Pro Dark"`) — not a CSS value. Valid
    /// names are the Perspective themes loaded on the page, which
    /// `resetThemes()` re-scans. `None` selects the first available.
    pub theme: Option<String>,

    /// Panel title, shown in its tab. `None` renders the default title.
    pub title: Option<String>,

    #[serde(flatten)]
    pub view_config: ViewConfig,
}

impl<V: TS> Deref for ViewerConfig<V> {
    type Target = PanelViewerConfig<V>;

    fn deref(&self) -> &Self::Target {
        &self.panel
    }
}

pub static API_VERSION: LazyLock<&'static str> = LazyLock::new(|| {
    #[derive(Deserialize)]
    struct Package {
        version: &'static str,
    }
    let pkg: &'static str = include_str!("../../../package.json");
    let pkg: Package = serde_json::from_str(pkg).unwrap();
    pkg.version
});

impl ViewerConfig {
    /// Encode a `ViewerConfig` to a `JsValue` in a supported type.
    pub fn encode(&self) -> ApiResult<JsValue> {
        Ok(JsValue::from_serde_ext(self)?)
    }
}

#[derive(Clone, Debug, TS, Deserialize, PartialEq, Serialize)]
#[serde(transparent)]
pub struct PluginConfig(serde_json::Value);

impl Deref for PluginConfig {
    type Target = Value;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct ViewerConfigUpdate {
    /// The `@perspective-dev/viewer` version a saved config was written
    /// by, used to migrate older tokens. Omit it — the viewer stamps
    /// the current version on save.
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

    /// Name of the `Table` to render, as hosted on this panel's
    /// `Client`. Rebinding an existing panel to another table keeps the
    /// rest of the config, so column names that do not exist in the new
    /// table will fail validation.
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

    #[serde(flatten)]
    pub view_config: ViewConfigUpdate,
}

impl ViewerConfigUpdate {
    /// Decode a `JsValue` into a `ViewerConfigUpdate` by auto-detecting format
    /// from JavaScript type.
    pub fn decode(update: &JsValue) -> ApiResult<Self> {
        Ok(update.into_serde_ext()?)
    }

    pub fn migrate(&self) -> ApiResult<Self> {
        // TODO: Call the migrate script from js
        Ok(self.clone())
    }
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
    #[ts(optional)]
    pub title: Option<String>,

    /// Theme NAME (e.g. `"Pro Dark"`) — not a CSS value. Valid names are
    /// the Perspective themes loaded on the page. Absent uses the
    /// default.
    #[ts(optional)]
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

    #[serde(flatten)]
    pub view_config: ViewConfigUpdate,
}

impl ViewerConfigInitial {
    /// Decode a `JsValue` by auto-detecting format from JavaScript type.
    pub fn decode(config: &JsValue) -> ApiResult<Self> {
        Ok(config.into_serde_ext()?)
    }

    /// A default-config panel bound to `table` (the "New panel" menus).
    /// Exhaustive on purpose — same drift alarm as the `From` impl below.
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
        }
    }
}

fn up<T: Clone>(value: Option<T>) -> OptionalUpdate<T> {
    match value {
        Some(value) => OptionalUpdate::Update(value),
        None => OptionalUpdate::Missing,
    }
}

// Constructed EXHAUSTIVELY on purpose: a field added to
// `ViewerConfigUpdate` breaks this impl at compile time, forcing the
// "should creation carry it?" decision (the drift alarm).
impl From<ViewerConfigInitial> for ViewerConfigUpdate {
    fn from(value: ViewerConfigInitial) -> Self {
        ViewerConfigUpdate {
            version: up(value.version),
            plugin: up(value.plugin),
            title: up(value.title),
            table: OptionalUpdate::Update(value.table),
            theme: up(value.theme),
            settings: OptionalUpdate::Missing,
            plugin_config: up(value.plugin_config),
            columns_config: up(value.columns_config),
            view_config: value.view_config,
        }
    }
}

/// The rejection every panel-creating route without a `table` resolves to.
pub const CREATE_REQUIRES_TABLE: &str = "Cannot create a panel without a `table` — `load()` a \
                                         `Client` and include `table` in the config, or use \
                                         `addPanel()`";

fn down<T: Clone>(value: OptionalUpdate<T>) -> Option<T> {
    match value {
        OptionalUpdate::Update(value) => Some(value),
        OptionalUpdate::Missing | OptionalUpdate::SetDefault => None,
    }
}

impl TryFrom<ViewerConfigUpdate> for ViewerConfigInitial {
    type Error = ApiError;

    fn try_from(value: ViewerConfigUpdate) -> Result<Self, Self::Error> {
        // Exhaustive (no `..`) on purpose — the same drift alarm as the
        // `From<ViewerConfigInitial>` impl above. `settings` is element-level
        // state, stripped by `restore()` before resolution; discarded here.
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
        } = value;

        let OptionalUpdate::Update(table) = table else {
            return Err(ApiError::new(CREATE_REQUIRES_TABLE));
        };

        Ok(Self {
            table,
            version: down(version),
            plugin: down(plugin),
            title: down(title),
            theme: down(theme),
            plugin_config: down(plugin_config),
            columns_config: down(columns_config),
            view_config,
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

#[derive(Clone, Debug, Serialize, PartialEq, TS)]
#[serde(untagged)]
// #[ts(untagged)]
pub enum OptionalUpdate<T: Clone> {
    #[ts(skip)]
    SetDefault,

    // #[ts(skip)]
    // #[ts(type = "undefined")]
    Missing,

    // #[ts(type = "_")]
    // #[ts(untagged)]
    Update(T),
}

pub type PluginUpdate = OptionalUpdate<String>;
pub type SettingsUpdate = OptionalUpdate<bool>;
pub type ThemeUpdate = OptionalUpdate<String>;
pub type TitleUpdate = OptionalUpdate<String>;
pub type TableUpdate = OptionalUpdate<String>;
pub type VersionUpdate = OptionalUpdate<String>;
pub type ColumnConfigUpdate = OptionalUpdate<ColumnConfigMap>;
pub type PluginConfigUpdate = OptionalUpdate<serde_json::Map<String, Value>>;

/// Handles `{}` when included as a field with `#[serde(default)]`.
impl<T: Clone> Default for OptionalUpdate<T> {
    fn default() -> Self {
        Self::Missing
    }
}

/// Handles `{plugin: null}` and `{plugin: val}` by treating this type as an
/// option.
impl<T: Clone> From<Option<T>> for OptionalUpdate<T> {
    fn from(opt: Option<T>) -> Self {
        match opt {
            Some(v) => Self::Update(v),
            None => Self::SetDefault,
        }
    }
}

/// Treats `PluginUpdate` enum as an `Option<T>` when present during
/// deserialization.
impl<'a, T> Deserialize<'a> for OptionalUpdate<T>
where
    T: Deserialize<'a> + Clone,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'a>,
    {
        Option::deserialize(deserializer).map(Into::into)
    }
}
