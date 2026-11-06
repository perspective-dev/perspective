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

use std::collections::HashMap;

use super::*;
use crate::config::{
    Aggregate, Expressions, GroupRollupMode, Sort, SortDir, WindowFrame, WindowSort, WindowSortDir,
    WindowSpec, Windows,
};

#[test]
fn test_get_hosted_tables() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    assert_eq!(builder.get_hosted_tables().unwrap(), "SHOW ALL TABLES");
}

#[test]
fn test_table_schema() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    assert_eq!(
        builder.table_schema("my_table").unwrap(),
        "DESCRIBE my_table"
    );
}

#[test]
fn test_table_size() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    assert_eq!(
        builder.table_size("my_table").unwrap(),
        "SELECT COUNT(*) FROM my_table"
    );
}

#[test]
fn test_view_delete() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    assert_eq!(
        builder.view_delete("my_view").unwrap(),
        "DROP TABLE IF EXISTS my_view"
    );
}

#[test]
fn test_table_make_view_simple() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("col1".to_string()), Some("col2".to_string())];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.starts_with("CREATE TABLE dest_view AS"));
    assert!(sql.contains("\"col1\""));
    assert!(sql.contains("\"col2\""));
}

#[test]
fn test_table_make_view_with_group_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("GROUP BY ROLLUP"));
    assert!(sql.contains("__ROW_PATH_0__"));
    assert!(sql.contains("__GROUPING_ID__"));
}

#[test]
fn test_table_make_view_with_group_by_and_split_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("GROUP BY ROLLUP"), "expected ROLLUP: {}", sql);
    assert!(sql.contains("PIVOT"), "expected PIVOT: {}", sql);
    assert!(
        sql.contains("__ROW_PATH_0__"),
        "expected __ROW_PATH_0__: {}",
        sql
    );

    assert!(
        sql.contains("__GROUPING_ID__"),
        "expected __GROUPING_ID__: {}",
        sql
    );
}

#[test]
fn test_table_make_view_with_sort_group_by_and_split_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::Asc)];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);

    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("__SORT_0__"), "expected __SORT_0__: {}", sql);
    assert!(
        sql.contains("\"__GROUPING_ID__\", \"__SORT_0__\""),
        "expected __SORT_0__ in GROUP BY: {}",
        sql
    );

    assert!(
        sql.contains("\"__SORT_0__\" ASC"),
        "expected __SORT_0__ ASC in ORDER BY: {}",
        sql
    );

    assert!(
        !sql.contains("sum(\"value\") ASC"),
        "should not have raw aggregate in ORDER BY: {}",
        sql
    );
}

#[test]
fn test_table_make_view_with_sort_multi_group_by_and_split_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["region".to_string(), "category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::Asc)];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);

    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("PARTITION BY (\"__GROUPING_ID__\" >> 1)"),
        "expected shifted __GROUPING_ID__ in window: {}",
        sql
    );

    assert!(
        sql.contains(
            "first_value(\"__SORT_0__\") OVER (PARTITION BY (\"__GROUPING_ID__\" >> 1), \
             \"__ROW_PATH_0__\" ORDER BY \"__ROW_PATH_0__\", \"__ROW_PATH_1__\")"
        ),
        "expected inline window for first_value(\"__SORT_0__\"): {}",
        sql
    );

    assert!(
        !sql.contains(" WINDOW "),
        "should not emit a named WINDOW clause: {}",
        sql
    );

    assert!(
        !sql.contains("GROUPING_ID(\"region\")"),
        "should not have GROUPING_ID function in window: {}",
        sql
    );
}

#[test]
fn test_table_make_view_with_sort_multi_group_by_partitions_by_group_columns() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["region".to_string(), "category".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::Desc)];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);

    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains(
            "first_value(sum(\"value\")) OVER (PARTITION BY GROUPING_ID(\"region\"), \"region\" \
             ORDER BY \"region\", \"category\") DESC"
        ),
        "expected inline window partitioned by group columns: {}",
        sql
    );

    assert!(
        !sql.contains(" WINDOW "),
        "should not emit a named WINDOW clause: {}",
        sql
    );
}

#[test]
fn test_table_make_view_with_sort_and_group_by_no_split_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::Asc)];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);

    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("sum(\"value\") ASC"),
        "expected raw aggregate in ORDER BY: {}",
        sql
    );

    assert!(
        !sql.contains("__SORT_0__"),
        "should not have __SORT_0__ without split_by: {}",
        sql
    );
}

#[test]
fn test_table_make_view_col_sort_excludes_row_order_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::ColAsc)];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);

    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        !sql.contains("__SORT_0__"),
        "col sort should not produce __SORT_0__: {}",
        sql
    );

    assert!(
        !sql.contains("sum(\"value\") ASC"),
        "col sort should not produce row ORDER BY: {}",
        sql
    );

    assert!(sql.contains("PIVOT"), "should still have PIVOT: {}", sql);
}

#[test]
fn test_table_make_view_mixed_row_and_col_sort() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string()), Some("qty".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    config.sort = vec![
        Sort("value".to_string(), SortDir::ColDesc),
        Sort("qty".to_string(), SortDir::Asc),
    ];

    config.aggregates = HashMap::from([
        (
            "value".to_string(),
            Aggregate::SingleAggregate("sum".to_string()),
        ),
        (
            "qty".to_string(),
            Aggregate::SingleAggregate("sum".to_string()),
        ),
    ]);

    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        !sql.contains("__SORT_0__"),
        "col sort (idx 0) should not produce __SORT_0__: {}",
        sql
    );

    assert!(
        sql.contains("__SORT_1__"),
        "row sort (idx 1) should produce __SORT_1__: {}",
        sql
    );
}

#[test]
fn test_table_make_view_pivoted_with_sort() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.split_by = vec!["quarter".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::Desc)];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("PIVOT"), "expected PIVOT: {}", sql);
    assert!(
        sql.contains("ROW_NUMBER() OVER (ORDER BY \"value\" DESC)"),
        "expected sort in ROW_NUMBER window: {}",
        sql
    );
    assert!(
        sql.ends_with("ORDER BY \"__ROW_NUM__\")"),
        "should end with ORDER BY \"__ROW_NUM__\": {}",
        sql
    );
}

