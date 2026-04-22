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

use std::error::Error;
use std::sync::Arc;

use arrow_array::builder::{
    BooleanBuilder, Float64Builder, Int32Builder, StringDictionaryBuilder,
    TimestampMillisecondBuilder,
};
use arrow_array::cast::AsArray;
use arrow_array::types::Int32Type;
use arrow_array::{
    Array, ArrayAccessor, ArrayRef, BooleanArray, Date32Array, Date64Array, Decimal128Array,
    Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Int64Array, LargeStringArray,
    RecordBatch, StringArray, Time32MillisecondArray, Time32SecondArray, Time64MicrosecondArray,
    Time64NanosecondArray, TimestampMicrosecondArray, TimestampMillisecondArray,
    TimestampNanosecondArray, TimestampSecondArray, UInt8Array, UInt16Array, UInt32Array,
    UInt64Array,
};
use arrow_ipc::reader::{FileReader, StreamReader};
use arrow_ipc::writer::StreamWriter;
use arrow_schema::{DataType, Field, Schema, TimeUnit};
use indexmap::IndexMap;
use serde::Serialize;

use crate::config::{GroupRollupMode, Scalar, ViewConfig};

/// An Arrow column builder, used during the population phase of
/// [`VirtualDataSlice`].
pub enum ColumnBuilder {
    Boolean(BooleanBuilder),
    String(StringDictionaryBuilder<Int32Type>),
    Float(Float64Builder),
    Integer(Int32Builder),
    Datetime(TimestampMillisecondBuilder),
}

fn dict_data_type() -> DataType {
    DataType::Dictionary(Box::new(DataType::Int32), Box::new(DataType::Utf8))
}

/// A single cell value in a row-oriented data representation.
///
/// Used when converting [`VirtualDataSlice`] to row format for JSON
/// serialization.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum VirtualDataCell {
    Boolean(Option<bool>),
    String(Option<String>),
    Float(Option<f64>),
    Integer(Option<i32>),
    Datetime(Option<i64>),
    RowPath(Vec<Scalar>),
}

/// Trait for types that can be written to a [`ColumnBuilder`] which
/// enforces sequential construction.
///
/// This trait enables type-safe insertion of values into virtual data columns,
/// ensuring that values are written to columns of the correct type.
pub trait SetVirtualDataColumn {
    /// Writes this value (sequentially) to the given column builder.
    ///
    /// Returns an error if the column type does not match the value type.
    fn write_to(self, col: &mut ColumnBuilder) -> Result<(), &'static str>;

    /// Creates a new empty column builder of the appropriate type for this
    /// value.
    fn new_builder() -> ColumnBuilder;

    /// Converts this value to a [`Scalar`] representation.
    fn to_scalar(self) -> Scalar;
}

impl SetVirtualDataColumn for Option<String> {
    fn write_to(self, col: &mut ColumnBuilder) -> Result<(), &'static str> {
        if let ColumnBuilder::String(builder) = col {
            match self {
                Some(s) => builder.append_value(&s),
                None => builder.append_null(),
            }
            Ok(())
        } else {
            Err("Bad type")
        }
    }

    fn new_builder() -> ColumnBuilder {
        ColumnBuilder::String(StringDictionaryBuilder::new())
    }

    fn to_scalar(self) -> Scalar {
        if let Some(x) = self {
            Scalar::String(x)
        } else {
            Scalar::Null
        }
    }
}

impl SetVirtualDataColumn for Option<f64> {
    fn write_to(self, col: &mut ColumnBuilder) -> Result<(), &'static str> {
        if let ColumnBuilder::Float(builder) = col {
            match self {
                Some(v) => builder.append_value(v),
                None => builder.append_null(),
            }
            Ok(())
        } else {
            Err("Bad type")
        }
    }

    fn new_builder() -> ColumnBuilder {
        ColumnBuilder::Float(Float64Builder::new())
    }

    fn to_scalar(self) -> Scalar {
        if let Some(x) = self {
            Scalar::Float(x)
        } else {
            Scalar::Null
        }
    }
}

