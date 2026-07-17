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

//! Utilities for building JavaScript Custom Elements with Rust.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(inline_js = r#"
    export function bootstrap(psp, name, clsname, statics) {
        if (customElements.get(name)) {
            console.warn(`Custom element "${name}" is already registered; skipping duplicate registration (Perspective was loaded more than once on this page).`);
            return;
        }

        const cls = psp[clsname];
        const proto = cls.prototype;
        class x extends HTMLElement {
            constructor() {
                super();
                this._instance = new cls(this);
            }
        }

        const names = Object.getOwnPropertyNames(proto);
        for (const key of names) {
            if ('get' in Object.getOwnPropertyDescriptor(proto, key)) {
                Object.defineProperty(x.prototype, key, {
                    get: function() {
                        return this._instance[key];
                    }
                });
            } else {
                Object.defineProperty(x.prototype, key, {
                    value: function(...args) {
                        return this._instance[key].call(this._instance, ...args);
                    }
                });
            }
        }

        for (const key of statics) {
            Object.defineProperty(x, key, {
                value: function(...args) {
                    return psp[key].call(psp, ...args);
                }
            });
        }

        Object.defineProperty(x, '__wasm_module__', {
            get() {
                return psp;
            },
        });

        customElements.define(name, x);
    }
"#)]
extern "C" {
    #[wasm_bindgen(js_name = "bootstrap")]
    fn js_bootstrap(psp: &JsValue, name: &str, cls: &str, statics: js_sys::Array) -> JsValue;
}

/// A trait which allows the [`define_web_component`] method to create a
/// Custom Element (which must by definition inherit from `HTMLElement`) from
/// a `[wasm_bindgen]` annotated Rust struct (for which this trait is
/// implemented).
pub trait CustomElementMetadata {
    /// The name of the element to register.
    const CUSTOM_ELEMENT_NAME: &'static str;

    /// [optional] The names of the methods which should be static on the
    /// element.
    const STATICS: &'static [&'static str] = [].as_slice();

    /// [optional] The name of the Rust struct.
    const TYPE_NAME: &'static str = std::any::type_name::<Self>();

    /// [optional] A custom implementation of struct name to class name.
    #[must_use]
    fn struct_name() -> &'static str {
        match &Self::TYPE_NAME.rfind(':') {
            Some(pos) => &Self::TYPE_NAME[pos + 1..],
            None => Self::TYPE_NAME,
        }
    }
}

/// Register the Custom Element globally.
pub fn define_web_component<T: CustomElementMetadata>(module: &JsValue) {
    js_bootstrap(
        module,
        T::CUSTOM_ELEMENT_NAME,
        T::struct_name(),
        T::STATICS.iter().cloned().map(JsValue::from).collect(),
    );
}