#[test]
fn test_view_get_data_col_sort_ascending() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.sort = vec![Sort("value".to_string(), SortDir::ColAsc)];
    let viewport = ViewPort {
        start_row: Some(0),
        end_row: Some(100),
        start_col: Some(0),
        end_col: None,
        ..ViewPort::default()
    };

    let mut schema = IndexMap::new();
    schema.insert("C_value".to_string(), ColumnType::Float);
    schema.insert("A_value".to_string(), ColumnType::Float);
    schema.insert("B_value".to_string(), ColumnType::Float);
    let sql = builder
        .view_get_data("my_view", &config, &viewport, &schema)
        .unwrap();

    let a_pos = sql.find("\"A_value\"").unwrap();
    let b_pos = sql.find("\"B_value\"").unwrap();
    let c_pos = sql.find("\"C_value\"").unwrap();
    assert!(
        a_pos < b_pos && b_pos < c_pos,
        "col asc should order columns A < B < C: {}",
        sql
    );
}

#[test]
fn test_view_get_data_col_sort_descending() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.sort = vec![Sort("value".to_string(), SortDir::ColDesc)];
    let viewport = ViewPort {
        start_row: Some(0),
        end_row: Some(100),
        start_col: Some(0),
        end_col: None,
        ..ViewPort::default()
    };

    let mut schema = IndexMap::new();
    schema.insert("A_value".to_string(), ColumnType::Float);
    schema.insert("C_value".to_string(), ColumnType::Float);
    schema.insert("B_value".to_string(), ColumnType::Float);
    let sql = builder
        .view_get_data("my_view", &config, &viewport, &schema)
        .unwrap();

    let a_pos = sql.find("\"A_value\"").unwrap();
    let b_pos = sql.find("\"B_value\"").unwrap();
    let c_pos = sql.find("\"C_value\"").unwrap();
    assert!(
        c_pos < b_pos && b_pos < a_pos,
        "col desc should order columns C > B > A: {}",
        sql
    );
}

#[test]
fn test_view_get_data() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let config = ViewConfig::default();
    let viewport = ViewPort {
        start_row: Some(0),
        end_row: Some(100),
        start_col: Some(0),
        end_col: Some(5),
        ..ViewPort::default()
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

#[test]
fn test_table_make_view_flat_group_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.group_rollup_mode = GroupRollupMode::Flat;
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("GROUP BY \"category\""),
        "expected plain GROUP BY: {}",
        sql
    );
    assert!(
        !sql.contains("ROLLUP"),
        "should not contain ROLLUP: {}",
        sql
    );
    assert!(
        !sql.contains("__GROUPING_ID__"),
        "should not contain __GROUPING_ID__: {}",
        sql
    );
    assert!(
        sql.contains("__ROW_PATH_0__"),
        "should contain __ROW_PATH_0__: {}",
        sql
    );
}

#[test]
fn test_table_make_view_flat_group_by_with_split_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    config.group_rollup_mode = GroupRollupMode::Flat;
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("PIVOT"), "expected PIVOT: {}", sql);
    assert!(
        !sql.contains("ROLLUP"),
        "should not contain ROLLUP: {}",
        sql
    );
    assert!(
        !sql.contains("__GROUPING_ID__"),
        "should not contain __GROUPING_ID__: {}",
        sql
    );
    assert!(
        sql.contains("__ROW_PATH_0__"),
        "should contain __ROW_PATH_0__: {}",
        sql
    );
}

#[test]
fn test_table_make_view_flat_group_by_with_sort() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::Asc)];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);
    config.group_rollup_mode = GroupRollupMode::Flat;
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("sum(\"value\") ASC"),
        "expected direct aggregate in ORDER BY: {}",
        sql
    );
    assert!(
        !sql.contains("ROLLUP"),
        "should not contain ROLLUP: {}",
        sql
    );
    assert!(
        !sql.contains("__WINDOW_"),
        "should not contain WINDOW clauses: {}",
        sql
    );
}

#[test]
fn test_table_make_view_flat_group_by_with_split_by_and_sort() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    config.sort = vec![Sort("value".to_string(), SortDir::Desc)];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);
    config.group_rollup_mode = GroupRollupMode::Flat;
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("PIVOT"), "expected PIVOT: {}", sql);
    assert!(
        !sql.contains("ROLLUP"),
        "should not contain ROLLUP: {}",
        sql
    );
    assert!(
        !sql.contains("__GROUPING_ID__"),
        "should not contain __GROUPING_ID__: {}",
        sql
    );
    assert!(
        sql.contains("__SORT_0__"),
        "expected __SORT_0__ for flat+pivoted+sort: {}",
        sql
    );
    assert!(
        sql.contains("\"__SORT_0__\" DESC"),
        "expected __SORT_0__ DESC in ORDER BY: {}",
        sql
    );
    assert!(
        !sql.contains("sum(\"value\") DESC"),
        "should not have raw aggregate in ORDER BY: {}",
        sql
    );
}

#[test]
fn test_view_get_data_flat_no_grouping_id() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.group_by = vec!["category".to_string()];
    config.group_rollup_mode = GroupRollupMode::Flat;
    let viewport = ViewPort {
        start_row: Some(0),
        end_row: Some(100),
        start_col: Some(0),
        end_col: None,
        ..ViewPort::default()
    };

    let mut schema = IndexMap::new();
    schema.insert("value".to_string(), ColumnType::Float);
    let sql = builder
        .view_get_data("my_view", &config, &viewport, &schema)
        .unwrap();

    assert!(
        !sql.contains("__GROUPING_ID__"),
        "flat mode should not select __GROUPING_ID__: {}",
        sql
    );
    assert!(
        sql.contains("__ROW_PATH_0__"),
        "flat mode should still select __ROW_PATH_0__: {}",
        sql
    );
}

#[test]
fn test_table_make_view_total() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_rollup_mode = GroupRollupMode::Total;
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("sum(\"value\")"),
        "expected aggregate function: {}",
        sql
    );
    assert!(
        !sql.contains("GROUP BY"),
        "should not contain GROUP BY: {}",
        sql
    );
    assert!(
        !sql.contains("ORDER BY"),
        "should not contain ORDER BY: {}",
        sql
    );
}

