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

mod column_locator;
mod props;
mod sheets;

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::ops::Deref;
use std::rc::Rc;

use async_lock::Mutex;
use perspective_js::utils::{ApiFuture, ApiResult};
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

pub use self::column_locator::{ColumnLocator, ColumnSettingsTab, ColumnTab, OpenColumnSettings};
pub use self::props::PresentationProps;
use crate::config::{ColumnConfigFieldUpdate, ColumnConfigUpdate};
use crate::utils::*;

/// A per-column config map, opaque from the viewer's perspective. Each
/// inner [`serde_json::Map`] is a flat collection of plugin-defined JSON
/// keys whose shape is dictated by the active plugin's
/// [`crate::config::ColumnConfigSchema`]. Foreign keys (left over from a
/// previous plugin) coexist as ghost state and are filtered out at the
/// `plugin.restore()` boundary.
pub type ColumnConfigMap = HashMap<String, serde_json::Map<String, serde_json::Value>>;

/// The available themes as detected in the browser environment or set
/// explicitly when CORS prevents detection.  Detection is expensive and
/// typically must be performed only once, when `document.styleSheets` is
/// up-to-date.
#[derive(Default)]
struct ThemeData {
    themes: Option<Vec<String>>,
}

/// Actual presentations tate struct with some fields hidden.
pub struct PresentationHandle {
    viewer_elem: HtmlElement,
    theme_data: Mutex<ThemeData>,
    is_settings_open: RefCell<bool>,
    open_column_settings: RefCell<OpenColumnSettings>,
    columns_config: RefCell<ColumnConfigMap>,
    is_workspace: RefCell<Option<bool>>,

    /// Per-element dedup cell for `perspective-config-update` event
    /// dispatch. Read+written by `crate::custom_events::dispatch_*`
    /// helpers; living here means every consumer with a `&Presentation`
    /// (subscriptions in `wire_custom_events`, `tasks::send_plugin_config`,
    /// `setSelection`) sees the same cache without separate plumbing.
    pub last_dispatched_config: RefCell<Option<crate::config::ViewerConfig>>,

    pub settings_open_changed: PubSub<bool>,

    /// Injected callback from the root component, replacing the former
    /// `is_workspace_changed: PubSub` field.
    pub on_is_workspace_changed: RefCell<Option<Callback<bool>>>,
    pub settings_before_open_changed: PubSub<bool>,
    pub column_settings_open_changed: PubSub<(bool, Option<String>)>,
    pub theme_config_updated: PubSub<(PtrEqRc<Vec<String>>, Option<usize>)>,
    pub on_eject: PubSub<()>,

    /// Fires after `tasks::send_plugin_config` applies a column-config edit
    /// from a sidebar control. Subscribers receive the post-update
    /// [`ColumnConfigMap`]; `wire_custom_events` is the only listener and
    /// fans this out as the `perspective-column-style-change` `CustomEvent`.
    pub column_style_changed: PubSub<ColumnConfigMap>,

    /// Fires for status-bar / main-panel pointer events that target the
    /// statusbar element. `wire_custom_events` formats the `PointerEvent`'s
    /// `type_()` into a `perspective-statusbar-{type}` `CustomEvent` name.
    pub statusbar_pointer_event: PubSub<PointerEvent>,
}

/// State object responsible for the non-persistable/gui element state,
/// including Themes, panel open state and realtive size, title, etc.
#[derive(Clone)]
pub struct Presentation(Rc<PresentationHandle>);

impl PartialEq for Presentation {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

impl Deref for Presentation {
    type Target = PresentationHandle;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl ImplicitClone for Presentation {}

impl Presentation {
    pub fn new(elem: &HtmlElement) -> Self {
        let theme = Self(Rc::new(PresentationHandle {
            viewer_elem: elem.clone(),
            theme_data: Default::default(),
            is_workspace: Default::default(),
            settings_open_changed: Default::default(),
            settings_before_open_changed: Default::default(),
            column_settings_open_changed: Default::default(),
            on_is_workspace_changed: Default::default(),
            columns_config: Default::default(),
            is_settings_open: Default::default(),
            open_column_settings: Default::default(),
            theme_config_updated: PubSub::default(),
            on_eject: PubSub::default(),
            column_style_changed: PubSub::default(),
            statusbar_pointer_event: PubSub::default(),
            last_dispatched_config: Default::default(),
        }));

        ApiFuture::spawn(theme.clone().init());
        theme
    }

    pub fn viewer_elem(&self) -> &HtmlElement {
        &self.viewer_elem
    }

