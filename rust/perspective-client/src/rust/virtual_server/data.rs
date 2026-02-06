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
use std::ops::{Deref, DerefMut};

use indexmap::IndexMap;
use serde::Serialize;

use crate::config::{Scalar, ViewConfig};

/// A column of data returned from a virtual server query.
///
/// Each variant represents a different column type, containing a vector
/// of optional values. `None` values represent null/missing data.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum VirtualDataColumn {
    Boolean(Vec<Option<bool>>),
    String(Vec<Option<String>>),
    Float(Vec<Option<f64>>),
    Integer(Vec<Option<i32>>),
    Datetime(Vec<Option<i64>>),
    IntegerIndex(Vec<Option<Vec<i32>>>),
    RowPath(Vec<Vec<Scalar>>),
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
    IntegerIndex(Option<Vec<i32>>),
    RowPath(Vec<Scalar>),
}

impl VirtualDataColumn {
    /// Returns `true` if the column contains no elements.
    pub fn is_empty(&self) -> bool {
        match self {
            VirtualDataColumn::Boolean(v) => v.is_empty(),
            VirtualDataColumn::String(v) => v.is_empty(),
            VirtualDataColumn::Float(v) => v.is_empty(),
            VirtualDataColumn::Integer(v) => v.is_empty(),
            VirtualDataColumn::Datetime(v) => v.is_empty(),
            VirtualDataColumn::IntegerIndex(v) => v.is_empty(),
            VirtualDataColumn::RowPath(v) => v.is_empty(),
        }
    }

    /// Returns the number of elements in the column.
    pub fn len(&self) -> usize {
        match self {
            VirtualDataColumn::Boolean(v) => v.len(),
            VirtualDataColumn::String(v) => v.len(),
            VirtualDataColumn::Float(v) => v.len(),
            VirtualDataColumn::Integer(v) => v.len(),
            VirtualDataColumn::Datetime(v) => v.len(),
            VirtualDataColumn::IntegerIndex(v) => v.len(),
            VirtualDataColumn::RowPath(v) => v.len(),
        }
    }
}

/// Trait for types that can be written to a [`VirtualDataColumn`] which
/// enforces sequential construction.
///
/// This trait enables type-safe insertion of values into virtual data columns,
/// ensuring that values are written to columns of the correct type.
pub trait SetVirtualDataColumn {
    /// Writes this value (sequentially) to the given column.
    ///
    /// Returns an error if the column type does not match the value type.
    fn write_to(self, col: &mut VirtualDataColumn) -> Result<(), &'static str>;

    /// Creates a new empty column of the appropriate type for this value.
    fn new_column() -> VirtualDataColumn;

    /// Converts this value to a [`Scalar`] representation.
    fn to_scalar(self) -> Scalar;
}

macro_rules! template_psp {
    ($t:ty, $u:ident, $v:ident, $w:ty) => {
        impl SetVirtualDataColumn for Option<$t> {
            fn write_to(self, col: &mut VirtualDataColumn) -> Result<(), &'static str> {
                if let VirtualDataColumn::$u(x) = col {
                    x.push(self);
                    Ok(())
                } else {
                    Err("Bad type")
                }
            }

            fn new_column() -> VirtualDataColumn {
                VirtualDataColumn::$u(vec![])
            }

            fn to_scalar(self) -> Scalar {
                if let Some(x) = self {
                    Scalar::$v(x as $w)
                } else {
                    Scalar::Null
                }
            }
        }
    };
}

template_psp!(String, String, String, String);
template_psp!(f64, Float, Float, f64);
template_psp!(i32, Integer, Float, f64);
template_psp!(i64, Datetime, Float, f64);
template_psp!(bool, Boolean, Bool, bool);

/// A columnar data slice returned from a virtual server view query.
///
/// This struct represents a rectangular slice of data from a view. It can be
/// serialized to JSON in either column-oriented or row-oriented format.
#[derive(Debug, Serialize)]
#[serde(transparent)]
pub struct VirtualDataSlice(
    #[serde(skip)] ViewConfig,
    IndexMap<String, VirtualDataColumn>,
);

impl Deref for VirtualDataSlice {
    type Target = IndexMap<String, VirtualDataColumn>;

    fn deref(&self) -> &Self::Target {
        &self.1
    }
}

impl DerefMut for VirtualDataSlice {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.1
    }
}

impl VirtualDataSlice {
    pub  fn new(config: ViewConfig) -> Self {
        VirtualDataSlice(config, IndexMap::default())
    }

    pub(super) fn to_rows(&self) -> Vec<IndexMap<String, VirtualDataCell>> {
        let num_rows = self.values().next().map(|x| x.len()).unwrap_or(0);
        (0..num_rows)
            .map(|row_idx| {
                self.iter()
                    .map(|(col_name, col_data)| {
                        let row_value = match col_data {
                            VirtualDataColumn::Boolean(v) => VirtualDataCell::Boolean(v[row_idx]),
                            VirtualDataColumn::String(v) => {
                                VirtualDataCell::String(v[row_idx].clone())
                            },
                            VirtualDataColumn::Float(v) => VirtualDataCell::Float(v[row_idx]),
                            VirtualDataColumn::Integer(v) => VirtualDataCell::Integer(v[row_idx]),
                            VirtualDataColumn::Datetime(v) => VirtualDataCell::Datetime(v[row_idx]),
                            VirtualDataColumn::IntegerIndex(v) => {
                                VirtualDataCell::IntegerIndex(v[row_idx].clone())
                            },
                            VirtualDataColumn::RowPath(v) => {
                                VirtualDataCell::RowPath(v[row_idx].clone())
                            },
                        };
                        (col_name.clone(), row_value)
                    })
                    .collect()
            })
            .collect()
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
        if let Some(grouping_id) = grouping_id
            && let Some(x) = regex::Regex::new("__ROW_PATH_([0-9]+?)__")
                .unwrap()
                .captures(name)
        {
            let group_by_index = x.get(1).unwrap().as_str().parse::<u32>()?;
            let max_grouping_id = 2_i32.pow((self.0.group_by.len() as u32) - group_by_index) - 1;
            if (grouping_id as i32) < max_grouping_id {
                
                if !self.contains_key("__ROW_PATH__") {
                    self.insert(
                        "__ROW_PATH__".to_owned(),
                        VirtualDataColumn::RowPath(vec![]),
                    );
                }

                let Some(VirtualDataColumn::RowPath(col)) = self.get_mut("__ROW_PATH__") else {
                    return Err("__ROW_PATH__ column has unexpected type".into());
                };

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
            if !self.contains_key(name) {
                self.insert(name.to_owned(), T::new_column());
            }

            let col = self
                .get_mut(name)
                .ok_or_else(|| format!("Column '{}' not found after insertion", name))?;

            Ok(value.write_to(col)?)
        }
    }
}