#[test]
fn test_table_make_view_flat_preserves_underscores() {
    // https://github.com/perspective-dev/perspective/issues/3187
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("account_number".to_string())];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("\"account_number\" as \"account_number\""),
        "underscore names should pass through verbatim: {}",
        sql
    );
    assert!(
        !sql.contains("account-number"),
        "underscores should not be mangled to hyphens: {}",
        sql
    );
}

#[test]
fn test_table_make_view_pivoted_column_paths() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![
        Some("account_number".to_string()),
        Some("other_val".to_string()),
    ];
    config.split_by = vec!["state".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("ON \"state\" || '|account_number' USING first(\"account_number\")"),
        "expected per-column ON expression: {}",
        sql
    );
    assert!(
        sql.contains("ON \"state\" || '|other_val' USING first(\"other_val\")"),
        "expected per-column ON expression: {}",
        sql
    );
    assert!(
        !sql.contains("account-number"),
        "underscores should not be mangled to hyphens: {}",
        sql
    );
    assert!(
        sql.contains("IS NOT DISTINCT FROM"),
        "multi-column pivots should be NULL-safe joined: {}",
        sql
    );
}

#[test]
fn test_table_make_view_pivoted_custom_separator() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs {
        column_separator: Some("::".to_string()),
        ..Default::default()
    });

    let mut config = ViewConfig::default();
    config.columns = vec![Some("account_number".to_string())];
    config.split_by = vec!["state".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("ON \"state\" || '::account_number'"),
        "expected custom separator in ON expression: {}",
        sql
    );
}

#[test]
fn test_table_make_view_multi_split_by_separator() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.split_by = vec!["region".to_string(), "state".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("ON \"region\" || '|' || \"state\" || '|value'"),
        "expected separator-joined multi-level ON expression: {}",
        sql
    );
}

#[test]
fn test_table_make_view_grouped_pivoted_null_safe_join() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string()), Some("qty".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["quarter".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("GROUP BY \"__ROW_PATH_0__\", \"__GROUPING_ID__\""),
        "expected pivot GROUP BY on row keys: {}",
        sql
    );
    assert!(
        sql.contains(
            "__PSP_PIVOT_0__.\"__ROW_PATH_0__\" IS NOT DISTINCT FROM \
             __PSP_PIVOT_1__.\"__ROW_PATH_0__\""
        ),
        "rollup rows have NULL row-path keys, join must be NULL-safe: {}",
        sql
    );
}

#[test]
fn test_table_make_view_total_pivoted_aggregate() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.split_by = vec!["quarter".to_string()];
    config.group_rollup_mode = GroupRollupMode::Total;
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("ON \"quarter\" || '|value' USING sum(\"value\")"),
        "expected unaliased aggregate in USING: {}",
        sql
    );
}

#[test]
fn test_column_path_source() {
    let mut config = ViewConfig::default();
    config.split_by = vec!["state".to_string()];
    config.columns = vec![
        Some("price".to_string()),
        Some("total_price".to_string()),
        Some("account_number".to_string()),
    ];

    // Path names resolve to their source column, longest suffix winning.
    assert_eq!(column_path_source("CA|price", &config), Some((0, "price")));
    assert_eq!(
        column_path_source("CA|total_price", &config),
        Some((1, "total_price"))
    );
    assert_eq!(
        column_path_source("us_east|account_number", &config),
        Some((2, "account_number"))
    );

    // Flat-view names equal a config column exactly — not a path.
    assert_eq!(column_path_source("price", &config), None);
    assert_eq!(column_path_source("__ROW_PATH_0__", &config), None);
}

#[test]
fn test_column_path_source_no_split_by_never_matches() {
    let mut config = ViewConfig::default();
    config.group_by = vec!["State".to_string()];
    config.columns = vec![
        Some("Category".to_string()),
        Some("Sub-Category".to_string()),
    ];

    assert_eq!(column_path_source("Sub-Category", &config), None);
    assert_eq!(column_path_source("Category", &config), None);

    // The same shadowing pair resolves correctly once a pivot exists.
    config.split_by = vec!["Region".to_string()];
    assert_eq!(
        column_path_source("West|Sub-Category", &config),
        Some((1, "Sub-Category"))
    );
    assert_eq!(
        column_path_source("West|Category", &config),
        Some((0, "Category"))
    );
}

#[test]
fn test_sort_column_paths_value_major() {
    let mut config = ViewConfig::default();
    config.columns = vec![Some("price".to_string()), Some("qty".to_string())];
    config.split_by = vec!["state".to_string()];
    let mut names = vec![
        "CA|price".to_string(),
        "NY|price".to_string(),
        "CA|qty".to_string(),
        "NY|qty".to_string(),
    ];

    sort_column_paths(&mut names, &config);
    assert_eq!(names, vec!["CA|price", "CA|qty", "NY|price", "NY|qty"]);
}

#[test]
fn test_sort_column_paths_longest_suffix_wins() {
    let mut config = ViewConfig::default();
    config.columns = vec![Some("price".to_string()), Some("total_price".to_string())];
    config.split_by = vec!["state".to_string()];
    let mut names = vec![
        "NY|total_price".to_string(),
        "CA|total_price".to_string(),
        "CA|price".to_string(),
        "__ROW_PATH_0__".to_string(),
    ];

    sort_column_paths(&mut names, &config);
    assert_eq!(names, vec![
        "__ROW_PATH_0__",
        "CA|price",
        "CA|total_price",
        "NY|total_price"
    ]);
}

#[test]
fn test_view_get_data_split_by_value_major_order() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("price".to_string()), Some("qty".to_string())];
    config.split_by = vec!["state".to_string()];
    let viewport = ViewPort {
        start_row: Some(0),
        end_row: Some(100),
        start_col: Some(0),
        end_col: None,
        ..ViewPort::default()
    };

    // The per-column pivot join emits column-major order; the data query
    // must restore value-major order.
    let mut schema = IndexMap::new();
    schema.insert("CA|price".to_string(), ColumnType::Float);
    schema.insert("NY|price".to_string(), ColumnType::Float);
    schema.insert("CA|qty".to_string(), ColumnType::Float);
    schema.insert("NY|qty".to_string(), ColumnType::Float);
    let sql = builder
        .view_get_data("my_view", &config, &viewport, &schema)
        .unwrap();

    let positions: Vec<usize> = ["\"CA|price\"", "\"CA|qty\"", "\"NY|price\"", "\"NY|qty\""]
        .iter()
        .map(|c| sql.find(c).unwrap())
        .collect();

    assert!(
        positions.windows(2).all(|w| w[0] < w[1]),
        "expected value-major column order: {}",
        sql
    );
}

