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

//! Copy/export side effects: render the current `View` to one of the
//! supported [`ExportMethod`] formats and return a [`Blob`] / [`JsValue`].

use std::collections::HashSet;

use base64::prelude::*;
use futures::join;
use itertools::Itertools;
use perspective_client::ViewWindow;
use perspective_js::utils::*;
use wasm_bindgen::{JsCast, JsValue};

use crate::config::ExportMethod;
use crate::js::JsPerspectiveViewerPlugin;
use crate::presentation::Presentation;
use crate::queries::{export_app, get_viewer_config};
use crate::renderer::Renderer;
use crate::session::Session;
use crate::utils::*;

fn tag_name_to_package(plugin: &JsPerspectiveViewerPlugin) -> String {
    let tag_name = plugin.unchecked_ref::<web_sys::HtmlElement>().tag_name();
    let tag_parts = tag_name.split('-').take(3).map(|x| x.to_lowercase());
    Itertools::intersperse(tag_parts, "-".to_owned()).collect::<String>()
}

/// Render the current view as a self-contained HTML document (Arrow data +
/// JSON layout embedded as base64 + JSON, with `<script type=module>` imports
/// for the active plugins).
pub async fn html_as_jsvalue(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
) -> ApiResult<JsValue> {
    let view_config = get_viewer_config(session, renderer, presentation);
    let plugins = renderer
        .get_all_plugins()
        .iter()
        .map(tag_name_to_package)
        .collect::<HashSet<String>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (arrow, config) = join!(
        crate::queries::arrow_as_vec(session, true, None),
        view_config
    );
    let arrow = arrow?;
    let mut config = config?;
    config.settings = false;
    let js_config = serde_json::to_string(&config)?;
    let html = export_app::render(&BASE64_STANDARD.encode(arrow), &js_config, &plugins);
    Ok(js_sys::JsString::from(html.trim()).into())
}

/// Render the current view as a `.png` `Blob` via the active plugin's
/// `render` method (typically only available for chart plugins).
pub async fn png_as_jsvalue(session: &Session, renderer: &Renderer) -> ApiResult<web_sys::Blob> {
    let plugin = renderer.get_active_plugin()?;
    let view: perspective_client::View = session
        .get_view()
        .ok_or(ApiError::from(ApiErrorType::NoTableError))?;

    let png = plugin.render(view.into(), None).await?;
    Ok(png)
}

/// Render the current view as a `.txt` `Blob` via the active plugin's
/// `render` method (typically used for the datagrid).
pub async fn txt_as_jsvalue(
    session: &Session,
    renderer: &Renderer,
    viewport: Option<ViewWindow>,
) -> ApiResult<web_sys::Blob> {
    let plugin = renderer.get_active_plugin()?;
    let view: perspective_client::View = session
        .get_view()
        .ok_or(ApiError::from(ApiErrorType::NoTableError))?;

    let txt = plugin
        .render(view.into(), viewport.map(|x| x.into()))
        .await?;

    Ok(txt)
}

/// Generate a result `Blob` for all types of [`ExportMethod`].
pub async fn export_method_to_blob(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    method: ExportMethod,
) -> ApiResult<web_sys::Blob> {
    let viewport = renderer.get_selection();

    match method {
        ExportMethod::Csv => crate::queries::csv_as_jsvalue(session, false, None)
            .await?
            .as_blob(),
        ExportMethod::CsvSelected => crate::queries::csv_as_jsvalue(session, false, viewport)
            .await?
            .as_blob(),
        ExportMethod::CsvAll => crate::queries::csv_as_jsvalue(session, true, None)
            .await?
            .as_blob(),
        ExportMethod::Json => crate::queries::json_as_jsvalue(session, false, None)
            .await?
            .as_blob(),
        ExportMethod::JsonSelected => crate::queries::json_as_jsvalue(session, false, viewport)
            .await?
            .as_blob(),
        ExportMethod::JsonAll => crate::queries::json_as_jsvalue(session, true, None)
            .await?
            .as_blob(),
        ExportMethod::Ndjson => crate::queries::ndjson_as_jsvalue(session, false, None)
            .await?
            .as_blob(),
        ExportMethod::NdjsonSelected => crate::queries::ndjson_as_jsvalue(session, false, viewport)
            .await?
            .as_blob(),
        ExportMethod::NdjsonAll => crate::queries::ndjson_as_jsvalue(session, true, None)
            .await?
            .as_blob(),
        ExportMethod::Arrow => crate::queries::arrow_as_jsvalue(session, false, None)
            .await?
            .as_blob(),
        ExportMethod::ArrowSelected => crate::queries::arrow_as_jsvalue(session, false, viewport)
            .await?
            .as_blob(),
        ExportMethod::ArrowAll => crate::queries::arrow_as_jsvalue(session, true, None)
            .await?
            .as_blob(),
        ExportMethod::Html => html_as_jsvalue(session, renderer, presentation)
            .await?
            .as_blob(),
        ExportMethod::Plugin if renderer.is_chart() => png_as_jsvalue(session, renderer).await,
        ExportMethod::Plugin => txt_as_jsvalue(session, renderer, viewport).await,
        ExportMethod::JsonConfig => js_sys::JSON::stringify(
            &get_viewer_config(session, renderer, presentation)
                .await?
                .encode()?,
        )?
        .as_blob(),
    }
}

/// Generate a result `JsValue` for all types of [`ExportMethod`].
pub async fn export_method_to_jsvalue(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    method: ExportMethod,
) -> ApiResult<JsValue> {
    let viewport = renderer.get_selection();

    Ok(match method {
        ExportMethod::Csv => crate::queries::csv_as_jsvalue(session, false, None)
            .await?
            .into(),
        ExportMethod::CsvSelected => crate::queries::csv_as_jsvalue(session, false, viewport)
            .await?
            .into(),
        ExportMethod::CsvAll => crate::queries::csv_as_jsvalue(session, true, None)
            .await?
            .into(),
        ExportMethod::Json => crate::queries::json_as_jsvalue(session, false, None)
            .await?
            .into(),
        ExportMethod::JsonSelected => crate::queries::json_as_jsvalue(session, false, viewport)
            .await?
            .into(),
        ExportMethod::JsonAll => crate::queries::json_as_jsvalue(session, true, None)
            .await?
            .into(),
        ExportMethod::Ndjson => crate::queries::ndjson_as_jsvalue(session, false, None)
            .await?
            .into(),
        ExportMethod::NdjsonSelected => crate::queries::ndjson_as_jsvalue(session, false, viewport)
            .await?
            .into(),
        ExportMethod::NdjsonAll => crate::queries::ndjson_as_jsvalue(session, true, None)
            .await?
            .into(),
        ExportMethod::Arrow => crate::queries::arrow_as_jsvalue(session, false, None)
            .await?
            .into(),
        ExportMethod::ArrowSelected => crate::queries::arrow_as_jsvalue(session, false, viewport)
            .await?
            .into(),
        ExportMethod::ArrowAll => crate::queries::arrow_as_jsvalue(session, true, None)
            .await?
            .into(),
        ExportMethod::Html => html_as_jsvalue(session, renderer, presentation).await?,
        ExportMethod::Plugin if renderer.is_chart() => {
            png_as_jsvalue(session, renderer).await?.into()
        },
        ExportMethod::Plugin => txt_as_jsvalue(session, renderer, viewport).await?.into(),
        ExportMethod::JsonConfig => get_viewer_config(session, renderer, presentation)
            .await?
            .encode()?,
    })
}
