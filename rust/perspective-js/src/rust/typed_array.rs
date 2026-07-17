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

use arrow_array::cast::AsArray;
use arrow_array::types::*;
use arrow_array::{Array as _, ArrowPrimitiveType, PrimitiveArray};
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

fn zero_invalid_slots<T: ArrowPrimitiveType>(arr: &PrimitiveArray<T>) {
    let Some(nulls) = arr.nulls() else { return };
    let ptr = arr.values().as_ptr() as *mut T::Native;
    let chunks = nulls.inner().bit_chunks();
    let mut base = 0;
    for chunk in chunks.iter() {
        if chunk != u64::MAX {
            for bit in 0..64 {
                if chunk & (1 << bit) == 0 {
                    unsafe { ptr.add(base + bit).write(T::default_value()) };
                }
            }
        }

        base += 64;
    }

    let rem = chunks.remainder_bits();
    for bit in 0..chunks.remainder_len() {
        if rem & (1 << bit) == 0 {
            unsafe { ptr.add(base + bit).write(T::default_value()) };
        }
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

    // Storage for type-conversion buffers (Int64/Date32/Timestamp and
    // `float32` narrowing). These MUST outlive the callback because
    // `js_sys::*Array::view()` creates zero-copy views into their heap
    // memory. Using `Box<[T]>` (rather than `Vec<T>`) yields a stable
    // data pointer that won't move when the outer Vec grows, so a view
    // created before the push stays valid.
    let mut f32_storage: Vec<Box<[f32]>> = Vec::new();
    let mut f64_storage: Vec<Box<[f64]>> = Vec::new();

    // The bytes under a NULL slot in the source Arrow are UNDEFINED —
    // the perspective engine zero-fills them but e.g. DuckDB's Arrow
    // output leaves NaN (which, unlike the garbage a consumer merely
    // *displays* wrong, poisons any consumer that aggregates, e.g. the
    // treemap's bottom-up value sums). `zero_invalid_slots` normalizes
    // every column in place — forcing invalid slots to 0 so all backends
    // present the same value contract — without giving up the zero-copy
    // view.
    for col_idx in 0..num_cols {
        let field = schema.field(col_idx);
        let col = batch.column(col_idx);
        let validity = col.nulls().map(|nulls| nulls.validity());

        js_names.set(col_idx as u32, JsString::from(field.name().as_str()).into());

        match col.data_type() {
            DataType::UInt32 => {
                let typed = col.as_primitive::<UInt32Type>();
                zero_invalid_slots(typed);
                let arr = unsafe { js_sys::Uint32Array::view(typed.values().as_ref()) };
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Int32 => {
                let typed = col.as_primitive::<Int32Type>();
                zero_invalid_slots(typed);
                let arr = unsafe { js_sys::Int32Array::view(typed.values().as_ref()) };
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Float32 => {
                let typed = col.as_primitive::<Float32Type>();
                zero_invalid_slots(typed);
                let arr = unsafe { js_sys::Float32Array::view(typed.values().as_ref()) };
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Float64 => {
                let typed = col.as_primitive::<Float64Type>();
                zero_invalid_slots(typed);
                if float32 {
                    let vals: Box<[f32]> = typed.values().iter().map(|&v| v as f32).collect();

                    let arr = unsafe { js_sys::Float32Array::view(&vals) };
                    f32_storage.push(vals);
                    js_values.set(col_idx as u32, arr.into());
                } else {
                    let arr = unsafe { js_sys::Float64Array::view(typed.values().as_ref()) };

                    js_values.set(col_idx as u32, arr.into());
                }

                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Date32 => {
                // Datetime values are always emitted as Float64 — narrowing
                // epoch-ms to f32 collapses ~256 ms of resolution at modern
                // timestamps, so the `float32` flag is intentionally ignored
                // for date/timestamp columns.
                let typed = col.as_primitive::<Date32Type>();
                zero_invalid_slots(typed);
                let vals: Box<[f64]> = typed
                    .values()
                    .iter()
                    .map(|&v| v as f64 * 86_400_000.0)
                    .collect();

                let arr = unsafe { js_sys::Float64Array::view(&vals) };
                f64_storage.push(vals);
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Timestamp(TimeUnit::Millisecond, _) => {
                let typed = col.as_primitive::<TimestampMillisecondType>();
                zero_invalid_slots(typed);
                let vals: Box<[f64]> = typed.values().iter().map(|&v| v as f64).collect();

                let arr = unsafe { js_sys::Float64Array::view(&vals) };
                f64_storage.push(vals);
                js_values.set(col_idx as u32, arr.into());
                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Int64 => {
                let typed = col.as_primitive::<Int64Type>();
                zero_invalid_slots(typed);
                if float32 {
                    let vals: Box<[f32]> = typed.values().iter().map(|&v| v as f32).collect();

                    let arr = unsafe { js_sys::Float32Array::view(&vals) };
                    f32_storage.push(vals);
                    js_values.set(col_idx as u32, arr.into());
                } else {
                    let vals: Box<[f64]> = typed.values().iter().map(|&v| v as f64).collect();

                    let arr = unsafe { js_sys::Float64Array::view(&vals) };
                    f64_storage.push(vals);
                    js_values.set(col_idx as u32, arr.into());
                }

                js_dicts.set(col_idx as u32, JsValue::NULL);
            },
            DataType::Dictionary(..) => {
                let dict = col.as_dictionary::<Int32Type>();
                let keys = dict.keys();
                zero_invalid_slots(keys);
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