#[test]
fn test_table_make_view_total_with_split_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.split_by = vec!["quarter".to_string()];
    config.group_rollup_mode = GroupRollupMode::Total;
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("PIVOT"), "expected PIVOT: {}", sql);
    assert!(
        !sql.contains("GROUP BY"),
        "should not contain GROUP BY: {}",
        sql
    );
    assert!(
        !sql.contains("ROW_NUMBER"),
        "should not contain ROW_NUMBER: {}",
        sql
    );
}

fn window_spec(name: &str, op: &str, frame: Option<WindowFrame>) -> (String, WindowSpec) {
    (name.to_string(), WindowSpec {
        column: "price".to_string(),
        aggregate: op.to_string(),
        partition_by: vec!["sym".to_string()],
        order_by: Some(WindowSort("t".to_string(), WindowSortDir::Asc)),
        frame,
        offset: None,
        alpha: None,
    })
}

#[test]
fn test_table_make_view_window_natural_order() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    let (name, mut spec) = window_spec("cumsum", "sum", Some(WindowFrame::Cumulative));
    spec.order_by = None;
    config.windows = Windows(HashMap::from([(name, spec)]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    // An omitted `order_by` takes the model's natural order - the same
    // `rowid` identity unsorted view results are ordered by.
    assert!(
        sql.contains("PARTITION BY \"sym\" ORDER BY rowid ASC"),
        "natural order in OVER clause: {}",
        sql
    );
}

#[test]
fn test_table_make_view_window_range_requires_order_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("rs".to_string())];
    let (name, mut spec) = window_spec("rs", "sum", Some(WindowFrame::Range(10.0)));
    spec.order_by = None;
    config.windows = Windows(HashMap::from([(name, spec)]));
    let result = builder.table_make_view("source_table", "dest_view", &config, &IndexMap::new());
    assert!(matches!(
        result,
        Err(GenericSQLError::UnsupportedOperation(_))
    ));
}

#[test]
fn test_table_make_view_window_order_desc() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    let (name, mut spec) = window_spec("cumsum", "sum", Some(WindowFrame::Cumulative));
    spec.order_by.as_mut().unwrap().1 = WindowSortDir::Desc;
    config.windows = Windows(HashMap::from([(name, spec)]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("ORDER BY \"t\" DESC NULLS FIRST"),
        "desc order in OVER clause: {}",
        sql
    );
}

#[test]
fn test_table_make_view_window_cumulative_sum() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    config.windows = Windows(HashMap::from([window_spec(
        "cumsum",
        "sum",
        Some(WindowFrame::Cumulative),
    )]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains(
        "sum(\"price\") OVER (PARTITION BY \"sym\" ORDER BY \"t\" ASC NULLS FIRST ROWS BETWEEN \
         UNBOUNDED PRECEDING AND CURRENT ROW) AS \"cumsum\""
    ));
    assert!(sql.contains("FROM (SELECT *,"));
    assert!(sql.contains("FROM source_table) AS __PSP_WINDOW_SRC__"));
}

#[test]
fn test_table_make_view_window_rows_and_range_frames() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("sma".to_string()), Some("rsum".to_string())];
    config.windows = Windows(HashMap::from([
        window_spec("sma", "avg", Some(WindowFrame::Rows(20))),
        window_spec("rsum", "sum", Some(WindowFrame::Range(100.0))),
    ]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("avg(\"price\") OVER"));
    assert!(sql.contains("ROWS BETWEEN 20 PRECEDING AND CURRENT ROW"));
    assert!(sql.contains("RANGE BETWEEN 100 PRECEDING AND CURRENT ROW"));
}

#[test]
fn test_table_make_view_window_lag_diff() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("lg".to_string()), Some("df".to_string())];
    let (lag_name, mut lag) = window_spec("lg", "lag", None);
    lag.offset = Some(2);
    config.windows = Windows(HashMap::from([
        (lag_name, lag),
        window_spec("df", "diff", None),
    ]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains(
        "lag(\"price\", 2) OVER (PARTITION BY \"sym\" ORDER BY \"t\" ASC NULLS FIRST) AS \"lg\""
    ));
    assert!(sql.contains("(\"price\" - lag(\"price\", 1) OVER"));
}

#[test]
fn test_table_make_view_window_rate() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("rt".to_string())];
    config.windows = Windows(HashMap::from([window_spec(
        "rt",
        "rate",
        Some(WindowFrame::Range(10.0)),
    )]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("first_value(\"price\") OVER"));
    assert!(sql.contains("NULLIF(CAST(\"t\" AS DOUBLE PRECISION)"));
    assert!(sql.contains("RANGE BETWEEN 10 PRECEDING AND CURRENT ROW"));
}

#[test]
fn test_table_make_view_window_over_expression_source() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("w".to_string())];
    config.expressions = crate::config::Expressions(HashMap::from([(
        "double_price".to_string(),
        "\"price\" * 2".to_string(),
    )]));
    let (w_name, mut w) = window_spec("w", "sum", Some(WindowFrame::Cumulative));
    w.column = "double_price".to_string();
    config.windows = Windows(HashMap::from([(w_name, w)]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("sum(\"price\" * 2) OVER"));
}

#[test]
fn test_table_make_view_window_group_by_over_window_column() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("cumsum".to_string())];
    config.group_by = vec!["sym".to_string()];
    config.aggregates = HashMap::from([(
        "cumsum".to_string(),
        Aggregate::SingleAggregate("max".to_string()),
    )]);
    config.windows = Windows(HashMap::from([window_spec(
        "cumsum",
        "sum",
        Some(WindowFrame::Cumulative),
    )]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("GROUP BY"));
    assert!(sql.contains("__PSP_WINDOW_SRC__"));
    assert!(sql.contains("max(\"cumsum\")"));
}

#[test]
fn test_table_make_view_window_ema_unsupported() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("e".to_string())];
    let (w_name, mut w) = window_spec("e", "ema", None);
    w.alpha = Some(0.5);
    config.windows = Windows(HashMap::from([(w_name, w)]));
    let result = builder.table_make_view("source_table", "dest_view", &config, &IndexMap::new());
    assert!(matches!(
        result,
        Err(GenericSQLError::UnsupportedOperation(_))
    ));
}

