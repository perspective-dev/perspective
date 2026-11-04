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

use serde_json::{Map, Value, json};

use crate::css;
use crate::error::MigrateError;
use crate::json::{column_styles, object_mut, rename};
use crate::plugin::PluginMigration;
use crate::step::{Step, StepCx};
use crate::version::Version;

pub(crate) struct Datagrid;

impl PluginMigration for Datagrid {
    fn plugins(&self) -> &[&'static str] {
        &["Datagrid"]
    }

    fn steps(&self) -> Vec<Step> {
        vec![
            Step {
                at: Version::new(2, 9, 0),
                id: "datagrid.columns_config",
                apply: columns_config,
            },
            Step {
                at: Version::new(3, 0, 0),
                id: "datagrid.edit_mode",
                apply: edit_mode,
            },
            Step {
                at: Version::new(4, 5, 0),
                id: "datagrid.chart_keys",
                apply: chart_keys,
            },
            Step {
                at: Version::new(5, 3, 0),
                id: "datagrid.size_overrides",
                apply: size_overrides,
            },
            Step {
                at: Version::new(5, 3, 0),
                id: "datagrid.colors",
                apply: colors,
            },
            Step {
                at: Version::new(5, 5, 0),
                id: "datagrid.mode_renames",
                apply: mode_renames,
            },
            Step {
                at: Version::new(5, 5, 0),
                id: "datagrid.format_flags",
                apply: format_flags,
            },
            Step {
                at: Version::new(5, 6, 0),
                id: "datagrid.role_keys",
                apply: role_keys,
            },
        ]
    }
}

const DATE_KEYS: &[&str] = &[
    "timeZone",
    "fractionalSecondDigits",
    "second",
    "minute",
    "hour",
    "day",
    "weekday",
    "month",
    "year",
    "hour12",
    "dateStyle",
    "timeStyle",
];

fn columns_config(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let Some(Value::Object(columns)) =
        object_mut(token, "plugin_config").and_then(|config| config.get_mut("columns"))
    else {
        return Ok(());
    };

    let mut moved = Map::new();
    for (column, old) in columns.iter_mut() {
        let Value::Object(old) = old else {
            continue;
        };

        let mut style = Map::new();
        let mut date_format = Map::new();
        for (key, value) in std::mem::take(old) {
            match key.as_str() {
                "column_size_override" => {
                    old.insert(key, value);
                },
                "format" if value.as_str() == Some("custom") => {
                    date_format.insert(key, value);
                },
                "format" if value.as_str() == Some("image") => {
                    cx.dropped(&["plugin_config", "columns", column, "format"], value);
                },
                "fixed" => {
                    style.insert(
                        "number_format".to_owned(),
                        json!({"minimumFractionDigits": value, "maximumFractionDigits": value}),
                    );
                },
                key if DATE_KEYS.contains(&key) => {
                    date_format.insert(key.to_owned(), value);
                },
                _ => {
                    style.insert(key, value);
                },
            }
        }

        if !date_format.is_empty() {
            style.insert("date_format".to_owned(), Value::Object(date_format));
        }

        if !style.is_empty() {
            moved.insert(column.clone(), Value::Object(style));
        }
    }

    columns.retain(|_, old| old.as_object().is_none_or(|old| !old.is_empty()));
    merge_columns_config(token, moved, cx)
}

fn merge_columns_config(
    token: &mut Map<String, Value>,
    moved: Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if moved.is_empty() {
        return Ok(());
    }

    let config = token
        .entry("columns_config")
        .or_insert_with(|| Value::Object(Map::new()));

    let Value::Object(config) = config else {
        return Err(cx.malformed(&["columns_config"], "an object"));
    };

    for (column, style) in moved {
        let Value::Object(style) = style else {
            continue;
        };

        let entry = config
            .entry(column)
            .or_insert_with(|| Value::Object(Map::new()));

        if let Value::Object(entry) = entry {
            for (key, value) in style {
                entry.entry(key).or_insert(value);
            }
        }
    }

    Ok(())
}

fn edit_mode(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let Some(config) = object_mut(token, "plugin_config") else {
        return Ok(());
    };

    let Some(editable) = config.shift_remove("editable") else {
        return Ok(());
    };

    match (config.contains_key("edit_mode"), editable.as_bool()) {
        (false, Some(editable)) => {
            let mode = if editable { "EDIT" } else { "READ_ONLY" };
            config.insert("edit_mode".to_owned(), Value::from(mode));
        },
        _ => cx.dropped(&["plugin_config", "editable"], editable),
    }

    Ok(())
}

fn chart_keys(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    for (column, style) in column_styles(token) {
        if let Some(value) = style.shift_remove("symbols") {
            cx.dropped(&["columns_config", column, "symbols"], value);
        }
    }

    Ok(())
}

fn size_overrides(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let is_split = token
        .get("split_by")
        .and_then(Value::as_array)
        .is_some_and(|x| !x.is_empty());

    let Some(Value::Object(columns)) =
        object_mut(token, "plugin_config").and_then(|config| config.shift_remove("columns"))
    else {
        return Ok(());
    };

    let mut moved = Map::new();
    for (path, old) in columns {
        let size = old.get("column_size_override");
        let px = size
            .and_then(Value::as_f64)
            .filter(|x| x.is_finite() && *x > 0.0);
        match px {
            Some(_) if !is_split && path != "__ROW_PATH__" => {
                moved.insert(path, json!({"column_size_override": size}));
            },
            _ if old.as_object().is_some_and(Map::is_empty) => {},
            _ => cx.dropped(&["plugin_config", "columns", &path], old),
        }
    }

    merge_columns_config(token, moved, cx)
}

