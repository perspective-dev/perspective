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

use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use perspective::utils::*;
use wasm_bindgen::prelude::*;

fn input_value_format(x: &str) -> Result<&str, JsValue> {
    match x.len() {
        23 => Ok("%Y-%m-%dT%H:%M:%S%.3f"),
        19 => Ok("%Y-%m-%dT%H:%M:%S"),
        16 => Ok("%Y-%m-%dT%H:%M"),
        _ => Err(format!("Unknown format {}", x).into()),
    }
}

fn get_local_tz() -> FixedOffset {
    FixedOffset::west_opt(js_sys::Date::new(&0.into()).get_timezone_offset() as i32 * 60).unwrap()
}

pub fn posix_to_utc_str(x: f64) -> ApiResult<String> {
    let tz = get_local_tz();
    if x > 0_f64 {
        Ok(Utc
            .timestamp_opt(x as i64 / 1000, ((x as i64 % 1000) * 1000000) as u32)
            .earliest()
            .into_apierror()?
            .with_timezone(&tz)
            .format("%Y-%m-%dT%H:%M:%S%.3f")
            .to_string())
    } else {
        Err(format!("Unknown timestamp {}", x).into())
    }
}

pub fn str_to_utc_posix(val: &str) -> Result<f64, ApiError> {
    let tz = get_local_tz();
    let posix = NaiveDateTime::parse_from_str(val, input_value_format(val)?)?;
    Ok(DateTime::<Utc>::from(tz.from_local_datetime(&posix).unwrap()).timestamp_millis() as f64)
}