fn filters(json: serde_json::Value) -> Vec<crate::config::Filter> {
    serde_json::from_value(json).unwrap()
}

fn duckdb_args() -> GenericSQLVirtualServerModelArgs {
    GenericSQLVirtualServerModelArgs {
        like_escape_clause: Some("\\".to_string()),
        regex_fn: Some("regexp_matches".to_string()),
        ..Default::default()
    }
}

fn clickhouse_args() -> GenericSQLVirtualServerModelArgs {
    GenericSQLVirtualServerModelArgs {
        backslash_escaped_literals: Some(true),
        regex_fn: Some("match".to_string()),
        ..Default::default()
    }
}

fn filter_sql(args: GenericSQLVirtualServerModelArgs, filter: serde_json::Value) -> String {
    let builder = GenericSQLVirtualServerModel::new(args);
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string())];
    config.filter = filters(filter);
    builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap()
}

fn postgres_args() -> GenericSQLVirtualServerModelArgs {
    GenericSQLVirtualServerModelArgs {
        create_entity: Some("TEMPORARY VIEW".to_string()),
        drop_entity: Some("VIEW".to_string()),
        grouping_fn: Some("GROUPING".to_string()),
        row_id_expr: Some("ctid".to_string()),
        like_escape_clause: Some("\\".to_string()),
        regex_fn: Some("regexp_like".to_string()),
        describe_template: Some("SELECT * FROM ({}) AS __psp_describe__ LIMIT 0".to_string()),
        folds_unquoted_to_lower: Some(true),
        ..Default::default()
    }
}

#[test]
fn test_table_describe_emits_no_default_order() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string())];
    config.sort = vec![Sort("a".to_string(), SortDir::Desc)];
    let sql = builder
        .table_describe("derived", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert_eq!(
        sql,
        "SELECT * FROM (SELECT \"a\" as \"a\" FROM derived) AS __psp_describe__ LIMIT 0"
    );

    let sql = builder
        .table_make_view(
            "derived",
            "v",
            &config_without_sort(&config),
            &IndexMap::new(),
        )
        .unwrap();
    assert!(sql.ends_with("ORDER BY ctid)"), "{sql}");
}

#[test]
fn test_table_describe_flat_group_by_emits_no_default_order() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string())];
    config.group_by = vec!["g".to_string()];
    config.group_rollup_mode = GroupRollupMode::Flat;
    let sql = builder
        .table_describe("derived", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert!(!sql.contains("ORDER BY"), "{sql}");
}

fn config_without_sort(config: &ViewConfig) -> ViewConfig {
    ViewConfig {
        sort: vec![],
        ..config.clone()
    }
}

#[test]
fn test_view_make_table_uses_create_entity() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let schema = IndexMap::from([("a".to_string(), ColumnType::Integer)]);
    assert_eq!(
        builder
            .view_make_table("v", "t", &ViewConfig::default(), &schema, None)
            .unwrap(),
        "CREATE TEMPORARY VIEW t AS (SELECT \"a\" FROM v)"
    );

    assert_eq!(builder.view_delete("t").unwrap(), "DROP VIEW IF EXISTS t");
}

#[test]
fn test_unordered_source_flat_view_has_no_default_order() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string()), Some("b".to_string())];
    let ordered = builder
        .table_make_view("derived", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(ordered.ends_with("ORDER BY ctid)"), "{ordered}");
    let unordered = builder
        .table_make_view_unordered("derived", "v", &config, &IndexMap::new())
        .unwrap();

    assert_eq!(
        unordered,
        "CREATE TEMPORARY VIEW v AS (SELECT \"a\" as \"a\", \"b\" as \"b\" FROM derived)"
    );
}

#[test]
fn test_unordered_source_keeps_explicit_sort() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string())];
    config.sort = vec![Sort("a".to_string(), SortDir::Desc)];
    let sql = builder
        .table_make_view_unordered("derived", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.ends_with("ORDER BY \"a\" DESC)"), "{sql}");
    assert!(!sql.contains("ctid"), "{sql}");
}

#[test]
fn test_unordered_source_flat_group_by_orders_by_row_path() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string())];
    config.group_by = vec!["g".to_string()];
    config.group_rollup_mode = GroupRollupMode::Flat;
    let sql = builder
        .table_make_view_unordered("derived", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.contains("ORDER BY \"__ROW_PATH_0__\" ASC"), "{sql}");
    assert!(!sql.contains("ctid"), "{sql}");
    assert_eq!(
        sql,
        builder
            .table_make_view("derived", "v", &config, &IndexMap::new())
            .unwrap()
    );
}

#[test]
fn test_unordered_source_window_view_has_no_rowid() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    let (name, spec) = window_spec("cumsum", "sum", Some(WindowFrame::Cumulative));
    config.windows = Windows(HashMap::from([(name, spec)]));
    let ordered = builder
        .table_make_view("derived", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(ordered.contains("ctid AS \"__PSP_ROWID__\""), "{ordered}");
    let sql = builder
        .table_make_view_unordered("derived", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(!sql.contains("ctid"), "{sql}");
    assert!(!sql.contains("__PSP_ROWID__"), "{sql}");
    assert!(sql.contains("ORDER BY \"t\" ASC"), "{sql}");
}

#[test]
fn test_table_describe_unordered_window_has_no_rowid() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    let (name, spec) = window_spec("cumsum", "sum", Some(WindowFrame::Cumulative));
    config.windows = Windows(HashMap::from([(name, spec)]));
    let ordered = builder
        .table_describe("derived", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert!(ordered.contains("ctid"), "{ordered}");
    let sql = builder
        .table_describe_unordered("derived", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert!(!sql.contains("ctid"), "{sql}");
    assert!(sql.ends_with("AS __psp_describe__ LIMIT 0"), "{sql}");
}

#[test]
fn test_view_delete_custom_drop_entity() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    assert_eq!(
        builder.view_delete("my_view").unwrap(),
        "DROP VIEW IF EXISTS my_view"
    );
}

#[test]
fn test_table_make_view_custom_create_entity() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("col1".to_string())];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.starts_with("CREATE TEMPORARY VIEW dest_view AS"),
        "expected TEMPORARY VIEW: {}",
        sql
    );
}