impl SetVirtualDataColumn for Option<i32> {
    fn write_to(self, col: &mut ColumnBuilder) -> Result<(), &'static str> {
        if let ColumnBuilder::Integer(builder) = col {
            match self {
                Some(v) => builder.append_value(v),
                None => builder.append_null(),
            }
            Ok(())
        } else {
            Err("Bad type")
        }
    }

    fn new_builder() -> ColumnBuilder {
        ColumnBuilder::Integer(Int32Builder::new())
    }

    fn to_scalar(self) -> Scalar {
        if let Some(x) = self {
            Scalar::Float(x as f64)
        } else {
            Scalar::Null
        }
    }
}

impl SetVirtualDataColumn for Option<i64> {
    fn write_to(self, col: &mut ColumnBuilder) -> Result<(), &'static str> {
        if let ColumnBuilder::Datetime(builder) = col {
            match self {
                Some(v) => builder.append_value(v),
                None => builder.append_null(),
            }
            Ok(())
        } else {
            Err("Bad type")
        }
    }

    fn new_builder() -> ColumnBuilder {
        ColumnBuilder::Datetime(TimestampMillisecondBuilder::new())
    }

    fn to_scalar(self) -> Scalar {
        if let Some(x) = self {
            Scalar::Float(x as f64)
        } else {
            Scalar::Null
        }
    }
}

impl SetVirtualDataColumn for Option<bool> {
    fn write_to(self, col: &mut ColumnBuilder) -> Result<(), &'static str> {
        if let ColumnBuilder::Boolean(builder) = col {
            match self {
                Some(v) => builder.append_value(v),
                None => builder.append_null(),
            }
            Ok(())
        } else {
            Err("Bad type")
        }
    }

    fn new_builder() -> ColumnBuilder {
        ColumnBuilder::Boolean(BooleanBuilder::new())
    }

    fn to_scalar(self) -> Scalar {
        if let Some(x) = self {
            Scalar::Bool(x)
        } else {
            Scalar::Null
        }
    }
}

/// A columnar data slice returned from a virtual server view query.
///
/// This struct represents a rectangular slice of data from a view, stored
/// internally as Arrow builders during population and frozen into a
/// `RecordBatch` on first consumption.
#[derive(Debug)]
pub struct VirtualDataSlice {
    config: ViewConfig,
    builders: IndexMap<String, ColumnBuilder>,
    row_path: Option<Vec<Vec<Scalar>>>,
    frozen: Option<RecordBatch>,
}

impl std::fmt::Debug for ColumnBuilder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ColumnBuilder::Boolean(_) => write!(f, "ColumnBuilder::Boolean(..)"),
            ColumnBuilder::String(_) => write!(f, "ColumnBuilder::String(..)"),
            ColumnBuilder::Float(_) => write!(f, "ColumnBuilder::Float(..)"),
            ColumnBuilder::Integer(_) => write!(f, "ColumnBuilder::Integer(..)"),
            ColumnBuilder::Datetime(_) => write!(f, "ColumnBuilder::Datetime(..)"),
        }
    }
}

/// Extracts grouping ID values from an Arrow array as `i64`.
fn cast_to_int64(array: &ArrayRef) -> Result<Vec<i64>, Box<dyn Error>> {
    let num_rows = array.len();
    let mut result = Vec::with_capacity(num_rows);
    match array.data_type() {
        DataType::Int32 => {
            let arr = array.as_any().downcast_ref::<Int32Array>().unwrap();
            for i in 0..num_rows {
                result.push(if arr.is_null(i) {
                    0
                } else {
                    arr.value(i) as i64
                });
            }
        },
        DataType::Int64 => {
            let arr = array.as_any().downcast_ref::<Int64Array>().unwrap();
            for i in 0..num_rows {
                result.push(if arr.is_null(i) { 0 } else { arr.value(i) });
            }
        },
        DataType::Float64 => {
            let arr = array.as_any().downcast_ref::<Float64Array>().unwrap();
            for i in 0..num_rows {
                result.push(if arr.is_null(i) {
                    0
                } else {
                    arr.value(i) as i64
                });
            }
        },
        dt => return Err(format!("Cannot cast {} to Int64", dt).into()),
    }
    Ok(result)
}

