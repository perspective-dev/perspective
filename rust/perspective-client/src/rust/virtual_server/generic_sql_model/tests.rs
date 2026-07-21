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
use crate::config::{Aggregate, GroupRollupMode};

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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
        .unwrap();

    assert!(sql.contains("__SORT_0__"), "expected __SORT_0__: {}", sql);
    assert!(
        sql.contains("__GROUPING_ID__, __SORT_0__"),
        "expected __SORT_0__ in GROUP BY: {}",
        sql
    );

    assert!(
        sql.contains("__SORT_0__ ASC"),
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
        .table_make_view("source_table", "dest_view", &config)
        .unwrap();

    assert!(
        sql.contains("PARTITION BY (__GROUPING_ID__ >> 1)"),
        "expected shifted __GROUPING_ID__ in WINDOW: {}",
        sql
    );

    assert!(
        sql.contains("first(__SORT_0__) OVER __WINDOW_0__"),
        "expected first(__SORT_0__) OVER __WINDOW_0__: {}",
        sql
    );

    assert!(
        !sql.contains("GROUPING_ID(\"region\")"),
        "should not have GROUPING_ID function in WINDOW: {}",
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
        .unwrap();

    assert!(sql.contains("PIVOT"), "expected PIVOT: {}", sql);
    assert!(
        sql.contains("ROW_NUMBER() OVER (ORDER BY \"value\" DESC)"),
        "expected sort in ROW_NUMBER window: {}",
        sql
    );
    assert!(
        sql.ends_with("ORDER BY __ROW_NUM__)"),
        "should end with ORDER BY __ROW_NUM__: {}",
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        sql.contains("__SORT_0__ DESC"),
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        create_entity: None,
        grouping_fn: None,
        column_separator: Some("::".to_string()),
    });

    let mut config = ViewConfig::default();
    config.columns = vec![Some("account_number".to_string())];
    config.split_by = vec!["state".to_string()];
    let sql = builder
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
        .unwrap();

    assert!(
        sql.contains("GROUP BY __ROW_PATH_0__, __GROUPING_ID__"),
        "expected pivot GROUP BY on row keys: {}",
        sql
    );
    assert!(
        sql.contains(
            "__PSP_PIVOT_0__.__ROW_PATH_0__ IS NOT DISTINCT FROM __PSP_PIVOT_1__.__ROW_PATH_0__"
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
        .table_make_view("source_table", "dest_view", &config)
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
        .table_make_view("source_table", "dest_view", &config)
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
