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

mod regular_layout;

use serde_json::{Map, Value};

use crate::error::MigrateError;
use crate::json::object_mut;
use crate::step::{Step, StepCx};
use crate::version::Version;
use crate::view::VIEW_KEYS;
use crate::viewer::retain_keys;

pub(crate) const STEPS: &[Step] = &[
    Step {
        at: Version::new(2, 1, 0),
        id: "ws.name_title",
        apply: name_title,
    },
    Step {
        at: Version::new(3, 1, 3),
        id: "ws.inline_widgets",
        apply: inline_widgets,
    },
    Step {
        at: Version::new(3, 1, 3),
        id: "ws.drop_linked",
        apply: drop_linked,
    },
    Step {
        at: Version::new(3, 1, 4),
        id: "ws.drop_master_flag",
        apply: drop_master_flag,
    },
    Step {
        at: Version::new(5, 0, 0),
        id: "ws.regular_layout",
        apply: regular_layout::regular_layout,
    },
    Step {
        at: Version::new(5, 2, 0),
        id: "ws.panel_table",
        apply: panel_table,
    },
    Step {
        at: Version::new(5, 7, 0),
        id: "ws.unknown_keys",
        apply: unknown_keys,
    },
];

const WORKSPACE_KEYS: &[&str] = &[
    "version",
    "active",
    "layout",
    "panels",
    "derived_tables",
    "global_filters",
    "masters",
    "palette",
];

fn lumino_panels(
    root: &mut Map<String, Value>,
) -> impl Iterator<Item = (&String, &mut Map<String, Value>)> {
    object_mut(root, "viewers")
        .into_iter()
        .flat_map(|viewers| viewers.iter_mut())
        .filter_map(|(id, panel)| panel.as_object_mut().map(|panel| (id, panel)))
}

fn name_title(root: &mut Map<String, Value>, _cx: &mut StepCx) -> Result<(), MigrateError> {
    for (_, panel) in lumino_panels(root) {
        if let Some(name) = panel.shift_remove("name") {
            panel.insert("title".to_owned(), name);
        }
    }

    Ok(())
}

fn inline_widgets(root: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let Some(Value::Array(widgets)) = object_mut(root, "master").and_then(|x| x.get_mut("widgets"))
    else {
        return Ok(());
    };

    let mut hoisted = vec![];
    for widget in widgets.iter_mut() {
        if let Value::Object(config) = widget {
            let Some(Value::String(slot)) = config.shift_remove("slot") else {
                return Err(cx.malformed(&["master", "widgets"], "slot names or {slot, …}"));
            };

            hoisted.push((slot.clone(), std::mem::take(config)));
            *widget = Value::String(slot);
        }
    }

    if hoisted.is_empty() {
        return Ok(());
    }

    let Value::Object(viewers) = root
        .entry("viewers")
        .or_insert_with(|| Value::Object(Map::new()))
    else {
        return Err(cx.malformed(&["viewers"], "an object"));
    };

    for (slot, config) in hoisted {
        viewers.entry(slot).or_insert(Value::Object(config));
    }

    Ok(())
}

fn drop_linked(root: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    if let Some(mode) = root.shift_remove("mode")
        && mode.as_str() == Some("linked")
    {
        cx.dropped(&["mode"], mode);
    }

    let mut dropped = vec![];
    for (id, panel) in lumino_panels(root) {
        for key in ["linked", "selectable", "editable"] {
            if let Some(value) = panel.shift_remove(key)
                && !matches!(value, Value::Null | Value::Bool(false))
            {
                dropped.push((id.clone(), key, value));
            }
        }
    }

    for (id, key, value) in dropped {
        cx.dropped(&["viewers", &id, key], value);
    }

    Ok(())
}

fn drop_master_flag(root: &mut Map<String, Value>, _cx: &mut StepCx) -> Result<(), MigrateError> {
    for (_, panel) in lumino_panels(root) {
        panel.shift_remove("master");
    }

    Ok(())
}

fn panel_table(root: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let Some(panels) = object_mut(root, "panels") else {
        return Ok(());
    };

    for (id, panel) in panels.iter() {
        if !panel.get("table").is_some_and(Value::is_string) {
            return Err(cx.missing_table(id));
        }
    }

    Ok(())
}

fn unknown_keys(root: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    retain_keys(root, &[WORKSPACE_KEYS], &[], cx);
    if let Some(derived) = object_mut(root, "derived_tables") {
        for (name, config) in derived.iter_mut() {
            if let Value::Object(config) = config {
                let path = ["derived_tables".to_owned(), name.clone()];
                retain_keys(config, &[&["table"], VIEW_KEYS], &path, cx);
            }
        }
    }

    Ok(())
}
