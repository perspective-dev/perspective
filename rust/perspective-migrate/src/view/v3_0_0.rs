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

use serde_json::{Map, Value};

use crate::Kind;
use crate::error::MigrateError;
use crate::step::StepCx;

const ALIASES: &[(&str, &str)] = &[
    ("row_pivot", "group_by"),
    ("row-pivot", "group_by"),
    ("row-pivots", "group_by"),
    ("col_pivot", "split_by"),
    ("col_pivots", "split_by"),
    ("column_pivot", "split_by"),
    ("column-pivot", "split_by"),
    ("column-pivots", "split_by"),
    ("filters", "filter"),
    ("sorts", "sort"),
];

pub(super) fn v2_aliases(
    view: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if cx.kind() != Kind::View {
        return Ok(());
    }

    for (alias, key) in ALIASES {
        if view.contains_key(*alias) && view.contains_key(*key) {
            return Err(cx.conflict(&[alias, key]));
        }

        if let Some(value) = view.shift_remove(*alias) {
            view.insert((*key).to_owned(), value);
        }
    }

    if let Some(aggregate) = view.shift_remove("aggregate") {
        if view.contains_key("aggregates") || view.contains_key("columns") {
            return Err(cx.conflict(&["aggregate", "aggregates", "columns"]));
        }

        let Value::Array(specs) = aggregate else {
            return Err(cx.malformed(&["aggregate"], "an array of {column, op}"));
        };

        let mut aggregates = Map::new();
        let mut columns = vec![];
        for spec in specs {
            let (Some(Value::String(column)), Some(op)) = (spec.get("column"), spec.get("op"))
            else {
                return Err(cx.malformed(&["aggregate"], "an array of {column, op}"));
            };

            aggregates.insert(column.clone(), op.clone());
            columns.push(Value::String(column.clone()));
        }

        view.insert("aggregates".to_owned(), Value::Object(aggregates));
        view.insert("columns".to_owned(), Value::Array(columns));
    }

    if let Some(value) = view.shift_remove("computed_columns") {
        cx.dropped(&["computed_columns"], value);
    }

    if let Some(value) = view.shift_remove("version") {
        cx.dropped(&["version"], value);
    }

    Ok(())
}

pub(super) fn drop_split_by_depth(
    view: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if let Some(value) = view.shift_remove("split_by_depth") {
        cx.dropped(&["split_by_depth"], value);
    }

    Ok(())
}

pub(super) fn drop_viewport(
    view: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if let Some(value) = view.shift_remove("viewport") {
        cx.dropped(&["viewport"], value);
    }

    Ok(())
}

pub(super) fn filter_op_symbols(
    view: &mut Map<String, Value>,
    _cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if let Some(op) = view.get_mut("filter_op") {
        match op.as_str() {
            Some("&") => *op = Value::from("and"),
            Some("|") => *op = Value::from("or"),
            _ => {},
        }
    }

    Ok(())
}

pub(super) fn expression_tuples(
    view: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    let Some(Value::Array(items)) = view.get("expressions") else {
        return Ok(());
    };

    if !items.iter().any(Value::is_array) {
        return Ok(());
    }

    let mut map = Map::new();
    for item in items {
        let (Some(Value::String(alias)), Some(Value::String(expression))) =
            (item.get(0), item.get(1))
        else {
            return Err(cx.malformed(&["expressions"], "[alias, expression, …] tuples"));
        };

        let body = expression
            .split_once('\n')
            .filter(|(line, body)| line.starts_with("//") && !body.is_empty())
            .map_or(expression.as_str(), |(_, body)| body);

        map.insert(alias.clone(), Value::from(body));
    }

    view.insert("expressions".to_owned(), Value::Object(map));
    Ok(())
}
