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

//! SQL query builder for virtual server operations.
//!
//! This module provides a stateless SQL query generator that produces
//! generic SQL strings for perspective virtual server operations.

// TODO(texodus): Missing these features
//
// - row expand/collapse in the datagrid needs datamodel support, this is likely
//   a "collapsed" boolean column in the temp table we `UPDATE`.
//
// - `on_update` real-time support will be method which takes sa view name and a
//   handler and calls the handler when the view needs to be recalculated.
//
// Nice to have:
//
// - Optional `view_change` method can be implemented for engine optimization,
//   defaulting to just delete & recreate (as Perspective engine does now).
//
// - Would like to add a metadata API so that e.g. Viewer debug panel could show
//   internal generated SQL.

mod table_make_view;

#[cfg(test)]
mod tests;

use std::fmt;

use indexmap::IndexMap;
use serde::Deserialize;

use crate::config::{FilterTerm, GroupRollupMode, Scalar, Sort, SortDir, ViewConfig};
use crate::proto::{ColumnType, ViewPort};
use crate::virtual_server::generic_sql_model::table_make_view::ViewQueryContext;

/// Error type for SQL generation operations.
#[derive(Debug, Clone)]
pub enum GenericSQLError {
    /// A required column was not found in the schema.
    ColumnNotFound(String),
    /// An invalid configuration was provided.
    InvalidConfig(String),
    /// An unsupported operation was requested.
    UnsupportedOperation(String),
}

impl fmt::Display for GenericSQLError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ColumnNotFound(col) => write!(f, "Column not found: {}", col),
            Self::InvalidConfig(msg) => write!(f, "Invalid configuration: {}", msg),
            Self::UnsupportedOperation(msg) => write!(f, "Unsupported operation: {}", msg),
        }
    }
}

impl std::error::Error for GenericSQLError {}

/// Result type alias for SQL operations.
pub type GenericSQLResult<T> = Result<T, GenericSQLError>;

#[derive(Clone, Debug, Deserialize, Default)]
pub struct GenericSQLVirtualServerModelArgs {
    create_entity: Option<String>,
    grouping_fn: Option<String>,

    /// Separator joining `split_by` values and the column name in pivoted
    /// view column names, e.g. `"CA|Sales"` for separator `"|"`. Perspective's
    /// column-path separator is `"|"`, so any other value produces views the
    /// client will not interpret as column paths.
    column_separator: Option<String>,
}

