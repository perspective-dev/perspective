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

use wasm_bindgen::describe::WasmDescribe;

/// The `Promise<T>` TypeScript type an [`super::ApiFuture<T>`] is declared
/// as, carried by a `#[wasm_bindgen]` extern type whose `typescript_type`
/// names it (the wasm-bindgen descriptor interpreter runs no loops, so the
/// name must be a compile-time literal).
pub trait TsPromise {
    type Promise: WasmDescribe;
}

/// Declare the `Promise<T>` TypeScript type of each listed `ApiFuture<T>`
/// payload, e.g. `ts_promise! { View => JsViewPromise = "Promise<View>"; }`.
#[macro_export]
macro_rules! ts_promise {
    ($($t:ty => $alias:ident = $ts:literal;)*) => {$(
        #[::wasm_bindgen::prelude::wasm_bindgen]
        extern "C" {
            #[wasm_bindgen(typescript_type = $ts)]
            pub type $alias;
        }

        impl $crate::utils::TsPromise for $t {
            type Promise = $alias;
        }
    )*};
}

ts_promise! {
    () => JsVoidPromise = "Promise<void>";
    u32 => JsNumberPromise = "Promise<number>";
    String => JsStringPromise = "Promise<string>";
    Vec<u8> => JsUint8ArrayPromise = "Promise<Uint8Array>";
    Vec<String> => JsStringArrayPromise = "Promise<string[]>";
    crate::Client => JsClientPromise = "Promise<Client>";
    crate::Table => JsTablePromise = "Promise<Table>";
    crate::View => JsViewPromise = "Promise<View>";
    crate::JsResolvedViewConfig => JsResolvedViewConfigPromise = "Promise<ViewConfig>";
}
