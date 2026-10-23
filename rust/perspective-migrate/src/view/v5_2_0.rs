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
use crate::step::StepCx;

const UNIMPLEMENTED: &[&str] = &[
    "identity",
    "mean by count",
    "mean_by_count",
    "py_agg",
    "div",
    "add",
];

const TAKES_ARGUMENT: &[&str] = &[
    "weighted mean",
    "weighted_mean",
    "max by",
    "max_by",
    "min by",
    "min_by",
];

const IMPLEMENTED: &[&str] = &[
    "distinct count",
    "distinctcount",
    "distinct",
    "distinct_count",
    "sum",
    "mul",
    "avg",
    "mean",
    "count",
    "unique",
    "any",
    "q1",
    "q3",
    "median",
    "join",
    "dominant",
    "first by index",
    "first",
    "last by index",
    "last minus first",
    "and",
    "or",
    "last",
    "last_value",
    "max",
    "min",
    "high",
    "high_water_mark",
    "low",
    "low_water_mark",
    "high minus low",
    "sum abs",
    "sum_abs",
    "abs sum",
    "abs_sum",
    "sum or zero",
    "sum_or_zero",
    "sum not null",
    "sum_not_null",
    "distinct leaf",
    "distinct_leaf",
    "pct sum parent",
    "pct_sum_parent",
    "pct sum total",
    "pct_sum_total",
    "pct sum grand total",
    "pct_sum_grand_total",
    "var",
    "variance",
    "stddev",
    "standard deviation",
    "gmv",
];

pub(super) fn prune_unused_aggregates(
    view: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    let used = view
        .get("columns")
        .and_then(Value::as_array)
        .map(|columns| {
            columns
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let Some(Value::Object(aggregates)) = view.get_mut("aggregates") else {
        return Ok(());
    };

    let invalid = aggregates
        .iter()
        .filter(|(column, aggregate)| !used.contains(column) && !is_valid(aggregate))
        .map(|(column, _)| column.clone())
        .collect::<Vec<_>>();

    for column in invalid {
        if let Some(value) = aggregates.shift_remove(&column) {
            cx.dropped(&["aggregates", &column], value);
        }
    }

    Ok(())
}

fn is_valid(aggregate: &Value) -> bool {
    match aggregate {
        Value::String(name) => is_known(name) && !TAKES_ARGUMENT.contains(&name.as_str()),
        Value::Array(parts) => match parts.as_slice() {
            [Value::String(name)] => is_known(name) && !TAKES_ARGUMENT.contains(&name.as_str()),
            [Value::String(name), Value::Array(args)] => {
                is_known(name) && (!TAKES_ARGUMENT.contains(&name.as_str()) || !args.is_empty())
            },
            _ => false,
        },
        _ => false,
    }
}

fn is_known(name: &str) -> bool {
    !UNIMPLEMENTED.contains(&name)
        && !name.contains("udf_combiner_")
        && !name.contains("udf_reducer_")
        && (IMPLEMENTED.contains(&name) || TAKES_ARGUMENT.contains(&name))
}
