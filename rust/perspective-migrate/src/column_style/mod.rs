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
use crate::json::column_styles;
use crate::step::{Step, StepCx};
use crate::version::Version;

pub(crate) const STEPS: &[Step] = &[
    Step {
        at: Version::new(5, 7, 0),
        id: "style.date_format",
        apply: date_format,
    },
    Step {
        at: Version::new(5, 7, 0),
        id: "style.unit_gallon",
        apply: unit_gallon,
    },
];

const PRESET_KEYS: &[&str] = &["timeZone", "dateStyle", "timeStyle"];

const PART_FALLBACKS: &[(&str, &str)] = &[
    ("year", "2-digit"),
    ("month", "numeric"),
    ("day", "numeric"),
    ("hour", "numeric"),
    ("minute", "numeric"),
    ("second", "numeric"),
];

const SHAPE_KEYS: &[&str] = &[
    "dateStyle",
    "timeStyle",
    "weekday",
    "year",
    "month",
    "day",
    "hour",
    "minute",
    "second",
    "fractionalSecondDigits",
];

fn date_format(token: &mut Map<String, Value>, cx: &mut StepCx) -> Result<(), MigrateError> {
    for (column, style) in column_styles(token) {
        let Some(Value::Object(format)) = style.get_mut("date_format") else {
            continue;
        };

        if format.shift_remove("format").is_some() {
            for (key, fallback) in PART_FALLBACKS {
                format.entry(*key).or_insert_with(|| Value::from(*fallback));
            }

            format.entry("hour12").or_insert(Value::Bool(true));
            if format.get("fractionalSecondDigits").and_then(Value::as_u64) == Some(0) {
                format.shift_remove("fractionalSecondDigits");
            }
        } else {
            let ignored = format
                .keys()
                .filter(|key| !PRESET_KEYS.contains(&key.as_str()))
                .cloned()
                .collect::<Vec<_>>();

            for key in ignored {
                if let Some(value) = format.shift_remove(&key) {
                    cx.dropped(&["columns_config", column, "date_format", &key], value);
                }
            }

            format
                .entry("dateStyle")
                .or_insert_with(|| Value::from("short"));
            format
                .entry("timeStyle")
                .or_insert_with(|| Value::from("medium"));
        }

        format.retain(|_, value| value.as_str() != Some("disabled"));
        if !SHAPE_KEYS.iter().any(|key| format.contains_key(*key)) {
            for key in ["year", "month", "day"] {
                format.insert(key.to_owned(), Value::from("numeric"));
            }
        }
    }

    Ok(())
}

fn unit_gallon(token: &mut Map<String, Value>, _cx: &mut StepCx) -> Result<(), MigrateError> {
    for (_, style) in column_styles(token) {
        if let Some(Value::Object(format)) = style.get_mut("number_format")
            && let Some(unit) = format.get_mut("unit")
            && unit.as_str() == Some("gallob")
        {
            *unit = Value::from("gallon");
        }
    }

    Ok(())
}
