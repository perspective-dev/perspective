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

use crate::error::MigrateError;
use crate::step::StepCx;

const DEFAULT_MASTER_SIZES: [f64; 2] = [0.25, 0.75];

pub(super) fn regular_layout(
    root: &mut Map<String, Value>,
    cx: &mut StepCx,
) -> Result<(), MigrateError> {
    if !root.contains_key("viewers") && !root.contains_key("detail") {
        return Ok(());
    }

    let mut panels = match root.shift_remove("viewers") {
        Some(Value::Object(viewers)) => viewers,
        None => Map::new(),
        Some(_) => return Err(cx.malformed(&["viewers"], "an object")),
    };

    let sizes = root.shift_remove("sizes");
    let master = root.shift_remove("master");
    let detail = root
        .shift_remove("detail")
        .and_then(|mut detail| detail.get_mut("main").map(Value::take))
        .filter(|main| !main.is_null());

    let mut placed = vec![];
    let detail = detail
        .map(|main| area(&main, &panels, &mut placed, cx))
        .transpose()?
        .flatten();

    let master_ids = master
        .as_ref()
        .and_then(|x| x.get("widgets"))
        .and_then(Value::as_array)
        .map(|widgets| {
            widgets
                .iter()
                .filter_map(Value::as_str)
                .filter(|id| panels.contains_key(*id) && !placed.iter().any(|x| x == id))
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let layout = if master_ids.is_empty() {
        detail
    } else {
        placed.extend(master_ids.iter().cloned());
        let master_sizes = master.as_ref().and_then(|x| x.get("sizes"));
        let master_node = if let [id] = master_ids.as_slice() {
            tab(vec![id.clone()], None)
        } else {
            json!({
                "type": "split-layout",
                "orientation": "vertical",
                "children": master_ids.iter().map(|id| tab(vec![id.clone()], None)).collect::<Vec<_>>(),
                "sizes": normalize(master_sizes, master_ids.len()),
            })
        };

        cx.approximated(&["layout"], "the master panels are placed on the left");
        cx.approximated(
            &["masters"],
            "master selections remain in each detail panel's saved `filter`",
        );

        match detail {
            Some(detail) => {
                let outer = sizes
                    .as_ref()
                    .and_then(Value::as_array)
                    .filter(|x| x.len() == 2)
                    .map(|_| normalize(sizes.as_ref(), 2))
                    .unwrap_or_else(|| DEFAULT_MASTER_SIZES.to_vec());

                Some(json!({
                    "type": "split-layout",
                    "orientation": "horizontal",
                    "children": [master_node, detail],
                    "sizes": outer,
                }))
            },
            None => Some(master_node),
        }
    };

    let orphans = panels
        .keys()
        .filter(|id| !placed.contains(id))
        .cloned()
        .collect::<Vec<_>>();

    for id in orphans {
        if let Some(panel) = panels.shift_remove(&id) {
            cx.dropped(&["viewers", &id], panel);
        }
    }

    let mut active = panels
        .iter()
        .filter(|(_, panel)| panel.get("settings").and_then(Value::as_bool) == Some(true))
        .map(|(id, _)| id.clone());

    let active = match (active.next(), active.next()) {
        (Some(id), None) => Some(id),
        _ => None,
    };

    for panel in panels.values_mut() {
        if let Value::Object(panel) = panel {
            panel.shift_remove("settings");
        }
    }

    root.insert("layout".to_owned(), layout.unwrap_or(Value::Null));
    root.insert("panels".to_owned(), Value::Object(panels));
    if !master_ids.is_empty() {
        root.insert("masters".to_owned(), Value::from(master_ids));
    }

    if let Some(active) = active {
        root.insert("active".to_owned(), Value::String(active));
    }

    Ok(())
}

fn area(
    node: &Value,
    panels: &Map<String, Value>,
    placed: &mut Vec<String>,
    cx: &StepCx,
) -> Result<Option<Value>, MigrateError> {
    match node.get("type").and_then(Value::as_str) {
        Some("tab-area") => {
            let current = node.get("currentIndex").and_then(Value::as_u64);
            let mut selected = None;
            let mut tabs = vec![];
            for (index, widget) in node
                .get("widgets")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .enumerate()
            {
                let Some(id) = widget.as_str() else {
                    continue;
                };

                if panels.contains_key(id) && !placed.iter().any(|x| x == id) {
                    if current == Some(index as u64) {
                        selected = Some(tabs.len());
                    }

                    placed.push(id.to_owned());
                    tabs.push(id.to_owned());
                }
            }

            Ok((!tabs.is_empty()).then(|| tab(tabs, selected)))
        },
        Some("split-area") => {
            let orientation = match node.get("orientation").and_then(Value::as_str) {
                Some(orientation @ ("horizontal" | "vertical")) => orientation,
                _ => return Err(cx.malformed(&["detail"], "a split-area orientation")),
            };

            let sizes = node.get("sizes").and_then(Value::as_array);
            let mut children = vec![];
            let mut kept_sizes = vec![];
            for (index, child) in node
                .get("children")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .enumerate()
            {
                if let Some(child) = area(child, panels, placed, cx)? {
                    children.push(child);
                    kept_sizes.push(
                        sizes
                            .and_then(|x| x.get(index))
                            .cloned()
                            .unwrap_or(Value::Null),
                    );
                }
            }

            Ok(match children.len() {
                0 => None,
                1 => children.pop(),
                len => Some(json!({
                    "type": "split-layout",
                    "orientation": orientation,
                    "children": children,
                    "sizes": normalize(Some(&Value::Array(kept_sizes)), len),
                })),
            })
        },
        _ => Err(cx.malformed(&["detail"], "a tab-area or split-area")),
    }
}

fn tab(tabs: Vec<String>, selected: Option<usize>) -> Value {
    let mut node = json!({"type": "tab-layout", "tabs": tabs});
    if let Some(selected) = selected {
        node["selected"] = Value::from(selected);
    }

    node
}

fn normalize(sizes: Option<&Value>, len: usize) -> Vec<f64> {
    let sizes = sizes
        .and_then(Value::as_array)
        .filter(|x| x.len() == len)
        .map(|x| {
            x.iter()
                .map(|x| x.as_f64().unwrap_or(0.0))
                .collect::<Vec<_>>()
        })
        .filter(|x| x.iter().all(|x| x.is_finite() && *x > 0.0))
        .unwrap_or_else(|| vec![1.0; len]);

    let total = sizes.iter().sum::<f64>();
    if (total - 1.0).abs() <= 1e-6 {
        sizes
    } else {
        sizes.iter().map(|x| x / total).collect()
    }
}
