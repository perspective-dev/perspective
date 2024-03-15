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

use perspective::utils::*;
use serde::*;
use wasm_bindgen::prelude::*;

use crate::presentation::ColumnConfigMap;

/// Perspective FFI
#[wasm_bindgen]
#[rustfmt::skip]
extern "C" {
    #[derive(Clone)]
    pub type JsPerspectiveViewerPlugin;

    #[wasm_bindgen(method, getter)]
    pub fn name(this: &JsPerspectiveViewerPlugin) -> String;

    #[wasm_bindgen(method, getter)]
    pub fn category(this: &JsPerspectiveViewerPlugin) -> Option<String>;

    #[wasm_bindgen(method, getter)]
    pub fn max_columns(this: &JsPerspectiveViewerPlugin) -> Option<usize>;

    #[wasm_bindgen(method, getter)]
    pub fn max_cells(this: &JsPerspectiveViewerPlugin) -> Option<usize>;

    // TODO This can be an internal property
    #[wasm_bindgen(method, getter)]
    pub fn render_warning(this: &JsPerspectiveViewerPlugin) -> Option<bool>;

    #[wasm_bindgen(method, setter)]
    pub fn set_render_warning(this: &JsPerspectiveViewerPlugin, val: bool);

    #[wasm_bindgen(method, getter)]
    pub fn select_mode(this: &JsPerspectiveViewerPlugin) -> JsValue;

    #[wasm_bindgen(method, getter)]
    pub fn min_config_columns(this: &JsPerspectiveViewerPlugin) -> Option<usize>;

    #[wasm_bindgen(method, getter)]
    pub fn config_column_names(this: &JsPerspectiveViewerPlugin) -> Option<js_sys::Array>;

    #[wasm_bindgen(method, getter)]
    pub fn priority(this: &JsPerspectiveViewerPlugin) -> Option<i32>;

    /// Don't call this method directly. Instead, call the corresponding method on the PluginColumnStyles model.
    #[wasm_bindgen(method, catch)]
    pub fn can_render_column_styles(this: &JsPerspectiveViewerPlugin, view_type: &str, group: Option<&str>) -> ApiResult<bool>;

    #[wasm_bindgen(method, catch)]
    pub fn column_style_controls(this: &JsPerspectiveViewerPlugin, view_type: &str, group: Option<&str>) -> ApiResult<JsValue>;

    #[wasm_bindgen(method)]
    pub fn save(this: &JsPerspectiveViewerPlugin) -> JsValue;

    #[wasm_bindgen(method, js_name=restore)]
    pub fn _restore(this: &JsPerspectiveViewerPlugin, token: &JsValue, columns_config: &JsValue);

    #[wasm_bindgen(method)]
    pub fn delete(this: &JsPerspectiveViewerPlugin);

    #[wasm_bindgen(method, catch)]
    pub async fn restyle(
        this: &JsPerspectiveViewerPlugin,
        view: perspective::JsView
    ) -> ApiResult<JsValue>;

    #[wasm_bindgen(method, catch)]
    pub async fn draw(
        this: &JsPerspectiveViewerPlugin,
        view: perspective::JsView,
        column_limit: Option<usize>,
        row_limit: Option<usize>,
        force: bool
    ) -> ApiResult<()>;

    #[wasm_bindgen(method, catch)]
    pub async fn update(
        this: &JsPerspectiveViewerPlugin,
        view: perspective::JsView,
        column_limit: Option<usize>,
        row_limit: Option<usize>,
        force: bool
    ) -> ApiResult<()>;

    #[wasm_bindgen(method, catch)]
    pub async fn clear(this: &JsPerspectiveViewerPlugin) -> ApiResult<JsValue>;

    #[wasm_bindgen(method, catch)]
    pub async fn resize(this: &JsPerspectiveViewerPlugin) -> ApiResult<JsValue>;

}

impl JsPerspectiveViewerPlugin {
    pub fn restore(&self, token: &JsValue, columns_config: Option<&ColumnConfigMap>) {
        let columns_config = JsValue::from_serde_ext(&columns_config).unwrap();
        self._restore(token, &columns_config)
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq)]
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

#[derive(Clone, Debug, Default)]
pub struct ViewConfigRequirements {
    pub min: Option<usize>,
    pub names: Option<Vec<String>>,
    pub mode: ColumnSelectMode,
    pub max_columns: Option<usize>,
    pub max_cells: Option<usize>,
    pub name: String,
    pub render_warning: bool,
}

impl ViewConfigRequirements {
    pub fn is_swap(&self, index: usize) -> bool {
        self.names
            .as_ref()
            .map(|x| index < x.len() - 1)
            .unwrap_or(false)
    }
}

impl JsPerspectiveViewerPlugin {
    pub fn get_requirements(&self) -> ApiResult<ViewConfigRequirements> {
        Ok(ViewConfigRequirements {
            min: self.min_config_columns(),
            mode: self.select_mode().into_serde_ext()?,
            names: self
                .config_column_names()
                .map(|x| x.into_serde_ext().unwrap()),
            max_columns: self.max_columns(),
            max_cells: self.max_cells(),
            name: self.name(),
            render_warning: self.render_warning().unwrap_or(true),
        })
    }
}
