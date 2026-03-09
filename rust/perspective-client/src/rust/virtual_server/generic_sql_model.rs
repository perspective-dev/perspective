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
// - `min_max` API for value-coloring and value-sizing.
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