#[test]
fn test_table_make_view_flat_row_id_expr() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("col1".to_string())];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.ends_with("ORDER BY ctid)"),
        "flat default order should use the dialect row id: {}",
        sql
    );
    assert!(!sql.contains("rowid"), "no rowid for postgres: {}", sql);
}

#[test]
fn test_table_make_view_window_natural_order_row_id_expr() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    let (name, mut spec) = window_spec("cumsum", "sum", Some(WindowFrame::Cumulative));
    spec.order_by = None;
    config.windows = Windows(HashMap::from([(name, spec)]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("PARTITION BY \"sym\" ORDER BY ctid ASC"),
        "natural window order should use the dialect row id: {}",
        sql
    );
}

#[test]
fn test_table_make_view_window_src_projects_row_id() {
    // System pseudo-columns (`rowid`, `ctid`) do not survive `SELECT *`
    // through the window sub-select, so the model projects them under
    // `__PSP_ROWID__` and refers to the alias in the outer default order.
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    config.windows = Windows(HashMap::from([window_spec(
        "cumsum",
        "sum",
        Some(WindowFrame::Cumulative),
    )]));
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("SELECT *, rowid AS \"__PSP_ROWID__\","),
        "window sub-select should project the row id: {}",
        sql
    );
    assert!(
        sql.ends_with("ORDER BY \"__PSP_ROWID__\")"),
        "outer default order should use the projected alias: {}",
        sql
    );
}

#[test]
fn test_table_make_view_grouping_fn_in_rollup_order() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("GROUPING(\"category\") AS \"__GROUPING_ID__\""),
        "expected custom grouping fn: {}",
        sql
    );
    assert!(
        !sql.contains("GROUPING_ID("),
        "should not use the default grouping fn: {}",
        sql
    );
}

#[test]
fn test_table_describe_flat() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("col1".to_string()), Some("col2".to_string())];
    let sql = builder
        .table_describe("source_table", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert!(
        sql.starts_with(
            "DESCRIBE (SELECT \"col1\" as \"col1\", \"col2\" as \"col2\" FROM source_table"
        ),
        "{sql}"
    );
    assert!(sql.ends_with(')'), "{sql}");
}

#[test]
fn test_table_describe_no_columns_is_none() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.expressions = Expressions(HashMap::from([("e".to_string(), "\"a\" + 1".to_string())]));
    assert!(
        builder
            .table_describe("source_table", &config, &IndexMap::new())
            .unwrap()
            .is_none()
    );
}

#[test]
fn test_table_describe_split_by_folds_into_group_by_without_pivot() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["state".to_string()];
    config.split_by = vec!["quarter".to_string()];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("sum".to_string()),
    )]);
    config.sort = vec![Sort("value".to_string(), SortDir::Desc)];
    let sql = builder
        .table_describe("t", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert!(!sql.contains("PIVOT"), "{sql}");
    assert!(sql.contains("sum(\"value\") as \"value\""), "{sql}");
    assert!(
        sql.contains("GROUP BY ROLLUP(\"state\", \"quarter\")"),
        "{sql}"
    );
    assert!(!sql.contains("__SORT_"), "{sql}");
}

#[test]
fn test_table_describe_column_only_drops_aggregates() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.split_by = vec!["quarter".to_string()];
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("avg".to_string()),
    )]);
    let sql = builder
        .table_describe("t", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert!(!sql.contains("PIVOT"), "{sql}");
    assert!(sql.contains("any_value(\"value\") as \"value\""), "{sql}");
    assert!(sql.contains("GROUP BY ROLLUP(\"quarter\")"), "{sql}");
}

#[test]
fn test_table_describe_total_split_by_keeps_aggregates() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.split_by = vec!["quarter".to_string()];
    config.group_rollup_mode = GroupRollupMode::Total;
    config.aggregates = HashMap::from([(
        "value".to_string(),
        Aggregate::SingleAggregate("avg".to_string()),
    )]);
    let sql = builder
        .table_describe("t", &config, &IndexMap::new())
        .unwrap()
        .unwrap();

    assert!(!sql.contains("PIVOT"), "{sql}");
    assert!(sql.contains("avg(\"value\") as \"value\""), "{sql}");
    assert!(!sql.contains("GROUP BY"), "{sql}");
    assert!(!sql.contains("__GROUPING_ID__"), "{sql}");
    assert!(!sql.contains("ORDER BY"), "{sql}");
}

#[test]
fn test_expressions_describe() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    assert!(
        builder
            .expressions_describe("t", &config)
            .unwrap()
            .is_none()
    );
    config.expressions = Expressions(HashMap::from([
        ("b".to_string(), "\"x\" * 2".to_string()),
        ("a".to_string(), "\"x\" + 1".to_string()),
    ]));

    assert_eq!(
        builder.expressions_describe("t", &config).unwrap().unwrap(),
        "DESCRIBE (SELECT \"x\" + 1 AS \"a\", \"x\" * 2 AS \"b\" FROM t)"
    );
}

#[test]
fn test_expression_describe_uses_template() {
    let builder = GenericSQLVirtualServerModel::new(
        serde_json::from_value(serde_json::json!({
            "describe_template": "SELECT * FROM ({}) AS __psp_describe__ LIMIT 0"
        }))
        .unwrap(),
    );

    assert_eq!(
        builder.expression_describe("t", "\"x\" + 1").unwrap(),
        "SELECT * FROM (SELECT \"x\" + 1 FROM t) AS __psp_describe__ LIMIT 0"
    );
}

#[test]
fn test_view_get_data_escapes_double_quotes_in_column_paths() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("amount".to_string())];
    config.split_by = vec!["item_title".to_string()];
    let viewport = ViewPort::default();

    let mut schema = IndexMap::new();
    schema.insert("plain|amount".to_string(), ColumnType::Integer);
    schema.insert("say \"hi\"|amount".to_string(), ColumnType::Integer);
    let sql = builder
        .view_get_data("my_view", &config, &viewport, &schema)
        .unwrap();

    assert_eq!(
        sql,
        "SELECT \"plain|amount\", \"say \"\"hi\"\"|amount\" FROM my_view"
    );
}

