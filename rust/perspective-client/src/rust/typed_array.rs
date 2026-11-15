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
use arrow_array::{Array, ArrowPrimitiveType, PrimitiveArray};
use arrow_buffer::{ArrowNativeType, Buffer, ScalarBuffer};
use arrow_ipc::reader::StreamReader;
use arrow_schema::{DataType, TimeUnit};
use serde::Deserialize;
use ts_rs::TS;

#[cfg(doc)]
use crate::View;
use crate::utils::{ClientError, ClientResult};
use crate::view::ViewWindow;

/// Options for [`View::to_typed_arrays`], extending [`ViewWindow`] with
/// typed-array-specific options.
#[derive(Clone, Debug, Default, Deserialize, TS)]
pub struct TypedArrayWindow {
    #[serde(flatten)]
    pub view_window: ViewWindow,

    /// When `true`, Float64/Int64/UInt64 columns are output as `Float32`
    /// instead of `Float64`.
    #[serde(default)]
    pub float32: bool,
}

impl From<TypedArrayWindow> for ViewWindow {
    fn from(w: TypedArrayWindow) -> Self {
        w.view_window
    }
}

/// The numeric representation of a [`TypedArrayColumn`]'s values.
#[derive(Clone, Debug)]
pub enum TypedArrayValues {
    Int32(ScalarBuffer<i32>),
    UInt32(ScalarBuffer<u32>),
    Float32(ScalarBuffer<f32>),
    Float64(ScalarBuffer<f64>),
    Dictionary {
        keys: ScalarBuffer<i32>,
        values: Vec<String>,
    },
}

/// One column of a [`View`] as a flat numeric array whose invalid slots read
/// `0`.
#[derive(Clone, Debug)]
pub struct TypedArrayColumn {
    pub name: String,
    pub values: TypedArrayValues,

    /// Validity bitmap with bit `i` set when row `i` is valid, or `None` when
    /// every row is valid.
    pub validity: Option<Buffer>,
}

pub(crate) fn decode_typed_arrays(
    arrow: &[u8],
    float32: bool,
) -> ClientResult<Vec<TypedArrayColumn>> {
    let reader = StreamReader::try_new(Cursor::new(arrow), None)
        .map_err(|e| ClientError::TypedArrayError(format!("Arrow decode error: {e}")))?;

    let batch = reader
        .into_iter()
        .next()
        .ok_or_else(|| {
            ClientError::TypedArrayError("Arrow IPC contained no record batches".to_owned())
        })?
        .map_err(|e| ClientError::TypedArrayError(format!("Arrow batch error: {e}")))?;

    batch
        .schema()
        .fields()
        .iter()
        .zip(batch.columns())
        .map(|(field, column)| {
            // SAFETY: The column is exclusively owned by the `barch` in this
            // stack frame.
            unsafe { zero_invalid_slots(column.as_ref()) };
            Ok(TypedArrayColumn {
                name: field.name().clone(),
                values: decode_values(column.as_ref(), float32)?,
                validity: column.nulls().map(|nulls| nulls.inner().sliced()),
            })
        })
        .collect()
}

