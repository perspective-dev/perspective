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

    #[wasm_bindgen(method, js_name=restore, catch)]
    pub fn _restore(this: &JsPerspectiveViewerPlugin, token: &JsValue, columns_config: &JsValue) -> ApiResult<()>;

    #[wasm_bindgen(method)]
    pub fn delete(this: &JsPerspectiveViewerPlugin);

    #[wasm_bindgen(method)]
    pub fn restyle(
        this: &JsPerspectiveViewerPlugin,
    );

    #[wasm_bindgen(method, catch)]
    pub async fn render(
        this: &JsPerspectiveViewerPlugin,
        view: perspective_js::View,
        viewport: Option<JsViewWindow>,
    ) -> ApiResult<web_sys::Blob>;

    #[wasm_bindgen(method, catch)]
    pub async fn draw(
        this: &JsPerspectiveViewerPlugin,
        view: perspective_js::View,
        column_limit: Option<usize>,
        row_limit: Option<usize>,
        force: bool
    ) -> ApiResult<()>;

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

    #[wasm_bindgen(method, catch)]
    pub async fn resize(this: &JsPerspectiveViewerPlugin) -> ApiResult<JsValue>;

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
}
