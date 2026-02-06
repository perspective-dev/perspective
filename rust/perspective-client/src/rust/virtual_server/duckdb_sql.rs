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

//! DuckDB SQL query builder for virtual server operations.
//!
//! This module provides a stateless SQL query generator that produces
//! DuckDB-compatible SQL strings for perspective virtual server operations.

use std::borrow::Cow;
use std::fmt;

use indexmap::IndexMap;

use super::features::{AggSpec, Features};
use crate::config::{Aggregate, FilterTerm, Scalar, Sort, SortDir, ViewConfig};
use crate::proto::{ColumnType, ViewPort};

/// Error type for DuckDB SQL generation operations.
#[derive(Debug, Clone)]
pub enum DuckDBSqlError {
    /// A required column was not found in the schema.
    ColumnNotFound(String),
    /// An invalid configuration was provided.
    InvalidConfig(String),
    /// An unsupported operation was requested.
    UnsupportedOperation(String),
}

impl fmt::Display for DuckDBSqlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ColumnNotFound(col) => write!(f, "Column not found: {}", col),
            Self::InvalidConfig(msg) => write!(f, "Invalid configuration: {}", msg),
            Self::UnsupportedOperation(msg) => write!(f, "Unsupported operation: {}", msg),
        }
    }
}

impl std::error::Error for DuckDBSqlError {}

/// Result type alias for DuckDB SQL operations.
pub type DuckDBSqlResult<T> = Result<T, DuckDBSqlError>;

/// A stateless SQL query builder for DuckDB virtual server operations.
///
/// This struct generates SQL query strings without executing them, allowing
/// the caller to execute the queries against a DuckDB connection.
#[derive(Debug, Default, Clone)]
pub struct DuckDBSqlBuilder;

impl DuckDBSqlBuilder {
    /// Creates a new `DuckDBSqlBuilder` instance.
    pub fn new() -> Self {
        Self
    }

    /// Returns the features supported by DuckDB virtual server.
    ///
    /// This includes supported aggregates, filter operators, and other
    /// capabilities.
    pub fn get_features(&self) -> Features<'static> {
        const NUMBER_AGGS: &[&str] = &[
            "sum",
            "count",
            "any_value",
            "arbitrary",
            "array_agg",
            "avg",
            "bit_and",
            "bit_or",
            "bit_xor",
            "bitstring_agg",
            "bool_and",
            "bool_or",
            "countif",
            "favg",
            "fsum",
            "geomean",
            "kahan_sum",
            "last",
            "max",
            "min",
            "product",
            "string_agg",
            "sumkahan",
        ];

        const STRING_AGGS: &[&str] = &[
            "count",
            "any_value",
            "arbitrary",
            "first",
            "countif",
            "last",
            "string_agg",
        ];

        const FILTER_OPS: &[&str] = &[
            "==",
            "!=",
            "LIKE",
            "IS DISTINCT FROM",
            "IS NOT DISTINCT FROM",
            ">=",
            "<=",
            ">",
            "<",
        ];