/// Extracts a single cell from an Arrow array as a [`Scalar`].
fn extract_scalar(array: &ArrayRef, row_idx: usize) -> Scalar {
    if array.is_null(row_idx) {
        return Scalar::Null;
    }
    match array.data_type() {
        DataType::Utf8 => {
            let arr = array.as_any().downcast_ref::<StringArray>().unwrap();
            Scalar::String(arr.value(row_idx).to_string())
        },
        DataType::Dictionary(..) => {
            let dict = array.as_dictionary::<Int32Type>();
            let values = dict.downcast_dict::<StringArray>().unwrap();
            Scalar::String(values.value(row_idx).to_string())
        },
        DataType::Float64 => {
            let arr = array.as_any().downcast_ref::<Float64Array>().unwrap();
            Scalar::Float(arr.value(row_idx))
        },
        DataType::Int32 => {
            let arr = array.as_any().downcast_ref::<Int32Array>().unwrap();
            Scalar::Float(arr.value(row_idx) as f64)
        },
        DataType::Int64 => {
            let arr = array.as_any().downcast_ref::<Int64Array>().unwrap();
            Scalar::Float(arr.value(row_idx) as f64)
        },
        DataType::Boolean => {
            let arr = array.as_any().downcast_ref::<BooleanArray>().unwrap();
            Scalar::Bool(arr.value(row_idx))
        },
        DataType::Timestamp(TimeUnit::Millisecond, _) => {
            let arr = array
                .as_any()
                .downcast_ref::<TimestampMillisecondArray>()
                .unwrap();
            Scalar::Float(arr.value(row_idx) as f64)
        },
        DataType::Date32 => {
            let arr = array.as_any().downcast_ref::<Date32Array>().unwrap();
            Scalar::Float(arr.value(row_idx) as f64 * 86_400_000.0)
        },
        _ => {
            let scalar_arr = array.slice(row_idx, 1);
            Scalar::String(format!("{:?}", scalar_arr))
        },
    }
}

/// Coerces an Arrow column to Perspective-compatible types, optionally
/// renaming.
/// Manually converts a timestamp array of any unit to milliseconds.
fn timestamp_to_millis(array: &ArrayRef, unit: &TimeUnit) -> ArrayRef {
    let millis: TimestampMillisecondArray = match unit {
        TimeUnit::Second => {
            let arr = array
                .as_any()
                .downcast_ref::<TimestampSecondArray>()
                .unwrap();
            arr.iter().map(|v| v.map(|v| v * 1_000)).collect()
        },
        TimeUnit::Microsecond => {
            let arr = array
                .as_any()
                .downcast_ref::<TimestampMicrosecondArray>()
                .unwrap();
            arr.iter().map(|v| v.map(|v| v / 1_000)).collect()
        },
        TimeUnit::Nanosecond => {
            let arr = array
                .as_any()
                .downcast_ref::<TimestampNanosecondArray>()
                .unwrap();
            arr.iter().map(|v| v.map(|v| v / 1_000_000)).collect()
        },
        TimeUnit::Millisecond => {
            return array.clone();
        },
    };
    Arc::new(millis) as ArrayRef
}