fn decode_values(column: &dyn Array, float32: bool) -> ClientResult<TypedArrayValues> {
    Ok(match column.data_type() {
        DataType::Int8 => {
            TypedArrayValues::Int32(map_values(column.as_primitive::<Int8Type>(), i32::from))
        },
        DataType::UInt8 => {
            TypedArrayValues::Int32(map_values(column.as_primitive::<UInt8Type>(), i32::from))
        },
        DataType::Int16 => {
            TypedArrayValues::Int32(map_values(column.as_primitive::<Int16Type>(), i32::from))
        },
        DataType::UInt16 => {
            TypedArrayValues::Int32(map_values(column.as_primitive::<UInt16Type>(), i32::from))
        },
        DataType::Int32 => {
            TypedArrayValues::Int32(column.as_primitive::<Int32Type>().values().clone())
        },
        DataType::UInt32 => {
            TypedArrayValues::UInt32(column.as_primitive::<UInt32Type>().values().clone())
        },
        DataType::Float32 => {
            TypedArrayValues::Float32(column.as_primitive::<Float32Type>().values().clone())
        },
        DataType::Float64 if float32 => {
            TypedArrayValues::Float32(map_values(column.as_primitive::<Float64Type>(), |v| {
                v as f32
            }))
        },
        DataType::Float64 => {
            TypedArrayValues::Float64(column.as_primitive::<Float64Type>().values().clone())
        },
        DataType::Int64 if float32 => {
            TypedArrayValues::Float32(map_values(column.as_primitive::<Int64Type>(), |v| v as f32))
        },
        DataType::Int64 => {
            TypedArrayValues::Float64(map_values(column.as_primitive::<Int64Type>(), |v| v as f64))
        },
        DataType::UInt64 if float32 => {
            TypedArrayValues::Float32(map_values(column.as_primitive::<UInt64Type>(), |v| {
                v as f32
            }))
        },
        DataType::UInt64 => {
            TypedArrayValues::Float64(map_values(column.as_primitive::<UInt64Type>(), |v| {
                v as f64
            }))
        },
        DataType::Date32 => {
            TypedArrayValues::Float64(map_values(column.as_primitive::<Date32Type>(), |v| {
                v as f64 * 86_400_000.0
            }))
        },
        DataType::Timestamp(TimeUnit::Millisecond, _) => TypedArrayValues::Float64(map_values(
            column.as_primitive::<TimestampMillisecondType>(),
            |v| v as f64,
        )),
        DataType::Boolean => {
            let typed = column.as_boolean();
            TypedArrayValues::Int32(
                (0..typed.len())
                    .map(|i| i32::from(typed.is_valid(i) && typed.value(i)))
                    .collect(),
            )
        },
        DataType::Dictionary(..) => decode_dictionary(column)?,
        dt => {
            return Err(ClientError::TypedArrayError(format!(
                "Unsupported column type for typed array: {dt}"
            )));
        },
    })
}

fn decode_dictionary(column: &dyn Array) -> ClientResult<TypedArrayValues> {
    let dict = column.as_dictionary_opt::<Int32Type>().ok_or_else(|| {
        ClientError::TypedArrayError(format!(
            "Unsupported dictionary key type for typed array: {}",
            column.data_type()
        ))
    })?;

    let values = dict.values().as_string_opt::<i32>().ok_or_else(|| {
        ClientError::TypedArrayError(format!(
            "Unsupported dictionary value type for typed array: {}",
            dict.values().data_type()
        ))
    })?;

    Ok(TypedArrayValues::Dictionary {
        keys: dict.keys().values().clone(),
        values: (0..values.len())
            .map(|i| values.value(i).to_owned())
            .collect(),
    })
}

/// Zeroes the value bytes under `column`'s invalid slots in place, so the
/// caller must exclusively own `column`'s buffers.
unsafe fn zero_invalid_slots(column: &dyn Array) {
    let Some(nulls) = column.nulls() else {
        return;
    };

    let data = column.to_data();
    let width = match data.data_type() {
        DataType::Dictionary(key, _) => key.primitive_width(),
        dt => dt.primitive_width(),
    };

    let Some(width) = width else {
        return;
    };

    let bytes = unsafe {
        std::slice::from_raw_parts_mut(
            (data.buffers()[0].as_ptr() as *mut u8).add(data.offset() * width),
            data.len() * width,
        )
    };

    let mut next = 0;
    for (start, end) in nulls.valid_slices() {
        bytes[next * width..start * width].fill(0);
        next = end;
    }

    bytes[next * width..].fill(0);
}

fn map_values<T, U>(array: &PrimitiveArray<T>, f: impl Fn(T::Native) -> U) -> ScalarBuffer<U>
where
    T: ArrowPrimitiveType,
    U: ArrowNativeType,
{
    array.values().iter().map(|&v| f(v)).collect()
}
