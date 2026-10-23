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

use crate::error::MigrateError;
use crate::json::object_mut;
use crate::step::StepCx;
use crate::version::Version;

const AGGREGATE_RENAMES: &[(&str, &str)] = &[
    ("sum not null", "sum"),
    ("sum_not_null", "sum"),
    ("pct sum grand total", "pct sum total"),
    ("pct_sum_grand_total", "pct sum total"),
    ("last value", "last"),
    ("high water mark", "high"),
    ("low water mark", "low"),
    ("high minuslow", "high minus low"),
];

const AGGREGATES_UNIMPLEMENTED: &[&str] = &["py agg", "scaled div", "scaled add", "scaled mul"];

const FILTER_OP_RENAMES: &[(&str, &str)] =
    &[("is None", "is null"), ("is not None", "is not null")];

pub(super) fn expressions_map(
    view: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    let Some(Value::Array(items)) = view.get("expressions") else {
        return Ok(());
    };

    let mut map = Map::new();
    for item in items {
        let Value::String(source) = item else {
            return Err(cx.malformed(&["expressions"], "an array of expression strings"));
        };

        let (name, expression) = if cx.from() < Version::new(3, 0, 0) {
            split_v2(source)
        } else {
            split_v3(source)
        };

        map.insert(name.to_owned(), Value::from(expression));
    }

    let unordered = map.len() > 1 && !view.contains_key("columns");
    view.insert("expressions".to_owned(), Value::Object(map));
    if unordered {
        cx.approximated(
            &["expressions"],
            "expression columns without `columns` are no longer ordered by the array",
        );
    }

    Ok(())
}

fn split_v2(source: &str) -> (&str, &str) {
    let Some((line, body)) = source.split_once('\n') else {
        return (source, source);
    };

    let alias = line.strip_prefix("//").map(str::trim).unwrap_or_default();
    if alias.is_empty() {
        (source, source)
    } else if body.is_empty() {
        (alias, source)
    } else {
        (alias, body)
    }
}

fn split_v3(source: &str) -> (&str, &str) {
    match source.split_once('\n') {
        Some((line, body)) if !body.is_empty() && line.starts_with("//") => {
            (line[2..].trim(), body)
        },
        _ => (source, source),
    }
}

pub(super) fn canonical_names(
    view: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if let Some(aggregates) = object_mut(view, "aggregates") {
        let mut unimplemented = vec![];
        for (column, aggregate) in aggregates.iter_mut() {
            let name = match aggregate {
                Value::Array(parts) => parts.first_mut(),
                name => Some(name),
            };

            let Some(Value::String(name)) = name else {
                continue;
            };

            if AGGREGATES_UNIMPLEMENTED.contains(&name.as_str()) {
                unimplemented.push(column.clone());
            } else if let Some((_, canonical)) = AGGREGATE_RENAMES.iter().find(|(x, _)| x == name) {
                *name = (*canonical).to_owned();
            }
        }

        for column in unimplemented {
            if let Some(value) = aggregates.shift_remove(&column) {
                cx.dropped(&["aggregates", &column], value);
            }
        }
    }

    if let Some(Value::Array(filters)) = view.get_mut("filter") {
        for filter in filters {
            if let Some(op) = filter.get_mut(1)
                && let Some((_, canonical)) = FILTER_OP_RENAMES
                    .iter()
                    .find(|(x, _)| op.as_str() == Some(*x))
            {
                *op = Value::from(*canonical);
            }
        }
    }

    Ok(())
}
