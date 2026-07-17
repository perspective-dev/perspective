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

use wasm_bindgen::prelude::*;

use crate::utils::*;
use crate::*;

/// The `<perspective-viewer-plugin>` element.
///
/// The default perspective plugin which is registered and activated
/// automcatically when a `<perspective-viewer>` is loaded without plugins.
/// While you will not typically instantiate this class directly, it is simple
/// enough to function as a good "default" plugin implementation which can be
/// extended to create custom plugins.
///
/// # Example
/// ```javascript
/// class MyPlugin extends customElements.get("perspective-viewer-plugin") {
///    // Custom plugin overrides
/// }
/// ```
#[wasm_bindgen]
pub struct PerspectiveDebugPluginElement {
    elem: web_sys::HtmlElement,
}

impl CustomElementMetadata for PerspectiveDebugPluginElement {
    const CUSTOM_ELEMENT_NAME: &'static str = "perspective-viewer-plugin";
}

#[wasm_bindgen]
impl PerspectiveDebugPluginElement {
    #[wasm_bindgen(constructor)]
    pub fn new(elem: web_sys::HtmlElement) -> Self {
        Self { elem }
    }

    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        "Debug".to_owned()
    }

    #[wasm_bindgen(getter)]
    pub fn select_mode(&self) -> String {
        "select".to_owned()
    }

    #[wasm_bindgen(getter)]
    pub fn min_config_columns(&self) -> JsValue {
        JsValue::UNDEFINED
    }

    #[wasm_bindgen(getter)]
    pub fn config_column_names(&self) -> JsValue {
        JsValue::UNDEFINED
    }

    /// Delegates to `draw()` VIRTUALLY — through the JS element's `draw`
    /// property, never `self.draw(view)` (Rust static dispatch). This
    /// element is the documented base class for custom plugins
    /// (`class MyPlugin extends
    /// customElements.get("perspective-viewer-plugin")`), whose contract is
    /// "`update()` defaults to dispatch to `draw()`" — a
    /// subclass overriding only `draw` must receive `update`-path repaints
    /// (`BindDisposition::Unchanged`/`Adopted` runs,
    /// `PLUGIN_DRAW_INVARIANT_PLAN.md`); the static call bypassed the
    /// override and repainted the Debug CSV instead (the
    /// `view_lifecycle.spec` regression).
    pub fn update(&self, view: &perspective_js::View) -> ApiFuture<()> {
        clone!(self.elem, view);
        ApiFuture::new(async move {
            let draw = js_sys::Reflect::get(&elem, &JsValue::from_str("draw"))?
                .dyn_into::<js_sys::Function>()?;

            let task = draw.call1(&elem, &JsValue::from(view))?;
            wasm_bindgen_futures::JsFuture::from(js_sys::Promise::resolve(&task)).await?;
            Ok(())
        })
    }

    /// # Notes
    ///
    /// When you pass a `wasm_bindgen` wrapped type _into_ Rust, it acts like a
    /// move. Ergo, if you replace the `&` in the `view` argument, the JS copy
    /// of the `View` will be invalid
    pub fn draw(&self, view: &perspective_js::View) -> ApiFuture<()> {
        let css = "margin:0;overflow:scroll;position:absolute;width:100%;height:100%";
        clone!(self.elem, view);
        ApiFuture::new(async move {
            let csv = view.to_csv(None).await?;
            elem.style().set_property("background-color", "#fff")?;
            elem.set_inner_html(&format!("<pre style='{css}'>{csv}</pre>"));
            Ok(())
        })
    }

    pub fn clear(&self) -> ApiFuture<()> {
        ApiFuture::default()
    }

    pub fn resize(&self) -> ApiFuture<()> {
        ApiFuture::default()
    }

    pub fn restyle(&self) {}

    pub fn save(&self) -> ApiResult<JsValue> {
        Ok(JsValue::null())
    }

    pub fn restore(&self, _config: Option<JsValue>) -> ApiResult<()> {
        Ok(())
    }

    pub fn delete(&self) -> ApiFuture<()> {
        ApiFuture::default()
    }

    #[wasm_bindgen(js_name = "connectedCallback")]
    pub fn connected_callback(&self) {}
}
