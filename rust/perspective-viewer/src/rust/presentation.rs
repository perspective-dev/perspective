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
mod sheets;

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::ops::Deref;
use std::rc::Rc;

use async_lock::Mutex;
use perspective_js::utils::{ApiFuture, ApiResult};
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;

pub use self::column_locator::{ColumnLocator, ColumnSettingsTab, ColumnTab, OpenColumnSettings};
use crate::config::{ColumnConfigUpdate, ColumnConfigValueUpdate, ColumnConfigValues};
use crate::utils::*;

pub type ColumnConfigMap = HashMap<String, ColumnConfigValues>;

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
    pub settings_open_changed: PubSub<bool>,
    pub settings_before_open_changed: PubSub<bool>,
    pub column_settings_open_changed: PubSub<(bool, Option<String>)>,
    pub column_settings_updated: PubSub<JsValue>,
    pub theme_config_updated: PubSub<(Rc<Vec<String>>, Option<usize>)>,
    pub visibility_changed: PubSub<bool>,
    pub on_eject: PubSub<()>,
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
            column_settings_updated: Default::default(),
            columns_config: Default::default(),
            is_settings_open: Default::default(),
            open_column_settings: Default::default(),
            theme_config_updated: PubSub::default(),
            on_eject: PubSub::default(),
            visibility_changed: PubSub::default(),
        }));

        ApiFuture::spawn(theme.clone().init());
        theme
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
    pub async fn get_available_themes(&self) -> ApiResult<Rc<Vec<String>>> {
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

    pub async fn get_selected_theme_config(&self) -> ApiResult<(Rc<Vec<String>>, Option<usize>)> {
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

    /// Gets a clone of the ColumnConfig for the given column name.
    pub fn get_columns_config(&self, column_name: &str) -> Option<ColumnConfigValues> {
        self.columns_config.borrow().get(column_name).cloned()
    }

    /// Updates the entire column config struct. (like from a restore() call)
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

    pub fn update_columns_config_value(
        &self,
        column_name: String,
        update: ColumnConfigValueUpdate,
    ) {
        let mut config = self.columns_config.borrow_mut();
        let value = config.remove(&column_name).unwrap_or_default();
        let update = value.update(update);
        if !update.is_empty() {
            config.insert(column_name, update);
        }
    }
}