fn colors(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    for (column, style) in column_styles(token) {
        if let Some(Value::String(color)) = style.get("color") {
            match css::normalize(color) {
                Some(color) => {
                    if color.had_alpha {
                        cx.approximated(
                            &["columns_config", column, "color"],
                            "alpha is unsupported",
                        );
                    }

                    style.insert("color".to_owned(), Value::from(color.hex));
                },
                None => {
                    let value = style.shift_remove("color").unwrap_or_default();
                    cx.dropped(&["columns_config", column, "color"], value);
                },
            }
        }

        for side in ["fg", "bg"] {
            let pos = style.shift_remove(&format!("pos_{side}_color"));
            let neg = style.shift_remove(&format!("neg_{side}_color"));
            let key = format!("{side}_colors");
            match (pos, neg) {
                (None, None) => {},
                (Some(pos), Some(neg)) => match (stop(&pos), stop(&neg)) {
                    (Some(pos), Some(neg)) => {
                        let mode = style.get("number_bg_mode").and_then(Value::as_str);
                        if side == "bg" && matches!(mode, Some("gradient" | "pulse")) {
                            cx.approximated(
                                &["columns_config", column, &key],
                                "the theme background middle stop is not reconstructed",
                            );
                        }

                        let gradient = format!("linear-gradient(to right, {neg} 0%, {pos} 100%)");
                        style.insert(key, Value::from(gradient));
                    },
                    _ => cx.dropped(&["columns_config", column, &key], json!([neg, pos])),
                },
                (pos, neg) => {
                    let value = pos.or(neg).unwrap_or_default();
                    cx.dropped(&["columns_config", column, &key], value);
                },
            }
        }
    }

    Ok(())
}

fn stop(color: &Value) -> Option<String> {
    color.as_str().and_then(css::normalize).map(|x| x.hex)
}

fn mode_renames(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    for (column, style) in column_styles(token) {
        for (from, to) in [
            ("number_fg_mode", "fg_mode"),
            ("number_bg_mode", "bg_mode"),
            ("fg_colors", "fg_color"),
            ("bg_colors", "bg_color"),
        ] {
            if let Some(value) = rename(style, from, to) {
                cx.dropped(&["columns_config", column, from], value);
            }
        }

        let mode_key = ["string_color_mode", "datetime_color_mode"]
            .into_iter()
            .find(|key| style.contains_key(*key));

        let mode = mode_key.and_then(|key| style.shift_remove(key));
        let color = style.shift_remove("color");
        let palette = style.shift_remove("palette");
        let (assigned, unused) = match mode.as_ref().and_then(Value::as_str) {
            Some("foreground") => (Some(("fg", "color", color)), vec![("palette", palette)]),
            Some("background") => (Some(("bg", "color", color)), vec![("palette", palette)]),
            Some("series") => (Some(("bg", "series", palette)), vec![("color", color)]),
            Some("none") | None => (None, vec![("color", color), ("palette", palette)]),
            Some(_) => {
                let key = mode_key.unwrap_or_default();
                cx.dropped(
                    &["columns_config", column, key],
                    mode.clone().unwrap_or_default(),
                );
                (None, vec![("color", color), ("palette", palette)])
            },
        };

        if let Some((side, mode, value)) = assigned {
            style.insert(format!("{side}_mode"), Value::from(mode));
            if let Some(value) = value {
                style.insert(format!("{side}_color"), value);
            }
        }

        for (key, value) in unused {
            if let Some(value) = value {
                cx.dropped(&["columns_config", column, key], value);
            }
        }
    }

    Ok(())
}

fn format_flags(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    for (column, style) in column_styles(token) {
        let Some(format) = style.shift_remove("format") else {
            continue;
        };

        let flag = match format.as_str() {
            Some("link") => "link",
            Some("bold") => "bold",
            Some("italics") => "italic",
            _ => {
                cx.dropped(&["columns_config", column, "format"], format);
                continue;
            },
        };

        style.entry(flag).or_insert(Value::Bool(true));
    }

    Ok(())
}

fn role_keys(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    let names = |key: &str| -> Option<Vec<String>> {
        token.get(key)?.as_array().map(|x| {
            x.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
    };

    let (Some(group_by), Some(split_by), Some(columns)) =
        (names("group_by"), names("split_by"), names("columns"))
    else {
        return Ok(());
    };

    for (column, style) in column_styles(token) {
        let pivot_only =
            (group_by.contains(column) || split_by.contains(column)) && !columns.contains(column);

        if !pivot_only {
            continue;
        }

        let dropped = style
            .keys()
            .filter(|key| *key != "number_format" && *key != "date_format")
            .cloned()
            .collect::<Vec<_>>();

        for key in dropped {
            if let Some(value) = style.shift_remove(&key) {
                cx.dropped(&["columns_config", column, &key], value);
            }
        }
    }

    Ok(())
}