#[test]
fn test_view_get_min_max_escapes_double_quotes_in_column_name() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let config = ViewConfig::default();

    assert_eq!(
        builder
            .view_get_min_max("my_view", "say \"hi\"|amount", &config)
            .unwrap(),
        "SELECT MIN(\"say \"\"hi\"\"|amount\"), MAX(\"say \"\"hi\"\"|amount\") FROM my_view"
    );
}

fn view_make_table_schema() -> IndexMap<String, ColumnType> {
    IndexMap::from([
        ("__GROUPING_ID__".to_string(), ColumnType::Integer),
        ("__ROW_PATH_0__".to_string(), ColumnType::String),
        ("Mon|x".to_string(), ColumnType::Float),
        ("Tue|x".to_string(), ColumnType::Float),
    ])
}

#[test]
fn test_view_make_table_flat() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let schema = IndexMap::from([
        ("a".to_string(), ColumnType::Integer),
        ("b".to_string(), ColumnType::String),
    ]);

    assert_eq!(
        builder
            .view_make_table("v", "t", &ViewConfig::default(), &schema, None)
            .unwrap(),
        "CREATE TABLE t AS (SELECT \"a\", \"b\" FROM v)"
    );
}

#[test]
fn test_table_make_view_escapes_double_quotes_in_column_names() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a\"b".to_string())];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("\"a\"\"b\" as \"a\"\"b\""),
        "expected escaped column identifier: {}",
        sql
    );
    assert!(
        !sql.contains("\"a\"b\""),
        "expected no unescaped column identifier: {}",
        sql
    );
}

#[test]
fn test_view_make_table_unrolls_row_path() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.group_by = vec!["g".to_string()];
    config.split_by = vec!["s".to_string()];
    assert_eq!(
        builder
            .view_make_table("v", "t", &config, &view_make_table_schema(), None)
            .unwrap(),
        "CREATE TABLE t AS (SELECT \"__ROW_PATH_0__\" AS \"g\", \"Mon|x\", \"Tue|x\" FROM v)"
    );
}

#[test]
fn test_table_make_view_escapes_double_quotes_in_group_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["ca\"t".to_string()];
    config.group_rollup_mode = GroupRollupMode::Flat;
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("GROUP BY \"ca\"\"t\""),
        "expected escaped group_by identifier: {}",
        sql
    );
}

#[test]
fn test_table_make_view_escapes_double_quotes_in_split_by() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("value".to_string())];
    config.group_by = vec!["category".to_string()];
    config.split_by = vec!["sta\"te".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("\"sta\"\"te\" || '|value'"),
        "expected escaped split_by identifier in ON expression: {}",
        sql
    );
    assert!(
        !sql.contains("\"sta\"te\""),
        "expected no unescaped split_by identifier: {}",
        sql
    );
}

#[test]
fn test_view_get_data_orders_column_paths_containing_separator() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("amount".to_string()), Some("qty".to_string())];
    config.split_by = vec!["item_title".to_string()];
    let viewport = ViewPort::default();

    let mut schema = IndexMap::new();
    schema.insert("b|c|qty".to_string(), ColumnType::Integer);
    schema.insert("a|b|amount".to_string(), ColumnType::Integer);
    schema.insert("b|c|amount".to_string(), ColumnType::Integer);
    schema.insert("a|b|qty".to_string(), ColumnType::Integer);
    let sql = builder
        .view_get_data("my_view", &config, &viewport, &schema)
        .unwrap();

    assert_eq!(
        sql,
        "SELECT \"a|b|amount\", \"a|b|qty\", \"b|c|amount\", \"b|c|qty\" FROM my_view"
    );
}

#[test]
fn test_view_make_table_explicit_schema() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.group_by = vec!["g".to_string()];
    config.split_by = vec!["s".to_string()];
    let declared = IndexMap::from([
        ("g".to_string(), ColumnType::String),
        ("Tue|x".to_string(), ColumnType::Float),
        ("Wed|x".to_string(), ColumnType::Float),
    ]);

    assert_eq!(
        builder
            .view_make_table(
                "v",
                "t",
                &config,
                &view_make_table_schema(),
                Some(&declared)
            )
            .unwrap(),
        "CREATE TABLE t AS (SELECT \"__ROW_PATH_0__\" AS \"g\", \"Tue|x\", CAST(NULL AS DOUBLE \
         PRECISION) AS \"Wed|x\" FROM v)"
    );
}

#[test]
fn test_view_make_table_rejects_type_mismatch() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let declared = IndexMap::from([("Mon|x".to_string(), ColumnType::String)]);
    assert!(
        builder
            .view_make_table(
                "v",
                "t",
                &ViewConfig::default(),
                &view_make_table_schema(),
                Some(&declared)
            )
            .is_err()
    );
}

#[test]
fn test_view_make_table_qualifies_aggregate_of_key() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.group_by = vec!["x".to_string()];
    config.split_by = vec!["s".to_string()];
    config.columns = vec![Some("x".to_string())];
    let view_schema = IndexMap::from([
        ("__GROUPING_ID__".to_string(), ColumnType::Integer),
        ("__ROW_PATH_0__".to_string(), ColumnType::Float),
        ("Mon|x".to_string(), ColumnType::Float),
    ]);

    assert_eq!(
        builder
            .view_make_table("v", "t", &config, &view_schema, None)
            .unwrap(),
        "CREATE TABLE t AS (SELECT \"__ROW_PATH_0__\" AS \"x\", \"Mon|x\" AS \"Mon|x (sum)\" FROM \
         v)"
    );

    config.aggregates.insert(
        "x".to_string(),
        crate::config::Aggregate::from("weighted mean by w"),
    );

    assert_eq!(
        builder
            .view_make_table("v", "t", &config, &view_schema, None)
            .unwrap(),
        "CREATE TABLE t AS (SELECT \"__ROW_PATH_0__\" AS \"x\", \"Mon|x\" AS \"Mon|x (weighted \
         mean by w)\" FROM v)"
    );
}