    pub fn is_visible(&self) -> bool {
        self.viewer_elem
            .offset_parent()
            .map(|x| !x.is_null())
            .unwrap_or(false)
    }

    pub fn is_active(&self, elem: &Option<Element>) -> bool {
        elem.is_some() && &self.viewer_elem.shadow_root().unwrap().active_element() == elem
    }

    pub fn reset_attached(&self) {
        *self.0.is_workspace.borrow_mut() = None;
        if let Some(cb) = self.on_is_workspace_changed.borrow().as_ref() {
            cb.emit(self.get_is_workspace());
        }
    }

    pub fn get_is_workspace(&self) -> bool {
        if self.is_workspace.borrow().is_none() {
            if !self.viewer_elem.is_connected() {
                return false;
            }

            let is_workspace = self
                .viewer_elem
                .parent_element()
                .map(|x| x.tag_name() == "PERSPECTIVE-WORKSPACE")
                .unwrap_or_default();

            *self.is_workspace.borrow_mut() = Some(is_workspace);
        }

        self.is_workspace.borrow().unwrap()
    }

    pub fn set_settings_attribute(&self, opt: bool) {
        self.viewer_elem
            .toggle_attribute_with_force("settings", opt)
            .unwrap();
    }

    pub fn is_settings_open(&self) -> bool {
        *self.is_settings_open.borrow()
    }

    pub fn set_settings_before_open(&self, open: bool) {
        if *self.is_settings_open.borrow() != open {
            *self.is_settings_open.borrow_mut() = open;
            self.set_settings_attribute(open);
            self.settings_before_open_changed.emit(open);
        }
    }

    pub fn set_settings_open(&self, open: bool) {
        self.settings_open_changed.emit(open);
    }

    /// Sets the currently opened column settings. Emits an internal event on
    /// change. Passing None is a shorthand for setting all fields to
    /// None.
    pub fn set_open_column_settings(&self, settings: Option<OpenColumnSettings>) {
        let settings = settings.unwrap_or_default();
        if *(self.open_column_settings.borrow()) != settings {
            settings.clone_into(&mut *self.open_column_settings.borrow_mut());
            self.column_settings_open_changed
                .emit((true, settings.name()));
        }
    }

    /// Gets a clone of the current OpenColumnSettings.
    pub fn get_open_column_settings(&self) -> OpenColumnSettings {
        self.open_column_settings.borrow().deref().clone()
    }

    async fn init(self) -> ApiResult<()> {
        self.set_theme_attribute(self.get_selected_theme_name().await.as_deref())
    }

    /// Get the available theme names from the browser environment by parsing
    /// readable stylesheets.  This method is memoized - the state can be
    /// flushed by calling `reset()`.
    pub async fn get_available_themes(&self) -> ApiResult<PtrEqRc<Vec<String>>> {
        let mut data = self.0.theme_data.lock().await;
        if data.themes.is_none() {
            await_dom_loaded().await?;
            let themes = sheets::get_theme_names(&self.0.viewer_elem)?;
            data.themes = Some(themes);
        }

        Ok(data.themes.clone().unwrap().into())
    }

    /// Reset the state.  `styleSheets` will be re-parsed next time
    /// `get_themes()` is called if the `themes` argument is `None`.
    ///
    /// # Returns
    /// A `bool` indicating whether the internal state changed.
    pub async fn reset_available_themes(&self, themes: Option<Vec<String>>) -> bool {
        fn as_set(x: &Option<Vec<String>>) -> HashSet<&'_ String> {
            x.as_ref()
                .map(|x| x.iter().collect::<HashSet<_>>())
                .unwrap_or_default()
        }

        let mut mutex = self.0.theme_data.lock().await;
        let changed = as_set(&mutex.themes) != as_set(&themes);
        mutex.themes = themes;
        changed
    }

    pub async fn get_selected_theme_config(
        &self,
    ) -> ApiResult<(PtrEqRc<Vec<String>>, Option<usize>)> {
        let themes = self.get_available_themes().await?;
        let name = self.0.viewer_elem.get_attribute("theme");
        let index = name
            .and_then(|x| themes.iter().position(|y| y == &x))
            .or(if !themes.is_empty() { Some(0) } else { None });

        Ok((themes, index))
    }

    /// Returns the currently applied theme, or the default theme if no theme
    /// has been set and themes are detected in the `document`, or `None` if
    /// no themes are available.
    pub async fn get_selected_theme_name(&self) -> Option<String> {
        let (themes, index) = self.get_selected_theme_config().await.ok()?;
        index.and_then(|x| themes.get(x).cloned())
    }