        let filter_ops: IndexMap<ColumnType, Vec<Cow<'static, str>>> = [
            ColumnType::Integer,
            ColumnType::Float,
            ColumnType::String,
            ColumnType::Boolean,
            ColumnType::Date,
            ColumnType::Datetime,
        ]
        .into_iter()
        .map(|ty| (ty, FILTER_OPS.iter().map(|&s| Cow::Borrowed(s)).collect()))
        .collect();

        let number_aggs: Vec<AggSpec<'static>> = NUMBER_AGGS
            .iter()
            .map(|&s| AggSpec::Single(Cow::Borrowed(s)))
            .collect();

        let string_aggs: Vec<AggSpec<'static>> = STRING_AGGS
            .iter()
            .map(|&s| AggSpec::Single(Cow::Borrowed(s)))
            .collect();

        let aggregates: IndexMap<ColumnType, Vec<AggSpec<'static>>> = [
            (ColumnType::Integer, number_aggs.clone()),
            (ColumnType::Float, number_aggs),
            (ColumnType::String, string_aggs.clone()),
            (ColumnType::Boolean, string_aggs.clone()),
            (ColumnType::Date, string_aggs.clone()),
            (ColumnType::Datetime, string_aggs),
        ]
        .into_iter()
        .collect();

        Features {
            group_by: true,
            split_by: true,
            sort: true,
            expressions: true,
            filter_ops,
            aggregates,
            on_update: false,
        }
    }

    /// Converts a DuckDB type name to a Perspective ColumnType.
    ///
    /// # Arguments
    /// * `name` - The DuckDB type name (e.g., "VARCHAR", "INTEGER", "DOUBLE")
    ///
    /// # Returns
    /// The corresponding Perspective ColumnType, or an error if the type is
    /// unknown.
    pub fn duckdb_type_to_psp(&self, name: &str) -> DuckDBSqlResult<ColumnType> {
        if name == "VARCHAR" || name == "Utf8" {
            return Ok(ColumnType::String);
        }
        if name == "DOUBLE"
            || name == "BIGINT"
            || name == "HUGEINT"
            || name == "Float64"
            || name.starts_with("Decimal")
        {
            return Ok(ColumnType::Float);
        }
        if name.starts_with("Int") || name == "INTEGER" {
            return Ok(ColumnType::Integer);
        }
        if name == "Date32<DAY>" || name == "DATE" {
            return Ok(ColumnType::Date);
        }
        if name == "BOOLEAN" {
            return Ok(ColumnType::Boolean);
        }
        if name == "TIMESTAMP" || name.starts_with("Timestamp") {
            return Ok(ColumnType::Datetime);
        }
        Err(DuckDBSqlError::UnsupportedOperation(format!(
            "Unknown type '{}'",
            name
        )))
    }

    /// Returns the SQL query to list all hosted tables.
    ///
    /// # Returns
    /// SQL: `SHOW ALL TABLES`
    pub fn get_hosted_tables(&self) -> DuckDBSqlResult<String> {
        Ok("SHOW ALL TABLES".to_string())
    }

    /// Returns the SQL query to describe a table's schema.
    ///
    /// # Arguments
    /// * `table_id` - The identifier of the table to describe.
    ///
    /// # Returns
    /// SQL: `DESCRIBE {table_id}`
    pub fn table_schema(&self, table_id: &str) -> DuckDBSqlResult<String> {
        Ok(format!("DESCRIBE {}", table_id))
    }

    /// Returns the SQL query to get the row count of a table.
    ///
    /// # Arguments
    /// * `table_id` - The identifier of the table.
    ///
    /// # Returns
    /// SQL: `SELECT COUNT(*) FROM {table_id}`
    pub fn table_size(&self, table_id: &str) -> DuckDBSqlResult<String> {
        Ok(format!("SELECT COUNT(*) FROM {}", table_id))
    }

    /// Returns the SQL query to get the column count of a view.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view.
    ///
    /// # Returns
    /// SQL: `SELECT COUNT(*) FROM (DESCRIBE {view_id})`
    pub fn view_column_size(&self, view_id: &str) -> DuckDBSqlResult<String> {
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
    ) -> DuckDBSqlResult<String> {
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
    pub fn view_delete(&self, view_id: &str) -> DuckDBSqlResult<String> {
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
    ) -> DuckDBSqlResult<String> {
        let columns = &config.columns;
        let group_by = &config.group_by;
        let split_by = &config.split_by;
        let aggregates = &config.aggregates;
        let sort = &config.sort;
        let expressions = &config.expressions.0;
        let filter = &config.filter;

        let col_name = |col: &str| -> String {
            expressions
                .get(col)
                .cloned()
                .unwrap_or_else(|| format!("\"{}\"", col))
        };

        let get_aggregate = |col: &str| -> Option<&Aggregate> { aggregates.get(col) };

        let generate_select_clauses = || -> Vec<String> {
            let mut clauses = Vec::new();

            if !group_by.is_empty() {
                for col in columns.iter().flatten() {
                    let agg = get_aggregate(col)
                        .map(Self::aggregate_to_string)
                        .unwrap_or_else(|| "any_value".to_string());
                    clauses.push(format!("{}({}) as \"{}\"", agg, col_name(col), col));
                }

                if split_by.is_empty() {
                    for (idx, gb_col) in group_by.iter().enumerate() {
                        clauses.push(format!("{} as __ROW_PATH_{}__", col_name(gb_col), idx));
                    }

                    let groups = group_by.iter().map(|c| col_name(c)).collect::<Vec<_>>();
                    clauses.push(format!(
                        "GROUPING_ID({}) AS __GROUPING_ID__",
                        groups.join(", ")
                    ));
                }
            } else if !columns.is_empty() {
                for col in columns.iter().flatten() {
                    let escaped_col = col.replace('"', "\"\"");
                    clauses.push(format!("{} as \"{}\"", col_name(col), escaped_col));
                }
            }

            clauses
        };

        let mut order_by_clauses: Vec<String> = Vec::new();
        let mut window_clauses: Vec<String> = Vec::new();
        let mut where_clauses: Vec<String> = Vec::new();

        if !group_by.is_empty() {
            for gidx in 0..group_by.len() {
                let groups = group_by[..=gidx]
                    .iter()
                    .map(|c| col_name(c))
                    .collect::<Vec<_>>()
                    .join(", ");

                if split_by.is_empty() {
                    order_by_clauses.push(format!("GROUPING_ID({}) DESC", groups));
                }

                for Sort(sort_col, sort_dir) in sort {
                    if *sort_dir != SortDir::None {
                        let agg = get_aggregate(sort_col)
                            .map(Self::aggregate_to_string)
                            .unwrap_or_else(|| "any_value".to_string());
                        let dir_str = Self::sort_dir_to_string(sort_dir);

                        if gidx >= group_by.len() - 1 {
                            order_by_clauses.push(format!(
                                "{}({}) {}",
                                agg,
                                col_name(sort_col),
                                dir_str
                            ));
                        } else {
                            order_by_clauses.push(format!(
                                "first({}({})) OVER __WINDOW_{}__ {}",
                                agg,
                                col_name(sort_col),
                                gidx,
                                dir_str
                            ));
                        }
                    }
                }

                order_by_clauses.push(format!("__ROW_PATH_{}__ ASC", gidx));
            }
        } else {
            for Sort(sort_col, sort_dir) in sort {
                if *sort_dir != SortDir::None {
                    let dir_str = Self::sort_dir_to_string(sort_dir);
                    order_by_clauses.push(format!("{} {}", col_name(sort_col), dir_str));
                }
            }
        }

        if !sort.is_empty() && group_by.len() > 1 {
            for gidx in 0..(group_by.len() - 1) {
                let partition = (0..=gidx)
                    .map(|i| format!("__ROW_PATH_{}__", i))
                    .collect::<Vec<_>>()
                    .join(", ");

                let sub_groups = group_by[..=gidx]
                    .iter()
                    .map(|c| col_name(c))
                    .collect::<Vec<_>>()
                    .join(", ");

                let groups = group_by.iter().map(|c| col_name(c)).collect::<Vec<_>>();

                window_clauses.push(format!(
                    "__WINDOW_{}__ AS (PARTITION BY GROUPING_ID({}), {} ORDER BY {})",
                    gidx,
                    sub_groups,
                    partition,
                    groups.join(", ")
                ));
            }
        }

        for flt in filter {
            let term = Self::filter_term_to_sql(flt.term());
            if let Some(term_lit) = term {
                where_clauses.push(format!(
                    "{} {} {}",
                    col_name(flt.column()),
                    flt.op(),
                    term_lit
                ));
            }
        }

        let mut query = if !split_by.is_empty() {
            format!("SELECT * FROM {}", table_id)
        } else {
            let select_clauses = generate_select_clauses();
            format!("SELECT {} FROM {}", select_clauses.join(", "), table_id)
        };

        if !where_clauses.is_empty() {
            query = format!("{} WHERE {}", query, where_clauses.join(" AND "));
        }

        if !split_by.is_empty() {
            let groups = group_by.iter().map(|c| col_name(c)).collect::<Vec<_>>();
            let group_aliases = group_by
                .iter()
                .enumerate()
                .map(|(i, c)| format!("{} AS __ROW_PATH_{}__", col_name(c), i))
                .collect::<Vec<_>>()
                .join(", ");
            let pivot_on = split_by
                .iter()
                .map(|c| format!("\"{}\"", c))
                .collect::<Vec<_>>()
                .join(", ");
            let pivot_using = generate_select_clauses().join(", ");

            query = format!(
                "SELECT * EXCLUDE ({}) , {} FROM ( PIVOT ({}) ON {} USING {} GROUP BY {} )",
                groups.join(", "),
                group_aliases,
                query,
                pivot_on,
                pivot_using,
                groups.join(", ")
            );
        } else if !group_by.is_empty() {
            let groups = group_by.iter().map(|c| col_name(c)).collect::<Vec<_>>();
            query = format!("{} GROUP BY ROLLUP({})", query, groups.join(", "));
        }

        if !window_clauses.is_empty() {
            query = format!("{} WINDOW {}", query, window_clauses.join(", "));
        }

        if !order_by_clauses.is_empty() {
            query = format!("{} ORDER BY {}", query, order_by_clauses.join(", "));
        }

        Ok(format!("CREATE TABLE {} AS ({})", view_id, query))
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
    ) -> DuckDBSqlResult<String> {
        let group_by = &config.group_by;
        let split_by = &config.split_by;
        let start_col = viewport.start_col.unwrap_or(0) as usize;
        let end_col = viewport.end_col.map(|x| x as usize);
        let start_row = viewport.start_row.unwrap_or(0);
        let end_row = viewport.end_row;
        let limit_clause = if let Some(end) = end_row {
            format!("LIMIT {} OFFSET {}", end - start_row, start_row)
        } else {
            String::new()
        };

        let data_columns: Vec<&String> = schema
            .keys()
            .filter(|col_name| !col_name.starts_with("__"))
            .skip(start_col)
            .take(end_col.map(|e| e - start_col).unwrap_or(usize::MAX))
            .collect();

        let mut group_by_cols: Vec<String> = Vec::new();
        if !group_by.is_empty() {
            if split_by.is_empty() {
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
    pub fn view_schema(&self, view_id: &str) -> DuckDBSqlResult<String> {
        Ok(format!("DESCRIBE {}", view_id))
    }

    /// Returns the SQL query to get the row count of a view.
    ///
    /// # Arguments
    /// * `view_id` - The identifier of the view.
    ///
    /// # Returns
    /// SQL: `SELECT COUNT(*) FROM {view_id}`
    pub fn view_size(&self, view_id: &str) -> DuckDBSqlResult<String> {
        Ok(format!("SELECT COUNT(*) FROM {}", view_id))
    }

    fn aggregate_to_string(agg: &Aggregate) -> String {
        match agg {
            Aggregate::SingleAggregate(name) => name.clone(),
            Aggregate::MultiAggregate(name, _args) => name.clone(),
        }
    }

    fn sort_dir_to_string(dir: &SortDir) -> &'static str {
        match dir {
            SortDir::None => "",
            SortDir::Asc | SortDir::ColAsc | SortDir::AscAbs | SortDir::ColAscAbs => "ASC",
            SortDir::Desc | SortDir::ColDesc | SortDir::DescAbs | SortDir::ColDescAbs => "DESC",
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_hosted_tables() {
        let builder = DuckDBSqlBuilder::new();
        assert_eq!(builder.get_hosted_tables().unwrap(), "SHOW ALL TABLES");
    }

    #[test]
    fn test_table_schema() {
        let builder = DuckDBSqlBuilder::new();
        assert_eq!(
            builder.table_schema("my_table").unwrap(),
            "DESCRIBE my_table"
        );
    }

    #[test]
    fn test_table_size() {
        let builder = DuckDBSqlBuilder::new();
        assert_eq!(
            builder.table_size("my_table").unwrap(),
            "SELECT COUNT(*) FROM my_table"
        );
    }

    #[test]
    fn test_view_delete() {
        let builder = DuckDBSqlBuilder::new();
        assert_eq!(
            builder.view_delete("my_view").unwrap(),
            "DROP TABLE IF EXISTS my_view"
        );
    }

    #[test]
    fn test_table_make_view_simple() {
        let builder = DuckDBSqlBuilder::new();
        let mut config = ViewConfig::default();
        config.columns = vec![Some("col1".to_string()), Some("col2".to_string())];
        let sql = builder
            .table_make_view("source_table", "dest_view", &config)
            .unwrap();

        assert!(sql.starts_with("CREATE TABLE dest_view AS"));
        assert!(sql.contains("\"col1\""));
        assert!(sql.contains("\"col2\""));
    }

    #[test]
    fn test_table_make_view_with_group_by() {
        let builder = DuckDBSqlBuilder::new();
        let mut config = ViewConfig::default();
        config.columns = vec![Some("value".to_string())];
        config.group_by = vec!["category".to_string()];
        let sql = builder
            .table_make_view("source_table", "dest_view", &config)
            .unwrap();

        assert!(sql.contains("GROUP BY ROLLUP"));
        assert!(sql.contains("__ROW_PATH_0__"));
        assert!(sql.contains("__GROUPING_ID__"));
    }

    #[test]
    fn test_view_get_data() {
        let builder = DuckDBSqlBuilder::new();
        let config = ViewConfig::default();
        let viewport = ViewPort {
            start_row: Some(0),
            end_row: Some(100),
            start_col: Some(0),
            end_col: Some(5),
        };

        let mut schema = IndexMap::new();
        schema.insert("col1".to_string(), ColumnType::String);
        schema.insert("col2".to_string(), ColumnType::Integer);
        let sql = builder
            .view_get_data("my_view", &config, &viewport, &schema)
            .unwrap();

        assert!(sql.contains("SELECT"));
        assert!(sql.contains("FROM my_view"));
        assert!(sql.contains("LIMIT 100 OFFSET 0"));
    }
}
