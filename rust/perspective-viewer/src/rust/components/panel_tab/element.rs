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

//! The `<perspective-viewer-tab>` custom element that hosts each
//! [`super::PanelTab`]'s ShadowRoot, and its shared stylesheet.

use std::cell::Cell;

use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;

#[wasm_bindgen(inline_js = r#"
    export function define_panel_tab(name) {
        if (!customElements.get(name)) {
            customElements.define(name, class extends HTMLElement {});
        }
    }
"#)]
extern "C" {
    #[wasm_bindgen(js_name = "define_panel_tab")]
    fn define_panel_tab(name: &str);
}

/// The tag the tab host is created as (a custom element, so it can own a
/// ShadowRoot for its contents).
pub(super) const TAB_TAG: &str = "perspective-viewer-tab";

thread_local! {
    /// Whether the `<perspective-viewer-tab>` custom element has been defined
    /// (once per page; WASM is single-threaded).
    static ELEMENT_DEFINED: Cell<bool> = const { Cell::new(false) };

    /// The shared, constructed stylesheet adopted into every tab's ShadowRoot.
    static TAB_SHEET: CssStyleSheet = {
        let sheet = CssStyleSheet::new().unwrap();
        // `tab-button.css` (the tab's icon buttons) goes FIRST so
        // `panel-tab.css` may still override it.
        sheet.replace_sync(concat!(
            include_str!("../../../css/tab-button.css"),
            include_str!("../../../css/panel-tab.css"),
        ))
            .unwrap();
        sheet
    };
}

/// Define the `<perspective-viewer-tab>` custom element once. It needs no
/// lifecycle callbacks — it exists only to own a ShadowRoot into which each
/// tab's contents are rendered (so the tab's structure CSS is encapsulated in
/// its `adoptedStyleSheets` rather than injected into `document.head`).
pub(super) fn ensure_custom_element() {
    ELEMENT_DEFINED.with(|defined| {
        if !defined.get() {
            define_panel_tab(TAB_TAG);
            defined.set(true);
        }
    });
}

/// Adopt the shared tab stylesheet into `shadow_root.adoptedStyleSheets`
/// (idempotent per root). Mirrors `StyleProvider`'s adopt-by-`Reflect`
/// approach.
pub(super) fn adopt_sheet(shadow_root: &Element) {
    let sheets = js_sys::Reflect::get(shadow_root.as_ref(), &"adoptedStyleSheets".into())
        .unwrap()
        .unchecked_into::<js_sys::Array>();

    TAB_SHEET.with(|sheet| {
        let sheet_val: &JsValue = sheet.as_ref();
        if sheets.index_of(sheet_val, 0) < 0 {
            sheets.push(sheet_val);
        }
    });
}
