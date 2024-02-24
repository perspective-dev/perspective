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

/// A macro for implementing the `wasm_bindgen` boilerplate for types which
/// implement `serde::{Serialize, Deserialize}`.
///
/// # Examples
///
/// ```
/// struct MyStruct { .. }
/// derive_wasm_abi!(MyStruct, FromWasmAbi);
///
/// #[wasm_bindgen]
/// pub fn process_my_struct(s: MyStruct) {}
/// ```
#[macro_export]
macro_rules! derive_wasm_abi {
    ($type:ty) => {
        impl wasm_bindgen::describe::WasmDescribe for $type {
            fn describe() {
                <js_sys::Object as wasm_bindgen::describe::WasmDescribe>::describe()
            }
        }
    };

    ($type:ty, FromWasmAbi $(, $symbols:tt)*) => {
        impl wasm_bindgen::convert::FromWasmAbi for $type {
            type Abi = <js_sys::Object as wasm_bindgen::convert::IntoWasmAbi>::Abi;
            #[inline]
            unsafe fn from_abi(js: Self::Abi) -> Self {
                let obj = js_sys::Object::from_abi(js);
                use ::perspective::utils::JsValueSerdeExt;
                JsValue::from(obj).into_serde_ext().unwrap()
            }
        }

        derive_wasm_abi!($type $(, $symbols)*);
    };

    ($type:ty, IntoWasmAbi $(, $symbols:tt)*) => {
        impl wasm_bindgen::convert::IntoWasmAbi for $type {
            type Abi = <js_sys::Object as wasm_bindgen::convert::IntoWasmAbi>::Abi;
            #[inline]
            fn into_abi(self) -> Self::Abi {
                use wasm_bindgen::JsCast;
                <wasm_bindgen::JsValue as ::perspective::utils::JsValueSerdeExt>::from_serde_ext(&self).unwrap().unchecked_into::<js_sys::Object>().into_abi()
            }
        }

        derive_wasm_abi!($type $(, $symbols)*);
    };
}