fn coerce_column(
    name: &str,
    field: &Field,
    array: &ArrayRef,
) -> Result<(Field, ArrayRef), Box<dyn Error>> {
    match field.data_type() {
        DataType::Boolean | DataType::Float64 | DataType::Int32 | DataType::Date32 => Ok((
            Field::new(name, field.data_type().clone(), true),
            array.clone(),
        )),
        DataType::Dictionary(..) => Ok((Field::new(name, dict_data_type(), true), array.clone())),
        DataType::Utf8 => {
            let arr = array.as_any().downcast_ref::<StringArray>().unwrap();
            let mut builder = StringDictionaryBuilder::<Int32Type>::new();
            for i in 0..arr.len() {
                if arr.is_null(i) {
                    builder.append_null();
                } else {
                    builder.append_value(arr.value(i));
                }
            }
            Ok((
                Field::new(name, dict_data_type(), true),
                Arc::new(builder.finish()) as ArrayRef,
            ))
        },
        DataType::Timestamp(TimeUnit::Millisecond, _) => Ok((
            Field::new(name, DataType::Timestamp(TimeUnit::Millisecond, None), true),
            array.clone(),
        )),
        DataType::Int8 => {
            let arr = array.as_any().downcast_ref::<Int8Array>().unwrap();
            let result: Int32Array = arr.iter().map(|v| v.map(|v| v as i32)).collect();
            Ok((
                Field::new(name, DataType::Int32, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Int16 => {
            let arr = array.as_any().downcast_ref::<Int16Array>().unwrap();
            let result: Int32Array = arr.iter().map(|v| v.map(|v| v as i32)).collect();
            Ok((
                Field::new(name, DataType::Int32, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::UInt8 => {
            let arr = array.as_any().downcast_ref::<UInt8Array>().unwrap();
            let result: Int32Array = arr.iter().map(|v| v.map(|v| v as i32)).collect();
            Ok((
                Field::new(name, DataType::Int32, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::UInt16 => {
            let arr = array.as_any().downcast_ref::<UInt16Array>().unwrap();
            let result: Int32Array = arr.iter().map(|v| v.map(|v| v as i32)).collect();
            Ok((
                Field::new(name, DataType::Int32, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::UInt32 => {
            let arr = array.as_any().downcast_ref::<UInt32Array>().unwrap();
            let result: Int64Array = arr.iter().map(|v| v.map(|v| v as i64)).collect();
            let result: Float64Array = result.iter().map(|v| v.map(|v| v as f64)).collect();
            Ok((
                Field::new(name, DataType::Float64, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Int64 => {
            let arr = array.as_any().downcast_ref::<Int64Array>().unwrap();
            let result: Float64Array = arr.iter().map(|v| v.map(|v| v as f64)).collect();
            Ok((
                Field::new(name, DataType::Float64, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::UInt64 => {
            let arr = array.as_any().downcast_ref::<UInt64Array>().unwrap();
            let result: Float64Array = arr.iter().map(|v| v.map(|v| v as f64)).collect();
            Ok((
                Field::new(name, DataType::Float64, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Float32 => {
            let arr = array.as_any().downcast_ref::<Float32Array>().unwrap();
            let result: Float64Array = arr.iter().map(|v| v.map(|v| v as f64)).collect();
            Ok((
                Field::new(name, DataType::Float64, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Decimal128(_, scale) => {
            let scale = *scale;
            let arr = array.as_any().downcast_ref::<Decimal128Array>().unwrap();
            let divisor = 10_f64.powi(scale as i32);
            let result: Float64Array = arr.iter().map(|v| v.map(|v| v as f64 / divisor)).collect();
            Ok((
                Field::new(name, DataType::Float64, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Date64 => {
            let arr = array.as_any().downcast_ref::<Date64Array>().unwrap();
            let result: Date32Array = arr
                .iter()
                .map(|v| v.map(|v| (v / 86_400_000) as i32))
                .collect();
            Ok((
                Field::new(name, DataType::Date32, true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Timestamp(unit, _) => {
            let casted = timestamp_to_millis(array, unit);
            Ok((
                Field::new(name, DataType::Timestamp(TimeUnit::Millisecond, None), true),
                casted,
            ))
        },
        DataType::Time32(TimeUnit::Second) => {
            let arr = array.as_any().downcast_ref::<Time32SecondArray>().unwrap();
            let result: TimestampMillisecondArray =
                arr.iter().map(|v| v.map(|v| v as i64 * 1_000)).collect();
            Ok((
                Field::new(name, DataType::Timestamp(TimeUnit::Millisecond, None), true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Time32(TimeUnit::Millisecond) => {
            let arr = array
                .as_any()
                .downcast_ref::<Time32MillisecondArray>()
                .unwrap();
            let result: TimestampMillisecondArray =
                arr.iter().map(|v| v.map(|v| v as i64)).collect();
            Ok((
                Field::new(name, DataType::Timestamp(TimeUnit::Millisecond, None), true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Time64(TimeUnit::Microsecond) => {
            let arr = array
                .as_any()
                .downcast_ref::<Time64MicrosecondArray>()
                .unwrap();
            let result: TimestampMillisecondArray =
                arr.iter().map(|v| v.map(|v| v / 1_000)).collect();
            Ok((
                Field::new(name, DataType::Timestamp(TimeUnit::Millisecond, None), true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::Time64(TimeUnit::Nanosecond) => {
            let arr = array
                .as_any()
                .downcast_ref::<Time64NanosecondArray>()
                .unwrap();
            let result: TimestampMillisecondArray =
                arr.iter().map(|v| v.map(|v| v / 1_000_000)).collect();
            Ok((
                Field::new(name, DataType::Timestamp(TimeUnit::Millisecond, None), true),
                Arc::new(result) as ArrayRef,
            ))
        },
        DataType::LargeUtf8 => {
            let arr = array.as_any().downcast_ref::<LargeStringArray>().unwrap();
            let mut builder = StringDictionaryBuilder::<Int32Type>::new();
            for i in 0..arr.len() {
                if arr.is_null(i) {
                    builder.append_null();
                } else {
                    builder.append_value(arr.value(i));
                }
            }
            Ok((
                Field::new(name, dict_data_type(), true),
                Arc::new(builder.finish()) as ArrayRef,
            ))
        },
        dt => {
            tracing::warn!(
                "Coercing unknown Arrow type {} to Dictionary for column '{}'",
                dt,
                name
            );
            let num_rows = array.len();
            let mut builder = StringDictionaryBuilder::<Int32Type>::new();
            for i in 0..num_rows {
                if array.is_null(i) {
                    builder.append_null();
                } else {
                    let scalar_arr = array.slice(i, 1);
                    builder.append_value(format!("{:?}", scalar_arr));
                }
            }
            Ok((
                Field::new(name, dict_data_type(), true),
                Arc::new(builder.finish()) as ArrayRef,
            ))
        },
    }
}

impl VirtualDataSlice {
    pub fn new(config: ViewConfig) -> Self {
        VirtualDataSlice {
            config,
            builders: IndexMap::default(),
            row_path: None,
            frozen: None,
        }
    }

    /// Loads data from Arrow IPC file format bytes, with automatic
    /// post-processing based on the view configuration.
    ///
    /// When `group_by` is active, extracts `__GROUPING_ID__` and
    /// `__ROW_PATH_N__` columns to build `self.row_path`, then removes
    /// them from the output `RecordBatch`.
    ///
    /// When `split_by` is active, renames data columns by replacing `_`
    /// with `|` (the DuckDB PIVOT separator).
    ///
    /// Also coerces non-standard Arrow types (e.g. `Decimal128`, `Int64`)
    /// to Perspective-compatible types.
    pub fn from_arrow_ipc(&mut self, ipc: &[u8]) -> Result<(), Box<dyn Error>> {
        let cursor = std::io::Cursor::new(ipc);
        let batch = if &ipc[0..6] == "ARROW1".as_bytes() {
            FileReader::try_new(cursor, None)?
                .next()
                .ok_or("Arrow IPC stream contained no record batches")??
        } else {
            StreamReader::try_new(cursor, None)?
                .next()
                .ok_or("Arrow IPC stream contained no record batches")??
        };

        let has_group_by = !self.config.group_by.is_empty();
        let has_split_by = !self.config.split_by.is_empty();
        let is_total = self.config.group_rollup_mode == GroupRollupMode::Total;

        if !has_group_by && !has_split_by && !is_total {
            self.frozen = Some(batch);
            return Ok(());
        }

        let num_rows = batch.num_rows();
        let schema = batch.schema();

        // Phase A: Extract row_path from __GROUPING_ID__ and __ROW_PATH_N__
        if has_group_by {
            let group_by_len = self.config.group_by.len();
            let is_flat = self.config.group_rollup_mode == GroupRollupMode::Flat;
            let grouping_ids = if is_flat {
                None
            } else {
                let grouping_id_idx = schema
                    .index_of("__GROUPING_ID__")
                    .map_err(|_| "Missing __GROUPING_ID__ column")?;
                Some(cast_to_int64(batch.column(grouping_id_idx))?)
            };

            let mut row_paths: Vec<Vec<Scalar>> = (0..num_rows).map(|_| Vec::new()).collect();
            for gidx in 0..group_by_len {
                let col_name = format!("__ROW_PATH_{}__", gidx);
                let col_idx = schema
                    .index_of(&col_name)
                    .map_err(|_| format!("Missing {} column", col_name))?;

                let col = batch.column(col_idx);

                // In flat mode, all rows are leaf rows
                if is_flat {
                    // TODO I may be dumb but I'm not exactly sure what Clippy
                    // wants here. This could be an `enumerate` but how is this
                    // better?
                    #[allow(clippy::needless_range_loop)]
                    for row_idx in 0..num_rows {
                        row_paths[row_idx].push(extract_scalar(col, row_idx));
                    }
                } else {
                    let gids = grouping_ids.as_ref().unwrap();
                    let max_grouping_id = 2_i64.pow(group_by_len as u32 - gidx as u32) - 1;
                    for row_idx in 0..num_rows {
                        if gids[row_idx] < max_grouping_id {
                            row_paths[row_idx].push(extract_scalar(col, row_idx));
                        }
                    }
                }
            }

            self.row_path = Some(row_paths);
        }

        // Phase B: Rebuild RecordBatch without metadata columns, with
        // column renames and type coercion.
        let mut new_fields = Vec::new();
        let mut new_arrays: Vec<ArrayRef> = Vec::new();
        for (col_idx, field) in schema.fields().iter().enumerate() {
            let name = field.name();
            if name == "__GROUPING_ID__" || name.starts_with("__ROW_PATH_") {
                continue;
            }

            let new_name = if has_split_by && !name.starts_with("__") {
                name.replace('_', "|")
            } else {
                name.clone()
            };

            let (coerced_field, coerced_array) =
                coerce_column(&new_name, field, batch.column(col_idx))?;
            new_fields.push(coerced_field);
            new_arrays.push(coerced_array);
        }

        let new_schema = Arc::new(Schema::new(new_fields));
        self.frozen = if new_arrays.is_empty() {
            Some(RecordBatch::new_empty(new_schema))
        } else {
            Some(RecordBatch::try_new(new_schema, new_arrays)?)
        };
        Ok(())
    }

    /// Freezes the builders into a `RecordBatch`. Idempotent — subsequent
    /// calls return the cached batch.
    pub(crate) fn freeze(&mut self) -> &RecordBatch {
        if self.frozen.is_none() {
            let mut fields = Vec::new();
            let mut arrays: Vec<ArrayRef> = Vec::new();

            for (name, builder) in &mut self.builders {
                let (field, array): (Field, ArrayRef) = match builder {
                    ColumnBuilder::Boolean(b) => (
                        Field::new(name, DataType::Boolean, true),
                        Arc::new(b.finish()),
                    ),
                    ColumnBuilder::String(b) => (
                        Field::new(name, dict_data_type(), true),
                        Arc::new(b.finish()),
                    ),
                    ColumnBuilder::Float(b) => (
                        Field::new(name, DataType::Float64, true),
                        Arc::new(b.finish()),
                    ),
                    ColumnBuilder::Integer(b) => (
                        Field::new(name, DataType::Int32, true),
                        Arc::new(b.finish()),
                    ),
                    ColumnBuilder::Datetime(b) => (
                        Field::new(name, DataType::Timestamp(TimeUnit::Millisecond, None), true),
                        Arc::new(b.finish()),
                    ),
                };
                fields.push(field);
                arrays.push(array);
            }

            let schema = Arc::new(Schema::new(fields));
            self.frozen = Some(
                RecordBatch::try_new(schema, arrays)
                    .expect("RecordBatch construction should not fail for well-formed builders"),
            );
        }
        self.frozen.as_ref().unwrap()
    }

    /// Serializes the data to Arrow IPC streaming format.
    pub(crate) fn render_to_arrow_ipc(&mut self) -> Result<Vec<u8>, Box<dyn Error>> {
        let batch = self.freeze().clone();
        let schema = batch.schema();
        let mut buf = Vec::new();
        {
            let mut writer = StreamWriter::try_new(&mut buf, &schema)?;
            writer.write(&batch)?;
            writer.finish()?;
        }
        Ok(buf)
    }

    /// Converts the columnar data to a row-oriented representation for JSON
    /// serialization.
    pub(crate) fn render_to_rows(&mut self) -> Vec<IndexMap<String, VirtualDataCell>> {
        let batch = self.freeze().clone();
        let num_rows = batch.num_rows();
        let schema = batch.schema();

        (0..num_rows)
            .map(|row_idx| {
                let mut row = IndexMap::new();

                // Add RowPath column first if present
                if let Some(ref rp) = self.row_path
                    && row_idx < rp.len()
                {
                    row.insert(
                        "__ROW_PATH__".to_string(),
                        VirtualDataCell::RowPath(rp[row_idx].clone()),
                    );
                }

                // Add Arrow columns
                for (col_idx, field) in schema.fields().iter().enumerate() {
                    let col = batch.column(col_idx);
                    let cell = if col.is_null(row_idx) {
                        match field.data_type() {
                            DataType::Boolean => VirtualDataCell::Boolean(None),
                            DataType::Utf8 | DataType::Dictionary(..) => {
                                VirtualDataCell::String(None)
                            },
                            DataType::Float64 => VirtualDataCell::Float(None),
                            DataType::Int32 => VirtualDataCell::Integer(None),
                            DataType::Timestamp(TimeUnit::Millisecond, _) => {
                                VirtualDataCell::Datetime(None)
                            },
                            _ => continue,
                        }
                    } else {
                        match field.data_type() {
                            DataType::Boolean => {
                                let arr = col.as_any().downcast_ref::<BooleanArray>().unwrap();
                                VirtualDataCell::Boolean(Some(arr.value(row_idx)))
                            },
                            DataType::Utf8 => {
                                let arr = col.as_any().downcast_ref::<StringArray>().unwrap();
                                VirtualDataCell::String(Some(arr.value(row_idx).to_string()))
                            },
                            DataType::Dictionary(..) => {
                                let dict = col.as_dictionary::<Int32Type>();
                                let values = dict.downcast_dict::<StringArray>().unwrap();
                                VirtualDataCell::String(Some(values.value(row_idx).to_string()))
                            },
                            DataType::Float64 => {
                                let arr = col.as_any().downcast_ref::<Float64Array>().unwrap();
                                VirtualDataCell::Float(Some(arr.value(row_idx)))
                            },
                            DataType::Int32 => {
                                let arr = col.as_any().downcast_ref::<Int32Array>().unwrap();
                                VirtualDataCell::Integer(Some(arr.value(row_idx)))
                            },
                            DataType::Timestamp(TimeUnit::Millisecond, _) => {
                                let arr = col
                                    .as_any()
                                    .downcast_ref::<TimestampMillisecondArray>()
                                    .unwrap();
                                VirtualDataCell::Datetime(Some(arr.value(row_idx)))
                            },
                            DataType::Date32 => {
                                let arr = col.as_any().downcast_ref::<Date32Array>().unwrap();
                                VirtualDataCell::Datetime(Some(
                                    arr.value(row_idx) as i64 * 86_400_000,
                                ))
                            },
                            x => {
                                tracing::error!("Unknown Arrow IPC type {}", x);
                                continue;
                            },
                        }
                    };
                    row.insert(field.name().clone(), cell);
                }

                row
            })
            .collect()
    }

    /// Serializes the data to a column-oriented JSON string.
    pub fn render_to_columns_json(&mut self) -> Result<String, Box<dyn Error>> {
        let batch = self.freeze().clone();
        let schema = batch.schema();
        let mut map = serde_json::Map::new();

        // Add RowPath if present
        if let Some(ref rp) = self.row_path {
            map.insert("__ROW_PATH__".to_string(), serde_json::to_value(rp)?);
        }

        for (col_idx, field) in schema.fields().iter().enumerate() {
            let col = batch.column(col_idx);
            let num_rows = col.len();
            let values: serde_json::Value = match field.data_type() {
                DataType::Boolean => {
                    let arr = col.as_any().downcast_ref::<BooleanArray>().unwrap();
                    serde_json::to_value(
                        (0..num_rows)
                            .map(|i| {
                                if arr.is_null(i) {
                                    None
                                } else {
                                    Some(arr.value(i))
                                }
                            })
                            .collect::<Vec<_>>(),
                    )?
                },
                DataType::Utf8 => {
                    let arr = col.as_any().downcast_ref::<StringArray>().unwrap();
                    serde_json::to_value(
                        (0..num_rows)
                            .map(|i| {
                                if arr.is_null(i) {
                                    None
                                } else {
                                    Some(arr.value(i))
                                }
                            })
                            .collect::<Vec<_>>(),
                    )?
                },
                DataType::Dictionary(..) => {
                    let dict = col.as_dictionary::<Int32Type>();
                    let values = dict.downcast_dict::<StringArray>().unwrap();
                    serde_json::to_value(
                        (0..num_rows)
                            .map(|i| {
                                if col.is_null(i) {
                                    None
                                } else {
                                    Some(values.value(i))
                                }
                            })
                            .collect::<Vec<_>>(),
                    )?
                },
                DataType::Float64 => {
                    let arr = col.as_any().downcast_ref::<Float64Array>().unwrap();
                    serde_json::to_value(
                        (0..num_rows)
                            .map(|i| {
                                if arr.is_null(i) {
                                    None
                                } else {
                                    Some(arr.value(i))
                                }
                            })
                            .collect::<Vec<_>>(),
                    )?
                },
                DataType::Int32 => {
                    let arr = col.as_any().downcast_ref::<Int32Array>().unwrap();
                    serde_json::to_value(
                        (0..num_rows)
                            .map(|i| {
                                if arr.is_null(i) {
                                    None
                                } else {
                                    Some(arr.value(i))
                                }
                            })
                            .collect::<Vec<_>>(),
                    )?
                },
                DataType::Timestamp(TimeUnit::Millisecond, _) => {
                    let arr = col
                        .as_any()
                        .downcast_ref::<TimestampMillisecondArray>()
                        .unwrap();
                    serde_json::to_value(
                        (0..num_rows)
                            .map(|i| {
                                if arr.is_null(i) {
                                    None
                                } else {
                                    Some(arr.value(i))
                                }
                            })
                            .collect::<Vec<_>>(),
                    )?
                },
                DataType::Date32 => {
                    let arr = col.as_any().downcast_ref::<Date32Array>().unwrap();
                    serde_json::to_value(
                        (0..num_rows)
                            .map(|i| {
                                if arr.is_null(i) {
                                    None
                                } else {
                                    Some(arr.value(i) as i64 * 86_400_000)
                                }
                            })
                            .collect::<Vec<_>>(),
                    )?
                },
                x => {
                    tracing::error!("Unknown Arrow IPC type {}", x);
                    continue;
                },
            };
            map.insert(field.name().clone(), values);
        }

        Ok(serde_json::to_string(&map)?)
    }

    /// Sets a value in a column at the specified row index.
    ///
    /// If `group_by_index` is `Some`, the value is added to the `__ROW_PATH__`
    /// column as part of the row's group-by path. Otherwise, the value is
    /// inserted into the named column.
    ///
    /// Creates the column if it does not already exist.
    pub fn set_col<T: SetVirtualDataColumn>(
        &mut self,
        name: &str,
        grouping_id: Option<usize>,
        index: usize,
        value: T,
    ) -> Result<(), Box<dyn Error>> {
        if name == "__GROUPING_ID__" {
            return Ok(());
        }

        if name.starts_with("__ROW_PATH_") {
            let group_by_index: u32 = name[11..name.len() - 2].parse()?;
            let max_grouping_id =
                2_i32.pow((self.config.group_by.len() as u32) - group_by_index) - 1;

            if grouping_id.map(|x| x as i32).unwrap_or(i32::MAX) < max_grouping_id {
                let col = self.row_path.get_or_insert_with(Vec::new);
                if let Some(row) = col.get_mut(index) {
                    let scalar = value.to_scalar();
                    row.push(scalar);
                } else {
                    while col.len() < index {
                        col.push(vec![])
                    }

                    let scalar = value.to_scalar();
                    col.push(vec![scalar]);
                }
            }

            Ok(())
        } else {
            let col_name = if !self.config.split_by.is_empty() && !name.starts_with("__") {
                name.replace('_', "|")
            } else {
                name.to_owned()
            };

            if !self.builders.contains_key(&col_name) {
                self.builders.insert(col_name.clone(), T::new_builder());
            }

            let col = self
                .builders
                .get_mut(&col_name)
                .ok_or_else(|| format!("Column '{}' not found after insertion", col_name))?;

            Ok(value.write_to(col)?)
        }
    }
}
