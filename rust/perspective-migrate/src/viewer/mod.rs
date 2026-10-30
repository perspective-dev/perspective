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
use crate::step::{Step, StepCx};
use crate::version::Version;
use crate::view::VIEW_KEYS;

pub(crate) const STEPS: &[Step] = &[
    Step {
        at: Version::new(4, 5, 0),
        id: "viewer.plugin_config_object",
        apply: plugin_config_object,
    },
    Step {
        at: Version::new(5, 2, 0),
        id: "viewer.null_table",
        apply: null_table,
    },
    Step {
        at: Version::new(5, 7, 0),
        id: "viewer.plugin_names",
        apply: plugin_names,
    },
    Step {
        at: Version::new(5, 7, 0),
        id: "viewer.unknown_keys",
        apply: unknown_keys,
    },
];

const PANEL_KEYS: &[&str] = &[
    "version",
    "plugin",
    "title",
    "table",
    "theme",
    "plugin_config",
    "columns_config",
];

fn plugin_config_object(
    token: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if let Some(config) = token.get_mut("plugin_config")
        && !config.is_object()
        && !config.is_null()
    {
        let value = std::mem::replace(config, Value::Object(Map::new()));
        cx.dropped(&["plugin_config"], value);
    }

    Ok(())
}

fn null_table(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    if cx.kind() == Kind::Viewer && token.get("table").is_some_and(Value::is_null) {
        token.shift_remove("table");
    }

    Ok(())
}

fn plugin_names(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    if let Some(Value::String(plugin)) = token.get_mut("plugin")
        && let Some(canonical) = cx.resolve_plugin(plugin)
    {
        canonical.clone_into(plugin);
    }

    Ok(())
}

fn unknown_keys(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let settings: &[&str] = if cx.kind() == Kind::Viewer {
        &["settings"]
    } else {
        &[]
    };

    retain_keys(token, &[PANEL_KEYS, VIEW_KEYS, settings], &[], cx);
    let mut path = vec!["table".to_owned()];
    while let Some(Value::Object(derived)) = path_mut(token, &path) {
        retain_keys(derived, &[&["table"], VIEW_KEYS], &path, cx);
        path.push("table".to_owned());
    }

    Ok(())
}

fn path_mut<'a>(token: &'a mut Map<String, Value>, path: &[String]) -> Option<&'a mut Value> {
    let (first, rest) = path.split_first()?;
    rest.iter()
        .try_fold(token.get_mut(first)?, |value, key| value.get_mut(key))
}

pub(crate) fn retain_keys(
    map: &mut Map<String, Value>,
    allowed: &[&[&str]],
    path: &[String],
    cx: &mut StepCx,
) {
    let unknown = map
        .keys()
        .filter(|key| !allowed.iter().any(|keys| keys.contains(&key.as_str())))
        .cloned()
        .collect::<Vec<_>>();

    for key in unknown {
        if let Some(value) = map.shift_remove(&key) {
            let mut pointer = path.iter().map(String::as_str).collect::<Vec<_>>();
            pointer.push(&key);
            cx.dropped(&pointer, value);
        }
    }
}
