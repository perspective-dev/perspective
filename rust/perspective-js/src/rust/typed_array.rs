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

use std::io::Cursor;

use arrow_array::Array as _;
use arrow_array::cast::AsArray;
use arrow_array::types::*;
use arrow_ipc::reader::StreamReader;
use arrow_schema::{DataType, TimeUnit};
use js_sys::{Array, Function, JsString, Uint8Array};
use perspective_client::ViewWindow;
use ts_rs::TS;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(typescript_type = "TypedArrayWindow")]
    #[derive(Clone)]
    pub type JsTypedArrayWindow;
}

/// Options for `with_typed_arrays`, extending `ViewWindow` with
/// typed-array-specific options.
#[derive(Default, serde::Deserialize, TS)]
pub struct TypedArrayWindow {
    #[serde(flatten)]
    pub view_window: ViewWindow,

    /// When `true`, Float64/Date32/Timestamp columns are output as
    /// `Float32Array` instead of `Float64Array`.
    #[serde(default)]
    pub float32: bool,
}

impl From<TypedArrayWindow> for ViewWindow {
    fn from(w: TypedArrayWindow) -> Self {
        w.view_window
    }
}

/// Decode an Arrow IPC batch and call `callback` once with all columns.
///
/// Callback signature:
/// ```js
/// callback(names: string[], values: TypedArray[], validities: (Uint8Array|null)[], dictionaries: (string[]|null)[]) => void | Promise<void>
/// ```
///
/// If the callback returns a `Promise`, it is awaited before the Arrow
/// batch (and therefore the zero-copy typed-array views into it) is
/// dropped. A synchronous callback returning `undefined` is supported
/// with no promise-handling overhead.
pub(crate) async fn decode_and_call(
    arrow: &[u8],
    float32: bool,
    callback: &Function,
) -> Result<(), JsValue> {
    let cursor = Cursor::new(arrow);
    let reader = StreamReader::try_new(cursor, None)
        .map_err(|e| JsValue::from_str(&format!("Arrow decode error: {e}")))?;

    let batch = reader
        .into_iter()
        .next()
        .ok_or_else(|| JsValue::from_str("Arrow IPC contained no record batches"))?
        .map_err(|e| JsValue::from_str(&format!("Arrow batch error: {e}")))?;

    let schema = batch.schema();
    let num_cols = batch.num_columns();

    let js_names = Array::new_with_length(num_cols as u32);
    let js_values = Array::new_with_length(num_cols as u32);
    let js_validities = Array::new_with_length(num_cols as u32);
    let js_dicts = Array::new_with_length(num_cols as u32);

    // Storage for allocated conversion buffers. These MUST outlive the
    // callback because `js_sys::*Array::view()` creates zero-copy views
    // into their heap memory. Using `Box<[T]>` (rather than `Vec<T>`)
    // yields a stable pointer that won't move when the outer Vec grows.
    let mut f32_storage: Vec<Box<[f32]>> = Vec::new();
    let mut f64_storage: Vec<Box<[f64]>> = Vec::new();

    for col_idx in 0..num_cols {
        let field = schema.field(col_idx);
        let col = batch.column(col_idx);
        let validity = col.nulls().map(|nulls| nulls.validity());

        js_names.set(col_idx as u32, JsString::from(field.name().as_str()).into());

        match col.data_type() {
            DataType::UInt32 => {
                let vals = col.as_primitive::<UInt32Type>().values();
                let arr = unsafe { js_sys::Uint32Array::view(vals.as_ref()) };
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Int32 => {
                let vals = col.as_primitive::<Int32Type>().values();
                let arr = unsafe { js_sys::Int32Array::view(vals.as_ref()) };
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Float32 => {
                let vals = col.as_primitive::<Float32Type>().values();
                let arr = unsafe { js_sys::Float32Array::view(vals.as_ref()) };
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Float64 => {
                if float32 {
                    let vals = col.as_primitive::<Float64Type>().values();
                    f32_storage.push(vals.iter().map(|&v| v as f32).collect());
                } else {
                    let vals = col.as_primitive::<Float64Type>().values();
                    let arr = unsafe { js_sys::Float64Array::view(vals.as_ref()) };
                    js_values.set(col_idx as u32, arr.into());
                }
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Date32 => {
                let typed = col.as_primitive::<Date32Type>();
                if float32 {
                    f32_storage.push(
                        typed
                            .values()
                            .iter()
                            .map(|&v| v as f32 * 86_400_000.0)
                            .collect(),
                    );
                } else {
                    f64_storage.push(
                        typed
                            .values()
                            .iter()
                            .map(|&v| v as f64 * 86_400_000.0)
                            .collect(),
                    );
                }
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Timestamp(TimeUnit::Millisecond, _) => {
                let typed = col.as_primitive::<TimestampMillisecondType>();
                if float32 {
                    f32_storage.push(typed.values().iter().map(|&v| v as f32).collect());
                } else {
                    f64_storage.push(typed.values().iter().map(|&v| v as f64).collect());
                }
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Int64 => {
                let typed = col.as_primitive::<Int64Type>();
                if float32 {
                    f32_storage.push(typed.values().iter().map(|&v| v as f32).collect());
                } else {
                    f64_storage.push(typed.values().iter().map(|&v| v as f64).collect());
                }
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Dictionary(..) => {
                let dict = col.as_dictionary::<Int32Type>();
                let keys = dict.keys();
                let arr = unsafe { js_sys::Int32Array::view(keys.values().as_ref()) };
                js_values.set(col_idx as u32, arr.into());

                let values = dict.values().as_string::<i32>();
                let js_dict = Array::new_with_length(values.len() as u32);
                for i in 0..values.len() {
                    js_dict.set(i as u32, JsValue::from_str(values.value(i)));
                }
                js_dicts.set(col_idx as u32, js_dict.into());
            },
            dt => {
                return Err(JsValue::from_str(&format!(
                    "Unsupported column type for typed array: {dt}"
                )));
            },
        }

        // SAFETY: Validity bitmap is owned by `batch` which outlives the
        // callback — safe to view zero-copy.
        let js_validity = validity.map(|v| unsafe { Uint8Array::view(v) });
        js_validities.set(
            col_idx as u32,
            js_validity
                .as_ref()
                .map(JsValue::from)
                .unwrap_or(JsValue::NULL),
        );
    }

    // Second pass: fill in value views for columns backed by f32_storage /
    // f64_storage. The Box<[T]> buffers are heap-allocated and stable; their
    // data pointers remain valid even as the outer Vec grows.
    let mut f32_idx = 0;
    let mut f64_idx = 0;
    for col_idx in 0..num_cols {
        let col = batch.column(col_idx);
        let uses_f32_storage = matches!(
            (col.data_type(), float32),
            (DataType::Float64, true)
                | (DataType::Date32, true)
                | (DataType::Timestamp(TimeUnit::Millisecond, _), true)
                | (DataType::Int64, true),
        );
        let uses_f64_storage = matches!(
            (col.data_type(), float32),
            (DataType::Date32, false)
                | (DataType::Timestamp(TimeUnit::Millisecond, _), false)
                | (DataType::Int64, false),
        );

        if uses_f32_storage {
            let arr = unsafe { js_sys::Float32Array::view(&f32_storage[f32_idx]) };
            js_values.set(col_idx as u32, arr.into());
            f32_idx += 1;
        } else if uses_f64_storage {
            let arr = unsafe { js_sys::Float64Array::view(&f64_storage[f64_idx]) };
            js_values.set(col_idx as u32, arr.into());
            f64_idx += 1;
        }
    }

    let ret = callback.call4(
        &JsValue::UNDEFINED,
        &js_names.into(),
        &js_values.into(),
        &js_validities.into(),
        &js_dicts.into(),
    )?;

    // If the callback returned a Promise, await it before releasing the
    // batch — zero-copy TypedArray views into `batch`/`f32_storage`/
    // `f64_storage` must remain valid for the full lifetime of the
    // awaited work.
    if ret.is_instance_of::<js_sys::Promise>() {
        let promise: js_sys::Promise = ret.unchecked_into();
        wasm_bindgen_futures::JsFuture::from(promise).await?;
    }

    // Keep storage alive until after the callback (and its awaited
    // promise, if any) returns.
    drop(f32_storage);
    drop(f64_storage);

    Ok(())
}
