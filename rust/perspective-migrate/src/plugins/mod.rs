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

mod charts;
mod datagrid;
mod maps;

use serde_json::{Map, Value};

use crate::json::object_mut;
use crate::plugin::PluginMigration;
use crate::step::StepCx;

pub(crate) const REGISTRATION_ORDER: &[&str] = &[
    "Datagrid",
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
    "Map Scatter",
    "Map Line",
    "Map Density",
    "Debug",
];

pub(crate) fn first_party() -> Vec<Box<dyn PluginMigration>> {
    vec![
        Box::new(datagrid::Datagrid),
        Box::new(charts::Charts),
        Box::new(maps::Maps),
    ]
}

pub(crate) fn resolve_plugin(name: &str, known: &[&'static str]) -> Option<&'static str> {
    let short = short_name(name);
    known.iter().find(|x| short_name(x) == short).copied()
}

fn clear_plugin_config(token: &mut Map<String, Value>, cx: &mut StepCx) {
    if let Some(config) = object_mut(token, "plugin_config") {
        for (key, value) in std::mem::take(config) {
            cx.dropped(&["plugin_config", &key], value);
        }
    }
}

fn retain_column_keys(token: &mut Map<String, Value>, keep: &[&str], cx: &mut StepCx) {
    let Some(config) = object_mut(token, "columns_config") else {
        return;
    };

    for (column, style) in config.iter_mut() {
        let Value::Object(style) = style else {
            continue;
        };

        for (key, value) in std::mem::take(style) {
            if keep.contains(&key.as_str()) {
                style.insert(key, value);
            } else {
                cx.dropped(&["columns_config", column, &key], value);
            }
        }
    }

    config.retain(|_, style| style.as_object().is_none_or(|x| !x.is_empty()));
}

fn short_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|x| x.is_alphabetic())
        .collect()
}