#[test]
fn test_view_make_table_explicit_schema_addresses_qualified_aggregate() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let mut config = ViewConfig::default();
    config.group_by = vec!["x".to_string()];
    config.split_by = vec!["s".to_string()];
    config.columns = vec![Some("x".to_string())];
    let view_schema = IndexMap::from([
        ("__GROUPING_ID__".to_string(), ColumnType::Integer),
        ("__ROW_PATH_0__".to_string(), ColumnType::Float),
        ("Mon|x".to_string(), ColumnType::Float),
    ]);

    let declared = IndexMap::from([
        ("x".to_string(), ColumnType::Float),
        ("Mon|x (sum)".to_string(), ColumnType::Float),
    ]);

    assert_eq!(
        builder
            .view_make_table("v", "t", &config, &view_schema, Some(&declared))
            .unwrap(),
        "CREATE TABLE t AS (SELECT \"__ROW_PATH_0__\" AS \"x\", \"Mon|x\" AS \"Mon|x (sum)\" FROM \
         v)"
    );

    let mismatched = IndexMap::from([("Mon|x (sum)".to_string(), ColumnType::String)]);
    assert!(
        builder
            .view_make_table("v", "t", &config, &view_schema, Some(&mismatched))
            .is_err()
    );
}

#[test]
fn test_table_path_bare_parts_are_unquoted() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    assert_eq!(
        builder.table_path(&["memory", "main", "trades"]).unwrap(),
        "memory.main.trades"
    );
    assert_eq!(builder.table_path(&["trades"]).unwrap(), "trades");
}

#[test]
fn test_table_path_quotes_each_unsafe_part() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    assert_eq!(
        builder.table_path(&["memory", "my schema", "MyT"]).unwrap(),
        "memory.\"my schema\".MyT"
    );
    assert_eq!(
        builder.table_path(&["a.b", "say \"hi\""]).unwrap(),
        "\"a.b\".\"say \"\"hi\"\"\""
    );
    assert!(builder.table_path(&[]).is_err());
    assert!(builder.table_path(&["a", ""]).is_err());
}

#[test]
fn test_table_path_round_trips_through_queries() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    let path = builder
        .table_path(&["memory", "my schema", "a.b \"c\""])
        .unwrap();

    assert_eq!(
        builder.table_size(&path).unwrap(),
        "SELECT COUNT(*) FROM memory.\"my schema\".\"a.b \"\"c\"\"\""
    );
}

#[test]
fn test_derived_table_names_are_quoted_whole() {
    let builder = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs::default());
    assert_eq!(
        builder.table_size("public.trades GROUP BY sector").unwrap(),
        "SELECT COUNT(*) FROM \"public.trades GROUP BY sector\""
    );

    assert_eq!(
        builder.table_size("a.\"b").unwrap(),
        "SELECT COUNT(*) FROM \"a.\"\"b\""
    );
    assert_eq!(
        builder.table_size("\"a\"x").unwrap(),
        "SELECT COUNT(*) FROM \"\"\"a\"\"x\""
    );
}

#[test]
fn test_table_path_quotes_upper_case_when_dialect_folds() {
    let builder = GenericSQLVirtualServerModel::new(postgres_args());
    assert_eq!(
        builder.table_path(&["public", "MyTable"]).unwrap(),
        "public.\"MyTable\""
    );
    assert_eq!(
        builder.table_path(&["public", "trades"]).unwrap(),
        "public.trades"
    );
}

fn clickhouse_view_args() -> GenericSQLVirtualServerModelArgs {
    GenericSQLVirtualServerModelArgs {
        create_entity: Some("VIEW".to_string()),
        grouping_fn: Some("GROUPING".to_string()),
        unordered: Some(true),
        ..clickhouse_args()
    }
}

#[test]
fn test_unordered_flat_view_has_no_default_order() {
    let builder = GenericSQLVirtualServerModel::new(clickhouse_view_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string()), Some("b".to_string())];
    let sql = builder
        .table_make_view("default.t", "v", &config, &IndexMap::new())
        .unwrap();

    assert_eq!(
        sql,
        "CREATE VIEW v AS (SELECT \"a\" as \"a\", \"b\" as \"b\" FROM default.t)"
    );
}

#[test]
fn test_unordered_flat_view_keeps_explicit_sort() {
    let builder = GenericSQLVirtualServerModel::new(clickhouse_view_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string())];
    config.sort = vec![Sort("a".to_string(), SortDir::Desc)];
    let sql = builder
        .table_make_view("default.t", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(sql.ends_with("ORDER BY \"a\" DESC)"), "{sql}");
    assert!(!sql.contains("rowid"), "{sql}");
}

#[test]
fn test_unordered_split_only_view_numbers_rows_without_rowid() {
    let builder = GenericSQLVirtualServerModel::new(clickhouse_view_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("a".to_string())];
    config.split_by = vec!["s".to_string()];
    let sql = builder
        .table_make_view("default.t", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(
        sql.contains("ROW_NUMBER() OVER () as \"__ROW_NUM__\""),
        "{sql}"
    );
    assert!(!sql.contains("rowid"), "{sql}");
}

#[test]
fn test_unordered_grouped_and_total_views_unchanged() {
    let ordered = GenericSQLVirtualServerModel::new(GenericSQLVirtualServerModelArgs {
        unordered: None,
        ..clickhouse_view_args()
    });

    let unordered = GenericSQLVirtualServerModel::new(clickhouse_view_args());
    let mut grouped = ViewConfig::default();
    grouped.columns = vec![Some("a".to_string())];
    grouped.group_by = vec!["g".to_string()];
    let mut total = grouped.clone();
    total.group_rollup_mode = GroupRollupMode::Total;
    for config in [grouped, total] {
        let make = |b: &GenericSQLVirtualServerModel| {
            b.table_make_view("default.t", "v", &config, &IndexMap::new())
                .unwrap()
        };

        assert_eq!(make(&unordered), make(&ordered));
        assert!(!make(&unordered).contains("rowid"));
    }
}

#[test]
fn test_unordered_window_view_has_no_rowid() {
    let builder = GenericSQLVirtualServerModel::new(clickhouse_view_args());
    let mut config = ViewConfig::default();
    config.columns = vec![Some("t".to_string()), Some("cumsum".to_string())];
    let (name, spec) = window_spec("cumsum", "sum", Some(WindowFrame::Cumulative));
    config.windows = Windows(HashMap::from([(name, spec)]));
    let sql = builder
        .table_make_view("default.t", "v", &config, &IndexMap::new())
        .unwrap();

    assert!(!sql.contains("rowid"), "{sql}");
    assert!(!sql.contains("__PSP_ROWID__"), "{sql}");
    assert!(sql.contains("ORDER BY \"t\" ASC NULLS FIRST"), "{sql}");
}
