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

use super::{clear_plugin_config, retain_column_keys};
use crate::error::MigrateError;
use crate::json::{column_styles, object_mut};
use crate::plugin::PluginMigration;
use crate::step::{Step, StepCx};
use crate::version::Version;

pub(crate) struct Charts;

impl PluginMigration for Charts {
    fn plugins(&self) -> &[&'static str] {
        &[
            "X Bar",
            "Y Bar",
            "Y Line",
            "Y Scatter",
            "Y Area",
            "X/Y Scatter",
            "X/Y Line",
            "Density",
            "Treemap",
            "Sunburst",
            "Heatmap",
            "Candlestick",
            "OHLC",
        ]
    }

    fn steps(&self) -> Vec<Step> {
        vec![
            Step {
                at: Version::new(2, 7, 0),
                id: "charts.symbols_map",
                apply: symbols_map,
            },
            Step {
                at: Version::new(2, 9, 0),
                id: "charts.symbols_move",
                apply: symbols_move,
            },
            Step {
                at: Version::new(4, 5, 0),
                id: "charts.alt_axis",
                apply: alt_axis,
            },
            Step {
                at: Version::new(4, 5, 0),
                id: "charts.scatter_symbol_slot",
                apply: scatter_symbol_slot,
            },
            Step {
                at: Version::new(4, 5, 0),
                id: "charts.d3fc_removed",
                apply: d3fc_removed,
            },
        ]
    }
}

fn is_xy_scatter(token: &Map<String, Value>, cx: &StepCx) -> bool {
    token
        .get("plugin")
        .and_then(Value::as_str)
        .and_then(|name| cx.resolve_plugin(name))
        == Some("X/Y Scatter")
}

fn symbol_columns(token: &mut Map<String, Value>) -> Option<&mut Map<String, Value>> {
    match object_mut(token, "plugin_config")?.get_mut("columns")? {
        Value::Object(columns) => Some(columns),
        _ => None,
    }
}

fn symbols_map(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    if !is_xy_scatter(token, cx) {
        return Ok(());
    }

    for (column, config) in symbol_columns(token).into_iter().flatten() {
        let Some(Value::Array(pairs)) = config.get("symbols") else {
            continue;
        };

        let mut symbols = Map::new();
        for pair in pairs {
            let (Some(Value::String(key)), Some(value)) = (pair.get("key"), pair.get("value"))
            else {
                return Err(cx.malformed(
                    &["plugin_config", "columns", column, "symbols"],
                    "an array of {key, value}",
                ));
            };

            symbols.insert(key.clone(), value.clone());
        }

        config["symbols"] = Value::Object(symbols);
    }

    Ok(())
}

fn symbols_move(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    if !is_xy_scatter(token, cx) {
        return Ok(());
    }

    let mut moved = vec![];
    if let Some(columns) = symbol_columns(token) {
        for (column, config) in columns.iter_mut() {
            if let Some(symbols) = config
                .as_object_mut()
                .and_then(|x| x.shift_remove("symbols"))
            {
                moved.push((column.clone(), symbols));
            }
        }

        columns.retain(|_, config| config.as_object().is_none_or(|x| !x.is_empty()));
        if columns.is_empty()
            && let Some(config) = object_mut(token, "plugin_config")
        {
            config.shift_remove("columns");
        }
    }

    if moved.is_empty() {
        return Ok(());
    }

    let Value::Object(config) = token
        .entry("columns_config")
        .or_insert_with(|| Value::Object(Map::new()))
    else {
        return Err(cx.malformed(&["columns_config"], "an object"));
    };

    for (column, symbols) in moved {
        if let Value::Object(style) = config
            .entry(column)
            .or_insert_with(|| Value::Object(Map::new()))
        {
            style.entry("symbols").or_insert(symbols);
        }
    }

    Ok(())
}

fn alt_axis(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let Some(values) = object_mut(token, "plugin_config")
        .and_then(|config| config.shift_remove("splitMainValues"))
    else {
        return Ok(());
    };

    let Value::Array(values) = values else {
        return Err(cx.malformed(&["plugin_config", "splitMainValues"], "an array of names"));
    };

    if values.is_empty() {
        return Ok(());
    }

    let Value::Object(config) = token
        .entry("columns_config")
        .or_insert_with(|| Value::Object(Map::new()))
    else {
        return Err(cx.malformed(&["columns_config"], "an object"));
    };

    for value in values {
        let Some(name) = value.as_str() else {
            return Err(cx.malformed(&["plugin_config", "splitMainValues"], "an array of names"));
        };

        let base = name.rsplit('|').next().unwrap_or(name);
        if let Value::Object(style) = config
            .entry(base)
            .or_insert_with(|| Value::Object(Map::new()))
        {
            style.insert("alt_axis".to_owned(), Value::Bool(true));
        }
    }

    Ok(())
}

fn scatter_symbol_slot(
    token: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if !is_xy_scatter(token, cx) {
        return Ok(());
    }

    if cx.from() >= Version::new(2, 6, 0)
        && let Some(Value::Array(columns)) = token.get_mut("columns")
        && columns.len() > 4
    {
        let symbol = columns.remove(4);
        if !symbol.is_null() {
            cx.dropped(&["columns", "4"], symbol);
        }
    }

    for (column, style) in column_styles(token) {
        if let Some(symbols) = style.shift_remove("symbols") {
            cx.dropped(&["columns_config", column, "symbols"], symbols);
        }
    }

    Ok(())
}

fn d3fc_removed(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    clear_plugin_config(token, cx);
    retain_column_keys(token, &["number_format", "date_format", "alt_axis"], cx);
    Ok(())
}