/// Recovers the source column of a pivoted view column name — the longest
/// `config.columns` entry that is a strict suffix of `name` — with its index
/// in `config.columns`. Requires no separator knowledge, so it works at
/// protocol boundaries where the SQL model's `column_separator` is unknown.
/// Returns `None` for non-path names (e.g. flat-view columns, which equal a
/// `config.columns` entry exactly rather than strictly containing one).
pub(crate) fn column_path_source<'a>(
    name: &str,
    config: &'a ViewConfig,
) -> Option<(usize, &'a str)> {
    let mut best: Option<(usize, &'a str)> = None;
    for (idx, col) in config.columns.iter().flatten().enumerate() {
        if name.len() > col.len()
            && name.ends_with(col.as_str())
            && best.is_none_or(|(_, b)| col.len() > b.len())
        {
            best = Some((idx, col));
        }
    }

    best
}

/// Sorts pivoted view column names into Perspective's column-path order:
/// `split_by` value paths ascending, then `config.columns` order within each
/// path (e.g. `CA|price, CA|qty, NY|price, NY|qty`).
///
/// The per-column `PIVOT` join in [`ViewQueryContext`] emits columns grouped
/// by source column instead, so every egress of view column names re-sorts
/// with this. Internal `__`-prefixed columns sort first, unmatched names
/// last, both preserving relative order.
pub(crate) fn sort_column_paths<T: AsRef<str>>(names: &mut [T], config: &ViewConfig) {
    names.sort_by_cached_key(|name| {
        let name = name.as_ref();
        if name.starts_with("__") {
            return (0u8, String::new(), 0usize);
        }

        match column_path_source(name, config) {
            Some((idx, col)) => (1, name[..name.len() - col.len()].to_string(), idx),
            None => (2, String::new(), 0),
        }
    });
}

/// A stateless SQL query builder virtual server operations.
///
/// This struct generates SQL query strings without executing them, allowing
/// the caller to execute the queries against a SQL connection.
#[derive(Debug, Default, Clone)]
pub struct GenericSQLVirtualServerModel(GenericSQLVirtualServerModelArgs);

impl GenericSQLVirtualServerModel {
    /// Creates a new `GenericSQLVirtualServerModel` instance.
    pub fn new(args: GenericSQLVirtualServerModelArgs) -> Self {
        Self(args)
    }

    /// Returns the SQL query to list all hosted tables.
    ///
    /// # Returns
    /// SQL: `SHOW ALL TABLES`
    pub fn get_hosted_tables(&self) -> GenericSQLResult<String> {
        Ok("SHOW ALL TABLES".to_string())
    }

    /// Returns the SQL query to describe a table's schema.
    ///
    /// # Arguments
    /// * `table_id` - The identifier of the table to describe.
    ///
    /// # Returns
    /// SQL: `DESCRIBE {table_id}`
    pub fn table_schema(&self, table_id: &str) -> GenericSQLResult<String> {
        Ok(format!("DESCRIBE {}", table_id))
    }

    /// Returns the SQL query to get the row count of a table.
    ///
    /// # Arguments
    /// * `table_id` - The identifier of the table.
    ///
    /// # Returns
    /// SQL: `SELECT COUNT(*) FROM {table_id}`
    pub fn table_size(&self, table_id: &str) -> GenericSQLResult<String> {
        Ok(format!("SELECT COUNT(*) FROM {}", table_id))
    }

    /// Returns the SQL query to get the column count of a view.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view.
    ///
    /// # Returns
    /// SQL: `SELECT COUNT(*) FROM (DESCRIBE {view_id})`
    pub fn view_column_size(&self, view_id: &str) -> GenericSQLResult<String> {
        Ok(format!("SELECT COUNT(*) FROM (DESCRIBE {})", view_id))
    }

    /// Returns the SQL query to validate an expression against a table.
    ///
    /// # Arguments
    /// * `table_id` - The identifier of the table.
    /// * `expression` - The SQL expression to validate.
    ///
    /// # Returns
    /// SQL: `DESCRIBE (SELECT {expression} FROM {table_id})`
    pub fn table_validate_expression(
        &self,
        table_id: &str,
        expression: &str,
    ) -> GenericSQLResult<String> {
        Ok(format!(
            "DESCRIBE (SELECT {} FROM {})",
            expression, table_id
        ))
    }

    /// Returns the SQL query to delete a view.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view to delete.
    ///
    /// # Returns
    /// SQL: `DROP TABLE IF EXISTS {view_id}`
    pub fn view_delete(&self, view_id: &str) -> GenericSQLResult<String> {
        Ok(format!("DROP TABLE IF EXISTS {}", view_id))
    }

    /// Returns the SQL query to create a view from a table with the given
    /// configuration.
    ///
    /// # Arguments
    /// * `table_id` - The identifier of the source table.
    /// * `view_id` - The identifier for the new view.
    /// * `config` - The view configuration specifying columns, group_by,
    ///   split_by, etc.
    ///
    /// # Returns
    /// SQL: `CREATE TABLE {view_id} AS (...)`
    pub fn table_make_view(
        &self,
        table_id: &str,
        view_id: &str,
        config: &ViewConfig,
    ) -> GenericSQLResult<String> {
        let ctx = ViewQueryContext::new(self, table_id, config);
        let query = ctx.build_query();
        let template = self.0.create_entity.as_deref().unwrap_or("TABLE");
        Ok(format!("CREATE {} {} AS ({})", template, view_id, query))
    }

    /// Returns the SQL query to fetch data from a view with the given viewport.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view.
    /// * `config` - The view configuration.
    /// * `viewport` - The viewport specifying row/column ranges.
    /// * `schema` - The schema of the view (column names to types).
    ///
    /// # Returns
    /// SQL: `SELECT ... FROM {view_id} LIMIT ... OFFSET ...`
    pub fn view_get_data(
        &self,
        view_id: &str,
        config: &ViewConfig,
        viewport: &ViewPort,
        schema: &IndexMap<String, ColumnType>,
    ) -> GenericSQLResult<String> {
        let group_by = &config.group_by;
        let sort = &config.sort;
        let start_col = viewport.start_col.unwrap_or(0) as usize;
        let end_col = viewport.end_col.map(|x| x as usize);
        let start_row = viewport.start_row.unwrap_or(0);
        let end_row = viewport.end_row;
        let limit_clause = if let Some(end) = end_row {
            format!("LIMIT {} OFFSET {}", end - start_row, start_row)
        } else {
            String::new()
        };

        let mut data_columns: Vec<&String> = schema
            .keys()
            .filter(|col_name| !col_name.starts_with("__"))
            .collect();

        let col_sort_dir = sort.iter().find_map(|Sort(_, dir)| match dir {
            SortDir::ColAsc | SortDir::ColAscAbs => Some(true),
            SortDir::ColDesc | SortDir::ColDescAbs => Some(false),
            _ => None,
        });

        if let Some(ascending) = col_sort_dir {
            if ascending {
                data_columns.sort();
            } else {
                data_columns.sort_by(|a, b| b.cmp(a));
            }
        } else if !config.split_by.is_empty() {
            sort_column_paths(&mut data_columns, config);
        }

        let data_columns: Vec<&String> = data_columns
            .into_iter()
            .skip(start_col)
            .take(end_col.map(|e| e - start_col).unwrap_or(usize::MAX))
            .collect();

        let mut group_by_cols: Vec<String> = Vec::new();
        if !group_by.is_empty() {
            if config.group_rollup_mode != GroupRollupMode::Flat {
                group_by_cols.push("\"__GROUPING_ID__\"".to_string());
            }
            for idx in 0..group_by.len() {
                group_by_cols.push(format!("\"__ROW_PATH_{}__\"", idx));
            }
        }

        let all_columns: Vec<String> = group_by_cols
            .into_iter()
            .chain(data_columns.iter().map(|col| format!("\"{}\"", col)))
            .collect();

        Ok(format!(
            "SELECT {} FROM {} {}",
            all_columns.join(", "),
            view_id,
            limit_clause
        )
        .trim()
        .to_string())
    }

    /// Returns the SQL query to describe a view's schema.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view.
    ///
    /// # Returns
    /// SQL: `DESCRIBE {view_id}`
    pub fn view_schema(&self, view_id: &str) -> GenericSQLResult<String> {
        Ok(format!("DESCRIBE {}", view_id))
    }

    /// Returns the SQL query to get the row count of a view.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view.
    ///
    /// # Returns
    /// SQL: `SELECT COUNT(*) FROM {view_id}`
    pub fn view_size(&self, view_id: &str) -> GenericSQLResult<String> {
        Ok(format!("SELECT COUNT(*) FROM {}", view_id))
    }

    /// Returns the SQL query to get the min and max values of a column.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view.
    /// * `column_name` - The name of the column.
    /// * `config` - The view configuration.
    ///
    /// # Returns
    /// SQL: `SELECT MIN("column_name"), MAX("column_name") FROM {view_id}`
    /// When the view uses ROLLUP grouping (non-flat mode with group_by),
    /// a `WHERE __GROUPING_ID__ = 0` clause is added to exclude non-leaf rows.
    pub fn view_get_min_max(
        &self,
        view_id: &str,
        column_name: &str,
        config: &ViewConfig,
    ) -> GenericSQLResult<String> {
        let has_grouping_id =
            !config.group_by.is_empty() && config.group_rollup_mode != GroupRollupMode::Flat;
        let where_clause = if has_grouping_id {
            " WHERE __GROUPING_ID__ = 0"
        } else {
            ""
        };

        Ok(format!(
            "SELECT MIN(\"{}\"), MAX(\"{}\") FROM {}{}",
            column_name, column_name, view_id, where_clause
        ))
    }

    fn filter_term_to_sql(term: &FilterTerm) -> Option<String> {
        match term {
            FilterTerm::Scalar(scalar) => Self::scalar_to_sql(scalar),
            FilterTerm::Array(scalars) => {
                let values: Vec<String> = scalars.iter().filter_map(Self::scalar_to_sql).collect();
                if values.is_empty() {
                    None
                } else {
                    Some(format!("({})", values.join(", ")))
                }
            },
        }
    }

    fn scalar_to_sql(scalar: &Scalar) -> Option<String> {
        match scalar {
            Scalar::Null => None,
            Scalar::Bool(b) => Some(if *b { "TRUE" } else { "FALSE" }.to_string()),
            Scalar::Float(f) => Some(f.to_string()),
            Scalar::String(s) => Some(format!("'{}'", s.replace('\'', "''"))),
        }
    }
}