    fn set_theme_attribute(&self, theme: Option<&str>) -> ApiResult<()> {
        if let Some(theme) = theme {
            Ok(self.0.viewer_elem.set_attribute("theme", theme)?)
        } else {
            Ok(self.0.viewer_elem.remove_attribute("theme")?)
        }
    }

    pub async fn reset_theme(&self) -> ApiResult<()> {
        *self.0.is_workspace.borrow_mut() = None;
        let themes = self.get_available_themes().await?;
        let default_theme = themes.first().map(|x| x.as_str());
        self.set_theme_name(default_theme).await?;
        Ok(())
    }

    /// Set the theme by name, or `None` for the default theme.
    ///
    /// # Returns
    /// A `bool` indicating whether the internal state changed.
    pub async fn set_theme_name(&self, theme: Option<&str>) -> ApiResult<bool> {
        let (themes, selected) = self.get_selected_theme_config().await?;
        if let Some(x) = selected
            && themes.get(x).map(|x| x.as_str()) == theme
        {
            return Ok(false);
        }

        let index = if let Some(theme) = theme {
            self.set_theme_attribute(Some(theme))?;
            themes.iter().position(|x| x == theme)
        } else if !themes.is_empty() {
            self.set_theme_attribute(themes.first().map(|x| x.as_str()))?;
            Some(0)
        } else {
            self.set_theme_attribute(None)?;
            None
        };

        self.theme_config_updated.emit((themes, index));
        Ok(true)
    }

    /// Returns an owned copy of the curent column configuration map.
    pub fn all_columns_configs(&self) -> ColumnConfigMap {
        self.columns_config.borrow().clone()
    }

    pub fn reset_columns_configs(&self) {
        *self.columns_config.borrow_mut() = ColumnConfigMap::new();
    }

    /// Gets a clone of the raw column-config JSON map for the given
    /// column name. Returns `None` if the column has no stored
    /// configuration.
    pub fn get_columns_config(
        &self,
        column_name: &str,
    ) -> Option<serde_json::Map<String, serde_json::Value>> {
        self.columns_config.borrow().get(column_name).cloned()
    }

    /// Updates the entire column config map (e.g. from a `restore()`
    /// call). The replacement map is opaque; foreign keys persist as
    /// ghost state for plugins to ignore.
    pub fn update_columns_configs(&self, update: ColumnConfigUpdate) {
        match update {
            crate::config::OptionalUpdate::SetDefault => {
                let mut config = self.columns_config.borrow_mut();
                *config = HashMap::default()
            },
            crate::config::OptionalUpdate::Missing => {},
            crate::config::OptionalUpdate::Update(update) => {
                for (col_name, new_config) in update.into_iter() {
                    self.columns_config
                        .borrow_mut()
                        .insert(col_name, new_config);
                }
            },
        }
    }

    /// Apply a single schema-field update from the UI: clear all keys the
    /// field owns, then splice in the partial new sub-state. If the
    /// resulting column entry is empty, drop it from the map entirely.
    pub fn update_columns_config_field(
        &self,
        column_name: String,
        update: ColumnConfigFieldUpdate,
    ) {
        let mut config = self.columns_config.borrow_mut();
        let entry = config.entry(column_name.clone()).or_default();
        for k in &update.keys {
            entry.remove(k);
        }
        for (k, v) in update.value {
            if update.keys.contains(&k) {
                entry.insert(k, v);
            }
        }
        if entry.is_empty() {
            config.remove(&column_name);
        }
    }

    /// Snapshot the current presentation state as a [`PresentationProps`]
    /// value suitable for passing as a Yew prop.  Called by the root component
    /// whenever a presentation-related PubSub event fires.
    ///
    /// `available_themes` must be provided by the caller because theme
    /// detection is async and therefore not available synchronously here.
    pub fn to_props(&self, available_themes: PtrEqRc<Vec<String>>) -> PresentationProps {
        let theme_attr = self.0.viewer_elem.get_attribute("theme");
        let selected_theme = theme_attr.as_deref().and_then(|name| {
            available_themes
                .iter()
                .find(|x| x.as_str() == name)
                .cloned()
        });

        PresentationProps {
            is_settings_open: self.is_settings_open(),
            available_themes,
            selected_theme,
            open_column_settings: self.get_open_column_settings(),
            is_workspace: self.get_is_workspace(),
        }
    }
}
