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

use perspective::utils::ApiResult;

pub trait AsBlob {
    /// Standardized conversions from common `wasm_bindgen` types to
    /// `js_sys::Blob`, which is commonly necessary to provide data to a
    /// download or clipboard action.
    fn as_blob(&self) -> ApiResult<web_sys::Blob>;
}

impl AsBlob for js_sys::ArrayBuffer {
    fn as_blob(&self) -> ApiResult<web_sys::Blob> {
        let array = std::iter::once(js_sys::Uint8Array::new(self)).collect::<js_sys::Array>();
        Ok(web_sys::Blob::new_with_u8_array_sequence(&array)?)
    }
}

impl AsBlob for js_sys::JsString {
    fn as_blob(&self) -> ApiResult<web_sys::Blob> {
        let array = std::iter::once(self).collect::<js_sys::Array>();
        let mut options = web_sys::BlobPropertyBag::new();
        options.type_("text/plain");
        Ok(web_sys::Blob::new_with_str_sequence_and_options(
            &array, &options,
        )?)
    }
}

impl AsBlob for js_sys::Object {
    fn as_blob(&self) -> ApiResult<web_sys::Blob> {
        let array = std::iter::once(js_sys::JSON::stringify(self)?).collect::<js_sys::Array>();
        let mut options = web_sys::BlobPropertyBag::new();
        options.type_("text/plain");
        Ok(web_sys::Blob::new_with_str_sequence_and_options(
            &array, &options,
        )?)
    }
}
