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

use js_sys::{
    Array, Float32Array, Float64Array, Function, Int32Array, JsString, Promise, Uint8Array,
    Uint32Array,
};
use perspective_client::{TypedArrayColumn, TypedArrayValues};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::utils::ApiResult;

#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(typescript_type = "TypedArrayWindow")]
    #[derive(Clone)]
    pub type JsTypedArrayWindow;
}

#[wasm_bindgen(inline_js = "
    export function split_strings(text, ends) {
        const out = new Array(ends.length);
        let start = 0;
        for (let i = 0; i < ends.length; i++) {
            out[i] = text.substring(start, ends[i]);
            start = ends[i];
        }

        return out;
    }
")]
extern "C" {
    fn split_strings(text: &str, ends: &Uint32Array) -> Array;
}

/// Calls `callback` with zero-copy JS views of `columns`, awaiting a returned
/// `Promise` before the views are released.
pub(crate) async fn call_with_typed_arrays(
    columns: &[TypedArrayColumn],
    callback: &Function,
) -> ApiResult<()> {
    let names = Array::new();
    let values = Array::new();
    let validities = Array::new();
    let dictionaries = Array::new();
    for column in columns {
        names.push(&JsString::from(column.name.as_str()));
        values.push(&values_view(&column.values));
        validities.push(&column.validity.as_ref().map_or(JsValue::NULL, |validity| {
            unsafe { Uint8Array::view(validity.as_slice()) }.into()
        }));

        dictionaries.push(&dictionary(&column.values));
    }

    let ret = callback.call4(
        &JsValue::UNDEFINED,
        &names,
        &values,
        &validities,
        &dictionaries,
    )?;

    if let Some(promise) = ret.dyn_ref::<Promise>() {
        JsFuture::from(promise.clone()).await?;
    }

    Ok(())
}

fn values_view(values: &TypedArrayValues) -> JsValue {
    unsafe {
        match values {
            TypedArrayValues::Int32(values) => Int32Array::view(values).into(),
            TypedArrayValues::UInt32(values) => Uint32Array::view(values).into(),
            TypedArrayValues::Float32(values) => Float32Array::view(values).into(),
            TypedArrayValues::Float64(values) => Float64Array::view(values).into(),
            TypedArrayValues::Dictionary { keys, .. } => Int32Array::view(keys).into(),
        }
    }
}

/// The strings of a dictionary column as a JS `Array`, passed to JS as one
/// string and split there to avoid decoding each separately.
fn dictionary(values: &TypedArrayValues) -> JsValue {
    let TypedArrayValues::Dictionary { values, .. } = values else {
        return JsValue::NULL;
    };

    let mut text = String::with_capacity(values.iter().map(String::len).sum());
    let mut ends = Vec::with_capacity(values.len());
    let mut end = 0;
    for value in values {
        text.push_str(value);
        end += if value.is_ascii() {
            value.len() as u32
        } else {
            value.encode_utf16().count() as u32
        };

        ends.push(end);
    }

    split_strings(&text, &Uint32Array::from(ends.as_slice())).into()
}
