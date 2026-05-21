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

//! Pure read-only `View` → bytes/string derivations.  `flat = true` means
//! "ignore the active view config and re-fetch the un-pivoted table view";
//! `flat = false` means "use the session's bound view".

use perspective_client::{View, ViewWindow};
use perspective_js::utils::{ApiError, ApiResult};
use wasm_bindgen::JsCast;

use crate::session::Session;

async fn flat_view(session: &Session, flat: bool) -> ApiResult<View> {
    if flat {
        let table = session
            .get_table()
            .ok_or_else(|| ApiError::from("No table set"))?;
        Ok(table.view(None).await?)
    } else {
        session
            .get_view()
            .ok_or_else(|| ApiError::from("No view created"))
    }
}

pub async fn arrow_as_vec(
    session: &Session,
    flat: bool,
    window: Option<ViewWindow>,
) -> Result<Vec<u8>, ApiError> {
    Ok(flat_view(session, flat)
        .await?
        .to_arrow(window.unwrap_or_default())
        .await?
        .into())
}

pub async fn arrow_as_jsvalue(
    session: &Session,
    flat: bool,
    window: Option<ViewWindow>,
) -> Result<js_sys::ArrayBuffer, ApiError> {
    let arrow = flat_view(session, flat)
        .await?
        .to_arrow(window.unwrap_or_default())
        .await?;
    Ok(js_sys::Uint8Array::from(&arrow[..])
        .buffer()
        .unchecked_into())
}

pub async fn ndjson_as_jsvalue(
    session: &Session,
    flat: bool,
    window: Option<ViewWindow>,
) -> Result<js_sys::JsString, ApiError> {
    let json: String = flat_view(session, flat)
        .await?
        .to_ndjson(window.unwrap_or_default())
        .await?;

    Ok(json.into())
}

pub async fn json_as_jsvalue(
    session: &Session,
    flat: bool,
    window: Option<ViewWindow>,
) -> Result<js_sys::Object, ApiError> {
    let json: String = flat_view(session, flat)
        .await?
        .to_columns_string(window.unwrap_or_default())
        .await?;

    Ok(js_sys::JSON::parse(&json)?.unchecked_into())
}

pub async fn csv_as_jsvalue(
    session: &Session,
    flat: bool,
    window: Option<ViewWindow>,
) -> Result<js_sys::JsString, ApiError> {
    let window = window.unwrap_or_default();
    let csv = flat_view(session, flat).await?.to_csv(window).await;
    Ok(csv.map(js_sys::JsString::from)?)
}
