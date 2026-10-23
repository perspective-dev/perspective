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
use crate::json::object_mut;
use crate::plugin::PluginMigration;
use crate::step::{Step, StepCx};
use crate::version::Version;

pub(crate) struct Maps;

impl PluginMigration for Maps {
    fn plugins(&self) -> &[&'static str] {
        &["Map Scatter", "Map Line", "Map Density"]
    }

    fn steps(&self) -> Vec<Step> {
        vec![
            Step {
                at: Version::new(4, 5, 0),
                id: "maps.label_slot",
                apply: label_slot,
            },
            Step {
                at: Version::new(4, 5, 0),
                id: "maps.openlayers_removed",
                apply: openlayers_removed,
            },
            Step {
                at: Version::new(5, 3, 1),
                id: "maps.carto_tiles",
                apply: carto_tiles,
            },
        ]
    }
}

fn label_slot(token: &mut Map<String, Value>, _cx: &mut StepCx) -> Result<(), MigrateError> {
    if let Some(Value::Array(columns)) = token.get_mut("columns")
        && columns.len() > 4
    {
        columns.insert(4, Value::Null);
    }

    Ok(())
}

fn openlayers_removed(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    clear_plugin_config(token, cx);
    retain_column_keys(token, &["number_format", "date_format"], cx);
    Ok(())
}

fn carto_tiles(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    if let Some(config) = object_mut(token, "plugin_config")
        && config
            .get("map_tile_provider")
            .and_then(Value::as_str)
            .is_some_and(|x| x.starts_with("carto-"))
        && let Some(provider) = config.shift_remove("map_tile_provider")
    {
        cx.dropped(&["plugin_config", "map_tile_provider"], provider);
    }

    Ok(())
}
